// Estruturas prévias por perfil de usuário.
//
// ISTO É DADO, NÃO CÓDIGO — e a escolha é deliberada. Quando existirem um app
// em Swift e um app em Windows, este arquivo é consumido pelos dois sem ser
// reescrito. O que não pode acontecer é a taxonomia virar `if` dentro de cada
// app: aí os dois divergem e viram dois produtos diferentes com o mesmo nome.
//
// A pesquisa apoia a ideia: no estudo da Microsoft com 60 mil computadores, a
// popularidade das extensões varia por FUNÇÃO PROFISSIONAL. Um designer e um
// contador não têm o mesmo disco, então não deveriam receber a mesma proposta
// de pastas.

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} label
 * @property {string} why       por que este perfil precisa de organização
 * @property {string[]} pergunta as perguntas que revelam este perfil
 * @property {string[]} tree    a árvore proposta. {} são espaços a preencher
 * @property {string[]} sinais  extensões comuns do perfil — pesam pouco, são compartilhadas
 * @property {string[]} fortes  extensões QUASE exclusivas do perfil — pesam muito
 * @property {RegExp[]} pastas  nomes de pasta que denunciam o perfil — pesam mais ainda
 * @property {string[]} jamais  pastas que o bicho nunca toca neste perfil
 */

/** @type {Preset[]} */
export const PRESETS = [
  {
    id: 'geral',
    label: 'Pessoa comum',
    why: 'Downloads vira depósito. O problema é conta, documento e foto no mesmo lugar.',
    pergunta: ['Você usa o computador mais para trabalho ou para a vida pessoal?'],
    sinais: ['.pdf', '.docx', '.jpg', '.xlsx'],
    fortes: [],
    pastas: [],
    jamais: [],
    tree: [
      'Financeiro/Contas', 'Financeiro/Extratos', 'Financeiro/Impostos',
      'Documentos/Pessoais', 'Documentos/Governo', 'Documentos/Saude',
      'Juridico/Contratos',
      'Trabalho/Apresentacoes', 'Trabalho/Relatorios', 'Trabalho/Reunioes',
      'Carreira', 'Viagens', 'Compras',
      'Fotos/{ano}', 'Capturas', 'Recebidos/WhatsApp',
      'Leitura/Livros', 'Leitura/Artigos',
      'Instaladores', 'Midia/Audio', 'Midia/Video'
    ]
  },
  {
    id: 'designer',
    label: 'Designer',
    why: 'Muita versão do mesmo arquivo e muita referência solta. O nome do arquivo é o controle de versão.',
    pergunta: ['Você trabalha por cliente ou por projeto?', 'Precisa achar entrega antiga de cliente?'],
    sinais: ['.psd', '.ai', '.png', '.pdf'],
    fortes: ['.fig', '.sketch', '.indd', '.afdesign', '.afphoto', '.xd'],
    pastas: [/^clientes?$/i, /mockups?/i, /^refer[eê]ncias?$/i, /^portfolio$/i],
    jamais: ['Biblioteca/Fontes'],
    tree: [
      'Clientes/{cliente}/Briefing', 'Clientes/{cliente}/Referencias',
      'Clientes/{cliente}/Trabalho', 'Clientes/{cliente}/Entregas',
      'Clientes/{cliente}/Aprovacoes', 'Clientes/{cliente}/Contratos',
      'Biblioteca/Fontes', 'Biblioteca/Icones', 'Biblioteca/Texturas', 'Biblioteca/Mockups',
      'Referencias/{tema}',
      'Portfolio', 'Exportacoes/Web', 'Exportacoes/Impressao',
      'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'videomaker',
    label: 'Videomaker',
    why: 'Terabytes por projeto, e a estrutura de pastas É o fluxo de trabalho. Errar aqui trava a edição.',
    pergunta: ['Você usa uma estrutura numerada de projeto?', 'Guarda o material bruto depois da entrega?'],
    sinais: ['.mov', '.mp4', '.wav'],
    fortes: ['.mxf', '.braw', '.r3d', '.prproj', '.drp', '.fcpbundle', '.cube'],
    pastas: [/^\d{2}[-_](captacao|capta[çc][ãa]o|audio|edicao|edi[çc][ãa]o|entregas?)$/i, /^luts?$/i, /arquivo.?morto/i],
    jamais: ['Projetos/{projeto}/01-Captacao'],
    tree: [
      'Projetos/{projeto}/01-Captacao', 'Projetos/{projeto}/02-Audio',
      'Projetos/{projeto}/03-Graficos', 'Projetos/{projeto}/04-Edicao',
      'Projetos/{projeto}/05-Entregas', 'Projetos/{projeto}/06-Aprovacao',
      'Biblioteca/Trilhas', 'Biblioteca/EfeitosSonoros', 'Biblioteca/LUTs',
      'Biblioteca/Templates', 'Biblioteca/Stock',
      'Clientes/{cliente}/Contratos', 'Clientes/{cliente}/Briefing',
      'ArquivoMorto/{ano}', 'Capturas'
    ]
  },
  {
    id: 'fotografo',
    label: 'Fotógrafo',
    why: 'Milhares de arquivos por ensaio, nomes de câmera idênticos, e RAW que não pode ser tocado.',
    pergunta: ['Organiza por data ou por cliente?', 'Separa selecionadas de entregues?'],
    sinais: ['.jpg', '.jpeg'],
    fortes: ['.cr2', '.cr3', '.nef', '.arw', '.raf', '.dng', '.orf', '.xmp', '.lrcat'],
    pastas: [/^raw$/i, /^ensaios?$/i, /^sele[çc][ãa]o$/i, /^editadas?$/i, /^presets?$/i],
    jamais: ['Ensaios/{ano}/{ensaio}/RAW'],
    tree: [
      'Ensaios/{ano}/{ensaio}/RAW', 'Ensaios/{ano}/{ensaio}/Selecao',
      'Ensaios/{ano}/{ensaio}/Editadas', 'Ensaios/{ano}/{ensaio}/Entrega',
      'Ensaios/{ano}/{ensaio}/Contrato',
      'Pessoal/{ano}', 'Portfolio',
      'Presets', 'Equipamento', 'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'programador',
    label: 'Programador',
    why: 'O código já é organizado pelo git. O problema é tudo o que NÃO é código: doc, certificado, instalador, print.',
    pergunta: ['Onde ficam seus repositórios?', 'Guarda documentação baixada?'],
    sinais: ['.json', '.md', '.sql', '.sh'],
    fortes: ['.ts', '.tsx', '.py', '.go', '.rs', '.ipynb', '.gradle', '.pem'],
    pastas: [/^node_modules$/i, /^\.git$/i, /^src$/i, /^reposit[oó]rios?$/i, /^c[oó]digo$/i],
    jamais: ['Codigo'],
    tree: [
      'Codigo',
      'Documentacao/{stack}', 'Referencias/Artigos', 'Referencias/Livros',
      'Credenciais', 'Configuracoes', 'Instaladores',
      'Trabalho/Reunioes', 'Trabalho/Specs',
      'Capturas', 'Financeiro/Notas', 'Carreira'
    ]
  },
  {
    id: 'youtuber',
    label: 'Criador de conteúdo',
    why: 'Cada episódio é um pacote: roteiro, bruto, edição, miniatura, publicado. E tudo tem prazo.',
    pergunta: ['Trabalha por episódio?', 'Tem patrocinador com material próprio?'],
    sinais: ['.mp4', '.mov', '.wav'],
    fortes: ['.srt', '.vtt', '.aep'],
    pastas: [/^canal$/i, /^(ep|episodio|epis[oó]dio)[-_ ]?\d+/i, /miniaturas?|thumbnails?/i, /^patroc[ií]nios?$/i, /^m[eé]tricas$/i],
    jamais: ['Canal/{episodio}/02-Bruto'],
    tree: [
      'Canal/{episodio}/01-Roteiro', 'Canal/{episodio}/02-Bruto',
      'Canal/{episodio}/03-Edicao', 'Canal/{episodio}/04-Miniatura',
      'Canal/{episodio}/05-Publicado', 'Canal/{episodio}/06-Legendas',
      'Biblioteca/Trilhas', 'Biblioteca/Vinhetas', 'Biblioteca/Assets',
      'Marca/Logos', 'Marca/Templates',
      'Patrocinios/{marca}/Contratos', 'Patrocinios/{marca}/Material',
      'Metricas', 'Capturas'
    ]
  }
];

/** @param {string} id */
export function getPreset(id) {
  return PRESETS.find(p => p.id === id) || PRESETS[0];
}

/**
 * Adivinha o perfil pela varredura só-leitura da primeira inicialização.
 *
 * Três sinais, com pesos bem diferentes — e a ordem importa. Extensão comum quase
 * não diz nada: .mp4 existe no disco de todo mundo. O que denuncia o perfil é a
 * extensão que só ele tem (.braw, .cr3, .fig) e, acima de tudo, o NOME DAS PASTAS
 * que ele já criou. Videomaker e criador de conteúdo têm exatamente os mesmos
 * vídeos; o que os separa é "01-Captacao" contra "Canal/ep-12".
 *
 * @param {Record<string, number>} extCounts contagem por extensão
 * @param {string[]} [folderNames] nomes de pasta vistos na varredura
 * @returns {{preset:Preset, score:number, confianca:'alta'|'media'|'baixa', segundo:string, porque:string[]}}
 */
export function guessProfile(extCounts, folderNames = []) {
  const total = Object.values(extCounts).reduce((a, b) => a + b, 0) || 1;

  const scored = PRESETS.map(p => {
    /** @type {string[]} */
    const porque = [];
    let score = 0;

    let comuns = 0;
    for (const ext of p.sinais || []) comuns += extCounts[ext] || 0;
    score += (comuns / total) * 1;

    let fortes = 0;
    for (const ext of p.fortes || []) {
      const n = extCounts[ext] || 0;
      if (n) { fortes += n; porque.push(`${n} arquivos ${ext}`); }
    }
    // Extensão exclusiva não precisa ser maioria para provar o ponto: 200 arquivos
    // .braw num disco de 20 mil já definem a pessoa. Por isso raiz em vez de razão.
    score += Math.min(1, Math.sqrt(fortes / 40)) * 4;

    let pastas = 0;
    for (const re of p.pastas || []) {
      const hit = folderNames.find(n => re.test(n));
      if (hit) { pastas++; porque.push(`pasta "${hit}"`); }
    }
    score += pastas * 2.5;

    return { preset: p, score, porque };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const gap = top.score - (scored[1]?.score || 0);

  // "geral" é o padrão honesto: só perde quando outro perfil tem prova de verdade.
  if (top.preset.id !== 'geral' && top.score < 1.2) {
    return { preset: getPreset('geral'), score: top.score, confianca: 'baixa',
             segundo: top.preset.id, porque: ['nenhum sinal forte de perfil específico'] };
  }

  return {
    preset: top.preset,
    score: +top.score.toFixed(2),
    confianca: gap > 2 ? 'alta' : gap > 0.7 ? 'media' : 'baixa',
    segundo: scored[1]?.preset.id || 'geral',
    porque: top.porque.slice(0, 4)
  };
}
