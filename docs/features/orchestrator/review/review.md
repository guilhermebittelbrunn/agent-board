# Revisão: orquestrador de etapas (estados, fila e transições)

Revisão da tarefa 8 do `/cycle` noturno, sem perguntas. O working tree também traz as tarefas 1 a 7, já revisadas;
aqui só o diff do `orchestrator` foi lido. O plano de commits no fim cobre as oito tarefas e o plano da
`agent-contract`.

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada (o orquestrador mandou não criar nem trocar). O regex
de `.claude/rules/git-commits.md` reprova o nome: `guilhermebittelbrunn/` não é projeto e `chore-cycle-three-tasks`
não separa tipo e título. É o mesmo veredito das sete revisões anteriores. A decisão continua com o `/review`: antes
do primeiro commit, criar uma branch válida a partir desta, por exemplo `feat/board-cards-and-runs` (vários apps,
então sem projeto). Nada foi renomeado. `git diff --cached --stat` saiu vazio.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | `.../boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx` (`CardActivity`) | O detalhe consulta o card a cada 5 s enquanto a etapa roda, mas a lista de eventos não é relida. Quando o executor grava o relatório e a pergunta, o card chega com `pendingAsk` apontando para um evento que a página ainda não tem; `pendingQuestionsOf` devolve `null` e o formulário de resposta não aparece até a pessoa recarregar ou trocar de aba. A linha do tempo também fica sem o relatório. | Corrigido: `useRefetchEventsWhenCardChanges` invalida `cardEvents` quando `card.updatedAt` muda (ignora a primeira renderização). |
| 🟡 | `apps/api/(shared)/lib/orchestrator/decide.ts` (`planTrigger`), `run.repository.ts` (`finishOnCard`) | Decisão em aberto do `/develop`: um disparo novo deixava o `pendingAsk` de um `run` anterior aberto, e o selo mostrava "Aguardando você" enquanto outra etapa rodava. Responder depois não retomava nada (`resumeAfterAnswer` exige `waiting_input` sem `run` ativo). | Corrigido: todo `run` novo, por disparo ou por transição, grava `pendingAsk: null`. As perguntas antigas ficam na linha do tempo sem resposta, como já acontece quando um `ask` novo substitui o pendente. Uma resposta atrasada a elas recebe 409 `CARD_QUESTIONS_NOT_PENDING`. |
| 🟢 | `stopOnCard` em `run.repository.ts` | `stop` recebe o slug, não o `runId`. Se o `completeRun` da etapa vence a corrida e já criou o `run` da etapa seguinte, o `stop` para esse `run` novo. O card termina parado, que é o que a pessoa pediu; a etapa que acabou fica registrada. | Registrado. Coerente com a intenção do botão. |
| 🟢 | `tick` em `orchestrator.ts` | `recordReport` grava o relatório na linha do tempo antes do `completeRun`. Se um `stop` fecha o `run` entre os dois, o relatório fica na linha do tempo e o `completeRun` volta `ignored`. Só acontece com o executor de teste. | Registrado. |
| 🟢 | `cardRunReason.ts` | "O agente não respondeu em {minutes} min." usa o `stageTimeoutMinutes` atual do `board.yml`, não o do `run`. Muda só se alguém alterar o limite depois da falha. | Registrado. |
| 🟢 | `card.repository.ts` `move` | Mover para Tarefas ou Concluído não limpa `pendingAsk`; um card com pergunta aberta movido para Concluído mostra "Aguardando você" lá. | Registrado. Fora do corte; `move` é da `card-backlog`. |
| ✅ | `decide.ts`, `run.repository.ts`, `orchestrator.ts` | Regra 14: `resolveTransition` aparece só em `planCompletion`, chamado só por `completeRun` (via `finishOnCard`). `move` grava `lane` Tarefas/Concluído com `state: "idle"`, sem transição. | |
| ✅ | `finishOnCard` | Idempotência real: lê o `run` dentro da transação e ignora quando `active !== true`. Se o card já aponta para outro `activeRunId`, só fecha o `run`. | |
| ✅ | `card.repository.ts` `move` | Transação relê `activeRunId` e recusa com `CARD_RUN_ACTIVE`; a rota recusa antes pelo `decideCardMove`. | |
| ✅ | `stopOnCard` × `finishOnCard` | As duas transações leem o card e o `run`; a perdedora é refeita pelo Firestore e encontra o `run` fechado (`ignored`) ou `CARD_RUN_NOT_ACTIVE`. | |
| ✅ | `resumeAfterAnswer` × disparo manual | `resumeAfterAnswer` lê fora da transação, mas o `enqueueOnCard` relê `activeRunId` dentro dela; o segundo recebe `CARD_RUN_ACTIVE` e a rota de resposta ignora o resultado. | |
| ✅ | `cards/route.ts`, `cards/[slug]/route.ts`, `tick-safely.ts` | `tick` dentro do GET com `view`: quem só lê adianta apenas o que já venceu (prazo, relatório do executor de teste). Sem `run` ativo custa uma consulta (cobrada como 1 leitura). `promote` não grava nada quando não há o que promover. Erro no `tick` vira `logEvent` e o GET responde normal. | |
| ✅ | `executor-mode.ts`, `executor.ts`, `scripts/fake-executor.mjs` | Executor falso só com `isEmulated()`; nenhuma variável liga. O script recusa sem os dois hosts do emulador e com projeto que não é `demo-*`, antes do `initializeApp`. `runs` responde 503 `RUN_EXECUTOR_UNAVAILABLE` sem executor; não há caminho de 500. | |
| ✅ | `runs`, `stop`, `stage-settings`, `answers` | Regra 13: `requireBoardApi("trigger")` em `runs`/`stop`, `"configure"` (só owner) em `stage-settings`, `"answer"` (operator+, o mesmo nível de `trigger`) em `answers`. O `run` da transição herda `triggeredBy` do anterior. | |
| ✅ | `useListBoardCards.tsx`, `useFindBoardCardBySlug.tsx`, `hasActiveRun.ts` | Polling de 5 s só com card `queued`/`running`, sem rodar em segundo plano. | |
| ✅ | `BoardCardItem.tsx`, `CardStateBadge.tsx`, componentes novos | Só tokens de tema (`border-destructive`, `border-primary`, variantes do `Badge`); nenhum texto solto em JSX. | |
| ✅ | `boardCardsRoutes.test.ts`, `cardMove.test.ts` | Os casos de "mover para etapa" viraram recusa (400) e casos de Tarefas/Concluído; `CARD_RUN_ACTIVE` ganhou caso nos dois. Nenhuma asserção ficou mais fraca. | |
| ✅ | `docs/PRE-PRODUCTION.md` | As duas pendências trazem spec, data, fontes (Vercel e Firebase, consultadas em 2026-11-26) e como verificar. | |

