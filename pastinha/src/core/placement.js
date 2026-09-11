// ONDE o arquivo vai. A outra metade da pergunta que rules.js deixou em aberto.
//
// rules.js responde "o que é" (universal). Aqui responde "onde fica" (pessoal).
// A separação nasceu de um teste em massa: com as duas juntas, o classificador
// acertava 91% num disco comum e 5% no disco de um fotógrafo.
//
// Ordem de decisão, da evidência mais forte para a mais fraca:
//   1. a pasta que o usuário JÁ usa para este tipo (aprendida da Memória)
//   2. a pasta que a estrutura do perfil dele propõe
//   3. o mapa genérico
//   4. Triagem — que é a resposta honesta para "não sei"
import { getPreset } from './presets.js';

/** Mapa genérico: vale para qualquer perfil, é o piso. */
const GENERICO = {
  fatura: 'Financeiro/Contas', extrato: 'Financeiro/Extratos',
  'nota-fiscal': 'Financeiro/Notas', imposto: 'Financeiro/Impostos',
  financeiro: 'Financeiro', compra: 'Compras',
  contrato: 'Juridico/Contratos', 'doc-pessoal': 'Documentos/Pessoais',
  'doc-governo': 'Documentos/Governo', saude: 'Documentos/Saude',
  scan: 'Documentos/Digitalizados', documento: 'Triagem', texto: 'Documentos/Texto',
  curriculo: 'Carreira', carreira: 'Carreira', viagem: 'Viagens',
  apresentacao: 'Trabalho/Apresentacoes', relatorio: 'Trabalho/Relatorios',
  reuniao: 'Trabalho/Reunioes', planilha: 'Trabalho/Planilhas',
  proposta: 'Trabalho/Propostas', briefing: 'Trabalho/Briefings',
  roteiro: 'Trabalho/Roteiros', trabalho: 'Trabalho', calendario: 'Documentos/Calendario',
  artigo: 'Leitura/Artigos', livro: 'Leitura/Livros', 'doc-tecnica': 'Leitura/Tecnico',
  captura: 'Capturas', 'foto-camera': 'Fotos/{ano}', 'foto-whatsapp': 'Recebidos/WhatsApp',
  'foto-editada': 'Fotos/Editadas', imagem: 'Imagens', referencia: 'Referencias',
  'arte-social': 'Design/Social', banner: 'Design/Banners', miniatura: 'Design/Miniaturas',
  logo: 'Design/Logos', mockup: 'Design/Mockups', 'arquivo-design': 'Design',
  fonte: 'Design/Fontes', lut: 'Design/LUTs', 'modelo-3d': 'Design/3D',
  raw: 'Fotos/RAW', sidecar: 'Fotos/RAW',
  video: 'Midia/Video', 'video-bruto': 'Midia/Video/Bruto',
  'video-entrega': 'Midia/Video/Entregas', 'video-baixado': 'Midia/Video/Baixados',
  legenda: 'Midia/Legendas', audio: 'Midia/Audio', 'audio-bruto': 'Midia/Audio/Bruto',
  trilha: 'Midia/Audio/Trilhas', 'projeto-edicao': 'Midia/Projetos',
  codigo: 'Codigo', credencial: 'Credenciais', dados: 'Codigo/Dados',
  instalador: 'Instaladores', 'imagem-disco': 'Instaladores/Imagens',
  'arquivo-comprimido': 'Downloads/Arquivos', torrent: 'Downloads/Torrents'
};

/**
 * Mapas por perfil. Só o que DIFERE do genérico precisa aparecer aqui.
 * `{}` marca uma pasta que exige escolher uma instância — qual ensaio, qual
 * projeto, qual cliente. Isso não é classificação, é outra pergunta, e o
 * sistema tem que saber que não sabe.
 */
