// Duração, resolução e canais de áudio direto do cabeçalho. JavaScript puro.
//
// É o sinal que separa coisas que nenhuma extensão separa:
//   um .mov de 6 segundos em 4K, sem áudio  -> B-roll
//   um .mov de 12 minutos em 1080p com áudio -> vídeo pronto
//   um .mov com a resolução exata do monitor -> gravação de tela
//   um .wav de 2 segundos  -> efeito sonoro
//   um .wav de 48 minutos  -> entrevista, podcast, captação
//
// Tudo isso sem decodificar um único quadro e sem modelo nenhum.
import fs from 'node:fs';

function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, pos);
  return buf.subarray(0, n);
}

/**
 * MP4 e MOV são caixas aninhadas. A `moov` tem a duração e as dimensões.
 * Arquivo de câmera costuma guardar a `moov` no FIM (sem faststart), então
 * procura na frente e, se não achar, no rabo.
 * @param {string} file
 * @returns {{durationSec:number|null, w:number|null, h:number|null, temAudio:boolean, trilhas:number}|null}
 */
export function mp4Info(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 32) return null;

    // 1. varre as caixas de topo para achar onde a moov começa
    let moovPos = -1, moovLen = 0, pos = 0;
    for (let i = 0; i < 40 && pos < size - 8; i++) {
      const head = readAt(fd, pos, 16);
      if (head.length < 8) break;
      let boxLen = head.readUInt32BE(0);
      const type = head.subarray(4, 8).toString('latin1');
      if (boxLen === 1) {
        // tamanho de 64 bits
        boxLen = Number(head.readBigUInt64BE(8));
      } else if (boxLen === 0) {
        boxLen = size - pos;
      }
      if (boxLen < 8) break;
      if (type === 'moov') { moovPos = pos; moovLen = Math.min(boxLen, 4 * 1024 * 1024); break; }
      if (!/^[a-zA-Z0-9 ]{4}$/.test(type)) break;   // não é mp4/mov
      pos += boxLen;
    }

    // 2. não estava na frente: procura o marcador no último pedaço
    let moov;
    if (moovPos >= 0) {
      moov = readAt(fd, moovPos, moovLen);
    } else {
      const tailLen = Math.min(size, 4 * 1024 * 1024);
      const tail = readAt(fd, size - tailLen, tailLen);
      const idx = tail.lastIndexOf('moov');
      if (idx < 4) return null;
      moov = tail.subarray(idx - 4);
    }
    if (!moov || moov.length < 20) return null;

    // mvhd: o corpo comeca 4 bytes depois do nome da caixa. Versao 0 guarda
    // criacao e modificacao em 32 bits; versao 1, em 64. A escala e a duracao
    // vem logo depois das duas.
    let durationSec = null;
    const mvhd = moov.indexOf('mvhd');
    if (mvhd > 0) {
      const corpo = mvhd + 4;
      const v = moov[corpo];
      const offTimescale = corpo + (v === 1 ? 20 : 12);
      const offDur = offTimescale + 4;
      const precisa = offDur + (v === 1 ? 8 : 4);
      if (precisa <= moov.length) {
        const timescale = moov.readUInt32BE(offTimescale);
        const dur = v === 1 ? Number(moov.readBigUInt64BE(offDur)) : moov.readUInt32BE(offDur);
        if (timescale > 0 && dur > 0 && dur < 2 ** 53) durationSec = dur / timescale;
      }
    }

    // tkhd: largura e altura ficam no fim, em ponto fixo 16.16
    let w = null, h = null, trilhas = 0, temAudio = false;
    let from = 0;
    while (true) {
      const idx = moov.indexOf('tkhd', from);
      if (idx === -1) break;
      trilhas++;
      const v = moov[idx + 4];
      // Largura e altura sao os ultimos 8 bytes do corpo: 84 na versao 0,
      // 96 na versao 1. Em ponto fixo 16.16.
      const end = idx + 4 + (v === 1 ? 96 : 84);
      if (end <= moov.length) {
        const tw = moov.readUInt32BE(end - 8) / 65536;
        const th = moov.readUInt32BE(end - 4) / 65536;
        if (tw > 1 && th > 1) { w = Math.round(tw); h = Math.round(th); }
      }
      from = idx + 4;
    }
    temAudio = moov.includes('soun');

    if (durationSec == null && w == null) return null;
    return { durationSec, w, h, temAudio, trilhas };
  } catch {
    return null;
  } finally {
    try { fs.closeSync(fd); } catch { /* já fechado */ }
  }
}

