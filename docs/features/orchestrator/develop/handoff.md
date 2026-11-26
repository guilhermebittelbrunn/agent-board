# Handoff do /develop: orchestrator

Implementação do plano `analyze/plan.md`, feita no `/cycle` noturno sem perguntas. Nada foi commitado. A branch
continua `guilhermebittelbrunn/chore-cycle-three-tasks`, com as tarefas 1 a 7 também no working tree sem commit. O
plano foi escrito enquanto a `card-timeline` era implementada; onde o código real dela tem outro nome ou outra forma,
segui o código e listei abaixo.

## Correções ao plano (ler primeiro)

1. **`needs_input` com `pendingAsk` vazio não reenfileira mais a etapa.** O plano (4.3) mandava redisparar a mesma
   etapa com `trigger: "answer"` quando o `complete_stage(needs_input)` chega e o card já não tem pergunta pendente,
   supondo que alguém respondeu enquanto o agente rodava. Só que o mesmo estado aparece quando o agente encerra com
   `needs_input` sem ter chamado `ask`. Nesse caso o redisparo volta a terminar em `needs_input`, e o card entra num
   laço que gasta turnos sem fim. Agora `planCompletion` aplica `resolveTransition` como em qualquer outro resultado: o
   card fica `waiting_input` sem pergunta, e `cardRunActions` oferece "Rodar de novo". O caso "respondeu enquanto
   rodava" custa um clique em vez de um laço. `resumeAfterAnswer` continua redisparando quando a resposta chega com o
   card já parado em `waiting_input`, que é o fluxo normal.
2. **A rota `move` não passa por `orchestrator.moveOutOfStages`.** A escrita ficou em `cardRepository.move`, agora
   uma transação que relê `activeRunId` e recusa com `CARD_RUN_ACTIVE`; a rota recusa antes também, pelo
   `decideCardMove`. Motivo: mover para Tarefas ou Concluído é ação de pessoa, não resultado de etapa, e nunca chama
   `resolveTransition`. Pôr o wrapper no módulo do orquestrador faria todo teste de rota de card importar o repositório
   de `run` e o Firestore. A regra 14 continua valendo: `resolveTransition` só é chamado em `planCompletion`, que só
   `completeRun` usa.

## Blueprint → arquivos

### Contrato (`packages/kanban-contract`)

| Item | Arquivos |
|------|----------|
| Estados, motivos e tipos de disparo do `run`, `StageDispatch`, `StageExecutor`, `ExecutorReport`, `ActiveRunView`, `CardLastRun`, `cardRunActions`, `isAwaitingApproval` | `src/run.ts` (novo), `src/index.ts` |
| `limits.stageTimeoutMinutes` (5 a 240, padrão 45) e as constantes exportadas | `src/boardConfig.ts` |
| Testes | `__tests__/run.test.ts` (novo), `__tests__/boardConfig.test.ts` |

### SDK (`packages/sdk`)

| Item | Arquivos |
|------|----------|
| `RunDTO`, `CardLastRunDTO`, `TriggerStageRequest`, `TriggerStageResultDTO`, `BoardStageSettingDTO`, `BoardStageSettingsDTO`, `UpdateBoardStageSettingsRequest` | `src/types/board/run.ts` (novo), `src/types/board/index.ts` |
| `CardDTO.activeRunId` e `lastRun`; `MoveCardRequest` sem a variante `stage` | `src/types/board/card.ts` |
| `BoardDTO.stageSettings` | `src/types/board/board.ts` |
| `BoardViewDTO.executor` | `src/types/board/member.ts` |
| `boardCard.trigger`, `boardCard.stop` | `src/actions/boardCard/action.ts` |
| `board.updateStageSettings` | `src/actions/board/action.ts` |

### API (`apps/api`)

