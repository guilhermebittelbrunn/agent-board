# Revisão: pr-flow

Rodada autônoma do `/cycle`. A revisão leu o diff do working tree (índice vazio no início), aplicou o
`docs/review-checklist.md`, corrigiu quatro pontos e rodou só os gates estáticos. Ninguém subiu app, API ou
browser nesta etapa.

## Branch

`guilhermebittelbrunn/chore-overnight-cycle-specs`, reutilizada. O usuário pediu para manter todo o trabalho
da noite nessa branch, então a revisão não criou nem renomeou branch. O nome não passa no regex do padrão
`<project>/<type>/<title>` (o primeiro segmento é o login, e `chore-overnight-cycle-specs` não tem o `/` entre
tipo e título). Os commits anteriores da mesma branch (`spec-authoring`, `app-cleanup`) já estão nela com esse
nome; a decisão de renomear antes da PR fica com o usuário (ver "Decisões em aberto").

## Achados

| Severidade | Onde | Problema | Ação |
|------------|------|----------|------|
| 🟡 | `apps/api/(shared)/lib/pull-request/pull-request-webhook.ts:237` | Reentrega do evento `closed` (Redeliver no GitHub ou o script rodado duas vezes) gravava "PR #n mergeada por" de novo na linha do tempo a cada entrega | Corrigido: o texto só é gravado quando a PR estava `open` antes do evento |
| 🟡 | `apps/app/.../boards/(components)/CardPullRequest.tsx:196` | O `Alert` "Não foi possível abrir a PR" continuava no card depois que alguém o movia para Tarefas ou Concluído, já sem o botão de tentar de novo, porque `pullRequestError` só é limpo quando a PR abre | Corrigido: o erro aparece só com o card na etapa de PR; fora dela, sem PR, o bloco não renderiza |
| 🟢 | `packages/internationalization/.../boards.ts` (`cardDetail.pullRequest.retried`) | Chave sem uso em nenhum componente | Removida |
| 🟢 | `packages/internationalization/.../boards.ts` (`reload.fields.pullRequest`) | "rascunho da PR" descreve mal o campo: o diff do `board.yml` também acusa quando o bloco `pullRequest` entra ou sai da etapa | Trocado para "abertura da PR" |
| 🟢 | `apps/api/scripts/githubWebhookPayload.mjs:19` | `SAMPLE_INSTALLATION_ID = 1` duplica a constante de `github-sample-repositories.ts`; se uma mudar, o webhook do script deixa de casar com o board e volta `handled: false` | Mantido: o script `.mjs` não importa TypeScript. Registrado |
| 🟢 | `apps/api/(shared)/lib/pull-request/pull-request-events.ts:14` | O evento de falha grava o `error.code` cru na linha do tempo (`` `GITHUB_APP_PERMISSION_MISSING` ``) | Mantido: o bloco da PR traduz o mesmo código por `apiErrors` logo acima. Ver decisão 5 abaixo |
| 🟢 | `apps/api/(shared)/lib/github/github-rest-client.ts` (`findOpenPullRequest`) | A adoção procura PR aberta pela `head` sem filtrar pela `base`; uma PR da mesma branch para outra base seria adotada | Mantido: caso raro, e o board mostra `head → base` no bloco. Registrado |
| 🟢 | `apps/api/(shared)/lib/orchestrator/orchestrator.ts` (`onPullRequestComment`) | O `/mediate` roda como `pullRequest.dispatchAs` sem reconferir o papel efetivo dessa pessoa no board | Mantido: é o mesmo comportamento das transições automáticas, que já disparam a etapa seguinte como `run.triggeredBy`. Registrado |

Nenhum 🔴.

## Segurança: o que foi conferido lendo o código

- HMAC antes do parse: `app/(routes)/github/webhook/route.ts` confere `x-hub-signature-256` sobre o corpo cru
  antes de `parseJson`. Os eventos de PR só chegam a `handlePullRequestWebhook` depois disso e depois de
  `applyWebhookEvent` recusar o evento.
