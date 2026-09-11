# Pastinha

Um bicho de estimação de mesa com TOC de arrumação. Ele vigia as pastas por onde
entra tralha, guarda cada arquivo renomeado no lugar certo — e, porque foi ele que
guardou, é ele que acha e traz de volta.

**100% local.** Nenhum byte de arquivo sai da máquina. O modelo roda no seu Mac.

Protótipo v0. Ele começa sem permissão nenhuma: só propõe, você aprova.

---

## Começar em 60 segundos

```bash
cd pastinha
node cli.js doctor          # vê o que está faltando
node cli.js scan            # SIMULAÇÃO: o que ele faria com o que está solto
```

`scan` sozinho não move nada. Nunca. Para decidir arquivo por arquivo:

```bash
node cli.js scan --apply
```

Para a janelinha flutuante com o bicho:

```bash
node cli.js server          # depois abra http://127.0.0.1:4545
# ou, com Electron instalado:
npm i -D electron && npm run pet
```

Não precisa de `npm install` para o motor: **zero dependências**. Só Node 18+.

---

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
ACERTO EXATO ..... 81.8%   (pasta idêntica à sua)
ACERTO NA RAIZ ... 90.9%   (categoria de primeiro nível certa)
sem modelo ....... 100.0%  (11 por regra, 0 pelo LLM)
```

- **acima de 80% na raiz** → tem produto, siga
- **70–80%** → tem produto, as regras precisam de uma rodada
- **abaixo de 70%** → conserte o cérebro antes de desenhar um pixel

Rode com `--no-model` para medir só as regras. A diferença entre os dois números
é exatamente o quanto a IA vale neste produto. Esse é o dado que ninguém tem.

---

## Comandos

| comando | o que faz |
|---|---|
| `doctor` | exame de admissão: permissões, utilitários, Ollama, modelos |
| `scan` | simula (não move nada) |
| `scan --apply` | decide um por um no terminal |
| `scan --no-model` | só regras determinísticas, instantâneo |
| `bench` | mede acurácia contra as suas próprias pastas |
| `find "contrato apartamento"` | busca na Memória: nome novo, **nome antigo**, conteúdo, origem |
| `undo` / `undo --today` | desfaz |
| `stats` | os números que decidem o projeto |
| `server` | sobe motor + UI |

---

## Como ele decide

```
detecta → espera estabilizar → sinais grátis do macOS → regras determinísticas
                                                              │
                                        acertou? ─────────────┤
                                                              │
                             extrai conteúdo → 6 pastas candidatas → modelo
                                                              │
                                            confiança alta ───┴─── confiança baixa
                                                  │                      │
                                            move sozinho            pergunta
```

**Sinais grátis** (zero inferência, zero bateria): tipo real pelos bytes iniciais,
padrão do nome, EXIF, e o mais subestimado de todos — `kMDItemWhereFroms`, a **URL
de onde o arquivo foi baixado**. PDF vindo do site da Receita é imposto. `.fig`
vindo do Figma é design.

**O modelo só faz tarefa pequena**: escolher entre 6 pastas candidatas (nunca
entre as 200 do disco) e escrever uma descrição de 3 a 7 palavras. É isso que faz
um modelo de 4B funcionar.

---

## As cinco regras que não se quebram

1. **Tudo é reversível.** Escreve na Memória *antes* de mover, não depois.
2. **Lista branca.** Só Downloads e Desktop. Nunca `~/Library`, nunca dentro de
   `.app`, nunca perto de `.git`/`node_modules` — isso é projeto, não bagunça.
3. **Espera o arquivo parar.** Sem `.crdownload`, sem mtime recente, sem `lsof`.
4. **Nunca em silêncio.** `autonomy: 0` é o padrão: ele só propõe.
5. **Tudo local.** Inclusive o índice — que é mais sensível que os arquivos.

## Achar nunca é bloqueado

Buscar e trazer é liberado no minuto um, porque não destrói nada. Só *mexer* é que
se conquista, categoria por categoria. Isso é a mecânica de jogo e o modelo de
segurança ao mesmo tempo.

E o nome antigo fica guardado para sempre: procurar pelo nome que o arquivo tinha
antes **sempre** funciona. Não é recurso, é o seguro contra o cenário que mata o
produto.

---

## Configuração

`~/.pastinha/config.json`, criado no primeiro uso.

```jsonc
{
  "watch": ["~/Downloads", "~/Desktop"],
  "destRoot": "~/Pastinha",   // caixa de areia. troque para ~/Documents quando confiar
  "learnFrom": ["~/Documents"], // só leitura: daqui ele aprende a SUA taxonomia
  "autonomy": 0,              // 0 só propõe · 1 automático por regra · 2 por confiança
  "ollama": { "text": "qwen3:4b", "vision": "qwen2.5vl:3b" }
}
```

A Memória inteira é um arquivo: `~/.pastinha/journal.jsonl`. Legível com `cat`,
apagável com `rm`. Apagar `~/.pastinha` apaga o bicho inteiro.

## Sem Ollama

Funciona, só com as regras. `doctor` avisa. Para ligar o cérebro:

```bash
brew install ollama && ollama serve
ollama pull qwen3:4b
ollama pull qwen2.5vl:3b   # opcional, para nomear fotos olhando a imagem
```

---

## Arquitetura

```
engine/   config · journal (Memória) · macos (sinais) · extract · rules
          folders (taxonomia) · brain (LLM) · organize (Motor) · server
ui/       o bicho, como página web comum
shell/    Electron — casca burra, sem lógica nenhuma
bench/    a medição contra as suas próprias pastas
```

A UI é uma página web e o motor é um processo Node separado, **de propósito**:
trocar Electron por Tauri ou por um WKWebView de 200 linhas em Swift é um fim de
semana, não uma reescrita. O modelo também é processo separado (Ollama), então o
peso da casca e o peso do modelo não se somam.

## Estado

Protótipo. O que funciona: pipeline completo, regras, extração (texto, docx/pptx
por unzip, PDF por inflate, OCR do Spotlight, visão por LLM), Memória com desfazer,
busca literal, bench, UI, atalho global (`⌘⇧Espaço`).

O que não existe ainda: busca semântica com embeddings, FSEvents de verdade (hoje
é pesquisa a cada 20s), arrastar arquivo de dentro do bicho, empréstimo com
devolução automática, níveis de autonomia na UI.