## As duas correções do `/develop` ao plano

1. `needs_input` sem `pendingAsk` segue `resolveTransition` em vez de reenfileirar. Está certa: o redisparo
   automático laçava quando o agente terminava em `needs_input` sem chamar `ask`. O card não fica preso:
   `waiting_input` com `pendingAsk === null` faz `canRunAgain` devolver `true`, e `cardRunActions` oferece "Rodar de
   novo" a quem pode disparar. O mesmo vale para o card que esgotou as voltas de retrabalho.
2. `move` fora do módulo do orquestrador. Está certa: mover para Tarefas ou Concluído não chama `resolveTransition`,
   e a transação do repositório já recusa `run` ativo.

## Correções aplicadas

- `apps/api/(shared)/lib/orchestrator/decide.ts`: `planTrigger` grava `pendingAsk: null` no card; JSDoc explica que o
  `run` novo substitui as perguntas antigas.
- `apps/api/(shared)/repositories/run.repository.ts`: `finishOnCard` grava `pendingAsk: null` quando cria o `run` da
  etapa seguinte.
- `apps/app/.../boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx`: hook local `useRefetchEventsWhenCardChanges`.

## Raio de impacto

As correções não mudam contrato. `pendingAsk` já era campo do card; só muda quem o zera. Consumidores de
`pendingAsk`: `displayCardState`, `cardRunActions`, `planAnswer`, `resumeAfterAnswer`, `CardDetailClient`. O raio
de impacto da tarefa (SDK `MoveCardRequest` sem `stage`, `CardDTO.activeRunId`/`lastRun`, `BoardViewDTO.executor`)
está no handoff e foi conferido: o único chamador de `move` com etapa era o `apps/app`.

