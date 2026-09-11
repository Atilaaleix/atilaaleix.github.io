// Corpus em massa: um disco inteiro, com gabarito.
//
// A caixa de areia de 26 arquivos serve para você entender o produto em dez
// minutos. Ela não serve para medir. Medir exige volume e variedade reais —
// o estudo da Microsoft com 4.801 computadores achou uma média de ~26.500
// arquivos por máquina, e mostrou que a distribuição de extensões muda com a
// PROFISSÃO da pessoa. Por isso o corpus é gerado por perfil.
//
// Cada arquivo nasce sabendo em que pasta deveria estar. Essa pasta é o gabarito:
// o bench esconde o caminho, pergunta ao classificador, e compara.
import fs from 'node:fs';
import path from 'node:path';
import { makePdf, makeDocx, makePptx, makePng, makeJpeg, makeZip } from '../platform/shared/make.js';
import { makeMp4, makeWav, makeExr, makeProjeto } from '../platform/shared/makemedia.js';

let seed = 20260911;
/** Aleatório com semente: o mesmo corpus toda vez, senão não dá para comparar rodadas. */
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;
const pad = (n, w = 2) => String(n).padStart(w, '0');

const CLIENTES = ['acme', 'borda-viva', 'kiwi', 'santoro', 'lumina', 'vega', 'mandacaru', 'perola'];
const PROJETOS = ['institucional', 'lancamento-verao', 'serie-documental', 'comercial-30s',
                  'aftermovie', 'rebranding', 'app-onboarding', 'campanha-natal'];
const TEMAS = ['tipografia', 'cores', 'embalagem', 'interface', 'editorial', 'fotografia'];
const STACKS = ['react', 'postgres', 'swift', 'rust', 'docker', 'aws'];
const MARCAS = ['nuvem-cafe', 'atlas-tenis', 'vero-agua'];
const SHOTS = ['sh010', 'sh020', 'sh030', 'sh040', 'sh050'];
const PASSES = ['beauty', 'diffuse', 'specular', 'cryptomatte', 'denoise'];
const MAPAS = ['albedo', 'roughness', 'normal', 'metallic', 'displacement', 'ao'];
const FAIXAS = ['abertura', 'refrao-alt', 'interlude', 'faixa-titulo', 'bonus'];
const JOGOS = ['elden-ring', 'stardew', 'cs2', 'minecraft', 'baldurs-gate', 'valorant', 'zelda'];
const CONSOLES = ['snes', 'gba', 'n64', 'nds', 'megadrive'];
const APARELHOS = ['geladeira', 'notebook', 'fone', 'ar-condicionado', 'maquina-de-lavar'];
const CURSOS = ['ingles', 'financas', 'design-thinking', 'python', 'fotografia'];
const SOBRENOMES = ['silva', 'okamoto', 'ferreira', 'duarte', 'nogueira', 'batista'];

/**
 * De onde cada tipo de arquivo costuma ser baixado. No Mac isso vira o
 * kMDItemWhereFroms, no Windows o Zone.Identifier — e é o sinal mais forte que
 * o sistema tem. Arquivo criado localmente não tem origem, e por isso só uma
 * parte dos arquivos recebe.
 */
const ORIGENS = {
  boleto: ['https://internetbanking.itau.com.br/boleto', 'https://app.nubank.com.br/fatura'],
  extrato: ['https://bradesco.com.br/extrato', 'https://app.nubank.com.br/extrato'],
  imposto: ['https://www.gov.br/receitafederal/irpf', 'https://servicos.receita.fazenda.gov.br'],
  nota: ['https://nfe.prefeitura.sp.gov.br', 'https://www.nfe.fazenda.gov.br'],
  artigo: ['https://arxiv.org/abs/1706.03762', 'https://www.sciencedirect.com/science/article'],
  livro: ['https://www.amazon.com.br/dp/B08', 'https://oreilly.com/library'],
  passagem: ['https://www.latamairlines.com/checkin', 'https://www.voegol.com.br/checkin'],
  fonte: ['https://fonts.google.com/specimen/Inter', 'https://www.fontshare.com'],
  instalador: ['https://www.figma.com/downloads', 'https://desktop.docker.com/mac'],
  design: ['https://www.figma.com/file/abc123', 'https://www.sketch.com/s/xyz'],
  mockup: ['https://www.freepik.com/mockup', 'https://dribbble.com/shots/2201'],
  docTecnica: ['https://developer.apple.com/documentation', 'https://docs.docker.com'],
  codigo: ['https://github.com/anthropics/repo', 'https://gitlab.com/grupo/projeto'],
  livroTec: ['https://github.com/free-programming-books'],
  arteQuadrada: ['https://www.canva.com/design', 'https://unsplash.com/photos/abc'],
  capturaSemNome: ['https://dribbble.com/shots/9910', 'https://www.behance.net/gallery/778'],
  arquivoZip: ['https://wetransfer.com/downloads/abc', 'https://drive.google.com/file/d/1a2b'],
  sample: ['https://www.epidemicsound.com/track/xy', 'https://splice.com/sounds/pack'],
  presetAudio: ['https://www.native-instruments.com/library'],
  textura: ['https://ambientcg.com/view?id=Wood023', 'https://polyhaven.com/a/wood_planks'],
  hdri: ['https://polyhaven.com/a/studio_small_08'],
  modelo3d: ['https://sketchfab.com/models/abc', 'https://www.turbosquid.com/3d-models/xy'],
  mogrt: ['https://www.motionarray.com/templates/1200'],
  pincel: ['https://procreate.com/brushes', 'https://www.brusheezy.com/brushes/1200'],
  broll: ['https://www.pexels.com/video/9910', 'https://www.artgrid.io/clip/331']
};

const TELAS = [[3024, 1964], [2560, 1440], [1920, 1080], [1512, 982], [3456, 2234], [1179, 2556]];
const CAMERAS = [['Apple', 'iPhone 15 Pro'], ['Canon', 'Canon EOS R6'], ['NIKON CORPORATION', 'NIKON Z 6_2'],
                 ['SONY', 'ILCE-7M4'], ['FUJIFILM', 'X-T5'], ['DJI', 'FC3582']];

