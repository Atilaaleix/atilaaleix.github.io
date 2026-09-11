// Territorio: o que NAO pode ser movido, nunca, por nenhum motivo.
//
// Existe uma classe de arquivo cujo CAMINHO faz parte da funcao dele. O jogo
// procura o asset num caminho fixo. O Visual Studio guarda o caminho do projeto.
// O Premiere guarda o caminho absoluto de cada clipe. Mover um desses nao e
// "organizar mal" — e quebrar um programa que estava funcionando.
//
// Isso NAO se resolve com regra por arquivo. Um .png dentro de
// steamapps/common/jogo/Data/textures/ e identico a um .png solto no Downloads:
// o que muda e onde ele esta. Entao a pergunta certa nao e "que arquivo e esse",
// e sim "de quem e esse chao".
//
// Por isso a classificacao e por PASTA, sobe a arvore inteira ate a raiz
// vigiada, e e feita uma vez por pasta (com cache) em vez de uma vez por
// arquivo.
//
// A regra de ouro: territorio alheio pode ser LIDO e INDEXADO — o bicho acha o
// arquivo depois — mas nunca movido nem renomeado. Olha e nao encosta.
import fs from 'node:fs';
import path from 'node:path';

/** Pastas ou arquivos que provam "aqui mora um projeto de codigo". */
const MARCA_CODIGO = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'package.json', 'yarn.lock',
  'pnpm-lock.yaml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'requirements.txt', 'Pipfile', 'pyproject.toml', 'Gemfile',
  'composer.json', 'CMakeLists.txt', 'Makefile', 'Podfile', 'Package.swift',
  'tsconfig.json', 'deno.json', 'mix.exs', '.venv', 'venv', '__pycache__',
  '.idea', '.vscode', '.gradle', 'vendor', 'target', '.next', '.nuxt'
]);

/** Provas de que aqui mora um jogo ou um programa instalado. */
const MARCA_APP = new Set([
  'steamapps', 'steam_appid.txt', 'steam_api.dll', 'steam_api64.dll',
  'libsteam_api.dylib', 'gameinfo.txt', 'UnityPlayer.dll', 'UnityCrashHandler64.exe',
  'GameAssembly.dll', '.egstore', 'unins000.exe', 'MonoBleedingEdge',
  'goggame-galaxyFileList.ini', 'nw.dll', 'd3d12core.dll'
  // "Contents", "MacOS", "Engine", "Content", "Saved" e "Binaries" foram
  // deliberadamente removidos: sao nomes que gente de verdade usa em pasta
  // propria. O caso real (.app do macOS) ja e pego pela extensao do pacote,
  // e bloquear por nome generico e como bloquear uma pasta chamada "Documentos".
]);

/** Bibliotecas que o proprio aplicativo gerencia. Mexer corrompe o catalogo. */
const MARCA_BIBLIOTECA = new Set([
  'Previews.lrdata', 'Smart Previews.lrdata', 'Helper.lrdata',
  'CurrentVersion.apversion', 'Media Cache Files',
  'Adobe Premiere Pro Auto-Save', 'After Effects Auto-Save'
  // Mesma poda: "Masters", "Originals", "Thumbnails", "database" e "resources"
  // sao palavras comuns demais para valerem como prova.
]);

/**
 * Pastas que sao, na verdade, UM arquivo so.
 *
 * O macOS chama de pacote: por fora e uma pasta, por dentro e o documento
 * inteiro. Entrar ali e catar arquivinho e a forma mais rapida de destruir um
 * projeto do Final Cut ou uma biblioteca de Fotos.
 */
const PACOTE = new Set([
  '.app', '.bundle', '.framework', '.plugin', '.kext', '.xpc', '.prefpane',
  '.fcpbundle', '.photoslibrary', '.aplibrary', '.tvlibrary', '.musiclibrary',
  '.imovielibrary', '.theater', '.logicx', '.band', '.ptx',
  '.rtfd', '.pages', '.numbers', '.key', '.scriv', '.sparsebundle',
  '.xcodeproj', '.xcworkspace', '.playground', '.dSYM', '.lrdata',
  '.mlpackage', '.abbu', '.download', '.aplibrary', '.pkg'
]);