## Verificar no `/test`

Repro do handoff: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*`, importar `sample-app`, sincronizar o
backlog; `pnpm --filter api fake-executor script <boardId> <slug> <outcome...>` antes de disparar.

1. **Pergunta aparece no detalhe sem recarregar** (correção desta revisão). Roteiro `needs_input`, disparar Análise
   com o detalhe do card aberto, esperar ~5 s sem tocar na página: o bloco de perguntas e o relatório aparecem
   sozinhos, e o botão diz "Responder e retomar a Análise".
2. **Disparo novo fecha perguntas antigas** (correção desta revisão). Roteiro `needs_input, success`; depois da
   pergunta, arrastar o card para Desenvolvendo sem responder: o selo deixa de dizer "Aguardando você", a pergunta
   antiga continua na linha do tempo sem resposta e não oferece formulário.
3. Fluxos 1 a 10 do plano (8.1), em claro, escuro e 390 px, como no handoff: diálogo de disparo, card andando a cada
   ~5 s, "Volta n de 2", "Falhou" depois do `expire`, "Parado por {login}.", aprovação com o gate ligado, WIP 1 com o
   segundo card na fila.
4. Polling: `GET …/cards` a cada 5 s só enquanto há card na fila ou rodando, e parar depois.
5. Cancelar o diálogo deixa o card onde estava; foco volta a algo útil.
6. Aba Etapas: `operator` vê os valores desabilitados; `octo` salva e vê o toast.
7. Herdados da `card-timeline` (rodada 1 do `/test` de lá, corrigidos sem browser): em 390 px o botão "Responder"
   fica fixo no rodapé e não cobre o fim da linha do tempo; a edição de comentário tem nome acessível "Editar
   comentário" apontando para o próprio campo (`card-comment-edit-<eventId>`); as três abas do detalhe não vazam da
   lista.

## Lacunas de teste

- Sem teste de componente para `BoardStageSettingsForm`, `StopRunDialog`, `useStageRunDialogs` e para "soltar em
  etapa abre o diálogo" no `BoardClient`: continuam abertas.
- `stopRun` concorrente com `completeRun` sem teste de emulador: continua aberta. A leitura acima confirma o
  desenho, não o comportamento medido.
- `resumeAfterAnswer` sem teste contra o emulador: continua aberta.
- Nova: `planTrigger` e `finishOnCard` zerando `pendingAsk` não têm asserção. O teste de `planTrigger` usa
  `toMatchObject`, então não quebra, mas também não prova. Cabe um caso em `orchestratorDecide.test.ts` e um no
  `orchestratorRuns.emulator.test.ts`.
- Nova: o refetch de eventos no detalhe não tem teste; o item 1 de "Verificar no `/test`" mede.

## Decisões em aberto

- Nome da branch (acima).
- Nenhuma outra. A decisão do `pendingAsk` foi aplicada (achado 2).

## Gates

| Gate | Resultado |
|------|-----------|
| `pnpm --filter api --filter app typecheck` | 2 de 2, sem erro, depois das correções |
| `pnpm check` | 887 arquivos, sem erro |
| `apiErrors` | As correções não tocam i18n nem códigos de erro; vale a medição do handoff (`apiErrorCodesTranslated.test.ts` passa na suíte da API) |

Typecheck do contrato e do SDK não foi refeito: as correções não tocam esses pacotes. A suíte não foi rodada (é do
`/test`).

## Depois do /test, rodada 1

O `/test` (`test/report.md`) achou um defeito de foco e seis problemas de copy e de tela. Todos foram corrigidos
aqui, sem browser.

| Sev. | Defeito | Correção |
|------|---------|----------|
| 🟡 | O foco caía no `body` ao fechar `TriggerStageDialog` ou `StopRunDialog` (Cancelar, Escape ou confirmar), aberto por arrasto, pelo menu "⋯" ou por "Rodar de novo". Os dois são `Dialog` controlados, sem `DialogTrigger`, então o Radix não tem para onde devolver o foco. | `useStageRunDialogs` guarda o `document.activeElement` e o card ao abrir. No `onCloseAutoFocus` (novo nos dois diálogos), cancela o comportamento padrão e chama `restoreRunDialogFocus` (`(components)/runDialogFocus.ts`) no quadro seguinte: o elemento que abriu, se ainda está na página; senão o botão do menu do card, pelo mesmo `data-card-menu` que a `card-backlog` usa depois de mover; senão o primeiro botão de `run` do card (`data-run-controls`, novo em `CardRunControls`, por exemplo "Parar" depois de disparar); senão o link do título (`data-card-link`, novo em `BoardCardItem`). Teste novo: `apps/app/__tests__/runDialogFocus.test.tsx`. |
| 🟢 | Concordância com o nome da coluna: "Disparar a Executando?", "A Executando parou com 1 pergunta", "Responder e retomar a Executando". | `trigger.title` passa a "Disparar a etapa {column}?"; `questions.titleOne`/`titleOther` passam a "A etapa {stage} parou com…"; `submitAndResume` passa a "Responder e retomar a etapa {column}". |
| 🟢 | "no limite de 1 cards". | `wipFull` passa a "A coluna {column} já tem o máximo de cards rodando ({wip}). …", sem plural para concordar. |
| 🟢 | O diálogo aberto pelo menu dizia "Você soltou", sem ter havido arrasto. | `trigger.description` ficou neutra: "“{title}” entra em {column}. …". |
| 🟢 | O corpo de "Aprovar e seguir" dizia "de novo" na primeira execução da etapa. | Chave nova `trigger.approveDescription`, sem "de novo"; o diálogo escolhe o corpo pelo tipo de disparo. |
| 🟢 | Cards em Concluído mostravam o selo "Parado". | No quadro, Concluído não mostra selo de estado: `BoardClient` não monta `CardRunControls` para card em Concluído (não há `run` nem botão ali) e `BoardCardItem` esconde o `CardStateBadge` em Concluído, mantendo "Spec removida". O detalhe continua mostrando o estado, porque a linha "Estado" existe para todo card. `displayCardState` não mudou: ele descreve o card, e esconder o selo é escolha de tela. |
| 🟢 | O placeholder do limite ficava cortado a 1440 px ("Vazio para não lim"). | `stageSettings.wipLimitHint` passa a "Sem limite". |

Ficaram como estão, registradas para a decisão de produto:

- Diferenças contra os PNGs de `docs/design/`: falta "Onde roda" (Runner local × Nuvem) e a credencial do runner, o
  interruptor "Não pedir confirmação ao arrastar neste board", a folha inferior no celular e o botão "Responder" no
  card do quadro. O plano deixou os quatro fora do corte desta spec.
- Em 390 px, a coluna vazia de etapa diz "Arraste um card de Tarefas para cá.", mas no celular o caminho é o menu.
- Um card que volta de Revisando para Análise leva o chip "Volta 2 de 2" para a fila, como o plano decidiu.

Gates depois da rodada: `pnpm check` 889 arquivos sem erro; typecheck de `app` e `@repo/internationalization` 2 de
2; `runDialogFocus.test.tsx`, `triggerStageDialog.test.tsx` (dois casos novos: corpo da aprovação sem "de novo" e
descrição sem "soltou"), `cardQuestionsForm.test.tsx`, `boardColumnsMove.test.tsx` e `cardRunActions.test.tsx`: 33
de 33. Nenhum código de erro mudou, então o `apiErrorCodes` não foi refeito.

A remedição no browser (o foco nos três caminhos de abertura e nos três de fechamento, e a copy nova) fica para a
passada de QA da `agent-contract`, que abre as mesmas telas.

## Depois do /test, rodada 2

A remedição na passada de QA da `agent-contract` (`test/report.md`, seção "Remedição na passada da agent-contract")
confirmou 7 dos 8 caminhos de foco e achou um defeito, além de um plural.

| Sev. | Defeito | Correção |
|------|---------|----------|
| 🟡 | "⋯" → "Mover para Análise" → Cancelar ou Escape deixava o foco no `body`. O antd mantém o `<li>` do menu fechado no DOM, oculto em `.ant-dropdown-hidden` e com `isConnected` verdadeiro; `restoreRunDialogFocus` chamava `focus()` nesse item, o navegador ignorava, e o fallback nunca rodava. | `runDialogFocus.ts`: depois do `focus()` no elemento que abriu o diálogo, confere `document.activeElement`; se o foco não pegou, segue para o menu do card (`data-card-menu`), os botões de `run` e o link. Caso novo em `runDialogFocus.test.tsx` com um item conectado que não recebe foco: falha sem a correção (conferido revertendo a linha) e passa com ela. |
| 🟢 | O texto `sr-only` do título de coluna lia "1 cards". | `board.columns.count` virou `countOne` ("1 card") e `countOther` ("{count} cards"); `BoardColumn.tsx` escolhe pela contagem. |

Gates: `pnpm check` sem erro; typecheck de `app` e `@repo/internationalization` 2 de 2; `runDialogFocus.test.tsx`,
`boardColumnsMove.test.tsx` e `groupCardsByColumn.test.ts`: 22 de 22.

O teto de duas rodadas de correção depois do `/test` foi atingido. A remedição no browser destas duas correções
(foco pelo menu "⋯" ao cancelar e ao apertar Escape, e o texto do leitor de tela no título da coluna) fica para a
passada de QA do `local-runner`.

## Plano de commits (tarefas 1 a 8)

> Substituído pelo plano das tarefas 1 a 9 em
> [`agent-contract/review/review.md`](../../agent-contract/review/review.md#plano-de-commits-tarefas-1-a-9).

Este plano substitui o de
[`card-timeline/review/review.md`](../../card-timeline/review/review.md#plano-de-commits-tarefas-1-a-7). Mensagens,
arquivos e comandos de blob de lá (e dos planos que ele cita) continuam valendo com as mudanças abaixo. A estratégia
é a mesma: arquivo misto entra inteiro no primeiro commit que já o leva, e a mensagem ganha uma linha de corpo.

Os commits intermediários da API e do app ficam vermelhos no typecheck até os commits novos do orquestrador entrarem
(por exemplo, o 25 já importa `board-view.ts`, que chega no 35). O PR fica verde no último commit, como nos planos
anteriores.

### Onde a tarefa 8 entra em commits existentes (numeração nova)

| Arquivo | Commit | Corpo acrescentado |
|---------|--------|--------------------|
| `packages/shared/utils/helpers/log.ts` | 1 | Mensagem passa a `feat(shared): add github and orchestrator log scopes and BAD_GATEWAY status` |
| `packages/kanban-contract/src/boardConfig.ts`, `__tests__/boardConfig.test.ts` | 3 | `Also adds limits.stageTimeoutMinutes.` |
| `packages/sdk/src/types/board/card.ts`, `board.ts`, `member.ts`, `index.ts`, `actions/board/action.ts`, `actions/boardCard/action.ts` + `packages/sdk/src/types/board/run.ts` (novo) | 12 | `Also adds runs: trigger, stop and stage settings.` |
| `apps/api/package.json` | 15 | Linha `fake-executor`; o script chega no 36 |
| `apps/api/(shared)/mappers/board.mapper.ts`, `repositories/board.repository.ts`, `__tests__/boardMapper.test.ts` | 24 | `The board also stores stage settings.` |
| `apps/api/(shared)/lib/board-list.ts` | 25 | |
| `apps/api/(shared)/mappers/card.mapper.ts`, `repositories/card.repository.ts`, `__tests__/cardMapper.test.ts` | 26 | `Cards keep their active run and last run.` |
| `apps/api/app/(routes)/boards/route.ts`, `boards/[id]/route.ts`, `boards/[id]/reload/route.ts`, `__tests__/boardsRoutes.test.ts` | 27 | `Board views report the available stage executor.` |
| `apps/api/app/(routes)/boards/[id]/cards/route.ts` | 29 | |
| `apps/api/(shared)/lib/card-move.ts`, `validation/card.schema.ts`, `cards/[slug]/route.ts`, `cards/[slug]/move/route.ts`, `__tests__/cardMove.test.ts`, `boardCardsRoutes.test.ts`, `fakeCardRepository.ts` | 30 | `Moving only takes a card to Tasks or Done and refuses a card with a live run; entering a stage triggers it.` |
| `apps/api/(shared)/mappers/card-event.mapper.ts` | 31 | |
| `apps/api/app/(routes)/boards/[id]/cards/[slug]/answers/route.ts`, `__tests__/cardEventsRoutes.test.ts` | 32 | `Answering resumes the stage when the board has an executor.` |
| `.../boards/(hooks)/useBoardCrud.tsx` | 42 | |
| `.../boards/(pages)/[id]/settings/BoardSettingsClient.tsx` | 43 | |
| `.../boards/(hooks)/useListBoardCards.tsx`, `useFindBoardCardBySlug.tsx`, `useBoardCardCrud.tsx`, `apps/app/__tests__/useBoardCardCrud.test.tsx` | 46 | |
| `.../boards/(components)/BoardCardItem.tsx`, `BoardColumns.tsx`, `BoardSummaryLine.tsx`, `CardMoveMenu.tsx`, `CardStateBadge.tsx`, `groupCardsByColumn.ts`, `(pages)/[id]/BoardClient.tsx`, `apps/app/__tests__/groupCardsByColumn.test.ts`, `boardColumnsMove.test.tsx` | 47 | |
| `.../boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx` | 48 | |
| `.../boards/(hooks)/useCardEventCrud.tsx`, `apps/app/__tests__/useCardEventCrud.test.tsx` | 49 | |
| `.../boards/(components)/CardQuestions.tsx`, `apps/app/__tests__/cardQuestionsForm.test.tsx` | 50 | |
| `translations/packages/shared/utils.ts` | 57 | Os quatro códigos de `run` |
| `translations/apps/app/pages/common/boards.ts` | 59 | |
| `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` | 61 | |
| `docs/board/ARCHITECTURE.md` | 63 | Mensagem passa a `docs(board): name the board, member, card, card event and run collections` |
| `docs/board/CONTRACT.md` | 64 | Mensagem passa a `docs(board): state agent payload limits and the stage timeout` |

### Blobs do `packages/kanban-contract/src/index.ts`

O barril agora exporta `./run`, que só existe a partir do commit 7:

- commit 2: `grep -vE '\./(boardConfigDiff|boardConfigIssues|boardLanes|specBacklog|cardEvent|run)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 3: `grep -vE '\./(boardLanes|specBacklog|cardEvent|run)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 5: `grep -vE '\./(cardEvent|run)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 6 (antes ia inteiro): `grep -vE '\./run"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- em cada um, `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/src/index.ts`. O commit 7 leva o
  arquivo inteiro com `git add`.

