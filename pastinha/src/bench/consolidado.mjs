// Medicao consolidada para o relatorio: TUDO com a mesma versao do codigo.
//
// Os numeros da sessao vieram de versoes diferentes ao longo do dia, o que
// significa que nao dava para compara-los entre si. Este script roda as quatro
// medicoes de uma vez, no mesmo commit, para o relatorio ter um conjunto
// coerente em vez de uma colcha de retalhos.
//
//   1. CLASSIFICACAO   acerto contra as pastas ja organizadas
//   2. INSTANCIA       sessao de importacao coerente, com gabarito
//   3. DECISOES        quantas perguntas a pessoa realmente responde
//   4. VAZAO           arquivos por segundo, e se degrada com o tamanho
import fs from 'node:fs';
import path from 'node:path';
const B = '/home/user/atilaaleix.github.io/pastinha';
process.env.HOME = '/tmp/relfake';
fs.rmSync('/tmp/relfake', { recursive: true, force: true });
fs.mkdirSync('/tmp/relfake/Downloads', { recursive: true });

const { buildCorpus, PERFIS_DISPONIVEIS } = await import(B + '/src/bench/corpus.js');
const { loadConfig } = await import(B + '/src/core/config.js');
const { runBench } = await import(B + '/src/bench/groundtruth.js');
const { guessProfile } = await import(B + '/src/core/presets.js');
const { propose, loadTaxonomy, limparCacheVizinhos } = await import(B + '/src/core/organize.js');
const { limparCache: limparTerritorio } = await import(B + '/src/core/territorio.js');
const { aplicarHeranca, contarDecisoes } = await import(B + '/src/core/lote.js');
const { rodarSeguranca } = await import(B + '/src/bench/seguranca.js');

const cfg0 = loadConfig();
const N = Number(process.argv[2] || 30000);
const AMOSTRA = Number(process.argv[3] || 800);

// Sessoes coerentes por perfil: instancia alvo e os arquetipos que a compoem.
const SESSOES = {
  videomaker: ['campanha-natal', ['broll', 'video']],
  artista3d: ['aftermovie', ['renderSeq']],
  youtuber: ['ep-12', ['broll', 'gravacaoTela']],
  musico: ['faixa-titulo', ['gravacaoAudio']],
  fotografo: ['03-casamento-silva', ['raw', 'sidecar']],
  designer: ['lumina', ['design', 'banner']],
  motion: ['institucional', ['projetoMotion', 'preRender']],
  ilustrador: ['rebranding', ['rascunho', 'lineart']],
  gamer: ['cs2', ['capturaJogo', 'clipeJogo']],
  programador: [null, null],
  geral: [null, null],
};

const linhas = [];
let picoRss = 0, totalArq = 0, totalGeraS = 0;
const t00 = Date.now();

console.log(`\n  RELATORIO — ${PERFIS_DISPONIVEIS.length} perfis x ${N.toLocaleString('pt-BR')} arquivos\n`);
console.log('  perfil        det   antes    raiz  estrut   age%  |  instancia  acerto  erroConf  |  decisoes  fator  | arq/s');

