# Relatório de QA: pr-flow

## Rodada 2

Resultado: **aprovado**. O 🔴 e o 🟡 da rodada 1 não se reproduzem mais, as duas correções 🟢 de texto estão na
tela e nenhum defeito novo apareceu. Fica um 🟢 aceito pela revisão (contraste do ponto verde no dark, 2,82:1). O QA
mediu só o que a rodada 2 da revisão mudou, numa passada do `agent-browser` com emulador, executor de teste e o
script `github-webhook`.

### O que foi medido

| # | Item | Veredito |
|---|------|----------|
| 1a | PR fechada em Tarefas, depois Executando com `fake-executor ... failed` | **Confirmado.** `search-cards` aberto em Aguardando PR, `closed` levou o card para Tarefas (`prState: closed`). Disparado em Executando com `failed`: documento em `lane: stage, stageKey: develop, state: failed`; no quadro, coluna "Executando 1 card", card com "Falhou" e "Rodar de novo" |
| 1b | PR mergeada em Concluído, depois Executando com `needs_input` | **Confirmado.** `keyboard-shortcuts` mergeado foi para Concluído (`prState: merged`). Disparado em Executando com `needs_input`: `stageKey: develop, state: waiting_input`; card com "Aguardando você"; "Concluído 0 cards" |
| 2 | PR antiga fechada, volta a Aguardando PR com `feat/qa-pr-rejected` | **Confirmado.** O `/observe` terminou `success` e o card ficou em Aguardando PR, estado Parado. O documento não tem mais `pullRequest` e guarda `GITHUB_PULL_REQUEST_REJECTED`. O bloco mostra só o `Alert` ("O GitHub recusou a PR…") com "Tentar de novo", sem a PR #2147 antiga e sem a nota do merge |
| 3 | 1280 × 900 dark com card em Aguardando PR | **Confirmado.** `dark-theme` com PR #1716 aberta e checks falhando: `scrollWidth` 1280 = `clientWidth` 1280. O `sr-only` "checks falhando" continua no DOM, agora contido no contêiner de colunas |
| 4 | Nota do merge e quebra da linha de meta | **Confirmado.** "O merge é sempre seu…" aparece 1 vez com a PR aberta (`dark-theme`) e 0 vezes com a PR mergeada (`keyboard-shortcuts`) e no card sem PR (`search-cards`). Em 390 px a linha tem `break-words` e quebra em "· / aberta pelo board em 27 de nov. de / 2026, 04:50", sem cortar palavra; `scrollWidth` 390 |
| 5 | PR mergeada com o card fora da etapa de PR (limite aceito) | **Registrado.** `dark-theme` com PR aberta foi para Executando com `needs_input`; o `merged` respondeu `200 handled: true`, o card ficou em `develop, waiting_input` e o bloco passou a mostrar Mergeada e "Mergeada por @qa-pr-merger". Levado de volta a Aguardando PR, o board abriu "uma PR nova": o cliente falso devolveu de novo a #1716 (o número sai da branch), Rascunho, Aberta, "aberta pelo board em … 04:52", e o card ficou em "Aguardando o merge". No GitHub real a branch já mergeada deve ser recusada (422) e cair no `Alert`; o emulador não mostra esse caso (🔒) |

### Gates

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (raiz, JDK 21, sem `--force`) | 14/14 tarefas, 12 do cache (o mesmo hash que a revisão rodou) |
| ↳ `@repo/kanban-contract` | 171 testes |
| ↳ `api` | 1109 testes, 91 arquivos |
| ↳ `app` | 675 testes, 84 arquivos |
| ↳ `api` `test:emulator` | 133 testes |
| `pnpm check` | 848 arquivos, sem erro |

O `pnpm e2e` não rodou de novo: a rodada 2 não tocou login, landing nem shell do quadro, que é o que a suíte cobre
(20/20 na rodada 1). Nenhum teste novo do QA nesta rodada; os casos que pegam o 🔴 entraram com a correção
(`orchestratorPullRequest.test.ts`, `pullRequest.test.ts`, `pullRequestOpen.test.ts`).

