// O Motor + o pipeline completo. Nada aqui move arquivo sem passar por apply(),
// e apply() nunca move sem escrever na Memória antes. Essa ordem é a garantia
// de que desfazer sempre funciona, inclusive se o processo morrer no meio.
import fs from 'node:fs';
import path from 'node:path';
import platform from '../platform/index.js';
import { sniff } from '../platform/shared/magic.js';
import { readExif } from '../platform/shared/exif.js';
import { imageSize, shapeHint } from '../platform/shared/imgsize.js';
import { mp4Info, wavInfo, videoHint, audioHint } from '../platform/shared/mediainfo.js';
import { gravidade } from './sequence.js';
import { colocar, aprenderMapa } from './placement.js';
import { classificar as classificarZona, acompanhantes } from './territorio.js';
import { candidatos, resolver, preencher } from './instancia.js';
import * as journal from './journal.js';
import * as brain from './brain.js';
import { extract, isImage } from './extract.js';
import { classify as rulesClassify, slugify, buildName, dateFromText } from './rules.js';
import { scanTaxonomy, candidates, ensureFolder } from './folders.js';

/** R3: o arquivo parou de se mexer? */
export function isSettled(file, cfg) {
  const ext = path.extname(file).toLowerCase();
  if (cfg.neverTouch.includes(ext)) return { ok: false, why: 'download pela metade' };

  let st;
  try { st = fs.statSync(file); } catch { return { ok: false, why: 'sumiu' }; }
  if (st.size === 0) return { ok: false, why: 'vazio' };

  const ageSec = (Date.now() - st.mtimeMs) / 1000;
  if (ageSec < cfg.settleSeconds) return { ok: false, why: `mexeu há ${Math.round(ageSec)}s` };
  if (platform.isBusy(file)) return { ok: false, why: 'aberto em outro app' };

  return { ok: true };
}

/** R2: isso aqui é projeto de alguém, não bagunça. */
/**
 * R2: de quem e este chao?
 *
 * Antes isto olhava so a pasta imediata do arquivo — o que deixava passar
 * qualquer coisa enterrada, tipo um .png dentro de
 * steamapps/common/jogo/Data/textures/. Agora sobe a arvore inteira.
 */
export function zonaDe(file, cfg) {
  return classificarZona(file, {
    raizes: cfg.watch || [],
    forbiddenRoots: cfg.forbiddenRoots || []
  });
}

/** Compatibilidade: devolve o motivo quando o chao e de outro dono. */
export function isProjectArea(file, cfg) {
  const z = zonaDe(file, cfg);
  return z.podeMover ? null : (z.marcador || z.zona);
}

/**
 * Extensoes dos irmaos de pasta, com cache por pasta.
 *
 * Sem cache isto e um readdir por ARQUIVO, e numa pasta com cem mil itens vira
 * O(n^2): cem mil leituras de cem mil entradas. Numa pasta de capturas de tela
 * de um jogador isso e exatamente o que acontece.
 *
 * Com cache e um readdir por PASTA. O histograma tambem nao precisa da pasta
 * inteira: uma amostra de dois mil irmaos ja da a proporcao com folga.
 */
const VIZINHOS_VAZIO = { dominante: null, fracao: 0, total: 0 };
/** @type {Map<string, {dominante:string|null, fracao:number, total:number}>} */
const cacheVizinhos = new Map();

function vizinhosDe(file) {
  const dir = path.dirname(file);
  const emCache = cacheVizinhos.get(dir);
  if (emCache) return emCache;

  let resultado = VIZINHOS_VAZIO;
  try {
    const irmaos = fs.readdirSync(dir);
    resultado = gravidade(irmaos.length > 2000 ? irmaos.slice(0, 2000) : irmaos);
  } catch { /* sem permissao ou pasta sumiu */ }

  // Trava de memoria: em disco gigante isto poderia crescer sem fim.
  if (cacheVizinhos.size > 20000) cacheVizinhos.clear();
  cacheVizinhos.set(dir, resultado);
  return resultado;
}

/** So faz sentido em teste, ou depois de o usuario mexer no disco. */
export function limparCacheVizinhos() { cacheVizinhos.clear(); }

/**
 * @typedef {object} FileContext
 * @property {string} file @property {string} name @property {string} stem
 * @property {string} ext @property {number} size @property {Date} mtime
 * @property {number} mtimeMs
 * @property {string|null} mime @property {string[]} whereFroms
 * @property {Date|null} downloadedAt
 * @property {{hint:string,confidence:number,note:string}|null} shape
 * @property {{hint:string,confidence:number,note:string}|null} media
 * @property {{dominante:string|null,fracao:number,total:number}} vizinhos
 * @property {{Make?:string,Model?:string,DateTimeOriginal?:Date,hasGPS?:boolean}} exif
 */

