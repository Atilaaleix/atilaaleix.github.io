// O Cérebro: só é chamado quando as regras não têm opinião.
// Duas tarefas pequenas, nunca uma tarefa grande:
//   1. escolher entre 6 pastas candidatas (não entre as 200 do disco)
//   2. escrever um nome curto e descritivo
// Saída sempre em JSON, com validação defensiva porque modelo pequeno erra formato.
import platform from '../platform/index.js';
import { slugify } from './rules.js';

export async function ollamaUp(cfg) {
  try {
    const r = await fetch(`${cfg.ollama.url}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { up: false, models: [] };
    const j = /** @type {{models?:Array<{name:string}>}} */ (await r.json());
    return { up: true, models: (j.models || []).map(m => m.name) };
  } catch {
    return { up: false, models: [] };
  }
}

/**
 * @param {any} cfg
 * @param {{model:string, prompt:string, images?:string[], json?:boolean}} opts
 * @returns {Promise<string>}
 */
async function generate(cfg, { model, prompt, images, json = true }) {
  const body = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 300 }
  };
  if (json) body.format = 'json';
  if (images && images.length) body.images = images;

  const r = await fetch(`${cfg.ollama.url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.ollama.timeoutMs)
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = /** @type {{response?:string}} */ (await r.json());
  return (j.response || '').trim();
}

/** @param {string} raw @returns {any} */
function parseJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* tenta resgatar */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const LANG = { pt: 'português do Brasil', en: 'English' };

/**
 * Classifica. `candidates` são caminhos relativos, tipo "Financeiro/Contas".
 * O modelo pode responder "NENHUMA" e sugerir uma pasta nova — isso é desejado,
 * mas vira confiança baixa, ou seja, vira pergunta ao usuário.
 */
export async function classify(cfg, { fileName, ext, mime, text, source, candidates, sizeKb }) {
  const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const snippet = (text || '').slice(0, 1200);

  const prompt = `Você organiza arquivos. Responda SÓ com JSON.

ARQUIVO
nome: ${fileName}
tipo: ${ext} (${mime || 'desconhecido'}), ${sizeKb} KB
${source ? `baixado de: ${source}` : ''}
${snippet ? `conteúdo (início):\n"""${snippet}"""` : '(sem texto legível)'}

PASTAS QUE JÁ EXISTEM
${list || '(nenhuma ainda)'}

TAREFA
1. Escolha a pasta mais adequada da lista. Se nenhuma servir, proponha UMA pasta nova curta.
2. Escreva uma descrição curta do arquivo em ${LANG[cfg.lang] || LANG.pt}, 3 a 7 palavras,
   específica o bastante para a pessoa reconhecer o arquivo daqui a um ano.
   Nada de "documento", "arquivo" ou "pdf" sozinhos.
3. Dê sua confiança de 0 a 1. Seja honesto: se o conteúdo não deixa claro, use menos de 0.6.

JSON: {"pasta":"...","nova_pasta":true|false,"descricao":"...","confianca":0.0,"motivo":"até 12 palavras"}`;

  const raw = await generate(cfg, { model: cfg.ollama.text, prompt });
  const j = parseJson(raw);
  if (!j || !j.pasta) throw new Error(`resposta inválida do modelo: ${raw.slice(0, 160)}`);

  let conf = Number(j.confianca);
  if (!isFinite(conf)) conf = 0.5;
  conf = Math.max(0, Math.min(1, conf));
  if (j.nova_pasta) conf = Math.min(conf, 0.6);   // pasta nova sempre pergunta

  return {
    folder: String(j.pasta).replace(/^\/+|\/+$/g, '').slice(0, 120),
    isNewFolder: !!j.nova_pasta,
    slug: slugify(j.descricao || ''),
    description: String(j.descricao || '').slice(0, 120),
    confidence: conf,
    reason: String(j.motivo || '').slice(0, 120),
    decidedBy: `modelo:${cfg.ollama.text}`
  };
}

/** Olha a imagem e descreve. É o "rename por IA" que você citou, feito local. */
export async function describeImage(cfg, file) {
  const b64 = platform.imageForVision(file);
  if (!b64) return null;

  const prompt = `Descreva esta imagem em ${LANG[cfg.lang] || LANG.pt} com 3 a 7 palavras,
para servir de nome de arquivo. Seja concreto: o que aparece, onde, que tipo de coisa é.
Se for documento, recibo, print de tela ou captura de conversa, diga isso e o assunto.
Responda SÓ JSON: {"descricao":"...","tipo":"foto|documento|captura|arte|outro","confianca":0.0}`;

  try {
    const raw = await generate(cfg, { model: cfg.ollama.vision, prompt, images: [b64] });
    const j = parseJson(raw);
    if (!j || !j.descricao) return null;
    return {
      description: String(j.descricao).slice(0, 120),
      slug: slugify(j.descricao),
      kind: j.tipo || 'outro',
      confidence: Math.max(0, Math.min(1, Number(j.confianca) || 0.6))
    };
  } catch {
    return null;
  }
}
