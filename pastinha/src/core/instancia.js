// Resolver a instancia: qual projeto, qual cliente, qual ensaio.
//
// O bicho vinha tratando "Projetos/{projeto}/01-Captacao" como pergunta cega, e
// isso estava errado. A varredura da primeira inicializacao JA descobriu quais
// projetos existem, quais clientes existem, e quando cada um foi mexido pela
// ultima vez. Nao e uma pergunta aberta — e uma escolha entre oito opcoes
// conhecidas, e quase sempre da para saber qual.
//
// Quatro sinais, nenhum deles usando modelo:
//   1. o nome do arquivo carrega o nome do projeto
//   2. o texto de dentro do arquivo carrega o nome do cliente
//   3. a pasta mexida mais recentemente e onde a pessoa esta trabalhando agora
//   4. so existe um candidato
//
// E um quinto que vem de fora, do agrupamento em lote: se um arquivo do lote
// resolve, o lote inteiro herda.
import path from 'node:path';

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const fichas = s => new Set(norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 2));

/**
 * Acha os valores que ja existem para os espacos de um destino.
 *
 * Para "Projetos/{projeto}/01-Captacao", varre a taxonomia atras de
 * "Projetos/<algo>/01-Captacao" e devolve os <algo> que existem de verdade,
 * com quantos arquivos cada um tem e quando foi mexido por ultimo.
 *
 * @param {Array<{rel?:string, name:string, files:number, mtimeMs?:number}>} taxonomy
 * @param {string} template
 * @returns {Array<{valores:Record<string,string>, files:number, mtimeMs:number, rel:string}>}
 */
