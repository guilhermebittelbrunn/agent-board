# Plano: Coluna Aguardando PR (abrir, acompanhar e concluir)

- Spec: [`specs/features/pr-flow.md`](../../../../specs/features/pr-flow.md) (status `approved`, fase 2)
- Slug: `pr-flow`
- Data: 2026-11-27, rodada autônoma do `/cycle` (nenhuma pergunta feita; decisões em "Perguntas em aberto")
- Base de código: branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, já com `spec-authoring` e `app-cleanup`
  (guard `requireSessionApi` com `ctx.profile`, `requireBoardApi` por cima, slice de referência `boardMember`)

---

## Etapa 1: análise

### 1. Contexto

**Resumo.** Quando o card entra na etapa de PR (coluna Aguardando PR), o board abre a PR da branch do card com o
GitHub App, roda o `/observe`, dispara o `/mediate` a cada review ou comentário novo, mostra no card o estado do
CI e das reviews e, no merge, leva o card para Concluído. PR fechada sem merge devolve o card para Tarefas.

**Problema hoje** (evidência no código):

- O `GithubClient` só tem leitura: `listInstallationRepositories`, `readFile`, `getCollaboratorRole`
  (`apps/api/(shared)/lib/github/github-client.ts:24-35`). O `send` do cliente REST aceita `GET | POST`, mas o
  único `POST` é o do token de instalação (`github-rest-client.ts:142-146`, `:196-200`). Era isso que a auditoria
  quis dizer com "o GitHub App só lê": o **código** só lê. A permissão `Pull requests: read & write` está pedida
  na documentação (`docs/board/ACCESS.md:18`) e marcada como feita em `docs/PRE-PRODUCTION.md:106`, mas nenhum
  código a exerce, então ninguém mediu se o App instalado a tem.
- O webhook só trata `member` e `installation_repositories`; qualquer outro evento volta `handled: false`
  (`github-webhook-events.ts:27-69`). E o `PRE-PRODUCTION.md:107` registra que **nenhum evento extra** foi
  assinado no App.
- A etapa `pr` do `board.yml` é uma etapa comum: o `success` do `/observe` cai em `resolveTransition`, que não
  acha etapa seguinte e devolve `stageKey: null` (`packages/kanban-contract/src/cardState.ts:79-86`), e o
  `planCompletion` transforma isso em `lane: "done"` (`apps/api/(shared)/lib/orchestrator/decide.ts:244-253`).
  Ou seja, hoje o card vai para Concluído assim que o `/observe` termina, sem PR nenhuma.
- `onPrComment` existe só no schema (`boardConfig.ts:53`) e no diff de reload (`boardConfigDiff.ts:12`);
  nenhum código o lê.

**Objetivos (corte de MVP da spec, sem re-litigar):**

1. Ao entrar na etapa de PR, o board abre a PR `branch do card → baseBranch`, como rascunho ou não conforme o
   `board.yml`, com o resumo dos relatórios das etapas no corpo, e roda o comando da coluna (`/observe`).
2. Review ou comentário novo na PR dispara o `onPrComment` (`/mediate`) no card, com limite de execuções por PR e
   por hora.
3. O card mostra o estado do CI (check suites) e das reviews.
4. Merge leva o card para Concluído; PR fechada sem merge devolve o card para Tarefas com o motivo na linha do
   tempo.

**Fora de escopo:**

- Merge automático (a spec proíbe).
- Botão "Marcar como pronta para review" do desenho `CardPr` (é escrita no GitHub que a spec não pede).
- Prévia do último comentário e contagem "1 novo, 1 respondido" do desenho: a linha do tempo já mostra o que o
  `/mediate` fez.
- Postar comentário na PR, rotular ou pedir reviewer pelo App.
- `status` de commit (o modelo antigo de CI, usado por alguns deploys); só `check_suite` entra.
- `pull_request_review_comment` como gatilho: cada comentário em linha já chega dentro de um
  `pull_request_review.submitted`, e assinar os dois dispararia o `/mediate` N+1 vezes por review.
- Toggle de rascunho na tela Configuração: o padrão vem do `board.yml` (ver pergunta 1).
- Arquivar a spec no merge (é do `/spec --sync`).

**Corte de MVP (a menor fatia vertical):** contrato (`pullRequest` na etapa + transições de PR) → cliente GitHub
com `createPullRequest` real e falso → abertura no orquestrador + rota de nova tentativa → webhook de
`pull_request`, `pull_request_review`, `issue_comment`, `check_suite` → bloco da PR no detalhe do card e um selo
no card do quadro → script que assina webhooks no emulador, para o `/test` percorrer tudo sem credencial real.

