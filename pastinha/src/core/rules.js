// O classificador determinístico.
//
// SEPARAÇÃO QUE O TESTE EM MASSA OBRIGOU A FAZER. Antes, uma regra dizia
// "boleto -> Financeiro/Contas", misturando duas perguntas completamente
// diferentes:
//
//   1. O QUE este arquivo é?      universal. boleto é boleto no disco de todo mundo.
//   2. ONDE ele deve ficar?       pessoal. depende da estrutura DAQUELE usuário.
//
// Com as duas juntas, o classificador acertava 91% num disco comum e 5% no disco
// de um fotógrafo — porque nenhuma regra genérica vai adivinhar
// "Ensaios/2026/03-casamento-silva/RAW".
//
// Então as regras daqui para frente respondem SÓ a primeira pergunta: devolvem um
// TIPO. O mapa de tipo para pasta vive em presets.js, é dado, e muda por perfil.
import path from 'node:path';

/**
 * Domínio de origem -> categoria. A tabela mais barata e mais eficaz do sistema.
 * @type {Array<[RegExp, string]>}
 */
const DOMAIN_MAP = [
  [/(^|\.)gov\.br$|receita\.fazenda|nfe\.fazenda|detran|inss|esocial/i, 'doc-governo'],
  [/nubank|itau|bradesco|santander|bancodobrasil|bb\.com\.br|caixa\.gov|inter\.co|c6bank|btgpactual|xpi\.com|binance|mercadopago/i, 'financeiro'],
  [/figma\.com|sketch\.com|dribbble|behance|unsplash|pexels|freepik/i, 'referencia'],
  [/fonts\.google|fontshare|myfonts/i, 'fonte'],
  [/github|gitlab|bitbucket|npmjs|pypi|stackoverflow|developer\.apple|docker/i, 'doc-tecnica'],
  [/arxiv|scholar\.google|sciencedirect|jstor|springer|nature\.com|pubmed|ieee/i, 'artigo'],
  [/linkedin|glassdoor|gupy|catho|indeed/i, 'carreira'],
  [/youtube|vimeo|twitch/i, 'video-baixado'],
  [/spotify|soundcloud|bandcamp/i, 'trilha'],
  [/booking|airbnb|latam|gol\.com|azul|decolar|kayak|expedia/i, 'viagem'],
  [/amazon|mercadolivre|shopee|aliexpress|magazineluiza|americanas|kabum/i, 'compra'],
  [/notion|docs\.google|drive\.google|dropbox|sharepoint|onedrive/i, 'trabalho'],
  [/whatsapp|web\.whatsapp/i, 'foto-whatsapp']
];

/** @type {Array<[string[], string, number]>} */
const EXT_MAP = [
  [['.dmg', '.pkg', '.mpkg', '.exe', '.msi', '.ipa', '.apk', '.appimage'], 'instalador', 0.96],
  [['.torrent'], 'torrent', 0.95],
  [['.fig', '.sketch', '.xd', '.psd', '.ai', '.indd', '.afdesign', '.afphoto'], 'arquivo-design', 0.93],
  [['.ttf', '.otf', '.woff', '.woff2'], 'fonte', 0.96],
  [['.srt', '.vtt', '.ass', '.sub'], 'legenda', 0.94],
  [['.epub', '.mobi', '.azw3'], 'livro', 0.95],
  [['.cr2', '.cr3', '.nef', '.arw', '.raf', '.dng', '.orf', '.rw2', '.braw', '.r3d'], 'raw', 0.97],
  [['.xmp', '.lrcat', '.lrtemplate'], 'sidecar', 0.95],
  [['.prproj', '.drp', '.aep', '.fcpbundle', '.veg', '.kdenlive'], 'projeto-edicao', 0.96],
  [['.cube', '.look', '.3dl'], 'lut', 0.96],
  [['.mp3', '.wav', '.flac', '.aac', '.m4a', '.aiff', '.ogg'], 'audio', 0.85],
  [['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.mxf'], 'video', 0.82],
  [['.ics'], 'calendario', 0.9],
  [['.sql', '.db', '.sqlite'], 'dados', 0.85],
  [['.pem', '.key', '.p12', '.keystore', '.mobileprovision'], 'credencial', 0.94],
  [['.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.swift', '.java', '.kt', '.rb', '.php', '.ipynb'], 'codigo', 0.9],
  [['.iso', '.img'], 'imagem-disco', 0.9],
  [['.stl', '.obj', '.3mf', '.gcode'], 'modelo-3d', 0.92],
  [['.zip', '.rar', '.7z', '.tar', '.gz'], 'arquivo-comprimido', 0.7]
];