| Item | Arquivos |
|------|----------|
| Funções puras: `decideTrigger`, `planTrigger`, `newRunFor`, `planCompletion` (única chamada a `resolveTransition`), `lastRunOf`, `pickPromotions`, `findExpired`, `deadlineFor`, `toStageDispatch` | `(shared)/lib/orchestrator/decide.ts` (novo) |
| `triggerStage`, `completeRun`, `stopRun`, `resumeAfterAnswer`, `tick`, `pumpBoard` (interno) | `(shared)/lib/orchestrator/orchestrator.ts` (novo) |
| `tickSafely` (o `GET` nunca falha por causa do `tick`) | `(shared)/lib/orchestrator/tick-safely.ts` (novo) |
| `resolveStageExecutorMode` (`isEmulated() ? "fake" : null`) | `(shared)/lib/orchestrator/executor-mode.ts` (novo) |
| `getStageExecutor` (liga o falso ao Firestore e à linha do tempo) | `(shared)/lib/orchestrator/executor.ts` (novo) |
| Executor falso puro: `createFakeExecutor`, `claimOutcome`, `fakeReport`, `toFakeScript` | `(shared)/lib/orchestrator/fake-executor.ts` (novo) |
| `toBoardView` (acrescenta `executor`) | `(shared)/lib/board-view.ts` (novo) |
| Coleção `run`: mapper, `newRunDocument`, `toRunDTO` | `(shared)/mappers/run.mapper.ts` (novo) |
| Transações: `enqueueOnCard`, `finishOnCard`, `stopOnCard`, `promote`; `listActiveByBoard` | `(shared)/repositories/run.repository.ts` (novo) |
| `activeRunId`, `lastRun` no card | `(shared)/mappers/card.mapper.ts` |
| `stageSettings` no board (`toStageSettings` filtra etapas que saíram do `board.yml` e o gate fora de `approval: optional`) | `(shared)/mappers/board.mapper.ts` |
| `runId` nos eventos de agente | `(shared)/mappers/card-event.mapper.ts` |
| `move` em transação, só Tarefas e Concluído, `state: "idle"` | `(shared)/repositories/card.repository.ts`, `(shared)/lib/card-move.ts`, `(shared)/validation/card.schema.ts` |
| `updateStageSettings` | `(shared)/repositories/board.repository.ts` |
| Validação: `parseTriggerStage`, `parseStageSettings` | `(shared)/validation/run.schema.ts` (novo) |
| `POST …/cards/[slug]/runs` (`trigger`) | `app/(routes)/boards/[id]/cards/[slug]/runs/route.ts` (novo) |
| `POST …/cards/[slug]/stop` (`trigger`) | `app/(routes)/boards/[id]/cards/[slug]/stop/route.ts` (novo) |
| `PATCH …/stage-settings` (`configure`) | `app/(routes)/boards/[id]/stage-settings/route.ts` (novo) |
| `tick` antes de ler | `app/(routes)/boards/[id]/cards/route.ts`, `app/(routes)/boards/[id]/cards/[slug]/route.ts` |
| `executor` no `BoardViewDTO` | `app/(routes)/boards/[id]/route.ts`, `app/(routes)/boards/route.ts`, `app/(routes)/boards/[id]/reload/route.ts`, `(shared)/lib/board-list.ts` |
| `move` com a recusa nova | `app/(routes)/boards/[id]/cards/[slug]/move/route.ts` |
| `resumeAfterAnswer` depois da resposta | `app/(routes)/boards/[id]/cards/[slug]/answers/route.ts` |
| Script de QA do executor falso | `scripts/fake-executor.mjs` (novo), `package.json` (`fake-executor`) |
| Escopo de log `orchestrator` | `packages/shared/utils/helpers/log.ts` |

### App (`apps/app`)

Prefixo: `app/[locale]/(authenticated)/(common)/(pages)/boards/`.

