// As perguntas da primeira vez.
//
// Regra que governa esta lista: SO ENTRA PERGUNTA QUE MUDA COMPORTAMENTO. Se a
// resposta nao altera nenhuma decisao do motor, ela nao e uma pergunta — e uma
// conversa, e conversa no primeiro minuto de uso e o jeito mais rapido de a
// pessoa desistir. Um assistente que faz trinta perguntas e abandonado na decima.
//
// A varredura ja respondeu a maior parte sozinha: qual profissao, quais
// projetos existem, onde esta a bagunca, que tipo de arquivo essa pessoa
// produz. Entao aqui so sobra o que o disco NAO conta: preferencia e permissao.
//
// Isto e DADO, nao codigo de interface. O terminal renderiza hoje; o app em
// Swift renderiza amanha lendo o mesmo arquivo.
import path from 'node:path';
import os from 'node:os';
import { PRESETS, getPreset } from './presets.js';

const PROFISSIONAIS = ['designer', 'videomaker', 'fotografo', 'artista3d', 'motion',
                       'musico', 'ilustrador', 'youtuber'];

/**
 * @typedef {object} Pergunta
 * @property {string} id
 * @property {string} texto
 * @property {string} [porque]      por que ela existe, mostrado se a pessoa pedir
 * @property {'escolha'|'sim-nao'|'texto'|'caminho'} tipo
 * @property {Array<{valor:string, rotulo:string, detalhe?:string}>} [opcoes]
 * @property {string} padrao
 * @property {(resposta:string, cfg:any, ctx:any)=>void} aplicar
 */

/**
 * Monta as perguntas com base no que a varredura ja descobriu.
 *
 * @param {{perfil:any, inventario:any}} ctx
 * @returns {Pergunta[]}
 */
export function montar(ctx) {
  const { perfil, inventario } = ctx;
  const home = os.homedir();
  const pastas = inventario.pastasDoUsuario || {};
  const detectado = perfil && perfil.preset ? perfil.preset : getPreset('geral');
  const ehProfissional = PROFISSIONAIS.includes(detectado.id);

  /** @type {Pergunta[]} */
  const perguntas = [];

  // 1. Perfil. A varredura ja chutou; aqui so confirma. Muda o mapa inteiro de
  //    tipo -> pasta, entao e a pergunta mais cara de errar.
  perguntas.push({
    id: 'perfil',
    texto: perfil && perfil.confianca !== 'baixa'
      ? `Pelo seu disco, você parece ser ${detectado.label.toLowerCase()}. Acertei?`
      : 'O que você mais faz no computador?',
    porque: 'Decide a árvore de pastas inteira. Um fotógrafo e um advogado não guardam as coisas no mesmo lugar.',
    tipo: 'escolha',
    opcoes: [
      { valor: detectado.id, rotulo: `sim, ${detectado.label.toLowerCase()}`, detalhe: detectado.why },
      ...PRESETS.filter(p => p.id !== detectado.id)
        .map(p => ({ valor: p.id, rotulo: p.label.toLowerCase(), detalhe: p.why })),
    ],
    padrao: detectado.id,
    aplicar: (r, cfg) => { cfg.perfil = r; },
  });

  // 2. Onde guardar. E a pergunta de RISCO: guardar numa pasta nova nao encosta
  //    em nada que ja existe; usar Documentos mistura com o que voce ja tem.
  perguntas.push({
    id: 'destino',
    texto: 'Onde eu guardo o que eu organizar?',
    porque: 'Pasta nova é reversível de verdade: se você não gostar, apaga a pasta e nada mudou. Usar Documentos é mais conveniente e mais arriscado.',
    tipo: 'escolha',
    opcoes: [
      { valor: path.join(home, 'Pastinha'), rotulo: '~/Pastinha (pasta nova, nada seu é tocado)', detalhe: 'recomendado para a primeira semana' },
      { valor: pastas.documents || path.join(home, 'Documents'), rotulo: 'dentro de Documentos, usando a estrutura que já existe', detalhe: 'mais conveniente, mais arriscado' },
    ],
    padrao: path.join(home, 'Pastinha'),
    aplicar: (r, cfg) => { cfg.destRoot = r; },
  });

  // 3. O que vigiar. Downloads e obvio; Desktop e onde muita gente larga tudo.
  perguntas.push({
    id: 'vigiar',
    texto: 'Quais pastas eu fico de olho?',
    porque: 'Só essas são tocadas. Nenhuma outra, nunca, nem por engano.',
    tipo: 'escolha',
    opcoes: [
      { valor: 'downloads', rotulo: 'só Downloads' },
      { valor: 'downloads+desktop', rotulo: 'Downloads e Área de Trabalho', detalhe: 'recomendado' },
      { valor: 'desktop', rotulo: 'só a Área de Trabalho' },
    ],
    padrao: 'downloads+desktop',
    aplicar: (r, cfg) => {
      const d = pastas.downloads || path.join(home, 'Downloads');
      const e = pastas.desktop || path.join(home, 'Desktop');
      cfg.watch = r === 'downloads' ? [d] : r === 'desktop' ? [e] : [d, e];
    },
  });

  // 4. Eixo de organizacao. So para quem trabalha por encomenda — muda a forma
  //    da arvore, nao so o nome das pastas.
  if (ehProfissional) {
    perguntas.push({
      id: 'eixo',
      texto: 'Você pensa seu trabalho por cliente ou por projeto?',
      porque: 'Muda a forma da árvore: Clientes/acme/campanha-natal ou Projetos/campanha-natal. As duas funcionam; a errada te faz procurar duas vezes.',
      tipo: 'escolha',
      opcoes: [
        { valor: 'projeto', rotulo: 'por projeto', detalhe: 'Projetos/campanha-natal/…' },
        { valor: 'cliente', rotulo: 'por cliente', detalhe: 'Clientes/acme/campanha-natal/…' },
      ],
      padrao: 'projeto',
      aplicar: (r, cfg) => { cfg.eixo = r; },
    });
  }

  // 5. Coisa velha. Define se {ano} entra na arvore.
  perguntas.push({
    id: 'antigo',
    texto: 'Coisa de mais de um ano: separo por ano ou deixo tudo junto?',
    porque: 'Separar por ano ajuda quem acumula muito e atrapalha quem acumula pouco — vira pasta com três arquivos dentro.',
    tipo: 'escolha',
    opcoes: [
      { valor: 'ano', rotulo: 'separa por ano', detalhe: 'bom se você tem muitos anos de acervo' },
      { valor: 'junto', rotulo: 'deixa tudo junto' },
    ],
    padrao: (inventario.arquivos || 0) > 30000 ? 'ano' : 'junto',
    aplicar: (r, cfg) => { cfg.arquivarPorAno = r === 'ano'; },
  });

  // 6. Idioma. Muda o nome de TODO arquivo daqui pra frente.
  perguntas.push({
    id: 'idioma',
    texto: 'Nome dos arquivos em português ou em inglês?',
    porque: 'Todo arquivo renomeado daqui pra frente segue isso. Mudar depois não renomeia o que já passou.',
    tipo: 'escolha',
    opcoes: [
      { valor: 'pt', rotulo: 'português', detalhe: '2026-03-15__contrato-locacao.pdf' },
      { valor: 'en', rotulo: 'inglês', detalhe: '2026-03-15__lease-agreement.pdf' },
    ],
    padrao: 'pt',
    aplicar: (r, cfg) => { cfg.lang = r; },
  });

  // 7. Territorio declarado pela pessoa. O motor ja protege projeto, jogo e
  //    pacote sozinho; isto e para o que so ela sabe.
  perguntas.push({
    id: 'intocavel',
    texto: 'Tem alguma pasta que eu NUNCA devo tocar? (enter para nenhuma)',
    porque: 'Eu já protejo projeto de código, jogo instalado, pacote do macOS e biblioteca de aplicativo sozinho. Isto é para o que só você sabe.',
    tipo: 'caminho',
    padrao: '',
    aplicar: (r, cfg) => {
      const limpo = String(r || '').trim().replace(/^~/, home);
      if (limpo) cfg.forbiddenRoots = [...(cfg.forbiddenRoots || []), limpo];
    },
  });

  // 8. Autonomia. A ultima, e a unica que a pessoa vai querer mudar depois.
  perguntas.push({
    id: 'autonomia',
    texto: 'No começo, eu movo sozinho ou pergunto sempre?',
    porque: 'Dá para subir depois. Quase todo mundo começa perguntando e solta a mão na segunda semana.',
    tipo: 'escolha',
    opcoes: [
      { valor: '0', rotulo: 'pergunta sempre', detalhe: 'recomendado no primeiro dia' },
      { valor: '1', rotulo: 'move sozinho só o óbvio', detalhe: 'instalador, captura de tela, fonte' },
      { valor: '2', rotulo: 'move sozinho tudo que eu tiver certeza' },
    ],
    padrao: '0',
    aplicar: (r, cfg) => { cfg.autonomy = Number(r); },
  });

  return perguntas;
}

