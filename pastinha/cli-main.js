import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { loadConfig, saveConfig, CONFIG_PATH, JOURNAL_PATH, DATA_DIR } from './src/core/config.js';
import * as journal from './src/core/journal.js';
import platform from './src/platform/index.js';
import { sniff } from './src/platform/shared/magic.js';
import { ollamaUp } from './src/core/brain.js';
import { propose, apply, undo, undoToday, listLoose, loadTaxonomy, isSettled } from './src/core/organize.js';
import { createServer } from './src/server/index.js';
import { runBench, printReport } from './src/bench/groundtruth.js';
import { buildSandbox } from './src/bench/sandbox.js';
import { buildCorpus, PERFIS_DISPONIVEIS } from './src/bench/corpus.js';
import { rodarSeguranca } from './src/bench/seguranca.js';
import { agrupar, contarDecisoes, aplicarHeranca } from './src/core/lote.js';
import { proveniencia } from './src/core/journal.js';
import { varrer, diagnostico } from './src/core/varredura.js';
import { montar, aplicar as aplicarRespostas, arvoreProposta } from './src/core/entrevista.js';
import { ensureFolder } from './src/core/folders.js';
import { PRESETS, getPreset, guessProfile } from './src/core/presets.js';

const cfg = loadConfig();
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const flag = (name, def = null) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return def;
  const next = args[i + 1];
  return (!next || next.startsWith('--')) ? true : next;
};
const has = name => args.includes('--' + name);
/** @param {string|boolean|null} p @returns {string|null} */
const expand = p => typeof p === 'string' ? p.replace(/^~/, os.homedir()) : null;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s);
const c = {
  dim: s => paint(2, s), b: s => paint(1, s), g: s => paint(32, s),
  y: s => paint(33, s), r: s => paint(31, s), c: s => paint(36, s)
};
const tilde = p => String(p).replace(os.homedir(), '~');

// "n" era o unico jeito de dizer nao que o programa entendia. Quem digitava
// "nao" ou "nao" com til — o que qualquer pessoa faz — era lido como SIM, e no
// "Executo?" isso mexia nos arquivos contra a vontade de quem respondeu.
const ehNao = (r) => /^n(a[o\u00f5]|\u00e3o|o)?$/i.test(String(r || '').trim());

async function doctor() {
  console.log(c.b(`\n  Pastinha · exame de admissão  ${c.dim('(' + platform.label + ')')}\n`));
  const line = (ok, label, extra = '') =>
    console.log(`  ${ok ? c.g('OK ') : c.r('!! ')}${label.padEnd(30)} ${c.dim(extra)}`);

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  line(nodeMajor >= 18, 'Node 18 ou mais novo', process.version);

  const perm = platform.permissionCheck();
  line(perm.ok, 'consegue ler suas pastas', perm.hint);

  line(!!sniff(CONFIG_PATH), 'detector de tipo por bytes', 'javascript puro, serve nos dois sistemas');

  const o = await ollamaUp(cfg);
  line(o.up, 'Ollama respondendo', cfg.ollama.url);
  if (o.up) {
    const hasText = o.models.some(m => m.startsWith(cfg.ollama.text.split(':')[0]));
    const hasVision = o.models.some(m => m.startsWith(cfg.ollama.vision.split(':')[0]));
    line(hasText, `modelo de texto (${cfg.ollama.text})`, hasText ? '' : `ollama pull ${cfg.ollama.text}`);
    line(hasVision, `modelo de visão (${cfg.ollama.vision})`, hasVision ? '' : `ollama pull ${cfg.ollama.vision}`);
    console.log(c.dim(`\n     instalados: ${o.models.join(', ') || '(nenhum)'}`));
  } else {
    console.log(c.dim('\n     sem Ollama ele funciona só com as regras — que é a maior parte do trabalho.'));
    console.log(c.dim('     instalar: https://ollama.com  depois  ollama pull ' + cfg.ollama.text));
  }

  console.log('');
  for (const d of cfg.watch) line(fs.existsSync(d), `vigia ${tilde(d)}`);
  line(true, `guarda em ${tilde(cfg.destRoot)}`, 'mude em ' + tilde(CONFIG_PATH));

  const loose = listLoose(cfg).length;
  console.log(`\n  ${loose ? c.y(loose + ' arquivo(s) solto(s)') : c.g('nada solto')}`);
  console.log(c.dim(`  memória: ${tilde(JOURNAL_PATH)} (${journal.all().length} registros)`));
  if (cfg.destRoot.includes('sandbox')) {
    console.log(c.y(`\n  Você está na caixa de areia. Nenhum arquivo seu está em risco.`));
  }
  console.log('');
}