function dataISO() {
  return `202${int(4, 6)}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
}
// O ano da foto e o ano da PASTA da foto têm que ser o mesmo, senão o corpus
// pune o classificador por acertar. Pessoa nenhuma guarda foto de 2024 em
// "Fotos/2026" — e era exatamente isso que o gerador estava fazendo.
let ultimoAnoFoto = null;
/** @type {{chave:string,i:number,fim:number}|null} */
let seqAtual = null;
/** @type {{chave:string,ext:string,i:number,fim:number}|null} */
let cacheAtual = null;
function dataExif() {
  ultimoAnoFoto = 2024 + Math.floor(rnd() * 3);
  return `${ultimoAnoFoto}:${pad(int(1, 12))}:${pad(int(1, 28))} ${pad(int(8, 22))}:${pad(int(0, 59))}:${pad(int(0, 59))}`;
}

/** Sujeira que existe em disco de verdade e quebra classificador ingênuo. */
function sujar(nome) {
  if (chance(0.08)) return nome.replace(/(\.[^.]+)$/, ' (1)$1');
  if (chance(0.06)) return nome.replace(/(\.[^.]+)$/, '_final$1');
  if (chance(0.05)) return nome.replace(/(\.[^.]+)$/, '_FINAL_v2$1');
  if (chance(0.04)) return nome.replace(/(\.[^.]+)$/, ' copy$1');
  if (chance(0.04)) return nome.toUpperCase().replace(/(\.[^.]+)$/i, m => m.toLowerCase());
  return nome;
}

// --- construtores de conteúdo -------------------------------------------------
const TEXTOS = {
  boleto: () => `BOLETO BANCARIO\nCedente Administradora ${pick(['Vila','Aurora','Central'])}\nVencimento ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}\nValor R$ ${int(80, 4000)},00\nNosso numero ${int(100000,999999)}`,
  extrato: () => `EXTRATO DE CONTA CORRENTE\nBanco ${pick(['Itau','Bradesco','Nubank','Santander'])}\nPeriodo ${pick(['janeiro','fevereiro','marco','abril','maio'])} de 202${int(4,6)}\nSaldo final R$ ${int(100,90000)},00`,
  nota: () => `NOTA FISCAL ELETRONICA DE SERVICO numero ${int(1000,99999)}\nEmitida em ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}\nPrestador servicos de ${pick(['design','video','fotografia','desenvolvimento'])}\nValor total R$ ${int(500,60000)},00`,
  contrato: () => `CONTRATO DE ${pick(['PRESTACAO DE SERVICOS','LOCACAO RESIDENCIAL','CESSAO DE IMAGEM','CONFIDENCIALIDADE'])}\nCelebrado em ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}\nEntre as partes abaixo qualificadas\nClausula primeira do objeto`,
  briefing: () => `BRIEFING ${pick(CLIENTES).toUpperCase()}\nObjetivo da campanha\nPublico alvo\nTom de voz e referencias visuais\nPrazo de entrega ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}`,
  roteiro: () => `ROTEIRO EPISODIO ${int(1,80)}\nGancho nos primeiros 15 segundos\nBloco 1 contexto\nBloco 2 demonstracao\nCTA final e card de inscricao`,
  relatorio: () => `RELATORIO ${pick(['TRIMESTRAL','MENSAL','ANUAL'])} de ${pick(['vendas','desempenho','audiencia'])}\nCrescimento de ${int(2,45)}% sobre o periodo anterior\nPrincipais indicadores e recomendacoes`,
  reuniao: () => `Notas da reuniao com ${pick(['o time de produto','o cliente','a agencia','o juridico'])}\nDecisoes tomadas\nProximos passos e responsaveis\nData ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}`,
  proposta: () => `PROPOSTA COMERCIAL\nCliente ${pick(CLIENTES)}\nEscopo do projeto de ${pick(['identidade visual','video institucional','ensaio fotografico','desenvolvimento'])}\nInvestimento R$ ${int(3000,90000)},00\nValidade 15 dias`,
  artigo: () => `${pick(['Attention Is All You Need','A Five-Year Study of File-System Metadata','Deep Residual Learning','The Unreasonable Effectiveness of Data'])}\nAbstract We present an approach that\nIntroduction Recent work has shown`,
  passagem: () => `CARTAO DE EMBARQUE\n${pick(['LATAM','GOL','AZUL'])} voo ${pick(['JJ','G3','AD'])}${int(1000,9999)}\n${pick(['GRU','CGH','GIG'])} para ${pick(['LIS','MIA','SDU','REC'])}\nData ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)} assento ${int(1,40)}${pick(['A','B','C','D'])}`,
  curriculo: () => `CURRICULO\nExperiencia profissional\nFormacao academica\nIdiomas e competencias`,
  imposto: () => `RECIBO DE ENTREGA DA DECLARACAO DE IMPOSTO DE RENDA PESSOA FISICA\nExercicio 202${int(4,6)}\nNumero do recibo ${int(10000000,99999999)}`,
  saude: () => `RESULTADO DE EXAME LABORATORIAL\nPaciente\nData da coleta ${int(1,28)}/${pad(int(1,12))}/202${int(4,6)}\nHemograma completo valores de referencia`,
  seguro: () => `APOLICE DE SEGURO ${pick(['AUTOMOVEL', 'RESIDENCIAL', 'DE VIDA'])}\nVigencia de ${int(1, 28)}/${pad(int(1, 12))}/202${int(4, 6)} a ${int(1, 28)}/${pad(int(1, 12))}/202${int(5, 7)}\nPremio anual R$ ${int(900, 8000)},00`,
  veiculo: () => `LICENCIAMENTO ANUAL DE VEICULO\nIPVA exercicio 202${int(4, 6)}\nPlaca ABC${int(1000, 9999)}\nValor R$ ${int(400, 6000)},00`,
  imovel: () => `IPTU ${int(1, 12)} parcela exercicio 202${int(4, 6)}\nInscricao imobiliaria ${int(100000, 999999)}\nValor venal do imovel`,
  garantia: () => `TERMO DE GARANTIA\nProduto ${pick(APARELHOS)}\nData da compra ${int(1, 28)}/${pad(int(1, 12))}/202${int(4, 6)}\nPrazo de 12 meses a contar da emissao da nota`,
  manual: () => `MANUAL DO USUARIO\n${pick(APARELHOS)}\nInstrucoes de instalacao e uso\nSolucao de problemas frequentes`,
  escola: () => `BOLETIM ESCOLAR\nAno letivo 202${int(4, 6)} ${int(1, 4)} bimestre\nNotas por disciplina e frequencia`,
  certificado: () => `CERTIFICADO DE CONCLUSAO DE CURSO\n${pick(CURSOS)}\nCarga horaria de ${int(20, 360)} horas\nEmitido em ${int(1, 28)}/${pad(int(1, 12))}/202${int(4, 6)}`,
  apostila: () => `APOSTILA ${pick(CURSOS).toUpperCase()}\nModulo ${int(1, 12)}\nConteudo programatico e exercicios`,
  receita: () => `RECEITA DE ${pick(['BOLO DE FUBA', 'RISOTO DE COGUMELOS', 'PAO DE QUEIJO', 'FEIJOADA'])}\nIngredientes\nModo de preparo\nRende ${int(4, 12)} porcoes`,
  investimento: () => `NOTA DE CORRETAGEM\nB3 pregao de ${int(1, 28)}/${pad(int(1, 12))}/202${int(4, 6)}\nDividendos e proventos do periodo`,
  doc: () => `DOCUMENTO\n${pick(['Anotacoes gerais','Rascunho','Lista de tarefas','Resumo'])}\nConteudo diverso sem estrutura clara`
};

const HEAD = {
  mp4: Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
  mov: Buffer.from([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]),
  mp3: Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]),
  wav: Buffer.from('RIFF????WAVEfmt '),
  ttf: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00]),
  dmg: Buffer.from([0x78, 0x01, 0x73, 0x0d, 0x62, 0x62, 0x60]),
  exe: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  bin: Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe])
};

/** @param {string} kind @param {string} [_ext] */
function conteudo(kind, _ext) {
  switch (kind) {
    case 'pdf':  return makePdf(TEXTOS[pickTexto()]());
    case 'docx': return makeDocx(TEXTOS[pickTexto()]());
    case 'pptx': return makePptx([TEXTOS.relatorio(), TEXTOS.reuniao()]);
    case 'xlsx': return makeZip([['xl/workbook.xml', '<workbook/>'],
                                 ['xl/sharedStrings.xml', `<sst><si><t>${pick(['receita','custo','cliente','mes'])}</t></si></sst>`]]);
    case 'txt':  return Buffer.from(TEXTOS[pickTexto()](), 'utf8');
    default:     return HEAD[kind] || HEAD.bin;
  }
}
/** @type {keyof typeof TEXTOS} */
let textoAtual = 'doc';
function pickTexto() { return textoAtual; }

// --- arquétipos ---------------------------------------------------------------
/**
 * @typedef {object} Arquetipo
 * @property {string} folder pasta gabarito. {} é preenchido na hora
 * @property {number} peso   quantos arquivos deste tipo, proporcionalmente
 * @property {() => {nome:string, buf:Buffer}} faz
 */

const A = {
  boleto: () => { textoAtual = 'boleto'; return { nome: sujar(`boleto_${pick(['condominio','luz','agua','internet','escola'])}_${pick(['jan','fev','mar','abr','mai','jun'])}.pdf`), buf: conteudo('pdf') }; },
  extrato: () => { textoAtual = 'extrato'; return { nome: sujar(`extrato_${pick(['itau','nubank','bradesco'])}_${pick(['janeiro','fevereiro','marco'])}.pdf`), buf: conteudo('pdf') }; },
  nota: () => { textoAtual = 'nota'; return { nome: sujar(`nota_fiscal_${int(1000, 99999)}.pdf`), buf: conteudo('pdf') }; },
  imposto: () => { textoAtual = 'imposto'; return { nome: sujar(`recibo_irpf_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  saude: () => { textoAtual = 'saude'; return { nome: sujar(`exame_${pick(['sangue','vista','cardio'])}_${dataISO()}.pdf`), buf: conteudo('pdf') }; },
  contrato: () => { textoAtual = 'contrato'; return { nome: sujar(`contrato_${pick(['prestacao','locacao','imagem','nda'])}_${pick(CLIENTES)}.pdf`), buf: conteudo('pdf') }; },
  contratoDoc: () => { textoAtual = 'contrato'; return { nome: sujar(`contrato_${pick(CLIENTES)}_v${int(1, 4)}.docx`), buf: conteudo('docx') }; },
  briefing: () => { textoAtual = 'briefing'; return { nome: sujar(`briefing_${pick(CLIENTES)}.docx`), buf: conteudo('docx') }; },
  proposta: () => { textoAtual = 'proposta'; return { nome: sujar(`proposta_comercial_${pick(CLIENTES)}.pdf`), buf: conteudo('pdf') }; },
  relatorio: () => { textoAtual = 'relatorio'; return { nome: sujar(`relatorio_${pick(['trimestral','mensal','vendas'])}_${dataISO()}.pdf`), buf: conteudo('pdf') }; },
  apresentacao: () => ({ nome: sujar(`apresentacao_${pick(['q1','q2','q3','kickoff','resultados'])}.pptx`), buf: conteudo('pptx') }),
  planilha: () => ({ nome: sujar(`${pick(['orcamento','controle','horas','custos','metricas'])}_${dataISO()}.xlsx`), buf: conteudo('xlsx') }),
  reuniao: () => { textoAtual = 'reuniao'; return { nome: sujar(`notas_reuniao_${dataISO()}.txt`), buf: conteudo('txt') }; },
  roteiro: () => { textoAtual = 'roteiro'; return { nome: sujar(`roteiro_ep${pad(int(1, 80))}.docx`), buf: conteudo('docx') }; },
  artigo: () => { textoAtual = 'artigo'; return { nome: sujar(`${pick(['paper','artigo','arxiv'])}-${int(1000, 9999)}.pdf`), buf: conteudo('pdf') }; },
  passagem: () => { textoAtual = 'passagem'; return { nome: sujar(`${pick(['passagem','boarding','eticket'])}_${pick(['latam','gol','azul'])}.pdf`), buf: conteudo('pdf') }; },
  curriculo: () => { textoAtual = 'curriculo'; return { nome: sujar(`curriculo_${pick(SOBRENOMES)}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  docVago: () => { textoAtual = 'doc'; return { nome: sujar(pick(['documento.pdf', 'documento (3).pdf', 'scan0012.pdf', 'arquivo_final.pdf', 'sem-titulo.pdf'])), buf: conteudo('pdf') }; },

  captura: () => { const [w, h] = pick(TELAS); return { nome: pick([`Screenshot 202${int(4, 6)}-${pad(int(1, 12))}-${pad(int(1, 28))} at ${pad(int(8, 22))}.${pad(int(0, 59))}.${pad(int(0, 59))}.png`, `Captura de Tela 202${int(4, 6)}-${pad(int(1, 12))}-${pad(int(1, 28))} as ${pad(int(8, 22))}.${pad(int(0, 59))}.png`]), buf: makePng(w, h) }; },
  capturaSemNome: () => { const [w, h] = pick(TELAS); return { nome: sujar(`image${int(1, 999)}.png`), buf: makePng(w, h) }; },
  fotoCamera: () => { const [mk, md] = pick(CAMERAS); const [w, h] = chance(0.5) ? [4032, 3024] : [6000, 4000]; return { nome: `${pick(['IMG', 'DSC', 'DSCF', '_DSC'])}_${pad(int(1, 9999), 4)}.jpg`, buf: makeJpeg(w, h, { make: mk, model: md, date: dataExif() }) }; },
  fotoWhats: () => ({ nome: `WhatsApp Image 202${int(4, 6)}-${pad(int(1, 12))}-${pad(int(1, 28))} at ${pad(int(8, 22))}.${pad(int(0, 59))}.${pad(int(0, 59))}.jpeg`, buf: makeJpeg(1600, 1200) }),
  scan: () => ({ nome: sujar(pick([`scan_${int(1, 999)}.jpg`, `digitalizado-${int(1, 99)}.jpg`, `foto_documento.jpg`])), buf: makeJpeg(1654, 2339) }),
  arteQuadrada: () => ({ nome: sujar(`post_${pick(['feed', 'carrossel', 'anuncio'])}_${int(1, 40)}.png`), buf: makePng(1080, 1080) }),
  banner: () => ({ nome: sujar(`banner_${pick(['topo', 'hero', 'capa'])}_${pick(CLIENTES)}.png`), buf: makePng(2400, 800) }),
  miniatura: () => ({ nome: sujar(`thumb_ep${pad(int(1, 80))}${chance(0.3) ? '_v' + int(2, 5) : ''}.png`), buf: makePng(1280, 720) }),
  logoPequeno: () => ({ nome: sujar(`${pick(['logo', 'icone', 'favicon', 'marca'])}_${pick(CLIENTES)}.png`), buf: makePng(int(120, 512), int(120, 512)) }),

  video: () => ({ nome: sujar(pick([`${pick(['A', 'B', 'C'])}${int(1, 30)}${pad(int(1, 99), 4)}.MP4`, `GX${pad(int(1, 99), 6)}.MP4`, `C${pad(int(1, 999), 4)}.MOV`, `clipe_${int(1, 99)}.mov`])), buf: HEAD[chance(0.6) ? 'mp4' : 'mov'] }),
  videoEntrega: () => ({ nome: sujar(`${pick(PROJETOS)}_${pick(['final', 'v3', 'aprovado', 'master'])}_${pick(['1080p', '4k'])}.mp4`), buf: HEAD.mp4 }),
  audio: () => ({ nome: sujar(pick([`ZOOM${pad(int(1, 99), 4)}.WAV`, `trilha_${pick(['suave', 'epica', 'lofi'])}.mp3`, `narracao_ep${int(1, 80)}.wav`])), buf: HEAD[chance(0.5) ? 'wav' : 'mp3'] }),
  legenda: () => ({ nome: sujar(`ep${pad(int(1, 80))}_${pick(['pt', 'en', 'es'])}.srt`), buf: Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nlegenda de teste\n', 'utf8') }),

  raw: () => ({ nome: `${pick(['IMG', '_DSC', 'DSCF'])}_${pad(int(1, 9999), 4)}${pick(['.CR3', '.NEF', '.ARW', '.RAF'])}`, buf: HEAD.bin }),
  sidecar: () => ({ nome: `${pick(['IMG', '_DSC'])}_${pad(int(1, 9999), 4)}.xmp`, buf: Buffer.from('<x:xmpmeta/>', 'utf8') }),
  editada: () => ({ nome: sujar(`${pick(SOBRENOMES)}-${int(1, 200)}.jpg`), buf: makeJpeg(2048, 1365) }),

  design: () => ({ nome: sujar(`${pick(PROJETOS)}${chance(0.4) ? '_v' + int(1, 6) : ''}${pick(['.fig', '.sketch', '.psd', '.ai', '.afdesign'])}`), buf: HEAD.bin }),
  fonte: () => ({ nome: `${pick(['Inter', 'Satoshi', 'Gilroy', 'Poppins', 'SourceSerif'])}-${pick(['Regular', 'Bold', 'Medium', 'Italic'])}.${pick(['ttf', 'otf'])}`, buf: HEAD.ttf }),
  mockup: () => ({ nome: sujar(`mockup_${pick(['macbook', 'iphone', 'cartaz', 'cartao'])}.psd`), buf: HEAD.bin }),
  lut: () => ({ nome: `${pick(['teal-orange', 'film-emulation', 'rec709', 'kodak-2383'])}.cube`, buf: Buffer.from('TITLE "LUT"\nLUT_3D_SIZE 33\n', 'utf8') }),
  projetoEdicao: () => ({ nome: sujar(`${pick(PROJETOS)}${pick(['.prproj', '.drp', '.aep', '.fcpbundle'])}`), buf: HEAD.bin }),

  codigo: () => ({ nome: `${pick(['index', 'server', 'utils', 'main', 'model'])}.${pick(['ts', 'tsx', 'py', 'go', 'rs'])}`, buf: Buffer.from('export function main() { return 1 }\n', 'utf8') }),
  docTecnica: () => { textoAtual = 'artigo'; return { nome: sujar(`${pick(STACKS)}-${pick(['guia', 'reference', 'cheatsheet'])}.pdf`), buf: conteudo('pdf') }; },
  credencial: () => ({ nome: `${pick(['deploy', 'ci', 'prod', 'staging'])}-key.pem`, buf: Buffer.from('-----BEGIN PRIVATE KEY-----\n', 'utf8') }),

  instalador: () => ({ nome: sujar(`${pick(['Figma', 'Docker', 'Slack', 'Obsidian', 'Rectangle', 'Chrome'])}-${int(1, 9)}.${int(0, 20)}.${pick(['dmg', 'pkg', 'exe', 'msi'])}`), buf: HEAD[chance(0.6) ? 'dmg' : 'exe'] }),
  arquivoZip: () => ({ nome: sujar(`${pick(['assets', 'entrega', 'backup', 'fotos'])}_${dataISO()}.zip`), buf: HEAD.zip }),
  // --- vida pessoal -----------------------------------------------------------
  seguro: () => { textoAtual = 'seguro'; return { nome: sujar(`apolice_seguro_${pick(['auto', 'residencial', 'vida'])}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  veiculo: () => { textoAtual = 'veiculo'; return { nome: sujar(`${pick(['ipva', 'licenciamento', 'crlv', 'multa'])}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  imovel: () => { textoAtual = 'imovel'; return { nome: sujar(`${pick(['iptu', 'escritura', 'ata-condominio'])}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  garantia: () => { textoAtual = 'garantia'; return { nome: sujar(`garantia_${pick(APARELHOS)}.pdf`), buf: conteudo('pdf') }; },
  manual: () => { textoAtual = 'manual'; return { nome: sujar(`manual_${pick(APARELHOS)}.pdf`), buf: conteudo('pdf') }; },
  escola: () => { textoAtual = 'escola'; return { nome: sujar(`boletim_${pick(['1bim', '2bim', '3bim', '4bim'])}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },
  certificado: () => { textoAtual = 'certificado'; return { nome: sujar(`certificado_${pick(CURSOS)}.pdf`), buf: conteudo('pdf') }; },
  apostila: () => { textoAtual = 'apostila'; return { nome: sujar(`apostila_${pick(CURSOS)}_mod${int(1, 12)}.pdf`), buf: conteudo('pdf') }; },
  receita: () => { textoAtual = 'receita'; return { nome: sujar(`receita_${pick(['bolo-de-fuba', 'risoto', 'pao-de-queijo'])}.pdf`), buf: conteudo('pdf') }; },
  investimento: () => { textoAtual = 'investimento'; return { nome: sujar(`nota_corretagem_${pad(int(1, 12))}_202${int(4, 6)}.pdf`), buf: conteudo('pdf') }; },

  // --- jogos ------------------------------------------------------------------
  saveJogo: () => ({ nome: `${pick(['save', 'autosave', 'quicksave', 'slot'])}${pad(int(1, 20), 2)}${pick(['.sav', '.ess', '.dat'])}`, buf: HEAD.bin }),
  mod: () => ({ nome: sujar(`${pick(['textura-hd', 'ui-melhorada', 'armas-extra', 'shader-pack', 'modpack'])}_v${int(1, 9)}${pick(['.esp', '.pak', '.zip'])}`), buf: HEAD.bin }),
  rom: () => ({ nome: `${pick(['super-mario', 'zelda', 'metroid', 'chrono', 'pokemon'])}${pick(['.nes', '.sfc', '.gba', '.n64'])}`, buf: HEAD.bin }),
  replay: () => ({ nome: `${pick(['ranked', 'partida', 'match'])}_${dataISO()}_${pad(int(1, 60), 2)}${pick(['.dem', '.replay', '.rofl'])}`, buf: HEAD.bin }),
  // Nome real de captura do Steam: appid_timestamp_indice.jpg
  capturaJogo: () => ({ nome: `${int(200, 999)}_${int(1600000000, 1790000000)}_${int(1, 40)}.jpg`, buf: makeJpeg(2560, 1440) }),
  gravacaoJogo: () => { const { buf } = makeMp4({ durationSec: int(20, 140) * 60, w: 1920, h: 1080, audio: true, mbps: 9 }); return { nome: sujar(`${pick(JOGOS)}_${pick(['gameplay', 'raid', 'ranked', 'speedrun'])}_${dataISO()}.mp4`), buf }; },
  clipeJogo: () => { const { buf } = makeMp4({ durationSec: int(8, 60), w: 1920, h: 1080, audio: true, mbps: 30 }); return { nome: sujar(`clipe_${pick(['jogada', 'highlight', 'ace', 'fail'])}_${int(1, 200)}.mp4`), buf }; },

  // --- entulho de Downloads de verdade ----------------------------------------
  downloadAnonimo: () => { textoAtual = 'doc'; return { nome: pick([`${Math.random().toString(16).slice(2, 10)}.pdf`, 'download.pdf', `download (${int(1, 9)}).pdf`, 'documento (1).pdf', 'attachment.pdf', `file_${int(10000, 99999)}.pdf`]), buf: conteudo('pdf') }; },
  downloadImagem: () => ({ nome: pick([`${Math.random().toString(16).slice(2, 12)}.jpg`, `unnamed (${int(1, 9)}).jpg`, `images (${int(1, 20)}).jpeg`, `foto_${int(1000, 9999)}.jpg`]), buf: makeJpeg(pick([800, 1200, 1600]), pick([600, 900, 1200])) }),
  maquinaVirtual: () => ({ nome: `${pick(['ubuntu', 'windows11', 'kali', 'macos'])}-${int(1, 24)}.${pick(['vmdk', 'qcow2', 'ova'])}`, buf: HEAD.bin }),
  backup: () => ({ nome: sujar(`backup_${pick(['fotos', 'documentos', 'sistema', 'projeto'])}_${dataISO()}.${pick(['bak', 'tar', 'zip'])}`), buf: HEAD.zip }),
  legendaFilme: () => ({ nome: `${pick(['Duna', 'Interestelar', 'Cidade.de.Deus', 'Parasita'])}.202${int(0, 5)}.1080p.${pick(['pt-BR', 'eng'])}.srt`, buf: Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nlegenda\n', 'utf8') }),

  // --- 3D -------------------------------------------------------------------
  projeto3d: () => ({ nome: sujar(`${pick(PROJETOS)}${chance(0.4) ? '_v' + int(1, 8) : ''}${pick(['.blend', '.c4d', '.ma', '.max', '.hip'])}`), buf: makeProjeto('BLENDER') }),
  cena3d: () => ({ nome: sujar(`${pick(SHOTS)}_${pick(['layout', 'anim', 'lighting'])}${pick(['.usd', '.usda', '.abc'])}`), buf: makeProjeto('PXR-USDC') }),
  modelo3d: () => ({ nome: sujar(`${pick(['cadeira', 'predio', 'personagem', 'arma', 'arvore', 'carro'])}_${pick(['hi', 'lo', 'game'])}${pick(['.fbx', '.obj', '.glb', '.stl'])}`), buf: HEAD.bin }),
  textura: () => ({ nome: `${pick(['madeira', 'metal', 'concreto', 'tecido', 'pele'])}_${pick(MAPAS)}_${pick(['2k', '4k', '8k'])}.png`, buf: makePng(2048, 2048) }),
  material: () => ({ nome: sujar(`${pick(['metal-escovado', 'verniz', 'tijolo', 'couro'])}${pick(['.spp', '.sbsar', '.mtlx'])}`), buf: HEAD.bin }),
  cache3d: () => {
    if (!cacheAtual || cacheAtual.i > cacheAtual.fim) {
      cacheAtual = { chave: `${pick(['fumaca', 'agua', 'destruicao', 'pano'])}`, ext: pick(['.vdb', '.bgeo']), i: 1, fim: int(30, 180) };
    }
    const nome = `${cacheAtual.chave}_${pad(cacheAtual.i, 4)}${cacheAtual.ext}`;
    cacheAtual.i++;
    return { nome, buf: HEAD.bin };
  },
  hdri: () => ({ nome: `${pick(['estudio', 'por-do-sol', 'nublado', 'hangar', 'praca'])}_${pick(['2k', '4k'])}.hdr`, buf: Buffer.from('#?RADIANCE\n', 'utf8') }),
  rig: () => ({ nome: `${pick(['personagem', 'mao', 'rosto', 'quadrupede'])}_rig_v${int(1, 6)}.ma`, buf: makeProjeto('MAYA') }),
  // Render sai em sequencia CONTIGUA, nao em numero sorteado. Gerar aleatorio
  // aqui fazia o corpus nao ter uma unica sequencia de verdade — e o detector
  // de sequencia nunca era exercitado.
  renderSeq: () => {
    if (!seqAtual || seqAtual.i > seqAtual.fim) {
      seqAtual = { chave: `${pick(SHOTS)}_${pick(PASSES)}`, i: 1, fim: int(40, 240) };
    }
    const nome = `${seqAtual.chave}.${pad(seqAtual.i, 4)}.exr`;
    seqAtual.i++;
    return { nome, buf: makeExr() };
  },

  // --- motion ---------------------------------------------------------------
  projetoMotion: () => ({ nome: sujar(`${pick(PROJETOS)}_${pick(['comp', 'v2', 'final'])}${pick(['.aep', '.aepx'])}`), buf: makeProjeto('RIFX') }),
  mogrt: () => ({ nome: `${pick(['lower-third', 'cartela', 'transicao', 'contador'])}.mogrt`, buf: HEAD.zip }),
  preRender: () => { const { buf } = makeMp4({ durationSec: int(4, 25), w: 1920, h: 1080, audio: false, mbps: 90 }); return { nome: `prerender_${pick(PROJETOS)}_${pad(int(1, 40), 3)}.mov`, buf }; },

  // --- video com duracao de verdade ------------------------------------------
  broll: () => { const { buf } = makeMp4({ durationSec: int(3, 20), w: chance(0.6) ? 3840 : 1920, h: chance(0.6) ? 2160 : 1080, audio: false, mbps: int(80, 160) }); return { nome: pick([`${pick(['A', 'B', 'C'])}${int(1, 30)}${pad(int(1, 99), 4)}.MP4`, `GX${pad(int(1, 99), 6)}.MP4`, `broll_${pick(['cidade', 'mao', 'cafe', 'janela'])}_${int(1, 60)}.mov`]), buf }; },
  gravacaoTela: () => { const [w, h] = pick(TELAS); const { buf } = makeMp4({ durationSec: int(90, 900), w, h, audio: false, mbps: 5 }); return { nome: sujar(`gravacao_${dataISO()}_${pad(int(1, 40), 2)}.mov`), buf }; },
  videoExport: () => { const { buf } = makeMp4({ durationSec: int(180, 900), w: 1920, h: 1080, audio: true, mbps: int(8, 20) }); return { nome: sujar(`${pick(PROJETOS)}_${pick(['final', 'v3', 'aprovado', 'master'])}_${pick(['1080p', '4k'])}.mp4`), buf }; },
  gravacaoLonga: () => { const { buf } = makeMp4({ durationSec: int(25, 120) * 60, w: 1920, h: 1080, audio: true, mbps: 6 }); return { nome: sujar(`${pick(['live', 'entrevista', 'aula', 'podcast'])}_${dataISO()}.mp4`), buf }; },

  // --- audio com duracao de verdade -------------------------------------------
  projetoAudio: () => ({ nome: sujar(`${pick(FAIXAS)}${chance(0.5) ? '_v' + int(1, 9) : ''}${pick(['.logicx', '.als', '.flp', '.rpp', '.ptx'])}`), buf: makeProjeto('DAW') }),
  gravacaoAudio: () => ({ nome: pick([`ZOOM${pad(int(1, 99), 4)}.WAV`, `take_${pad(int(1, 80), 3)}.wav`, `voz_${pick(FAIXAS)}.wav`]), buf: makeWav({ durationSec: int(20, 400) }) }),
  stem: () => ({ nome: `${pick(FAIXAS)}_stem_${pick(['bateria', 'baixo', 'voz', 'guitarra', 'teclas'])}.wav`, buf: makeWav({ durationSec: int(120, 300) }) }),
  mixagem: () => ({ nome: sujar(`${pick(FAIXAS)}_mix_v${int(1, 14)}.wav`), buf: makeWav({ durationSec: int(120, 300) }) }),
  masterAudio: () => ({ nome: `${pick(FAIXAS)}_master${chance(0.4) ? '_24bit' : ''}.wav`, buf: makeWav({ durationSec: int(120, 300) }) }),
  sample: () => ({ nome: `${pick(['kick', 'snare', 'hat', 'clap', 'impacto', 'riser'])}_${pad(int(1, 99), 2)}.wav`, buf: makeWav({ durationSec: rnd() * 3 + 0.3 }) }),
  midi: () => ({ nome: `${pick(['progressao', 'melodia', 'groove', 'baixo'])}_${int(1, 40)}.mid`, buf: Buffer.from('MThd', 'latin1') }),
  presetAudio: () => ({ nome: `${pick(['pad-quente', 'lead-agudo', 'bass-808', 'strings'])}${pick(['.nki', '.adg', '.fxp'])}`, buf: HEAD.bin }),

  // --- ilustracao -------------------------------------------------------------
  ilustracao: () => ({ nome: sujar(`${pick(['capa', 'personagem', 'cena', 'poster', 'mascote'])}_${pick(PROJETOS)}${pick(['.procreate', '.clip', '.psd', '.kra'])}`), buf: makeProjeto('PROCREATE') }),
  rascunho: () => ({ nome: sujar(`${pick(['rascunho', 'sketch', 'esboco', 'estudo'])}_${pad(int(1, 90), 3)}.${pick(['png', 'jpg'])}`), buf: chance(0.5) ? makePng(1600, 2000) : makeJpeg(1600, 2000) }),
  lineart: () => ({ nome: sujar(`${pick(PROJETOS)}_lineart${chance(0.4) ? '_v' + int(1, 5) : ''}.png`), buf: makePng(3000, 4000) }),
  arteFinal: () => ({ nome: sujar(`${pick(PROJETOS)}_arte-final_${pick(['web', 'print', 'a3'])}.png`), buf: makePng(3508, 4961) }),
  pincel: () => ({ nome: `${pick(['carvao', 'aquarela', 'textura-papel', 'guache'])}.${pick(['abr', 'brushset'])}`, buf: HEAD.bin }),
  paleta: () => ({ nome: `paleta_${pick(['outono', 'pastel', 'neon', 'terra'])}.${pick(['ase', 'aco'])}`, buf: HEAD.bin }),

  livro: () => { textoAtual = 'artigo'; return { nome: sujar(`${pick(['refactoring', 'shape-up', 'design-systems', 'atomic-habits'])}.epub`), buf: HEAD.zip }; }
};

// --- distribuição por perfil ---------------------------------------------------
/** @type {Record<string, Array<[string, keyof typeof A, number]>>} */
const PERFIS = {
  geral: [
    ['Financeiro/Contas', 'boleto', 90], ['Financeiro/Extratos', 'extrato', 40],
    ['Financeiro/Impostos', 'imposto', 12], ['Documentos/Saude', 'saude', 18],
    ['Juridico/Contratos', 'contrato', 20], ['Carreira', 'curriculo', 6],
    ['Trabalho/Apresentacoes', 'apresentacao', 30], ['Trabalho/Relatorios', 'relatorio', 25],
    ['Trabalho/Reunioes', 'reuniao', 35], ['Trabalho/Planilhas', 'planilha', 40],
    ['Viagens', 'passagem', 14], ['Leitura/Artigos', 'artigo', 22], ['Leitura/Livros', 'livro', 10],
    ['Fotos/{ano}', 'fotoCamera', 240], ['Capturas', 'captura', 150],
    ['Recebidos/WhatsApp', 'fotoWhats', 120], ['Documentos/Digitalizados', 'scan', 30],
    ['Instaladores', 'instalador', 25], ['Midia/Audio', 'audio', 30], ['Midia/Video', 'video', 25],
    ['Downloads/Arquivos', 'arquivoZip', 45], ['Triagem', 'docVago', 40],
    ['Triagem', 'downloadAnonimo', 60], ['Imagens', 'downloadImagem', 70],
    ['Financeiro/Investimentos', 'investimento', 30],
    ['Financeiro/Recibos', 'nota', 35],
    ['Documentos/Seguros', 'seguro', 22], ['Documentos/Veiculo', 'veiculo', 26],
    ['Documentos/Imovel', 'imovel', 20], ['Documentos/Garantias', 'garantia', 24],
    ['Documentos/Manuais', 'manual', 20],
    ['Familia/Escola', 'escola', 26], ['Casa/Receitas', 'receita', 18],
    ['Estudos/Certificados', 'certificado', 22], ['Estudos/Apostilas', 'apostila', 28],
    ['Midia/Legendas', 'legendaFilme', 30], ['Backups', 'backup', 20],
    ['Instaladores/Maquinas', 'maquinaVirtual', 8],
    ['Jogos/Capturas', 'capturaJogo', 40], ['Jogos/Saves', 'saveJogo', 20]
  ],
  designer: [
    ['Clientes/{cliente}/Briefing', 'briefing', 40], ['Clientes/{cliente}/Trabalho', 'design', 200],
    ['Clientes/{cliente}/Entregas', 'banner', 90], ['Clientes/{cliente}/Entregas', 'arteQuadrada', 120],
    ['Clientes/{cliente}/Aprovacoes', 'capturaSemNome', 60],
    ['Clientes/{cliente}/Contratos', 'contratoDoc', 25],
    ['Biblioteca/Fontes', 'fonte', 180], ['Biblioteca/Mockups', 'mockup', 60],
    ['Biblioteca/Icones', 'logoPequeno', 140],
    ['Referencias/{tema}', 'capturaSemNome', 220],
    ['Portfolio', 'arteQuadrada', 50], ['Exportacoes/Web', 'banner', 70],
    ['Exportacoes/Impressao', 'docVago', 40],
    ['Financeiro/Notas', 'nota', 45], ['Capturas', 'captura', 130],
    ['Trabalho/Propostas', 'proposta', 30], ['Instaladores', 'instalador', 15]
  ],
  videomaker: [
    ['Projetos/{projeto}/01-Captacao', 'broll', 500],
    ['Projetos/{projeto}/01-Captacao', 'video', 200],
    ['Projetos/{projeto}/02-Audio', 'gravacaoAudio', 180],
    ['Projetos/{projeto}/03-Graficos', 'design', 90],
    ['Projetos/{projeto}/04-Edicao', 'projetoEdicao', 60],
    ['Projetos/{projeto}/05-Entregas', 'videoExport', 80],
    ['Projetos/{projeto}/06-Aprovacao', 'capturaSemNome', 50],
    ['Biblioteca/Trilhas', 'audio', 200], ['Biblioteca/LUTs', 'lut', 60],
    ['Biblioteca/Stock', 'video', 120],
    ['Clientes/{cliente}/Contratos', 'contrato', 30], ['Clientes/{cliente}/Briefing', 'briefing', 25],
    ['ArquivoMorto/{ano}', 'videoEntrega', 90],
    ['Financeiro/Notas', 'nota', 40], ['Capturas', 'captura', 80], ['Instaladores', 'instalador', 12]
  ],
  fotografo: [
    ['Ensaios/{ano}/{ensaio}/RAW', 'raw', 900], ['Ensaios/{ano}/{ensaio}/RAW', 'sidecar', 300],
    ['Ensaios/{ano}/{ensaio}/Selecao', 'fotoCamera', 260],
    ['Ensaios/{ano}/{ensaio}/Editadas', 'editada', 220],
    ['Ensaios/{ano}/{ensaio}/Entrega', 'editada', 160],
    ['Ensaios/{ano}/{ensaio}/Contrato', 'contrato', 30],
    ['Pessoal/{ano}', 'fotoCamera', 200], ['Portfolio', 'editada', 60],
    ['Financeiro/Notas', 'nota', 40], ['Capturas', 'captura', 70],
    ['Trabalho/Propostas', 'proposta', 20], ['Instaladores', 'instalador', 10]
  ],
  programador: [
    ['Codigo/{projeto}', 'codigo', 600],
    ['Documentacao/{stack}', 'docTecnica', 90], ['Referencias/Artigos', 'artigo', 70],
    ['Referencias/Livros', 'livro', 30],
    ['Credenciais', 'credencial', 20], ['Configuracoes', 'codigo', 40],
    ['Instaladores', 'instalador', 45],
    ['Trabalho/Reunioes', 'reuniao', 60], ['Trabalho/Specs', 'docVago', 40],
    ['Trabalho/Planilhas', 'planilha', 25],
    ['Capturas', 'captura', 220], ['Financeiro/Notas', 'nota', 35],
    ['Carreira', 'curriculo', 5], ['Downloads/Arquivos', 'arquivoZip', 40]
  ],
  artista3d: [
    ['Projetos/{projeto}/01-Cena', 'projeto3d', 70], ['Projetos/{projeto}/01-Cena', 'cena3d', 40],
    ['Projetos/{projeto}/02-Modelos', 'modelo3d', 150],
    ['Projetos/{projeto}/03-Texturas', 'textura', 320],
    ['Projetos/{projeto}/04-Cache', 'cache3d', 240],
    ['Projetos/{projeto}/05-Render', 'renderSeq', 900],
    ['Projetos/{projeto}/06-Composicao', 'projetoMotion', 40],
    ['Projetos/{projeto}/07-Entregas', 'videoExport', 50],
    ['Biblioteca/Modelos', 'modelo3d', 120], ['Biblioteca/Texturas', 'textura', 180],
    ['Biblioteca/HDRI', 'hdri', 60], ['Biblioteca/Materiais', 'material', 90],
    ['Biblioteca/Rigs', 'rig', 40],
    ['Referencias/{tema}', 'capturaSemNome', 160], ['Portfolio', 'arteQuadrada', 40],
    ['Clientes/{cliente}/Briefing', 'briefing', 25], ['Clientes/{cliente}/Contratos', 'contrato', 20],
    ['Financeiro/Notas', 'nota', 35], ['Capturas', 'captura', 110], ['Instaladores', 'instalador', 12]
  ],
  motion: [
    ['Projetos/{projeto}/01-Projeto', 'projetoMotion', 120],
    ['Projetos/{projeto}/02-Assets', 'logoPequeno', 120],
    ['Projetos/{projeto}/02-Assets', 'banner', 80],
    ['Projetos/{projeto}/02-Assets', 'broll', 180],
    ['Projetos/{projeto}/03-Audio', 'gravacaoAudio', 90],
    ['Projetos/{projeto}/04-PreRender', 'preRender', 260],
    ['Projetos/{projeto}/05-Entregas', 'videoExport', 110],
    ['Biblioteca/Templates', 'mogrt', 80], ['Biblioteca/Trilhas', 'sample', 40],
    ['Biblioteca/EfeitosSonoros', 'sample', 160], ['Biblioteca/Texturas', 'textura', 120],
    ['Referencias/{tema}', 'capturaSemNome', 150], ['Portfolio', 'videoExport', 40],
    ['Clientes/{cliente}/Briefing', 'briefing', 30], ['Clientes/{cliente}/Contratos', 'contrato', 25],
    ['Financeiro/Notas', 'nota', 35], ['Capturas', 'captura', 120]
  ],
  musico: [
    ['Projetos/{projeto}/01-Projeto', 'projetoAudio', 110],
    ['Projetos/{projeto}/02-Gravacoes', 'gravacaoAudio', 420],
    ['Projetos/{projeto}/03-Stems', 'stem', 380],
    ['Projetos/{projeto}/04-Mixagens', 'mixagem', 260],
    ['Projetos/{projeto}/05-Masters', 'masterAudio', 90],
    ['Biblioteca/Samples', 'sample', 520], ['Biblioteca/MIDI', 'midi', 140],
    ['Biblioteca/Presets', 'presetAudio', 120],
    ['Referencias', 'sample', 60], ['Portfolio', 'masterAudio', 40],
    ['Shows', 'gravacaoLonga', 40],
    ['Clientes/{cliente}/Contratos', 'contrato', 25],
    ['Financeiro/Notas', 'nota', 35], ['Capturas', 'captura', 90]
  ],
  ilustrador: [
    ['Trabalhos/{projeto}/01-Rascunhos', 'rascunho', 420],
    ['Trabalhos/{projeto}/02-Lineart', 'lineart', 200],
    ['Trabalhos/{projeto}/03-Cor', 'ilustracao', 260],
    ['Trabalhos/{projeto}/04-Final', 'arteFinal', 180],
    ['Trabalhos/{projeto}/05-Entregas', 'arteQuadrada', 120],
    ['Biblioteca/Pinceis', 'pincel', 90], ['Biblioteca/Paletas', 'paleta', 50],
    ['Biblioteca/Texturas', 'textura', 80],
    ['Estudos/{ano}', 'rascunho', 220], ['Referencias/{tema}', 'capturaSemNome', 200],
    ['Portfolio', 'arteFinal', 60],
    ['Clientes/{cliente}/Briefing', 'briefing', 30], ['Clientes/{cliente}/Contratos', 'contrato', 20],
    ['Financeiro/Notas', 'nota', 35], ['Capturas', 'captura', 100]
  ],
  gamer: [
    ['Jogos/{jogo}/Saves', 'saveJogo', 220], ['Jogos/{jogo}/Mods', 'mod', 180],
    ['Jogos/{jogo}/Capturas', 'capturaJogo', 900],
    ['Jogos/{jogo}/Replays', 'replay', 260],
    ['Gravacoes/{jogo}', 'gravacaoJogo', 140], ['Clipes', 'clipeJogo', 320],
    ['Miniaturas', 'miniatura', 60],
    ['Emuladores/ROMs', 'rom', 180], ['Emuladores/Saves', 'saveJogo', 90],
    ['Instaladores', 'instalador', 90], ['Capturas', 'captura', 260],
    ['Downloads/Arquivos', 'backup', 70], ['Downloads/Arquivos', 'arquivoZip', 90],
    ['Downloads/Torrents', 'downloadAnonimo', 40],
    ['Midia/Legendas', 'legendaFilme', 60], ['Financeiro/Contas', 'boleto', 40]
  ],
  youtuber: [
    ['Canal/{episodio}/01-Roteiro', 'roteiro', 80],
    ['Canal/{episodio}/02-Bruto', 'gravacaoTela', 200],
    ['Canal/{episodio}/02-Bruto', 'broll', 400],
    ['Canal/{episodio}/03-Edicao', 'projetoEdicao', 80],
    ['Canal/{episodio}/04-Miniatura', 'miniatura', 200],
    ['Canal/{episodio}/05-Publicado', 'videoExport', 90],
    ['Canal/{episodio}/06-Legendas', 'legenda', 120],
    ['Biblioteca/Trilhas', 'sample', 160], ['Biblioteca/Vinhetas', 'broll', 60],
    ['Marca/Logos', 'logoPequeno', 60], ['Marca/Templates', 'design', 50],
    ['Patrocinios/{marca}/Contratos', 'contrato', 30],
    ['Patrocinios/{marca}/Material', 'design', 60],
    ['Metricas', 'planilha', 40], ['Capturas', 'captura', 180],
    ['Financeiro/Notas', 'nota', 35]
  ]
};

function preencher(folder) {
  return folder
    .replace('{cliente}', () => pick(CLIENTES))
    .replace('{projeto}', () => pick(PROJETOS))
    .replace('{tema}', () => pick(TEMAS))
    .replace('{shot}', () => pick(SHOTS))
    .replace('{jogo}', () => pick(JOGOS))
    .replace('{console}', () => pick(CONSOLES))
    .replace('{stack}', () => pick(STACKS))
    .replace('{marca}', () => pick(MARCAS))
    .replace('{ano}', () => String(ultimoAnoFoto || 2024 + Math.floor(rnd() * 3)))
    .replace('{ensaio}', () => `${pad(int(1, 12))}-${pick(['casamento', 'newborn', 'corporativo', 'gestante', 'produto'])}-${pick(SOBRENOMES)}`)
    .replace('{episodio}', () => `ep-${pad(int(1, 80))}`);
}

/**
 * @param {{persona?:string, n?:number, root:string, soltos?:number}} opts
 */
export function buildCorpus({ persona = 'geral', n = 5000, root, soltos = 300 }) {
  const dist = PERFIS[persona];
  if (!dist) throw new Error(`perfil desconhecido: ${persona}. use: ${Object.keys(PERFIS).join(', ')}`);

  const organizado = path.join(root, 'Organizado');
  const entrada = path.join(root, 'Entrada');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(organizado, { recursive: true });
  fs.mkdirSync(entrada, { recursive: true });

  /** @type {Record<string,string>} */
  const origens = {};
  const pesoTotal = dist.reduce((s, d) => s + d[2], 0);
  /** @type {Record<string, number>} */
  const porExt = {};
  const pastas = new Set();
  let escritos = 0;

  for (const [folderTpl, arquetipo, peso] of dist) {
    const quantos = Math.max(1, Math.round((peso / pesoTotal) * n));
    for (let i = 0; i < quantos; i++) {
      // Gera o arquivo ANTES de resolver a pasta: uma foto define o próprio ano
      // pelo EXIF, e é esse ano que a pasta tem que usar.
      ultimoAnoFoto = null;
      const { nome, buf } = A[arquetipo]();
      const folder = preencher(folderTpl);
      const dir = path.join(organizado, folder);
      let full = path.join(dir, nome);
      if (fs.existsSync(full)) full = full.replace(/(\.[^.]+)$/, `-${i}$1`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(full, buf);
      // Nem todo arquivo foi baixado: parte nasce na própria máquina.
      const fontes = ORIGENS[arquetipo];
      if (fontes && chance(0.65)) origens[path.relative(organizado, full)] = pick(fontes);
      pastas.add(folder);
      const ext = path.extname(nome).toLowerCase();
      porExt[ext] = (porExt[ext] || 0) + 1;
      escritos++;
    }
  }

  fs.writeFileSync(path.join(organizado, '.pastinha-origins.json'), JSON.stringify(origens));

  // A pilha de bagunça: cópias dos mesmos arquétipos, mas soltas e sem pasta.
  const velho = new Date(Date.now() - 30 * 60 * 1000);
  for (let i = 0; i < soltos; i++) {
    const [, arquetipo] = pick(dist);
    const { nome, buf } = A[arquetipo]();
    let full = path.join(entrada, nome);
    if (fs.existsSync(full)) full = full.replace(/(\.[^.]+)$/, `-${i}$1`);
    fs.writeFileSync(full, buf);
    fs.utimesSync(full, velho, velho);
  }

  return {
    root, organizado, entrada, persona,
    arquivos: escritos, soltos,
    pastas: pastas.size,
    nomesDePasta: [...new Set([...pastas].flatMap(p => p.split('/')))],
    porExt: Object.fromEntries(Object.entries(porExt).sort((a, b) => b[1] - a[1]))
  };
}

export const PERFIS_DISPONIVEIS = Object.keys(PERFIS);