### Numeração

| Novo | No plano de 66 | Commit |
|------|----------------|--------|
| 1 a 6 | 1 a 6 | sem mudança (1 com mensagem nova; 2, 3, 5 e 6 com os blobs acima) |
| **7** | novo | `feat(kanban-contract): add stage runs and the run actions a card offers` |
| 8 a 33 | 7 a 32 | sem mudança |
| **34** | novo | `feat(api): add the run collection and the orchestrator decisions` |
| **35** | novo | `feat(api): add the stage executor port with a test executor for the emulator` |
| **36** | novo | `feat(api): trigger, stop and complete stage runs` |
| **37** | novo | `chore(api): add a script that drives the test executor in the emulator` |
| **38** | novo | `test(api): cover runs, the queue and timeouts against the emulator` |
| 39 a 51 | 33 a 45 | sem mudança |
| **52** | novo | `feat(app): poll the board and the card while a stage is queued or running` |
| **53** | novo | `feat(app): trigger, stop and approve stages from the board and the card` |
| **54** | novo | `feat(app): set stage limits and approval in board settings` |
| 55 a 66 | 46 a 57 | sem mudança (63 e 64 com mensagem nova) |
| 67 | 58 | `docs(specs): start the orchestrator spec` |
| **68** | novo | `docs(specs): start the agent-contract spec` |
| 69 a 75 | 59 a 65 | sem mudança |
| **76** | 66 | `docs(features): orchestrator`, agora a pasta inteira |
| **77** | novo | `docs(features): agent-contract` |

