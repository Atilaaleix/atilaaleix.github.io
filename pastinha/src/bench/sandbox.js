// Uma caixa de areia com bagunça realista.
//
// Serve para dois problemas de uma vez: você testa o ciclo inteiro sem arriscar
// nenhum arquivo seu, e eu consigo testar de fora de um Mac. A bagunça aqui foi
// escolhida para bater nos casos que doem — nome sem sentido, formato mentiroso,
// duplicata, download pela metade, acento, espaço, arquivo dentro de projeto.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DATA_DIR } from '../core/config.js';
import { makeDocx, makePptx, makePdf } from '../platform/shared/make.js';

const ENTRADA = [
  ['boleto_condominio_marco.pdf', 'BOLETO BANCARIO Condominio Edificio Aurora vencimento 15/03/2026 valor R$ 890,00 cedente Administradora Vila'],
  ['fatura-nubank-2026-02.pdf', 'Fatura Nubank fechamento 02/2026 total R$ 2.341,78 pagamento ate 10/03/2026'],
  ['Screenshot 2026-09-10 at 14.22.03.png', 'PNG'],
  ['Captura de Tela 2026-08-02 as 09.11.44.png', 'PNG'],
  ['IMG_4821.jpg', 'JPEG'],
  ['DSC_0091.jpg', 'JPEG'],
  ['contrato_locacao_apto_vila_mariana.docx', 'CONTRATO DE LOCACAO RESIDENCIAL celebrado em 11/09/2026 entre Atila e a imobiliaria referente ao apartamento na Vila Mariana aluguel mensal de R$ 3.200,00'],
  ['documento sem nome (3).pdf', 'RELATORIO TRIMESTRAL de vendas primeiro trimestre crescimento de 14% sobre o periodo anterior'],
  ['zz_final_FINAL_v3 (copia).docx', 'Proposta comercial para o cliente Acme referente ao projeto de identidade visual valor R$ 45.000'],
  ['Apresentacao Q3.pptx', 'Resultados do terceiro trimestre roadmap 2027 metas de crescimento'],
  ['curriculo_atila_2026.pdf', 'CURRICULO Atila Aleixo experiencia profissional formacao academica'],
  ['WhatsApp Image 2026-09-09 at 18.30.11.jpeg', 'JPEG'],
  ['setup.dmg', 'DMG'],
  ['instalador.exe', 'EXE'],
  ['tema-escuro.fig', 'FIG'],
  ['Inter-Regular.ttf', 'TTF'],
  ['ubuntu-26.04-desktop.iso.torrent', 'TORRENT'],
  ['extrato_itau_agosto.pdf', 'EXTRATO DE CONTA CORRENTE Banco Itau agosto de 2026 saldo final'],
  ['nota_fiscal_12938.pdf', 'NOTA FISCAL ELETRONICA numero 12938 emitida em 22/07/2026 prestador de servico'],
  ['aula-03-transformers.md', '# Transformers\n\nAttention is all you need. Arquitetura de atencao, embeddings, self-attention.'],
  ['dados_clientes.csv', 'nome,email,cidade\nJoao,joao@x.com,Sao Paulo\nMaria,maria@y.com,Recife'],
  ['reuniao-2026-09-08.txt', 'Notas da reuniao com o time de produto. Decisoes: adiar o lançamento, contratar mais um designer.'],
  ['passagem-latam-gru-lis.pdf', 'CARTAO DE EMBARQUE LATAM voo JJ8084 GRU para LIS 12/12/2026 assento 24A'],
  ['comprovante_pix_2026-09-01.pdf', 'COMPROVANTE DE TRANSFERENCIA PIX valor R$ 1.500,00 destinatario'],
  ['arquivo.pdf.crdownload', 'pela metade, nao pode ser tocado'],
  ['duplicata_boleto_condominio_marco.pdf', 'BOLETO BANCARIO Condominio Edificio Aurora vencimento 15/03/2026 valor R$ 890,00 cedente Administradora Vila']
];

// Uma pasta de projeto, que o bicho tem obrigação de NÃO tocar.
const PROJETO = [
  ['package.json', '{"name":"meu-site","version":"1.0.0"}'],
  ['index.js', 'console.log("nao me mova")'],
  ['logo.png', 'PNG']
];

