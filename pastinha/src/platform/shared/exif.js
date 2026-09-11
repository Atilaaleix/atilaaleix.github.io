// EXIF mínimo, em JavaScript puro: fabricante, modelo, data real e se tem GPS.
// Antes vinha do `mdls` do macOS. Agora funciona nos dois sistemas.
// Só o necessário para classificar: "isto é foto de câmera de verdade?" e "de quando?"
import fs from 'node:fs';

const TAGS = { 0x010f: 'Make', 0x0110: 'Model', 0x0132: 'DateTime',
               0x9003: 'DateTimeOriginal', 0x8825: 'GPSPointer', 0x8769: 'ExifPointer' };

/**
 * @param {string} file
 * @returns {{Make?:string, Model?:string, DateTimeOriginal?:Date, hasGPS?:boolean}}
 */
export function readExif(file) {
  /** @type {Buffer} */
  let buf;
  try {
    const fd = fs.openSync(file, 'r');
    buf = Buffer.alloc(128 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    buf = buf.subarray(0, n);
  } catch { return {}; }

  if (buf[0] !== 0xff || buf[1] !== 0xd8) return {};   // só JPEG por enquanto

  // Procura o segmento APP1 que começa com "Exif\0\0"
  let p = 2, tiff = -1;
  while (p + 4 < buf.length) {
    if (buf[p] !== 0xff) break;
    const marker = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.subarray(p + 4, p + 8).toString('latin1') === 'Exif') {
      tiff = p + 10; break;
    }
    if (marker === 0xda) break;                         // começou a imagem
    p += 2 + len;
  }
  if (tiff === -1 || tiff + 8 > buf.length) return {};

  const le = buf.subarray(tiff, tiff + 2).toString('latin1') === 'II';
  const u16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
  const u32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);

  /** @type {Record<string, any>} */
  const out = {};

  function readIFD(offset, depth = 0) {
    if (depth > 2 || offset + 2 > buf.length) return;
    const n = u16(offset);
    if (n > 200) return;
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > buf.length) return;
      const tag = u16(e);
      const name = TAGS[tag];
      if (!name) continue;
      const type = u16(e + 2);
      const count = u32(e + 4);

      if (name === 'GPSPointer') { out.hasGPS = true; continue; }
      if (name === 'ExifPointer') { readIFD(tiff + u32(e + 8), depth + 1); continue; }

      if (type === 2) {                                  // string
        const size = count;
        const valOff = size <= 4 ? e + 8 : tiff + u32(e + 8);
        if (valOff + size > buf.length) continue;
        const v = buf.subarray(valOff, valOff + size).toString('latin1').replace(/\0.*$/, '').trim();
        if (v) out[name] = v;
      }
    }
  }
  readIFD(tiff + u32(tiff + 4));

  const raw = out.DateTimeOriginal || out.DateTime;
  if (raw) {
    // EXIF usa "2026:09:11 14:22:03"
    const m = String(raw).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
      if (!isNaN(d.getTime())) out.DateTimeOriginal = d;
      else delete out.DateTimeOriginal;
    } else delete out.DateTimeOriginal;
  }
  delete out.DateTime;
  delete out.GPSPointer;
  delete out.ExifPointer;
  return out;
}