### Pendências que continuam

- 🟢 Ponto verde no dark com 2,82:1 (mínimo 3:1); a revisão manteve, porque o tema tem um `--success` só.
- 🟢 Falha dos checks sem cor própria no bloco de detalhe e autor `/mediate` na linha do tempo: só registrados.
- 🔒 `pr_comment` sem executor, PR real com autor `[bot]`, 403 e 422 reais, entrega real dos eventos e
  `check_suite` do Actions (`docs/PRE-PRODUCTION.md`, item 5).

### Ambiente

Portas livres no início. O QA subiu `pnpm emulators`, `pnpm seed`, a API (com `GITHUB_WEBHOOK_SECRET` só da
sessão, em arquivo temporário fora do repo, já apagado) e o app, com `apps/*/.env` copiados do `.env.example`.
Conta só no emulador: `qa-pr-flow-owner@example.com`. Dados montados à mão no Firestore do emulador: a `branch` do
`search-cards` virou `feat/qa-pr-rejected`. No fim, o QA matou só os PIDs que guardou, conferiu as nove portas
vazias e apagou `.env`, `AGENTS.md`, `firestore-debug.log` e `.next`. Prints de apoio: `r2-01-executando-falhou-e-aguardando-dark`,
`r2-02-reaberta-recusada-dark`, `r2-03-meta-mobile-dark` em `test/e2e/` (descartados pelo `.gitignore`).

## Rodada 1

Rodada autônoma do `/cycle`, branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (não protegida). O QA não
commitou nem preparou nada no índice. Resultado da rodada 1: **bloqueado** por um defeito de produção (seção
"Defeitos").

## Defeitos

### 🔴 PR fechada antiga devolve o card para Tarefas ao fim de qualquer etapa

Depois que a PR do card é fechada sem merge, o documento do card guarda `pullRequest.state: "closed"`.
`completeRun` chama `settlePullRequest` em todo fim de run, e `resolvePullRequestClosure`
(`packages/kanban-contract/src/pullRequest.ts:206`) só confere `lane === "stage"`, `activeRunId === null` e o
estado da PR. Não confere se o card está na etapa de PR. Resultado: qualquer run que termina sem próximo run
(`failed`, `needs_input`, `idle` de uma etapa com aprovação) manda o card de volta ao fim de Tarefas, e o estado
do resultado some do quadro.

Repro no emulador (medido nesta rodada):

1. Card `keyboard-shortcuts` levado até Aguardando PR, depois `github-webhook ... keyboard-shortcuts closed`. O
   card vai para Tarefas, como esperado.
2. `pnpm --filter api fake-executor script agent-board-demo--sample-app keyboard-shortcuts failed`.
3. Menu do card, "Mover para Executando", "Disparar Executando". Logo depois o documento está em
   `lane: "stage", stageKey: "develop", state: "running"`.
4. Uns 4 s depois, recarregar o quadro. O `/develop` termina `failed`, mas o card está em `lane: "tasks",
   state: "idle"`, posição 7, e a tela mostra Coluna Tarefas, estado Parado. Ninguém vê o "Falhou".

Variante: o card com PR fechada levado de volta a Aguardando PR com a abertura recusada (`feat/qa-pr-rejected`)
roda o `/observe`, termina `success` e volta para Tarefas; o `Alert` com "Tentar de novo" some junto. Pelo código, o
mesmo vale para PR mergeada: card tirado de Concluído e disparado numa etapa volta para Concluído quando o run
termina.

Correção sugerida: exigir em `resolvePullRequestClosure` que o card esteja na etapa de PR, ou limpar `pullRequest`
quando o card volta para Tarefas depois do fechamento. Teste que pega o defeito: em
`orchestratorPullRequest.test.ts`, `completeRun` com o card em `stageKey: "develop"`, `pullRequest` fechada e
`next: null` deve deixar o card em `develop`.

### 🟡 Texto `sr-only` da linha da PR cria rolagem horizontal na página do quadro