async function scan({ interactive }) {
  const taxonomy = loadTaxonomy(cfg);
  const files = listLoose(cfg);
  if (!files.length) return console.log(c.dim('\n  nada solto. ele está dormindo.\n'));

  const limit = Number(flag('limit', 20));
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  if (rl) rl.on('SIGINT', () => { console.log(c.dim('\n  parei aqui.\n')); process.exit(130); });
  let done = 0, applied = 0, rejected = 0;
  /** @type {any[]} */
  const propostas = [];

  console.log(c.b(`\n  ${files.length} arquivo(s) solto(s). Olhando os primeiros ${Math.min(limit, files.length)}.\n`));

  for (const file of files.slice(0, limit)) {
    const settled = isSettled(file, cfg);
    if (!settled.ok) { console.log(c.dim(`  -- ${path.basename(file)}: ${settled.why}`)); continue; }

    let p;
    try { p = await propose(file, cfg, taxonomy, { noModel: has('no-model') }); }
    catch (e) { console.log(c.r(`  !! ${path.basename(file)}: ${e.message}`)); continue; }
    if (!p) continue;
    if (p.skip) { console.log(c.dim(`  -- ${path.basename(file)}: ${p.reason}`)); continue; }

    done++;
    propostas.push(p);
    const conf = Math.round(p.confidence * 100);
    const color = conf >= 85 ? c.g : conf >= 60 ? c.y : c.r;
    console.log(`  ${c.dim(path.basename(file))}`);
    console.log(`  ${c.c('->')} ${c.b(p.folder + '/')}${p.newName}`);
    console.log(`     ${color(conf + '%')} ${c.dim(`· ${p.decidedBy} · ${p.reason}`)}`);

    if (!interactive) { console.log(''); continue; }

    const ans = (await rl.question('     [enter] guardar · [n] deixar · [pasta] corrigir · [q] sair  ')).trim();
    if (/^(q|sair)$/i.test(ans)) break;
    if (ehNao(ans)) {
      journal.append({ op: 'decision', of: p.id, accepted: false, file, rejectedFolder: p.folder });
      rejected++; console.log(c.dim('     deixei aí.\n')); continue;
    }
    if (ans) p.folder = ans;
    const res = apply(p, cfg, { dryRun: has('dry-run') });
    journal.append({ op: 'decision', of: p.id, accepted: true, edited: !!ans, auto: false });
    applied++;
    console.log(c.g(`     ${has('dry-run') ? 'simulado' : 'guardado'}: ${tilde(res.to)}\n`));
  }

  rl?.close();
  console.log(c.b(`\n  ${done} analisados · ${applied} guardados · ${rejected} recusados`));

  // O numero que importa nao e quantos arquivos ele pergunta, e quantas DECISOES
  // voce precisa tomar. Quinhentos clipes do mesmo cartao sao uma decisao.
  if (propostas.length > 3) {
    const d = contarDecisoes(propostas);
    console.log('');
    console.log(`  ${c.b(String(d.automaticos))} ele guardaria sozinho`);
    console.log(`  ${c.b(String(d.arquivosQuePerguntariam))} arquivos precisam de voce — mas isso e so ${c.g(d.decisoes + ' decisao(oes)')}, nao ${d.arquivosQuePerguntariam}`);
    if (d.fator > 1.5) console.log(c.dim(`  agrupamento reduziu as perguntas em ${d.fator}x`));
    const { lotes } = agrupar(propostas.filter(p => p && !p.skip && (p.confidence || 0) < 0.8));
    for (const l of lotes.slice(0, 6)) {
      console.log(`    ${c.c('lote')} ${l.resumo}`);
      console.log(`         ${c.dim('-> ' + l.folder + (l.slots.length ? '   (falta: ' + l.slots.join(', ') + ')' : ''))}`);
    }
  }
  if (!interactive) console.log(c.dim('\n  (simulação. use `scan --apply` para decidir um por um)'));
  console.log('');
}

function find(q) {
  if (!q) return console.log('\n  uso: pastinha find "contrato do apartamento"\n');
  const hits = journal.find(q, 12);
  console.log('');
  if (!hits.length) {
    console.log(c.dim('  a memória não tem nada com isso.'));
    const sys = platform.systemSearch(q, 8);
    if (sys.length) {
      console.log(c.dim('  o índice do sistema achou:\n'));
      for (const p of sys) console.log('  ' + c.dim(tilde(p)));
    }
    console.log('');
    return;
  }
  for (const h of hits) {
    const e = h.entry;
    console.log(`  ${h.exists ? c.g('*') : c.r('x')} ${c.b(path.basename(e.to))}`);
    console.log(`     ${c.dim(tilde(path.dirname(e.to)))}`);
    if (e.fromName !== path.basename(e.to)) console.log(`     ${c.dim('antes: ' + e.fromName)}`);
    if (e.source) console.log(`     ${c.dim('de: ' + String(e.source).slice(0, 70))}`);
  }
  console.log('');
}

