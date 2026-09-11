// Teste de seguranca: o que NAO pode ser movido.
//
// Este e o unico teste do projeto que nao admite porcentagem. Acuracia de
// classificacao pode ser 80%; mover um asset de jogo ou um arquivo de projeto
// tem que ser ZERO, sempre. Por isso ele vive no repositorio e nao num script
// solto: e o teste que nao pode regredir.
//
//   node cli.js seguranca
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { propose, loadTaxonomy, zonaDe } from '../core/organize.js';
import { acompanhantes, limparCache } from '../core/territorio.js';

export async function rodarSeguranca(raizBase) {
const RAIZ = raizBase || path.join(os.tmpdir(), 'pastinha-seguranca');
fs.rmSync(RAIZ, { recursive: true, force: true });
limparCache();

const w = (p, c = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const E = path.join(RAIZ, 'Entrada');

// --- territorio que NAO pode ser tocado -------------------------------------
const intocaveis = [];

// jogo instalado via Steam, com asset enterrado fundo
w(`${E}/steamapps/appmanifest_440.acf`);
w(`${E}/steamapps/common/Portal 2/portal2.exe`);
w(`${E}/steamapps/common/Portal 2/Data/textures/parede_albedo.png`);
w(`${E}/steamapps/common/Portal 2/Data/sound/ambiente_01.wav`);
intocaveis.push(`${E}/steamapps/common/Portal 2/Data/textures/parede_albedo.png`,
                `${E}/steamapps/common/Portal 2/Data/sound/ambiente_01.wav`,
                `${E}/steamapps/common/Portal 2/portal2.exe`);

// jogo Unity solto, sem Steam
w(`${E}/MeuJogo/UnityPlayer.dll`);
w(`${E}/MeuJogo/MeuJogo_Data/resources.assets`);
w(`${E}/MeuJogo/MeuJogo_Data/sharedassets0.assets`);
intocaveis.push(`${E}/MeuJogo/MeuJogo_Data/resources.assets`);

// projeto de codigo aberto no editor
w(`${E}/site-do-cliente/package.json`, '{"name":"site"}');
w(`${E}/site-do-cliente/src/index.tsx`, 'export default 1');
w(`${E}/site-do-cliente/public/logo.png`);
w(`${E}/site-do-cliente/docs/manual-do-cliente.pdf`);
intocaveis.push(`${E}/site-do-cliente/src/index.tsx`,
                `${E}/site-do-cliente/public/logo.png`,
                `${E}/site-do-cliente/docs/manual-do-cliente.pdf`);

// repositorio so com .git, sem package.json
w(`${E}/lib-antiga/.git/HEAD`, 'ref: refs/heads/main');
w(`${E}/lib-antiga/main.c`);
intocaveis.push(`${E}/lib-antiga/main.c`);

// projeto Xcode (pacote) dentro de um projeto
w(`${E}/App iOS/App.xcodeproj/project.pbxproj`);
w(`${E}/App iOS/App/ContentView.swift`);
intocaveis.push(`${E}/App iOS/App.xcodeproj/project.pbxproj`);

// pacotes do macOS: pasta que e um arquivo so
w(`${E}/Rectangle.app/Contents/MacOS/Rectangle`);
w(`${E}/Rectangle.app/Contents/Resources/icone.png`);
w(`${E}/Ferias 2026.fcpbundle/Settings.plist`);
w(`${E}/Ferias 2026.fcpbundle/Original Media/C0042.MOV`);
w(`${E}/Fotos.photoslibrary/database/Photos.sqlite`);
w(`${E}/Fotos.photoslibrary/originals/0/IMG_0042.HEIC`);
intocaveis.push(`${E}/Rectangle.app/Contents/Resources/icone.png`,
                `${E}/Ferias 2026.fcpbundle/Original Media/C0042.MOV`,
                `${E}/Fotos.photoslibrary/originals/0/IMG_0042.HEIC`);

// catalogo do Lightroom
w(`${E}/Catalogo/Ensaios-v13.lrcat`);
w(`${E}/Catalogo/Ensaios-v13 Previews.lrdata/thumb.dat`);
w(`${E}/Catalogo/IMG_9001.CR3`);
intocaveis.push(`${E}/Catalogo/IMG_9001.CR3`, `${E}/Catalogo/Ensaios-v13.lrcat`);

// link simbolico
w(`${E}/alvo-real.pdf`, 'PDF de verdade');
try { fs.symlinkSync(`${E}/alvo-real.pdf`, `${E}/atalho.pdf`); intocaveis.push(`${E}/atalho.pdf`); } catch {}

// --- bagunca de verdade, que DEVE ser movida --------------------------------
const moveis = [];
const velho = new Date(Date.now() - 30 * 60 * 1000);
for (const [nome, conteudo] of [
  ['boleto_condominio_marco.pdf', 'BOLETO condominio vencimento 15/03/2026'],
  ['IMG_4821.CR3', 'x'],
  ['Screenshot 2026-09-11 at 14.22.03.png', 'x'],
  ['setup-figma.dmg', 'x'],
  ['contrato_locacao.docx', 'x']
]) { w(path.join(E, nome), conteudo); moveis.push(path.join(E, nome)); }

// RAW com acompanhante: os dois tem que viajar juntos
w(`${E}/IMG_4821.xmp`, '<x:xmpmeta/>');

for (const f of [...intocaveis, ...moveis, `${E}/IMG_4821.xmp`]) {
  try { fs.utimesSync(f, velho, velho); } catch {}
}

// --- medicao ----------------------------------------------------------------
const cfg = { ...loadConfig(), watch: [E], destRoot: path.join(RAIZ, 'Guardados'), learnFrom: [] };
const tax = loadTaxonomy(cfg);

let falhasGraves = 0;
console.log('\n  TERRITORIO — nenhum destes pode ser proposto para mover\n');
for (const f of intocaveis) {
  const p = await propose(f, cfg, tax, { noModel: true });
  const protegido = p && p.skip;
  if (!protegido) falhasGraves++;
  const z = zonaDe(f, cfg);
  const rel = f.replace(E + '/', '');
  console.log(`  ${protegido ? 'protegido' : 'FALHA!!!!'}  ${rel.slice(0, 52).padEnd(54)} ${z.zona}${z.marcador ? ' (' + z.marcador + ')' : ''}`);
}

console.log('\n  BAGUNCA — estes precisam ser propostos normalmente\n');
let falsosPositivos = 0;
for (const f of moveis) {
  const p = await propose(f, cfg, tax, { noModel: true });
  const ok = p && !p.skip && p.folder;
  if (!ok) falsosPositivos++;
  console.log(`  ${ok ? 'proposto ' : 'BLOQUEADO'}  ${path.basename(f).slice(0, 52).padEnd(54)} ${ok ? p.folder + '/' : '(travou sem motivo)'}`);
}

const raw = path.join(E, 'IMG_4821.CR3');
const junto = acompanhantes(raw);
console.log(`\n  ACOMPANHANTE do IMG_4821.CR3: ${junto.length ? junto.map(x => path.basename(x)).join(', ') : 'NENHUM (falha)'}`);

console.log('\n  ' + '-'.repeat(62));
console.log(`  falhas de seguranca (moveria territorio alheio): ${falhasGraves}`);
console.log(`  falsos positivos (travou bagunca de verdade):     ${falsosPositivos}`);
console.log(`  acompanhante detectado:                          ${junto.length ? 'sim' : 'NAO'}`);
const passou = falhasGraves === 0 && falsosPositivos === 0 && junto.length > 0;
console.log('  ' + (passou ? 'PASSOU' : 'REPROVOU') + '\n');
fs.rmSync(RAIZ, { recursive: true, force: true });
return { passou, falhasGraves, falsosPositivos, acompanhante: junto.length > 0,
         protegidos: intocaveis.length, moveis: moveis.length };
}
