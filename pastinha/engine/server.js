// Servidor local. A UI é uma página web comum — de propósito.
// Assim a casca (Electron hoje, Tauri ou Swift depois) não contém lógica nenhuma
// e trocar de casca é um fim de semana, não uma reescrita.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as journal from './journal.js';
import * as mac from './macos.js';
import { propose, apply, undo, undoToday, listLoose, loadTaxonomy, isSettled } from './organize.js';
import { ollamaUp } from './brain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(HERE, '..', 'ui');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

export function createServer(cfg) {
  const state = {
    queue: [],          // propostas esperando decisão
    taxonomy: loadTaxonomy(cfg),
    scanning: false,
    loose: 0,
    mood: 'dormindo',
    lastSaid: 'oi',
    ollama: { up: false, models: [] },
    seen: new Set()     // arquivos já propostos nesta sessão
  };
  const clients = new Set();

  function broadcast() {
    const payload = JSON.stringify(publicState());
    for (const res of clients) {
      try { res.write(`data: ${payload}\n\n`); } catch { clients.delete(res); }
    }
  }

  /** O humor é função do estado real do computador. Nada decorativo. */
  function computeMood() {
    const loose = state.loose;
    if (state.scanning) return 'trabalhando';
    if (loose === 0) return 'dormindo';
    if (loose >= 25) return 'desesperado';
    if (loose >= 8) return 'ansioso';
    return 'atento';
  }

  const FALAS = {
    dormindo: ['tudo no lugar... zzz', 'nada solto por aqui', 'que paz'],
    atento: ['tem {n} coisa solta ali', 'deixa eu dar um jeito nisso?', 'achei {n} arquivo perdido'],
    ansioso: ['tem {n} COISAS SOLTAS', 'eu nao consigo relaxar assim', 'so uma pasta, por favor'],
    desesperado: ['{n} ARQUIVOS SOLTOS', 'me deixa arrumar, eu imploro', 'isso aqui esta me matando'],
    trabalhando: ['deixa comigo', 'ja volto', 'organizando...']
  };

  function say() {
    const opts = FALAS[state.mood] || FALAS.atento;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    return pick.replace('{n}', state.loose);
  }

  function publicState() {
    return {
      mood: state.mood,
      says: state.lastSaid,
      loose: state.loose,
      scanning: state.scanning,
      queue: state.queue.slice(0, 40),
      stats: journal.stats(),
      ollama: state.ollama,
      config: { destRoot: cfg.destRoot, watch: cfg.watch, autonomy: cfg.autonomy }
    };
  }

  function refreshLoose() {
    state.loose = listLoose(cfg).length;
    state.mood = computeMood();
    state.lastSaid = say();
  }

  async function scan({ limit = 25 } = {}) {
    if (state.scanning) return;
    state.scanning = true;
    state.mood = 'trabalhando';
    broadcast();

    try {
      state.taxonomy = loadTaxonomy(cfg);
      const files = listLoose(cfg).filter(f => !state.seen.has(f));
      let done = 0;
      for (const file of files) {
        if (done >= limit) break;
        const settled = isSettled(file, cfg);
        if (!settled.ok) continue;
        state.seen.add(file);
        try {
          const p = await propose(file, cfg, state.taxonomy);
          if (!p || p.skip) continue;

          // Autonomia: nível 0 sempre pergunta. É o padrão, e é assim que se ganha confiança.
          const auto = (cfg.autonomy >= 2 && p.confidence >= cfg.autoThreshold)
                    || (cfg.autonomy >= 1 && p.decidedBy && !p.usedModel && p.confidence >= 0.9);
          if (auto) {
            const res = apply(p, cfg);
            journal.append({ op: 'decision', of: p.id, accepted: true, auto: true });
            state.queue.unshift({ ...res, autoApplied: true });
          } else {
            state.queue.push(p);
          }
          done++;
          broadcast();
        } catch (e) {
          console.error(`[pastinha] falhou em ${path.basename(file)}: ${e.message}`);
        }
      }
    } finally {
      state.scanning = false;
      refreshLoose();
      broadcast();
    }
  }

  function json(res, code, body) {
    const s = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
    res.end(s);
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    try {
      if (p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(publicState())}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (p === '/api/state') return json(res, 200, publicState());

      if (p === '/api/scan' && req.method === 'POST') { scan(); return json(res, 200, { ok: true }); }

      if (p === '/api/approve' && req.method === 'POST') {
        const body = await readBody(req);
        const i = state.queue.findIndex(q => q.id === body.id);
        if (i === -1) return json(res, 404, { error: 'proposta não existe mais' });
        const prop = state.queue[i];
        if (body.folder) prop.folder = body.folder;
        if (body.newName) prop.newName = body.newName;
        const result = apply(prop, cfg);
        journal.append({ op: 'decision', of: prop.id, accepted: true, auto: false, edited: !!(body.folder || body.newName) });
        state.queue.splice(i, 1);
        refreshLoose(); broadcast();
        return json(res, 200, result);
      }

      if (p === '/api/reject' && req.method === 'POST') {
        const body = await readBody(req);
        const i = state.queue.findIndex(q => q.id === body.id);
        if (i === -1) return json(res, 404, { error: 'proposta não existe mais' });
        journal.append({ op: 'decision', of: state.queue[i].id, accepted: false,
                         file: state.queue[i].file, rejectedFolder: state.queue[i].folder });
        state.queue.splice(i, 1);
        broadcast();
        return json(res, 200, { ok: true });
      }

      if (p === '/api/undo' && req.method === 'POST') {
        const body = await readBody(req);
        const results = body.today ? undoToday() : undo(body.n || 1);
        journal.reload(); refreshLoose(); broadcast();
        return json(res, 200, { results });
      }

      if (p === '/api/find') {
        const q = url.searchParams.get('q') || '';
        const hits = journal.find(q, 15);
        const spotlight = hits.length < 3 ? mac.mdfind(q, 5) : [];
        return json(res, 200, {
          hits: hits.map(h => ({
            path: h.entry.to, name: path.basename(h.entry.to), oldName: h.entry.fromName,
            category: h.entry.category, score: h.score, exists: h.exists, ts: h.entry.ts,
            source: h.entry.source
          })),
          spotlight
        });
      }

      if (p === '/api/open' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.path) return json(res, 400, { error: 'faltou o caminho' });
        const ok = body.reveal ? mac.revealInFinder(body.path) : mac.openFile(body.path);
        return json(res, 200, { ok });
      }

      if (p === '/api/quit' && req.method === 'POST') {
        json(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 100);
        return;
      }

      // arquivos estáticos da UI
      const file = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      const full = path.join(UI_DIR, file);
      if (!full.startsWith(UI_DIR) || !fs.existsSync(full)) { res.writeHead(404); return res.end('não achei'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(full));
    } catch (e) {
      console.error('[pastinha]', e);
      return json(res, 500, { error: e.message });
    }
  });

  server.on('listening', async () => {
    state.ollama = await ollamaUp(cfg);
    refreshLoose();
    broadcast();
    setInterval(() => { refreshLoose(); broadcast(); }, 5000);
    setInterval(() => scan({ limit: 10 }), 20000);   // a Sentinela, versão v0: pesquisa em vez de FSEvents
  });

  return { server, scan, state };
}
