# Revisão: cycle-runs (fatia 1)

Rodada autônoma do `/cycle`, 2026-11-27. Revisão por leitura do working tree inteiro (índice vazio) contra
`docs/review-checklist.md`, mais os gates estáticos. Não subi app, API nem browser.

## Branch

`guilhermebittelbrunn/chore-overnight-cycle-specs`, reutilizada. O usuário pediu para manter todo o trabalho
da noite nessa branch, então não criei nem renomeei branch. O nome **não passa** no regex do padrão
`<project>/<type>/<title>` (tem o login como prefixo e `chore-...` no lugar de `type/title`). Fica registrado
em "Decisões em aberto"; a correção, se o usuário quiser, vale para a branch inteira, não só para esta feature.

## Estado deixado pela revisão interrompida

Uma tentativa anterior desta revisão parou antes de gravar este arquivo. Ela mexeu em três arquivos depois
do handoff (06:53): `apps/api/(shared)/lib/orchestrator/cycle.ts`, `apps/api/__tests__/boardCyclesRoutes.test.ts`
e `NewCycleClient.tsx`. Conferi os três: compilam, passam no `pnpm check`, e o arquivo de teste roda inteiro
(21 casos antes da minha correção). As mudanças que reconheço dessa passada (o `try/catch` em `startItem`,
a carência de 10 minutos em `reconcileCycle` para item cujo disparo nunca ligou o card, e os testes de
reconciliação) estão completas e fazem sentido. Mantive todas.

## Achados

| Sev. | Onde | Problema | Ação |
|---|---|---|---|
| 🟡 | `apps/api/(shared)/lib/orchestrator/cycle.ts:327` | `reconcileCycle` só olhava item `running`. Se o processo parasse entre o `createOnBoard` (ciclo gravado como `running`, itens todos `pending`) e o primeiro `advance`, nada começava o ciclo e o board ficava preso com o `runningCycleId` dele, segurando também a fila. | Corrigido: a leitura do detalhe também avança quando há item `pending` e vaga livre (`hasIdleSlot`, `:373`). Teste novo em `boardCyclesRoutes.test.ts:594`. |
| 🟡 | `packages/kanban-contract/src/cycle.ts:188` + `apps/api/(shared)/lib/orchestrator/cycle.ts:237` | Com `onFailure: stop` e `concurrency: 2`, o ciclo fecha e solta o `runningCycleId` enquanto a outra spec ainda termina a etapa atual (Q6 do plano). O próximo ciclo da fila começa nesse momento, então por algum tempo o board roda mais specs do que a concorrência pedida. O item da spec que ainda roda aparece como `running` num ciclo `stopped` até a etapa acabar. | Mantido: é a decisão Q6. Vai para "Verificar no `/test`". |
| 🟢 | `apps/api/app/(routes)/boards/[id]/cycles/[cycleId]/route.ts:31` | A reconciliação só acontece quando alguém abre o detalhe **daquele** ciclo. Um ciclo na fila cujo antecessor terminou num processo que caiu espera alguém abrir o ciclo da fila. | Mantido (desvio 5 do handoff). Registrado. |
| 🟢 | `apps/api/(shared)/repositories/cycle.repository.ts:145` | Se o `runningCycleId` estiver `null` com ciclos na fila (só depois de queda entre o fim de um ciclo e o `startNextQueued`), um ciclo novo começa na frente dos da fila. Não gera dois ciclos rodando. | Mantido. |
| 🟢 | `NewCycleClient.tsx:203` | Para quem não tem `trigger`, o Novo ciclo mostra só o cabeçalho, sem formulário nem aviso. A API recusa com 403 de qualquer jeito, e a tela de lista não mostra o botão. | Mantido. Conferir no `/test`. |

Pontos do foco pedido, conferidos por leitura e sem achado:

- **Regra 14.** O ciclo não move card. `advance` só chama `triggerStage` (`cycle.ts:165`) e o card anda por
  `planCompletion` → `resolveTransition`. O `holdStageKey` entra em `resolveTransition` depois dos desfechos
  que não são sucesso e antes do teste da etapa de PR. Com `until: pull_request` ele é `null` e o card entra
  na etapa de PR, que segura o card até o merge como antes. Com `until: testing` ele aponta para a etapa
  anterior à de PR, e `cycleHoldStageKey` nunca devolve a própria etapa de PR. `settlePullRequest` e o
  `pr_comment` continuam iguais; um `pr_comment` disparado por `onPullRequestComment` nunca leva `cycleId`
  (`planTrigger` só grava o ciclo com `trigger: "cycle"`).