A tabela "Onde a tarefa 8 entra" já usa a numeração nova. O antigo 7 a 32 soma 1, o 33 a 45 soma 6, o 46 a 57
soma 9 e o 59 a 65 soma 10 (o antigo 23 é o 24, o antigo 40 é o 46, o antigo 48 é o 57). Conferido item a
item contra o plano de 66.

### Commits novos

7. `feat(kanban-contract): add stage runs and the run actions a card offers`
   - `packages/kanban-contract/src/run.ts`, `index.ts` (inteiro)
   - `packages/kanban-contract/__tests__/run.test.ts`
34. `feat(api): add the run collection and the orchestrator decisions`
   - corpo: `planCompletion is the only caller of resolveTransition; every run write goes through a Firestore transaction.`
   - `apps/api/(shared)/mappers/run.mapper.ts`, `apps/api/(shared)/repositories/run.repository.ts`,
     `apps/api/(shared)/lib/orchestrator/decide.ts`
   - `apps/api/__tests__/runMapper.test.ts`, `orchestratorDecide.test.ts`
35. `feat(api): add the stage executor port with a test executor for the emulator`
   - corpo: `The test executor exists only when the API talks to the emulator; no variable turns it on.`
   - `apps/api/(shared)/lib/orchestrator/executor-mode.ts`, `executor.ts`, `fake-executor.ts`,
     `apps/api/(shared)/lib/board-view.ts`
   - `apps/api/__tests__/stageExecutorMode.test.ts`
