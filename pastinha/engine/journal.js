// A Memória: diário e índice são a mesma coisa vista de dois jeitos.
// Formato: JSON-lines, append-only. Escolha proposital para o protótipo —
// zero dependências, legível com `cat`, e impossível de corromper pela metade.
// Vira SQLite quando passar de uns 50k registros.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { JOURNAL_PATH, DATA_DIR } from './config.js';

let cache = null;

export function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(JOURNAL_PATH)) fs.writeFileSync(JOURNAL_PATH, '');
}

export function append(entry) {
  ensure();
  const rec = { id: entry.id || newId(), ts: new Date().toISOString(), ...entry };
  fs.appendFileSync(JOURNAL_PATH, JSON.stringify(rec) + '\n');
  if (cache) cache.push(rec);
  return rec;
}

export function all() {
  if (cache) return cache;
  ensure();
  const raw = fs.readFileSync(JOURNAL_PATH, 'utf8');
  cache = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { cache.push(JSON.parse(line)); } catch { /* linha truncada: ignora */ }
  }
  return cache;
}

export function reload() { cache = null; return all(); }

/** Movimentos aplicados que ainda não foram desfeitos, do mais novo pro mais velho. */
export function undoableMoves() {
  const entries = all();
  const undone = new Set(entries.filter(e => e.op === 'undo').map(e => e.of));
  return entries
    .filter(e => e.op === 'move' && !undone.has(e.id))
    .reverse();
}

/** Todo caminho e todo nome que um arquivo já teve. É isso que garante achar pelo nome antigo. */
export function history(finalPath) {
  const chain = [];
  let target = finalPath;
  const moves = all().filter(e => e.op === 'move');
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].to === target) { chain.push(moves[i]); target = moves[i].from; }
  }
  return chain.reverse();
}

export function stats() {
  const entries = all();
  const moves = entries.filter(e => e.op === 'move');
  const undos = entries.filter(e => e.op === 'undo');
  const decisions = entries.filter(e => e.op === 'decision');
  const accepted = decisions.filter(e => e.accepted).length;
  return {
    moved: moves.length,
    undone: undos.length,
    undoRate: moves.length ? undos.length / moves.length : 0,
    proposals: decisions.length,
    acceptRate: decisions.length ? accepted / decisions.length : 0,
    byRule: moves.reduce((acc, m) => { acc[m.decidedBy || '?'] = (acc[m.decidedBy || '?'] || 0) + 1; return acc; }, {}),
    lastTs: entries.length ? entries[entries.length - 1].ts : null
  };
}

export function sha1File(p, maxBytes = 8 * 1024 * 1024) {
  try {
    const fd = fs.openSync(p, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(size, maxBytes));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return crypto.createHash('sha1').update(buf).digest('hex') + ':' + size;
  } catch { return null; }
}

/**
 * Busca literal sobre a Memória. Sem IA, sem embedding.
 * Pontua nome novo, nome antigo, texto extraído, origem do download e categoria.
 * A hipótese que o bench precisa testar: isso sozinho já responde quase tudo.
 */
export function find(query, limit = 20) {
  const terms = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(t => t.length > 1);
  if (!terms.length) return [];

  const seen = new Map();
  for (const e of all()) {
    if (e.op !== 'move') continue;
    seen.set(e.to, e); // o registro mais recente vence
  }

  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = [];
  for (const e of seen.values()) {
    const fields = [
      { w: 10, v: norm(path.basename(e.to)) },
      { w: 8,  v: norm(path.basename(e.from)) },
      { w: 5,  v: norm(e.category) + ' ' + norm(path.dirname(e.to)) },
      { w: 4,  v: norm(e.source) },
      { w: 2,  v: norm(e.text).slice(0, 4000) }
    ];
    let score = 0, hits = 0;
    for (const t of terms) {
      let best = 0;
      for (const f of fields) if (f.v.includes(t)) best = Math.max(best, f.w);
      if (best) { score += best; hits++; }
    }
    if (!hits) continue;
    score *= hits / terms.length;            // cobrir todos os termos vale muito
    if (hits === terms.length) score *= 1.5;
    results.push({ score, entry: e, exists: fs.existsSync(e.to) });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