| Item | Arquivos |
|------|----------|
| Polling de 5 s só com card `queued`/`running` | `(components)/hasActiveRun.ts` (novo), `(hooks)/useListBoardCards.tsx`, `(hooks)/useFindBoardCardBySlug.tsx` |
| Motivo do `lastRun` | `(components)/cardRunReason.ts` (novo) |
| Selo, chip "Volta n de max", motivo e botões | `(components)/CardRunControls.tsx` (novo) |
| Diálogo de disparo (arrastar, rodar de novo, aprovar) | `(components)/TriggerStageDialog.tsx` (novo) |
| Confirmação de parada | `(components)/StopRunDialog.tsx` (novo) |
| Estado dos dois diálogos, usado no quadro e no detalhe | `(components)/useStageRunDialogs.tsx` (novo) |
| Limites e aprovação na aba Etapas | `(components)/BoardStageSettingsForm.tsx`, `(validations)/stageSettingsSchema.ts` (novos), `(pages)/[id]/settings/BoardSettingsClient.tsx` |
| Soltar em etapa vira pedido de disparo; sem executor, etapa não aceita card nem aparece no menu; card com `run` ativo não arrasta e fica sem menu | `(components)/groupCardsByColumn.ts` (`ColumnTarget`), `(components)/BoardColumns.tsx`, `(components)/CardMoveMenu.tsx` |
| Borda de destaque e slot dos controles | `(components)/BoardCardItem.tsx` |
| Variantes do selo | `(components)/CardStateBadge.tsx` |
| "{running} rodando · {queued} na fila" | `(components)/BoardSummaryLine.tsx` |
| Quadro: aviso sem executor, controles, diálogos | `(pages)/[id]/BoardClient.tsx` |
| Detalhe: controles no resumo, diálogos | `(pages)/[id]/cards/[slug]/CardDetailClient.tsx` |
| "Responder e retomar a {column}" e o toast "Resposta enviada. {column} roda de novo com ela." | `(components)/CardQuestions.tsx`, `(hooks)/useCardEventCrud.tsx` |
| `triggerMutation`, `stopMutation`; `move` otimista com `state: "idle"` | `(hooks)/useBoardCardCrud.tsx` |
| `updateStageSettingsMutation` | `(hooks)/useBoardCrud.tsx` |

### i18n (`packages/internationalization`)

- `translations/apps/app/pages/common/boards.ts`: `board.summaryRuns`, `board.noExecutor`, `board.card.{reworkLoop, triggered, queued, stopped, runReason, runActions}`, blocos `trigger` e `stop`, `cardDetail.questions.{submitAndResume, resumed}`, `settings.stageSettings`.
- `translations/packages/shared/utils.ts`: os quatro códigos novos.

### Docs

- `docs/board/ARCHITECTURE.md`: `runs` virou `run`, com os campos reais; `card` ganhou `activeRunId`/`lastRun`, `board` ganhou `stageSettings`/`runsPumpedAt`; `cardEvent.runId` descrito.
- `docs/board/CONTRACT.md`: o tempo limite vem de `limits.stageTimeoutMinutes` e é aplicado na leitura.
- `docs/SETUP.md`: como usar o executor de teste e o `fake-executor`.
- `docs/PRE-PRODUCTION.md`: duas pendências novas (executor em produção; prazo sem ninguém olhando, com as fontes de
  preço da Vercel e do Firebase consultadas em 2026-11-26).

## Contrato mexido e quem consome

- `MoveCardRequest` perdeu `{ lane: "stage" }`. Só o `apps/app` chamava `move` com etapa; agora a coluna de etapa
  devolve um `ColumnTarget` próprio e o `BoardClient` abre o diálogo de disparo.
- `CardDTO.activeRunId` e `lastRun` são obrigatórios no tipo; a API sempre preenche (o mapper devolve `null` quando
  faltam, sem migração). Fixtures de teste que montam `CardDTO` à mão ganharam os dois campos.
- `BoardDTO.stageSettings` e `BoardViewDTO.executor` obrigatórios. Toda rota que devolve `BoardViewDTO` passa por
  `toBoardView`.
- `CardEventWrite.runId` opcional; os eventos que a `card-timeline` grava continuam com `runId: null`.
- `LogScope` ganhou `orchestrator`.

