// Varredura do computador inteiro. So leitura, sem abrir arquivo nenhum.
//
// E a primeira coisa que o bicho faz, e ela precisa ser rapida e inofensiva:
// le nome, tamanho e data. Nao abre, nao le conteudo, nao move nada. Um disco
// com meio milhao de arquivos tem que sair em menos de um minuto.
//
// O que ela descobre e o que faz as perguntas ficarem curtas depois: quantos
// arquivos existem, de que tipo, quais pastas parecem projeto, quais parecem
// cliente, onde esta a bagunca, e que profissao esse disco sugere.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import platform from '../platform/index.js';
import { guessProfile } from './presets.js';

/** Pastas que nao interessam e que so fariam a varredura demorar. */
const PULAR = new Set([
  'Library', 'Applications', 'System', 'Volumes', 'private', 'opt', 'usr', 'bin', 'sbin',
  'AppData', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData',
  'node_modules', '.git', '.svn', '.hg', '.venv', 'venv', '__pycache__', '.gradle',
  '.cache', '.npm', '.cargo', '.rustup', '.docker', '.Trash', '$RECYCLE.BIN',
  'steamapps', 'DerivedData', 'Pods', 'vendor', 'target', '.next', '.nuxt',
  'Music', 'Movies'   // bibliotecas gerenciadas pelo sistema: nao sao bagunca
]);

/** Pasta que e um documento so: conta como UM item e nao se entra nela. */
const PACOTE = /\.(app|bundle|framework|photoslibrary|fcpbundle|logicx|band|aplibrary|imovielibrary|musiclibrary|tvlibrary|rtfd|pages|numbers|key|scriv|sparsebundle|xcodeproj|xcworkspace|lrdata|dSYM|playground)$/i;

/** Nomes de pasta genericos demais para serem nome de cliente ou de projeto. */
const GENERICA = new Set([
  'documentos', 'documents', 'downloads', 'desktop', 'imagens', 'pictures', 'fotos',
  'photos', 'videos', 'movies', 'musica', 'music', 'arquivos', 'files', 'trabalho',
  'work', 'pessoal', 'personal', 'geral', 'diversos', 'outros', 'temp', 'tmp', 'novo',
  'new', 'backup', 'backups', 'old', 'antigo', 'arquivo', 'projetos', 'projects',
  'clientes', 'clients', 'assets', 'src', 'dist', 'build', 'public', 'static', 'img',
  'images', 'icons', 'fonts', 'data', 'logs', 'test', 'tests', 'doc', 'docs'
]);

/**
 * @typedef {object} Inventario
 * @property {number} arquivos
 * @property {number} pastas
 * @property {number} bytes
 * @property {Record<string, number>} porExtensao
 * @property {string[]} nomesDePasta
 * @property {Array<{caminho:string, rel:string, arquivos:number, mtimeMs:number}>} candidatasInstancia
 * @property {Array<{caminho:string, soltos:number}>} focosDeBagunca
 * @property {number} segundos
 * @property {boolean} truncada
 * @property {string[]} raizes
 * @property {{downloads:string,desktop:string,documents:string,home:string}} pastasDoUsuario
 */

/**
 * @param {{raizes?:string[], maxArquivos?:number, maxSegundos?:number,
 *          aoProgredir?:(n:number, onde:string)=>void}} [opts]
 * @returns {Inventario}
 */
