// O classificador determinístico. A aposta do projeto é que ISTO resolve
// 70-80% dos arquivos sozinho. Cada regra é testável, explicável e instantânea.
// Se uma regra acerta, o modelo nem é chamado.
import path from 'node:path';

/**
 * Domínio de origem -> categoria. A tabela mais barata e mais eficaz do sistema.
 * @type {Array<[RegExp, string]>}
 */
const DOMAIN_MAP = [
  [/(^|\.)gov\.br$|receita\.fazenda|nfe\.fazenda|detran|inss|esocial/i, 'Documentos/Governo'],
  [/nubank|itau|bradesco|santander|bancodobrasil|bb\.com\.br|caixa\.gov|inter\.co|c6bank|btgpactual|xpi\.com|binance|mercadopago/i, 'Financeiro'],
  [/figma\.com|sketch\.com|dribbble|behance|unsplash|pexels|freepik|fonts\.google/i, 'Design'],
  [/github|gitlab|bitbucket|npmjs|pypi|stackoverflow|developer\.apple|docker/i, 'Codigo'],
  [/arxiv|scholar\.google|sciencedirect|jstor|springer|nature\.com|pubmed|ieee/i, 'Leitura/Artigos'],
  [/linkedin|glassdoor|gupy|catho|indeed/i, 'Carreira'],
  [/youtube|vimeo|twitch|spotify|soundcloud/i, 'Midia'],
  [/booking|airbnb|latam|gol\.com|azul|decolar|kayak|expedia|tam\b/i, 'Viagens'],
  [/amazon|mercadolivre|shopee|aliexpress|magazineluiza|americanas|kabum/i, 'Compras'],
  [/notion|docs\.google|drive\.google|dropbox|sharepoint|onedrive/i, 'Trabalho'],
  [/whatsapp|web\.whatsapp/i, 'Recebidos/WhatsApp']
];

/** @type {Array<[string[], string, number]>} */
const EXT_MAP = [
  [['.dmg', '.pkg', '.mpkg'], 'Instaladores', 0.97],
  [['.ipa', '.apk'], 'Instaladores', 0.95],
  [['.torrent'], 'Downloads/Torrents', 0.95],
  [['.fig', '.sketch', '.xd', '.psd', '.ai', '.indd', '.afdesign', '.afphoto'], 'Design', 0.92],
  [['.ttf', '.otf', '.woff', '.woff2'], 'Design/Fontes', 0.95],
  [['.srt', '.vtt', '.ass'], 'Midia/Legendas', 0.93],
  [['.epub', '.mobi', '.azw3'], 'Leitura/Livros', 0.95],
  [['.mp3', '.wav', '.flac', '.aac', '.m4a', '.aiff'], 'Midia/Audio', 0.9],
  [['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'], 'Midia/Video', 0.88],
  [['.ics'], 'Documentos/Calendario', 0.9],
  [['.sql', '.db', '.sqlite'], 'Codigo/Dados', 0.85],
  [['.iso', '.img'], 'Instaladores/Imagens', 0.9],
  [['.stl', '.obj', '.3mf', '.gcode'], 'Design/3D', 0.92]
];

/**
 * Padrões de nome. Cobre PT e EN porque o sistema do usuário pode estar em qualquer um.
 * contentSafe:false = só faz sentido no nome, nunca dentro do texto.
 * @type {Array<{re:RegExp, folder:string, conf:number, name?:string, contentSafe?:boolean}>}
 */
const NAME_RULES = [
  { re: /^(screenshot|captura de tela|screen shot)/i, folder: 'Capturas', conf: 0.96, name: 'captura-de-tela', contentSafe: false },
  { re: /^(img|dsc|dscn|p\d{7}|gopro|pxl)[_-]?\d{3,}/i, folder: 'Fotos', conf: 0.9, contentSafe: false },
  { re: /^(whatsapp|whats)[ _-]?(image|video|audio|ptt)/i, folder: 'Recebidos/WhatsApp', conf: 0.94 },
  { re: /\b(boleto|fatura|invoice|recibo|nota[ _-]?fiscal|nfe|danfe|comprovante)\b/i, folder: 'Financeiro/Contas', conf: 0.88 },
  { re: /\b(extrato|statement|informe[ _-]?de[ _-]?rendimentos)\b/i, folder: 'Financeiro/Extratos', conf: 0.88 },
  { re: /\b(contrato|contract|aditivo|distrato|procuracao)\b/i, folder: 'Juridico/Contratos', conf: 0.85 },
  { re: /\b(curriculo|curr[íi]culo|resume|\bcv\b)\b/i, folder: 'Carreira', conf: 0.87 },
  { re: /\b(passaporte|rg\b|cnh\b|certidao|certid[ãa]o|titulo[ _-]?de[ _-]?eleitor)\b/i, folder: 'Documentos/Pessoais', conf: 0.9 },
  { re: /\b(ingresso|ticket|boarding|cart[ãa]o[ _-]?de[ _-]?embarque|reserva)\b/i, folder: 'Viagens', conf: 0.85 },
  { re: /\b(apresentacao|apresenta[çc][ãa]o|deck|pitch)\b/i, folder: 'Trabalho/Apresentacoes', conf: 0.8 },
  { re: /^(zoom|meet|teams)[_-]/i, folder: 'Trabalho/Reunioes', conf: 0.85, contentSafe: false },
  { re: /\b(notas? da reuniao|ata de reuniao|meeting notes)\b/i, folder: 'Trabalho/Reunioes', conf: 0.82 },
  { re: /\b(relatorio|report) (trimestral|mensal|anual)\b/i, folder: 'Trabalho/Relatorios', conf: 0.8 },
  { re: /\b(proposta comercial|orcamento|or[çc]amento)\b/i, folder: 'Trabalho/Propostas', conf: 0.8 }
];

