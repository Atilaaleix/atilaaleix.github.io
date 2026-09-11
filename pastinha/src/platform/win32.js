// Windows. O paralelo mais bonito com o Mac: o mesmo dado existe nos dois,
// com mecanismos completamente diferentes.
//
//   Mac      xattr com.apple.metadata:kMDItemWhereFroms
//   Windows  fluxo alternativo NTFS  arquivo.pdf:Zone.Identifier
//
// Os dois guardam de onde o arquivo foi baixado. O Windows guarda até em texto
// puro, e o Node lê fluxo alternativo abrindo "caminho:Zone.Identifier" direto.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, { timeout = 8000 } = {}) {
  try {
    return execFileSync(cmd, args, { timeout, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch { return null; }
}

/** @type {import('./index.js').Platform} */
export default {
  name: 'win32',
  label: 'Windows',

  whereFroms(file) {
    try {
      const zone = fs.readFileSync(`${file}:Zone.Identifier`, 'utf8');
      const urls = [];
      for (const key of ['ReferrerUrl', 'HostUrl']) {
        const m = zone.match(new RegExp(`^${key}=(.+)$`, 'mi'));
        if (m && m[1].trim()) urls.push(m[1].trim());
      }
      // HostUrl é o arquivo em si, ReferrerUrl é a página. A página classifica melhor.
      return [...new Set(urls)];
    } catch { return []; }
  },

  downloadedDate(file) {
    // Windows não guarda a data do download em lugar nenhum acessível.
    // birthtime é o mais próximo: quando o arquivo apareceu neste disco.
    try {
      const st = fs.statSync(file);
      return st.birthtimeMs ? new Date(st.birthtimeMs) : null;
    } catch { return null; }
  },

  indexedText() {
    // O índice do Windows Search só sai por OLE DB, que não dá para alcançar
    // daqui sem dependência nativa. Os extratores próprios cobrem o que importa.
    return null;
  },

  isBusy(file) {
    // No Windows, um arquivo aberto por outro programa recusa abertura em escrita.
    // É mais confiável que o lsof do Unix e não custa processo nenhum.
    try {
      const fd = fs.openSync(file, 'r+');
      fs.closeSync(fd);
      return false;
    } catch (e) {
      return e && (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES');
    }
  },

  legacyDocText() {
    // Sem equivalente ao textutil. .doc e .rtf antigos ficam sem texto — o
    // classificador cai para nome, origem e extensão, que já resolve a maioria.
    return null;
  },

  imageForVision(file) {
    // Sem redimensionador no sistema. O Ollama aceita a imagem inteira e
    // redimensiona sozinho; só evitamos mandar coisa gigante.
    try {
      const st = fs.statSync(file);
      if (st.size > 8 * 1024 * 1024) return null;
      if (/\.hei[cf]$/i.test(file)) return null;   // HEIC é raro aqui e poucos modelos leem
      return fs.readFileSync(file).toString('base64');
    } catch { return null; }
  },

  open(file) {
    // "start" é comando interno do cmd. O primeiro argumento vazio é o título da
    // janela — sem ele, um caminho com aspas vira o título e nada abre.
    return run(process.env.ComSpec || 'cmd.exe', ['/c', 'start', '', file]) !== null;
  },

  reveal(file) {
    // explorer sempre devolve código de saída 1, mesmo dando certo.
    try {
      execFileSync('explorer.exe', [`/select,${file}`], { timeout: 8000, windowsHide: true });
    } catch { /* esperado */ }
    return true;
  },

  systemSearch() { return []; },

  userFolders() {
    const home = os.homedir();
    // O OneDrive sequestra Desktop e Documents quando está ligado. Se as pastas
    // redirecionadas existirem, são elas que o usuário enxerga.
    const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer;
    const pick = (name) => {
      if (oneDrive) {
        const redirected = path.join(oneDrive, name);
        if (fs.existsSync(redirected)) return redirected;
      }
      return path.join(home, name);
    };
    return {
      home,
      downloads: path.join(home, 'Downloads'),   // Downloads nunca é redirecionado
      desktop: pick('Desktop'),
      documents: pick('Documents')
    };
  },

  forbiddenRoots() {
    const home = os.homedir();
    return [
      process.env.WINDIR || 'C:\\Windows',
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      process.env.ProgramData || 'C:\\ProgramData',
      path.join(home, 'AppData')
    ].filter(Boolean);
  },

  permissionCheck() {
    try {
      fs.readdirSync(path.join(os.homedir(), 'Downloads'));
      return { ok: true, hint: '' };
    } catch {
      return { ok: false, hint: 'Rode o terminal como o seu próprio usuário, não como administrador' };
    }
  }
};
