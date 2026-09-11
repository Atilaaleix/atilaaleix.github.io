// Configuração do Pastinha.
// Tudo mora em ~/.pastinha/ — apagar essa pasta apaga o bicho inteiro.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import platform from '../platform/index.js';

const HOME = os.homedir();
const FOLDERS = platform.userFolders();
export const DATA_DIR = path.join(HOME, '.pastinha');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const JOURNAL_PATH = path.join(DATA_DIR, 'journal.jsonl');

const DEFAULTS = {
  // Pastas onde o bicho procura bagunça. Nada fora daqui é tocado. Nunca.
  watch: [FOLDERS.downloads, FOLDERS.desktop],

  // Para onde ele leva. Começa numa caixa de areia própria de propósito:
  // nos primeiros dias ele não encosta em ~/Documents. Quando você confiar,
  // troque para path.join(HOME, 'Documents') e ele passa a usar SUAS pastas.
  destRoot: path.join(HOME, 'Pastinha'),

  // De onde ele aprende a sua taxonomia (só leitura, ele nunca mexe aqui).
  learnFrom: [FOLDERS.documents, path.join(HOME, 'Pastinha')],

  // Acima disso ele move sozinho (quando a autonomia permitir). Abaixo, pergunta.
  autoThreshold: 0.85,

  // Nível de autonomia: 0 = só propõe (padrão e recomendado no começo)
  //                     1 = move sozinho o que veio de regra determinística
  //                     2 = move sozinho acima do limiar de confiança
  autonomy: 0,

  ollama: {
    url: 'http://127.0.0.1:11434',
    text: 'qwen3:4b',
    vision: 'qwen2.5vl:3b',
    timeoutMs: 45000
  },

  // Idioma dos nomes de arquivo gerados.
  lang: 'pt',

  // Segundos que um arquivo precisa ficar parado antes de ser considerado pronto.
  settleSeconds: 6,

  port: 4545,

  // Extensões que nunca são tocadas, por mais óbvias que pareçam.
  neverTouch: ['.crdownload', '.part', '.download', '.tmp', '.partial', '.lock'],

  // Pastas do sistema. Nunca, em nenhuma circunstância, sob nenhuma configuração.
  forbiddenRoots: platform.forbiddenRoots(),

  // Se qualquer um destes existir na pasta do arquivo, é projeto de alguém.
  projectMarkers: ['.git', 'node_modules', 'package.json', 'Cargo.toml', 'go.mod',
                   'Podfile', '.xcodeproj', 'requirements.txt', 'pom.xml', '.venv'],

  maxFileBytesToRead: 2 * 1024 * 1024
};

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k] || {}, v) : v;
  }
  return out;
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let user = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch (e) { console.error(`[pastinha] config.json inválido, usando padrões: ${e.message}`); }
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
  }
  return deepMerge(DEFAULTS, user);
}

export function saveConfig(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
