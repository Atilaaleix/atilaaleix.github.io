// Dimensões de imagem a partir do cabeçalho, em JavaScript puro.
//
// Existe por um motivo específico: imagem é o caso mais difícil da classificação.
// Um .png não diz nada sobre si. Mas o TAMANHO diz muita coisa — 2560x1440 é
// captura de tela, 1:1 é rede social, proporção A4 é documento escaneado.
// É o sinal grátis mais forte que sobra quando não há EXIF nem nome útil.
import fs from 'node:fs';

/**
 * @param {string} file
 * @returns {{w:number, h:number}|null}
 */
export function imageSize(file) {
  /** @type {Buffer} */
  let b;
  try {
    const fd = fs.openSync(file, 'r');
    b = Buffer.alloc(65536);
    const n = fs.readSync(fd, b, 0, b.length, 0);
    fs.closeSync(fd);
    b = b.subarray(0, n);
  } catch { return null; }
  if (b.length < 24) return null;

  // PNG: largura e altura ficam no IHDR, sempre nos mesmos bytes.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }

  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  }

  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) {
    return { w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)) };
  }

  // WEBP (só o caso VP8X/VP8L/VP8 simples)
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') {
    const fmt = b.subarray(12, 16).toString();
    if (fmt === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // JPEG: tem que caminhar pelos segmentos até achar um SOF.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const marker = b[p + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
      if (marker === 0xda || marker === 0xd9) break;          // começou a imagem
      const len = b.readUInt16BE(p + 2);
      // SOF0..SOF15, menos os marcadores que não são de quadro
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: b.readUInt16BE(p + 5), w: b.readUInt16BE(p + 7) };
      }
      p += 2 + len;
    }
    return null;
  }

  return null;
}

/** Resoluções de tela comuns — captura de tela cai exatamente numa delas. */
const SCREENS = [
  [1280, 800], [1440, 900], [1512, 982], [1680, 1050], [1728, 1117], [1920, 1080],
  [2056, 1329], [2560, 1440], [2560, 1600], [2880, 1800], [3024, 1964], [3456, 2234],
  [3840, 2160], [1179, 2556], [1290, 2796], [1170, 2532], [1284, 2778], [828, 1792],
  [750, 1334], [1125, 2436], [2048, 1536], [2224, 1668], [2388, 1668], [2732, 2048]
];

/**
 * Traduz dimensões em uma pista de conteúdo. Sem modelo, sem ler um pixel.
 * @param {{w:number,h:number}|null} size
 * @param {string} mime
 * @returns {{hint:string, confidence:number, note:string}|null}
 */
export function shapeHint(size, mime) {
  if (!size || !size.w || !size.h) return null;
  const { w, h } = size;
  const ratio = w / h;
  const isPng = /png/.test(mime || '');

  for (const [sw, sh] of SCREENS) {
    // Retina dobra tudo; margem de 2px cobre recorte de barra de menu.
    for (const mult of [1, 2]) {
      if (Math.abs(w - sw * mult) <= 2 && Math.abs(h - sh * mult) <= 2) {
        return { hint: 'captura', confidence: 0.82,
                 note: `${w}x${h} é resolução de tela exata` };
      }
    }
  }

  // Quadrado em potencia de dois e textura, nao post de rede social. Toda
  // pipeline 3D e de jogo exporta assim, e nenhum feed usa 2048x2048.
  // Foi a medicao que obrigou esta distincao: sem ela, textura virava "social".
  const potenciaDeDois = n => n >= 256 && (n & (n - 1)) === 0;
  if (w === h && potenciaDeDois(w)) {
    return { hint: 'textura', confidence: 0.72, note: `${w}x${w}, potencia de dois` };
  }

  // Proporcao de folha. O formato separa os dois casos: documento escaneado sai
  // em JPEG de scanner ou camera; arte para impressao sai em PNG grande.
  if (ratio > 0.66 && ratio < 0.78 && Math.min(w, h) > 700) {
    if (isPng && Math.min(w, h) >= 2000) {
      return { hint: 'arte-impressao', confidence: 0.58, note: `PNG em proporcao de folha, ${w}x${h}` };
    }
    if (!isPng) {
      return { hint: 'documento', confidence: 0.62, note: `proporcao de folha (${ratio.toFixed(2)})` };
    }
  }

  // Quadrado fora de potencia de dois: ai sim e rede social ou avatar.
  if (w === h && w >= 400) {
    return { hint: 'social', confidence: 0.55, note: 'quadrado exato' };
  }

  // Muito largo: banner, capa, arte de cabecalho.
  if (ratio >= 2.4 && w >= 1200) {
    return { hint: 'arte', confidence: 0.58, note: `muito largo (${ratio.toFixed(1)}:1)` };
  }

  // Proporcao classica de camera, em JPEG grande: foto.
  if (!isPng && Math.abs(ratio - 4 / 3) < 0.04 && Math.max(w, h) >= 1600) {
    return { hint: 'foto', confidence: 0.55, note: '4:3 de camera' };
  }
  if (!isPng && Math.abs(ratio - 3 / 2) < 0.04 && Math.max(w, h) >= 1600) {
    return { hint: 'foto', confidence: 0.55, note: '3:2 de camera' };
  }

  // PNG pequeno é quase sempre recorte de interface, ícone ou logo.
  if (isPng && Math.max(w, h) < 600) {
    return { hint: 'recorte', confidence: 0.5, note: 'PNG pequeno' };
  }

  return null;
}
