// A medição, sem você rotular nada à mão.
//
// A sacada: você JÁ tem um conjunto rotulado. Todo arquivo que hoje está dentro
// de uma pasta que você mesmo escolheu é um par (arquivo -> resposta certa).
// Então: pegue arquivos já organizados, esconda o caminho, pergunte ao
// classificador onde ele guardaria, e compare com onde você guardou.
// Zero trabalho manual. Roda quantas vezes quiser, a cada mudança de regra.
import fs from 'node:fs';
import path from 'node:path';
import { propose } from '../engine/organize.js';
import { scanTaxonomy } from '../engine/folders.js';

const SKIP_DIR = new Set(['node_modules', '.git', 'Library', '.Trash', 'Pods', 'DerivedData', '__pycache__']);
const SKIP_FILE = /^(\.|~\$)|\.(ds_store|localized|part|crdownload)$/i;

function collect(root, maxDepth = 4) {
  const out = [];
  (function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIR.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && !SKIP_FILE.test(e.name) && depth >= 1) {
        out.push({ file: full, truth: path.relative(root, dir) });
      }
    }
  })(root, 0);
  return out;
}

function sample(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const topLevel = p => (p || '').split('/')[0];

export async function runBench(cfg, { root, n = 120, noModel = false, verbose = false } = {}) {
  const reference = root || cfg.learnFrom.find(r => fs.existsSync(r));
  if (!reference || !fs.existsSync(reference)) {
    throw new Error(`Não achei pasta de referência. Passe --root ~/Documents`);
  }

  const pool = collect(reference);
  if (pool.length < 10) {
    throw new Error(`Só achei ${pool.length} arquivos organizados em ${reference}. ` +
                    `Aponte --root para uma pasta que você já organizou.`);
  }
  const set = sample(pool, Math.min(n, pool.length));
  const taxonomy = scanTaxonomy([reference], 3);

  const rows = [];
  let exact = 0, top = 0, ruleOnly = 0, modelUsed = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < set.length; i++) {
    const { file, truth } = set[i];
    process.stdout.write(`\r  avaliando ${i + 1}/${set.length}  `);
    let p;
    try {
      p = await propose(file, cfg, taxonomy, { noModel });
    } catch (e) {
      errors++; continue;
    }
    if (!p || p.skip) continue;

    const hitExact = p.folder === truth;
    const hitTop = topLevel(p.folder) === topLevel(truth);
    if (hitExact) exact++;
    if (hitTop) top++;
    if (!p.usedModel) ruleOnly++; else modelUsed++;

    rows.push({
      name: path.basename(file),
      truth, guess: p.folder,
      hitExact, hitTop,
      conf: p.confidence,
      by: p.decidedBy,
      via: p.extractedVia,
      usedModel: p.usedModel
    });
  }
  process.stdout.write('\r');

  const total = rows.length || 1;
  const secs = (Date.now() - t0) / 1000;

  const byDecider = {};
  for (const r of rows) {
    const k = (r.by || '?').split(':')[0];
    byDecider[k] ||= { n: 0, exact: 0, top: 0 };
    byDecider[k].n++;
    if (r.hitExact) byDecider[k].exact++;
    if (r.hitTop) byDecider[k].top++;
  }

  const report = {
    reference, avaliados: rows.length, erros: errors,
    segundos: Math.round(secs),
    porArquivo: +(secs / total).toFixed(2),
    acertoExato: +(exact / total).toFixed(3),
    acertoCategoriaRaiz: +(top / total).toFixed(3),
    semModelo: ruleOnly, comModelo: modelUsed,
    percentualResolvidoSemModelo: +(ruleOnly / total).toFixed(3),
    byDecider,
    piores: rows.filter(r => !r.hitTop).slice(0, 25)
      .map(r => ({ arquivo: r.name, certo: r.truth, chutou: r.guess, por: r.by, conf: r.conf }))
  };

  if (verbose) report.todos = rows;
  return report;
}

export function printReport(rep) {
  const pct = v => (v * 100).toFixed(1) + '%';
  console.log('');
  console.log('  ── Pastinha · bench de classificação ' + '─'.repeat(26));
  console.log(`  referência ....... ${rep.reference}`);
  console.log(`  avaliados ........ ${rep.avaliados} arquivos em ${rep.segundos}s (${rep.porArquivo}s cada)`);
  console.log('');
  console.log(`  ACERTO EXATO ..... ${pct(rep.acertoExato)}   (pasta idêntica à sua)`);
  console.log(`  ACERTO NA RAIZ ... ${pct(rep.acertoCategoriaRaiz)}   (categoria de primeiro nível certa)`);
  console.log(`  sem modelo ....... ${pct(rep.percentualResolvidoSemModelo)}   (${rep.semModelo} por regra, ${rep.comModelo} pelo LLM)`);
  console.log('');
  console.log('  quem decidiu        n     exato    raiz');
  for (const [k, v] of Object.entries(rep.byDecider).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${k.padEnd(18)}${String(v.n).padStart(4)}  ${pct(v.exact / v.n).padStart(7)} ${pct(v.top / v.n).padStart(7)}`);
  }
  if (rep.piores.length) {
    console.log('');
    console.log('  onde errou feio:');
    for (const p of rep.piores.slice(0, 12)) {
      console.log(`   · ${p.arquivo.slice(0, 44)}`);
      console.log(`     certo: ${p.certo}   chutou: ${p.chutou}  (${p.por})`);
    }
  }
  console.log('');
  console.log('  ── leitura ' + '─'.repeat(52));
  const t = rep.acertoCategoriaRaiz;
  if (t >= 0.8) console.log('  Acima de 80% na raiz: tem produto. Siga para a Fase 1.');
  else if (t >= 0.7) console.log('  Entre 70% e 80%: tem produto, mas as regras precisam de uma rodada.');
  else console.log('  Abaixo de 70%: conserte o cérebro antes de desenhar um pixel.');
  console.log('');
}
