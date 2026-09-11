// Extração de conteúdo. Ordem importa: sempre o caminho mais barato primeiro.
// Nada aqui sabe em qual sistema está rodando — tudo o que é específico passa
// pelo adaptador de plataforma.
import fs from 'node:fs';
import path from 'node:path';
import platform from '../platform/index.js';
import { readEntry, listEntries, stripXml } from '../platform/shared/zip.js';
import { pdfText } from '../platform/shared/pdf.js';

const TEXTISH = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml',
  '.log', '.srt', '.vtt', '.ics', '.html', '.htm', '.js', '.ts', '.py', '.rb', '.go', '.rs',
  '.c', '.h', '.cpp', '.java', '.swift', '.sh', '.sql', '.css', '.toml', '.ini', '.conf', '.env']);

const IMAGES = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.gif', '.webp', '.tiff', '.tif', '.bmp']);

const LEGACY = new Set(['.doc', '.rtf', '.rtfd', '.webarchive', '.pages', '.key', '.numbers']);

export const isImage = ext => IMAGES.has(ext);

/** Office moderno: zip com XML dentro. Funciona igual nos dois sistemas. */
function officeText(file, ext) {
  const parts = [];

  if (ext === '.docx' || ext === '.odt') {
    const entry = ext === '.docx' ? 'word/document.xml' : 'content.xml';
    const xml = readEntry(file, entry);
    if (xml) parts.push(stripXml(xml.toString('utf8')));
  }

  if (ext === '.pptx') {
    // Pega os primeiros slides de verdade, em vez de chutar nomes.
    const slides = listEntries(file)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => (+a.match(/(\d+)/)[1]) - (+b.match(/(\d+)/)[1]))
      .slice(0, 4);
    for (const s of slides) {
      const xml = readEntry(file, s);
      if (xml) parts.push(stripXml(xml.toString('utf8')));
    }
  }

  if (ext === '.xlsx') {
    const xml = readEntry(file, 'xl/sharedStrings.xml');
    if (xml) parts.push(stripXml(xml.toString('utf8')));
  }

  if (ext === '.epub') {
    const meta = readEntry(file, 'OEBPS/content.opf') || readEntry(file, 'content.opf');
    if (meta) parts.push(stripXml(meta.toString('utf8')));
  }

  return parts.join('\n').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

/**
 * @typedef {object} Extraction
 * @property {string} text
 * @property {string} via  de onde veio o texto — aparece na UI e no bench
 * @property {boolean} needsVision  só um modelo de visão resolve daqui pra frente
 */

/**
 * @param {string} file
 * @param {{maxFileBytesToRead:number}} cfg
 * @returns {Extraction}
 */
export function extract(file, cfg) {
  const ext = path.extname(file).toLowerCase();
  /** @type {Extraction} */
  const result = { text: '', via: 'nenhum', needsVision: false };

  let st;
  try { st = fs.statSync(file); } catch { return result; }
  if (st.size === 0) return result;
  if (st.size > cfg.maxFileBytesToRead && !IMAGES.has(ext) && ext !== '.pdf') {
    result.via = 'grande-demais';
    return result;
  }

  if (TEXTISH.has(ext)) {
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(Math.min(8192, st.size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      result.text = buf.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 4000);
      result.via = 'leitura-direta';
    } catch { /* sem permissão, segue */ }
    return result;
  }

  if (IMAGES.has(ext)) {
    result.needsVision = true;
    const indexed = platform.indexedText(file);   // no Mac, o OCR do Spotlight sai de graça
    if (indexed) { result.text = indexed.slice(0, 4000); result.via = 'ocr-do-sistema'; }
    return result;
  }

  const indexed = platform.indexedText(file);
  if (indexed) {
    result.text = indexed.replace(/\s+/g, ' ').slice(0, 4000);
    result.via = 'indice-do-sistema';
    return result;
  }

  if (['.docx', '.pptx', '.xlsx', '.odt', '.epub'].includes(ext)) {
    const t = officeText(file, ext);
    if (t) { result.text = t; result.via = 'zip-xml'; return result; }
  }

  if (LEGACY.has(ext)) {
    const t = platform.legacyDocText(file);
    if (t) { result.text = t.replace(/\s+/g, ' ').slice(0, 4000); result.via = 'conversor-do-sistema'; return result; }
    result.via = 'formato-antigo-sem-leitor';
    return result;
  }

  if (ext === '.pdf') {
    const t = pdfText(file);
    if (t) { result.text = t; result.via = 'pdf-inflate'; return result; }
    result.needsVision = true;      // PDF escaneado é imagem disfarçada
    result.via = 'pdf-sem-texto';
    return result;
  }

  return result;
}
