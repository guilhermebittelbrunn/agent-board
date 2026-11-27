# Handoff do develop: pr-flow

Rodada autônoma do `/cycle`, sem perguntas. Nada foi commitado nem preparado no índice; tudo está no working
tree da branch `guilhermebittelbrunn/chore-overnight-cycle-specs`.

## Blueprint → arquivos

| Item do blueprint | Arquivos |
|-------------------|----------|
| Contrato: `pullRequest` na etapa, limite, duas regras, `findPullRequestStage` | `packages/kanban-contract/src/boardConfig.ts`, `boardConfigIssues.ts`, `boardConfigDiff.ts` |
| `success` na etapa de PR fica na etapa, `idle` | `packages/kanban-contract/src/cardState.ts` |
| `pr_comment` em `RUN_TRIGGERS` | `packages/kanban-contract/src/run.ts` |
| Regras puras da PR (`applyPullRequestEvent`, `resolvePullRequestClosure`, `canRunPrComment`, `pruneCommentRuns`, `summarizeChecks`, `summarizeReviews`, `isPrCommentTrigger`) | `packages/kanban-contract/src/pullRequest.ts` (novo), `index.ts` |
| `pullRequest` no `AgentCardView` | `packages/kanban-contract/src/agentResults.ts`, `apps/api/(shared)/lib/agent-contract/agent-card-view.ts` |
| SDK: `CardPullRequestDTO`, `CardPullRequestErrorDTO`, campos no `CardDTO`, `openPullRequest` | `packages/sdk/src/types/board/card.ts`, `packages/sdk/src/actions/boardCard/action.ts` |
| Cliente GitHub: `createPullRequest`, `findOpenPullRequest`, `permission_denied`, `unprocessable` | `apps/api/(shared)/lib/github/github-client.ts`, `github-rest-client.ts`, `github-fake-client.ts`, `github-errors.ts` |
| Mapper e repositório do card | `apps/api/(shared)/mappers/card.mapper.ts` (`toPullRequest`, `pullRequestDocument`, DTO derivado), `(shared)/repositories/card.repository.ts` (`updatePullRequest`, `findByPullRequest`, `movedByUserId: null`) |
| `finishOnCard` com `command` do próximo run e patch de `pullRequest` | `apps/api/(shared)/repositories/run.repository.ts` |
| `planCompletion`/`planTrigger`/`newRunFor` com o comando do comentário | `apps/api/(shared)/lib/orchestrator/decide.ts` |
| Abertura (`ensurePullRequest`, `buildPullRequestBody`) e textos da linha do tempo | `apps/api/(shared)/lib/pull-request/pull-request-open.ts`, `pull-request-events.ts` (novos) |
| Orquestrador: abrir ao entrar, `settlePullRequest`, `onPullRequestComment` | `apps/api/(shared)/lib/orchestrator/orchestrator.ts` |
| Webhook (`parsePullRequestWebhook`, `handlePullRequestWebhook`) e schemas | `apps/api/(shared)/lib/pull-request/pull-request-webhook.ts` (novo), `(shared)/validation/github-webhook.schema.ts`, `app/(routes)/github/webhook/route.ts` |
| Rota `POST /boards/[id]/cards/[slug]/pull-request` | `apps/api/app/(routes)/boards/[id]/cards/[slug]/pull-request/route.ts` (novo) |
| Etapa `pr` no `board.yml` do `sample-app` do emulador | `apps/api/(shared)/lib/github/github-sample-repositories.ts` |
| Script `github-webhook` | `apps/api/scripts/github-webhook.mjs`, `scripts/githubWebhookPayload.mjs` (novos), `apps/api/package.json` |
| App: mutation, bloco da PR, linha no card do quadro, "Aguardando o merge", regras de config | `boards/(hooks)/useBoardCardCrud.tsx`, `boards/(components)/CardPullRequest.tsx` (novo), `BoardCardItem.tsx`, `cardRunReason.ts`, `boardConfigIssueMessage.ts`, `boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx` |
| i18n | `packages/internationalization/translations/apps/app/pages/common/boards.ts`, `translations/packages/shared/utils.ts` |
| Kit e `board.yml` deste repositório | `kit/.kanban/board.yml`, `kit/commands/mediate.md`, `kit/README.md`, `.kanban/board.yml` |
| Docs | `docs/board/ACCESS.md`, `docs/board/ARCHITECTURE.md`, `docs/board/CONTRACT.md`, `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` (item 5) |

Os caminhos de `boards/` acima ficam sob `apps/app/app/[locale]/(authenticated)/(common)/(pages)/`.

## Contrato

- `CardDTO` ganhou `pullRequest: CardPullRequestDTO | null` e `pullRequestError: { code, at } | null`. O DTO
  traz `checksSummary`, `reviewsSummary` e `pendingComment`, e omite `dispatchAs`, `commentRunsAt` e
  `unhandledCommentAt` (teste em `cardMapper.test.ts` confere que o `userId` de `dispatchAs` não sai).
