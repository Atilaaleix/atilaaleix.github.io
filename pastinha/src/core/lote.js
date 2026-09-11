// Lotes: transformar cem perguntas iguais em uma pergunta.
//
// A medicao de um milhao de arquivos deu dois numeros: 97,6% de acerto quando o
// bicho age sozinho, e pergunta em 79,5% dos arquivos. O primeiro e bom. O
// segundo torna o produto insuportavel — ninguem responde oitenta perguntas.
//
// Mas quase toda essa pergunta e A MESMA pergunta. Quinhentos clipes do mesmo
// cartao geram quinhentas vezes "qual projeto?". O problema nao e perguntar —
// e certo nao adivinhar em qual projeto o clipe entra. O problema e perguntar
// UMA VEZ POR ARQUIVO.
//
// Este modulo agrupa antes de perguntar. Nada aqui usa modelo: sao tres sinais
// de agrupamento que a maquina enxerga sozinha.
import path from 'node:path';
import { detectar } from './sequence.js';
import { herdarDoLote, preencher } from './instancia.js';

/** Quanto tempo separa duas importacoes diferentes. */
const JANELA_SESSAO_MS = 20 * 60 * 1000;

/**
 * @typedef {object} Lote
 * @property {string} chave
 * @property {string} motivo       por que estes arquivos estao juntos
 * @property {string} tipo
 * @property {string} folder       destino, ainda com {espacos}
 * @property {string[]} slots
 * @property {any[]} propostas
 * @property {string} resumo       a frase que o bicho fala
 */

const chaveDe = p => `${p.tipo || '?'}|${p.folder || '?'}`;

/**
 * Junta propostas que sao, na pratica, a mesma decisao.
 *
 * Tres criterios, do mais forte para o mais fraco:
 *   1. SEQUENCIA — mesmo prefixo e numeracao contigua. Prova quase absoluta.
 *   2. SESSAO — mesmo tipo, mesmo destino, e chegaram na mesma janela de tempo.
 *      E o cartao de camera descarregado de uma vez.
 *   3. TIPO — mesmo tipo e mesmo destino, sem proximidade temporal. Mais fraco,
 *      entao so agrupa a partir de um minimo alto.
 *
 * @param {any[]} propostas
 * @param {{minimoPorTipo?:number, janelaMs?:number}} [opts]
 * @returns {{lotes:Lote[], avulsas:any[]}}
 */
export function agrupar(propostas, { minimoPorTipo = 8, janelaMs = JANELA_SESSAO_MS } = {}) {
  const validas = propostas.filter(p => p && !p.skip && p.folder);
  /** @type {Lote[]} */
  const lotes = [];
  const usadas = new Set();

  // --- 1. sequencias -------------------------------------------------------
  const porPasta = new Map();
  for (const p of validas) {
    const dir = path.dirname(p.file);
    if (!porPasta.has(dir)) porPasta.set(dir, []);
    porPasta.get(dir).push(p);
  }

  for (const [, doDir] of porPasta) {
    const porNome = new Map(doDir.map(p => [path.basename(p.file), p]));
    const { sequencias } = detectar([...porNome.keys()]);
    for (const seq of sequencias) {
      const membros = seq.arquivos.map(n => porNome.get(n)).filter(Boolean);
      // Uma sequencia so e um lote se todos concordam no destino. Se metade dos
      // quadros ia para um lugar e metade para outro, ha algo errado — e ai e
      // melhor perguntar do que juntar em cima de uma discordancia.
      const destinos = new Set(membros.map(chaveDe));
      if (destinos.size !== 1 || membros.length < 3) continue;
      for (const m of membros) usadas.add(m);
      const primeiro = membros[0];
      lotes.push({
        chave: `seq:${seq.prefixo}${seq.ext}`,
        motivo: 'sequencia',
        tipo: primeiro.tipo,
        folder: primeiro.folder,
        slots: primeiro.slots || [],
        propostas: membros,
        resumo: `${membros.length} arquivos ${seq.ext} em sequencia (${seq.prefixo}${String(seq.primeiro).padStart(seq.digitos, '0')} a ${String(seq.ultimo).padStart(seq.digitos, '0')})`
      });
    }
  }

  // --- 2. sessoes de importacao --------------------------------------------
  const restantes = validas.filter(p => !usadas.has(p));
  const porChave = new Map();
  for (const p of restantes) {
    const k = chaveDe(p);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(p);
  }

  for (const [k, grupo] of porChave) {
    const comTempo = grupo.filter(p => p.mtimeMs != null);
    if (comTempo.length < 3) continue;
    comTempo.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let atual = [comTempo[0]];
    const fecha = () => {
      if (atual.length < 3) return;
      for (const m of atual) usadas.add(m);
      const primeiro = atual[0];
      const minutos = Math.round((atual.at(-1).mtimeMs - primeiro.mtimeMs) / 60000);
      lotes.push({
        chave: `sessao:${k}:${primeiro.mtimeMs}`,
        motivo: 'sessao',
        tipo: primeiro.tipo,
        folder: primeiro.folder,
        slots: primeiro.slots || [],
        propostas: [...atual],
        resumo: `${atual.length} arquivos do tipo ${primeiro.tipo} que chegaram juntos` +
                (minutos > 0 ? ` (${minutos} min entre o primeiro e o ultimo)` : '')
      });
    };

    for (let i = 1; i < comTempo.length; i++) {
      if (comTempo[i].mtimeMs - atual.at(-1).mtimeMs <= janelaMs) atual.push(comTempo[i]);
      else { fecha(); atual = [comTempo[i]]; }
    }
    fecha();
  }

  // --- 3. mesmo tipo, sem proximidade --------------------------------------
  const sobra = validas.filter(p => !usadas.has(p));
  const porChave2 = new Map();
  for (const p of sobra) {
    const k = chaveDe(p);
    if (!porChave2.has(k)) porChave2.set(k, []);
    porChave2.get(k).push(p);
  }
  for (const [k, grupo] of porChave2) {
    if (grupo.length < minimoPorTipo) continue;
    for (const m of grupo) usadas.add(m);
    lotes.push({
      chave: `tipo:${k}`,
      motivo: 'tipo',
      tipo: grupo[0].tipo,
      folder: grupo[0].folder,
      slots: grupo[0].slots || [],
      propostas: grupo,
      resumo: `${grupo.length} arquivos do tipo ${grupo[0].tipo}`
    });
  }

  lotes.sort((a, b) => b.propostas.length - a.propostas.length);
  return { lotes, avulsas: validas.filter(p => !usadas.has(p)) };
}

