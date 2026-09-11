# Pastinha

Um bicho de estimação de mesa com TOC de arrumação. Ele vigia as pastas por onde
entra tralha, guarda cada arquivo renomeado no lugar certo — e, porque foi ele que
guardou, é ele que acha e traz de volta.

**100% local.** Nenhum byte de arquivo sai da máquina. **macOS e Windows.**

Protótipo. Ele começa sem permissão nenhuma: só propõe, você aprova.

---

## Comece pela caixa de areia

Nenhum arquivo seu corre risco. O comando monta uma bagunça de mentira e aponta
a configuração para lá.

```bash
node cli.js sandbox
node cli.js bench --no-model     # acurácia só com regras
node cli.js scan                 # o que ele faria
node cli.js scan --apply         # decide um por um
node cli.js find "condominio"    # a busca
node cli.js undo --today         # devolve tudo
```

Quando confiar, aponte para os arquivos de verdade:

```bash
node cli.js live                 # vigia ~/Downloads, guarda em ~/Pastinha
```

`live` nunca mexe em Documentos: ele guarda numa pasta nova e **aprende** a sua
taxonomia lendo Documentos sem tocar em nada.

**Não precisa de `npm install` para rodar.** O motor tem zero dependências.
Só Node 18 ou mais novo.

---

## Teste em massa

A caixa de areia de 26 arquivos serve para entender o produto. Não serve para medir.

```bash
node cli.js perfil                              # os 6 perfis
node cli.js corpus --perfil fotografo --n 20000 # disco inteiro, com gabarito
node cli.js bench --no-model --n 1500
```

20 mil arquivos em 3 segundos; 1500 classificados em 5 (~3 ms cada, sem modelo).

Foi esse teste que achou o maior erro de arquitetura do projeto: as regras diziam
`boleto → Financeiro/Contas`, misturando **o que o arquivo é** (universal) com
**onde ele vai** (pessoal). Resultado: 100% num disco comum e 5,7% no de um
fotógrafo. Separadas — `rules.js` devolve tipo, `placement.js` devolve pasta por
perfil — a média foi de **38% para 87%**.

| perfil | antes | depois |
|---|---|---|
| pessoa comum | 100% | 100% |
| programador | 79,5% | 94,8% |
| fotógrafo | 5,7% | 90,3% |
| criador | 12,2% | 91,8% |
| videomaker | 7,5% | 75,5% |
| designer | 23% | 69,8% |

O corpus é sintético e escrito pela mesma pessoa que escreveu as regras — é
otimista por construção. Serve para achar erro de arquitetura, não para prever
acurácia. **O número que vale sai do seu `~/Documents`.**

## O número que decide o projeto

Você não precisa rotular nada à mão. Você **já tem** um conjunto rotulado: todo
arquivo que hoje está numa pasta que você mesmo escolheu é um par
(arquivo → resposta certa).

```bash
node cli.js bench --root ~/Documents --n 200
```

Ele pega 200 arquivos já organizados, **esconde o caminho**, pergunta ao
classificador onde guardaria, e compara com onde você guardou.

```
ACERTO EXATO ..... 75.0%   (pasta idêntica à sua)
ACERTO NA RAIZ ... 87.5%   (categoria de primeiro nível certa)
sem modelo ....... 100.0%  (quanto foi resolvido só com regras)

quem decidiu        n     exato    raiz
nome                 9    77.8%  100.0%
ext                  3   100.0%  100.0%
conteudo             2   100.0%  100.0%
fallback             2     0.0%    0.0%
```

- **acima de 80% na raiz** → tem produto, siga
- **70–80%** → tem produto, as regras precisam de uma rodada
- **abaixo de 70%** → conserte o cérebro antes de desenhar um pixel

`--no-model` mede só as regras. A diferença entre os dois números é exatamente
quanto a IA vale neste produto.

O relatório sai em `~/.pastinha/bench-*.json` e contém **só nome, categoria certa,
categoria chutada e qual regra decidiu** — nenhum conteúdo de arquivo.

---

## Estrutura

```
src/
  core/        o Pastinha. NADA aqui sabe em qual sistema operacional está
    config     journal (a Memória)   rules      folders
    brain      extract               organize
  platform/    a única fronteira com o sistema operacional
    index.js     a interface
    darwin.js    macOS      win32.js   Windows      linux.js   testes
    shared/      magic  zip  pdf  exif  make   — javascript puro, serve nos dois
  server/      HTTP + SSE que alimenta a UI
  bench/       a medição e a caixa de areia
ui/            o bicho, como página web comum
shell/         Electron — casca burra, sem lógica nenhuma
```

### A regra que evita a reescrita