- `CardRecord` (só na API) guarda o `CardPullRequest` completo.
- `BoardCardActions.openPullRequest(boardId, slug)` → `POST .../pull-request`.
- `AgentCardView.pullRequest` (`number`, `url`, `draft`, `state`) no `get_card`.
- `GithubClient` ganhou dois métodos. Os clientes falsos montados à mão nos testes precisaram dos dois
  (`boardAccess.test.ts`).
- `FinishResult` agora devolve `cardId` e `next` (`id`, `stageKey`, `trigger`, `triggeredBy`).
- `CardMovePatch.movedByUserId` aceita `null`.
- Consumidores do `CardDTO` com fixture à mão ganharam os dois campos `null`: `orchestratorDecide.test.ts`
  (API) e `useCardEventCrud`, `groupCardsByColumn`, `runCardFixtures`, `boardColumnsMove`,
  `useBoardCardCrud` (app).

## Códigos de erro novos

`GITHUB_APP_PERMISSION_MISSING` (503), `GITHUB_PULL_REQUEST_REJECTED` (422), `CARD_NOT_IN_PULL_REQUEST_STAGE`
(409), `GITHUB_WEBHOOK_PROCESSING_FAILED` (503). Os quatro estão em `apiErrors`;
`apiErrorCodesTranslated.test.ts` passa.

## Desvios em relação ao plano

1. **Bug do `/observe` levando o card a Concluído sem PR: corrigido**, porque faz parte do corte. Em
   `resolveTransition`, `success` numa etapa com `pullRequest` deixa o card na etapa, `idle`. Board sem
   `pullRequest` no `board.yml` continua como antes (o último `success` vai para Concluído) até alguém
   recarregar o `board.yml`; isso está escrito no `kit/README.md`.
2. **Webhook no teste de emulador.** O plano pedia "webhook de merge → card em `done`" contra o Firestore. O
   board do teste de emulador tem id próprio (`emu-orchestrator-…`) e o webhook acha o board por
   `boardIdForRepository(full_name)`, que daria o id do board do seed. O teste chama o que o handler chama
   (`cardRepository.updatePullRequest` com `applyPullRequestEvent` e depois `settlePullRequest`) contra o
   Firestore. O roteamento por repositório e instalação fica coberto no unitário `pullRequestWebhook.test.ts`.
3. **Autor dos eventos que o board grava na linha do tempo:** `{ kind: "agent", name: "agent-board" }`. O
   contrato não tem autor "board"; criar um mexeria em `CardEventAuthor` e na tela.
4. **Hora dos eventos de PR** (`at` de review, check, fechamento) é a hora em que a API recebeu o webhook,
   não a do payload. Evita ler datas em formatos diferentes por evento.
5. **"aberta pelo board há 2 h"** virou "aberta pelo board em {data}", com o `useFormatDisplayDateTime` que a
   linha do tempo já usa. O repo não tem helper de tempo relativo.
6. **`summarizeChecks`** devolve `pending` sem nenhuma suíte concluída do `headSha` atual; o tipo não tem
   `null`. Falha: `failure`, `timed_out`, `cancelled`, `action_required`, `startup_failure`. Sucesso:
   `success`, `neutral`, `skipped`.
7. **Review "commented"** não apaga a aprovação ou o pedido de mudança anterior da mesma pessoa, como no
   GitHub.
8. **Limite do `/mediate`.** O evento "limite atingido" é gravado só na primeira vez em que o comentário fica
   esperando (`unhandledCommentAt` vazio antes), para redelivery e comentários seguidos não encherem a linha
   do tempo. O limite é conferido fora da transação; dois comentários simultâneos podem passar um run a mais
   (o plano já aceitava isso para redelivery).
9. **Comentário esperando depois de `failed`.** `planCompletion` dispara o `/mediate` pendente quando o run da
   etapa de PR termina `idle` ou `failed`; com `needs_input` não dispara (o card espera a resposta).
10. **Corpo da PR:** os títulos das seções são o `column` de cada etapa; o link do card usa
    `NEXT_PUBLIC_APP_URL` sem o segmento de locale (o proxy do app resolve).
11. **Rota `pull-request`** passa o `ensurePullRequest` a pessoa que clicou como `dispatchAs`.

## Decisões em aberto

Nenhuma bloqueante. As oito do plano foram seguidas. Para o usuário decidir depois:

- Os textos que o board grava na linha do tempo ("PR #12 aberta", "mergeada por") são markdown pt-br
  gravado pela API (decisão 5 do plano), em `pull-request-events.ts`.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 848 arquivos, sem erro |