**Apps impactados:** `packages/kanban-contract`, `packages/sdk`, `apps/api`, `apps/app`,
`packages/internationalization`, `kit/` (`.kanban/board.yml` e `commands/mediate.md`) e o `.kanban/board.yml`
deste repositório. Docs: `ACCESS.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `SETUP.md`, `PRE-PRODUCTION.md`.

**Papel no board:**

| Ação | Quem | Evidência |
|------|------|-----------|
| Ver o bloco da PR | `viewer`+ | o card já é lido com a capacidade `view` |
| Tentar abrir a PR de novo (`POST .../pull-request`) | `operator`+ | `canTriggerStages` (`roles.ts:47-49`), capacidade `trigger` do `requireBoardApi` (`app/(guards)/board.ts:22-50`) |
| Abertura automática, `/mediate` por comentário, merge e fechamento | o board (orquestrador e webhook), sem pessoa | o `run` do `/mediate` sai em nome de quem disparou a etapa de PR |

**Dependências externas:** GitHub REST (`POST /repos/{o}/{r}/pulls`, `GET /repos/{o}/{r}/pulls?head=`), webhooks
do GitHub App. Nenhuma variável de ambiente nova; `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` e
`GITHUB_WEBHOOK_SECRET` já existem (`apps/api/env.ts:25-27`). Nenhuma dependência nova.

**Genérico ou específico:** regras de domínio (qual etapa abre PR, transições de merge e fechamento, limite do
`/mediate`, resumo de checks e reviews) vão para `@repo/kanban-contract` (regra de ouro 12); I/O fica em
`apps/api`.

#### 1.1 Fontes

| Fonte | Lida? | O que define |
|-------|-------|--------------|
| `specs/features/pr-flow.md` | sim | corte de MVP, riscos, pergunta do rascunho |
| `docs/design/screens/CardPr.dc.html` (fonte local da tela) | sim, o texto | conteúdo do bloco da PR: `#12 título [Rascunho]`, `branch → base · N commits · aberta pelo board há 2 h`, Checks (nome e duração), Reviews (pessoa e estado), "Abrir PR no GitHub", "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído." |
| Canvas `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr` | não (privado) | substituído pela fonte local acima |
| `docs/board/ACCESS.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `DECISIONS.md`, `SCREENS.md`, `ROADMAP.md` | sim | permissões do App, ciclo do card, contrato dos agentes |
| `.claude/rules/board-mode.md` §3 | sim | "quem abre a PR é o board, na coluna Aguardando PR" |
| `.claude/cycle-policy.md` | sim | modo degradado obrigatório, sem dependência nova, infra vira `PRE-PRODUCTION.md` |

**Divergências entre fontes:**

- `ACCESS.md:56` diz "Commits e PR saem no nome de quem executou". A regra `board-mode.md` e a spec dizem que o
  board abre a PR. Com o token de instalação, a PR sai como o bot do App (`<app-slug>[bot]`). O plano segue a
  spec e corrige o `ACCESS.md`. Os commits continuam no nome de quem rodou cada etapa.
- `PRE-PRODUCTION.md:106` marca `Pull requests (read & write)` como feito; nenhum código mediu. Vira item de
  conferência no `PRE-PRODUCTION.md` (ver Etapa 2, "Infra").

### 2. Dados (Firestore)

Coleção existente `card` (`CARD_TABLE`, `card.mapper.ts:28`). Nenhuma coleção nova.

#### 2.1 Campos novos no documento `card`

| Campo | Tipo | Default / `null`? | Por quê |
|-------|------|-------------------|---------|
| `pullRequest` | objeto (abaixo) ou `null` | `null`; ausente nos cards antigos | a PR atual do card. Nome alternativo considerado: `pr` (curto demais e já é a chave da etapa no `board.yml`) |
| `pullRequestError` | `{ code: string, at: Timestamp }` ou `null` | `null` | a última tentativa de abrir a PR falhou; a tela traduz o `code` por `apiErrors` e oferece "Tentar de novo". Alternativa: guardar só um evento na linha do tempo (perderia o botão) |

Forma de `pullRequest`:

| Campo | Tipo | Origem |
|-------|------|--------|
| `number` | number | resposta do `POST /pulls` |
| `url` | string (`html_url`) | idem |
| `title` | string | idem; atualizado por `pull_request.edited` |
| `draft` | boolean | idem; atualizado por `ready_for_review` / `converted_to_draft` |
| `state` | `"open" \| "merged" \| "closed"` | `pull_request.closed` com `merged` |
| `headRef`, `baseRef` | string | resposta do `POST` |
| `headSha` | string ou `null` | `head.sha`; `synchronize` troca e zera os checks |
| `commits` | number ou `null` | `pull_request.commits` (vem no payload do evento e na resposta) |
| `openedAt` | Timestamp | hora em que o board criou ou adotou a PR |
| `openedByBoard` | boolean | `false` quando o board adotou uma PR que já existia para a branch |
| `dispatchAs` | `{ userId, login }` | o `triggeredBy` do `run` da etapa de PR que abriu a PR; é em nome dele que o `/mediate` roda |
| `closedAt` | Timestamp ou `null` | `pull_request.closed` |
| `closedByLogin` | string ou `null` | `sender.login` do fechamento ou `merged_by.login` |
| `checks` | array `{ app, name, conclusion, at }`, no máximo 10 | `check_suite.completed` (uma entrada por app, a mais recente vence) |
| `reviews` | array `{ login, state, at }`, no máximo 20 | `pull_request_review.submitted` (a mais recente por pessoa vence); `dismissed` remove |
| `commentRunsAt` | array de Timestamp, no máximo `maxPrCommentRunsPerHour` | instantes dos `/mediate` disparados na última hora, para o limite |
| `unhandledCommentAt` | Timestamp ou `null` | comentário que chegou com execução viva ou acima do limite; a próxima conclusão de etapa o atende |

Arrays em vez de mapas: logins e slugs de app viram chave de mapa no Firestore, e um `.` numa chave quebra
`update` por caminho. O webhook sempre lê e regrava o objeto inteiro numa transação, então array basta.

**Escopo:** o recurso é do board. O webhook acha o board pelo repositório (`boardIdForRepository(full_name)`,
`apps/api/(shared)/lib/board-import.ts:63`) e o card pelo `pullRequest.number` entre os cards do board
(`cardRepository.listByBoard`, `card.repository.ts:52-61`, filtro em memória; um board tem dezenas de cards).

**Soft delete:** inalterado. Card apagado (`deletedAt`) não recebe evento.

#### 2.2 Consultas

Nenhuma consulta nova no Firestore. `listByBoard` já usa só igualdade (`boardId`, `deletedAt`), sem índice
composto. Nenhuma ordenação nova, nenhuma mudança em `firestore.rules` (o cliente não lê `card` direto; tudo passa
pela API).

#### 2.3 Dados existentes

- Cards antigos sem `pullRequest`/`pullRequestError`: o mapper devolve `null` (`asRecord` + `textOrNull`, mesmo
  padrão de `toSpecApproval`, `card.mapper.ts:150-160`). Sem backfill.
- Boards já importados não têm `pullRequest` na etapa `pr` até alguém recarregar o `board.yml`
  (`POST /boards/:id/reload`). Até lá a etapa se comporta como hoje (sucesso leva a Concluído). Isso é
  retrocompatível de propósito e vai documentado no `kit/README.md`.

**Mapa de cada elemento da tela à origem do dado** (pedido na §2.3 do guia):

| Elemento do `CardPr` | Origem | Existe? |
|----------------------|--------|---------|
| `#12`, título, link | `pullRequest.number/title/url` | novo |
| selo Rascunho | `pullRequest.draft` | novo |
| `feat/x → main` | `headRef`, `baseRef` | novo |
| `9 commits` | `pullRequest.commits` | novo (payload do evento) |
| "aberta pelo board há 2 h" | `openedAt`, `openedByBoard` | novo |
| Checks por nome | `checks[]` | novo (`check_suite`) |
| Duração do check | não há no `check_suite` sem buscar os `check_run` | **fora do corte** |
| Reviews por pessoa | `reviews[]` | novo |
| "/mediate está respondendo" | `activeRunId` + `lastRun`/run ativo com `command` | existe (`CardRunControls`) |
| "6 execuções", pipeline, artefatos | já existem na tela | existe |

### 3. Contrato

#### 3.1 `@repo/kanban-contract`

- `stageConfigSchema` ganha `pullRequest: z.object({ draft: z.boolean().default(true) }).optional()`
  (`boardConfig.ts:43-54`). A etapa que tem `pullRequest` é a etapa de PR.
- `limits` ganha `maxPrCommentRunsPerHour: z.number().int().min(0).max(20).default(3)` (`boardConfig.ts:79-99`).
  `0` desliga o gatilho por comentário.
- `superRefine` ganha duas regras: no máximo uma etapa com `pullRequest` (`pull_request_stage_duplicated`) e ela
  tem de ser a última (`pull_request_stage_not_last`), porque o merge leva o card direto para Concluído.
  As duas entram em `BOARD_CONFIG_ISSUE_RULES` e `RULES_FROM_REFINEMENTS` (`boardConfigIssues.ts:3-40`).
- `STAGE_FIELDS` ganha `pullRequest`; `sameValue` passa a comparar o objeto por `draft`
  (`boardConfigDiff.ts:3-31`).
- `findPullRequestStage(config)`, ao lado de `findStageConfig`.
- `resolveTransition`: em `success` numa etapa com `pullRequest`, o card **fica** na etapa, `idle`
  (`cardState.ts:79`). Os outros resultados seguem iguais. É o que impede o `/observe` de mandar o card para
  Concluído.
- `RUN_TRIGGERS` ganha `"pr_comment"` (`run.ts:24-30`).
- Novo módulo `pullRequest.ts` com tipos e regras puras:
  - `CardPullRequest` (a forma acima, com datas em ISO) e `PullRequestChecksSummary =
    "pending" | "success" | "failure" | null`, `PullRequestReviewState`.
  - `resolvePullRequestClosure(card)`: `merged` e sem `activeRunId` → `{ lane: "done" }`; `closed` sem merge e
    sem `activeRunId` → `{ lane: "tasks" }`; com execução viva → `null` (espera a execução fechar); PR aberta →
    `null`.
  - `canRunPrComment(commentRunsAt, now, limit)` e `pruneCommentRuns(...)`.
  - `summarizeChecks(checks, headSha)` (falha se alguma falhou; sucesso se todas concluídas com sucesso, neutro ou
    pulado; `pending` sem nenhuma), `summarizeReviews(reviews)` (pediu mudança vence aprovação).
  - `applyPullRequestEvent(pullRequest, event, now)`: aplica um evento normalizado (`closed`, `reopened`,
    `synchronize`, `edited`, `ready_for_review`, `converted_to_draft`, `review_submitted`, `review_dismissed`,
    `check_suite_completed`) e devolve o objeto novo, respeitando os tetos de 10 e 20 itens.
- `AgentCardView` ganha `pullRequest: { number, url, draft, state } | null` (`agentResults.ts:43-80`), para o
  `/observe` e o `/mediate` acharem a PR sem adivinhar pela branch.

#### 3.2 `@repo/sdk`

- `CardDTO` ganha `pullRequest: CardPullRequestDTO | null` e `pullRequestError: { code: string; at: string } |
  null` (`packages/sdk/src/types/board/card.ts:37-69`). O DTO expõe `checks`, `reviews`, `checksSummary`,
  `reviewsSummary` e `pendingComment: boolean`; **não** expõe `dispatchAs.userId`, `commentRunsAt` nem
  `unhandledCommentAt` crus.
