#!/usr/bin/env node
// Pastinha — linha de comando.
// Tudo o que o bicho faz, dá pra fazer aqui sem interface nenhuma. É de propósito:
// o motor tem que funcionar sem rosto, senão o rosto está escondendo bug.
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
import { agrupar, contarDecisoes } from './src/core/lote.js';
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
    if (ans.toLowerCase() === 'q') break;
    if (ans.toLowerCase() === 'n') {
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

const HELP = `
  ${c.b('pastinha')} — um bicho com TOC de arrumação          ${c.dim(platform.label)}

  ${c.c('node cli.js sandbox')}        caixa de areia com bagunça de mentira. comece por aqui
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
  ${c.c('node cli.js undo')}           desfaz o último  ${c.dim('(--today desfaz o dia)')}
  ${c.c('node cli.js stats')}          os números que decidem o projeto
  ${c.c('node cli.js server')}         sobe o motor e o bicho em http://127.0.0.1:${cfg.port}
  ${c.c('node cli.js live')}           aponta para os seus arquivos de verdade

  bandeiras: --no-model  --apply  --dry-run  --limit N  --root CAMINHO  --n N  --perfil NOME
  perfis: ${PERFIS_DISPONIVEIS.join(' · ')}

  config  ${tilde(CONFIG_PATH)}
  memória ${tilde(JOURNAL_PATH)}
`;

try {
  switch (cmd) {
    case 'doctor': await doctor(); break;
    case 'sandbox': sandbox(); break;
    case 'corpus': corpus(); break;
    case 'seguranca': {
      const r = await rodarSeguranca();
      if (!r.passou) process.exit(1);
      break;
    }
    case 'perfil': perfilCmd(); break;
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