/**
 * Padrões de nome. Cobre PT e EN porque o sistema do usuário pode estar em qualquer um.
 * contentSafe:false = só faz sentido no nome, nunca dentro do texto.
 * @type {Array<{re:RegExp, tipo:string, conf:number, name?:string, contentSafe?:boolean}>}
 */
const NAME_RULES = [
  { re: /^(screenshot|captura de tela|screen shot|cleanshot)/i, tipo: 'captura', conf: 0.96, name: 'captura-de-tela', contentSafe: false },
  { re: /^(img|dsc|dscn|dscf|p\d{7}|gopro|pxl|gx\d{6})[_-]?\d{3,}/i, tipo: 'foto-camera', conf: 0.9, contentSafe: false },
  { re: /^(whatsapp|whats)[ _-]?(image|video|audio|ptt)/i, tipo: 'foto-whatsapp', conf: 0.94, contentSafe: false },
  { re: /\b(boleto|fatura|invoice)\b/i, tipo: 'fatura', conf: 0.9 },
  { re: /\b(recibo|nota[ _-]?fiscal|nfe|danfe|comprovante|pix)\b/i, tipo: 'nota-fiscal', conf: 0.88 },
  { re: /\b(extrato|statement|informe[ _-]?de[ _-]?rendimentos)\b/i, tipo: 'extrato', conf: 0.9 },
  { re: /\b(irpf|imposto[ _-]?de[ _-]?renda|darf|dirf)\b/i, tipo: 'imposto', conf: 0.92 },
  { re: /\b(contrato|contract|aditivo|distrato|procuracao|nda)\b/i, tipo: 'contrato', conf: 0.88 },
  { re: /\b(curriculo|curr[íi]culo|resume|\bcv\b)\b/i, tipo: 'curriculo', conf: 0.88 },
  { re: /\b(passaporte|rg\b|cnh\b|certidao|certid[ãa]o|titulo[ _-]?de[ _-]?eleitor)\b/i, tipo: 'doc-pessoal', conf: 0.9 },
  { re: /\b(exame|laudo|receita[ _-]?medica|atestado|hemograma)\b/i, tipo: 'saude', conf: 0.88 },
  { re: /\b(ingresso|ticket|boarding|cart[ãa]o[ _-]?de[ _-]?embarque|passagem|eticket|reserva)\b/i, tipo: 'viagem', conf: 0.88 },
  { re: /\b(apresentacao|apresenta[çc][ãa]o|deck|pitch|keynote)\b/i, tipo: 'apresentacao', conf: 0.85 },
  { re: /\b(briefing|brief)\b/i, tipo: 'briefing', conf: 0.88 },
  { re: /\b(roteiro|script|storyboard)\b/i, tipo: 'roteiro', conf: 0.86 },
  { re: /\b(proposta[ _-]?comercial|orcamento|or[çc]amento|budget)\b/i, tipo: 'proposta', conf: 0.86 },
  { re: /\b(mockup|mock[ _-]?up)\b/i, tipo: 'mockup', conf: 0.88 },
  { re: /\b(thumb|thumbnail|miniatura|capa[ _-]?ep)\b/i, tipo: 'miniatura', conf: 0.86 },
  { re: /\b(logo|logotipo|favicon|marca[ _-]?dagua)\b/i, tipo: 'logo', conf: 0.84 },
  { re: /\b(banner|hero|capa)\b/i, tipo: 'banner', conf: 0.78 },
  { re: /\b(post|feed|carrossel|stories)\b/i, tipo: 'arte-social', conf: 0.8 },
  { re: /\b(scan|digitalizado|digitalizacao)\b/i, tipo: 'scan', conf: 0.85 },
  { re: /\b(trilha|soundtrack|bgm|musica[ _-]?fundo)\b/i, tipo: 'trilha', conf: 0.86 },
  { re: /\b(narracao|locucao|voiceover|vo\b)\b/i, tipo: 'audio-bruto', conf: 0.84 },
  { re: /^(zoom|meet|teams|gmt\d)[_-]/i, tipo: 'reuniao', conf: 0.85, contentSafe: false },
  { re: /\b(notas? da reuniao|ata de reuniao|meeting notes)\b/i, tipo: 'reuniao', conf: 0.84 },
  { re: /\b(relatorio|report) (trimestral|mensal|anual|de)\b/i, tipo: 'relatorio', conf: 0.84 },
  { re: /\b(final|master|aprovado|entrega)\b.*\.(mp4|mov)$/i, tipo: 'video-entrega', conf: 0.8, contentSafe: false },
  { re: /\b(abstract|introduction|we present|arxiv)\b/i, tipo: 'artigo', conf: 0.8 }
];