36. `feat(api): trigger, stop and complete stage runs`
   - corpo: `Deadlines and the test executor's results are applied at the start of each board read, since the free plans offer no scheduler.`
   - `apps/api/(shared)/lib/orchestrator/orchestrator.ts`, `tick-safely.ts`
   - `apps/api/(shared)/validation/run.schema.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/runs/route.ts`, `cards/[slug]/stop/route.ts`,
     `boards/[id]/stage-settings/route.ts`
   - `apps/api/__tests__/cardRunsRoutes.test.ts`
37. `chore(api): add a script that drives the test executor in the emulator`
   - `apps/api/scripts/fake-executor.mjs`
   - `apps/api/__tests__/fakeExecutor.test.ts`
38. `test(api): cover runs, the queue and timeouts against the emulator`
   - `apps/api/__tests__/orchestratorRuns.emulator.test.ts`
52. `feat(app): poll the board and the card while a stage is queued or running`
   - `.../boards/(components)/hasActiveRun.ts`
   - `apps/app/__tests__/hasActiveRun.test.ts`
53. `feat(app): trigger, stop and approve stages from the board and the card`
   - `.../boards/(components)/CardRunControls.tsx`, `cardRunReason.ts`, `TriggerStageDialog.tsx`,
     `StopRunDialog.tsx`, `useStageRunDialogs.tsx`, `runDialogFocus.ts`
   - `apps/app/__tests__/runCardFixtures.ts`, `cardRunActions.test.tsx`, `triggerStageDialog.test.tsx`,
     `runDialogFocus.test.tsx`
54. `feat(app): set stage limits and approval in board settings`
   - `.../boards/(components)/BoardStageSettingsForm.tsx`, `.../boards/(validations)/stageSettingsSchema.ts`
   - `apps/app/__tests__/stageSettingsSchema.test.ts`
68. `docs(specs): start the agent-contract spec`
   - `specs/features/agent-contract.md`
76. `docs(features): orchestrator`
   - `docs/features/orchestrator/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md` e, depois
     do `/test`, `test/`)
77. `docs(features): agent-contract`
   - `docs/features/agent-contract/` (`STATE.md`, `analyze/plan.md`)

O prefixo `.../boards/` é `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/`. As pastas
`docs/features/orchestrator/` e `docs/features/agent-contract/` foram varridas atrás de senha, token e e-mail: só
aparecem menções ao token de execução como conceito, sem valor.

Antes do commit 1, `git diff --cached --stat` vazio (conferido nesta revisão); depois de cada commit,
`git show --stat --oneline HEAD` conferido contra a lista. Toda mensagem termina com a linha de coautoria da sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members, cards, card timeline, stage runs and theme toggle`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