- Roteamento: o board vem de `boardIdForRepository(repository.full_name)` e só é usado se
  `board.repository.installationId` for igual ao `installation.id` do payload; sem `installation`, o evento é
  ignorado (`pull-request-webhook.ts:285`). O card é procurado pelo número da PR entre os cards desse board, e o
  updater ainda confere o número dentro da transação. Um payload assinado de outra instalação não alcança board
  alheio.
- Regra 16: o corpo do comentário e da review não é lido nem gravado. O evento `comment` guarda só o login, e o
  run leva o `onPrComment` do `board.yml` (validado por `SLASH_COMMAND` no contrato) como comando.
- Limite por hora: conta runs iniciados (`commentRunsAt`), não entregas. Reentrega não cria run além do limite.
  Dois comentários simultâneos esbarram em "uma execução viva por card": o segundo recebe `CARD_RUN_ACTIVE` e
  fica como comentário esperando.
- `POST .../pull-request`: `requireBoardApi("trigger")`, card buscado por `findBySlug(ctx.board.id, …)` (404 se
  for de outro board), e `ensurePullRequest` confere de novo `card.boardId`.
- Segredos: o `CardDTO` omite `dispatchAs`, `commentRunsAt` e `unhandledCommentAt`; o token de instalação fica no
  cliente REST. O link da PR vem do `html_url` devolvido pela API do GitHub, não do webhook.
- Regra 14: `settlePullRequest` move o card por `cardRepository.move`, a mesma porta transacional da rota de
  mover, que recusa com run vivo. Quem decide o destino é `resolvePullRequestClosure`, do contrato. O merge não é
  resultado de etapa, então não passa por `resolveTransition`; nenhum agente move o card. Aceito.

## Decisão 5 do plano: textos da linha do tempo em pt-br gravados pela API

Os eventos da linha do tempo são markdown livre (`type: "update"`); o app renderiza o markdown e não tem
variante tipada traduzida para eventos do sistema. A API já grava texto pt-br assim em dois lugares:
`runner-finish.ts` (`finishMarkdown`, "Runner `x`: `/develop` terminou em …") e `fake-executor.ts`
(`dispatchNote`). Os textos da PR seguem esse precedente.

Fazer do jeito tipado pediria uma variante nova em `CardEventDTO` (SDK), o autor "board" no contrato, a
renderização em `CardEventItem` e as chaves no dicionário. Não é barato, e o repo tem um idioma só. A revisão
manteve a decisão. Se um segundo idioma voltar, os três pontos (runner, executor de teste e PR) migram juntos
para eventos tipados.

## Correções aplicadas

- `apps/api/(shared)/lib/pull-request/pull-request-webhook.ts`: `applyToCard` guarda se a PR estava aberta
  dentro do updater e só grava "mergeada"/"fechada sem merge" nesse caso. `settlePullRequest` continua sendo
  chamado em toda entrega (é idempotente).
- `apps/app/.../boards/(components)/CardPullRequest.tsx`: `showError` exige o card na etapa de PR; o `return
  null` antecipado passou para depois desse cálculo (`pullRequest === null && !showError`).
- `packages/internationalization/translations/apps/app/pages/common/boards.ts`: removida `retried`;
  `fields.pullRequest` virou "abertura da PR".

## Raio de impacto

- `CardDTO` ganhou `pullRequest` e `pullRequestError`. Consumidores: o app inteiro do board; as fixtures à mão
  já foram atualizadas pelo develop (`runCardFixtures`, `groupCardsByColumn`, `boardColumnsMove`,
  `useCardEventCrud`, `useBoardCardCrud`, `orchestratorDecide`). Typecheck de `api` e `app` passa.
- `GithubClient` ganhou dois métodos: implementados no REST e no falso; clientes montados à mão em
  `boardAccess.test.ts` atualizados.
- `resolveTransition`: `success` numa etapa com `pullRequest` fica na etapa. Board sem `pullRequest` no
  `board.yml` não muda.