export function candidatos(taxonomy, template) {
  const slots = [...String(template).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  if (!slots.length) return [];

  // Monta o regex do caminho a partir do molde, trocando cada {x} por um grupo.
  const partes = String(template).split('/').map(seg => {
    const m = seg.match(/^\{(\w+)\}$/);
    if (m) return '([^/]+)';
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const re = new RegExp('^' + partes.join('/') + '$', 'i');

  const achados = [];
  for (const f of taxonomy) {
    const rel = (f.rel || f.name || '').split(path.sep).join('/');
    const m = rel.match(re);
    if (!m) continue;
    /** @type {Record<string,string>} */
    const valores = {};
    slots.forEach((s, i) => { valores[s] = m[i + 1]; });
    achados.push({ valores, files: f.files || 0, mtimeMs: f.mtimeMs || 0, rel });
  }
  return achados;
}

/**
 * @typedef {object} Resolucao
 * @property {Record<string,string>|null} valores
 * @property {number} confianca
 * @property {string} porque
 * @property {Array<{valores:Record<string,string>, score:number}>} alternativas
 */

/**
 * @param {{nome:string, texto?:string, mtimeMs?:number}} arquivo
 * @param {ReturnType<typeof candidatos>} cands
 * @param {{agoraMs?:number}} [opts]
 * @returns {Resolucao}
 */
export function resolver(arquivo, cands, { agoraMs = 0 } = {}) {
  if (!cands.length) {
    return { valores: null, confianca: 0, porque: 'nao existe nenhuma pasta desse tipo ainda', alternativas: [] };
  }

  // Um candidato so: nao ha o que perguntar.
  if (cands.length === 1) {
    return {
      valores: cands[0].valores,
      confianca: 0.88,
      porque: `so existe um: ${Object.values(cands[0].valores).join('/')}`,
      alternativas: []
    };
  }

  const doNome = fichas(path.basename(arquivo.nome, path.extname(arquivo.nome)));
  const doTexto = fichas(String(arquivo.texto || '').slice(0, 400));
  const maisRecente = Math.max(...cands.map(c => c.mtimeMs || 0));
  const referencia = agoraMs || arquivo.mtimeMs || maisRecente;

  const pontuados = cands.map(c => {
    let score = 0;
    const razoes = [];

    for (const [, valor] of Object.entries(c.valores)) {
      const vf = fichas(valor);
      let noNome = 0, noTexto = 0;
      for (const t of vf) {
        if (doNome.has(t)) noNome++;
        if (doTexto.has(t)) noTexto++;
      }
      // O nome do arquivo carregar o nome do projeto e quase prova.
      if (noNome) { score += 6 * noNome; razoes.push(`"${valor}" aparece no nome`); }
      else if (noTexto) { score += 2.5 * noTexto; razoes.push(`"${valor}" aparece no conteudo`); }
    }

    // Recencia: a pessoa esta trabalhando no projeto que ela mexeu por ultimo.
    // Vale bastante, mas nunca tanto quanto o nome bater.
    if (maisRecente > 0 && c.mtimeMs > 0) {
      const diasAtras = Math.max(0, (referencia - c.mtimeMs) / 86400000);
      const recencia = Math.exp(-diasAtras / 21);   // meia-vida de tres semanas
      score += recencia * 3;
      if (recencia > 0.6) razoes.push('mexido recentemente');
    }

    // Pasta cheia e ligeiramente mais provavel que pasta vazia. Peso pequeno de
    // proposito: senao o projeto antigo e gigante ganha de todos para sempre.
    score += Math.log10(1 + c.files) * 0.3;

    return { ...c, score, razoes };
  }).sort((a, b) => b.score - a.score);

  const melhor = pontuados[0];
  const segundo = pontuados[1];
  const folga = melhor.score - (segundo ? segundo.score : 0);

  // A confianca sai da FOLGA, nao da nota. Dois candidatos empatados em 9 pontos
  // sao uma duvida, nao uma certeza — e e exatamente ai que o bicho tem que
  // perguntar em vez de chutar com cara de seguro.
  let confianca;
  if (folga >= 5) confianca = 0.9;
  else if (folga >= 2.5) confianca = 0.78;
  else if (folga >= 1) confianca = 0.55;
  else confianca = 0.3;

  return {
    valores: melhor.valores,
    confianca,
    porque: melhor.razoes.length ? melhor.razoes.join(', ') : 'nenhum sinal forte, so a ordem geral',
    alternativas: pontuados.slice(1, 4).map(p => ({ valores: p.valores, score: +p.score.toFixed(1) }))
  };
}

/**
 * Preenche os espacos de um destino com os valores resolvidos.
 * @param {string} template
 * @param {Record<string,string>|null} valores
 */
export function preencher(template, valores) {
  if (!valores) return template;
  let out = String(template);
  for (const [k, v] of Object.entries(valores)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

/**
 * Herança de lote: se UM arquivo do grupo resolveu com folga, os outros herdam.
 *
 * E o jeito mais barato de matar a pergunta repetida. Num cartao com quinhentos
 * clipes, basta um deles ter o nome do projeto para que os quinhentos saibam
 * para onde vao.
 *
 * @param {Array<{resolucao:Resolucao}>} membros
 * @returns {Resolucao|null}
 */
export function herdarDoLote(membros) {
  const bons = membros
    .map(m => m.resolucao)
    .filter(r => r && r.valores && r.confianca >= 0.78);
  if (!bons.length) return null;

  // Todos os que resolveram bem precisam concordar. Se dois arquivos do mesmo
  // lote apontam para projetos diferentes, o lote esta errado — e herdar em
  // cima de uma discordancia espalharia o erro por todos.
  const assinatura = r => JSON.stringify(r.valores);
  const primeira = assinatura(bons[0]);
  if (!bons.every(r => assinatura(r) === primeira)) return null;

  return {
    valores: bons[0].valores,
    confianca: Math.min(0.88, bons[0].confianca),
    porque: `herdado do lote (${bons.length} de ${membros.length} apontaram para ${Object.values(bons[0].valores).join('/')})`,
    alternativas: []
  };
}