function stats() {
  const s = journal.stats();
  console.log(c.b('\n  Pastinha · números\n'));
  console.log(`  movidos .................. ${s.moved}`);
  const ur = (s.undoRate * 100).toFixed(1);
  console.log(`  desfeitos ................ ${s.undone}  ${s.undoRate > 0.02 ? c.r(`(${ur}% — acima de 2%, pare e conserte)`) : c.g(`(${ur}%)`)}`);
  console.log(`  propostas ................ ${s.proposals}`);
  console.log(`  taxa de aceitação ........ ${(s.acceptRate * 100).toFixed(1)}%`);
  if (Object.keys(s.byRule).length) {
    console.log('\n  quem decidiu:');
    for (const [k, v] of Object.entries(s.byRule).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`   ${String(v).padStart(5)}  ${k}`);
    }
  }
  console.log('');
}

function sandbox() {
  const box = buildSandbox(expand(flag('root')) || undefined);
  cfg.watch = [box.entrada];
  cfg.destRoot = box.guardados;
  cfg.learnFrom = [box.documentos];
  saveConfig(cfg);

  console.log(c.b('\n  Caixa de areia montada.\n'));
  console.log(`  ${box.soltos} arquivos bagunçados em  ${c.c(tilde(box.entrada))}`);
  console.log(`  ${box.gabarito} arquivos organizados em ${c.c(tilde(box.documentos))}  ${c.dim('(o gabarito do bench)')}`);
  console.log(`  destino                       ${c.c(tilde(box.guardados))}`);
  console.log(c.dim(`\n  A config já foi apontada para cá. Nenhum arquivo seu está em risco.`));
  console.log(c.b('\n  Agora:\n'));
  console.log(`    node cli.js bench --no-model    ${c.dim('# acurácia só com regras')}`);
  console.log(`    node cli.js scan                ${c.dim('# o que ele faria')}`);
  console.log(`    node cli.js scan --apply        ${c.dim('# decide um por um')}`);
  console.log(`    node cli.js find "condominio"   ${c.dim('# a busca')}`);
  console.log(c.dim(`\n  Quando quiser ir para os arquivos de verdade: node cli.js live\n`));
}

function live() {
  const f = platform.userFolders();
  const home = os.homedir();
  cfg.watch = [f.downloads];
  cfg.destRoot = path.join(home, 'Pastinha');
  cfg.learnFrom = [f.documents, path.join(home, 'Pastinha')];
  cfg.autonomy = 0;
  saveConfig(cfg);
  console.log(c.b('\n  Apontado para os arquivos de verdade.\n'));
  console.log(`  vigia    ${c.c(tilde(cfg.watch[0]))}`);
  console.log(`  guarda   ${c.c(tilde(cfg.destRoot))}  ${c.dim('(pasta nova, não mexe em Documentos)')}`);
  console.log(`  aprende  ${c.c(tilde(f.documents))}  ${c.dim('(só leitura)')}`);
  console.log(c.y(`\n  autonomia 0: ele só propõe. Nada se move sem você aprovar.`));
  console.log(c.dim(`  comece por: node cli.js scan\n`));
}