- `AgentCardView.pullRequest`: campo novo no `get_card`, documentado em `docs/board/CONTRACT.md`.
- `FinishResult` e `CardMovePatch.movedByUserId: null`: só a API consome.

## Verificar no `/test`

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev` com `GITHUB_WEBHOOK_SECRET` exportado só no shell
(`docs/SETUP.md`, "Eventos da PR no emulador"). Eventos com
`pnpm --filter api github-webhook <boardId> <slug> <evento> [--login x]`.

1. Maior risco, sustenta o corte: card do `sample-app` sai de Testando com sucesso, entra em Aguardando PR com o
   bloco (`#n título`, Rascunho, `feat/<slug> → main · 3 commits`) e o evento "PR #n aberta como rascunho.";
   ao fim do `/observe`, o card fica na coluna com "Aguardando o merge" e não vai para Concluído. Só unitário e
   emulador mediram o caminho de dados.
2. `merged` → card em Concluído. Rodar `merged` **duas vezes**: a linha do tempo mostra "mergeada" uma vez só
   (correção desta revisão).
3. `closed` em outro card → fim de Tarefas com "PR #n fechada sem merge" no card do quadro.
4. `comment` cria run com comando `/mediate`; quatro `comment` na mesma hora: o quarto grava "Limite de 3
   /mediate por hora atingido" uma vez e não cria run.
5. `comment` durante o `/observe`: aviso "Comentário novo esperando o /mediate"; ao fim do `/observe`, o
   `/mediate` começa sozinho.
6. `comment` quando quem levou o card à etapa não tem executor disponível: o caminho do webhook não chama
   `resolveExecutorFor` como a rota de runs. Conferir que o card mostra o motivo (run falho ou sem runner) e não
   fica preso em `queued`.
7. `checks-failure` → "Checks falhando" no bloco e ponto vermelho com o texto `sr-only` no quadro;
   `review-changes --login qa-pr-flow` → "Pediu mudanças".
8. Modo degradado: slug `qa-pr-permission` mostra o `Alert` com o texto de `GITHUB_APP_PERMISSION_MISSING` e
   "Tentar de novo" (erro volta, sem 500); `viewer` não vê o botão; `qa-pr-rejected` mostra o texto de
   `GITHUB_PULL_REQUEST_REJECTED`. Depois, mover esse card para Tarefas: o `Alert` some (correção desta
   revisão).
9. API sem `GITHUB_WEBHOOK_SECRET`: `POST /github/webhook` → `503 GITHUB_APP_NOT_CONFIGURED`.
10. Light, dark e mobile do bloco aberto, com erro e fechado; contraste do ponto de checks (`bg-success`,
    `bg-destructive`, `bg-muted-foreground`) não foi medido.
11. Configuração: recarregar `board.yml` com `pullRequest` em duas etapas ou fora da última mostra as mensagens
    novas; o diff de recarga mostra "abertura da PR".

🔒 Sem infra externa: PR real com autor `<app>[bot]`, 403 real sem `Pull requests: write`, entrega real dos
eventos (incluindo `check_suite` do Actions) e o 422 de rascunho em repositório privado Free.
`docs/PRE-PRODUCTION.md`, item 5.

## Lacunas de teste

- `BoardCardItem` com a linha da PR sem teste de componente: continua aberta.
- `buildPullRequestBody` com `NEXT_PUBLIC_APP_URL` preenchido: continua aberta.
- `triggerStage` chamando `ensurePullRequest` ao arrastar direto para a etapa de PR: continua aberta.
- `github-webhook.mjs` com o `POST` real à API: continua aberta (vira o item 2 a 8 do roteiro acima).
- Nova: `closed` reentregue com a PR já fechada não grava evento (`pullRequestWebhook.test.ts`).
- Nova: `CardPullRequest` com `pullRequestError` e card fora da etapa de PR não renderiza
  (`cardPullRequest.test.tsx`).

## Decisões em aberto