const POR_PERFIL = {
  designer: {
    'arquivo-design': 'Clientes/{cliente}/Trabalho',
    banner: 'Clientes/{cliente}/Entregas', 'arte-social': 'Clientes/{cliente}/Entregas',
    briefing: 'Clientes/{cliente}/Briefing', contrato: 'Clientes/{cliente}/Contratos',
    referencia: 'Referencias/{tema}', mockup: 'Biblioteca/Mockups',
    fonte: 'Biblioteca/Fontes', logo: 'Biblioteca/Icones',
    'nota-fiscal': 'Financeiro/Notas', proposta: 'Trabalho/Propostas'
  },
  videomaker: {
    video: 'Projetos/{projeto}/01-Captacao', 'video-bruto': 'Projetos/{projeto}/01-Captacao',
    broll: 'Projetos/{projeto}/01-Captacao', 'gravacao-tela': 'Projetos/{projeto}/01-Captacao',
    'gravacao-longa': 'Projetos/{projeto}/02-Audio', 'efeito-sonoro': 'Biblioteca/EfeitosSonoros',
    'audio-bruto': 'Projetos/{projeto}/02-Audio', audio: 'Biblioteca/Trilhas',
    trilha: 'Biblioteca/Trilhas', 'arquivo-design': 'Projetos/{projeto}/03-Graficos',
    'projeto-edicao': 'Projetos/{projeto}/04-Edicao',
    'video-entrega': 'Projetos/{projeto}/05-Entregas',
    lut: 'Biblioteca/LUTs', contrato: 'Clientes/{cliente}/Contratos',
    briefing: 'Clientes/{cliente}/Briefing', 'nota-fiscal': 'Financeiro/Notas'
  },
  fotografo: {
    raw: 'Ensaios/{ano}/{ensaio}/RAW', sidecar: 'Ensaios/{ano}/{ensaio}/RAW',
    'foto-camera': 'Ensaios/{ano}/{ensaio}/Selecao',
    'foto-editada': 'Ensaios/{ano}/{ensaio}/Editadas',
    contrato: 'Ensaios/{ano}/{ensaio}/Contrato',
    'nota-fiscal': 'Financeiro/Notas', proposta: 'Trabalho/Propostas'
  },
  programador: {
    codigo: 'Codigo/{projeto}', 'doc-tecnica': 'Documentacao/{stack}',
    credencial: 'Credenciais', dados: 'Configuracoes',
    artigo: 'Referencias/Artigos', livro: 'Referencias/Livros',
    documento: 'Trabalho/Specs', 'nota-fiscal': 'Financeiro/Notas'
  },
  artista3d: {
    'projeto-3d': 'Projetos/{projeto}/01-Cena', 'cena-3d': 'Projetos/{projeto}/01-Cena',
    'modelo-3d': 'Projetos/{projeto}/02-Modelos', textura: 'Projetos/{projeto}/03-Texturas',
    material: 'Biblioteca/Materiais', 'cache-3d': 'Projetos/{projeto}/04-Cache',
    render: 'Projetos/{projeto}/05-Render', 'pre-render': 'Projetos/{projeto}/05-Render',
    'projeto-motion': 'Projetos/{projeto}/06-Composicao',
    'video-entrega': 'Projetos/{projeto}/07-Entregas',
    hdri: 'Biblioteca/HDRI', rig: 'Biblioteca/Rigs',
    referencia: 'Referencias/{tema}', briefing: 'Clientes/{cliente}/Briefing',
    contrato: 'Clientes/{cliente}/Contratos', 'nota-fiscal': 'Financeiro/Notas'
  },
  motion: {
    'projeto-motion': 'Projetos/{projeto}/01-Projeto',
    logo: 'Projetos/{projeto}/02-Assets', banner: 'Projetos/{projeto}/02-Assets',
    'audio': 'Biblioteca/Trilhas', 'gravacao-longa': 'Projetos/{projeto}/03-Audio',
    'arquivo-design': 'Projetos/{projeto}/02-Assets',
    'modelo-3d': 'Projetos/{projeto}/02-Assets',
    'audio-bruto': 'Projetos/{projeto}/03-Audio', trilha: 'Biblioteca/Trilhas',
    'efeito-sonoro': 'Biblioteca/EfeitosSonoros',
    'pre-render': 'Projetos/{projeto}/04-PreRender',
    'video-entrega': 'Projetos/{projeto}/05-Entregas',
    broll: 'Projetos/{projeto}/02-Assets', video: 'Projetos/{projeto}/02-Assets',
    textura: 'Biblioteca/Texturas', referencia: 'Referencias/{tema}',
    briefing: 'Clientes/{cliente}/Briefing', contrato: 'Clientes/{cliente}/Contratos',
    'nota-fiscal': 'Financeiro/Notas'
  },
  musico: {
    'projeto-audio': 'Projetos/{projeto}/01-Projeto',
    'audio-bruto': 'Projetos/{projeto}/02-Gravacoes',
    'gravacao-longa': 'Projetos/{projeto}/02-Gravacoes',
    stem: 'Projetos/{projeto}/03-Stems', mixagem: 'Projetos/{projeto}/04-Mixagens',
    'master-audio': 'Projetos/{projeto}/05-Masters',
    'efeito-sonoro': 'Biblioteca/Samples', audio: 'Biblioteca/Samples',
    midi: 'Biblioteca/MIDI', 'preset-audio': 'Biblioteca/Presets',
    trilha: 'Referencias', contrato: 'Clientes/{cliente}/Contratos',
    'nota-fiscal': 'Financeiro/Notas'
  },
  ilustrador: {
    'arte-impressao': 'Trabalhos/{projeto}/04-Final',
    ilustracao: 'Trabalhos/{projeto}/04-Final', rascunho: 'Trabalhos/{projeto}/01-Rascunhos',
    'arquivo-design': 'Trabalhos/{projeto}/03-Cor',
    'arte-social': 'Trabalhos/{projeto}/05-Entregas',
    pincel: 'Biblioteca/Pinceis', paleta: 'Biblioteca/Paletas',
    textura: 'Biblioteca/Texturas', referencia: 'Referencias/{tema}',
    briefing: 'Clientes/{cliente}/Briefing', contrato: 'Clientes/{cliente}/Contratos',
    'nota-fiscal': 'Financeiro/Notas'
  },
  gamer: {
    'save-jogo': 'Jogos/{jogo}/Saves', mod: 'Jogos/{jogo}/Mods',
    'captura-jogo': 'Jogos/{jogo}/Capturas', replay: 'Jogos/{jogo}/Replays',
    'gravacao-jogo': 'Gravacoes/{jogo}', 'gravacao-tela': 'Gravacoes/{jogo}',
    broll: 'Clipes', 'video-entrega': 'Clipes',
    rom: 'Emuladores/ROMs', 'imagem-disco': 'Emuladores/ROMs',
    instalador: 'Instaladores', captura: 'Capturas',
    'arquivo-comprimido': 'Downloads/Arquivos'
  },
  youtuber: {
    roteiro: 'Canal/{episodio}/01-Roteiro', video: 'Canal/{episodio}/02-Bruto',
    'video-bruto': 'Canal/{episodio}/02-Bruto',
    'projeto-edicao': 'Canal/{episodio}/03-Edicao',
    miniatura: 'Canal/{episodio}/04-Miniatura',
    'video-entrega': 'Canal/{episodio}/05-Publicado',
    broll: 'Canal/{episodio}/02-Bruto', 'gravacao-tela': 'Canal/{episodio}/02-Bruto',
    legenda: 'Canal/{episodio}/06-Legendas',
    audio: 'Biblioteca/Trilhas', trilha: 'Biblioteca/Trilhas',
    'efeito-sonoro': 'Biblioteca/Trilhas', 'gravacao-longa': 'Canal/{episodio}/02-Bruto',
    'audio-bruto': 'Canal/{episodio}/02-Bruto',
    logo: 'Marca/Logos', 'arquivo-design': 'Marca/Templates',
    planilha: 'Metricas', contrato: 'Patrocinios/{marca}/Contratos',
    'nota-fiscal': 'Financeiro/Notas'
  }
};

