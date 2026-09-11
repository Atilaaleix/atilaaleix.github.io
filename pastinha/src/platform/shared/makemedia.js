// Gera MP4 e WAV com duracao e resolucao de verdade, so no cabecalho.
//
// Existe pelo mesmo motivo que make.js: sem isto, os arquivos de teste sao
// stubs de 12 bytes e o detector de B-roll nunca e exercitado. Um .mov de
// verdade de 6 segundos teria 300 MB; o que o Pastinha le sao os 200 bytes do
// comeco. Entao e exatamente isso que a gente gera.
import zlib from 'node:zlib';

function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
}

/**
 * MP4 minimo com moov: mvhd (duracao) + uma ou duas trak (dimensoes, audio).
 * @param {{durationSec:number, w:number, h:number, audio?:boolean, mbps?:number}} opts
 */
export function makeMp4({ durationSec, w, h, audio = true, mbps = 20 }) {
  const timescale = 1000;
  const dur = Math.round(durationSec * timescale);

  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(0, 0);              // versao 0 + flags
  mvhd.writeUInt32BE(0, 4);              // criacao
  mvhd.writeUInt32BE(0, 8);              // modificacao
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(dur, 16);
  mvhd.writeUInt32BE(0x00010000, 20);    // taxa
  mvhd.writeUInt16BE(0x0100, 24);        // volume

  function trak(isVideo) {
    const tkhd = Buffer.alloc(84);
    tkhd.writeUInt32BE(0x00000007, 0);   // versao 0, habilitada
    tkhd.writeUInt32BE(dur, 20);
    if (isVideo) {
      tkhd.writeUInt32BE(w * 65536, 76);
      tkhd.writeUInt32BE(h * 65536, 80);
    }
    const hdlr = Buffer.concat([
      Buffer.alloc(8),
      Buffer.from(isVideo ? 'vide' : 'soun', 'latin1'),
      Buffer.alloc(12),
      Buffer.from('handler\0', 'latin1')
    ]);
    return box('trak', Buffer.concat([box('tkhd', tkhd), box('mdia', box('hdlr', hdlr))]));
  }

  const traks = [trak(true)];
  if (audio) traks.push(trak(false));
  const moov = box('moov', Buffer.concat([box('mvhd', mvhd), ...traks]));
  const ftyp = box('ftyp', Buffer.concat([
    Buffer.from('isom', 'latin1'),
    Buffer.alloc(4),
    Buffer.from('isomiso2avc1mp41', 'latin1')
  ]));

  // O tamanho e o que da a taxa de bits, e a taxa separa original de camera de
  // arquivo exportado. Um mdat de verdade tem gigabytes; aqui declaramos o
  // tamanho no cabecalho e enchemos so um pedaco.
  const bytesAlvo = Math.round((mbps * 1e6 * durationSec) / 8);
  const mdatHead = Buffer.alloc(8);
  mdatHead.writeUInt32BE(Math.min(bytesAlvo, 0x7fffffff), 0);
  mdatHead.write('mdat', 4, 'latin1');

  return { buf: Buffer.concat([ftyp, moov, mdatHead, Buffer.alloc(64)]), bytesDeclarados: bytesAlvo };
}

/**
 * WAV minimo: cabecalho RIFF honesto, corpo truncado.
 * @param {{durationSec:number, sampleRate?:number, canais?:number}} opts
 */
export function makeWav({ durationSec, sampleRate = 48000, canais = 2 }) {
  const bits = 24;
  const byteRate = sampleRate * canais * (bits / 8);
  const dataLen = Math.round(byteRate * durationSec);

  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + dataLen, 4);
  head.write('WAVE', 8, 'latin1');
  head.write('fmt ', 12, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);             // PCM
  head.writeUInt16LE(canais, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(byteRate, 28);
  head.writeUInt16LE(canais * (bits / 8), 32);
  head.writeUInt16LE(bits, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(dataLen, 40);

  return Buffer.concat([head, Buffer.alloc(64)]);
}

/** EXR falso: so a assinatura, para o detector de tipo e o nome fazerem o resto. */
export function makeExr() {
  return Buffer.concat([Buffer.from([0x76, 0x2f, 0x31, 0x01, 0x02, 0, 0, 0]), Buffer.alloc(48)]);
}

/** Projeto binario generico (blend, c4d, aep, logicx). */
export function makeProjeto(tag) {
  return Buffer.concat([Buffer.from(tag, 'latin1'), zlib.deflateSync(Buffer.alloc(128))]);
}