- Nome da branch fora do padrão. Recomendação: antes de abrir a PR da noite, criar uma branch com nome válido a
  partir desta (por exemplo `feat/overnight-cycle`, já que a branch cruza apps e pacotes) e abrir a PR por ela.
  Nesta rodada nada foi renomeado, a pedido do usuário.
- Decisão 5 (textos pt-br gravados pela API): mantida, com o porquê acima.
- Spec `specs/features/pr-flow.md`: a revisão não reconferiu o corte de MVP item a item; os desvios estão no
  handoff (11 itens) e nenhum tira algo do corte. Fechar a spec é do `/spec --sync`.

## Gates

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 848 arquivos, sem erro (depois de um ajuste de formatação em `CardPullRequest.tsx`) |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=app --filter=@repo/kanban-contract --filter=@repo/sdk --filter=@repo/internationalization` | 5/5 ok |
| Cobertura do `apiErrors` | `pnpm --filter api test apiErrorCodes` | 2/2 |

A suíte Vitest não foi rodada aqui. As correções tocam `pull-request-webhook.ts` e `CardPullRequest.tsx`, então
`pullRequestWebhook.test.ts` e `cardPullRequest.test.tsx` precisam ser rodados de novo no `/test`; os números do
handoff (api 1102, app 670) não valem mais para esses dois arquivos.

## Rodada 2: correções do `/test`

O `/test` (rodada 1, `test/report.md`) voltou bloqueado por um 🔴 que a rodada 1 desta revisão não viu.

### 🔴 PR fechada antiga devolvia o card a Tarefas (ou Concluído) no fim de qualquer run

`completeRun` chama `settlePullRequest` em todo fim de run, e `resolvePullRequestClosure` só conferia a raia, o
run vivo e o estado da PR. Um card cuja PR tinha sido fechada antes voltava ao fim de Tarefas quando qualquer
etapa terminava sem próximo run (`failed`, `needs_input`), e o resultado sumia do quadro. Com PR mergeada, o card
tirado de Concluído voltava para lá.

A correção ataca os dois caminhos que o QA descreveu:

- `packages/kanban-contract/src/pullRequest.ts`: `resolvePullRequestClosure` recebe a chave da etapa de PR e só
  move o card que está nela. Fora da etapa de PR, uma PR fechada ou mergeada é histórico e não move nada.
  `settlePullRequest` (`orchestrator.ts`) passa `findPullRequestStage(board.config)?.key`.
- `apps/api/(shared)/lib/pull-request/pull-request-open.ts`: quando o card volta à etapa de PR e a nova abertura
  falha, `recordFailure` grava `pullRequest: null` junto com o erro. Sem isso, a variante do relatório
  (`feat/qa-pr-rejected` com a PR antiga fechada) ainda levava o card de volta a Tarefas ao fim do `/observe`,
  porque o card estava na etapa de PR com a PR antiga `closed`. A abertura bem-sucedida já sobrescrevia a PR.

O histórico continua coerente: em Tarefas, o card mostra "PR #n fechada sem merge" até voltar à etapa de PR; o
evento "fechada sem merge" fica na linha do tempo.

Testes: `orchestratorPullRequest.test.ts` (`completeRun` com o card em `develop`, `next: null`, PR `closed` com
`failed` e PR `merged` com `needs_input`: o card fica em `develop`, `failed`), `pullRequest.test.ts` (card em
outra etapa e board sem etapa de PR) e `pullRequestOpen.test.ts` (falha ao reabrir apaga a PR fechada antiga).
Medição: com as duas linhas da correção revertidas, os três testes novos da API falham (3 de 28); com a correção,
passam. As linhas foram restauradas depois.

Limite aceito: uma PR mergeada enquanto o card está num retrabalho (fora da etapa de PR) não move mais o card na
hora; ele segue o pipeline e, ao voltar à etapa de PR, `ensurePullRequest` tenta abrir uma PR nova. Caso raro,
registrado para o próximo `/test`.

### 🟡 e 🟢 do relatório

| Sev | Onde | Ação |
|-----|------|------|
| 🟡 | `BoardCardItem.tsx` (`PullRequestLine`) | `relative` no `span` externo; o `sr-only` absoluto passa a ficar contido e não estica o contêiner `md:overflow-x-auto` |
| 🟢 | `CardPullRequest.tsx` | Nota "O merge é sempre seu…" só com a PR aberta (teste com PR mergeada confere que some) |
| 🟢 | `CardPullRequest.tsx` | `break-all` virou `break-words` na linha de meta |
| 🟢 | ponto verde no dark (2,82:1) | Não corrigido: o tema tem um único `--success`, igual nos dois temas, e as telas do board só usam tokens. Fica registrado |
| 🟢 | "Checks falhando" na mesma cor de "Passou"; autor do `/mediate` na linha do tempo | Só registrados |

Também entrou um teste de componente para a correção da rodada 1 (`CardPullRequest` com erro e card em Tarefas
não renderiza), que fecha uma das lacunas novas.

### Verificar no `/test` (rodada 2)

1. O repro do 🔴: card com PR fechada em Tarefas, `fake-executor script … failed`, disparar Executando. O card
   termina em Executando com "Falhou".
2. A variante: o mesmo card levado a Aguardando PR com `feat/qa-pr-rejected`. O `/observe` termina, o card fica
   na coluna com o `Alert` e "Tentar de novo", e o bloco não mostra mais a PR antiga.
3. `scrollWidth` igual a `clientWidth` em 1280 × 900 com um card em Aguardando PR.

### Gates da rodada 2

| Gate | Resultado |
|------|-----------|
| `pnpm check` | 848 arquivos, sem erro |
| typecheck `api`, `app`, `@repo/kanban-contract` | 3/3 |
| Vitest `@repo/kanban-contract` | 171 testes, 16 arquivos |
| Vitest `api` | 1109 testes, 91 arquivos |
| Vitest `app` | 675 testes, 84 arquivos |
| `api` `test:emulator` (JDK 21) | 133 testes, 8 arquivos |

Os testes que o QA alterou (`pullRequestWebhook.test.ts`, `pullRequestOpen.test.ts`,
`orchestratorPullRequest.test.ts`, `cardPullRequest.test.tsx`) já estavam nas listas, nos commits da
funcionalidade que cobrem; `test/report.md` e `test/criterios-aceite.md` entram no `docs(features): pr-flow`. O
script de conferência deu 80 caminhos, cada um em exatamente um commit.

## Plano de commits

Listas de arquivos em
`/private/tmp/claude-501/-Users-guilhermebittelbrunn-orca-workspaces-agent-board-tope/98b5cbd7-a9c7-4c0f-9e80-2174eee04731/scratchpad/commits-pr-flow/commit-NN.txt`.
Um script conferiu que os 80 caminhos do `git status` caem em exatamente um commit.

| # | Mensagem |
|---|----------|
| 01 | `feat(kanban-contract): mark the pull request stage in board.yml` |
| 02 | `feat(kanban-contract): add pull request rules and hold the card on the pull request stage` |
| 03 | `feat(sdk): add the card pull request and the open pull request action` |
| 04 | `feat(api): open and find pull requests with the GitHub App` |
| 05 | `feat(api): store the pull request on the card` |
| 06 | `feat(api): open the pull request on entry and settle the card on merge or close` |
| 07 | `feat(api): apply pull request webhooks to the card` |
| 08 | `chore(api): add a script that sends pull request webhooks in the emulator` |
| 09 | `feat(app): add the open pull request mutation` |
| 10 | `feat(app): show the pull request on the card page and on the board` |
| 11 | `feat(internationalization): add pull request copy and error codes` |
| 12 | `feat(claude): open pull requests from the pr stage in the kit and this board` |
| 13 | `docs: describe the pull request stage, its webhooks and the GitHub App permission` |
| 14 | `docs(features): pr-flow` |

Commits realizados: _preenchido pelo orquestrador._
