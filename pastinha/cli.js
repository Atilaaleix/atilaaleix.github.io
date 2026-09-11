#!/usr/bin/env node
// Pastinha — linha de comando.
// Tudo o que o bicho faz, dá pra fazer aqui sem interface nenhuma. É de propósito:
// as camadas 1 a 4 têm que funcionar sem rosto, senão o rosto está escondendo bug.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { loadConfig, CONFIG_PATH, JOURNAL_PATH } from './engine/config.js';
import * as journal from './engine/journal.js';
import * as mac from './engine/macos.js';
import { ollamaUp } from './engine/brain.js';
import { propose, apply, undo, undoToday, listLoose, loadTaxonomy, isSettled } from './engine/organize.js';
import { createServer } from './engine/server.js';
import { runBench, printReport } from './bench/groundtruth.js';

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

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`,
  g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m`
};

const tilde = p => p.replace(os.homedir(), '~');

async function doctor() {
  console.log(c.b('\n  Pastinha · exame de admissão\n'));
  const line = (ok, label, extra = '') =>
    console.log(`  ${ok ? c.g('✓') : c.r('✗')} ${label.padEnd(30)} ${c.dim(extra)}`);

  line(process.platform === 'darwin', 'macOS', process.platform);
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 18;
  line(nodeOk, 'Node 18+', process.version);
  line(mac.fullDiskAccessLooksGranted(os.homedir()), 'consegue ler ~/Downloads',
       'se falhar: Ajustes > Privacidade > Acesso Total ao Disco');
  line(!!mac.mimeType(CONFIG_PATH), 'utilitários do sistema', 'file, mdls, textutil, sips, unzip');

  const o = await ollamaUp(cfg);
  line(o.up, 'Ollama respondendo', cfg.ollama.url);
  if (o.up) {
    const hasText = o.models.some(m => m.startsWith(cfg.ollama.text.split(':')[0]));
    const hasVision = o.models.some(m => m.startsWith(cfg.ollama.vision.split(':')[0]));
    line(hasText, `modelo de texto (${cfg.ollama.text})`, hasText ? '' : `ollama pull ${cfg.ollama.text}`);
    line(hasVision, `modelo de visão (${cfg.ollama.vision})`, hasVision ? '' : `ollama pull ${cfg.ollama.vision}`);
    console.log(c.dim(`\n    instalados: ${o.models.join(', ') || '(nenhum)'}`));
  } else {
    console.log(c.dim('\n    sem Ollama ele ainda funciona: só as regras determinísticas.'));
    console.log(c.dim('    instalar: https://ollama.com  →  ollama pull ' + cfg.ollama.text));
  }

  console.log('');
  for (const d of cfg.watch) line(fs.existsSync(d), `vigia ${tilde(d)}`);
  line(true, `guarda em ${tilde(cfg.destRoot)}`, 'mude em ' + tilde(CONFIG_PATH));
  const loose = listLoose(cfg).length;
  console.log(`\n  ${loose ? c.y(loose + ' arquivo(s) solto(s)') : c.g('nada solto')}`);
  console.log(c.dim(`  memória: ${tilde(JOURNAL_PATH)} (${journal.all().length} registros)\n`));
}

async function scan({ interactive }) {
  const taxonomy = loadTaxonomy(cfg);
  const files = listLoose(cfg);
  if (!files.length) return console.log(c.dim('  nada solto. ele está dormindo.\n'));

  const limit = Number(flag('limit', 20));
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  let done = 0, applied = 0, rejected = 0;

  console.log(c.b(`\n  ${files.length} arquivo(s) solto(s). Olhando os primeiros ${Math.min(limit, files.length)}.\n`));

  for (const file of files.slice(0, limit)) {
    const settled = isSettled(file, cfg);
    if (!settled.ok) { console.log(c.dim(`  — ${path.basename(file)}: ${settled.why}`)); continue; }

    let p;
    try { p = await propose(file, cfg, taxonomy, { noModel: has('no-model') }); }
    catch (e) { console.log(c.r(`  ! ${path.basename(file)}: ${e.message}`)); continue; }
    if (!p) continue;
    if (p.skip) { console.log(c.dim(`  — ${path.basename(file)}: ${p.reason}`)); continue; }

    done++;
    const conf = Math.round(p.confidence * 100);
    const color = conf >= 85 ? c.g : conf >= 60 ? c.y : c.r;
    console.log(`  ${c.dim(path.basename(file))}`);
    console.log(`  ${c.c('→')} ${c.b(p.folder + '/')}${p.newName}`);
    console.log(`    ${color(conf + '%')} ${c.dim(`· ${p.decidedBy} · ${p.reason}`)}`);

    if (!interactive) { console.log(''); continue; }

    const ans = (await rl.question('    [enter] guardar · [n] deixar · [pasta/nova] corrigir · [q] sair  ')).trim();
    if (ans.toLowerCase() === 'q') break;
    if (ans.toLowerCase() === 'n') {
      journal.append({ op: 'decision', of: p.id, accepted: false, file, rejectedFolder: p.folder });
      rejected++; console.log(c.dim('    deixei aí.\n')); continue;
    }
    if (ans) p.folder = ans;
    const res = apply(p, cfg, { dryRun: has('dry-run') });
    journal.append({ op: 'decision', of: p.id, accepted: true, edited: !!ans, auto: false });
    applied++;
    console.log(c.g(`    ${has('dry-run') ? 'simulado' : 'guardado'}: ${tilde(res.to)}\n`));
  }

  rl?.close();
  console.log(c.b(`\n  ${done} analisados · ${applied} guardados · ${rejected} recusados`));
  if (!interactive) console.log(c.dim('  (simulação. use `scan --apply` para decidir um por um)'));
  console.log('');
}

