# Handoff do develop: cycle-runs (fatia 1)

Rodada autônoma do `/cycle`, 2026-11-27. Nada foi commitado nem preparado no índice; a branch continua
`guilhermebittelbrunn/chore-overnight-cycle-specs`.

## Blueprint → arquivos

| Item do plano | Arquivos |
|---|---|
| 10.1 Contrato | `packages/kanban-contract/src/cycle.ts` (novo), `cardState.ts` (`cycle?` em `TransitionInput`), `agentContract.ts` (`DECISION_RULES`, `stageDecisionSchema`, `decisions` em `complete_stage`), `run.ts` (gatilho `cycle`, `cycleId` em `StageDispatch` e `ActiveRunView`, `decisions` em `ExecutorReport`), `runner.ts` (`RunnerJob.cycleId`), `agentResults.ts` (`AgentCardView.card.cycleId`), `index.ts`. Testes: `__tests__/cycle.test.ts` (novo), casos novos em `cardState.test.ts` e `agentContract.test.ts` |
| 10.2 SDK | `packages/sdk/src/types/board/cycle.ts` (novo), `card.ts`, `run.ts`, `cardEvent.ts`, `index.ts`; `actions/boardCycle/action.ts` (novo), registrada em `client/index.ts` |
| 4.1/10.3 Rotas | `apps/api/app/(routes)/boards/[id]/cycles/route.ts`, `[cycleId]/route.ts`, `[cycleId]/stop/route.ts`; `(shared)/validation/cycle.schema.ts`; `(shared)/lib/cycle-detail.ts` (monta o `CycleDetailDTO`) |
| 10.4 Persistência | `(shared)/mappers/cycle.mapper.ts`, `(shared)/repositories/cycle.repository.ts` (novos); `cycleId` em `card.mapper.ts`, `run.mapper.ts`, `card-event.mapper.ts` (com `decisions` no `report`); `card-event.repository.ts` (`listByCycle`); `card.repository.ts` (`detachCycle`) |
| 4.3 Orquestrador do ciclo | `(shared)/lib/orchestrator/cycle.ts` (novo: `createCycle`, avanço, `onCycleItemSettled`, `stopCycle`, `reconcileCycle`) |
| 4.4 Peças existentes | `decide.ts` (`planTrigger` com `cycleId`, `newRunFor` com `cycleId`, `planCompletion` com `cycle` e `cycleItem`), `run.repository.ts` (`finishOnCard` lê o ciclo na transação, `stopOnCard` desliga o card do ciclo), `orchestrator.ts` (`completeRun` e `stopRun` avisam o ciclo; `triggerStage` repassa `cycleId`; `recordReport` grava `decisions` e `cycleId`), `executor.ts`, `fake-executor.ts`, `runner-job.ts`, `agent-card-view.ts`, `agent-tools.ts` (recusa `ask`), `card-events.ts`, `runner/runs/[runId]/finish/route.ts` (tick no `deadline` de ciclo) |
| Runner | `apps/runner/src/session.ts` (`--cycle <id>` no prompt); teste em `__tests__/session.test.ts` |
| 5.x App | Rotas `boards/(pages)/[id]/cycles/` (`page.tsx`, `BoardCyclesClient.tsx`, `loading.tsx`), `cycles/new/` (`page.tsx`, `NewCycleClient.tsx`, `loading.tsx`), `cycles/[cycleId]/` (`page.tsx`, `CycleDetailClient.tsx`, `loading.tsx`). Componentes: `CycleSpecPicker`, `CycleSummary`, `StopCycleDialog`, `CycleProgressTable`, `CycleDecisions`, `CycleActivity`, `CycleStatusBadge`, `cycleProgress.ts`, `cycleCounters.ts`, `cycleCandidates.ts`, `cycleRefetch.ts`. Hooks: `useListBoardCycles`, `useFindBoardCycleById`, `useBoardCycleCrud`. Validação: `(validations)/newCycleSchema.ts`. Seção `cycles` em `BoardSectionNav` e nas quatro páginas que a usam; selo em `BoardCardItem.tsx`; `queryKeys.ts`, `paths.ts`, `panelTitles.ts` |
| 6 i18n | `translations/apps/app/pages/common/boards.ts` (`nav.cycles`, `board.card.cycleBadge`, bloco `cycles`), `routes/index.ts` (`cycles`, `newCycle`, `cycle`), `translations/packages/shared/utils.ts` (seis códigos novos) |
| 10.6 Kit | `kit/.claude/rules/board-mode.md` e `.claude/rules/board-mode.md` (§2.1, idênticas entre si); linha `--cycle` no bloco do modo board de `kit/commands/*.md` e de `.claude/commands/*.md` |
| Docs | `docs/board/ARCHITECTURE.md` (coleção `cycle`, `runningCycleId`, `cycleId` em card, run e evento), `docs/board/CONTRACT.md` (`decisions`, `AGENT_ASK_IN_CYCLE`, `card.cycleId`, `--cycle`, tick no `deadline`), `docs/PRE-PRODUCTION.md` (uma linha no item do agendador) |