/**
 * Aplica as respostas na configuracao.
 * @param {Pergunta[]} perguntas
 * @param {Record<string,string>} respostas
 * @param {any} cfg
 */
export function aplicar(perguntas, respostas, cfg) {
  for (const p of perguntas) {
    const r = respostas[p.id] !== undefined && respostas[p.id] !== ''
      ? respostas[p.id]
      : p.padrao;
    try { p.aplicar(String(r), cfg, respostas); } catch { /* resposta esquisita, ignora */ }
  }
  return cfg;
}

/**
 * A arvore proposta, ja com as respostas aplicadas.
 *
 * Mostra o esqueleto ANTES de criar qualquer pasta: nada nasce sem a pessoa ver.
 *
 * @param {any} cfg
 * @param {{candidatasInstancia?:Array<{caminho:string}>}} inventario
 */
export function arvoreProposta(cfg, inventario = {}) {
  const preset = getPreset(cfg.perfil || 'geral');
  const instancias = (inventario.candidatasInstancia || [])
    .slice(0, 3).map(c => path.basename(c.caminho));

  const exemplo = (molde) => {
    let out = molde;
    if (!cfg.arquivarPorAno) out = out.replace(/\/?\{ano\}/g, '');
    out = out.replace('{ano}', String(new Date().getFullYear()));
    // Cada espaco ganha um exemplo DIFERENTE. Antes projeto e cliente
    // recebiam o mesmo nome, e a arvore saia dizendo
    // "Clientes/campanha-natal/Contratos", que nao e uma coisa que existe.
    const usados = new Set();
    for (const chave of ['projeto', 'cliente', 'ensaio', 'episodio', 'marca', 'tema', 'stack', 'jogo']) {
      if (!out.includes(`{${chave}}`)) continue;
      const livre = instancias.find(i => !usados.has(i));
      if (livre) usados.add(livre);
      out = out.replaceAll(`{${chave}}`, livre || `<${chave}>`);
    }
    return out;
  };

  const arvore = preset.tree.map(exemplo).filter((v, i, a) => a.indexOf(v) === i);

  // Se a pessoa escolheu eixo por cliente, o cliente sobe para o topo.
  if (cfg.eixo === 'cliente') {
    return arvore.map(p => p.startsWith('Projetos/')
      ? p.replace(/^Projetos\//, `Clientes/${instancias[1] || '<cliente>'}/`)
      : p);
  }
  return arvore;
}
