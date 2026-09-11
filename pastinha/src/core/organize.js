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
/** R2: isso aqui é projeto de alguém, ou território do sistema. */
export function isProjectArea(file, cfg) {
  const dir = path.resolve(path.dirname(file));
  for (const root of (cfg.forbiddenRoots || [])) {
    const r = path.resolve(root);
    if (dir === r || dir.startsWith(r + path.sep)) return `pasta do sistema (${path.basename(root)})`;
  }
  for (const marker of cfg.projectMarkers) {
    if (fs.existsSync(path.join(dir, marker))) return marker;
  }
  return null;
}

/** Extensoes dos irmaos de pasta. Barato: um readdir, sem stat de ninguem. */
function vizinhosDe(file) {
  try {
    const irmaos = fs.readdirSync(path.dirname(file)).filter(n => n !== path.basename(file));
    return irmaos.length > 4000 ? gravidade(irmaos.slice(0, 4000)) : gravidade(irmaos);
  } catch { return { dominante: null, fracao: 0, total: 0 }; }
}

/**
 * @typedef {object} FileContext
 * @property {string} file @property {string} name @property {string} stem
 * @property {string} ext @property {number} size @property {Date} mtime
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
 * @param {{noModel?:boolean, forceModel?:boolean, aprendido?:Record<string,string>, semPerfil?:boolean}} [opts]
 * @returns {Promise<any>}
 */
export async function propose(file, cfg, taxonomy, opts = {}) {
  const ctx = gatherContext(file, cfg);
  if (!ctx) return null;

  const marker = isProjectArea(file, cfg);
  if (marker) {
    return { file, skip: true, reason: `Tem ${marker} do lado — isso é projeto, não bagunça` };
  }

  /** @type {any} */
  const proposal = {
    id: journal.newId(),
    file,
    name: ctx.name,
    ext: ctx.ext,
    size: ctx.size,
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
    // A confiança final é a do elo mais fraco: saber o que é não adianta se não
    // se sabe onde vai, e vice-versa.
    proposal.confidence = Math.min(ruled.confidence, posto.confidence);
    proposal.reason = posto.precisaInstancia
      ? `${ruled.reason} — mas preciso saber qual ${posto.slots.join(' e ')}`
      : ruled.reason;
    proposal.decidedBy = `${ruled.decidedBy}+${posto.via}`;
    proposal.slug = ruled.nameHint || slugify(ctx.stem);

    if (proposal.confidence >= 0.8 && !opts.forceModel) {
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

  const rec = journal.append({
    op: 'move',
    id: proposal.id,
    from: proposal.file,
    to,
    fromName: path.basename(proposal.file),
    toName: path.basename(to),
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