/** @returns {FileContext|null} */
export function gatherContext(file, cfg) {
  const ext = path.extname(file).toLowerCase();
  let st; try { st = fs.statSync(file); } catch { return null; }
  const mime = sniff(file);
  return {
    file,
    name: path.basename(file),
    stem: path.basename(file, ext),
    ext,
    size: st.size,
    mtime: st.mtime,
    mtimeMs: st.mtimeMs,
    mime,
    whereFroms: platform.whereFroms(file),
    downloadedAt: platform.downloadedDate(file),
    exif: /^image\/jpe?g$/.test(mime || '') ? readExif(file) : {},
    // A forma da imagem é o sinal que sobra quando não há EXIF nem nome útil —
    // e imagem sem os dois é o caso mais comum de todos.
    shape: /^image\//.test(mime || '') ? shapeHint(imageSize(file), mime) : null,
    // Duracao e resolucao separam B-roll de export, e efeito sonoro de podcast.
    // Sai do cabecalho, sem decodificar um quadro e sem modelo nenhum.
    media: /^video\//.test(mime || '') ? videoHint(mp4Info(file), st.size)
         : (/^audio\//.test(mime || '') && ext === '.wav') ? audioHint(wavInfo(file))
         : null,
    // Gravidade da pasta: arquivo solto onde 90% e .CR3 pertence aquilo.
    vizinhos: vizinhosDe(file)
  };
}

/**
 * O pipeline da seção 05 do plano, inteiro.
 * Devolve uma PROPOSTA. Nunca move nada — mover é trabalho de apply().
 */
/**
 * @param {string} file
 * @param {any} cfg
 * @param {any[]} taxonomy
 * @param {{noModel?:boolean, forceModel?:boolean, aprendido?:Record<string,string>, semPerfil?:boolean, semInstancia?:boolean}} [opts]
 * @returns {Promise<any>}
 */
export async function propose(file, cfg, taxonomy, opts = {}) {
  const ctx = gatherContext(file, cfg);
  if (!ctx) return null;

  // Territorio de outro dono: le, indexa, e nao encosta.
  const zona = zonaDe(file, cfg);
  if (!zona.podeMover) {
    return {
      file,
      skip: true,
      zona: zona.zona,
      marcador: zona.marcador,
      raizDaZona: zona.raiz,
      reason: zona.marcador
        ? `${zona.marcador}: ${zona.motivo}`
        : zona.motivo
    };
  }

  /** @type {any} */
  const proposal = {
    id: journal.newId(),
    file,
    name: ctx.name,
    ext: ctx.ext,
    size: ctx.size,
    mtimeMs: ctx.mtimeMs,
    mime: ctx.mime,
    source: ctx.whereFroms[0] || null,
    text: '',
    extractedVia: 'nenhum',
    folder: null,
    slug: null,
    confidence: 0,
    reason: '',
    decidedBy: null,
    usedModel: false
  };

  // 5. Extração SEMPRE, mesmo quando a regra já decidiu.
  //
  // Isto parece desperdício e não é: mesmo que a pasta esteja resolvida, o texto
  // precisa entrar na Memória, senão o arquivo fica organizado e inencontrável.
  // Arrumar é o custo, achar é o pagamento — e o pagamento depende desta linha.
  // O caro (modelo de visão) continua só no caminho lento.
  const ex = extract(file, cfg);
  proposal.text = ex.text;
  proposal.extractedVia = ex.via;

  // 4. As regras dizem O QUE é. Sempre primeiro — agora com o texto já em mãos,
  // então elas também enxergam o conteúdo, não só o nome.
  const ruled = rulesClassify({ ...ctx, text: proposal.text });

  if (ruled) {
    // 4b. E o placement diz ONDE vai, segundo o perfil e o que o usuário já faz.
    // Só conta como ano SABIDO o que veio do conteúdo: EXIF da foto ou data
    // dentro do documento. mtime é quando o arquivo encostou neste disco, que
    // para foto e vídeo não tem relação nenhuma com quando aquilo aconteceu.
    const dataConhecida = ctx.exif?.DateTimeOriginal instanceof Date
      ? ctx.exif.DateTimeOriginal
      : dateFromText(proposal.text);
    const ano = dataConhecida ? dataConhecida.getFullYear() : null;

    const posto = colocar(ruled.tipo, {
      perfil: cfg.perfil || 'geral',
      aprendido: opts.aprendido || {},
      ano,
      semPerfil: !!opts.semPerfil
    });

    proposal.tipo = ruled.tipo;
    proposal.folder = posto.folder;
    proposal.slots = posto.slots;
    proposal.precisaInstancia = posto.precisaInstancia;

    // A varredura inicial ja sabe quais projetos, clientes e ensaios existem.
    // Entao "{projeto}" nao e pergunta aberta: e escolha entre os que existem,
    // e na maioria das vezes da para saber qual sem perguntar nada.
    if (posto.precisaInstancia && !opts.semInstancia) {
      const cands = candidatos(taxonomy, posto.folder);
      const res = resolver(
        { nome: ctx.name, texto: proposal.text, mtimeMs: ctx.mtimeMs },
        cands
      );
      proposal.instancia = res;
      if (res.valores && res.confianca >= 0.55) {
        proposal.folder = preencher(posto.folder, res.valores);
        proposal.slots = [];
        proposal.precisaInstancia = false;
        // A confianca final nao pode passar da confianca de ter acertado a
        // instancia: saber que e um clipe nao adianta se o projeto estiver errado.
        posto.confidence = Math.min(posto.confidence, res.confianca);
        posto.via += `+instancia(${res.porque})`;
      }
    }
    // A confiança final é a do elo mais fraco: saber o que é não adianta se não
    // se sabe onde vai, e vice-versa.
    proposal.confidence = Math.min(ruled.confidence, posto.confidence);
    proposal.reason = posto.precisaInstancia
      ? `${ruled.reason} — mas preciso saber qual ${posto.slots.join(' e ')}`
      : ruled.reason;
    proposal.decidedBy = `${ruled.decidedBy}+${posto.via}`;
    proposal.slug = ruled.nameHint || slugify(ctx.stem);

    if (proposal.confidence >= 0.8 && !opts.forceModel) {
      proposal.acompanhantes = acompanhantes(file);
      proposal.newName = buildName({
        date: dateFromText(proposal.text) || ctx.downloadedAt || ctx.mtime,
        slug: proposal.slug,
        context: null,
        ext: ctx.ext
      });
      return proposal;
    }
  }

  let visionDesc = null;
  if (ex.needsVision && !opts.noModel) {
    visionDesc = await brain.describeImage(cfg, file).catch(() => null);
    if (visionDesc) {
      proposal.text = [proposal.text, visionDesc.description].filter(Boolean).join(' — ');
      proposal.extractedVia = ex.via === 'nenhum' ? 'visao' : `${ex.via}+visao`;
      proposal.usedModel = true;
    }
  }

  // Busca de pasta: 6 candidatas, nunca as 200 do disco.
  const query = [ctx.stem, proposal.text.slice(0, 300), ruled?.tipo, proposal.folder, visionDesc?.description]
    .filter(Boolean).join(' ');
  const cands = candidates(taxonomy, query, 6).map(c => c.rel || c.name);

  if (!opts.noModel) {
    try {
      const guess = await brain.classify(cfg, {
        fileName: ctx.name, ext: ctx.ext, mime: ctx.mime,
        text: proposal.text, source: proposal.source,
        candidates: cands, sizeKb: Math.round(ctx.size / 1024)
      });
      proposal.folder = guess.folder;
      proposal.confidence = guess.confidence;
      proposal.reason = guess.reason;
      proposal.decidedBy = guess.decidedBy;
      proposal.slug = guess.slug || slugify(ctx.stem);
      proposal.isNewFolder = guess.isNewFolder;
      proposal.usedModel = true;
    } catch (e) {
      proposal.modelError = e.message;
    }
  }

  // O modelo falhou ou está desligado: cai para a regra fraca, ou para a triagem.
  if (!proposal.folder) {
    proposal.folder = 'Triagem';
    proposal.confidence = 0.2;
    proposal.reason = 'Não consegui entender o que é isso';
    proposal.decidedBy = 'fallback:triagem';
    proposal.slug = visionDesc?.slug || slugify(ctx.stem);
  }

  // 7. Nome, pela convenção única.
  proposal.newName = buildName({
    date: dateFromText(proposal.text) || ctx.downloadedAt || ctx.mtime,
    slug: proposal.slug || slugify(ctx.stem),
    context: null,
    ext: ctx.ext
  });

  proposal.candidates = cands;
  // Arquivo que so faz sentido ao lado do irmao viaja junto. Mover um RAW sem
  // o .xmp do lado apaga a edicao de quem trabalhou nele.
  proposal.acompanhantes = acompanhantes(file);
  return proposal;
}

function collisionFreePath(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${n}${ext}`);
    n++;
  }
  return candidate;
}

/** R1: move e registra. Escreve na Memória ANTES de renomear, não depois. */
export function apply(proposal, cfg, { dryRun = false } = {}) {
  const destDir = ensureFolder(cfg.destRoot, proposal.folder);
  const to = collisionFreePath(destDir, proposal.newName);

  if (dryRun) return { ...proposal, to, applied: false, dryRun: true };

  // Proveniencia, no sentido arquivistico.
  //
  // A arquivologia tem um principio de mais de um seculo chamado respeito a
  // ordem original: o arranjo que o criador deu aos documentos E informacao, e
  // desfaze-lo destroi evidencia. Pela norma, um organizador automatico de
  // arquivos e um vandalo.
  //
  // A saida nao e deixar de organizar — e nao PERDER a ordem original ao
  // organizar. Entao, antes de mover, o diario registra de onde o arquivo veio,
  // como se chamava, quando chegou e ao lado de que ele estava. O arranjo deixa
  // de morar no sistema de arquivos e passa a morar no indice, onde continua
  // consultavel e onde nao atrapalha ninguem.
  const vizinhos = vizinhosDe(proposal.file);
  let amostraVizinhos = [];
  try {
    amostraVizinhos = fs.readdirSync(path.dirname(proposal.file))
      .filter(n => n !== path.basename(proposal.file))
      .slice(0, 20);
  } catch { /* pasta sumiu */ }

  const rec = journal.append({
    op: 'move',
    id: proposal.id,
    from: proposal.file,
    to,
    fromName: path.basename(proposal.file),
    toName: path.basename(to),
    ordemOriginal: {
      pasta: path.dirname(proposal.file),
      vizinhos: amostraVizinhos,
      predominante: vizinhos.dominante,
      fracaoPredominante: +(vizinhos.fracao || 0).toFixed(2),
      totalNaPasta: vizinhos.total,
      chegouEm: proposal.mtimeMs ? new Date(proposal.mtimeMs).toISOString() : null
    },
    hash: journal.sha1File(proposal.file),
    size: proposal.size,
    category: proposal.folder,
    tipo: proposal.tipo,
    confidence: proposal.confidence,
    reason: proposal.reason,
    decidedBy: proposal.decidedBy,
    source: proposal.source,
    text: (proposal.text || '').slice(0, 2000),
    extractedVia: proposal.extractedVia,
    usedModel: proposal.usedModel,
    pending: true
  });

  try {
    fs.renameSync(proposal.file, to);
    // Os acompanhantes vao atras, com o mesmo nome novo e a extensao deles.
    for (const amigo of (proposal.acompanhantes || [])) {
      try {
        const destino = path.join(destDir, path.basename(to, path.extname(to)) + path.extname(amigo));
        fs.renameSync(amigo, destino);
        journal.append({ op: 'move', from: amigo, to: destino, fromName: path.basename(amigo),
                         toName: path.basename(destino), category: proposal.folder,
                         tipo: 'acompanhante', decidedBy: `junto-com:${rec.id}`, confidence: 1 });
      } catch { /* o irmao sumiu; o principal ja foi, segue */ }
    }
  } catch (e) {
    if (e.code === 'EXDEV') {          // volume diferente: copia e apaga
      fs.copyFileSync(proposal.file, to);
      fs.unlinkSync(proposal.file);
    } else {
      journal.append({ op: 'failed', of: rec.id, error: e.message });
      throw e;
    }
  }

  journal.append({ op: 'confirm', of: rec.id });
  return { ...proposal, to, applied: true };
}

/** Desfaz os N últimos movimentos. Sempre disponível, desde o dia um. */
export function undo(n = 1) {
  const moves = journal.undoableMoves().slice(0, n);
  const results = [];
  for (const m of moves) {
    try {
      if (!fs.existsSync(m.to)) { results.push({ ...m, ok: false, why: 'não está mais lá' }); continue; }
      fs.mkdirSync(path.dirname(m.from), { recursive: true });
      const back = fs.existsSync(m.from) ? collisionFreePath(path.dirname(m.from), path.basename(m.from)) : m.from;
      fs.renameSync(m.to, back);
      journal.append({ op: 'undo', of: m.id, from: m.to, to: back });
      results.push({ ...m, ok: true, restoredTo: back });
    } catch (e) {
      results.push({ ...m, ok: false, why: e.message });
    }
  }
  return results;
}

/** Tudo o que foi movido hoje, de volta. */
export function undoToday() {
  const today = new Date().toISOString().slice(0, 10);
  const n = journal.undoableMoves().filter(m => (m.ts || '').startsWith(today)).length;
  return undo(n);
}

export function listLoose(cfg) {
  const out = [];
  for (const dir of cfg.watch) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || e.name.startsWith('.')) continue;
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** O que ESTE usuário já faz com cada tipo. Vence qualquer preset. */
export function loadAprendido(entradas) {
  return aprenderMapa(entradas);
}

export function loadTaxonomy(cfg) {
  return scanTaxonomy([...new Set([cfg.destRoot, ...cfg.learnFrom])], 3);
}