const DOCUMENTOS = [
  ['Financeiro/Contas/2026-01-10__boleto-condominio-janeiro.pdf', 'BOLETO condominio janeiro'],
  ['Financeiro/Contas/2026-02-10__boleto-condominio-fevereiro.pdf', 'BOLETO condominio fevereiro'],
  ['Financeiro/Extratos/2026-07-31__extrato-itau-julho.pdf', 'EXTRATO DE CONTA CORRENTE Banco Itau julho'],
  ['Juridico/Contratos/2025-11-02__contrato-prestacao-servicos.docx', 'CONTRATO DE PRESTACAO DE SERVICOS'],
  ['Juridico/Contratos/2024-05-20__contrato-locacao-anterior.pdf', 'CONTRATO DE LOCACAO residencial anterior'],
  ['Carreira/2025-03-01__curriculo-antigo.pdf', 'CURRICULO experiencia profissional'],
  ['Trabalho/Apresentacoes/2026-06-30__resultados-q2.pptx', 'Resultados do segundo trimestre'],
  ['Trabalho/Reunioes/2026-08-14__notas-reuniao-produto.txt', 'Notas da reuniao de produto'],
  ['Viagens/2026-03-12__passagem-gol-gru-rec.pdf', 'CARTAO DE EMBARQUE GOL voo G31234'],
  ['Leitura/Artigos/2025-09-01__attention-is-all-you-need.pdf', 'Attention is all you need transformers'],
  ['Design/paleta-marca.fig', 'FIG'],
  ['Design/Fontes/Inter-Bold.ttf', 'TTF'],
  ['Capturas/2026-07-01__captura-de-tela.png', 'PNG'],
  ['Fotos/2026/IMG_3001.jpg', 'JPEG'],
  ['Fotos/2025/IMG_2044.jpg', 'JPEG'],
  ['Instaladores/figma.dmg', 'DMG']
];

// Cabeçalhos reais, para o detector de tipo por bytes ter o que morder.
const HEADERS = {
  PNG: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  JPEG: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  DMG: Buffer.from([0x78, 0x01, 0x73, 0x0d, 0x62, 0x62, 0x60]),
  EXE: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  TTF: Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00]),
  FIG: Buffer.from('fig-kiwi-placeholder'),
  TORRENT: Buffer.from('d8:announce35:http://tracker.example.com/announce')
};

function write(full, body) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const ext = path.extname(full).toLowerCase();
  const header = HEADERS[body];

  let payload;
  if (header) payload = header;
  else if (ext === '.pdf') payload = makePdf(body);
  else if (ext === '.docx') payload = makeDocx(body);
  else if (ext === '.pptx') payload = makePptx(body.split('. ').filter(Boolean));
  else payload = Buffer.from(body, 'utf8');

  fs.writeFileSync(full, payload);
  // Envelhece o arquivo para passar no teste de estabilidade sem esperar.
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(full, old, old);
}

/**
 * Monta a caixa de areia e devolve os caminhos para o config apontar.
 * @param {string} [root]
 */
export function buildSandbox(root) {
  const base = root || path.join(DATA_DIR, 'sandbox');

  // Apagar recursivamente uma pasta que veio de --root e a unica linha deste
  // projeto capaz de destruir arquivo de verdade. So se apaga o que esta
  // marcado como caixa de areia; o resto e recusado com o motivo na tela.
  const marca = path.join(base, '.caixa-de-areia');
  if (fs.existsSync(base)) {
    const nossa = fs.existsSync(marca) || base === path.join(DATA_DIR, 'sandbox');
    if (!nossa) {
      throw new Error(
        `${base} ja existe e nao foi criada por mim — nao vou apagar.\n` +
        `  Escolha uma pasta que nao existe, ou apague essa voce mesmo.`);
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(marca, 'Pastinha: pasta descartavel. Pode apagar.\n');

  const entrada = path.join(base, 'Entrada');
  const documentos = path.join(base, 'Documentos');
  const guardados = path.join(base, 'Guardados');

  for (const [name, body] of ENTRADA) write(path.join(entrada, name), body);
  for (const [name, body] of PROJETO) write(path.join(entrada, 'meu-site', name), body);
  for (const [rel, body] of DOCUMENTOS) write(path.join(documentos, rel), body);
  fs.mkdirSync(guardados, { recursive: true });
  // Nota para quem for mexer aqui: 'comecar' NAO respeita esta configuracao.
  // Ele monta uma config nova a partir das respostas e volta para os arquivos
  // de verdade. Os comandos que ficam dentro da caixa sao scan, bench e find.

  return {
    base, entrada, documentos, guardados,
    soltos: ENTRADA.length,
    gabarito: DOCUMENTOS.length
  };
}
