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
      'Financeiro/Investimentos', 'Financeiro/Recibos',
      'Documentos/Pessoais', 'Documentos/Governo', 'Documentos/Saude',
      'Documentos/Veiculo', 'Documentos/Imovel', 'Documentos/Seguros',
      'Documentos/Garantias', 'Documentos/Manuais', 'Documentos/Digitalizados',
      'Juridico/Contratos', 'Familia/Escola', 'Casa/Receitas', 'Casa/Compras',
      'Estudos/Certificados', 'Estudos/Apostilas',
      'Trabalho/Apresentacoes', 'Trabalho/Relatorios', 'Trabalho/Reunioes',
      'Trabalho/Planilhas', 'Carreira', 'Viagens',
      'Fotos/{ano}', 'Capturas', 'Recebidos/WhatsApp',
      'Leitura/Livros', 'Leitura/Artigos',
      'Instaladores', 'Midia/Audio', 'Midia/Video', 'Midia/Legendas',
      'Downloads/Arquivos', 'Downloads/Torrents', 'Backups', 'Triagem'
    ]
  },
  {
    id: 'designer',
    label: 'Designer',
    why: 'Muita versão do mesmo arquivo e muita referência solta. O nome do arquivo é o controle de versão.',
    pergunta: ['Você trabalha por cliente ou por projeto?', 'Precisa achar entrega antiga de cliente?'],
    sinais: ['.psd', '.ai', '.png', '.pdf'],
    fortes: ['.fig', '.sketch', '.indd', '.afdesign', '.afphoto', '.xd'],
    // "Clientes", "Referencias" e "Portfolio" existem no disco de TODO profissional
    // criativo. Sinal que todo mundo tem nao e sinal — so sobra o que e so deste.
    pastas: [/mockups?/i, /^exporta[çc][õo]es$/i, /^(icones|icons)$/i],
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
    id: 'artista3d',
    label: 'Artista 3D',
    why: 'Cena, texturas, cache e render sao arquivos diferentes do mesmo trabalho. Render sai em sequencia de centenas de quadros.',
    pergunta: ['Voce organiza por shot ou por asset?', 'Guarda os caches e os passes?'],
    sinais: ['.png', '.jpg', '.mp4'],
    fortes: ['.blend', '.c4d', '.ma', '.mb', '.max', '.hip', '.usd', '.usdz', '.abc', '.ztl', '.spp', '.sbsar', '.exr', '.hdr'],
    pastas: [/^(assets?|cenas?|scenes?)$/i, /^(texturas?|textures?)$/i, /^(renders?|saida|output)$/i, /^(cache|sim|simula)/i, /^hdri?s?$/i],
    jamais: ['Projetos/{projeto}/04-Cache'],
    tree: [
      'Projetos/{projeto}/01-Cena', 'Projetos/{projeto}/02-Modelos',
      'Projetos/{projeto}/03-Texturas', 'Projetos/{projeto}/04-Cache',
      'Projetos/{projeto}/05-Render', 'Projetos/{projeto}/06-Composicao',
      'Projetos/{projeto}/07-Entregas',
      'Biblioteca/Modelos', 'Biblioteca/Texturas', 'Biblioteca/HDRI',
      'Biblioteca/Materiais', 'Biblioteca/Rigs',
      'Referencias/{tema}', 'Portfolio',
      'Clientes/{cliente}/Briefing', 'Clientes/{cliente}/Contratos',
      'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'motion',
    label: 'Motion designer',
    why: 'Projeto de animacao amarra dezenas de arquivos externos. Perder um link quebra o projeto inteiro.',
    pergunta: ['Usa pasta de projeto padronizada?', 'Guarda os pre-renders?'],
    sinais: ['.mp4', '.mov', '.png', '.psd'],
    fortes: ['.aep', '.aepx', '.mogrt', '.lottie', '.aet'],
    pastas: [/^(comps?|composicoes)$/i, /^(pre.?renders?)$/i, /^(mogrts?|templates?)$/i, /^footage$/i],
    jamais: ['Projetos/{projeto}/04-PreRender'],
    tree: [
      'Projetos/{projeto}/01-Projeto', 'Projetos/{projeto}/02-Assets',
      'Projetos/{projeto}/03-Audio', 'Projetos/{projeto}/04-PreRender',
      'Projetos/{projeto}/05-Entregas',
      'Biblioteca/Templates', 'Biblioteca/Trilhas', 'Biblioteca/EfeitosSonoros',
      'Biblioteca/Texturas', 'Referencias/{tema}', 'Portfolio',
      'Clientes/{cliente}/Briefing', 'Clientes/{cliente}/Contratos',
      'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'musico',
    label: 'Musico ou produtor',
    why: 'Projeto de audio depende de samples que moram fora dele. E cada versao de mixagem e um arquivo novo.',
    pergunta: ['Organiza por faixa ou por album?', 'Guarda as stems?'],
    sinais: ['.wav', '.mp3', '.aif'],
    fortes: ['.logicx', '.als', '.flp', '.ptx', '.rpp', '.cpr', '.band', '.nki', '.mid', '.adg'],
    pastas: [/^(stems?|multipistas?)$/i, /^(samples?|amostras?)$/i, /^(mixagens?|mixes?)$/i, /^(masters?|masteriza)/i],
    jamais: ['Projetos/{projeto}/03-Stems'],
    tree: [
      'Projetos/{projeto}/01-Projeto', 'Projetos/{projeto}/02-Gravacoes',
      'Projetos/{projeto}/03-Stems', 'Projetos/{projeto}/04-Mixagens',
      'Projetos/{projeto}/05-Masters',
      'Biblioteca/Samples', 'Biblioteca/Presets', 'Biblioteca/MIDI',
      'Biblioteca/Instrumentos',
      'Referencias', 'Portfolio', 'Shows',
      'Clientes/{cliente}/Contratos', 'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'ilustrador',
    label: 'Ilustrador',
    why: 'Muito rascunho, muita camada, muita versao. E o arquivo de trabalho e enorme comparado a entrega.',
    pergunta: ['Separa rascunho de arte final?', 'Trabalha por encomenda?'],
    sinais: ['.png', '.jpg', '.pdf'],
    fortes: ['.procreate', '.clip', '.csp', '.kra', '.xcf'],
    pastas: [/^(rascunhos?|sketches?|studies)$/i, /^(finais?|arte.?final)$/i, /^(pinceis|brushes)$/i, /^(paletas?)$/i],
    jamais: ['Biblioteca/Pinceis'],
    tree: [
      'Trabalhos/{projeto}/01-Rascunhos', 'Trabalhos/{projeto}/02-Lineart',
      'Trabalhos/{projeto}/03-Cor', 'Trabalhos/{projeto}/04-Final',
      'Trabalhos/{projeto}/05-Entregas',
      'Biblioteca/Pinceis', 'Biblioteca/Paletas', 'Biblioteca/Texturas',
      'Estudos/{ano}', 'Referencias/{tema}', 'Portfolio',
      'Clientes/{cliente}/Briefing', 'Clientes/{cliente}/Contratos',
      'Financeiro/Notas', 'Capturas'
    ]
  },
  {
    id: 'gamer',
    label: 'Jogador',
    why: 'Save, mod, captura, replay e gravacao de duas horas sao coisas diferentes, e todas viram um monte de arquivo com nome automatico.',
    pergunta: ['Voce grava as partidas?', 'Usa mods ou emuladores?'],
    sinais: ['.mp4', '.png', '.jpg', '.zip'],
    fortes: ['.sav', '.srm', '.esp', '.pak', '.dem', '.replay', '.nes', '.sfc', '.gba', '.rofl'],
    pastas: [/^(saves?|jogos?|games?)$/i, /^(mods?|modpacks?)$/i, /^(emuladores?|emulators?|roms?)$/i, /^(replays?|clipes?|clips?)$/i],
    jamais: ['Jogos/{jogo}/Saves'],
    tree: [
      'Jogos/{jogo}/Saves', 'Jogos/{jogo}/Mods', 'Jogos/{jogo}/Capturas',
      'Jogos/{jogo}/Replays', 'Jogos/{jogo}/Configuracoes',
      'Gravacoes/{jogo}', 'Clipes', 'Miniaturas',
      'Emuladores/ROMs', 'Emuladores/Saves', 'Emuladores/BIOS',
      'Instaladores', 'Capturas', 'Downloads/Arquivos', 'Downloads/Torrents'
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
    // Extensao exclusiva nao precisa ser maioria, mas precisa ser mais que
    // vestigio. Alguem com 60 saves de jogo num disco de 90 mil arquivos joga
    // as vezes; nao e "um jogador" para efeito de organizacao. Por isso a
    // pontuacao olha a fracao do disco tambem, nao so o numero absoluto.
    const massaForte = Math.min(1, Math.sqrt(fortes / 40)) * Math.min(1, (fortes / total) / 0.01);
    score += massaForte * 4;

    let pastas = 0;
    for (const re of p.pastas || []) {
      const hit = folderNames.find(n => re.test(n));
      if (hit) { pastas++; porque.push(`pasta "${hit}"`); }
    }
    // Nome de pasta so conta se houver alguma evidencia de extensao junto.
    // Uma pasta "Jogos" com 60 arquivos dentro nao transforma o disco inteiro
    // no disco de um jogador.
    score += pastas * (massaForte > 0.15 ? 2.5 : 0.6);

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