- `BoardCardActions.openPullRequest(boardId, slug): Promise<CardDTO>` →
  `POST /boards/:id/cards/:slug/pull-request` (`actions/boardCard/action.ts`). Já registrado: `BoardCardActions`
  existe no `Client`.
- Quem quebra: ninguém. Campos novos no DTO; os testes que montam `CardDTO` à mão (fixtures em
  `apps/app/__tests__` e `apps/api/__tests__/fakeCardRepository.ts`) precisam dos dois campos com `null`
  (`rg "lastRun:" apps/*/__tests__` lista os pontos).

### 4. API

#### 4.1 Rotas

| Método | Path | Guard | Papel |
|--------|------|-------|-------|
| `POST` | `/boards/[id]/cards/[slug]/pull-request` | `requireBoardApi("trigger")` | `operator`+ |
| `POST` | `/github/webhook` (existe) | assinatura HMAC (existe) | GitHub |

`POST .../pull-request` abre ou adota a PR de um card que está na etapa de PR e não tem PR aberta. É o mesmo
serviço da abertura automática; existe para o modo degradado (corrigiu a permissão do App, tenta de novo sem
rodar a etapa) e é idempotente: com PR aberta, devolve o card como está (`200`).

#### 4.2 Abertura da PR (serviço `ensurePullRequest`)

Arquivo novo `apps/api/(shared)/lib/pull-request/pull-request-open.ts`.

1. Lê o card. Sai sem fazer nada se ele não está na etapa de PR, se já tem `pullRequest.state === "open"` ou se
   não tem `branch`.
2. `getGithubClient()`; `null` → grava `pullRequestError: GITHUB_APP_NOT_CONFIGURED`.
3. Monta título (`card.title`) e corpo com `buildPullRequestBody` (puro): para cada etapa do `board.yml` antes da
   de PR, o último evento `report` daquela etapa (o `summary` do `complete_stage`), em ordem; rodapé com o link
   do card quando `NEXT_PUBLIC_APP_URL` existe. Corta em 60.000 caracteres (o GitHub recusa corpo acima de
   65.536).
4. `client.createPullRequest(repo, { head: card.branch, base: config.baseBranch, title, body, draft })`.
5. Em `422`: procura PR aberta da mesma `head` (`findOpenPullRequest`). Achou → adota (`openedByBoard: false`).
   Não achou e pediu rascunho → tenta uma vez sem rascunho (repositório privado em plano Free do GitHub não
   aceita PR rascunho) e registra na linha do tempo que a PR saiu pronta para review. Não achou de novo →
   `GITHUB_PULL_REQUEST_REJECTED` (sem commits entre as branches, branch que não está no remoto).
6. Sucesso: transação no card grava `pullRequest` (com `dispatchAs` = `triggeredBy` do `run` da etapa de PR) e
   `pullRequestError: null`, e um evento `update` na linha do tempo ("PR #12 aberta, rascunho").
7. Erro: `pullRequestError: { code, at }` e um evento `update` com o código. **Nunca lança para quem chamou**:
   a abertura automática roda dentro do `complete_stage` de outro agente, e a falha da PR não pode derrubar a
   resposta dele.

Onde é chamado:

- `completeRun` (`orchestrator.ts:86-119`): depois do `finishOnCard`, se o `run` seguinte é da etapa de PR, e
  **antes** do `pumpBoard`, para o `/observe` já encontrar a PR.
- `triggerStage` (`orchestrator.ts:51-79`): depois do `enqueueOnCard`, quando `stageKey` é a etapa de PR (arrastar
  direto, aprovar, rodar de novo), também antes do `pumpBoard`.
- A rota `POST .../pull-request`.

#### 4.3 Webhook

`applyWebhookEvent` (`github-webhook-events.ts`) continua síncrono e cuida só do cache de permissões. A rota
(`app/(routes)/github/webhook/route.ts:58-78`) passa a chamar, para `pull_request`, `pull_request_review`,
`issue_comment` e `check_suite`, um handler assíncrono novo `handlePullRequestWebhook(event, payload)` em
`apps/api/(shared)/lib/pull-request/pull-request-webhook.ts`:

1. `parsePullRequestWebhook(event, payload)` (puro, schemas Zod em `github-webhook.schema.ts`) devolve um evento
   normalizado `{ repositoryFullName, installationId, number, kind, ... }` ou `null` quando o evento não interessa
   (ex.: `issue_comment` numa issue que não é PR, `check_suite` sem `pull_requests`). Payload fora do schema →
   `400 GITHUB_WEBHOOK_PAYLOAD_INVALID` (código existente).
2. Board por `boardIdForRepository`; confere `installation.id` contra `board.repository.installationId`. Sem board
   → `handled: false`.