function find(q) {
  if (!q) return console.log('  uso: pastinha find "contrato do apartamento"');
  const hits = journal.find(q, 12);
  console.log('');
  if (!hits.length) {
    console.log(c.dim('  a memória não tem nada com isso. tentando o Spotlight...\n'));
    for (const p of mac.mdfind(q, 8)) console.log('  ' + c.dim(tilde(p)));
    console.log('');
    return;
  }
  for (const h of hits) {
    const e = h.entry;
    console.log(`  ${h.exists ? c.g('•') : c.r('×')} ${c.b(path.basename(e.to))}`);
    console.log(`    ${c.dim(tilde(path.dirname(e.to)))}`);
    if (e.fromName !== path.basename(e.to)) console.log(`    ${c.dim('antes: ' + e.fromName)}`);
    if (e.source) console.log(`    ${c.dim('de: ' + e.source.slice(0, 70))}`);
  }
  console.log('');
}

function stats() {
  const s = journal.stats();
  console.log(c.b('\n  Pastinha · números\n'));
  console.log(`  movidos .................. ${s.moved}`);
  console.log(`  desfeitos ................ ${s.undone}  ${s.undoRate > 0.02 ? c.r(`(${(s.undoRate * 100).toFixed(1)}% — acima de 2%, pare e conserte)`) : c.g(`(${(s.undoRate * 100).toFixed(1)}%)`)}`);
  console.log(`  propostas ................ ${s.proposals}`);
  console.log(`  taxa de aceitação ........ ${(s.acceptRate * 100).toFixed(1)}%`);
  console.log('\n  quem decidiu:');
  for (const [k, v] of Object.entries(s.byRule).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`   ${String(v).padStart(5)}  ${k}`);
  }
  console.log('');
}

const HELP = `
  ${c.b('pastinha')} — um bicho com TOC de arrumação

  ${c.c('pastinha doctor')}              vê se a máquina está pronta
  ${c.c('pastinha scan')}                simula: o que ele faria com o que está solto
  ${c.c('pastinha scan --apply')}        decide um por um, no terminal
  ${c.c('pastinha scan --no-model')}     só regras, sem LLM (rápido)
  ${c.c('pastinha bench')}               mede acurácia usando SUAS pastas como gabarito
  ${c.c('pastinha bench --root ~/Documents --n 200')}
  ${c.c('pastinha find "contrato apartamento"')}
  ${c.c('pastinha undo')} / ${c.c('pastinha undo --today')}
  ${c.c('pastinha stats')}               os números que decidem o projeto
  ${c.c('pastinha server')}              sobe o motor e a UI em http://127.0.0.1:${cfg.port}

  config: ${tilde(CONFIG_PATH)}
  memória: ${tilde(JOURNAL_PATH)}
`;

switch (cmd) {
  case 'doctor': await doctor(); break;
  case 'scan': await scan({ interactive: has('apply') }); break;
  case 'find': find(args.slice(1).filter(a => !a.startsWith('--')).join(' ')); break;
  case 'stats': stats(); break;
  case 'undo': {
    const res = has('today') ? undoToday() : undo(Number(flag('n', 1)));
    if (!res.length) console.log(c.dim('\n  não tinha nada pra desfazer.\n'));
    for (const r of res) {
      console.log(r.ok ? c.g(`  ✓ voltou: ${tilde(r.restoredTo)}`) : c.r(`  ✗ ${r.toName}: ${r.why}`));
    }
    console.log('');
    break;
  }
  case 'bench': {
    const rep = await runBench(cfg, {
      root: typeof flag('root') === 'string' ? flag('root').replace(/^~/, os.homedir()) : null,
      n: Number(flag('n', 120)),
      noModel: has('no-model'),
      verbose: has('verbose')
    });
    printReport(rep);
    const out = path.join(path.dirname(JOURNAL_PATH), `bench-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(rep, null, 2));
    console.log(c.dim(`  relatório completo: ${tilde(out)}\n`));
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