/**
 * Quantas decisoes a pessoa realmente precisa tomar.
 *
 * E este o numero que o produto deve otimizar — nao "quantos arquivos ele
 * pergunta". Perguntar sobre quinhentos arquivos de uma vez custa uma decisao,
 * nao quinhentas.
 *
 * @param {any[]} propostas
 * @param {number} limiar confianca acima da qual ele age sozinho
 */
export function contarDecisoes(propostas, limiar = 0.8) {
  const validas = propostas.filter(p => p && !p.skip && p.folder);
  const automaticas = validas.filter(p => (p.confidence || 0) >= limiar && !p.precisaInstancia);
  const perguntaveis = validas.filter(p => !((p.confidence || 0) >= limiar && !p.precisaInstancia));

  const { lotes, avulsas } = agrupar(perguntaveis);
  return {
    arquivos: validas.length,
    automaticos: automaticas.length,
    arquivosQuePerguntariam: perguntaveis.length,
    decisoes: lotes.length + avulsas.length,
    lotes: lotes.length,
    avulsas: avulsas.length,
    // O ganho: de uma pergunta por arquivo para uma pergunta por lote.
    fator: perguntaveis.length && (lotes.length + avulsas.length)
      ? +(perguntaveis.length / (lotes.length + avulsas.length)).toFixed(1)
      : 1,
    detalhe: lotes.slice(0, 8).map(l => ({ resumo: l.resumo, destino: l.folder, motivo: l.motivo, n: l.propostas.length }))
  };
}

/**
 * Espalha a resolucao de instancia dentro de cada lote.
 *
 * E o passo que fecha o ciclo. Num cartao com quinhentos clipes, um punhado
 * carrega o nome do projeto no proprio nome e resolve sozinho; os outros
 * quatrocentos e tantos nao carregam nada. Como eles chegaram juntos, sao o
 * mesmo trabalho — entao o que um sabe, todos sabem.
 *
 * A trava esta em herdarDoLote: se dois membros resolveram para projetos
 * DIFERENTES, ninguem herda. Espalhar em cima de uma discordancia transformaria
 * um erro em quinhentos.
 *
 * @param {any[]} propostas
 * @returns {{herdaram:number, lotes:number}}
 */
export function aplicarHeranca(propostas) {
  const comInstancia = propostas.filter(p => p && !p.skip && p.instancia);
  if (!comInstancia.length) return { herdaram: 0, lotes: 0 };

  // Agrupar SO os nao resolvidos era o bug: os poucos arquivos que carregam o
  // nome do projeto resolvem sozinhos e saem da lista — justamente os que sabem
  // a resposta ficavam de fora do lote e nunca doavam o que sabiam.
  //
  // Para agrupar junto, os dois tem que cair na mesma chave. Quem ja resolveu
  // teve o {projeto} substituido no caminho, entao a chave volta ao molde.
  const molde = p => (p.instancia && p.instancia.valores)
    ? Object.entries(p.instancia.valores).reduce(
        (f, [k, v]) => f.split(v).join(`{${k}}`), String(p.folder))
    : String(p.folder);

  const paraAgrupar = comInstancia.map(p => ({ ...p, folder: molde(p), __orig: p }));
  const { lotes } = agrupar(paraAgrupar, { minimoPorTipo: 3 });
  let herdaram = 0, lotesComHeranca = 0;

  for (const lote of lotes) {
    lote.propostas = lote.propostas.map(p => p.__orig || p);
    const heranca = herdarDoLote(lote.propostas.map(p => ({ resolucao: p.instancia })));
    if (!heranca) continue;
    lotesComHeranca++;
    for (const p of lote.propostas) {
      if (!p.precisaInstancia) continue;
      p.folder = preencher(p.folder, heranca.valores);
      p.slots = [];
      p.precisaInstancia = false;
      p.instancia = heranca;
      p.confidence = Math.min(p.confidence === 0.45 ? 0.82 : p.confidence, heranca.confianca);
      p.decidedBy = (p.decidedBy || '') + '+heranca';
      herdaram++;
    }
  }
  return { herdaram, lotes: lotesComHeranca };
}