O `<span class="sr-only">` com o resumo de checks em `BoardCardItem.tsx` (`PullRequestLine`) é
`position: absolute`, e nenhum ancestral dentro do contêiner de colunas (`md:overflow-x-auto`) é posicionado. Em
1280 × 900, dark, com o card em Aguardando PR: `scrollWidth` 1921 contra `clientWidth` 1280; com o span escondido,
1280. Em 390 px não acontece. Correção sugerida: `relative` no `<span>` externo da linha da PR (ou no `Card`).

### 🟢 Observações menores

- Ponto verde no dark: `bg-success` dá 2,82:1 contra o card (mínimo de 3:1 para objeto gráfico); no light, 4,83:1.
  No quadro, o estado dos checks só é visível pela cor.
- A linha de meta usa `break-all` e, em 390 px, quebra no meio da palavra ("ab / erta", "202 / 6").
- "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído." continua com a PR fechada ou mergeada.
- No bloco de detalhe, "Checks falhando" e "Falhou" usam a mesma cor neutra de "Passou".
- Na linha do tempo, o início do `/mediate` aparece com o autor `/mediate`, e o relatório do mesmo run com o autor
  da etapa (`observador-tarefa`). Vem do executor de teste.

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (raiz, JDK 21, sem `--force`) | 14/14 tarefas |
| ↳ `api` | 1106 testes, 91 arquivos |
| ↳ `app` | 674 testes, 84 arquivos |
| ↳ `@repo/kanban-contract` | 170 testes, 16 arquivos |
| ↳ `api` `test:emulator` | 133 testes, 8 arquivos |
| `pnpm --filter api test apiErrorCodes` | 2/2 |
| `pnpm e2e` | 20 passam, 2,1 min |
| typecheck de `api` e `app` | 2/2 |
| `pnpm check` | 848 arquivos, sem erro |

## Testes criados ou estendidos

| Arquivo | Caso novo | Fecha |
|---------|-----------|-------|
| `apps/api/__tests__/pullRequestWebhook.test.ts` | `closed` reentregue grava a linha do tempo uma vez | lacuna nova do review |
| `apps/api/__tests__/pullRequestOpen.test.ts` | link do card com `NEXT_PUBLIC_APP_URL` preenchido (barra final removida) | lacuna do handoff |
| `apps/api/__tests__/orchestratorPullRequest.test.ts` | `triggerStage` direto para a etapa de PR chama `ensurePullRequest` entre o enqueue e o pump; para outra etapa, não | lacuna do handoff |
| `apps/app/__tests__/cardPullRequest.test.tsx` | erro fora da etapa de PR não renderiza; linha da PR no `BoardCardItem` (aberta, fechada, mergeada) | lacunas do review e do handoff |

Nenhum teste novo da faixa cara: os casos são decisão de código, não de Firestore. O que depende do Firestore real
já está em `orchestratorRuns.emulator.test.ts`.

## Verificar no `/test` (lista do `review.md`)

| # | Item | Veredito |
|---|------|----------|
| 1 | Testando → Aguardando PR; `/observe` termina e o card fica | Confirmado: bloco com `#2147`, Rascunho, Aberta, `feat/search-cards → main`; evento "PR #2147 aberta como rascunho."; depois do `/observe`, "Aguardando o merge" |
| 2 | `merged` duas vezes | Confirmado: card em Concluído, "mergeada por" 1 vez na linha do tempo |
| 3 | `closed` em outro card | Confirmado: fim de Tarefas, "PR #291 fechada sem merge" |
| 4 | Limite de 3 `/mediate` por hora | Confirmado: 3 runs, aviso de limite 1 vez, "Comentário novo esperando o /mediate" |
| 5 | `comment` durante o `/observe` | Confirmado: o `/mediate` começa sozinho no fim do `/observe` |
| 6 | `comment` sem executor | 🔒 no emulador (executor de teste sempre existe); sem unitário específico |
| 7 | `checks-failure` e `review-changes` | Confirmado no bloco e no quadro; `checks-success` + `review-approved` também |
| 8 | Modo degradado | Confirmado: `503 GITHUB_APP_PERMISSION_MISSING` (não 500), leitor sem botão, retry abre a PR, `GITHUB_PULL_REQUEST_REJECTED` com texto próprio, Alert some em Tarefas |
| 9 | API sem segredo do webhook → 503 | Só unitário (`githubWebhookRoute.test.ts`); assinatura inválida → `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` na API rodando |
| 10 | Light, dark e mobile | Confirmado com ressalvas (🟡 rolagem horizontal, 🟢 contraste e `break-all`) |
| 11 | Regras do `board.yml` na tela | 🔒 no browser (`board.yml` do sample-app é fixo); coberto por `boardConfig.test.ts` e `boardConfigIssueMessage.test.ts` |