- **`pumpBoard` e `choices.has(run.id)`.** O ciclo dispara pelo `triggerStage`, que roda o próprio
  `pumpBoard` depois de enfileirar, então o `run` novo tem escolha de executor. O `onCycleItemSettled` roda
  depois do `pumpBoard` do `completeRun` e do `stopRun`.
- **Concorrência.** `finishOnCard` lê o documento do ciclo dentro da mesma transação que fecha o `run`; se
  `stop` ou `applyAdvance` gravar no ciclo antes do commit, o Firestore refaz a transação. O `applyAdvance`
  só devolve em `start` o item que ele mesmo passou de `pending` para `running`, então cada item é disparado
  uma vez. Um evento repetido para o mesmo item (reconciliação e `onCycleItemSettled` ao mesmo tempo) não
  faz nada no segundo, porque `settle` só fecha item `running`. `startNextQueued` lê e grava o
  `runningCycleId` na mesma transação. Não achei caminho de duplo avanço.
- **Regra 16.** `decisions` passa pelo `completeStageInputSchema` na entrada (até 20, texto de 1 a 500
  caracteres, `rule` de lista fechada) e de novo pelo `stageDecisionSchema` no mapper ao ler, que descarta o
  que não valida. `CycleDecisions` e `CycleActivity` mostram como texto (nada de markdown nem HTML), e as
  decisões não voltam para o `get_card` de outro agente. O `--cycle` do prompt é o id do documento gerado
  pela API.
- **Papéis.** Listar e ler: `view`. Criar e parar: `trigger` (operator ou acima), como disparar etapa. O
  detalhe filtra por `boardId` (`findInBoard`) e devolve 404 para ciclo de outro board; `stop` faz o mesmo
  dentro da transação.
- **`ask`.** Recusado com `AGENT_ASK_IN_CYCLE` só quando o `run` tem `cycleId` (`agent-tools.ts`).
  `post_update` e `attach_artifact` seguem sem mudança.
- **Abuso.** Até 10 slugs, únicos, no formato de slug, validados com Zod na borda. `concurrency: 2` exige
  dois runners online de quem inicia, menos no executor de teste. Cada spec precisa estar pronta em Tarefas,
  sem execução e fora de outro ciclo, conferido na criação e de novo na transação (`CYCLE_SPEC_BUSY`).

Spec × entrega: a fatia 1 corresponde ao corte combinado no plano; pausar, retomar, "Mudar"/"Concordo" e as
pendências de infra na tela ficam para a fatia 2, como o `STATE.md` registra.

## Correções aplicadas

- `apps/api/(shared)/lib/orchestrator/cycle.ts`: `reconcileCycle` avança também um ciclo `running` com item
  `pending` e vaga livre; função nova `hasIdleSlot`; docstring atualizada.
- `apps/api/__tests__/boardCyclesRoutes.test.ts`: caso "starts the pending items of a running cycle that
  never advanced".

## Raio de impacto

- `CardDTO.cycleId`, `RunDTO.cycleId`, `decisions` no evento `report`, `AgentCardView.card.cycleId`,
  `RunnerJob.cycleId`, `StageDispatch.cycleId` e `ActiveRunView.cycleId` são campos novos. Quem monta essas
  estruturas à mão quebra no typecheck; os fixtures da API, do app e do runner já foram atualizados.
- `BoardSection` ganhou `cycles`; as quatro páginas com a navegação passam o link.
- Runner antigo não passa `--cycle`. O agente então pode tentar `ask` e recebe `AGENT_ASK_IN_CYCLE`.
- Repositório importado sem a §2.1 da regra do modo board: mesmo efeito.

## Verificar no `/test`

Ambiente: `pnpm emulators`, `pnpm seed`, `pnpm dev`, board de amostra com três specs `approved`.

1. **Ciclo preso depois de queda (a correção desta revisão).** No emulador, criar um documento `cycle` com
   `status: "running"`, itens `pending` e o `runningCycleId` do board apontando para ele; abrir o detalhe.
   Esperado: o primeiro item vira `running` e o card começa a análise.
