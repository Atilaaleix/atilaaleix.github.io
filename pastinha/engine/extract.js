// Extração de conteúdo. Ordem importa: sempre o caminho mais barato primeiro.
// Nada aqui usa biblioteca externa — só zlib do Node e utilitários do macOS.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as mac from './macos.js';

const TEXTISH = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml',
  '.log', '.srt', '.vtt', '.ics', '.html', '.htm', '.js', '.ts', '.py', '.rb', '.go', '.rs',
  '.c', '.h', '.cpp', '.java', '.swift', '.sh', '.sql', '.css', '.toml', '.ini', '.conf']);

const IMAGES = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp', '.tiff', '.tif', '.bmp']);

export const isImage = ext => IMAGES.has(ext);

/**
 * Extrator de PDF sem dependência: descomprime os streams Flate e puxa o texto
 * dos operadores Tj/TJ. Não cobre todo PDF do mundo — cobre o suficiente para
 * classificar, que é tudo o que precisamos aqui. Só roda se o Spotlight falhar.
 */
function pdfTextFallback(file, maxChars = 4000) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return ''; }
  const out = [];
  let idx = 0, streams = 0;

  while (streams < 12 && out.join('').length < maxChars) {
    const s = buf.indexOf('stream', idx);
    if (s === -1) break;
    const e = buf.indexOf('endstream', s);
    if (e === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;

    const chunk = buf.subarray(start, e);
    idx = e + 9;
    streams++;

    let data;
    try { data = zlib.inflateSync(chunk); }
    catch {
      try { data = zlib.inflateRawSync(chunk); } catch { continue; }
    }

    const text = data.toString('latin1');
    if (!/\bTJ\b|\bTj\b/.test(text)) continue;

    for (const m of text.matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      const piece = m[1]
        .replace(/\\([nrt])/g, (_, c) => ({ n: '\n', r: '', t: ' ' }[c]))
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      if (piece.trim()) out.push(piece);
    }
    out.push('\n');
  }

  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function officeText(file, ext) {
  const entries = {
    '.docx': ['word/document.xml'],
    '.pptx': ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide3.xml'],
    '.xlsx': ['xl/sharedStrings.xml'],
    '.odt':  ['content.xml'],
    '.key':  ['Index/Slide1.iwa'],
    '.pages': ['Index/Document.iwa']
  }[ext];
  if (!entries) return '';
  const parts = [];
  for (const entry of entries) {
    const xml = mac.unzipEntry(file, entry);
    if (xml) parts.push(mac.stripXml(xml));
  }
  return parts.join('\n').slice(0, 4000);
}

/**
 * Devolve o que dá para saber do conteúdo, e de onde veio esse saber.
 * `needsVision` sinaliza que só um modelo de visão resolve daqui pra frente.
 */
export function extract(file, cfg) {
  const ext = path.extname(file).toLowerCase();
  const result = { text: '', via: 'nenhum', needsVision: false };

  try {
    const st = fs.statSync(file);
    if (st.size === 0) return result;
    if (st.size > cfg.maxFileBytesToRead && !IMAGES.has(ext) && ext !== '.pdf') {
      result.via = 'grande-demais';
      return result;
    }
  } catch { return result; }

  if (TEXTISH.has(ext)) {
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(Math.min(8192, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      result.text = buf.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 4000);
      result.via = 'leitura-direta';
    } catch { /* sem permissão, segue a vida */ }
    return result;
  }

  if (IMAGES.has(ext)) {
    result.needsVision = true;
    const sl = mac.spotlightText(file);       // imagem com OCR já indexado pelo sistema
    if (sl) { result.text = sl.slice(0, 4000); result.via = 'spotlight-ocr'; }
    return result;
  }

  const sl = mac.spotlightText(file);
  if (sl) { result.text = sl.replace(/\s+/g, ' ').slice(0, 4000); result.via = 'spotlight'; return result; }

  if (['.docx', '.pptx', '.xlsx', '.odt', '.key', '.pages'].includes(ext)) {
    const t = officeText(file, ext);
    if (t) { result.text = t; result.via = 'unzip-xml'; return result; }
  }

  if (['.doc', '.rtf', '.rtfd', '.html', '.htm', '.webarchive'].includes(ext)) {
    const t = mac.textutilToText(file);
    if (t) { result.text = t.replace(/\s+/g, ' ').slice(0, 4000); result.via = 'textutil'; return result; }
  }

  if (ext === '.pdf') {
    const t = pdfTextFallback(file);
    if (t) { result.text = t; result.via = 'pdf-inflate'; return result; }
    result.needsVision = true;                // PDF escaneado: é imagem disfarçada
    result.via = 'pdf-sem-texto';
    return result;
  }

  return result;
}
