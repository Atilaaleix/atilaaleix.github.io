// Tudo o que o macOS já sabe sobre um arquivo, sem instalar nada.
// Esta é a camada de sinais grátis: mdls, xattr, file, textutil, sips, unzip, lsof.
// Nenhum shell — execFileSync com argumentos separados, então nome de arquivo
// com aspas, espaço ou ponto-e-vírgula não vira injeção.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const IS_MAC = process.platform === 'darwin';

function run(cmd, args, { timeout = 8000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  try {
    return execFileSync(cmd, args, { timeout, maxBuffer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function has(cmd) {
  return !!run('/usr/bin/which', [cmd]);
}

/** mdls devolve "(null)" quando não sabe. Normaliza para null. */
function mdls(file, attr) {
  if (!IS_MAC) return null;
  const out = run('/usr/bin/mdls', ['-name', attr, '-raw', file]);
  if (out == null) return null;
  const v = out.trim();
  return (!v || v === '(null)') ? null : v;
}

/**
 * O sinal mais subestimado do macOS: a URL de onde o arquivo foi baixado.
 * Resolve sozinho uma fatia enorme da classificação, com zero inferência.
 */
export function whereFroms(file) {
  const raw = mdls(file, 'kMDItemWhereFroms');
  if (!raw) return [];
  const urls = [...raw.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(Boolean);
  if (urls.length) return urls;
  return raw.startsWith('http') ? [raw] : [];
}

export function downloadedDate(file) {
  const v = mdls(file, 'kMDItemDownloadedDate');
  return v ? new Date(v.replace(' +0000', 'Z').replace(' ', 'T')) : null;
}

/** Texto que o Spotlight já extraiu. Quando funciona, é de graça e instantâneo. */
export function spotlightText(file) {
  const v = mdls(file, 'kMDItemTextContent');
  return v && v.length > 20 ? v : null;
}

export function spotlightMeta(file) {
  if (!IS_MAC) return {};
  const attrs = ['kMDItemContentType', 'kMDItemContentCreationDate', 'kMDItemAcquisitionModel',
                 'kMDItemLatitude', 'kMDItemDisplayName', 'kMDItemTitle', 'kMDItemAuthors',
                 'kMDItemNumberOfPages', 'kMDItemPixelWidth'];
  const out = run('/usr/bin/mdls', [...attrs.flatMap(a => ['-name', a]), file]);
  if (!out) return {};
  const meta = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^(kMDItem\w+)\s+=\s+(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^"|"$/g, '');
    if (v === '(null)') continue;
    meta[m[1].replace('kMDItem', '')] = v;
  }
  return meta;
}

/** Tipo real pelos bytes iniciais, não pela extensão mentirosa. */
export function mimeType(file) {
  const out = run('/usr/bin/file', ['-b', '--mime-type', file]);
  return out ? out.trim() : null;
}

/** Alguém está com o arquivo aberto? Então não encoste nele. */
export function isBusy(file) {
  if (!IS_MAC) return false;
  const out = run('/usr/sbin/lsof', ['-t', '--', file], { timeout: 4000 });
  return !!(out && out.trim());
}

/** textutil converte doc/docx/rtf/html para texto puro. Vem no sistema. */
export function textutilToText(file) {
  if (!IS_MAC) return null;
  const out = run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', file], { timeout: 15000 });
  return out && out.trim().length > 20 ? out : null;
}

/** unzip -p: docx, pptx e xlsx são zip com XML dentro. */
export function unzipEntry(file, entry) {
  const out = run('/usr/bin/unzip', ['-p', file, entry], { timeout: 15000 });
  return out || null;
}

export function stripXml(xml) {
  if (!xml) return '';
  return xml
    .replace(/<\/w:p>|<\/a:p>|<\/text:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Miniatura em base64 para mandar ao modelo de visão sem estourar memória. */
export function thumbnailBase64(file, px = 640) {
  if (!IS_MAC) return null;
  const tmp = path.join('/tmp', `pastinha-${process.pid}-${Date.now()}.jpg`);
  const ok = run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', String(px), file, '--out', tmp], { timeout: 20000 });
  if (ok == null || !fs.existsSync(tmp)) return null;
  try {
    const b64 = fs.readFileSync(tmp).toString('base64');
    return b64;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* já foi */ }
  }
}

/** Abre no app padrão — é assim que o bicho "entrega" o arquivo. */
export function openFile(file) {
  if (!IS_MAC) return false;
  return run('/usr/bin/open', [file]) !== null;
}

export function revealInFinder(file) {
  if (!IS_MAC) return false;
  return run('/usr/bin/open', ['-R', file]) !== null;
}

/** Rede de segurança: se a Memória falhar, o Spotlight ainda acha. */
export function mdfind(query, limit = 20) {
  if (!IS_MAC) return [];
  const out = run('/usr/bin/mdfind', ['-interpret', query], { timeout: 10000 });
  return out ? out.split('\n').filter(Boolean).slice(0, limit) : [];
}

export function fullDiskAccessLooksGranted(home) {
  try {
    fs.readdirSync(path.join(home, 'Downloads'));
    return true;
  } catch { return false; }
}
