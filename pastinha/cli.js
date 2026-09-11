#!/usr/bin/env node
// Porta de entrada, e so isso.
//
// Ela existe por um motivo unico: o resto do programa importa
// node:readline/promises, que so existe a partir do Node 17. Import de ESM e
// resolvido ANTES de qualquer linha do corpo rodar — entao a checagem de
// versao que estava dentro do cli era codigo morto para exatamente quem
// precisava dela, e quem tinha Node velho levava um despejo de stack trace em
// ingles na cara, sem nenhuma mencao a versao.
//
// Este arquivo nao importa nada. Ele confere, explica em portugues, e so
// depois carrega o programa de verdade.
const maior = Number(process.versions.node.split('.')[0]);

if (!Number.isFinite(maior) || maior < 18) {
  console.error(`
  A Pastinha precisa do Node 18 ou mais novo.
  Você tem: ${process.version}

  Baixe em https://nodejs.org — o botão da esquerda, que diz LTS.
  No Mac com chip M1, M2, M3 ou M4, escolha "macOS Installer (.pkg)" ARM64.

  Depois de instalar, FECHE o Terminal e abra de novo. Ele só enxerga
  a versão nova numa janela nova.
`);
  process.exit(1);
}

await import('./cli-main.js');