3. Card do board com `pullRequest.number === number`. Sem card → `handled: false`.
4. Transação no card: `applyPullRequestEvent` e grava.
5. Por tipo:
   - `closed` (com ou sem merge): evento na linha do tempo ("PR #12 mergeada por @x" / "PR #12 fechada sem merge
     por @x") e `settlePullRequest(board, card)`.
   - `review_submitted` com `state !== "approved"` ou com corpo, e `issue_comment.created` numa PR:
     `onPullRequestComment(board, card)`. Aprovação sem texto só atualiza `reviews`.
   - O resto só atualiza o card.
6. Responde `{ data: { handled: true } }`. Falha de Firestore → `503 GITHUB_WEBHOOK_PROCESSING_FAILED`, logada com
   `x-github-delivery`, para a entrega aparecer como falha no App e poder ser reenviada.

`settlePullRequest` (orquestrador): `resolvePullRequestClosure(card)` → `lane: "done"` usa
`cardRepository.move(id, { lane: "done", movedByUserId })`; `lane: "tasks"` usa `move` com
`nextTasksOrder(listByBoard)` (`card-order.ts:39-40`), como a rota de mover faz
(`move/route.ts:51-58`). `movedByUserId` fica `null` (quem moveu foi o board); o `CardMovePatch`
(`card.repository.ts:16-21`) passa a aceitar `null`. Com execução viva, não move: o `completeRun` chama
`settlePullRequest` de novo depois do `finishOnCard`.

`onPullRequestComment` (orquestrador):

1. Só age se a etapa de PR tem `onPrComment`, a PR está `open` e `limits.maxPrCommentRunsPerHour > 0`.
2. Card com execução viva, ou limite estourado (`canRunPrComment`) → grava `unhandledCommentAt` e, no limite,
   um evento "limite de N /mediate por hora atingido".
3. Senão, `triggerStage` com `trigger: "pr_comment"`, `by: pullRequest.dispatchAs`, e o comando
   `onPrComment` no lugar do comando da etapa. Grava o instante em `commentRunsAt`.

Para isso, `newRunFor` (`decide.ts:97-120`) aceita `command?` e `agent?` opcionais; `planTrigger` aceita
`command?`; `decideTrigger` com `trigger: "pr_comment"` exige que o card esteja na etapa de PR. O `run` do
`/mediate` grava `agent: null` (o `board.yml` não declara agente para o `onPrComment`).

Comentário que chegou durante uma execução: `planCompletion` (`decide.ts:200-271`) passa a receber o card
inteiro; quando o `run` que fecha é da etapa de PR, a PR está aberta, `unhandledCommentAt` está preenchido e o
limite deixa, devolve `next = { stage, trigger: "pr_comment", command: onPrComment }` e o patch do card zera
`unhandledCommentAt` e acrescenta o instante em `commentRunsAt`. O `finishOnCard` (`run.repository.ts:167-234`)
cria o próximo `run` na mesma transação, como já faz para a etapa seguinte; ele passa o `command` adiante e grava
o patch de `pullRequest`.

`CompletionPlan.card` ganha `pullRequest?` opcional. Nenhuma outra transição muda: `failed`, `needs_input` e
`needs_rework` do `/mediate` caem no `resolveTransition` como qualquer etapa.

#### 4.4 Cliente GitHub

`GithubClient` (`github-client.ts:24-35`) ganha:

```ts
createPullRequest(repo: GithubRepositoryRef, input: {
    head: string; base: string; title: string; body: string; draft: boolean;
}): Promise<GithubPullRequest>;
findOpenPullRequest(repo: GithubRepositoryRef, head: string): Promise<GithubPullRequest | null>;
```

`GithubPullRequest = { number, url, title, draft, headRef, baseRef, headSha, commits }`.

- REST (`github-rest-client.ts`): `send` passa a aceitar corpo JSON (`body?: unknown` com
  `Content-Type: application/json`). `findOpenPullRequest` usa `GET /pulls?head=<owner>:<branch>&state=open`.
- Erros novos em `GithubApiErrorKind` (`github-errors.ts:3-7`):
  - `permission_denied`: `403` que não é limite de taxa, **só** em escrita. A leitura mantém a regra atual (403 →
    `not_found`, `github-rest-client.ts:83-97`). `classifyWrite(response)` separa as duas.
  - `unprocessable`: `422`.
- Falso (`github-fake-client.ts`): sem estado, para o resultado não depender de qual instância do Next atende.
  `number` derivado do hash da `head` (1 a 9999), `url` `https://github.com/agent-board-demo/<repo>/pull/<n>`,
  `commits: 3`, `headSha` = SHA-1 da branch. `findOpenPullRequest` devolve a mesma PR. Duas `head` reservadas
  produzem as falhas, para o `/test` ver o modo degradado sem GitHub: `feat/qa-pr-permission` → `permission_denied`
  e `feat/qa-pr-rejected` → `unprocessable`. Repositório fora dos exemplos → `not_found`, como hoje.

#### 4.5 Erros

| `error.code` | Status | Quando | Novo? |
|--------------|--------|--------|-------|
| `GITHUB_APP_PERMISSION_MISSING` | 503 | o App não tem `Pull requests: write` no repositório (403 ao criar a PR) | sim |
| `GITHUB_PULL_REQUEST_REJECTED` | 422 | o GitHub recusou a PR e não há PR aberta da branch para adotar | sim |
| `CARD_NOT_IN_PULL_REQUEST_STAGE` | 409 | `POST .../pull-request` com o card fora da etapa de PR, ou board sem etapa com `pullRequest` | sim |
| `GITHUB_WEBHOOK_PROCESSING_FAILED` | 503 | o webhook validou mas a gravação falhou | sim |
| `GITHUB_APP_NOT_CONFIGURED` | 503 | sem App fora do emulador | existe |
| `GITHUB_RATE_LIMITED` | 503 | cota do App | existe |
| `GITHUB_UNAVAILABLE` | 502 | GitHub fora ou credencial recusada | existe |
| `GITHUB_REPOSITORY_NOT_ACCESSIBLE` | 404 | App sem acesso ao repositório | existe |
| `CARD_NOT_FOUND` | 404 | card de outro board ou apagado | existe |

Os quatro novos entram em `apiErrors` (`packages/internationalization/translations/packages/shared/utils.ts`);
`apiErrorCodesTranslated.test.ts` reprova se faltar.

### 5. Front-end (`apps/app`)

- Rota: nenhuma nova. O bloco entra no detalhe do card (`boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx`),
  entre o `CardSummary` e o `CardActivity` (`:381-397`), quando `card.pullRequest !== null` ou
  `card.pullRequestError !== null`.
- Componente novo `boards/(components)/CardPullRequest.tsx` (client, recebe `board`, `card`, `boardsDictionary`):
  - cabeçalho: `#<number> <title>` como link externo (`rel="noreferrer noopener"`, `target="_blank"`), selo
    "Rascunho" (`Badge variant="outline"`) e selo de estado (aberta, mergeada, fechada);
  - linha `headRef → baseRef · N commits · aberta pelo board há X` (ou "adotada pelo board"), tempo relativo com
    o helper de data que a linha do tempo já usa;
  - seção Checks: resumo (`checksSummary`) e lista `name · conclusão`; vazia → "Nenhum check concluído ainda";
  - seção Reviews: lista `login · estado`; vazia → "Nenhuma review ainda";
  - `pendingComment` → aviso "Comentário novo esperando o /mediate";
  - erro (`pullRequestError`): `Alert` com `apiErrors[code]` e botão "Tentar de novo" (só se
    `canTriggerStages(effectiveRole)`), que chama a mutation com `isPending` bloqueando duplo clique;
  - rodapé: "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído."
  - PR fechada sem merge com o card em Tarefas: o bloco mostra "Fechada sem merge por @x" e o link.
- Card do quadro (`BoardCardItem.tsx`): uma linha `PR #12` com o resumo dos checks (ícone + texto `sr-only`) quando
  `pullRequest.state === "open"`; "PR #12 fechada sem merge" quando o card voltou a Tarefas por isso.
- Ações do card: em `CardDetailClient`, o botão "Abrir PR no GitHub" do desenho é o próprio link do cabeçalho do
  bloco; sem botão duplicado.
- Hook: a mutation `openPullRequestMutation` entra em `useBoardCardCrud` (`(hooks)/useBoardCardCrud.tsx`), com
  `invalidateQueries` de `queryKeys.boards.card(boardId, slug)`, `cards(boardId)` e `cardEvents`. Erro por
  `handleClientError(new FormattedError(error, locale))` + `errorAlert`.
- Dados: nenhum `queryKey` novo; o card já é lido e reconsultado (`useFindBoardCardBySlug`), e
  `useRefetchEventsWhenCardChanges` (`CardDetailClient.tsx:231-243`) já relê a linha do tempo quando o webhook muda
  o `updatedAt`.
- `cardRunReason` (`(components)/cardRunReason.ts`): card na etapa de PR, `idle`, último `run` da etapa com
  sucesso → "Aguardando o merge". Sem isso o card parado não diz por que está parado.
- Estados: sem PR e sem erro → bloco não aparece; erro → `Alert` destrutivo; PR aberta, mergeada e fechada; mobile
  com a lista em uma coluna.

**Direção visual:** seguir o `CardPr` em conteúdo e ordem; tokens do `@repo/design-system` (`Card`, `Badge`,
`Alert`, `Button`). Não precisa de `brainstorming`: o desenho já existe e o bloco é pequeno.

### 6. i18n (pt-br)

Árvore nova em `packages/internationalization/translations/apps/app/pages/common/boards.ts`:

```
cardDetail.pullRequest
  title                 "Pull request"
  openOnGithub          "Abrir PR no GitHub"
  draft                 "Rascunho"
  states.open           "Aberta"
  states.merged         "Mergeada"
  states.closed         "Fechada sem merge"
  branches              "{head} → {base}"
  commits               "{count} commits"
  openedByBoard         "aberta pelo board {when}"
  adoptedByBoard        "adotada pelo board {when}"
  closedBy              "Fechada sem merge por @{login}"
  checks.title          "Checks"
  checks.empty          "Nenhum check concluído ainda"
  checks.summary.pending|success|failure
  checks.conclusion.success|failure|neutral|cancelled|skipped|timed_out|action_required|stale
  reviews.title         "Reviews"
  reviews.empty         "Nenhuma review ainda"
  reviews.state.approved|changes_requested|commented
  pendingComment        "Comentário novo esperando o {command}"
  errorTitle            "Não foi possível abrir a PR"
  retry                 "Tentar de novo"
  retrying              "Abrindo…"
  mergeNote             "O merge é sempre seu. Quando a PR for mergeada, o card vai para Concluído."
board.card.pullRequest
  open                  "PR #{number}"
  closed                "PR #{number} fechada sem merge"
board.card.runReason.awaitingMerge  "Aguardando o merge"
board.configIssues.pullRequestStageDuplicated / pullRequestStageNotLast
```

`apiErrors`: `GITHUB_APP_PERMISSION_MISSING`, `GITHUB_PULL_REQUEST_REJECTED`, `CARD_NOT_IN_PULL_REQUEST_STAGE`,
`GITHUB_WEBHOOK_PROCESSING_FAILED`.

Os textos que o board grava na linha do tempo ("PR #12 aberta", "mergeada por", "limite atingido") são markdown de
evento, gravados pela API como os de `complete_stage`. Como a linha do tempo é dado e não copy de UI, eles ficam
num módulo de textos da API (`pull-request-events.ts`), em pt-br, no mesmo formato dos eventos do orquestrador.
Ver pergunta 5.

### 7. Autorização e segurança

- `POST .../pull-request`: `requireBoardApi("trigger")` repete a regra do botão. Card de outro board → 404 pelo
  `findBySlug` (`card.repository.ts:63-73`).
- Webhook: só age depois do HMAC (`github-webhook-signature.ts`); confere `installation.id` do payload contra o
  board; nunca confia em `number` sem achar o card pelo board do repositório.
- O conteúdo de comentário e review **não** é gravado no card nem passado ao agente pelo disparo (regra de ouro 16).
  O disparo leva só os campos de sempre (`StageDispatch`, `run.ts:55-69`); o `/mediate` lê os comentários no
  GitHub, como dado.
- O token de instalação nunca sai da API (regra 15). O DTO não expõe `dispatchAs.userId`.
- Loop de execução: o limite por hora (`maxPrCommentRunsPerHour`, padrão 3) e "uma execução viva por card"
  (`planTrigger`, `decide.ts:144-146`) cortam o ciclo comentário → `/mediate` → push → CI → bot comenta. O board
  nunca comenta na PR e o `/mediate` em modo board grava as respostas no card, não no GitHub
  (`kit/commands/mediate.md:8-9`), então o próprio board não gera comentário.
- Redelivery do mesmo comentário: pode disparar um `/mediate` a mais, dentro do limite. Aceito no MVP.
- Arcjet: o webhook já está no orçamento de rate limit existente; nada muda.
- Impersonação: não existe mais (`app-cleanup`). N/A.

### 8. Testes (Vitest)

| Arquivo | Nível | O que prova |
|---------|-------|-------------|
| `packages/kanban-contract/__tests__/boardConfig.test.ts` | unit | `pullRequest` opcional com `draft: true` por padrão; duas etapas com `pullRequest` → `pull_request_stage_duplicated`; etapa de PR fora do fim → `pull_request_stage_not_last`; `maxPrCommentRunsPerHour` padrão 3, aceita 0, recusa 21 |
| `.../cardState.test.ts` | unit | `success` na etapa de PR fica na etapa, `idle`; sem `pullRequest` continua indo para `stageKey: null` |
| `.../pullRequest.test.ts` (novo) | unit | `resolvePullRequestClosure` (merged, closed, com execução viva, aberta); `canRunPrComment` na janela de 1 h e com limite 0; `summarizeChecks` (vazio, uma falha, todas ok, `headSha` velho ignorado); `summarizeReviews`; `applyPullRequestEvent` por tipo, com teto de 10 checks e 20 reviews |
| `.../boardConfigDiff.test.ts` | unit | `pullRequest.draft` trocado aparece em `changed` |
| `apps/api/__tests__/githubRestClient.test.ts` | unit (`fetch` mockado) | `createPullRequest` manda `POST` com corpo JSON; 403 → `permission_denied`; 422 → `unprocessable`; 403 com `x-ratelimit-remaining: 0` → `rate_limited`; `findOpenPullRequest` monta `head=owner:branch` |
| `.../githubFakeClient.test.ts` | unit | número estável por branch; branches reservadas devolvem as duas falhas |
| `.../githubErrorResponse.test.ts` | unit | os dois tipos novos viram `GITHUB_APP_PERMISSION_MISSING` 503 e `GITHUB_PULL_REQUEST_REJECTED` 422 |
| `.../pullRequestOpen.test.ts` (novo) | unit com repositórios e cliente mockados | abre; adota no 422 quando há PR aberta; tenta sem rascunho; grava `pullRequestError` sem lançar; não faz nada com PR aberta ou fora da etapa; `buildPullRequestBody` em ordem de etapas e com corte |
| `.../pullRequestWebhook.test.ts` (novo) | unit (schemas + handler com repos mockados) | cada evento normalizado; `issue_comment` em issue comum ignorado; instalação divergente ignorada; merge sem execução move para Concluído; merge com execução viva só grava; fechado volta a Tarefas no fim da fila; comentário dispara `pr_comment`; comentário com execução viva grava `unhandledCommentAt`; limite estourado grava evento |
| `.../githubWebhookRoute.test.ts` | rota com `vi.mock` | eventos de PR chamam o handler; falha do handler → 503 `GITHUB_WEBHOOK_PROCESSING_FAILED`; assinatura inválida continua 401 antes de tudo |
| `.../orchestratorDecide.test.ts` | unit | `planCompletion` na etapa de PR com `unhandledCommentAt` cria `next` com `command: /mediate`; sem limite, não cria; `newRunFor` com `command` |
| `.../orchestratorTick.test.ts` | unit | `completeRun` chama `ensurePullRequest` antes do `pumpBoard` quando o próximo `run` é da etapa de PR, e `settlePullRequest` depois |
| `.../cardPullRequestRoute.test.ts` (novo) | rota com guard e repos mockados | 200 abrindo; 200 idempotente com PR aberta; 409 fora da etapa; 403 para `viewer`; 503 `GITHUB_APP_NOT_CONFIGURED` sem cliente; 503 `GITHUB_APP_PERMISSION_MISSING` |
| `.../cardMapper.test.ts` | unit | card antigo → `pullRequest: null`; `Timestamp` → ISO; `toCardDTO` não vaza `dispatchAs.userId` nem `commentRunsAt` |
| `.../agentToolsRoutes.test.ts` | rota | `get_card` traz `pullRequest` |
| `apps/app/__tests__/cardPullRequest.test.tsx` (novo) | componente | renderiza aberta/rascunho/mergeada/fechada; erro traduzido; botão só para `operator`+; vazio de checks e reviews |
| `apps/app/__tests__/useBoardCardCrud.test.tsx` | hook | `openPullRequest` invalida card, lista e eventos; erro chama `errorAlert` |
| `apps/app/__tests__/cardRunReason.test.ts` | unit | "Aguardando o merge" |
| `apps/api/__tests__/orchestratorRuns.emulator.test.ts` (estender) | emulador | **só** um caso: test → PR abre com o cliente falso → webhook de merge → card em `done`, contra o Firestore de verdade. Prova que as transações do `finishOnCard` com o patch de `pullRequest` e o `move` sem `movedByUserId` gravam a forma que o mapper lê; o unitário mocka o repositório e não pega isso |

### 9. O que o `/test` vai percorrer

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, com `GITHUB_WEBHOOK_SECRET` de dev **só no shell** da API
(qualquer valor gerado na hora com `openssl rand -hex 32`; nunca em arquivo versionado nem no `report.md`). O
cliente GitHub falso cobre a abertura; o script novo `pnpm --filter api github-webhook` cobre os eventos do
GitHub. O executor falso cobre `/observe` e `/mediate`.

Fluxos:

1. **Abrir PR na entrada.** Card do `sample-app` com o `board.yml` de exemplo tendo `pullRequest: { draft: true }`
   na etapa `pr`. Levar o card de Testando com sucesso → card entra em Aguardando PR, bloco mostra
   `#<n> <título> Rascunho`, `feat/<slug> → main · 3 commits`, checks e reviews vazios; linha do tempo com "PR #n
   aberta"; o `/observe` roda e termina; o card fica `idle` com "Aguardando o merge" (não vai para Concluído).
2. **Comentário dispara `/mediate`.** `github-webhook <boardId> <slug> comment` → run com comando `/mediate` aparece;
   três comentários seguidos na mesma hora → o quarto grava "limite atingido" e não cria run.
3. **Comentário durante execução.** Comentário enquanto o `/observe` roda → aviso "Comentário novo esperando o
   /mediate"; quando o `/observe` termina, o `/mediate` começa sozinho.
4. **CI e review.** `checks-failure` → selo de falha no bloco e no card do quadro; `checks-success` com outro app →
   resumo continua falha; `review-changes` de `qa-pr-flow` → "Pediu mudanças".
5. **Merge.** `merged` → card em Concluído, evento "PR #n mergeada por @x".
6. **Fechada sem merge.** Outro card; `closed` → card no fim de Tarefas, "PR #n fechada sem merge por @x" no quadro e
   na linha do tempo.
7. **Modo degradado.** Card com branch `feat/qa-pr-permission` → `Alert` com o texto de
   `GITHUB_APP_PERMISSION_MISSING`, botão "Tentar de novo" (o falso continua recusando: o erro volta, sem 500);
   `viewer` não vê o botão. Branch `feat/qa-pr-rejected` → texto de `GITHUB_PULL_REQUEST_REJECTED`.
8. **Sem segredo de webhook.** API sem `GITHUB_WEBHOOK_SECRET` → `POST /github/webhook` responde
   `503 GITHUB_APP_NOT_CONFIGURED` (regressão).

Combinações: light, dark e mobile no detalhe do card com a PR aberta, com erro e fechada; papéis `operator` e
`viewer`.

**Não observável sem infra externa (vira 🔒):** criação real no GitHub, o 403 real de um App sem
`pull_requests: write`, a entrega real dos eventos (incluindo `check_suite.completed` de outro app, como o GitHub
Actions), o 422 real de rascunho em repositório privado no plano Free e a PR aparecer com o autor `[bot]`.

---

## Etapa 2: blueprint técnico

### Contrato

```ts
// packages/kanban-contract/src/boardConfig.ts
export const stagePullRequestSchema = z.object({ draft: z.boolean().default(true) });

stageConfigSchema = z.object({
    // ...campos atuais
    onPrComment: z.string().regex(SLASH_COMMAND).optional(),
    pullRequest: stagePullRequestSchema.optional(),
});

limits: z.object({
    // ...atuais
    maxPrCommentRunsPerHour: z.number().int().min(0).max(MAX_PR_COMMENT_RUNS_PER_HOUR)
        .default(DEFAULT_PR_COMMENT_RUNS_PER_HOUR), // 20 e 3
}).prefault({}),

export const findPullRequestStage = (config: BoardConfig): StageConfig | undefined =>
    config.stages.find((stage) => stage.pullRequest !== undefined);
```

```ts
// packages/kanban-contract/src/pullRequest.ts
export const PULL_REQUEST_STATES = ["open", "merged", "closed"] as const;
export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];
export type PullRequestReviewState = "approved" | "changes_requested" | "commented";
export type PullRequestChecksSummary = "pending" | "success" | "failure" | null;

export type PullRequestCheck = { app: string; name: string; conclusion: string; headSha: string; at: string };
export type PullRequestReview = { login: string; state: PullRequestReviewState; at: string };

export type CardPullRequest = {
    number: number; url: string; title: string; draft: boolean; state: PullRequestState;
    headRef: string; baseRef: string; headSha: string | null; commits: number | null;
    openedAt: string; openedByBoard: boolean; dispatchAs: RunPerson;
    closedAt: string | null; closedByLogin: string | null;
    checks: PullRequestCheck[]; reviews: PullRequestReview[];
    commentRunsAt: string[]; unhandledCommentAt: string | null;
};

export type PullRequestEvent =
    | { kind: "closed"; merged: boolean; byLogin: string; at: string }
    | { kind: "reopened" | "ready_for_review" | "converted_to_draft"; at: string }
    | { kind: "synchronize"; headSha: string; commits: number | null; at: string }
    | { kind: "edited"; title: string; at: string }
    | { kind: "review_submitted"; login: string; state: PullRequestReviewState; hasBody: boolean; at: string }
    | { kind: "review_dismissed"; login: string; at: string }
    | { kind: "check_suite_completed"; app: string; name: string; conclusion: string; headSha: string; at: string }
    | { kind: "comment"; login: string; at: string };

export function applyPullRequestEvent(pr: CardPullRequest, event: PullRequestEvent): CardPullRequest;
export function resolvePullRequestClosure(card: {
    lane: CardLane; activeRunId: string | null; pullRequest: Pick<CardPullRequest, "state"> | null;
}): { lane: "done" | "tasks" } | null;
export function canRunPrComment(runsAt: string[], now: Date, limit: number): boolean;
export function summarizeChecks(checks: PullRequestCheck[], headSha: string | null): PullRequestChecksSummary;
export function summarizeReviews(reviews: PullRequestReview[]): PullRequestReviewState | null;
export function isPrCommentTrigger(event: PullRequestEvent): boolean; // comment, ou review não-aprovação ou com corpo
```

```ts
// cardState.ts, dentro de resolveTransition, antes de nextStageKey
if (stage.pullRequest !== undefined) {
    return { ...current, state: "idle" };
}
```

```ts
// packages/sdk/src/types/board/card.ts
export type CardPullRequestDTO = Omit<CardPullRequest,
    "dispatchAs" | "commentRunsAt" | "unhandledCommentAt"> & {
    checksSummary: PullRequestChecksSummary;
    reviewsSummary: PullRequestReviewState | null;
    pendingComment: boolean;
};
export type CardPullRequestErrorDTO = { code: string; at: string };

export type CardDTO = {
    // ...atuais
    pullRequest: CardPullRequestDTO | null;
    pullRequestError: CardPullRequestErrorDTO | null;
};

// actions/boardCard/action.ts
async openPullRequest(boardId: string, slug: string): Promise<CardDTO> // POST `${cardPath}/pull-request`
```

### Rota

```ts
// apps/api/app/(routes)/boards/[id]/cards/[slug]/pull-request/route.ts
export const POST = requireBoardApi<CardRouteParams>("trigger", async (_req, ctx) => {
    const stage = findPullRequestStage(ctx.board.config);
    const card = await cardRepository.findBySlug(ctx.board.id, ctx.params.slug);
    if (!card) return errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    if (!stage || card.lane !== "stage" || card.stageKey !== stage.key) {
        return errorResponse("CARD_NOT_IN_PULL_REQUEST_STAGE", HTTP_STATUS.CONFLICT);
    }
    const result = await ensurePullRequest({
        board: ctx.board, cardId: card.id,
        dispatchAs: { userId: ctx.profile.id, login: ctx.member.login },
    });
    if (!result.ok) return errorResponse(result.code, result.status);
    return Response.json({ data: toCardDTO(result.card) });
});
```

`ensurePullRequest` devolve `{ ok: true; card } | { ok: false; code; status }`; no caminho automático o
orquestrador ignora o resultado (o erro já ficou gravado no card).

Resposta de exemplo (`200`):

```json
{ "data": { "id": "agent-board-demo--sample-app__login", "lane": "stage", "stageKey": "pr", "state": "queued",
  "pullRequest": { "number": 4821, "url": "https://github.com/agent-board-demo/sample-app/pull/4821",
    "title": "Login com GitHub", "draft": true, "state": "open", "headRef": "feat/login", "baseRef": "main",
    "headSha": "9f2c…", "commits": 3, "openedAt": "2026-11-27T10:00:00.000Z", "openedByBoard": true,
    "closedAt": null, "closedByLogin": null, "checks": [], "reviews": [],
    "checksSummary": "pending", "reviewsSummary": null, "pendingComment": false },
  "pullRequestError": null } }
```

Erro de exemplo (`503`): `{ "error": { "code": "GITHUB_APP_PERMISSION_MISSING" } }`.

Webhook de exemplo (`pull_request`, trecho que o schema lê):

```json
{ "action": "closed", "number": 4821,
  "pull_request": { "number": 4821, "merged": true, "merged_by": { "login": "qa-pr-flow" },
    "head": { "ref": "feat/login", "sha": "9f2c…" }, "title": "Login com GitHub", "draft": true, "commits": 3 },
  "repository": { "full_name": "agent-board-demo/sample-app" }, "installation": { "id": 1 },
  "sender": { "login": "qa-pr-flow" } }
```

Resposta: `{ "data": { "handled": true } }`.

| `error.code` | Status |
|--------------|--------|
| `GITHUB_APP_PERMISSION_MISSING` | 503 |
| `GITHUB_PULL_REQUEST_REJECTED` | 422 |
| `CARD_NOT_IN_PULL_REQUEST_STAGE` | 409 |
| `GITHUB_WEBHOOK_PROCESSING_FAILED` | 503 |

### Persistência

Documento `card/<boardId>__<slug>` (campos novos):

```
pullRequest: {
  number: 4821, url: "https://…/pull/4821", title: "Login com GitHub", draft: true, state: "open",
  headRef: "feat/login", baseRef: "main", headSha: "9f2c…", commits: 3,
  openedAt: Timestamp, openedByBoard: true, dispatchAs: { userId: "u1", login: "guilherme" },
  closedAt: null, closedByLogin: null,
  checks: [{ app: "github-actions", name: "CI", conclusion: "failure", headSha: "9f2c…", at: Timestamp }],
  reviews: [{ login: "qa-pr-flow", state: "changes_requested", at: Timestamp }],
  commentRunsAt: [Timestamp], unhandledCommentAt: null
}
pullRequestError: null | { code: "GITHUB_APP_PERMISSION_MISSING", at: Timestamp }
```

Repositório:

- `card.mapper.ts`: `PERSISTED_KEYS` ganha `pullRequest` e `pullRequestError`; `toPullRequest(value)` normaliza
  `Timestamp`→ISO com `normalizeFirestoreInstant`, filtra entradas inválidas de `checks`/`reviews` e devolve `null`
  sem `number`; `toCardDTO` deriva `checksSummary`, `reviewsSummary`, `pendingComment` e omite os campos internos.
  `CardRecord` mantém o `CardPullRequest` completo.
- `card.repository.ts`: `updatePullRequest(id, update: (card) => { pullRequest?, pullRequestError? } | null)` em
  transação (lê, aplica, grava, `updatedAt`); `findByPullRequest(boardId, number)` sobre `listByBoard`;
  `CardMovePatch.movedByUserId: string | null`.
- `run.repository.ts`: `finishOnCard` passa `plan.next.command`/`agent` ao `newRunFor` e grava
  `plan.card.pullRequest` quando vier.

### Pseudo-diffs

```diff
// apps/api/(shared)/lib/orchestrator/decide.ts
 export type CompletionPlan = {
-    card: { lane; stageKey; state; reworkLoops };
-    next: { stage: StageConfig; trigger: "transition" } | null;
+    card: { lane; stageKey; state; reworkLoops; pullRequest?: CardPullRequest };
+    next: { stage: StageConfig; trigger: "transition" | "pr_comment"; command?: string } | null;
 };

 export function planCompletion(input: {
-    card: Pick<CardRecord, "state" | "reworkLoops">;
+    card: Pick<CardRecord, "state" | "reworkLoops" | "pullRequest">;
+    now: Date;
     ...
 }) {
     ...
     const position = resolveTransition(...);
+    const followUp = prCommentFollowUp(input, position); // etapa de PR, PR aberta, unhandledCommentAt, limite
+    if (followUp) return followUp;
```

```diff
// apps/api/(shared)/lib/orchestrator/orchestrator.ts  (completeRun)
     if (result.ignored) return { ignored: true };
+    if (result.nextRunId && isPullRequestStageRun(board, result)) {
+        await ensurePullRequest({ board, cardId: result.cardId, dispatchAs: result.nextTriggeredBy });
+    }
+    await settlePullRequest(board, result.cardId, now);
     await pumpBoard(board, now);
```

`FinishResult` passa a devolver `cardId`, a etapa e o `triggeredBy` do próximo `run`, para o orquestrador não
reler o run.

```diff
// apps/api/app/(routes)/github/webhook/route.ts
     const outcome = payload === undefined ? null : applyWebhookEvent(event, payload);
+    if (outcome && !outcome.invalid && !outcome.handled && isPullRequestWebhook(event)) {
+        const handled = await handlePullRequestWebhook(event, payload, { delivery });
+        if (!handled.ok) return errorResponse(handled.code, handled.status);
+        outcome.handled = handled.handled;
+    }
```

```diff
// kit/.kanban/board.yml e .kanban/board.yml
   - key: pr
     column: Aguardando PR
     command: /observe
     agent: observador-tarefa
     model: haiku
     effort: low
     onPrComment: /mediate
+    pullRequest:
+      draft: true # o board abre a PR como rascunho; false abre pronta para review
 ...
 limits:
   maxReworkLoops: 2
   maxTurnsPerStage: 200
+  maxPrCommentRunsPerHour: 3 # /mediate por PR e por hora; 0 desliga
```

```diff
// kit/commands/mediate.md (seção board-mode)
- - Disparado por comentário novo na PR do card. ...
+ - Disparado por comentário novo na PR do card. A PR é a de `pullRequest` no `get_card`; ignore o slug no
+   `$ARGUMENTS` e use esse número. Itens `⏳ Decisão pendente` ...
```

O `kit/commands/observe.md` não muda.

### Árvore de arquivos

```
packages/kanban-contract/src/
  boardConfig.ts            (pullRequest, maxPrCommentRunsPerHour, regras, findPullRequestStage)
  boardConfigIssues.ts      (2 regras)
  boardConfigDiff.ts        (pullRequest no diff)
  cardState.ts              (success na etapa de PR fica)
  run.ts                    (pr_comment)
  agentResults.ts           (pullRequest no AgentCardView)
  pullRequest.ts            (novo) + export no index.ts
packages/sdk/src/
  types/board/card.ts       (CardPullRequestDTO, campos no CardDTO)
  actions/boardCard/action.ts (openPullRequest)
apps/api/
  (shared)/lib/github/github-client.ts        (2 métodos, GithubPullRequest)
  (shared)/lib/github/github-rest-client.ts   (POST com corpo, classifyWrite)
  (shared)/lib/github/github-fake-client.ts   (PR determinística, branches de falha)
  (shared)/lib/github/github-errors.ts        (permission_denied, unprocessable)
  (shared)/lib/pull-request/pull-request-open.ts     (ensurePullRequest, buildPullRequestBody)
  (shared)/lib/pull-request/pull-request-webhook.ts  (parse + handle)
  (shared)/lib/pull-request/pull-request-events.ts   (markdown dos eventos do board)
  (shared)/lib/orchestrator/decide.ts         (planCompletion, newRunFor, planTrigger)
  (shared)/lib/orchestrator/orchestrator.ts   (ensurePullRequest, settlePullRequest, onPullRequestComment)
  (shared)/lib/agent-contract/agent-card-view.ts (pullRequest)
  (shared)/mappers/card.mapper.ts             (toPullRequest, DTO)
  (shared)/repositories/card.repository.ts    (updatePullRequest, findByPullRequest, movedByUserId null)
  (shared)/repositories/run.repository.ts     (command/agent no next, patch de pullRequest)
  (shared)/validation/github-webhook.schema.ts (4 schemas)
  app/(routes)/github/webhook/route.ts
  app/(routes)/boards/[id]/cards/[slug]/pull-request/route.ts (novo)
  scripts/github-webhook.mjs (novo) + "github-webhook" no package.json
apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/
  (components)/CardPullRequest.tsx (novo)
  (components)/BoardCardItem.tsx   (linha da PR)
  (components)/cardRunReason.ts    (awaitingMerge)
  (components)/boardConfigIssueMessage.ts (2 regras)
  (hooks)/useBoardCardCrud.tsx     (openPullRequestMutation)
  (pages)/[id]/cards/[slug]/CardDetailClient.tsx (monta o bloco)
packages/internationalization/translations/
  apps/app/pages/common/boards.ts
  packages/shared/utils.ts (apiErrors)
kit/.kanban/board.yml, kit/commands/mediate.md, kit/README.md, .kanban/board.yml
apps/api/(shared)/lib/github/github-sample-repositories.ts (etapa pr no board.yml do sample-app)
docs/board/ACCESS.md, ARCHITECTURE.md, CONTRACT.md; docs/SETUP.md; docs/PRE-PRODUCTION.md
```

O `board.yml` do `sample-app` do emulador (`github-sample-repositories.ts:34-61`) hoje termina em `test`, sem etapa
`pr`. Ele ganha a etapa `pr` igual à do kit (`/observe`, `onPrComment: /mediate`, `pullRequest: { draft: true }`)
para o `/test` ver o fluxo. Efeito colateral: no emulador, um card que sai de Testando com sucesso passa a parar em
Aguardando PR em vez de ir para Concluído; o `/develop` confere os testes de emulador e a suíte `apps/e2e` que
contam com isso.

### Script de webhook no emulador

`apps/api/scripts/github-webhook.mjs <boardId> <slug> <evento> [--login <login>] [--app <slug>]`, com `evento` em
`merged | closed | reopened | comment | review-approved | review-changes | checks-success | checks-failure |
synchronize`. Recusa rodar fora do emulador (`readEmulatorTarget` + `refuseSeedReason`, igual ao
`agent-token.mjs:10-25`), lê `pullRequest.number` e `headSha` do card, monta o payload com
`repository.full_name` do board, assina com `GITHUB_WEBHOOK_SECRET` do ambiente e faz `POST` na API local
(`http://localhost:3002/github/webhook` ou `API_URL`). Sem a variável, sai com a instrução de gerar uma no shell.
Imprime só o status e o corpo da resposta, nunca o segredo. O `docs/SETUP.md` ganha o roteiro.

### Ordem de implementação e commit

1. `feat(kanban-contract)`: `pullRequest` na etapa, limite, regras, `resolveTransition`, `pullRequest.ts`,
   `pr_comment`, `AgentCardView` (+ testes).
2. `feat(sdk)`: `CardPullRequestDTO`, campos no `CardDTO`, `openPullRequest`.
3. `feat(api)`: cliente GitHub (REST, falso, erros) + testes.
4. `feat(api)`: mapper e repositórios do card + testes.
5. `feat(api)`: abertura no orquestrador, rota `pull-request`, `get_card` + testes.
6. `feat(api)`: webhook de PR, `settlePullRequest`, `/mediate` por comentário + testes; script `github-webhook`.
7. `feat(app)`: `useBoardCardCrud.openPullRequest`, `CardPullRequest`, linha no `BoardCardItem`, `cardRunReason`,
   regras de config + testes.
8. `feat(internationalization)`: chaves do bloco e `apiErrors`.
9. `chore(kit)`: `board.yml` e `mediate.md` do kit; `chore`: `.kanban/board.yml` deste repositório.
10. `docs`: `ACCESS.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `SETUP.md`, `PRE-PRODUCTION.md`.
11. `docs(features): pr-flow` (último).

### Env e configuração

- Nenhuma variável nova. `GITHUB_WEBHOOK_SECRET` passa a importar também em dev para o `/test` (só no shell).
- Repositórios importados: atualizar `.kanban/board.yml` com `pullRequest` e `maxPrCommentRunsPerHour` e recarregar
  o board; atualizar `.claude/commands/mediate.md` pelo `kit/apply.mjs`.

### Infra: pré-requisitos manuais (vão para `docs/PRE-PRODUCTION.md`, item 5)

Nenhum destes bloqueia a entrega; sem eles o board cai no modo degradado com `error.code`.

1. **Conferir a permissão `Pull requests: Read and write`** no GitHub App (Settings → Developer settings → GitHub
   Apps → o App → Permissions). O `PRE-PRODUCTION.md:106` marca como feito, mas nenhum código mediu. Se precisar
   mudar, o GitHub pede que cada instalação aceite a permissão nova (a conta dona recebe o pedido em Settings →
   Applications → Installed GitHub Apps → Review request); até aceitar, o board responde
   `GITHUB_APP_PERMISSION_MISSING`.
2. **Assinar os eventos** `Pull request`, `Pull request review`, `Issue comment` e `Check suite` (Permissions &
   events → Subscribe to events). Hoje nenhum está marcado (`PRE-PRODUCTION.md:107`). `Issue comment` exige
   `Issues: read` e `Check suite` exige `Checks: read`, já listadas.
3. **Conferir depois:** levar um card de teste até Aguardando PR e ver a PR aparecer como rascunho com autor
   `<app>[bot]`; comentar na PR e ver o `/mediate` na linha do tempo; Recent Deliveries do App com `200` e
   `{"data":{"handled":true}}`; mergear e ver o card em Concluído.
4. Repositório privado em conta Free: o GitHub não aceita PR rascunho; o board abre pronta para review e avisa na
   linha do tempo. Nada a configurar, só saber.

### Riscos

- `check_suite.completed` de outros apps (GitHub Actions) chega a todo App com `Checks: read`, segundo a
  documentação do evento; não medido aqui. Se não chegar, o bloco fica em "Nenhum check concluído ainda". Vira 🔒
  no `/test` e item de conferência no `PRE-PRODUCTION.md`.
- O resumo dos checks é parcial: soma só suítes concluídas. Uma suíte ainda rodando não aparece até concluir.
- A abertura automática acrescenta uma chamada ao GitHub (até 10 s de timeout, `github-rest-client.ts:25`) no
  `complete_stage` do `/test`. Aceitável; se incomodar, sai do caminho síncrono depois.
- O `/mediate` roda com o executor de quem disparou a etapa de PR. Sem runner online dessa pessoa, o run termina
  `no_runner` e o card fica `failed` na etapa de PR, com a PR aberta. O merge ainda leva o card para Concluído.
- Boards já importados só ganham o fluxo depois de recarregar o `board.yml`.

---

## Perguntas em aberto

Decididas pela escada spec → padrão do repo → menor raio, sem perguntar.

1. **Onde fica a escolha "rascunho ou não"?** Opções: (a) campo `pullRequest.draft` na etapa do `board.yml`;
   (b) chave por etapa em `stageSettings`, com toggle na tela Configuração; (c) sempre rascunho.
   **Adotada: (a)**, padrão `true`. Atende "conforme o board" e a recomendação da spec (rascunho por padrão) sem
   tela nova; o `board.yml` já é a fonte de configuração por etapa (regra 12). Descartada (b) por exigir UI e
   rota de configuração fora do corte.
2. **Como o board sabe qual etapa abre PR?** Opções: (a) campo explícito `pullRequest` na etapa; (b) a etapa que
   tem `onPrComment`; (c) a última etapa. **Adotada: (a)**, com validação de "no máximo uma" e "a última".
   (b) mistura duas configurações e (c) mudaria o comportamento de todo board existente ao recarregar.
3. **Quem é o autor da PR?** Opções: (a) o bot do GitHub App, com o token de instalação; (b) a pessoa que
   disparou, pelo runner (`gh pr create` no `/observe`). **Adotada: (a)**, porque a spec e o `board-mode.md` dizem
   que o board abre a PR e (b) dependeria de runner online e mudaria o `/observe`. O `ACCESS.md:56` é corrigido.
4. **Quais eventos disparam o `/mediate`?** Opções: (a) `pull_request_review.submitted` (menos aprovação sem
   texto) e `issue_comment.created`; (b) também `pull_request_review_comment`; (c) só reviews.
   **Adotada: (a)**. (b) dispararia uma execução por comentário em linha de uma mesma review; (c) perderia o
   comentário geral da PR. Comentários de bots contam, porque o `/mediate` foi feito para review automático também.
5. **Os textos que o board grava na linha do tempo ("PR #12 aberta") vão para o dicionário?** Opções: (a) markdown
   em pt-br gravado pela API, como os eventos do orquestrador; (b) eventos tipados novos, traduzidos no app.
   **Adotada: (a)**, menor raio; o evento é dado da linha do tempo. Se quiser tradução, (b) pede um tipo novo em
   `CARD_EVENT_TYPES`.
6. **Limite do `/mediate`:** valor e lugar. **Adotado:** `limits.maxPrCommentRunsPerHour` no `board.yml`, padrão 3,
   0 desliga, máximo 20. A spec pede limite "por PR e por hora" sem número.
7. **PR reaberta depois de o card voltar para Tarefas:** opções: (a) ignorar, e o card adota a PR aberta quando
   voltar à etapa de PR; (b) trazer o card de volta para Aguardando PR. **Adotada: (a)**, menor raio; (b) seria uma
   transição nova fora do corte.
8. **Discordância com o corte (registro, não mudança):** o desenho `CardPr` tem "Marcar como pronta para review" e a
   duração de cada check. Ficaram fora: o primeiro é escrita no GitHub que a spec não lista, o segundo exige buscar
   os `check_run` pela API. Se forem desejados, viram spec própria.

## Referências não lidas

- Canvas privado do Claude Design (`#artboard-CardPr`): substituído pela fonte local
  `docs/design/screens/CardPr.dc.html`, lida.