## Contrato e raio de impacto

- `CardDTO.cycleId`, `RunDTO.cycleId` e `decisions` no `CardEventDTO` de tipo `report` são adições. Quem monta essas
  estruturas à mão quebra no `typecheck`; os fixtures de teste da API e do app foram atualizados.
- `cycleId` fica gravado no evento, mas não entra no `CardEventDTO`: só a consulta `listByCycle` usa.
- `planCompletion` devolve `cycleItem` sempre (`null` fora de ciclo). `FinishResult` ganhou `cycle` e o `StopResult`
  do repositório ganhou `cycleId`; os mocks dos testes do orquestrador passaram a devolver esses campos.
- `orchestrator.ts` importa `./cycle`, que importa `./orchestrator` (import circular só de funções, usado em tempo de
  chamada). Os testes que importam o orquestrador com repositórios mockados agora mockam também `./cycle`, e o de
  rotas do runner mocka `tick-safely`.
- `BoardSection` ganhou `cycles`; o tipo exige o link em toda página que usa a navegação.

## Códigos de erro novos

`CYCLE_NOT_FOUND`, `CYCLE_SPECS_INVALID`, `CYCLE_SPEC_BUSY`, `CYCLE_RUNNERS_UNAVAILABLE`, `CYCLE_NOT_ACTIVE` e
`AGENT_ASK_IN_CYCLE`, todos com copy em `apiErrors` (`apiErrorCodesTranslated` passa).

## Desvios do plano

1. **Ciclo parado com etapa em andamento.** O plano dizia que o card fica `idle` na etapa em que terminou. Isso vale
   para `success`. Para `needs_rework` (que enfileiraria outra etapa) o card fica `waiting_input` na mesma etapa,
   porque `idle` com resultado de retrabalho não oferece nenhum botão. O item vira `stopped` nos dois casos.
2. **`ask` recusado pelo `cycleId` do `run`, não do card.** `get_card` também lê `run.cycleId`. O card pode ter
   saído do ciclo por ação de pessoa enquanto o `run` antigo ainda fecha; o que vale é o disparo que criou o `run`.
3. **Executor de teste dentro de ciclo.** Além das decisões de exemplo (uma técnica em toda etapa, mais uma de
   produto quando o comando é `/analyze`), um `needs_input` de ciclo sai sem pergunta, como a API faria com um agente
   real que tentasse `ask`.
4. **`stopCycle` fecha os itens na mesma transação que para o ciclo.** Itens `running` viram `stopped` e `pending`
   viram `skipped` antes de parar as execuções; o `stopRun` que vem depois encontra o item fechado e não avança
   nada. Cards ligados ao ciclo sem execução viva são desligados por `detachCycle`.
5. **Reconciliação na leitura do detalhe.** O plano previa reconciliar item `running` cujo card saiu do ciclo sem
   `run` vivo. Isso tem uma corrida: entre a transação do avanço e o `triggerStage`, o card ainda não tem `cycleId`.
   `reconcileCycle` só age se o `lastRun` do card terminou depois do início do item.
6. **Avanço com vários eventos.** Com `concurrency: 2`, os dois disparos podem ser recusados; o avanço aplica a
   lista de recusas de uma vez (`advanceAll`) em vez de uma por chamada.