## Critérios de aceite

| Critério | Status | Meio |
|----------|--------|------|
| Card que termina Testando entra em Aguardando PR com a PR aberta | ✅ | browser, unit |
| Sucesso do comando da etapa de PR segura o card | ✅ | browser, unit |
| Arrastar direto para a etapa de PR abre a PR | ✅ | browser, unit novo |
| Corpo da PR com relatórios e link do card | ✅ | unit |
| Comentário ou pedido de mudança dispara o `/mediate` | ✅ | browser, unit |
| Limite de `/mediate` por hora | ✅ | browser, unit |
| Comentário durante run vivo espera e roda depois | ✅ | browser, unit |
| Checks e reviews no detalhe e no quadro | ✅ | browser, unit novo |
| Merge leva a Concluído, uma vez | ✅ | browser, unit novo |
| PR fechada devolve ao fim de Tarefas | ✅ | browser, unit |
| Card que já teve PR fechada volta a andar normalmente | ❌ | browser (defeito 🔴) |
| Falha de permissão com nova tentativa | ✅ | browser, unit |
| Recusa do GitHub com texto próprio | ✅ texto / 🔒 422 real | browser com cliente falso, unit |
| Erro some quando o card sai da etapa de PR | ✅ | browser, unit novo |
| Leitor vê o bloco sem "Tentar de novo" | ✅ | browser, unit de rota |
| Webhook só alcança o board da instalação certa | ✅ | unit; 401 medido na API rodando |
| Regras do `board.yml` para a etapa de PR | ✅ unit / 🔒 browser | unit |
| Tema e responsivo | ❌ | browser (rolagem horizontal em 1280 px) |

## Ambiente e dados de QA

Portas livres no início e no fim. O QA rodou `pnpm e2e` e depois subiu emulador, seed, API (com
`GITHUB_WEBHOOK_SECRET` gerado só para a sessão, em arquivo temporário fora do repo, já apagado) e app; matou só os
próprios PIDs. Apagados `.env` copiados, `apps/*/AGENTS.md`, `firestore-debug.log` e `apps/*/.next`. Contas só no
emulador (`qa-pr-flow-owner@example.com`, `qa-pr-flow-viewer@example.com`); branches de cards trocadas à mão no
emulador para forçar os erros. Nada em projeto real; o `docs/PRE-PRODUCTION.md` não muda. Prints em `test/e2e/`,
descartados pelo `.gitignore`.

## Lacunas

| Lacuna | Situação |
|--------|----------|
| `BoardCardItem` com a linha da PR | Fechada |
| `buildPullRequestBody` com `NEXT_PUBLIC_APP_URL` | Fechada |
| `triggerStage` chamando `ensurePullRequest` | Fechada |
| `github-webhook.mjs` com `POST` real | Fechada (15 entregas, todas 200) |
| `closed` reentregue | Fechada |
| `CardPullRequest` com erro fora da etapa | Fechada |
| `pr_comment` sem executor | Aberta (🔒 no emulador) |
| Teste do defeito 🔴 | Aberta, vai junto com a correção |
| PR real com autor `[bot]`, 403 e 422 reais, entrega real, `check_suite` do Actions | 🔒, `docs/PRE-PRODUCTION.md` item 5 |