for (const persona of PERFIS_DISPONIVEIS) {
  limparCacheVizinhos(); limparTerritorio();
  const [alvo, arqs] = SESSOES[persona] || [null, null];
  const root = `/tmp/rel/${persona}`;

  const t0 = Date.now();
  const info = buildCorpus({ persona, n: N, root, soltos: 300, sessaoDe: alvo, sessaoArquetipos: arqs });
  const geraS = (Date.now() - t0) / 1000;
  totalGeraS += geraS; totalArq += info.arquivos;

  const perfil = guessProfile(info.porExt, info.nomesDePasta);

  // 1. classificacao
  const t1 = Date.now();
  const antes = await runBench(cfg0, { root: info.organizado, n: AMOSTRA, noModel: true, perfil: persona, semPerfil: true });
  const depois = await runBench(cfg0, { root: info.organizado, n: AMOSTRA, noModel: true, perfil: persona });
  const clsPorS = Math.round((AMOSTRA * 2) / ((Date.now() - t1) / 1000));

  // 2 e 3. instancia e decisoes, sobre a pilha de soltos
  const cfg = { ...cfg0, perfil: persona, watch: [info.entrada], learnFrom: [info.organizado], destRoot: info.organizado };
  const tax = loadTaxonomy(cfg);
  const soltos = fs.readdirSync(info.entrada).map(n => path.join(info.entrada, n));
  const props = [];
  for (const f of soltos) { try { const p = await propose(f, cfg, tax, { noModel: true }); if (p) props.push(p); } catch {} }
  aplicarHeranca(props);

  const v = props.filter(p => p && !p.skip && p.folder);
  const comSlotOriginal = v.filter(p => p.instancia);
  const preenchidos = comSlotOriginal.filter(p => !/\{/.test(String(p.folder)));
  const certo = p => alvo && String(p.folder).toLowerCase().includes(String(alvo).toLowerCase());
  const acertos = alvo ? preenchidos.filter(certo) : [];
  const errosConf = alvo ? preenchidos.filter(p => !certo(p) && (p.confidence || 0) >= 0.8) : [];
  const d = contarDecisoes(props);

  picoRss = Math.max(picoRss, process.memoryUsage().rss);

  const pc = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
  const r = {
    persona, perfilOk: perfil.preset.id === persona,
    antes: +(antes.acertoCategoriaRaiz * 100).toFixed(1),
    raiz: +(depois.acertoCategoriaRaiz * 100).toFixed(1),
    estrutural: +(depois.acertoEstrutural * 100).toFixed(1),
    age: +(depois.acertoQuandoConfiante === null ? 0 : depois.acertoQuandoConfiante * 100).toFixed(1),
    instanciaPreenchida: pc(preenchidos.length, comSlotOriginal.length),
    instanciaAcerto: alvo ? pc(acertos.length, preenchidos.length) : '—',
    errosConfiantes: errosConf.length,
    arquivosSoltos: d.arquivos, automaticos: d.automaticos,
    perguntariam: d.arquivosQuePerguntariam, decisoes: d.decisoes, fator: d.fator,
    clsPorS, geraPorS: Math.round(info.arquivos / geraS),
    pastas: info.pastas, arquivos: info.arquivos,
    porQuem: depois.byDecider,
  };
  linhas.push(r);
  console.log(`  ${persona.padEnd(12)} ${(r.perfilOk ? 'OK' : 'X ').padEnd(4)} ${String(r.antes).padStart(5)}% ${String(r.raiz).padStart(6)}% ${String(r.estrutural).padStart(6)}% ${String(r.age).padStart(6)}%  |  ` +
    `${r.instanciaPreenchida.padStart(8)} ${r.instanciaAcerto.padStart(7)} ${String(r.errosConfiantes).padStart(9)}  |  ` +
    `${String(r.decisoes).padStart(8)} ${String(r.fator).padStart(5)}x  | ${String(r.clsPorS).padStart(5)}`);

  fs.rmSync(root, { recursive: true, force: true });
}

const m = k => (linhas.reduce((s, x) => s + x[k], 0) / linhas.length).toFixed(1);
const somaQuem = {};
for (const r of linhas) for (const [k, val] of Object.entries(r.porQuem)) {
  somaQuem[k] ||= { n: 0, top: 0 }; somaQuem[k].n += val.n; somaQuem[k].top += val.top;
}
const totDec = Object.values(somaQuem).reduce((s, val) => s + val.n, 0);

// 4. seguranca
const seg = await rodarSeguranca('/tmp/rel-seg');

const resumo = {
  arquivos: totalArq, pastas: linhas.reduce((s, x) => s + x.pastas, 0),
  minutos: +((Date.now() - t00) / 60000).toFixed(1),
  antes: +m('antes'), raiz: +m('raiz'), estrutural: +m('estrutural'), age: +m('age'),
  perfisOk: linhas.filter(x => x.perfilOk).length, perfis: linhas.length,
  errosConfiantesTotal: linhas.reduce((s, x) => s + x.errosConfiantes, 0),
  soltosTotal: linhas.reduce((s, x) => s + x.arquivosSoltos, 0),
  perguntariamTotal: linhas.reduce((s, x) => s + x.perguntariam, 0),
  decisoesTotal: linhas.reduce((s, x) => s + x.decisoes, 0),
  geraPorS: Math.round(totalArq / totalGeraS),
  clsPorS: +m('clsPorS'), rssMb: Math.round(picoRss / 1048576),
  seguranca: seg, quemDecidiu: somaQuem,
};

console.log(`\n  ${resumo.arquivos.toLocaleString('pt-BR')} arquivos · ${resumo.pastas.toLocaleString('pt-BR')} pastas · ${resumo.minutos} min · pico ${resumo.rssMb} MB`);
console.log(`  CLASSIFICACAO  antes ${resumo.antes}% -> raiz ${resumo.raiz}%  estrutural ${resumo.estrutural}%  acerto quando age ${resumo.age}%`);
console.log(`  PERFIL         ${resumo.perfisOk}/${resumo.perfis}`);
console.log(`  INSTANCIA      ${resumo.errosConfiantesTotal} erros confiantes em ${resumo.perfis} perfis`);
console.log(`  DECISOES       ${resumo.perguntariamTotal} perguntas viram ${resumo.decisoesTotal} decisoes (${(resumo.perguntariamTotal / resumo.decisoesTotal).toFixed(1)}x)`);
console.log(`  SEGURANCA      ${seg.passou ? 'PASSOU' : 'REPROVOU'} — ${seg.falhasGraves} falhas, ${seg.falsosPositivos} falsos positivos`);
console.log(`  VAZAO          geracao ${resumo.geraPorS.toLocaleString('pt-BR')} arq/s · classificacao ${resumo.clsPorS} arq/s`);
console.log('\n  quem decidiu                       n    %total   acerto raiz');
for (const [k, val] of Object.entries(somaQuem).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(30)}${String(val.n).padStart(6)}  ${(val.n / totDec * 100).toFixed(1).padStart(6)}%  ${(val.top / val.n * 100).toFixed(1).padStart(9)}%`);
}

fs.writeFileSync('/tmp/relatorio.json', JSON.stringify({ resumo, perfis: linhas }, null, 2));
console.log('\n  detalhe em /tmp/relatorio.json\n');