2. **`onFailure: stop` com `concurrency: 2`.** Roteirizar `failed` na primeira spec
   (`pnpm --filter api fake-executor script <boardId> <slug> failed`) com a segunda rodando e outro ciclo na
   fila. Medir: a segunda termina a etapa atual e fica parada nela; o item dela fecha `stopped`; o ciclo da
   fila começa quando a primeira falha.
3. **Parar no meio** (`stopCycle`), contra o emulador: execução viva parada, card fica onde estava, sem
   `cycleId`, item `stopped`, pendentes `skipped`, próximo da fila começa.
4. **Reconciliação**: parar a API logo depois do fim de uma etapa de um card do ciclo (antes do avanço) e abrir
   o detalhe. Esperado: o item fecha pelo estado do card e o próximo começa.
5. Roteiro §9 do plano, itens 1 a 8 (selo, aprovação pulada, decisões e "Para revisar", `until: testing`,
   viewer sem botão e 403), temas claro e escuro, 390 px sem rolagem lateral na tabela de andamento.
6. Viewer abrindo `/cycles/new` direto pela URL: o que a tela mostra.
7. Tick no `deadline` com runner real (🔒, precisa de runner).

## Lacunas de teste

Vereditos sobre a lista do handoff:

- `reconcileCycle` sem teste unitário: **fechada**. `boardCyclesRoutes.test.ts` cobre os quatro caminhos
  (card terminou fora do ciclo, primeira etapa ainda rodando, disparo que nunca ligou o card, ciclo que nunca
  avançou), pela rota do detalhe com repositórios em memória.
- `stopCycle` contra o emulador: **continua aberta** (item 3 acima). Na rota com repositório em memória está
  coberto.
- `onFailure: stop` no emulador: **continua aberta** (item 2). Coberta no contrato, em `planCompletion` e na
  rota de criação.
- Sem teste de componente para `NewCycleClient` e `CycleDetailClient`: **continua aberta**, para o `/test`
  decidir se vale o custo; as funções puras e o hook têm teste.

## Decisões em aberto

- **Nome da branch fora do padrão.** `guilhermebittelbrunn/chore-overnight-cycle-specs` não bate com
  `<project>/<type>/<title>`. Recomendação: manter durante a noite, como o usuário pediu, e renomear ou
  dividir em branches por feature antes de abrir a PR.
- **Q6 (`onFailure: stop`).** Se o usuário preferir que o próximo ciclo da fila só comece depois de a spec
  ainda viva terminar, o `ended` do `advanceCycle` teria de esperar os itens `running`. Recomendação: manter
  como está na fatia 1 e reavaliar com o resultado do item 2 do `/test`.

## Gates

| Comando | Resultado |
|---|---|
| `pnpm check` | sem erros, 915 arquivos |
| `pnpm turbo run typecheck --filter=api` | verde, depois da correção |
| typecheck de `app`, `kanban-contract`, `sdk`, `runner` | verde (cache do turbo, arquivos não mudaram) |
| `npx vitest run apiErrorCodes` (api) | 2 de 2 |
| `npx vitest run __tests__/boardCyclesRoutes.test.ts` (api) | 22 de 22, rodado só para confirmar o arquivo que a revisão interrompida deixou e o caso novo |

## Plano de commits

Na ordem. Listas exatas de arquivos em `commits-cycle-runs/commit-NN.txt` (scratchpad da sessão); todo
caminho do `git status` cai em exatamente um commit.

1. `feat(kanban-contract): add the cycle domain and hold cycle cards on their stage`
2. `feat(kanban-contract): add stage decisions and the cycle id to the agent contract`
3. `feat(sdk): add the board cycle actions and types`
4. `feat(api): carry the cycle id through cards, runs and card events`
5. `feat(api): refuse ask and record stage decisions inside a cycle`
6. `feat(api): advance cycles from the orchestrator`
7. `feat(api): add the board cycle routes`
8. `feat(runner): pass the cycle to the agent prompt`
9. `feat(app): add the board cycle data hooks`
10. `feat(app): add the cycles, new cycle and cycle detail screens`
11. `feat(app): link cycles in the board navigation and badge cycle cards`
12. `feat(internationalization): add cycle copy and error codes`
13. `feat(claude): decide without asking inside a cycle in the kit and this board`
14. `docs(board): describe cycles, stage decisions and the cycle flag`
15. `docs(features): cycle-runs`

Commits realizados: (preenchido pelo orquestrador)