export function varrer({
  raizes = null,
  maxArquivos = 900000,
  maxSegundos = 120,
  aoProgredir = null,
} = {}) {
  const home = os.homedir();
  const pastasDoUsuario = platform.userFolders();
  const alvos = raizes && raizes.length ? raizes : [home];
  const proibidas = platform.forbiddenRoots().map(r => path.resolve(r));

  /** @type {Record<string, number>} */
  const porExtensao = {};
  const nomesDePasta = new Set();
  /** @type {Array<{caminho:string, rel:string, arquivos:number, mtimeMs:number}>} */
  const candidatasInstancia = [];
  /** @type {Array<{caminho:string, soltos:number}>} */
  const focosDeBagunca = [];

  let arquivos = 0, pastas = 0, bytes = 0, truncada = false;
  const t0 = Date.now();
  let ultimoAviso = 0;

  function dentro(dir) {
    const r = path.resolve(dir);
    return proibidas.some(p => r === p || r.startsWith(p + path.sep));
  }

  function caminhar(dir, profundidade, raiz) {
    if (truncada) return 0;
    if (arquivos >= maxArquivos || (Date.now() - t0) / 1000 > maxSegundos) {
      truncada = true;
      return 0;
    }
    if (profundidade > 8) return 0;

    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return 0; }

    pastas++;
    let soltosAqui = 0, totalAbaixo = 0;

    for (const e of entradas) {
      if (e.name.startsWith('.')) continue;
      const cheio = path.join(dir, e.name);

      if (e.isSymbolicLink()) continue;

      if (e.isDirectory()) {
        // Pacote conta como um arquivo so, e a gente nao entra.
        if (PACOTE.test(e.name)) {
          arquivos++; soltosAqui++;
          const ext = path.extname(e.name).toLowerCase();
          porExtensao[ext] = (porExtensao[ext] || 0) + 1;
          continue;
        }
        if (PULAR.has(e.name) || dentro(cheio)) continue;

        nomesDePasta.add(e.name);
        const abaixo = caminhar(cheio, profundidade + 1, raiz);
        totalAbaixo += abaixo;

        // Candidata a instancia: pasta com nome proprio, cheia, nem rasa
        // demais nem funda demais. E daqui que saem "qual projeto" e
        // "qual cliente" — e a razao de nunca mais precisar perguntar do zero.
        const nomeSimples = e.name.toLowerCase();
        // Pasta de ETAPA nao e instancia. "01-Captacao", "02_Audio",
        // "03 Edicao" sao o esqueleto do projeto, nao o nome dele — e como
        // sao elas que tem arquivo dentro, ganhavam de "campanha-natal" na
        // contagem e apareciam na arvore proposta como se fossem o projeto.
        const ehEtapa = /^\d{1,2}\s*[-_.\s]/.test(e.name);
        if (abaixo >= 5 && profundidade >= 1 && profundidade <= 4 &&
            !GENERICA.has(nomeSimples) && !/^\d+$/.test(nomeSimples) && !ehEtapa &&
            e.name.length >= 3) {
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(cheio).mtimeMs; } catch { /* segue */ }
          candidatasInstancia.push({
            caminho: cheio,
            rel: path.relative(raiz, cheio),
            arquivos: abaixo,
            mtimeMs,
          });
        }
        continue;
      }

      if (!e.isFile()) continue;
      arquivos++; soltosAqui++; totalAbaixo++;
      const ext = path.extname(e.name).toLowerCase();
      if (ext && ext.length <= 12) porExtensao[ext] = (porExtensao[ext] || 0) + 1;
      try { bytes += fs.statSync(cheio).size; } catch { /* segue */ }

      if (aoProgredir && arquivos - ultimoAviso >= 5000) {
        ultimoAviso = arquivos;
        aoProgredir(arquivos, dir);
      }
    }

    // Foco de bagunca: muita coisa solta no mesmo andar, sem subpasta que
    // organize. E o retrato de uma pasta que virou deposito.
    if (soltosAqui >= 25 && profundidade <= 2) {
      focosDeBagunca.push({ caminho: dir, soltos: soltosAqui });
    }
    return totalAbaixo;
  }

  for (const raiz of alvos) {
    if (!fs.existsSync(raiz)) continue;
    caminhar(raiz, 0, raiz);
  }

  candidatasInstancia.sort((a, b) => b.arquivos - a.arquivos);
  focosDeBagunca.sort((a, b) => b.soltos - a.soltos);

  return {
    arquivos, pastas, bytes,
    porExtensao: Object.fromEntries(Object.entries(porExtensao).sort((a, b) => b[1] - a[1])),
    nomesDePasta: [...nomesDePasta],
    candidatasInstancia: candidatasInstancia.slice(0, 60),
    focosDeBagunca: focosDeBagunca.slice(0, 12),
    segundos: +((Date.now() - t0) / 1000).toFixed(1),
    truncada,
    raizes: alvos,
    pastasDoUsuario,
  };
}

/**
 * Traduz o inventario num diagnostico em portugues.
 *
 * E a primeira coisa que a pessoa le, e tem que entregar valor ANTES de pedir
 * qualquer permissao: ela ja aprende algo sobre o proprio disco sem o bicho ter
 * encostado em nada.
 *
 * @param {Inventario} inv
 */
export function diagnostico(inv) {
  const total = inv.arquivos || 1;
  const topo = Object.entries(inv.porExtensao).slice(0, 8);
  const perfil = guessProfile(inv.porExtensao, inv.nomesDePasta);

  const gb = inv.bytes / 1e9;
  const linhas = [];

  linhas.push(`${inv.arquivos.toLocaleString('pt-BR')} arquivos em ${inv.pastas.toLocaleString('pt-BR')} pastas` +
    (gb >= 0.5 ? `, ${gb.toFixed(1)} GB` : ''));

  if (topo.length) {
    linhas.push('mais comuns: ' + topo.map(([e, n]) =>
      `${e || '(sem extensao)'} ${n.toLocaleString('pt-BR')}`).join('  '));
  }

  if (inv.focosDeBagunca.length) {
    const f = inv.focosDeBagunca[0];
    linhas.push(`a pasta mais bagunçada é ${f.caminho} com ${f.soltos} arquivos soltos`);
  }

  if (inv.candidatasInstancia.length) {
    const nomes = inv.candidatasInstancia.slice(0, 5).map(c => path.basename(c.caminho));
    linhas.push(`achei ${inv.candidatasInstancia.length} pastas que parecem projeto ou cliente: ${nomes.join(', ')}` +
      (inv.candidatasInstancia.length > 5 ? '…' : ''));
  }

  return {
    perfil,
    linhas,
    truncada: inv.truncada,
    resumo: {
      arquivos: inv.arquivos,
      pastas: inv.pastas,
      gb: +gb.toFixed(1),
      extensoesDistintas: Object.keys(inv.porExtensao).length,
      instancias: inv.candidatasInstancia.length,
      focos: inv.focosDeBagunca.length,
      segundos: inv.segundos,
    },
  };
}