/** Arquivos que so fazem sentido ao lado do irmao de mesmo nome. */
const ACOMPANHANTE = new Set([
  '.xmp', '.aae', '.thm', '.lrv', '.srt', '.sub', '.idx', '.nfo', '.cue',
  '.sfv', '.md5', '.torrent', '.part', '.aria2'
]);

export const ZONA = {
  LIVRE: 'livre',
  CODIGO: 'codigo',
  APP: 'app',
  BIBLIOTECA: 'biblioteca',
  PACOTE: 'pacote',
  SISTEMA: 'sistema',
  LINK: 'link'
};

const MOTIVO = {
  codigo: 'projeto de codigo — mover quebra o build e o editor perde o caminho',
  app: 'programa ou jogo instalado — ele procura o arquivo neste caminho exato',
  biblioteca: 'biblioteca gerenciada por um aplicativo — mexer corrompe o catalogo',
  pacote: 'isto e um documento unico disfarcado de pasta',
  sistema: 'territorio do sistema operacional',
  link: 'atalho ou link simbolico — mover o alvo quebra a referencia'
};

/** @type {Map<string, {zona:string, motivo:string, marcador:string|null, raiz:string|null}>} */
const cache = new Map();

/**
 * Pastas cujo PROPRIO NOME ja e a prova.
 *
 * Faltava esta checagem e o caso mais obvio escapava: "steamapps" costuma ser
 * filho direto do Downloads, e a varredura para na pasta vigiada antes de olhar
 * o conteudo dela. Perguntar "esta pasta CONTEM um marcador?" nao basta —
 * tem que perguntar tambem "esta pasta E um marcador?".
 */
const NOME_E_PROVA = new Map([
  ['steamapps', 'app'], ['MonoBleedingEdge', 'app'], ['.egstore', 'app'],
  ['Applications', 'app'], ['Program Files', 'app'],
  ['node_modules', 'codigo'], ['.git', 'codigo'], ['.hg', 'codigo'],
  ['.svn', 'codigo'], ['venv', 'codigo'], ['.venv', 'codigo'],
  ['vendor', 'codigo'], ['target', 'codigo'], ['.next', 'codigo'],
  ['.nuxt', 'codigo'], ['.idea', 'codigo'], ['.vscode', 'codigo'],
  ['__pycache__', 'codigo'], ['.gradle', 'codigo']
]);

function olharPasta(dir) {
  let nomes;
  try { nomes = fs.readdirSync(dir); } catch { return null; }
  for (const n of nomes) {
    if (MARCA_CODIGO.has(n)) return { zona: ZONA.CODIGO, marcador: n };
    if (MARCA_APP.has(n)) return { zona: ZONA.APP, marcador: n };
    if (MARCA_BIBLIOTECA.has(n)) return { zona: ZONA.BIBLIOTECA, marcador: n };
    if (/\.(sln|csproj|vcxproj|xcodeproj|uproject|unity|godot|lrcat|cosessiondb)$/i.test(n)) {
      return { zona: n.toLowerCase().endsWith('lrcat') || n.toLowerCase().endsWith('cosessiondb')
        ? ZONA.BIBLIOTECA : ZONA.CODIGO, marcador: n };
    }
  }
  return null;
}

/**
 * Sobe do arquivo ate a raiz vigiada procurando dono.
 *
 * Subir e o ponto inteiro: a versao antiga olhava so a pasta imediata, entao um
 * .png em steamapps/common/jogo/Data/textures/ parecia bagunca solta. O dono
 * quase nunca esta no mesmo andar do arquivo.
 *
 * @param {string} file
 * @param {{raizes?:string[], forbiddenRoots?:string[]}} [opts]
 * @returns {{zona:string, motivo:string, marcador:string|null, raiz:string|null, podeMover:boolean}}
 */