/**
 * WAV é RIFF: o bloco `fmt ` traz taxa e canais, o `data` traz o tamanho.
 * @param {string} file
 * @returns {{durationSec:number|null, sampleRate:number|null, canais:number|null}|null}
 */
export function wavInfo(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const head = readAt(fd, 0, 4096);
    if (head.subarray(0, 4).toString() !== 'RIFF' || head.subarray(8, 12).toString() !== 'WAVE') return null;

    let pos = 12, sampleRate = null, canais = null, byteRate = null, dataLen = null;
    while (pos + 8 <= head.length) {
      const id = head.subarray(pos, pos + 4).toString('latin1');
      const len = head.readUInt32LE(pos + 4);
      if (id === 'fmt ' && pos + 8 + 16 <= head.length) {
        canais = head.readUInt16LE(pos + 10);
        sampleRate = head.readUInt32LE(pos + 12);
        byteRate = head.readUInt32LE(pos + 16);
      }
      if (id === 'data') { dataLen = len; break; }
      if (len <= 0) break;
      pos += 8 + len + (len % 2);
    }
    if (!byteRate) return null;
    // O cabecalho declara o tamanho do bloco de audio, e e nele que se confia:
    // e o que todo WAV real traz. So se ele faltar e que o tamanho do arquivo
    // serve de estimativa.
    const bytes = dataLen && dataLen > 0 ? dataLen : Math.max(0, fs.fstatSync(fd).size - 44);
    return { durationSec: bytes / byteRate, sampleRate, canais };
  } catch {
    return null;
  } finally {
    try { fs.closeSync(fd); } catch { /* já fechado */ }
  }
}

const TELAS_VIDEO = new Set(['1920x1080', '2560x1440', '3024x1964', '1512x982', '2880x1800',
                             '3456x2234', '1728x1117', '1440x900', '3840x2160']);

/**
 * Traduz duração e resolução em uma pista de intenção. Zero modelo.
 * @param {{durationSec:number|null, w:number|null, h:number|null, temAudio:boolean}|null} info
 * @param {number} bytes
 * @returns {{hint:string, confidence:number, note:string}|null}
 */
export function videoHint(info, bytes) {
  if (!info) return null;
  const { durationSec: d, w, h, temAudio } = info;
  const res = w && h ? `${w}x${h}` : null;
  const min = d ? d / 60 : null;
  // Taxa de bits separa original de câmera (alta) de arquivo exportado ou baixado.
  const mbps = d && d > 0 ? (bytes * 8) / d / 1e6 : null;

  if (res && TELAS_VIDEO.has(res) && !temAudio && min !== null && min > 0.5 && mbps !== null && mbps < 12) {
    return { hint: 'gravacao-tela', confidence: 0.72, note: `${res} de monitor, sem áudio` };
  }
  if (d !== null && d < 45 && !temAudio && (w || 0) >= 1920) {
    return { hint: 'broll', confidence: 0.8,
             note: `${Math.round(d)}s em ${res}, sem trilha de áudio` };
  }
  if (d !== null && d < 90 && mbps !== null && mbps > 60) {
    return { hint: 'broll', confidence: 0.75, note: `${Math.round(d)}s a ${mbps.toFixed(0)} Mbps — original de câmera` };
  }
  // Duracao longa vem antes: uma live de 90 minutos tem a mesma taxa de bits de
  // um video exportado, e so o tempo separa os dois.
  if (min !== null && min > 20) {
    return { hint: 'gravacao-longa', confidence: 0.7, note: `${min.toFixed(0)} minutos` };
  }
  if (min !== null && min > 2 && temAudio && mbps !== null && mbps < 25) {
    return { hint: 'video-entrega', confidence: 0.7, note: `${min.toFixed(0)} min a ${mbps.toFixed(0)} Mbps, ja exportado` };
  }
  return null;
}

/**
 * @param {{durationSec:number|null, sampleRate:number|null, canais:number|null}|null} info
 */
export function audioHint(info) {
  if (!info || info.durationSec == null) return null;
  const d = info.durationSec;
  if (d < 8) return { hint: 'efeito-sonoro', confidence: 0.75, note: `${d.toFixed(1)}s` };
  if (d > 15 * 60) return { hint: 'gravacao-longa', confidence: 0.75, note: `${(d / 60).toFixed(0)} minutos` };
  if (d > 60 && d < 10 * 60) return { hint: 'trilha', confidence: 0.6, note: `${(d / 60).toFixed(1)} min` };
  return null;
}