| Typecheck + testes de todos os workspaces | `pnpm turbo run typecheck test` | 26 tarefas, 26 ok (11 do cache) |
| `@repo/kanban-contract` | idem | 170 testes, 16 arquivos |
| `api` | idem | 1102 testes, 91 arquivos |
| `app` | idem | 670 testes, 84 arquivos |
| Emulador (JDK 21) | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator` | 133 testes, 8 arquivos (rodado de novo depois do último ajuste em `run.repository.ts`) |
| Cobertura do `apiErrors` | parte do `api test` (`apiErrorCodesTranslated.test.ts`) | 2/2 |

Testes novos: `pullRequest.test.ts` (contrato), `pullRequestOpen.test.ts`, `pullRequestWebhook.test.ts`,
`orchestratorPullRequest.test.ts`, `githubWebhookScript.test.ts` (API), `cardPullRequest.test.tsx` (app).
Estendidos: `boardConfig`, `boardConfigDiff`, `boardConfigYaml`, `cardState` (contrato); `githubRestClient`,
`githubFakeClient`, `githubErrorResponse`, `githubWebhookRoute`, `orchestratorDecide`, `orchestratorTick`,
`cardRunsRoutes` (rota `pull-request`), `cardMapper`, `agentToolsRoutes`, `orchestratorRuns.emulator` (API);
`useBoardCardCrud` (app).

`apps/e2e` não depende do quadro (os specs são de login, conta e a11y), então a etapa `pr` no `sample-app`
não afeta a suíte E2E. Medido com `grep` por "Testando", "Concluído" e lanes em `apps/e2e/tests`: nenhuma
ocorrência.

Sem smoke: não subi app nem API nesta rodada (disco com 3,1 GB livres). Nada do comportamento de tela foi
visto rodando.

## A verificar no `/test`

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, com `GITHUB_WEBHOOK_SECRET` gerado só no shell
(roteiro em `docs/SETUP.md`, "Eventos da PR no emulador").

1. Card do `sample-app` sai de Testando com sucesso: entra em Aguardando PR, bloco com `#n título`, selo
   Rascunho, `feat/<slug> → main · 3 commits`, listas vazias, evento "PR #n aberta como rascunho." na linha
   do tempo; `/observe` termina e o card fica com "Aguardando o merge". Só o unitário e o emulador mediram
   o caminho de dados; a tela não foi vista.
2. `github-webhook ... comment` cria run com comando `/mediate`; quatro comentários na mesma hora: o quarto
   grava "Limite de 3 /mediate por hora atingido" uma vez e não cria run.
3. Comentário durante o `/observe`: aviso "Comentário novo esperando o /mediate"; ao fim do `/observe`, o
   `/mediate` começa sozinho.
4. `checks-failure` → "Checks falhando" no bloco e ponto vermelho com texto `sr-only` no card do quadro;
   `review-changes --login qa-pr-flow` → "Pediu mudanças".
5. `merged` → card em Concluído; `closed` em outro card → fim de Tarefas com "PR #n fechada sem merge" no
   quadro.
6. Modo degradado: card com branch `feat/qa-pr-permission` mostra o `Alert` com o texto de
   `GITHUB_APP_PERMISSION_MISSING` e "Tentar de novo" (o erro volta, sem 500); `viewer` não vê o botão;
   `feat/qa-pr-rejected` mostra o texto de `GITHUB_PULL_REQUEST_REJECTED`. Para ter um card com essas
   branches, o card precisa do `branch` gravado assim (o slug gera `feat/<slug>`, então o slug
   `qa-pr-permission` serve).
7. API sem `GITHUB_WEBHOOK_SECRET`: `POST /github/webhook` → `503 GITHUB_APP_NOT_CONFIGURED` (regressão;
   o unitário cobre).
8. Light, dark e mobile do bloco com PR aberta, com erro e fechada. O ponto de checks usa `bg-success`,
   `bg-destructive` e `bg-muted-foreground`; contraste não medido.
9. Tela Configuração: recarregar um `board.yml` com `pullRequest` em duas etapas ou fora do fim mostra as
   mensagens novas de `issues`.

Não observável sem infra externa (🔒): PR real no GitHub com autor `<app>[bot]`, 403 real sem
`Pull requests: write`, entrega real dos eventos (incluindo `check_suite` do GitHub Actions) e o 422 real de
rascunho em repositório privado Free. Itens em `docs/PRE-PRODUCTION.md`, seção 5.

## Lacunas de teste conhecidas

- `BoardCardItem` com a linha da PR não tem teste de componente.
- `buildPullRequestBody` com `NEXT_PUBLIC_APP_URL` preenchido (o link do card) não tem caso; só o corpo com
  `cardUrl` passado direto.
- `triggerStage` chamando `ensurePullRequest` ao arrastar direto para a etapa de PR não tem caso unitário
  próprio; o caminho por `completeRun` tem (`orchestratorPullRequest.test.ts`).
- O script `github-webhook.mjs` só foi testado na recusa fora do emulador e no formato dos payloads; o
  `POST` real à API não foi rodado.

## Pendências de infra

`docs/PRE-PRODUCTION.md`, item 5, ganhou três itens abertos: conferir `Pull requests: Read and write` (o
item marcado como feito antes não tinha sido medido por código nenhum), assinar os quatro eventos, e a
conferência de ponta a ponta num repositório de teste. O parágrafo "Por quê" deixou de citar
`pull_request_review_comment`.