/** Quais espaços um destino exige preencher. */
export function slotsDe(folder) {
  return [...String(folder).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
}

/**
 * @typedef {object} Colocacao
 * @property {string} folder     destino, ainda com {espaços} se houver
 * @property {string[]} slots    espaços que precisam ser preenchidos
 * @property {boolean} precisaInstancia
 * @property {number} confidence
 * @property {string} via        de onde veio a decisão
 */

/**
 * @param {string} tipo
 * @param {{perfil?:string, aprendido?:Record<string,string>, ano?:number|null, semPerfil?:boolean}} ctx
 * @returns {Colocacao}
 */
export function colocar(tipo, { perfil = 'geral', aprendido = {}, ano = null, semPerfil = false } = {}) {
  let folder = null, via = 'generico', confidence = 0.7;

  // 1. O que o usuário JÁ faz com este tipo vence qualquer proposta nossa.
  if (aprendido[tipo]) {
    folder = aprendido[tipo]; via = 'aprendido'; confidence = 0.95;
  } else {
    // semPerfil existe só para o A/B do bench: simula o comportamento antigo,
    // uma taxonomia única para todo mundo.
    const doPerfil = semPerfil ? null : POR_PERFIL[perfil]?.[tipo];
    if (doPerfil) { folder = doPerfil; via = `perfil:${perfil}`; confidence = 0.85; }
    else if (GENERICO[tipo]) { folder = GENERICO[tipo]; via = 'generico'; confidence = 0.7; }
  }

  if (!folder) return { folder: 'Triagem', slots: [], precisaInstancia: false, confidence: 0.2, via: 'sem-mapa' };

  // {ano} só é preenchido quando o ano é SABIDO — EXIF da foto, data dentro do
  // documento. Nunca a data do arquivo em disco.
  //
  // Parece detalhe e não é: um RAW copiado do cartão hoje tem data de hoje e
  // pode ser de um casamento de dois anos atrás. Preencher com a data do
  // arquivo produz uma resposta errada com cara de certa, que é o pior
  // resultado possível. Sem saber, {ano} continua sendo pergunta.
  if (folder.includes('{ano}') && ano) folder = folder.replace('{ano}', String(ano));

  const slots = slotsDe(folder);
  return {
    folder,
    slots,
    precisaInstancia: slots.length > 0,
    // Destino que exige escolher um projeto ou um ensaio NÃO é uma decisão
    // confiante — é uma pergunta. Rebaixar aqui é o que impede o bicho de
    // enfiar o vídeo no projeto errado com 90% de certeza.
    confidence: slots.length ? Math.min(confidence, 0.45) : confidence,
    via
  };
}

/**
 * Aprende, da Memória, para onde ESTE usuário costuma mandar cada tipo.
 * Três decisões iguais já valem mais que qualquer preset.
 * @param {Array<{op?:string, tipo?:string, category?:string}>} entradas
 */
export function aprenderMapa(entradas) {
  /** @type {Record<string, Record<string, number>>} */
  const contagem = {};
  for (const e of entradas) {
    if (e.op !== 'move' || !e.tipo || !e.category) continue;
    (contagem[e.tipo] ||= {})[e.category] = (contagem[e.tipo]?.[e.category] || 0) + 1;
  }
  /** @type {Record<string,string>} */
  const mapa = {};
  for (const [tipo, destinos] of Object.entries(contagem)) {
    const [melhor, n] = Object.entries(destinos).sort((a, b) => b[1] - a[1])[0];
    if (n >= 3) mapa[tipo] = melhor;
  }
  return mapa;
}

export { GENERICO, POR_PERFIL };