/** @type {Array<[RegExp, string, number]>} */
const MIME_FALLBACK = [
  [/^image\//, 'imagem', 0.45],
  [/^video\//, 'video', 0.6],
  [/^audio\//, 'audio', 0.6],
  [/^application\/(zip|x-tar|gzip|x-7z|x-rar)/, 'arquivo-comprimido', 0.5],
  [/^application\/vnd\.openxml.*presentation/, 'apresentacao', 0.6],
  [/^application\/vnd\.openxml.*spreadsheet/, 'planilha', 0.65],
  [/^application\/vnd\.openxml.*word/, 'documento', 0.4],
  [/^application\/pdf/, 'documento', 0.35],
  [/^text\//, 'texto', 0.4]
];

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/**
 * @typedef {object} RuleVerdict
 * @property {string} tipo      O QUE o arquivo é. Universal, não depende do usuário.
 * @property {number} confidence
 * @property {string} decidedBy
 * @property {string} reason
 * @property {string|null} [source]
 * @property {string} [nameHint]
 */

/**
 * Responde SÓ "o que é este arquivo". Onde ele vai é trabalho de placement.js.
 * Devolve null quando nenhuma regra tem opinião — aí o Cérebro assume.
 *
 * @param {{name:string, ext:string, mime?:string|null, whereFroms?:string[],
 *          exif?:{Make?:string,Model?:string,DateTimeOriginal?:Date},
 *          shape?:{hint:string,confidence:number,note:string}|null, text?:string}} ctx
 * @returns {RuleVerdict|null}
 */
export function classify(ctx) {
  const { name, ext, mime, whereFroms = [], exif = {}, shape = null } = ctx;

  const flatten = (str) => String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.\-]+/g, ' ')
    .trim();

  const flat = flatten(name);
  // Arquivo que JÁ passou pelo bicho vira "2026-07-01__captura-de-tela.png".
  // Sem tirar o prefixo de data, toda regra ancorada em ^ deixa de casar.
  const flatNoDate = flatten(name.replace(/^\d{4}-\d{2}-\d{2}__/, ''));

  const veredito = (tipo, confidence, decidedBy, reason, extra = {}) =>
    ({ tipo, confidence, decidedBy, reason, source: whereFroms[0] || null, ...extra });

  // 1. Extensão inequívoca vem primeiro: .cr3 é RAW, ponto final. Nenhum nome
  //    de arquivo desmente isso, e é o sinal que salva os perfis profissionais.
  for (const [exts, tipo, conf] of EXT_MAP) {
    if (exts.includes(ext)) return veredito(tipo, conf, `ext:${ext}`, `${ext} é sempre ${tipo}`);
  }

  // 2. Padrão de nome. Vem ANTES da origem, e a ordem foi decidida medindo:
  // "boleto_condominio.pdf" baixado do site do banco é um boleto, não um
  // "arquivo financeiro". O nome é mais específico que o domínio quase sempre.
  for (const r of NAME_RULES) {
    if (r.re.test(flat) || r.re.test(flatNoDate) || r.re.test(name)) {
      return veredito(r.tipo, r.conf, `nome:${r.tipo}`, `O nome indica ${r.tipo}`, { nameHint: r.name });
    }
  }

  // 3. Origem do download. Assume quando o nome não diz nada — que é o caso de
  // todo arquivo com nome de código, hash ou "documento (3)".
  for (const url of whereFroms) {
    const host = domainOf(url);
    if (!host) continue;
    for (const [re, tipo] of DOMAIN_MAP) {
      if (re.test(host)) return veredito(tipo, 0.86, `origem:${host}`, `Veio de ${host}`, { source: url });
    }
  }

  // 4. Foto de câmera de verdade: tem modelo de câmera no EXIF.
  if (exif.Model) {
    return veredito('foto-camera', 0.9, 'exif:camera',
      `Foto tirada com ${[exif.Make, exif.Model].filter(Boolean).join(' ')}`,
      { ano: exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.getFullYear() : null });
  }

  // 5. As mesmas palavras-chave, agora dentro do conteúdo já extraído.
  //    Arquivo com nome inútil ("documento (3).pdf") é o caso mais comum de todos.
  if (ctx.text && ctx.text.length > 20) {
    const head = flatten(ctx.text.slice(0, 600));
    for (const r of NAME_RULES) {
      if (r.contentSafe === false) continue;
      if (r.re.test(head)) {
        return veredito(r.tipo, Math.max(0.6, r.conf - 0.08), 'conteudo',
          `O conteúdo indica ${r.tipo}`);
      }
    }
  }

  // 6. Forma da imagem. Único sinal que sobra quando não há EXIF nem nome útil —
  //    e imagem sem os dois é justamente o caso que mais aparece.
  if (shape) {
    const mapa = { captura: 'captura', documento: 'scan', social: 'arte-social',
                   arte: 'banner', foto: 'foto-camera', recorte: 'captura' };
    const tipo = mapa[shape.hint];
    if (tipo) return veredito(tipo, shape.confidence, `forma:${shape.hint}`, shape.note);
  }

  // 7. Chute por tipo real. Confiança baixa de propósito: vira pergunta.
  for (const [re, tipo, conf] of MIME_FALLBACK) {
    if (re.test(mime || '')) {
      return veredito(tipo, conf, `mime:${mime}`, `É ${mime}, mas não sei do que se trata`);
    }
  }

  return null;
}

/**
 * @param {string} s
 * @param {number} [maxLen]
 * @returns {string}
 */
export function slugify(s, maxLen = 60) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
}

/**
 * @param {{date?:Date|null, slug?:string, context?:string|null, ext:string}} parts
 * @returns {string}
 */
export function buildName({ date, slug, context, ext }) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  const ctx = context ? slugify(context, 24) : null;
  return [d, slug, ctx].filter(Boolean).join('__') + ext;
}

/** A data do contrato vale mais que a do download. */
/**
 * Procura uma data DENTRO do conteúdo.
 * @param {string} text
 * @returns {Date|null}
 */
export function dateFromText(text) {
  if (!text) return null;
  const br = text.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
  if (br) {
    const d = new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00Z`);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) return d;
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[0]}T12:00:00Z`);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) return d;
  }
  return null;
}