function corpus() {
  const persona = typeof flag('perfil') === 'string' ? String(flag('perfil')) : 'geral';
  if (!PERFIS_DISPONIVEIS.includes(persona)) {
    throw new Error(`perfil desconhecido: ${persona}\n  disponíveis: ${PERFIS_DISPONIVEIS.join(', ')}`);
  }
  const n = Number(flag('n', 3000));
  const root = expand(flag('root')) || path.join(DATA_DIR, 'corpus', persona);

  console.log(c.dim(`\n  gerando ${n} arquivos do perfil "${persona}"...`));
  const t0 = Date.now();
  const info = buildCorpus({ persona, n, root, soltos: 200 });
  const perfil = guessProfile(info.porExt, info.nomesDePasta);

  cfg.perfil = persona;
  cfg.watch = [info.entrada];
  cfg.destRoot = path.join(root, 'Guardados');
  cfg.learnFrom = [info.organizado];
  saveConfig(cfg);

  console.log(c.b(`\n  Corpus "${persona}" pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));
  console.log(`  ${String(info.arquivos).padStart(6)} arquivos organizados (o gabarito)`);
  console.log(`  ${String(info.soltos).padStart(6)} arquivos soltos em Entrada`);
  console.log(`  ${String(info.pastas).padStart(6)} pastas distintas`);
  console.log(c.dim(`\n  perfil detectado pela varredura: ${perfil.preset.id} (${perfil.confianca})`));
  if (perfil.porque.length) console.log(c.dim(`  porque: ${perfil.porque.join(', ')}`));
  console.log(c.dim(`\n  top extensões: ${Object.entries(info.porExt).slice(0, 8).map(([e, n2]) => `${e} ${n2}`).join('  ')}`));
  console.log(c.b(`\n  agora: node cli.js bench --no-model --n 400\n`));
}

function perfilCmd() {
  const alvo = args[1] && !args[1].startsWith('--') ? args[1] : null;
  if (!alvo) {
    console.log(c.b('\n  Perfis disponíveis\n'));
    for (const p of PRESETS) {
      const atual = p.id === cfg.perfil;
      console.log(`  ${atual ? c.g('>') : ' '} ${c.b(p.id.padEnd(13))}${p.label}`);
      console.log(`    ${c.dim(p.why)}`);
      console.log(`    ${c.dim('pastas: ' + p.tree.slice(0, 4).join('  ') + (p.tree.length > 4 ? ` … +${p.tree.length - 4}` : ''))}\n`);
    }
    console.log(c.dim(`  atual: ${cfg.perfil}. mudar: node cli.js perfil designer\n`));
    return;
  }
  const p = getPreset(alvo);
  if (p.id !== alvo) throw new Error(`perfil desconhecido: ${alvo}`);
  cfg.perfil = p.id;
  saveConfig(cfg);
  console.log(c.g(`\n  perfil agora é "${p.id}" (${p.label})`));
  console.log(c.dim(`  ${p.why}\n`));
  for (const t of p.tree) console.log('   ' + c.dim(t));
  console.log('');
}

function proveniencia_cmd(alvo) {
  if (!alvo) return console.log('\n  uso: pastinha proveniencia "caminho/do/arquivo"\n');
  const hits = journal.find(alvo, 1);
  const caminho = fs.existsSync(alvo) ? path.resolve(alvo) : (hits[0] && hits[0].entry.to);
  if (!caminho) return console.log(c.dim('\n  nao achei esse arquivo na memoria\n'));

  const p = proveniencia(caminho);
  if (!p) return console.log(c.dim('\n  esse arquivo nunca foi movido pelo bicho\n'));

  console.log(c.b(`\n  ${path.basename(p.agora)}`));
  console.log(c.dim(`  ${tilde(path.dirname(p.agora))}\n`));
  console.log(`  antes se chamava .... ${c.c(p.nomeOriginal)}`);
  console.log(`  e morava em ......... ${c.c(tilde(p.pastaOriginal))}`);
  if (p.chegouEm) console.log(`  chegou em ........... ${p.chegouEm.slice(0, 10)}`);
  if (p.veioDe) console.log(`  veio de ............. ${c.dim(String(p.veioDe).slice(0, 66))}`);
  if (p.aPastaEraFeitaDe) console.log(`  a pasta era .......... ${c.dim(p.aPastaEraFeitaDe)}`);
  if (p.estavaAoLadoDe.length) {
    console.log(`  estava ao lado de ....`);
    for (const v of p.estavaAoLadoDe.slice(0, 6)) console.log(`      ${c.dim(v.slice(0, 60))}`);
    if (p.estavaAoLadoDe.length > 6) console.log(c.dim(`      e mais ${p.estavaAoLadoDe.length - 6}`));
  }
  console.log(`  tipo ................. ${p.tipo || '?'}   ${c.dim('(' + (p.decididoPor || '?') + ')')}`);
  console.log(c.dim(`\n  a ordem original nao foi destruida — ela mora aqui.\n`));
}


// ---------------------------------------------------------------------------
// comecar: a primeira vez. Um comando so, do zero ao bicho vivo.
// ---------------------------------------------------------------------------
async function comecar() {
  // Duas entradas completamente diferentes, e tratar as duas com o mesmo
  // readline foi a origem de dois defeitos.
  //
  // TERMINAL: readline normal, e Ctrl+C tem que MATAR. Antes, Ctrl+C fechava o
  // readline, o programa entendia "fim da entrada", respondia tudo com os
  // padroes e movia os arquivos — o oposto exato do que a pessoa pediu.
  //
  // CANALIZADA (teste, script): o readline recebe todas as linhas de uma vez e
  // fecha imediatamente. Usar esse 'close' como "acabou" descartava as linhas
  // que ainda estavam na fila, inclusive a resposta do "Executo?". Entao aqui
  // a fila e nossa: lemos tudo de uma vez e respondemos em ordem.
  const ehTerminal = !!process.stdin.isTTY;
  const semPerguntar = has('padroes');

  /** @type {string[]} */
  let fila = [];
  if (!ehTerminal && !semPerguntar) {
    try { fila = fs.readFileSync(0, 'utf8').split('\n'); } catch { fila = []; }
  }

  const rl = ehTerminal && !semPerguntar
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  if (rl) {
    rl.on('SIGINT', () => {
      console.log(c.dim('\n\n  cancelado. nada foi movido.\n'));
      process.exit(130);
    });
  }

  const pergunta = async (t) => {
    if (semPerguntar) { console.log(t.trimEnd()); return ''; }
    if (!rl) {
      console.log(t.trimEnd());
      return fila.length ? String(fila.shift()).trim() : '';
    }
    return String(await rl.question(t)).trim();
  };

  console.log(c.b('\n  Pastinha\n'));
  if (semPerguntar) {
    console.log(c.r('  --padroes: vou responder tudo sozinho E EXECUTAR, sem esperar você.'));
    console.log(c.dim('  É uma bandeira de teste. Para usar de verdade, rode sem ela.\n'));
  }
  if (String(cfg.destRoot || '').includes('sandbox')) {
    // Quem acabou de rodar o sandbox leu "nenhum arquivo seu esta em risco".
    // O comecar monta uma config nova e volta para os arquivos de verdade —
    // deixar isso implicito e quebrar uma promessa que a tela acabou de fazer.
    console.log(c.y('  Aviso: você está na caixa de areia, e o comecar sai dela.'));
    console.log(c.dim('  Daqui pra frente eu falo dos seus arquivos de verdade.\n'));
  }
  console.log('  Vou olhar o seu computador, fazer umas perguntas, e propor uma arrumação.');
  console.log(c.dim('  Nada é movido sem você ver e aprovar. Nada sai desta máquina.\n'));

  const perm = platform.permissionCheck();
  if (!perm.ok) {
    console.log(c.r('  Não consigo ler suas pastas.'));
    console.log(c.dim('  ' + perm.hint + '\n'));
    if (rl) rl.close(); return;
  }

  // --- 1. varredura -------------------------------------------------------
  console.log(c.b('  1. Olhando o disco') + c.dim('  (só leitura: nome, tamanho e data. Não abro nenhum arquivo.)\n'));
  let ultimo = '';
  const inv = varrer({
    aoProgredir: (n, onde) => {
      const curto = tilde(onde).slice(0, 54);
      if (curto !== ultimo) {
        ultimo = curto;
        process.stdout.write(`\r     ${String(n).padStart(7)} arquivos  ${curto.padEnd(56)}`);
      }
    }
  });
  process.stdout.write('\r' + ' '.repeat(78) + '\r');

  const diag = diagnostico(inv);
  console.log(c.g(`     pronto em ${inv.segundos}s\n`));
  for (const l of diag.linhas) console.log('     ' + l);
  if (inv.truncada) console.log(c.y('     (parei no limite; o suficiente para decidir)'));
  console.log('');
  console.log(`  ${c.b('Seu disco parece de ' + diag.perfil.preset.label.toLowerCase())}` +
    c.dim(`  (confiança ${diag.perfil.confianca})`));
  if (diag.perfil.porque && diag.perfil.porque.length) {
    console.log(c.dim('     porque: ' + diag.perfil.porque.slice(0, 3).join(', ')));
  }

  // --- 2. perguntas -------------------------------------------------------
  const perguntas = montar({ perfil: diag.perfil, inventario: inv });
  console.log(c.b(`\n  2. ${perguntas.length} perguntas`) + c.dim('  (enter aceita o padrão · "?" explica por que eu pergunto)\n'));

  /** @type {Record<string,string>} */
  const respostas = {};
  for (let i = 0; i < perguntas.length; i++) {
    const q = perguntas[i];
    for (;;) {
      console.log(`  ${c.c(String(i + 1) + '.')} ${q.texto}`);
      if (q.opcoes) {
        q.opcoes.forEach((o, n) => {
          const marca = o.valor === q.padrao ? c.g('>') : ' ';
          console.log(`     ${marca} ${c.b(String(n + 1))} ${o.rotulo}` + (o.detalhe ? c.dim('  — ' + o.detalhe) : ''));
        });
      }
      const r = await pergunta('     ');
      if (r === '?') { console.log(c.dim('\n     ' + (q.porque || 'sem explicação') + '\n')); continue; }
      if (!r) { respostas[q.id] = q.padrao; break; }
      if (q.opcoes) {
        const n = Number(r);
        if (n >= 1 && n <= q.opcoes.length) { respostas[q.id] = q.opcoes[n - 1].valor; break; }
        const porNome = q.opcoes.find(o => o.valor === r || o.rotulo.startsWith(r.toLowerCase()));
        if (porNome) { respostas[q.id] = porNome.valor; break; }
        console.log(c.y('     não entendi, escolhe um número\n')); continue;
      }
      respostas[q.id] = r; break;
    }
    console.log('');
  }

  aplicarRespostas(perguntas, respostas, cfg);
  saveConfig(cfg);

  // --- 3. a arvore proposta ------------------------------------------------
  const arvore = arvoreProposta(cfg, inv);
  console.log(c.b('  3. A estrutura que eu proponho\n'));
  for (const p of arvore.slice(0, 26)) console.log('     ' + c.c(tilde(cfg.destRoot)) + '/' + p);
  if (arvore.length > 26) console.log(c.dim(`     e mais ${arvore.length - 26}`));
  console.log(c.dim('\n     As pastas só nascem quando um arquivo precisar delas.'));
  const ok = await pergunta('\n  Pode ser? [enter = sim, n = recomeçar as perguntas]  ');
  if (ehNao(ok)) { if (rl) rl.close(); return comecar(); }

  // --- 4. simulacao --------------------------------------------------------
  console.log(c.b('\n  4. O que eu faria agora, sem mover nada\n'));
  const tax = loadTaxonomy(cfg);
  const soltos = listLoose(cfg);
  if (!soltos.length) {
    console.log(c.dim('     Não tem nada solto nas pastas que eu vigio. Limpo.\n'));
  } else {
    const propostas = [];
    const esperando = [];
    const fila = soltos.slice(0, 400);
    if (soltos.length > fila.length) {
      console.log(c.dim(`     ${soltos.length} soltos; olho os primeiros ${fila.length} agora, e o resto no viver.\n`));
    }
    // Ler o conteudo de algumas centenas de arquivos leva minutos. Sem nada
    // na tela, a conclusao obvia de quem esta olhando e que travou — e o
    // proximo passo dessa pessoa e um ctrl+C no meio da operacao.
    let visto = 0;
    for (const f of fila) {
      if (fila.length > 12 && process.stdout.isTTY) {
        visto++;
        process.stdout.write(`\r     lendo ${visto}/${fila.length}…   `);
        if (visto === fila.length) process.stdout.write('\r' + ' '.repeat(34) + '\r');
      }
      const est = isSettled(f, cfg);
      if (!est.ok) { esperando.push({ f, why: est.why }); continue; }
      try { const p = await propose(f, cfg, tax, { noModel: !(await ollamaUp(cfg)).up }); if (p) propostas.push(p); }
      catch { /* segue */ }
    }
    aplicarHeranca(propostas);
    const bons = propostas.filter(p => p && !p.skip && p.folder);
    const protegidos = propostas.filter(p => p && p.skip);
    const d = contarDecisoes(propostas);

    for (const p of bons.slice(0, 12)) {
      console.log(`     ${c.dim(p.name.slice(0, 44))}`);
      console.log(`       ${c.c('→')} ${c.b(p.folder + '/')}${p.newName}  ${c.dim(Math.round(p.confidence * 100) + '%')}`);
    }
    if (bons.length > 12) console.log(c.dim(`     e mais ${bons.length - 12}\n`));

    console.log('');
    console.log(`     ${c.b(String(d.automaticos))} eu guardo sozinho`);
    const plural = d.decisoes === 1 ? 'é só ' + c.g('1 decisão') : 'são só ' + c.g(d.decisoes + ' decisões');
    console.log(`     ${c.b(String(d.arquivosQuePerguntariam))} ${d.arquivosQuePerguntariam === 1 ? 'precisa' : 'precisam'} de você — mas ${plural}, não ${d.arquivosQuePerguntariam}`);
    if (protegidos.length) {
      console.log(`     ${c.b(String(protegidos.length))} eu não toco ${c.dim('(projeto, jogo, pacote ou biblioteca de aplicativo)')}`);
    }
    // Dizer por que um arquivo ficou de fora. Silencio aqui faz o programa
    // parecer quebrado justamente para quem acabou de baixar alguma coisa.
    if (esperando.length) {
      const chegando = esperando.filter(e => /mexeu há/.test(e.why));
      if (chegando.length) {
        console.log(`     ${c.b(String(chegando.length))} ainda chegando ${c.dim('(mexidos agora — pego eles no viver, em alguns segundos)')}`);
      }
      for (const e of esperando.filter(e => !/mexeu há/.test(e.why))) {
        console.log(c.dim(`     -- ${path.basename(e.f)}: ${e.why}`));
      }
    }

    const vai = await pergunta(`\n  Executo? [enter = sim, n = não]  `);
    if (!ehNao(vai)) {
      let feitos = 0, adiados = 0;
      for (const p of bons) {
        // Com autonomia 0 so vai o que esta acima da barra. O resto nao some:
        // vira decisao no 'scan --apply' e no 'viver'.
        if ((p.confidence || 0) < cfg.autoThreshold && cfg.autonomy === 0) { adiados++; continue; }
        try { apply(p, cfg); feitos++; } catch { /* segue */ }
      }
      console.log(c.g(`\n     ${feitos} arquivos guardados.`));
      if (adiados) {
        // Imprimir "0" e calar faz parecer que o programa nao funciona. Ele
        // funcionou: voce pediu para ele perguntar, e ele esta perguntando.
        console.log(c.dim(`     ${adiados} eu preferi não decidir sozinho — você escolheu "pergunta sempre".`));
        console.log(`     ${c.c('node cli.js scan --apply')} decide um por um, agora.`);
      }
      if (feitos) console.log(c.dim(`     Mudou de ideia? ${c.c('node cli.js undo --today')} devolve tudo.`));
    }
  }

  // --- 5. daqui pra frente -------------------------------------------------
  console.log(c.b('\n  5. Daqui pra frente\n'));
  console.log(`     ${c.c('node cli.js viver')}           deixa ele vivo, organizando o que chegar`);
  console.log(`     ${c.c('node cli.js achar "contrato"')}  procura um arquivo`);
  console.log(`     ${c.c('node cli.js undo --today')}      desfaz tudo de hoje`);
  console.log(`     ${c.c('node cli.js proveniencia "..."')}  de onde veio, como se chamava`);
  console.log(c.dim(`\n     config em ${tilde(CONFIG_PATH)}  ·  memória em ${tilde(JOURNAL_PATH)}\n`));
  if (rl) rl.close();
}

// ---------------------------------------------------------------------------
// viver: fica rodando e organiza o que chegar.
// ---------------------------------------------------------------------------
async function viver() {
  const intervalo = Number(flag('intervalo', 15)) * 1000;
  const auto = cfg.autonomy > 0 || has('auto');
  console.log(c.b('\n  Pastinha vivo.') + c.dim(`  vigiando ${cfg.watch.map(tilde).join(' e ')}`));
  console.log(c.dim(`  ${auto ? 'guardando sozinho o que eu tiver certeza' : 'só proponho, não movo nada'} · ctrl+c para parar\n`));

  const vistos = new Set(listLoose(cfg));
  const o = await ollamaUp(cfg);
  let tax = loadTaxonomy(cfg);
  let desdeTaxonomia = Date.now();

  for (;;) {
    await new Promise(r => setTimeout(r, intervalo));
    if (Date.now() - desdeTaxonomia > 600000) { tax = loadTaxonomy(cfg); desdeTaxonomia = Date.now(); }

    const agora = listLoose(cfg);
    const novos = agora.filter(f => !vistos.has(f));
    for (const f of agora) vistos.add(f);
    if (!novos.length) continue;

    const propostas = [];
    for (const f of novos) {
      const est = isSettled(f, cfg);
      if (!est.ok) { vistos.delete(f); continue; }   // ainda chegando: volta na proxima
      try { const p = await propose(f, cfg, tax, { noModel: !o.up }); if (p) propostas.push(p); }
      catch { /* segue */ }
    }
    aplicarHeranca(propostas);

    for (const p of propostas) {
      if (!p || p.skip) {
        if (p && p.skip) console.log(c.dim(`  — ${path.basename(p.file)}: ${p.reason}`));
        continue;
      }
      const conf = Math.round((p.confidence || 0) * 100);
      if (auto && (p.confidence || 0) >= cfg.autoThreshold && !p.precisaInstancia) {
        try {
          const res = apply(p, cfg);
          journal.append({ op: 'decision', of: p.id, accepted: true, auto: true });
          console.log(`  ${c.g('guardei')} ${p.name.slice(0, 40)}  ${c.c('→')} ${p.folder}/  ${c.dim(conf + '%')}`);
        } catch (e) { console.log(c.r(`  !! ${p.name}: ${e.message}`)); }
      } else {
        console.log(`  ${c.y('vi')} ${p.name.slice(0, 40)}  ${c.dim('→ ' + p.folder + '/  ' + conf + '%')}`);
      }
    }
  }
}

const HELP = `
  ${c.b('pastinha')} — um bicho com TOC de arrumação          ${c.dim(platform.label)}

  ${c.b('node cli.js comecar')}       ${c.b('a primeira vez: varre, pergunta, propõe, executa')}
  ${c.c('node cli.js viver')}          fica rodando e organiza o que chegar
  ${c.c('node cli.js achar "..."')}    procura um arquivo

  ${c.c('node cli.js sandbox')}        caixa de areia com bagunça de mentira, sem risco
  ${c.c('node cli.js doctor')}         vê se a máquina está pronta
  ${c.c('node cli.js corpus --perfil fotografo --n 20000')}
                             corpus em massa de um perfil, com gabarito
  ${c.c('node cli.js seguranca')}      o teste que nao admite porcentagem: 0 movimentos
                             em jogo, projeto, pacote e biblioteca alheia
  ${c.c('node cli.js perfil')}         lista os perfis · ${c.c('perfil designer')} troca
  ${c.c('node cli.js bench')}          mede acurácia usando pastas já organizadas como gabarito
  ${c.c('node cli.js scan')}           simula: o que ele faria. não move nada
  ${c.c('node cli.js scan --apply')}   decide um por um, no terminal
  ${c.c('node cli.js find "..."')}     busca por nome novo, nome antigo, conteúdo e origem
  ${c.c('node cli.js proveniencia "..."')}  tudo o que o arquivo ja foi: nome antigo,
                             pasta antiga, com quem estava, de onde veio
  ${c.c('node cli.js undo')}           desfaz o último  ${c.dim('(--today desfaz o dia)')}
  ${c.c('node cli.js stats')}          os números que decidem o projeto
  ${c.c('node cli.js server')}         sobe o motor e o bicho em http://127.0.0.1:${cfg.port}
  ${c.c('node cli.js live')}           aponta para os seus arquivos de verdade

  bandeiras: --no-model  --apply  --dry-run  --limit N  --root CAMINHO  --n N  --perfil NOME
             --padroes (aceita todas as respostas padrao, sem perguntar)
  perfis: ${PERFIS_DISPONIVEIS.join(' · ')}

  config  ${tilde(CONFIG_PATH)}
  memória ${tilde(JOURNAL_PATH)}
`;

try {
  switch (cmd) {
    case 'doctor': await doctor(); break;
    case 'comecar': await comecar(); break;
    case 'viver': await viver(); break;
    case 'achar': find(args.slice(1).filter(a => !a.startsWith('--')).join(' ')); break;
    case 'sandbox': sandbox(); break;
    case 'corpus': corpus(); break;
    case 'seguranca': {
      const r = await rodarSeguranca();
      if (!r.passou) process.exit(1);
      break;
    }
    case 'perfil': perfilCmd(); break;
    case 'proveniencia': proveniencia_cmd(args.slice(1).filter(a => !a.startsWith('--')).join(' ')); break;
    case 'live': live(); break;
    case 'scan': await scan({ interactive: has('apply') }); break;
    case 'find': find(args.slice(1).filter(a => !a.startsWith('--')).join(' ')); break;
    case 'stats': stats(); break;
    case 'undo': {
      const res = has('today') ? undoToday() : undo(Number(flag('n', 1)));
      if (!res.length) console.log(c.dim('\n  não tinha nada pra desfazer.\n'));
      for (const r of res) {
        console.log(r.ok ? c.g(`  OK voltou: ${tilde(r.restoredTo)}`) : c.r(`  !! ${r.toName}: ${r.why}`));
      }
      console.log('');
      break;
    }
    case 'bench': {
      const rep = await runBench(cfg, {
        root: expand(flag('root')) || null,
        n: Number(flag('n', 120)),
        noModel: has('no-model'),
        verbose: has('verbose'),
        perfil: typeof flag('perfil') === 'string' ? String(flag('perfil')) : null
      });
      printReport(rep);
      const out = path.join(DATA_DIR, `bench-${Date.now()}.json`);
      fs.writeFileSync(out, JSON.stringify(rep, null, 2));
      console.log(c.dim(`  relatório completo: ${tilde(out)}`));
      console.log(c.dim(`  (é esse arquivo que você me manda — só nomes e categorias, nenhum conteúdo)\n`));
      break;
    }
    case 'server': {
      const { server } = createServer(cfg);
      server.listen(cfg.port, '127.0.0.1', () => {
        console.log(c.b(`\n  Pastinha vivo em http://127.0.0.1:${cfg.port}`));
        console.log(c.dim('  abra no navegador, ou rode `npm run pet` para a janelinha flutuante.\n'));
      });
      break;
    }
    default: console.log(HELP);
  }
} catch (e) {
  console.error(c.r(`\n  ${e.message}\n`));
  if (has('debug')) console.error(e);
  process.exit(1);
}
