// Gera PDF e Office de verdade, em JavaScript puro.
//
// Existe só para a caixa de areia, e vale o custo: sem isto, os arquivos de
// teste são texto com extensão mentirosa, e os extratores nunca são exercitados.
// Com isto, montar a sandbox roda o leitor de zip e o de PDF de ponta a ponta —
// que são exatamente as duas peças que eu não conseguiria testar de outro jeito.
import zlib from 'node:zlib';

const crc32Table = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

/** @param {Buffer} buf */
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Monta um zip com entradas deflate — é o que docx, pptx, xlsx e epub são.
 * @param {Array<[string, string|Buffer]>} entries
 * @returns {Buffer}
 */
export function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // versão necessária
    local.writeUInt16LE(0, 6);       // flags
    local.writeUInt16LE(8, 8);       // método: deflate
    local.writeUInt16LE(0, 10);      // hora
    local.writeUInt16LE(0, 12);      // data
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);      // extra
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);    // extra
    central.writeUInt16LE(0, 32);    // comentário
    central.writeUInt16LE(0, 34);    // disco
    central.writeUInt16LE(0, 36);    // atributos internos
    central.writeUInt32LE(0, 38);    // atributos externos
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, deflated);
    centrals.push(central);
    offset += local.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {string} text */
export function makeDocx(text) {
  const paras = text.split('\n').map(t => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join('');
  return makeZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`]
  ]);
}

/** @param {string[]} slides */
export function makePptx(slides) {
  /** @type {Array<[string, string|Buffer]>} */
  const entries = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>']];
  slides.forEach((text, i) => {
    const body = text.split('\n').map(t => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join('');
    entries.push([`ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`]);
  });
  return makeZip(entries);
}

/** PDF de uma página com o texto num stream deflate — como um PDF real. */
/** @param {string} text */
export function makePdf(text) {
  const lines = text.split('\n').slice(0, 24);
  const ops = ['BT', '/F1 12 Tf', '40 740 Td', '14 TL'];
  for (const l of lines) ops.push(`(${l.replace(/([()\\])/g, '\\$1')}) Tj`, 'T*');
  ops.push('ET');
  const stream = zlib.deflateSync(Buffer.from(ops.join('\n'), 'latin1'));

  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    null,   // o stream entra montado à mão
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ];

  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let pos = parts[0].length;

  objs.forEach((body, i) => {
    const n = i + 1;
    offsets.push(pos);
    let chunk;
    if (body === null) {
      const head = Buffer.from(`${n} 0 obj\n<</Length ${stream.length}/Filter/FlateDecode>>\nstream\n`, 'latin1');
      const tail = Buffer.from('\nendstream\nendobj\n', 'latin1');
      chunk = Buffer.concat([head, stream, tail]);
    } else {
      chunk = Buffer.from(`${n} 0 obj\n${body}\nendobj\n`, 'latin1');
    }
    parts.push(chunk);
    pos += chunk.length;
  });

  const xrefPos = pos;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Imagens sintéticas com dimensões e EXIF controlados.
//
// Não são imagens decodificáveis — são cabeçalhos estruturalmente válidos.
// É exatamente o que precisa ser testado: o Pastinha nunca decodifica pixel,
// ele lê cabeçalho. Uma imagem "de verdade" de 3 MB testaria o decodificador
// de outra pessoa, não o nosso código.
// ---------------------------------------------------------------------------

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** @param {number} w @param {number} h */
export function makePng(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;      // profundidade
  ihdr[9] = 2;      // cor: RGB
  const idat = zlib.deflateSync(Buffer.alloc(16));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/** Monta um bloco EXIF (TIFF little-endian) com fabricante, modelo e data. */
function exifBlock({ make, model, date }) {
  const entries = [];
  const strings = [];
  let stringOffset = 8 + 2 + 3 * 12 + 4;   // cabeçalho + contagem + 3 entradas + próximo IFD

  const addString = (tag, value) => {
    const buf = Buffer.from(value + '\0', 'latin1');
    entries.push({ tag, type: 2, count: buf.length, offset: stringOffset });
    strings.push(buf);
    stringOffset += buf.length;
  };

  addString(0x010f, make);
  addString(0x0110, model);
  addString(0x0132, date);   // "2026:09:11 14:22:03"

  const head = Buffer.alloc(8 + 2 + entries.length * 12 + 4);
  head.write('II', 0, 'latin1');
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(8, 4);              // primeiro IFD logo após o cabeçalho
  head.writeUInt16LE(entries.length, 8);
  entries.forEach((e, i) => {
    const o = 10 + i * 12;
    head.writeUInt16LE(e.tag, o);
    head.writeUInt16LE(e.type, o + 2);
    head.writeUInt32LE(e.count, o + 4);
    head.writeUInt32LE(e.offset, o + 8);
  });
  head.writeUInt32LE(0, 10 + entries.length * 12);   // não há próximo IFD

  return Buffer.concat([head, ...strings]);
}

/**
 * @param {number} w @param {number} h
 * @param {{make:string, model:string, date:string}} [exif]
 */
export function makeJpeg(w, h, exif) {
  const parts = [Buffer.from([0xff, 0xd8])];   // SOI

  if (exif) {
    const tiff = exifBlock(exif);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(payload.length + 2, 2);
    parts.push(app1, payload);
  }

  const sof = Buffer.alloc(4 + 6);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(8 + 3, 2);   // tamanho do segmento: 1 componente
  sof.writeUInt8(8, 4);          // precisão
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof.writeUInt8(1, 9);          // número de componentes
  parts.push(sof, Buffer.from([0x01, 0x11, 0x00]));

  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  parts.push(Buffer.alloc(8));
  parts.push(Buffer.from([0xff, 0xd9]));   // EOI
  return Buffer.concat(parts);
}
