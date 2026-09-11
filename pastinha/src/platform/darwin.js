// macOS. Tudo aqui é utilitário que já vem no sistema — nada para instalar.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, { timeout = 8000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  try {
    return execFileSync(cmd, args, { timeout, maxBuffer, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

function mdls(file, attr) {
  const out = run('/usr/bin/mdls', ['-name', attr, '-raw', file]);
  if (out == null) return null;
  const v = out.trim();
  return (!v || v === '(null)') ? null : v;
}

/** @type {import('./index.js').Platform} */
export default {
  name: 'darwin',
  label: 'macOS',

  whereFroms(file) {
    const raw = mdls(file, 'kMDItemWhereFroms');
    if (!raw) return [];
    const urls = [...raw.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(Boolean);
    if (urls.length) return urls;
    return raw.startsWith('http') ? [raw] : [];
  },

  downloadedDate(file) {
    const v = mdls(file, 'kMDItemDownloadedDate');
    if (!v) return null;
    const d = new Date(v.replace(' +0000', 'Z').replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  },

  indexedText(file) {
    const v = mdls(file, 'kMDItemTextContent');
    return v && v.length > 20 ? v : null;
  },

  isBusy(file) {
    const out = run('/usr/sbin/lsof', ['-t', '--', file], { timeout: 4000 });
    return !!(out && out.trim());
  },

  legacyDocText(file) {
    const out = run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', file], { timeout: 15000 });
    return out && out.trim().length > 20 ? out : null;
  },

  imageForVision(file) {
    // sips converte HEIC (que quase nenhum modelo entende) e reduz o tamanho.
    const tmp = path.join(os.tmpdir(), `pastinha-${process.pid}-${Date.now()}.jpg`);
    const ok = run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '640', file, '--out', tmp],
                   { timeout: 20000 });
    if (ok == null || !fs.existsSync(tmp)) return null;
    try { return fs.readFileSync(tmp).toString('base64'); }
    finally { try { fs.unlinkSync(tmp); } catch { /* já foi */ } }
  },

  open(file) { return run('/usr/bin/open', [file]) !== null; },
  reveal(file) { return run('/usr/bin/open', ['-R', file]) !== null; },

  systemSearch(q, n = 20) {
    const out = run('/usr/bin/mdfind', ['-interpret', q], { timeout: 10000 });
    return out ? out.split('\n').filter(Boolean).slice(0, n) : [];
  },

  userFolders() {
    const home = os.homedir();
    return {
      home,
      downloads: path.join(home, 'Downloads'),
      desktop: path.join(home, 'Desktop'),
      documents: path.join(home, 'Documents')
    };
  },

  forbiddenRoots() {
    const home = os.homedir();
    return [path.join(home, 'Library'), '/System', '/Library', '/Applications',
            '/private', path.join(home, '.Trash')];
  },

  permissionCheck() {
    try {
      fs.readdirSync(path.join(os.homedir(), 'Downloads'));
      return { ok: true, hint: '' };
    } catch {
      return { ok: false,
        hint: 'Ajustes do Sistema > Privacidade e Segurança > Acesso Total ao Disco, e adicione o Terminal' };
    }
  }
};