## Códigos de erro novos

| Código | Status | Onde |
|--------|--------|------|
| `CARD_RUN_ACTIVE` | 409 | `runs`, `move` |
| `CARD_RUN_NOT_ACTIVE` | 409 | `stop` |
| `CARD_BRANCH_INVALID` | 422 | `runs` |
| `RUN_EXECUTOR_UNAVAILABLE` | 503 | `runs` |

Os quatro estão em `apiErrors`; `apiErrorCodesTranslated.test.ts` passa na suíte da API.

## Desvios em relação ao plano

Além das duas correções do topo:

1. **Nomes da `card-timeline`.** `appendAgentEvent(card, write)` recebe um `CardEventWrite`, não o retorno cru de
   `agentEventFromTool`; o `tick` desembrulha `{ ok, write }` e acrescenta `runId`. A rota de resposta não tem
   `cardEventRepository.answer(…)` devolvendo card atualizado depois do redisparo, então ela relê o card com
   `cardRepository.findById` antes de responder. `displayCardState` e `isAwaitingApproval` vivem no contrato.
2. **`run.executor` nasce `null`** e é preenchido na promoção para `running` (o plano dizia "não nulo"). A fila não
   sabe que executor vai pegar o `run`; `RunDTO.executor` é `StageExecutorKind | null`.
3. **`ActiveRunView` ganhou `slug` e `command`**, para o falso montar o relatório sem ler o card.
4. **`claims` no roteiro do falso.** `fakeExecutorScript/<cardId>` guarda, além de `outcomes`, o resultado que cada
   `run` já pegou. Dois pollings simultâneos lendo o mesmo `run` não consomem duas entradas nem gravam dois relatórios:
   só quem reivindicou primeiro reporta. `silent` também fica reivindicado, então ninguém relata depois.
5. **`cardRunActions` oferece "Rodar de novo" a card `idle` em etapa que nunca rodou** (`lastRun === null`). Cards que
   a `card-backlog` moveu para uma etapa antes desta spec ficariam sem nenhum botão e sem como rodar a própria etapa.
6. **Sair de Concluído para uma etapa também zera `reworkLoops`** (o plano dizia "vindo de Tarefas"). A regra ficou
   "vindo de fora das etapas"; um card em Concluído arrastado de volta começa um percurso novo.
7. **Chave de etapa desconhecida em `PATCH stage-settings` dá 400 `VALIDATION_FAILED`.** `approvalGate: true` numa etapa
   `none`/`required` é aceito e gravado como `false`.
8. **Card com `run` ativo fica sem o menu "⋯"**, em vez de um menu só com "Parar"; o botão "Parar" aparece no próprio
   card. Mesma ação, sem um segundo caminho.
9. **`CardRunControls` substitui o selo solto** no quadro e no detalhe (o selo, o chip de volta e "Spec removida" vêm
   dele). No detalhe, "Spec removida" continua só ao lado da coluna (`showOrphan={false}`).
10. **Aviso de WIP no detalhe do card** usa a lista do quadro em cache; aberto direto pela URL, sem a lista em cache,
    o diálogo não sabe se a coluna está cheia e não mostra o aviso. A API enfileira do mesmo jeito.
11. **`HTTP_STATUS` em vez de números** e um `logEvent` quando o despacho ou o `tick` falha (`dispatch_failed`,
    `tick_failed`, `resume_after_answer_failed`), só com ids e nome do erro.

Testes de tarefas anteriores que mudaram de arranjo por causa do contrato novo (nenhuma asserção afrouxada):

- `apps/api/__tests__/cardMove.test.ts`: os casos de mover para etapa viraram "mover para Concluído/Tarefas"; caso novo
  para `CARD_RUN_ACTIVE`.