7. **Card órfão** também é recusado na criação (`CYCLE_SPECS_INVALID`) e some da lista do Novo ciclo.
8. **Componentes.** `CycleReviewList` virou `CycleDecisions` com `variant="review"`. Entraram `CycleStatusBadge`,
   `cycleCandidates.ts` e `cycleRefetch.ts`. O Novo ciclo também tem `loading.tsx`.
9. **Fila de ciclos sem `status in`.** As transações leem todos os ciclos do board (`boardId ==`) e filtram em
   memória. Uma igualdade só, sem índice, e o volume é de dezenas de documentos.
10. **Atividade em texto puro.** A tela mostra só a primeira linha de cada `update`/`report`, sem os `#` de título,
    como texto. O markdown completo continua no card.
11. **`.claude/commands/*.md`.** A linha do `--cycle` entrou também nos comandos deste repositório, para o bloco do
    modo board continuar igual ao do kit (o de `mediate.md` já era diferente antes).

## Decisões em aberto

- Nenhuma bloqueia a entrega. As doze do plano (Q1 a Q12) seguem como estão.
- O selo "Ciclo" usa `variant="secondary"`; o desenho não fixa a cor.

## Validação

| Comando | Resultado |
|---|---|
| `pnpm check` | sem erros (915 arquivos) |
| `pnpm turbo run lint typecheck test` | 27 de 27 tarefas. kanban-contract 217, api 1187, app 743, runner 47, sdk 9 testes |
| `pnpm --filter api test:emulator` (JDK 21) | 9 arquivos, 137 testes, incluindo os dois casos novos de ciclo |
| `npx vitest run apiErrorCodes` (api) | 2 de 2 |

Os dois casos do emulador provam, contra o Firestore real: duas specs com `concurrency: 1` e aprovação ligada em
`analyze` passam pela análise sem parar, a segunda só entra na fila depois de a primeira terminar, as duas ficam
`idle` em `pr` com PR aberta e sem `cycleId`, o ciclo fecha `finished`/`completed` e `runningCycleId` volta a `null`;
e dois `createCycle` simultâneos deixam um `running` e um `queued`, e o segundo começa e termina depois do primeiro.

Não subi o app nem a API. Nenhuma afirmação de tela abaixo foi medida.

## A verificar no `/test`

Ambiente: `pnpm emulators`, `pnpm seed`, `pnpm dev`, board de amostra sincronizado (três specs `approved`).

- Roteiro do plano, §9, itens 1 a 8: Novo ciclo com três specs, selo nos cards, aprovação pulada, decisões e
  "Para revisar", falha com `skip` e com `stop` (`pnpm --filter api fake-executor script <boardId> <slug> failed`),
  ciclo na fila, parar no meio, `until: testing`, viewer sem botão e 403, temas e 390 px.
- A tabela de andamento tem `min-w-[36rem]` dentro de um contêiner com `overflow-x-auto`. A 390 px a página não deve
  rolar de lado; medir `document.documentElement.scrollWidth` contra `innerWidth`.
- Contraste do selo e dos badges de status em dark.
- O aviso "precisam de dois runners" aparece com `concurrency: 2` e menos de dois runners online; no emulador a API
  aceita mesmo assim, porque o executor de teste dispensa runner.
- Depois de criar, a tela navega para o ciclo. No ciclo na fila, o cabeçalho diz "Ciclo na fila desde …" e não há
  contadores nem andamento.
- Tick no `deadline`: precisa de runner real (🔒). Se o relógio do runner estiver adiantado em relação à API, o
  `finish` chega antes do prazo no banco e o tick não fecha nada; aí o ciclo espera a próxima leitura.

## Lacunas de teste conhecidas

- `reconcileCycle` não tem teste unitário. O caminho é o desvio 5.
- `stopCycle` só tem teste de rota com repositório em memória; parar contra o emulador não está coberto.
- `onFailure: stop` com outra spec rodando está coberto no contrato (`advanceCycle`) e em `planCompletion`, não no
  emulador.
- Sem teste de componente para `NewCycleClient` e `CycleDetailClient`; as funções puras e o hook têm.
