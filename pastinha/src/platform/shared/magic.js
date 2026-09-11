// Tipo real do arquivo pelos bytes iniciais, em JavaScript puro.
// Antes isto era `file --mime-type`, que só existe no Unix. Agora funciona
// nos dois sistemas E é mais rápido, porque não abre um processo por arquivo.
import fs from 'node:fs';
import { listEntries } from './zip.js';

/** @type {Array<{mime:string, ext:string, sig:number[], off?:number, extra?:(b:Buffer)=>boolean}>} */
const SIGS = [
  { mime: 'application/pdf', ext: '.pdf', sig: [0x25, 0x50, 0x44, 0x46] },              // %PDF
  { mime: 'image/png', ext: '.png', sig: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: '.jpg', sig: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', ext: '.gif', sig: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', ext: '.webp', sig: [0x52, 0x49, 0x46, 0x46], extra: b => b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'image/heic', ext: '.heic', sig: [0x66, 0x74, 0x79, 0x70], off: 4 },
  { mime: 'image/tiff', ext: '.tif', sig: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/bmp', ext: '.bmp', sig: [0x42, 0x4d] },
  { mime: 'application/zip', ext: '.zip', sig: [0x50, 0x4b, 0x03, 0x04] },              // e todo office moderno
  { mime: 'application/x-rar', ext: '.rar', sig: [0x52, 0x61, 0x72, 0x21] },
  { mime: 'application/x-7z', ext: '.7z', sig: [0x37, 0x7a, 0xbc, 0xaf] },
  { mime: 'application/gzip', ext: '.gz', sig: [0x1f, 0x8b] },
  { mime: 'application/x-bzip2', ext: '.bz2', sig: [0x42, 0x5a, 0x68] },
  { mime: 'application/x-apple-diskimage', ext: '.dmg', sig: [0x78, 0x01, 0x73, 0x0d] },
  { mime: 'application/vnd.microsoft.portable-executable', ext: '.exe', sig: [0x4d, 0x5a] },
  { mime: 'application/x-msi', ext: '.msi', sig: [0xd0, 0xcf, 0x11, 0xe0] },            // também .doc e .xls antigos
  { mime: 'audio/mpeg', ext: '.mp3', sig: [0x49, 0x44, 0x33] },
  { mime: 'audio/flac', ext: '.flac', sig: [0x66, 0x4c, 0x61, 0x43] },
  { mime: 'video/mp4', ext: '.mp4', sig: [0x66, 0x74, 0x79, 0x70], off: 4,
    extra: b => ['isom', 'mp42', 'mp41', 'avc1', 'M4V '].includes(b.subarray(8, 12).toString()) },
  { mime: 'video/quicktime', ext: '.mov', sig: [0x66, 0x74, 0x79, 0x70], off: 4,
    extra: b => b.subarray(8, 12).toString() === 'qt  ' },
  { mime: 'video/x-matroska', ext: '.mkv', sig: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'font/ttf', ext: '.ttf', sig: [0x00, 0x01, 0x00, 0x00] },
  { mime: 'font/otf', ext: '.otf', sig: [0x4f, 0x54, 0x54, 0x4f] },
  { mime: 'font/woff2', ext: '.woff2', sig: [0x77, 0x4f, 0x46, 0x32] },
  { mime: 'application/x-sqlite3', ext: '.sqlite', sig: [0x53, 0x51, 0x4c, 0x69] },
  { mime: 'application/rtf', ext: '.rtf', sig: [0x7b, 0x5c, 0x72, 0x74] }
];

/**
 * Office moderno é zip com arquivos específicos dentro.
 * Não dá para olhar só a primeira entrada: um docx real começa com
 * "[Content_Types].xml", igualzinho a um xlsx e a um pptx. Tem que ler a lista.
 */
const OOXML = [
  ['word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
];

function zipFlavor(file) {
  const names = listEntries(file, 60);
  if (!names.length) return 'application/zip';
  for (const [entry, mime] of OOXML) if (names.includes(entry)) return mime;
  // Pptx com poucos slides pode não ter presentation.xml no recorte; olha os slides.
  if (names.some(n => n.startsWith('ppt/slides/'))) return OOXML[1][1];
  if (names.some(n => n.startsWith('word/'))) return OOXML[0][1];
  if (names.some(n => n.startsWith('xl/'))) return OOXML[2][1];
  if (names.includes('mimetype') || names.some(n => n.startsWith('OEBPS/'))) return 'application/epub+zip';
  return 'application/zip';
}

/**
 * @param {string} file
 * @returns {string|null} mime type, ou null se não reconhecer
 */
export function sniff(file) {
  /** @type {Buffer} */
  let head;
  try {
    const fd = fs.openSync(file, 'r');
    head = Buffer.alloc(64);
    const n = fs.readSync(fd, head, 0, 64, 0);
    fs.closeSync(fd);
    if (n === 0) return null;
    head = head.subarray(0, n);
  } catch { return null; }

  for (const s of SIGS) {
    const off = s.off || 0;
    if (head.length < off + s.sig.length) continue;
    let match = true;
    for (let i = 0; i < s.sig.length; i++) {
      if (head[off + i] !== s.sig[i]) { match = false; break; }
    }
    if (!match) continue;
    if (s.extra && !s.extra(head)) continue;

    if (s.mime === 'application/zip') return zipFlavor(file);
    return s.mime;
  }

  // Sem assinatura: texto ou binário? Se os primeiros bytes são imprimíveis, é texto.
  const printable = [...head].filter(b => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 160).length;
  return printable / head.length > 0.9 ? 'text/plain' : null;
}