/** @type {Array<[RegExp, string, number]>} */
const MIME_FALLBACK = [
  [/^image\//, 'Imagens', 0.6],
  [/^video\//, 'Midia/Video', 0.7],
  [/^audio\//, 'Midia/Audio', 0.7],
  [/^application\/(zip|x-tar|gzip|x-7z|x-rar)/, 'Downloads/Arquivos', 0.55],
  [/^text\//, 'Documentos/Texto', 0.5]
];

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/**
 * @typedef {object} RuleVerdict
 * @property {string} folder
 * @property {number} confidence
 * @property {string} decidedBy
 * @property {string} reason
 * @property {string|null} [source]
 * @property {string} [nameHint]
 */

/**
 * Devolve null quando nenhuma regra tem opinião — aí o Cérebro assume.
 * @param {{name:string, ext:string, mime?:string|null, whereFroms?:string[],
 *          exif?:{Make?:string,Model?:string,DateTimeOriginal?:Date}, text?:string}} ctx
 * @returns {RuleVerdict|null}
 */
export function classify(ctx) {
  const { name, ext, mime, whereFroms = [], exif = {} } = ctx;

  // Underscore conta como caractere de palavra, então \b nunca casa em
  // "boleto_condominio". Nome de arquivo vive cheio de underscore, camelCase e
  // acento — normaliza tudo para espaço antes de testar qualquer padrão.
  const flatten = (s) => s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.\-]+/g, ' ')
    .trim();

  const flat = flatten(name);
  // Arquivo que JÁ passou pelo bicho vira "2026-07-01__captura-de-tela.png".
  // Sem tirar o prefixo de data, toda regra ancorada em ^ deixa de casar e ele
  // erra justamente nos arquivos que ele mesmo organizou.
  const flatNoDate = flatten(name.replace(/^\d{4}-\d{2}-\d{2}__/, ''));

  // 1. Origem do download vence quase tudo: é fato, não inferência.
  for (const url of whereFroms) {
    const host = domainOf(url);
    if (!host) continue;
    for (const [re, folder] of DOMAIN_MAP) {
      if (re.test(host)) {
        return { folder, confidence: 0.9, decidedBy: `origem:${host}`,
                 reason: `Veio de ${host}`, source: url };
      }
    }
  }

  // 2. Padrão de nome.
  for (const r of NAME_RULES) {
    if (r.re.test(flat) || r.re.test(flatNoDate) || r.re.test(name)) {
      return { folder: r.folder, confidence: r.conf, decidedBy: `nome:${r.re.source.slice(0, 28)}`,
               reason: `O nome bate com ${r.folder.toLowerCase()}`, nameHint: r.name,
               source: whereFroms[0] || null };
    }
  }

  // 3. Extensão inequívoca.
  for (const [exts, folder, conf] of EXT_MAP) {
    if (exts.includes(ext)) {
      return { folder, confidence: conf, decidedBy: `ext:${ext}`,
               reason: `${ext} é sempre ${folder.toLowerCase()}`, source: whereFroms[0] || null };
    }
  }

  // 4. Foto de câmera de verdade (tem modelo de câmera no EXIF).
  if (exif.Model && /^image\//.test(mime || '')) {
    const year = exif.DateTimeOriginal instanceof Date
      ? String(exif.DateTimeOriginal.getFullYear()) : null;
    return { folder: year ? `Fotos/${year}` : 'Fotos', confidence: 0.88, decidedBy: 'exif:camera',
             reason: `Foto tirada com ${[exif.Make, exif.Model].filter(Boolean).join(' ')}`,
             source: whereFroms[0] || null };
  }

  // 5. As mesmas palavras-chave, agora dentro do conteúdo já extraído.
  //
  // Um "CARTAO DE EMBARQUE" ou um "CONTRATO DE LOCACAO" na primeira linha do
  // documento vale tanto quanto no nome — e arquivo com nome inútil
  // ("documento sem nome (3).pdf") é exatamente o caso mais comum.
  // Confiança um pouco menor que a do nome, porque o texto pode ser citação.
  if (ctx.text && ctx.text.length > 20) {
    const head = flatten(ctx.text.slice(0, 600));
    for (const r of NAME_RULES) {
      if (r.contentSafe === false) continue;
      if (r.re.test(head)) {
        return { folder: r.folder, confidence: Math.max(0.6, r.conf - 0.1),
                 decidedBy: 'conteudo', reason: `O conteúdo parece ${r.folder.toLowerCase()}`,
                 source: whereFroms[0] || null };
      }
    }
  }

  // 6. Chute por tipo real. Confiança baixa de propósito: vai virar pergunta.
  for (const [re, folder, conf] of MIME_FALLBACK) {
    if (re.test(mime || '')) {
      return { folder, confidence: conf, decidedBy: `mime:${mime}`,
               reason: `É ${mime}, mas não sei do que se trata`, source: whereFroms[0] || null };
    }
  }

  return null;
}

/** Nome de arquivo previsível. O modelo só escreve o miolo; isto é código. */
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