- `apps/api/__tests__/boardCardsRoutes.test.ts`: "move para etapa" virou "corpo com `lane: stage` → 400"; o caso
  `CARD_STAGE_NOT_FOUND` do `move` saiu, porque a rota não aceita mais etapa (a recusa equivalente está em
  `orchestratorDecide.test.ts` e no 400 de validação); casos novos para card parado voltando a Tarefas e para
  `CARD_RUN_ACTIVE`; `tickSafely` mockado.
- `apps/api/__tests__/boardsRoutes.test.ts`, `boardMapper.test.ts`: `stageSettings: {}` e `executor: null` no esperado.
- `apps/api/__tests__/cardEventsRoutes.test.ts`: orquestrador mockado; três casos novos sobre o redisparo.
- `apps/app/__tests__/useBoardCardCrud.test.tsx`: "move para etapa" virou "card de etapa volta a Tarefas"; casos novos
  de `trigger` e `stop`.
- `apps/app/__tests__/boardColumnsMove.test.tsx`: prop `canTrigger`; casos novos sem executor e com `run` ativo.
- `apps/app/__tests__/cardQuestionsForm.test.tsx`: prop `resumes`; caso novo do rótulo.

## Separar os commits

Arquivos que já tinham diff de tarefas anteriores e o trecho que é desta:

| Arquivo compartilhado | Trecho desta tarefa |
|-----------------------|---------------------|
| `packages/kanban-contract/src/boardConfig.ts` | As três constantes `*_STAGE_TIMEOUT_MINUTES` e o campo `stageTimeoutMinutes` em `limits` |
| `packages/kanban-contract/src/index.ts` | `export * from "./run";` |
| `packages/kanban-contract/__tests__/boardConfig.test.ts` | Imports das constantes, a linha `stageTimeoutMinutes` no teste de padrões e o teste do intervalo |
| `packages/sdk/src/types/board/card.ts` | Import de `CardLastRunDTO`, `activeRunId`, `lastRun` e o novo `MoveCardRequest` |
| `packages/sdk/src/types/board/board.ts` | Import de `BoardStageSettingsDTO` e o campo `stageSettings` |
| `packages/sdk/src/types/board/member.ts` | Import de `StageExecutorKind` e o `BoardViewDTO` com `executor` |
| `packages/sdk/src/types/board/index.ts` | `export * from "./run";` |
| `packages/sdk/src/actions/boardCard/action.ts` | Imports `TriggerStageRequest`/`TriggerStageResultDTO`, métodos `trigger` e `stop` |
| `packages/sdk/src/actions/board/action.ts` | Import `UpdateBoardStageSettingsRequest`, método `updateStageSettings` |
| `packages/shared/utils/helpers/log.ts` | A linha `"orchestrator"` (a linha `"github"` é de outra tarefa) |
| `apps/api/(shared)/mappers/card.mapper.ts` | Imports de `CardLastRun`, `RUN_*`, `STAGE_OUTCOMES`; `activeRunId`/`lastRun` em `PERSISTED_KEYS`; `toLastRun`; as duas linhas em `toDTO` |
| `apps/api/(shared)/mappers/board.mapper.ts` | Import de `BoardStageSettingsDTO`; `"stageSettings"` no `Omit` de `BoardRecordInput`; `MIN_WIP_LIMIT` e `toStageSettings`; a linha `stageSettings` em `toDTO` |
| `apps/api/(shared)/mappers/card-event.mapper.ts` | `"runId"` no `Pick` de `CardEventWrite` e `runId: write.runId ?? null` |
| `apps/api/(shared)/repositories/card.repository.ts` | `CardMovePatch` sem `stageKey`, `CardMoveResult` e o `move` em transação |
| `apps/api/(shared)/repositories/board.repository.ts` | Import de `BoardStageSettingsDTO` e `updateStageSettings` |
| `apps/api/(shared)/lib/card-move.ts` | Arquivo inteiro reescrito (era da `card-backlog`) |
| `apps/api/(shared)/validation/card.schema.ts` | Remoção de `STAGE_KEY` e da variante `stage` |
| `apps/api/(shared)/lib/board-list.ts` | Import e uso de `toBoardView` |
| `apps/api/app/(routes)/boards/route.ts` | Import e uso de `toBoardView` |
| `apps/api/app/(routes)/boards/[id]/route.ts` | Arquivo inteiro (três linhas) |
| `apps/api/app/(routes)/boards/[id]/reload/route.ts` | Imports de `toBoardView`/`toStageSettings`, o `toBoardView` no início e `stageSettings` no `updated` |
| `apps/api/app/(routes)/boards/[id]/cards/route.ts`, `cards/[slug]/route.ts` | Import e chamada de `tickSafely` |
| `apps/api/app/(routes)/boards/[id]/cards/[slug]/move/route.ts` | `MOVE_REFUSAL_STATUS`, o JSDoc, `decideCardMove(card, target)`, sem `stageKey` no patch e o tratamento de `moved.ok` |
| `apps/api/app/(routes)/boards/[id]/cards/[slug]/answers/route.ts` | Imports de `logEvent`/`resumeAfterAnswer`, o JSDoc, o `try/catch` do redisparo e a releitura do card |
| `apps/api/package.json` | A linha `fake-executor` |
| `apps/api/__tests__/fakeCardRepository.ts` | Import de `CardMoveResult` e o `move` novo |
| `apps/api/__tests__/{cardMove,boardCardsRoutes,boardsRoutes,boardMapper,cardMapper,cardEventsRoutes}.test.ts` | Ver lista de arranjos acima; `cardMove.test.ts` foi reescrito inteiro |
| `apps/app/.../(components)/groupCardsByColumn.ts` | `ColumnTarget` e o tipo de retorno de `moveTargetOf` |
| `apps/app/.../(components)/CardMoveMenu.tsx` | `ColumnTarget` em `MoveDestination`, prop `canTrigger` e o filtro de etapa |
| `apps/app/.../(components)/BoardColumns.tsx` | Props `canTrigger`/`renderRunControls`/`runControls`, `isRunning`, os filtros de `canDropOn`/`dropOn` |
| `apps/app/.../(components)/BoardCardItem.tsx` | Prop `runControls`, `shownState`, as duas classes de borda, o selo condicionado a `!runControls` |
| `apps/app/.../(components)/CardStateBadge.tsx` | `VARIANT_OF` |
| `apps/app/.../(components)/BoardSummaryLine.tsx` | Prop `runs` e o trecho `summaryRuns` |
| `apps/app/.../(components)/CardQuestions.tsx` | Prop `resumes`, `submitLabel` no `AnswerForm` |
| `apps/app/.../(hooks)/useBoardCardCrud.tsx` | `TriggerCardInput`, `stageKey: null`/`state: "idle"` no `placeCard`, `storeCard`, `refreshEvents`, `triggerMutation`, `stopMutation` |
| `apps/app/.../(hooks)/useBoardCrud.tsx` | `successAlert`, `dictionary`, `updateStageSettingsMutation` |
| `apps/app/.../(hooks)/useCardEventCrud.tsx` | Imports `BoardViewDTO`/`fillMessage` e o toast `resumed` |
| `apps/app/.../(hooks)/useListBoardCards.tsx`, `useFindBoardCardBySlug.tsx` | `refetchInterval`/`refetchIntervalInBackground` |
| `apps/app/.../(pages)/[id]/BoardClient.tsx` | `canTriggerStages`, `CardRunControls`, `countRuns`, `useStageRunDialogs`, `boardPermissions`, o aviso sem executor, `renderRunControls`, `runs` no cabeçalho, o desvio para disparo em `moveCard` e `{dialogs}` |
| `apps/app/.../(pages)/[id]/cards/[slug]/CardDetailClient.tsx` | `canTriggerStages` no lugar de `displayCardState`, `CardRunControls` no lugar de `CardStateBadge`, `useQueryClient`/`queryKeys`, `onRunCommand` no `CardSummary`, `resumes`, `useStageRunDialogs` e `{dialogs}` |
| `apps/app/.../(pages)/[id]/settings/BoardSettingsClient.tsx` | Import e uso de `BoardStageSettingsForm`, `updateStageSettingsMutation` |
| `apps/app/__tests__/{boardColumnsMove,groupCardsByColumn,useBoardCardCrud,useCardEventCrud,cardQuestionsForm}.test.ts(x)` | `activeRunId: null`/`lastRun: null` nos fixtures e os arranjos listados acima |
| `translations/apps/app/pages/common/boards.ts` | `summaryRuns`, `noExecutor`, os blocos novos de `board.card`, `trigger`, `stop`, `submitAndResume`, `resumed`, `settings.stageSettings` |
| `translations/packages/shared/utils.ts` | De `CARD_RUN_ACTIVE` até `RUN_EXECUTOR_UNAVAILABLE` |
| `docs/board/ARCHITECTURE.md` | A frase das coleções existentes, os acréscimos nas linhas `board` e `card`, a linha `run` e o `runId` do `cardEvent` |
| `docs/board/CONTRACT.md` | As duas linhas depois do item do tempo limite |
| `docs/SETUP.md` | O bloco do executor de teste depois do `seed:timeline` |
| `docs/PRE-PRODUCTION.md` | As duas subseções em "Pendências registradas pelo pipeline" |

