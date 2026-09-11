// Texto de PDF sem dependência: descomprime os streams Flate e puxa o que
// está nos operadores de texto. Não cobre todo PDF do mundo — cobre o suficiente
// para classificar, que é tudo o que precisamos. Funciona nos dois sistemas.
import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * @param {string} file
 * @param {number} maxChars
 * @returns {string}
 */
export function pdfText(file, maxChars = 4000) {
  /** @type {Buffer} */
  let buf;
  try { buf = fs.readFileSync(file); } catch { return ''; }

  const out = [];
  let idx = 0, streams = 0, chars = 0;

  while (streams < 14 && chars < maxChars) {
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
    if (chunk.length > 4 * 1024 * 1024) continue;

    let data;
    try { data = zlib.inflateSync(chunk); }
    catch { try { data = zlib.inflateRawSync(chunk); } catch { continue; } }

    const text = data.toString('latin1');
    if (!/\bTJ\b|\bTj\b/.test(text)) continue;

    for (const m of text.matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      const piece = m[1]
        .replace(/\\([nrt])/g, (_, c) => ({ n: '\n', r: '', t: ' ' }[c]))
        .replace(/\\([()\\])/g, '$1')
        .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      if (piece.trim()) { out.push(piece); chars += piece.length; }
    }
    out.push('\n');
  }
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}
