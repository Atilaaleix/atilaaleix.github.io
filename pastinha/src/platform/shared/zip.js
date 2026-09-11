// Leitor mínimo de zip, em JavaScript puro.
// Antes isto era `unzip -p`, que não existe no Windows. Como docx, pptx, xlsx e
// epub são todos zip com XML dentro, isto destrava o Office nos dois sistemas.
import fs from 'node:fs';
import zlib from 'node:zlib';

const EOCD = 0x06054b50;   // fim do diretório central
const CEN  = 0x02014b50;   // entrada do diretório central

/**
 * Lê UMA entrada nomeada de dentro de um zip.
 * @param {string} file caminho do zip
 * @param {string} entryName ex: "word/document.xml"
 * @returns {Buffer|null}
 */
export function readEntry(file, entryName) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 22) return null;

  // O fim do diretório central fica no fim do arquivo, depois de um comentário
  // de tamanho variável. Procura de trás pra frente.
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd === -1) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CEN) return null;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');

    if (name === entryName) {
      // O cabeçalho local tem tamanhos próprios de nome e extra, que podem
      // diferir do diretório central. Tem que reler daqui.
      if (localOff + 30 > buf.length) return null;
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      try {
        if (method === 0) return Buffer.from(data);          // sem compressão
        if (method === 8) return zlib.inflateRawSync(data);  // deflate
      } catch { return null; }
      return null;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Lista os nomes das entradas. Útil para descobrir quantos slides um pptx tem. */
export function listEntries(file, limit = 400) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return []; }
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd === -1) return [];
  const count = Math.min(buf.readUInt16LE(eocd + 10), limit);
  let off = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CEN) break;
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.subarray(off + 46, off + 46 + nameLen).toString('utf8'));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

export function stripXml(xml) {
  if (!xml) return '';
  return String(xml)
    .replace(/<\/w:p>|<\/a:p>|<\/text:p>|<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