Ordem sugerida, seguindo o plano (10.10): contrato; SDK; `feat(shared)` com o escopo de log (ou junto do primeiro
commit da API); API em três commits (decisões puras + mapper + repositório; rotas `runs`/`stop`/`stage-settings` +
`move` + `executor` no board; executor falso + `tick` + script); API do redisparo na resposta; teste de emulador; i18n
antes do app, para cada commit do app passar no typecheck; app em três commits (diálogo e colunas; controles,
polling e detalhe; aba Etapas); docs; `docs(features): orchestrator` por último.

## Decisões em aberto e pendências

- Nenhuma pergunta nova. As adotadas no plano seguem como estão.
- Disparar com perguntas ainda pendentes (`pendingAsk` aberto) é permitido, e o `pendingAsk` não é limpo: o selo do
  card mostra "Aguardando você" enquanto a etapa nova roda, até o agente perguntar de novo ou alguém responder. A
  `card-timeline` é dona do campo; decidir se um disparo novo deve fechar as perguntas antigas fica para a revisão.
- Sem smoke local da UI: rodei só os gates e a suíte do emulador. Tudo que depende de tela está em "A verificar no
  `/test`".

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 887 arquivos, sem erro |
| Lint, typecheck e testes | `pnpm turbo run lint typecheck test` | 25 de 25 tasks |
| Testes da API | `pnpm --filter api exec vitest run` | 96 arquivos, 1150 testes |
| Testes do app | `pnpm --filter app exec vitest run` | 113 arquivos, 865 testes |
| Contrato | `pnpm --filter @repo/kanban-contract test` | 13 arquivos, 119 testes |
| Emulador | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator` | 5 arquivos, 148 testes; `orchestratorRuns.emulator.test.ts` 6 de 6. O script subiu e derrubou os próprios emuladores (portas 8080/9199 livres antes e depois, conferido com `lsof`) |
| `apiErrors` | `apiErrorCodesTranslated.test.ts`, dentro da suíte da API | passa |

Medido em `orchestratorRuns.emulator.test.ts`, contra o Firestore do emulador, com o executor falso real (transação
do roteiro e eventos na linha do tempo) e relógio injetado:

- dois `triggerStage` simultâneos no mesmo card: um passa, o outro recebe `CARD_RUN_ACTIVE`, e a coleção `run` tem um
  documento só para o card;
- três `completeRun(success)` simultâneos para o mesmo `run`: um aplica, dois voltam `ignored`, e existe um único `run`
  de `develop`;
- WIP 1 em Análise e dois disparos simultâneos: um `running`, um `queued`; parar o que roda promove o outro;
- sem roteiro: o card passa por analyze, develop, review e test e chega em Concluído `idle`, com quatro eventos
  `report`, todos com `runId`;
- roteiro `success, success, needs_rework, success, needs_rework, success, needs_rework`: analyze, develop, review,
  develop, review, develop, review; para em Revisando `waiting_input`, `reworkLoops: 2`, sete `run`s;
- roteiro `silent`: o card continua `running` depois dos 3 s; no prazo de 45 min vira `failed` com
  `lastRun.endReason: "timeout"`.

Medido em testes de rota (`cardRunsRoutes.test.ts`, guard real, orquestrador e executor mockados): `qa-reader` (viewer
efetivo) leva 403 em `runs` e `stop` sem chamar o orquestrador; sem executor, `runs` responde 503
`RUN_EXECUTOR_UNAVAILABLE`; `operator` leva 403 em `stage-settings`; `wipLimit` 0, 21 e 1,5 e etapa fora do `board.yml`
dão 400; admin personificando leva 403. `stageExecutorMode.test.ts` mostra que, sem os hosts do emulador, o modo é
`null` mesmo com `STAGE_EXECUTOR=fake` no ambiente. `fakeExecutor.test.ts` roda o `fake-executor.mjs` sem emulador e
com projeto que não é `demo-*`: sai com código 1 nos dois casos.

## A verificar no `/test`

Repro: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*` (`docs/SETUP.md`), importar `sample-app`, sincronizar
o backlog. Para outros resultados, `pnpm --filter api fake-executor script <boardId> <slug> <outcome...>` antes de
disparar. Nada abaixo foi medido nesta etapa.

