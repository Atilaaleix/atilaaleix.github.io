// Linux. Não é alvo do produto, mas o motor roda aqui — o que importa porque é
// onde os testes automáticos rodam. Sem esta implementação, nada seria testável
// fora de um Mac.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, { timeout = 8000 } = {}) {
  try {
    return execFileSync(cmd, args, { timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

/** @type {import('./index.js').Platform} */
export default {
  name: 'linux',
  label: 'Linux',

  whereFroms(file) {
    // O padrão freedesktop guarda a origem num xattr de usuário.
    const out = run('getfattr', ['-n', 'user.xdg.origin.url', '--only-values', file]);
    return out && out.startsWith('http') ? [out.trim()] : [];
  },
  downloadedDate(file) {
    try { const st = fs.statSync(file); return st.birthtimeMs ? new Date(st.birthtimeMs) : null; }
    catch { return null; }
  },
  indexedText() { return null; },
  isBusy(file) { const out = run('lsof', ['-t', '--', file], { timeout: 4000 }); return !!(out && out.trim()); },
  legacyDocText() { return null; },
  imageForVision(file) {
    try {
      const st = fs.statSync(file);
      if (st.size > 8 * 1024 * 1024) return null;
      return fs.readFileSync(file).toString('base64');
    } catch { return null; }
  },
  open(file) { return run('xdg-open', [file]) !== null; },
  reveal(file) { return run('xdg-open', [path.dirname(file)]) !== null; },
  systemSearch() { return []; },
  userFolders() {
    const home = os.homedir();
    return { home, downloads: path.join(home, 'Downloads'),
             desktop: path.join(home, 'Desktop'), documents: path.join(home, 'Documents') };
  },
  forbiddenRoots() { return ['/etc', '/usr', '/var', '/boot', '/sys', '/proc']; },
  permissionCheck() { return { ok: true, hint: '' }; }
};