export function classificar(file, { raizes = [], forbiddenRoots = [] } = {}) {
  const livre = { zona: ZONA.LIVRE, motivo: '', marcador: null, raiz: null, podeMover: true };

  const abs = path.resolve(file);

  // Atalho e link simbolico: mover o alvo quebra quem aponta para ele.
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) {
      return { zona: ZONA.LINK, motivo: MOTIVO.link, marcador: null, raiz: null, podeMover: false };
    }
  } catch { /* sumiu no meio do caminho */ }

  const limites = raizes.map(r => path.resolve(r));
  let dir = path.dirname(abs);

  for (let subiu = 0; subiu < 24; subiu++) {
    // A pasta vigiada E a zona de bagunca, por definicao. Se alguem descompactou
    // um steamapps dentro do Downloads, isso nao transforma o Downloads inteiro
    // em territorio da Valve — so o steamapps. Sem esta linha, um unico jogo
    // baixado desligava o bicho para a pasta toda.
    if (limites.some(l => dir === l)) break;

    // Territorio do sistema: decide na hora, sem olhar dentro.
    for (const root of forbiddenRoots) {
      const r = path.resolve(root);
      if (dir === r || dir.startsWith(r + path.sep)) {
        return { zona: ZONA.SISTEMA, motivo: MOTIVO.sistema, marcador: path.basename(r), raiz: r, podeMover: false };
      }
    }

    // O nome da propria pasta ja prova de quem e o chao.
    const nomeDir = path.basename(dir);
    if (NOME_E_PROVA.has(nomeDir)) {
      const zona = NOME_E_PROVA.get(nomeDir);
      return { zona, motivo: MOTIVO[zona], marcador: nomeDir, raiz: dir, podeMover: false };
    }

    // Pacote: a extensao da PASTA e que denuncia.
    const ext = path.extname(dir).toLowerCase();
    if (ext && PACOTE.has(ext)) {
      return { zona: ZONA.PACOTE, motivo: MOTIVO.pacote, marcador: path.basename(dir), raiz: dir, podeMover: false };
    }

    if (!cache.has(dir)) {
      const achado = olharPasta(dir);
      cache.set(dir, achado
        ? { zona: achado.zona, motivo: MOTIVO[achado.zona], marcador: achado.marcador, raiz: dir }
        : { zona: ZONA.LIVRE, motivo: '', marcador: null, raiz: null });
    }
    const c = cache.get(dir);
    if (c.zona !== ZONA.LIVRE) return { ...c, podeMover: false };

    const pai = path.dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }

  return livre;
}

/**
 * O arquivo tem um irmao de mesmo nome que precisa viajar junto?
 *
 * Mover um RAW sem o .xmp do lado apaga a edicao. Mover um filme sem a legenda
 * quebra a legenda. Quando existe acompanhante, os dois viram um pacote so.
 *
 * @param {string} file
 * @returns {string[]} caminhos que devem se mover junto
 */
export function acompanhantes(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let nomes;
  try { nomes = fs.readdirSync(dir); } catch { return []; }

  const juntos = [];
  for (const n of nomes) {
    if (n === path.basename(file)) continue;
    const e = path.extname(n).toLowerCase();
    if (!ACOMPANHANTE.has(e)) continue;
    // "IMG_001.xmp" acompanha "IMG_001.CR3"; "IMG_001.CR3.xmp" tambem.
    const nBase = path.basename(n, path.extname(n));
    if (nBase === base || nBase === path.basename(file) || nBase.startsWith(base + '.')) {
      juntos.push(path.join(dir, n));
    }
  }
  return juntos;
}

/** Zera o cache. So faz sentido em teste, ou depois de o usuario mexer no disco. */
export function limparCache() { cache.clear(); }

export { PACOTE, ACOMPANHANTE };