**Nada em `src/core/` pode saber se está no Mac ou no Windows.** Todo comando de
sistema, todo caminho com barra invertida, toda gambiarra de plataforma mora em
`src/platform/` e sai por uma interface só.

Sem essa linha, o `if (Windows)` vaza para trinta lugares e daqui a dois anos só
resta refazer. Com ela, um sistema novo é um arquivo novo.

### Mesma informação, mecanismos diferentes

| | macOS | Windows |
|---|---|---|
| de onde o arquivo veio | `xattr kMDItemWhereFroms` | fluxo NTFS `arquivo:Zone.Identifier` |
| texto já indexado | Spotlight | (não acessível — extratores próprios assumem) |
| arquivo está aberto? | `lsof` | abertura exclusiva falha |
| formatos antigos | `textutil` | (sem equivalente) |
| Desktop e Documentos | caminho fixo | pode estar sequestrado pelo OneDrive |

Tipo real do arquivo, zip (docx/pptx/xlsx/epub), PDF e EXIF são **JavaScript puro**
em `platform/shared/` — funcionam iguais nos dois, e não abrem processo nenhum.

---

## Como ele decide

```
detecta → espera estabilizar → sinais grátis do sistema → extrai conteúdo
                                                               │
                       regras: nome, extensão, origem, CONTEÚDO, EXIF
                                                               │
                                        acertou? ──────────────┤
                                                               │
                              6 pastas candidatas → modelo local (Ollama)
                                                               │
                                             confiança alta ───┴─── baixa
                                                   │                  │
                                             move sozinho         pergunta
```

**O modelo só faz tarefa pequena**: escolher entre 6 pastas candidatas (nunca
entre as 200 do disco) e escrever uma descrição de 3 a 7 palavras. É isso que faz
um modelo de 4B funcionar.

**A extração roda sempre**, mesmo quando a regra já decidiu. Parece desperdício e
não é: sem o texto na Memória, o arquivo fica organizado e inencontrável.

---

## As cinco regras que não se quebram

1. **Tudo é reversível.** Escreve na Memória *antes* de mover, não depois.
2. **Lista branca.** Só as pastas configuradas. Nunca pasta do sistema, nunca perto
   de `.git`/`package.json` — isso é projeto, não bagunça.
3. **Espera o arquivo parar.** Sem download pela metade, sem mtime recente, sem
   arquivo aberto em outro programa.
4. **Nunca em silêncio.** `autonomy: 0` é o padrão: ele só propõe.
5. **Tudo local.** Inclusive o índice — que é mais sensível que os arquivos.

**Achar nunca é bloqueado.** Buscar e trazer é liberado no minuto um, porque não
destrói nada. Só *mexer* é que se conquista. E o nome antigo fica guardado para
sempre: procurar pelo nome que o arquivo tinha antes **sempre** funciona.

---

## Tipos sem passo de build

Os tipos ficam em comentários JSDoc dentro dos `.js`, verificados pelo compilador
do TypeScript com `checkJs`. Você ganha os tipos de verdade e os arquivos
continuam rodando direto com `node`.

```bash
npm install      # só typescript, e só para verificar
npm run check    # tsc --noEmit
```

Na primeira vez que rodou, o verificador achou um bug real: a casca do Electron
ainda importava um caminho que não existia mais.

---

## Configuração

`~/.pastinha/config.json`, criado no primeiro uso.

```jsonc
{
  "watch": ["~/Downloads", "~/Desktop"],
  "destRoot": "~/Pastinha",
  "learnFrom": ["~/Documents"],   // só leitura: daqui ele aprende a SUA taxonomia
  "autonomy": 0,                  // 0 só propõe · 1 automático por regra · 2 por confiança
  "ollama": { "text": "qwen3:4b", "vision": "qwen2.5vl:3b" }
}
```

A Memória inteira é um arquivo: `~/.pastinha/journal.jsonl`. Legível com `cat`.
Apagar `~/.pastinha` apaga o bicho inteiro.

## Sem Ollama

Funciona só com as regras — que é a maior parte do trabalho. Para ligar o cérebro:

```bash
# mac:      brew install ollama
# windows:  https://ollama.com/download
ollama pull qwen3:4b
ollama pull qwen2.5vl:3b     # opcional, para nomear fotos olhando a imagem
```

## O bicho

```bash
node cli.js server            # http://127.0.0.1:4545 em qualquer navegador
npm i -D electron && npm run pet   # janelinha flutuante, atalho Ctrl/Cmd+Shift+Espaço
```

A UI é uma página web e o motor é um processo separado, **de propósito**: trocar
Electron por Tauri ou por um WKWebView em Swift é um fim de semana, não uma
reescrita. O modelo também é processo separado (Ollama), então o peso da casca e o
peso do modelo não se somam.
