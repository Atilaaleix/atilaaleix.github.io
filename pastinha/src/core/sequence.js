// Sequencias: um render de 240 quadros nao sao 240 decisoes, sao uma.
//
// Quem cria todo dia produz arquivos em serie: quadros de render, rajada de
// foto, exportacao por pagina, take numerado. Tratar isso um a um erra por tres
// motivos:
//   1. enche a fila de propostas com 240 perguntas identicas
//   2. gasta 240 vezes o custo de classificar
//   3. e, pior, permite que 3 dos 240 caiam em pasta diferente dos outros
//
// Detectar sequencia e puro reconhecimento de padrao: zero modelo, zero leitura
// de conteudo. E o ganho e desproporcional.
import path from 'node:path';

/**
 * @typedef {object} Sequencia
 * @property {string} chave      prefixo + extensao
 * @property {string} prefixo
 * @property {string} ext
 * @property {string[]} arquivos em ordem numerica
 * @property {number} primeiro
 * @property {number} ultimo
 * @property {number} faltando   buracos na numeracao
 * @property {number} digitos    largura do campo numerico (0001 = 4)
 */

/**
 * Quebra "render_0042.png" em prefixo, numero e extensao.
 * Usa o ULTIMO grupo de digitos: "ep02_frame_0100.exr" numera por quadro,
 * nao por episodio.
 */
function partes(nome) {
  const ext = path.extname(nome);
  const stem = nome.slice(0, nome.length - ext.length);
  const m = stem.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefixo: m[1], numero: parseInt(m[2], 10), digitos: m[2].length, ext: ext.toLowerCase() };
}

/**
 * @param {string[]} nomes nomes de arquivo, sem caminho
 * @param {{minimo?:number}} [opts]
 * @returns {{sequencias:Sequencia[], soltos:string[]}}
 */
export function detectar(nomes, { minimo = 5 } = {}) {
  /** @type {Map<string, Array<{nome:string, numero:number, digitos:number}>>} */
  const grupos = new Map();
  /** @type {string[]} */
  const soltos = [];

  for (const nome of nomes) {
    const p = partes(nome);
    if (!p) { soltos.push(nome); continue; }
    // Largura fixa faz parte da identidade: "img1" e "img0001" sao coisas
    // diferentes, e misturar as duas cria sequencia que nao existe.
    const chave = `${p.prefixo} ${p.digitos} ${p.ext}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({ nome, numero: p.numero, digitos: p.digitos });
  }

  /** @type {Sequencia[]} */
  const sequencias = [];
  for (const [chave, itens] of grupos) {
    if (itens.length < minimo) { for (const i of itens) soltos.push(i.nome); continue; }
    itens.sort((a, b) => a.numero - b.numero);
    const primeiro = itens[0].numero;
    const ultimo = itens[itens.length - 1].numero;
    const esperados = ultimo - primeiro + 1;

    // Densidade evita juntar coisas que so por acaso terminam em numero:
    // "relatorio-2024, relatorio-2025" nao e sequencia.
    if (esperados > itens.length * 4) { for (const i of itens) soltos.push(i.nome); continue; }

    const [prefixo, digitos, ext] = chave.split(' ');
    sequencias.push({
      chave: prefixo + ext,
      prefixo, ext,
      arquivos: itens.map(i => i.nome),
      primeiro, ultimo,
      faltando: esperados - itens.length,
      digitos: Number(digitos)
    });
  }

  sequencias.sort((a, b) => b.arquivos.length - a.arquivos.length);
  return { sequencias, soltos };
}

/** Como o bicho fala de uma sequencia. Uma linha, nao duzentas. */
export function descrever(seq) {
  const n = seq.arquivos.length;
  const ini = String(seq.primeiro).padStart(seq.digitos, '0');
  const fim = String(seq.ultimo).padStart(seq.digitos, '0');
  const buraco = seq.faltando ? `, ${seq.faltando} faltando` : '';
  return `${n} arquivos ${seq.ext} em sequencia (${seq.prefixo}${ini} a ${fim}${buraco})`;
}

/**
 * Histograma de extensoes dos vizinhos.
 *
 * O outro sinal gratis que ninguem usa: um arquivo solto numa pasta onde 90%
 * e .CR3 quase certamente pertence aquilo. E a gravidade da pasta, e vale mais
 * que qualquer inferencia sobre o arquivo isolado.
 *
 * @param {string[]} nomesIrmaos
 * @returns {{dominante:string|null, fracao:number, total:number}}
 */
export function gravidade(nomesIrmaos) {
  /** @type {Record<string, number>} */
  const contagem = {};
  for (const n of nomesIrmaos) {
    const e = path.extname(n).toLowerCase();
    if (e) contagem[e] = (contagem[e] || 0) + 1;
  }
  const total = Object.values(contagem).reduce((a, b) => a + b, 0);
  if (!total) return { dominante: null, fracao: 0, total: 0 };
  const [ext, n] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  return { dominante: ext, fracao: n / total, total };
}