- Fluxos 1 a 10 do plano (8.1), em claro e escuro e em 390 px: diálogo com `/analyze <slug>`, `opus · alto`,
  `feat/<slug>`, `200 turnos` e "Executor de teste"; o card andando sozinho a cada ~5 s de polling; "Volta 1 de 2" e
  "Volta 2 de 2"; "Aguardando você" na terceira volta; "Falhou" com "O agente não respondeu em 45 min." depois do
  `expire`; "Parado por {login}." e "Rodar de novo"; "Plano pronto · aguarda sua aprovação" com "Aprovar e seguir"
  (ligar o gate em Análise na aba Etapas como `octo`); WIP 1 com o segundo card "Na fila" e o aviso no diálogo.
- Responder a pergunta de um `needs_input`: botão "Responder e retomar a Análise", toast "Resposta enviada. Análise
  roda de novo com ela." e o card voltando a rodar.
- Polling: a aba de rede mostra `GET …/cards` a cada 5 s só enquanto há card na fila ou rodando, e para depois.
- Cancelar o diálogo de disparo deixa o card onde estava; o foco volta para algo útil depois de fechar o diálogo (o
  menu do card some depois de disparar, porque o card passa a ter `run` ativo).
- Bordas `border-destructive` (Falhou) e `border-primary` (Aguardando você) no claro e no escuro.
- Aviso "Nenhum executor disponível…" e colunas de etapa sem drop: só aparecem com a API fora do emulador, o que o
  ambiente de QA não tem; o teste de componente cobre o drop e o menu sem `canTrigger`.
- Formulário "Limites e aprovação": `operator` vê os valores desabilitados e a frase de só leitura; `octo` salva e vê o
  toast.

## Lacunas de teste conhecidas

- Sem teste de componente para `BoardStageSettingsForm`, `StopRunDialog`, `useStageRunDialogs` e para o caminho
  "soltar em etapa abre o diálogo" no `BoardClient` (o `BoardColumns` testa que a coluna entrega `{ lane: "stage" }` e
  o diálogo é testado sozinho).
- `stopRun` concorrente com `completeRun` no mesmo `run` não tem teste de emulador; as duas transações leem o `run` e o
  card, então a perdedora repete e encontra o `run` fechado.
- `resumeAfterAnswer` sem teste contra o emulador; a rota está coberta com o orquestrador mockado.
