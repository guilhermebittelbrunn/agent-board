# Plano: Ciclo, levar uma ou várias specs de ponta a ponta

- Spec: [`specs/features/cycle-runs.md`](../../../../specs/features/cycle-runs.md) (status `proposed`, valor alto,
  esforço G, fase 2)
- Slug: `cycle-runs`
- Data: 2026-11-27, rodada autônoma do `/cycle`. Nenhuma pergunta foi feita; as decisões adotadas estão em
  "Perguntas em aberto".
- **A spec continua `proposed`.** O usuário pediu para levar esta noite pelo `/cycle` o máximo de specs
  possível, e esta entrou na rodada sem aprovação formal. O status do arquivo não muda; aprovar ou rejeitar
  continua sendo decisão dele (`.claude/cycle-policy.md` §1).
- Base de código: branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, que já tem `spec-authoring`,
  `app-cleanup` (`requireSessionApi` com `ctx.profile`, `requireBoardApi`), `pr-flow` (etapa de PR, webhooks,
  `/mediate` com limite) e `execution-credentials` (credencial por etapa, `chooseStageExecutor`,
  `no_credential`).
- **Esforço G em duas entregas.** Este plano cobre a **fatia 1**: o motor do ciclo, iniciar, fila, parar,
  decisões estruturadas e as telas Novo ciclo e Ciclo em modo leitura. A **fatia 2** (pausar e retomar,
  "Mudar" uma decisão, "Concordo", pendências de infra na tela, aviso de dependência entre specs) fica
  explícita em §1.3 e não entra nesta rodada.

---

## Etapa 1: análise

### 1. Contexto

**Resumo.** O operador escolhe specs de Tarefas, em ordem, com três opções (até onde vai, quantas ao mesmo
tempo, o que fazer se uma falhar). O board leva cada uma da Análise até Testando ou até a PR aberta, sem
aprovação do plano e sem perguntas: o agente decide pela política do repositório, registra cada decisão no
`complete_stage` e marca as de produto para revisão.

#### 1.1 O que já existe (medido no código)

| Peça do corte | Situação | Evidência |
|---|---|---|
| Transição com aprovação opcional e limite de retrabalho | Existe, sem noção de ciclo | `packages/kanban-contract/src/cardState.ts:26-31` (`TransitionInput` só tem `approvalGateEnabled`), `:46-51`, `:65-77` |
| Único chamador de `resolveTransition` na API | Existe | `apps/api/(shared)/lib/orchestrator/decide.ts:297-394` (`planCompletion`), ganha `approvalGateEnabled` de `stageSettings` em `:338-339` |
| Etapa de PR que segura o card `idle` até o merge | Existe | `cardState.ts:79-82`; PR aberta na entrada em `orchestrator.ts:137-145` e `:155-179` |
| PR como rascunho | Existe por `board.yml` | `boardConfig.ts:47-49` (`draft` padrão `true`); `.kanban/board.yml` usa `draft: true` |
| Fila de execuções, WIP e escolha de executor por quem disparou | Existe | `decide.ts:427-448` (`pickPromotions`), `orchestrator.ts:340-406` (`pumpBoard`), `executor-choice.ts:42-64` |
| Transação que fecha o `run` e cria o próximo | Existe | `run.repository.ts:208-289` (`finishOnCard`); o próximo `run` copia `triggeredBy` do anterior em `:252-266` |
| `complete_stage` com `outcome` e `summary` | Existe, **sem** decisões | `agentContract.ts:58-62` |
| Relatório da etapa vira evento `report` no card | Existe | `card-events.ts:104-113`; gravado com `runId` em `agent-tools.ts:48-51` |
| `ask` sempre aceito | Existe, **sem** recusa no ciclo | `agent-tools.ts:128-131` |
| Disparo do runner com `--board` | Existe, **sem** `--cycle` | `apps/runner/src/session.ts:19-21`; `RunnerJob` sem ciclo em `packages/kanban-contract/src/runner.ts:69-85` |
| Gatilhos de execução | `drag`, `rerun`, `approve`, `answer`, `transition`, `pr_comment` | `packages/kanban-contract/src/run.ts:25-33` |
| Papel para disparar | `canTriggerStages` (operator ou acima) | `roles.ts:47-49`; capability `trigger` em `board-access.ts:44` |
| Política de decisão | Existe para o terminal | `.claude/cycle-policy.md`; `board-mode.md` §2 manda decidir o técnico e perguntar o de produto |
| Coleção `cycles` | **Não existe** | `docs/board/ARCHITECTURE.md` lista o nome como previsto; `grep -ri cycle apps/api apps/app packages/sdk packages/kanban-contract` só acha `lifecycle` num teste |
| Telas Novo ciclo e Ciclo | **Não existem** | Seções do board em `BoardSectionNav.tsx:5` (`board`, `members`, `settings`, `credentials`) |
| Variante de ciclo no kit | **Não existe** | `kit/.claude/rules/board-mode.md` só cita `cycle-policy.md` em `:31-32` |

Conclusão: o ciclo inteiro é novo, mas encaixa em três costuras que já existem. O disparo entra por
`triggerStage` (`orchestrator.ts:61-98`) com um gatilho novo. O avanço sai de `completeRun`
(`orchestrator.ts:105-149`), que já é o ponto único de todo resultado. A regra de "pular aprovação e parar no
fim" entra em `resolveTransition`, que é o único lugar onde transição é decidida (regra 14).

#### 1.2 Objetivos da fatia 1

1. **Novo ciclo**: escolher de 1 a 10 specs de Tarefas, na ordem de execução, com as opções `until`
   (`testing` ou `pull_request`), `concurrency` (`1` ou `2`) e `onFailure` (`skip` ou `stop`).
2. **Fila de ciclos**: um ciclo criado com outro rodando entra como `queued` e começa quando o atual termina.
3. **Etapas do ciclo** rodam com `--board <card> --cycle <ciclo>`; a API recusa `ask` num `run` de ciclo
   (`409 AGENT_ASK_IN_CYCLE`), espelhando no servidor a regra do kit.
4. **Decisões estruturadas**: `complete_stage` aceita `decisions[]` com o texto, a regra usada (`policy`,
   `spec`, `repo_pattern`, `least_impact`) e `product: boolean`.
5. **Sem aprovação do plano dentro do ciclo**, e o card para onde a opção `until` manda: idle em Testando, ou
   idle na etapa de PR com a PR aberta.
6. **Tela do ciclo** (leitura): andamento por spec e etapa, decisões tomadas sem você, decisões de produto
   marcadas para revisão, atividade recente; botão **Parar o ciclo**.
7. **Selo de ciclo** no card do quadro enquanto ele está sob o ciclo.
8. O ciclo nunca faz merge. A PR abre como o `board.yml` manda (rascunho no kit), igual ao `pr-flow`.

#### 1.3 Fora desta rodada

Ficam para a **fatia 2**, mantendo o corte da spec:

- **Pausar depois da etapa atual** e retomar. Exige segurar o card na etapa seguinte e redisparar na
  retomada; é a segunda metade natural do controle de execução.
- **"Mudar" uma decisão** (devolver a spec à etapa da decisão quando o ciclo terminar) e **"Concordo"** nas
  decisões de produto. Na fatia 1 a tela lista as decisões e marca as de produto, sem ação.
- **Pendências de infraestrutura** anotadas pelos agentes na tela. Os agentes continuam escrevendo em
  `docs/PRE-PRODUCTION.md`; falta um campo estruturado para o board mostrar.
- **Aviso de spec dependente** na escolha (spec com `depends_on` em outra ainda não mergeada). O card não
  guarda `depends_on` hoje; o mapper do card não tem o campo (`card.mapper.ts:80-82` lista as chaves).
- "Ciclos anteriores" com resumo de resultado: a fatia 1 tem a lista de ciclos com status, sem o resumo.

Fora do corte da spec (não entram em nenhuma fatia): agenda (`cycle-schedule`), mais de duas specs ao mesmo
tempo, ciclo começando em Rascunhos.

#### 1.4 Apps impactados

| Onde | O quê |
|---|---|
| `packages/kanban-contract` | `cycle.ts` novo (tipos, opções, schema de criação, decisões, avanço puro); `resolveTransition` com `cycle`; `decisions` em `complete_stage`; gatilho `cycle`; `cycleId` em `StageDispatch`, `RunnerJob`, `ActiveRunView`, `AgentCardView`; `decisions` em `ExecutorReport` |
| `packages/sdk` | Tipos `board/cycle.ts`; `cycleId` em `CardDTO` e `RunDTO`; `decisions` em `CardEventDTO`; action `boardCycle` |
| `apps/api` | Coleção `cycle` (mapper + repositório); rotas `cycles`; `orchestrator/cycle.ts`; `cycleId` no card, no `run` e no evento; recusa de `ask`; fake executor com decisão de exemplo; tick no fim de `run` de ciclo |
| `apps/runner` | `--cycle <id>` no prompt |
| `apps/app` | Seção Ciclos: lista, Novo ciclo, Ciclo; selo no card |
| `packages/internationalization` | Bloco `cycles`, `nav.cycles`, selo, códigos novos em `apiErrors` |
| `kit/` e `.claude/rules/board-mode.md` | Variante `--cycle` |
| `docs/board/` | ARCHITECTURE (coleção `cycle`, ciclo do card), CONTRACT (`decisions`, recusa de `ask`, `--cycle`) |

**Papel no board.** Ver ciclos: `view` (qualquer membro). Criar e parar: `trigger` (operator ou acima,
`roles.ts:47-49`), o mesmo papel de arrastar card. As etapas rodam com a credencial de quem iniciou o ciclo
(`triggeredBy` = quem iniciou), como todo disparo hoje (`docs/board/DECISIONS.md`, "Com que credencial a etapa
roda").

**Genérico ou específico.** O tipo do ciclo e a regra de transição são domínio do board e vão para
`@repo/kanban-contract` (regra 12). O resto fica em `apps/*`.

**Dependências externas e env.** Nenhuma env nova, nenhuma dependência nova, nenhum serviço pago.

#### 1.5 Fontes

- Spec e `.claude/cycle-policy.md`, lidos por inteiro.
- Telas no repositório: `docs/design/screens/CycleStart.dc.html` e `CycleRun.dc.html` (conteúdo e posição
  dos blocos; tema vem dos tokens). O canvas `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt` é privado e não foi
  aberto: as fontes `.dc.html` são a mesma tela.
- `docs/board/{ARCHITECTURE,CONTRACT,DECISIONS,ROADMAP,SCREENS}.md`, `docs/features/{orchestrator,pr-flow,
  execution-credentials}/`.

O que as telas pedem e a fatia 1 entrega:

| Bloco da tela | Fatia 1 |
|---|---|
| CycleStart: aviso "já existe um ciclo rodando, este entra na fila" | Sim |
| CycleStart: specs numeradas na ordem de escolha, aviso de spec em Rascunhos | Sim (Rascunhos não aparece na lista; só Tarefas prontas) |
| CycleStart: Até onde vai, Specs ao mesmo tempo (com aviso de runners), Se uma spec falhar | Sim |
| CycleStart: "Quando começar: hoje às 22:00" | Não, é `cycle-schedule`. A fatia 1 tem só "agora ou depois do ciclo atual" implícito pela fila |
| CycleStart: rodapé "Roda no seu runner X. As PRs abrem como rascunho; o merge é seu" | Sim, sem o nome do runner (texto fixo) |
| CycleRun: cabeçalho com status, opções, quem iniciou | Sim |
| CycleRun: Pausar depois da etapa atual | Não (fatia 2) |
| CycleRun: Parar o ciclo | Sim |
| CycleRun: contadores (PRs abertas, decisões, para revisar, tempo) | Sim |
| CycleRun: Andamento por spec × etapa | Sim |
| CycleRun: Decisões tomadas sem você, com a regra | Sim, sem o botão "Mudar" |
| CycleRun: Para revisar | Sim, sem "Concordo" e "Mudar a resposta" |
| CycleRun: Atividade | Sim (últimos eventos dos cards do ciclo) |
| CycleRun: Pendências de infraestrutura | Não (fatia 2) |
| CycleRun: Ciclos anteriores | Parcial: a página de lista mostra os ciclos com status |

### 2. Dados (Firestore)

#### 2.1 Coleção nova `cycle`

Singular, como as outras (`ARCHITECTURE.md` diz que o nome final sai da spec; a convenção do repo é singular,
`run.repository.ts:65` usa `"board"`, o mapper do `run` usa `RUN_TABLE`). Id automático. Recurso **de um
board**: toda leitura filtra por `boardId` depois do guard de papel.

| Campo | Tipo | Default | `null`? | Por quê |
|---|---|---|---|---|
| `boardId` | string | — | não | Escopo |
| `status` | `queued` \| `running` \| `finished` \| `stopped` | `queued` ou `running` na criação | não | Fila e fim |
| `endReason` | `completed` \| `stopped` \| `item_failed` | `null` | sim | Por que terminou: todas resolvidas, uma pessoa parou, ou `onFailure: stop` |
| `options` | `{ until, concurrency, onFailure }` | — | não | As três escolhas da tela |
| `items` | `CycleItem[]` (1 a 10, na ordem) | — | não | Ver abaixo |
| `startedBy` | `{ userId, login }` | — | não | Credencial das etapas e exibição |
| `stoppedBy` | `{ userId, login }` | `null` | sim | Quem parou |
| `startedAt` | Timestamp | `null` enquanto `queued` | sim | Tempo rodando |
| `finishedAt` | Timestamp | `null` | sim | |
| `createdAt`, `updatedAt`, `deletedAt` | do `BaseRepository` | | | Soft delete; nada apaga ciclo na fatia 1 |

`CycleItem`:

| Campo | Tipo | Por quê |
|---|---|---|
| `slug` | string | Card do board (`<boardId>__<slug>`, `card.mapper.ts` `cardIdFor`) |
| `cardId` | string | Evita recalcular |
| `title` | string | Cópia, para a lista do ciclo não ler o card |
| `status` | `pending` \| `running` \| `done` \| `waiting_input` \| `failed` \| `skipped` \| `stopped` | Andamento |
| `code` | string \| null | `error.code` quando o disparo da primeira etapa foi recusado (ex.: `CARD_NOT_READY`) |
| `startedAt`, `endedAt` | ISO \| null | Tempo por spec |

Limite de 10 itens: o documento fica pequeno e a transação de avanço lê um documento só. A política do
`/cycle` no terminal usa lote de 3 (`cycle-policy.md` §7), mas lá o motivo é custo de revisão humana numa
sessão; no board a pessoa escolhe a lista na hora. Fica como pergunta em aberto (Q3).

#### 2.2 Campos novos em documentos existentes

| Coleção | Campo | Tipo | Default/ausente | Por quê |
|---|---|---|---|---|
| `card` | `cycleId` | string \| null | ausente → `null` no mapper | Selo no quadro; a transação de fim de `run` sabe que o card está num ciclo |
| `run` | `cycleId` | string \| null | ausente → `null` | `--cycle` no disparo, recusa de `ask`, evento com `cycleId` |
| `cardEvent` | `cycleId` | string \| null | ausente → `null` | Atividade e decisões do ciclo numa consulta só |
| `cardEvent` (tipo `report`) | `decisions` | `StageDecision[]` | ausente → `[]` | Decisões estruturadas |
| `board` | `runningCycleId` | string \| null | ausente → `null` | Trava da fila: a transação de criação e a de fim lêem e gravam o documento do board, como `runsPumpedAt` (`run.repository.ts:388`); fica fora do `BoardDTO`, igual a `runsPumpedAt` |

Documentos antigos ficam válidos: todo campo novo é lido com `?? null` ou `?? []` no mapper. Sem backfill.

#### 2.3 Consultas

| Consulta | Filtros | Índice composto? |
|---|---|---|
| Ciclos do board (lista) | `boardId ==` e `deletedAt == null`; ordena por `createdAt` em memória | Não (só igualdade). Dezenas de ciclos por board |
| Próximo ciclo da fila | `boardId ==`, `status == "queued"`; menor `createdAt` em memória | Não |
| Ciclos ativos que já contêm um slug (criação) | `boardId ==`, `status in [queued, running]`, filtro do slug em memória | `in` com outra igualdade não exige composto |
| Eventos do ciclo (atividade e decisões) | `cycleId ==`, `deletedAt == null`; ordena em memória | Não (só igualdade, como `card-event.repository.ts:51-55`) |

O `BaseRepository` pagina só por `createdAt` desc; nenhuma consulta acima pagina. Volume esperado por ciclo:
10 specs × ~6 etapas × poucos eventos, na casa das centenas. Teto de leitura na rota de detalhe: 200 eventos,
mais recentes primeiro.

#### 2.4 Regras do Firestore

Sem mudança: o padrão é negar tudo ao cliente (`firestore.rules:32-34`) e a API usa o Admin SDK.

### 3. Contrato `@repo/kanban-contract` e `@repo/sdk`

#### 3.1 `kanban-contract`

- **`cycle.ts` (novo)**: `CYCLE_STATUSES`, `CYCLE_END_REASONS`, `CYCLE_ITEM_STATUSES`, `CYCLE_UNTIL`
  (`testing`, `pull_request`), `CYCLE_ON_FAILURE` (`skip`, `stop`), `MAX_CYCLE_SPECS = 10`,
  `createCycleInputSchema`, `DECISION_RULES`, `stageDecisionSchema`, `cycleHoldStageKey(config, until)`,
  `cycleItemResult(position)` e `advanceCycle(cycle, event)` (puro: aplica o fim de um item e escolhe os
  próximos).
- **`cardState.ts`**: `TransitionInput.cycle?: { holdStageKey: string | null }`. Com `cycle`, a aprovação
  (`optional` ou `required`) não segura o card, e o `success` na etapa `holdStageKey` deixa o card `idle` na
  mesma etapa.
- **`agentContract.ts`**: `completeStageInputSchema` ganha `decisions` opcional (até 20).
- **`run.ts`**: `RUN_TRIGGERS` ganha `cycle`; `StageDispatch.cycleId`, `ActiveRunView.cycleId`,
  `ExecutorReport.decisions?`.
- **`runner.ts`**: `RunnerJob.cycleId`.
- **`agentResults.ts`**: `AgentCardView.card.cycleId`.

#### 3.2 `@repo/sdk`

- `types/board/cycle.ts`: `CycleDTO`, `CycleItemDTO`, `CycleDecisionDTO`, `CycleActivityDTO`,
  `CycleDetailDTO`, `CreateCycleRequest`.
- `CardDTO.cycleId`, `RunDTO.cycleId`, `CardEventDTO.decisions`.
- `actions/boardCycle/action.ts` registrada em `client/index.ts` (ao lado de `boardCard`, `:7`/`:19`/`:33`).

Quem quebra: ninguém. Todos os campos são adições; o app passa a ler `card.cycleId` só no selo. Os testes que
montam `CardDTO` e `RunDTO` à mão (fixtures em `apps/app/__tests__` e `apps/api/__tests__/fakeCardRepository.ts`)
precisam do campo novo, o que o `typecheck` aponta.

### 4. API

#### 4.1 Rotas

| Método e path | Guard | O que faz | Resposta |
|---|---|---|---|
| `GET /boards/:id/cycles` | `requireBoardApi("view")` | Lista os ciclos do board, mais recentes primeiro | `200 { data: CycleDTO[] }` |
| `POST /boards/:id/cycles` | `requireBoardApi("trigger")` | Cria o ciclo (rodando ou na fila) | `201 { data: CycleDTO }` |
| `GET /boards/:id/cycles/:cycleId` | `requireBoardApi("view")` | Detalhe: ciclo, cards dos itens, decisões e atividade. Roda `tickSafely(board)` antes, como `cards/[slug]/route.ts:12` | `200 { data: CycleDetailDTO }` |
| `POST /boards/:id/cycles/:cycleId/stop` | `requireBoardApi("trigger")` | Para o ciclo e as execuções vivas dos itens | `200 { data: CycleDTO }` |

Escopo: `cycle.boardId !== ctx.board.id` → `404 CYCLE_NOT_FOUND`, nunca 403.

#### 4.2 Validação

`apps/api/(shared)/validation/cycle.schema.ts` com `parseCreateCycle` usando `createCycleInputSchema` do
contrato (regra 12, sem schema paralelo). Body por `parseRequestJson`.

Checagens de negócio na criação, nesta ordem:

1. Slugs únicos e de 1 a 10 (schema) → `400 VALIDATION_FAILED`.
2. Cada card existe, está em `tasks`, `ready`, sem `activeRunId` e sem `cycleId` → senão
   `422 CYCLE_SPECS_INVALID` (o primeiro slug ruim não vai na resposta; a tela já filtra a lista).
3. Nenhum slug está noutro ciclo `queued` ou `running` → `409 CYCLE_SPEC_BUSY`.
4. Quem cria tem executor para a primeira etapa: `chooseExecutorFor(profile.id, now,
   stageRunnersOf(config, firstStage))`, as mesmas recusas do disparo (`runs/route.ts:28-43`):
   `409 RUN_NO_CREDENTIAL_FOR_STAGE` ou `503 RUN_EXECUTOR_UNAVAILABLE`.
5. `concurrency: 2` exige dois runners online de quem cria (`runnerRepository.listByUser` +
   `isRunnerOnline`, `executor-choice.ts:15-18`), salvo no emulador com executor de teste →
   `409 CYCLE_RUNNERS_UNAVAILABLE`. Motivo: o runner pega um `run` por vez (`CONTRACT.md`, regras do runner) e
   o segundo `run` sem runner morre em 2 minutos com `no_runner` (`runner.ts:13-14`).

#### 4.3 Orquestrador do ciclo

Arquivo novo `apps/api/(shared)/lib/orchestrator/cycle.ts`, ao lado de `orchestrator.ts`. Funções:

- `createCycle(board, input, by, now)`: transação no documento do board. Se `runningCycleId` é `null`, grava o
  ciclo `running` e o id no board; senão grava `queued`. Depois chama `advance`.
- `advance(board, cycleId, now)`: transação no documento do ciclo que aplica `advanceCycle` do contrato e marca
  como `running` os itens escolhidos. Fora da transação, para cada item escolhido chama
  `triggerStage({ board, slug, stageKey: config.stages[0].key, by: cycle.startedBy, trigger: "cycle",
  cycleId })`. Disparo recusado vira item `failed` com `code` e o avanço roda de novo (no máximo uma vez por
  item, então o laço termina). Ciclo que chegou ao fim libera `runningCycleId` e chama
  `startNextQueued(board)`.
- `onCycleItemSettled(board, { cycleId, cardId, result })`: chamado por `completeRun` e `stopRun` quando o
  card saiu do ciclo; grava o resultado do item e chama `advance`.
- `stopCycle(board, cycleId, by, now)`: marca o ciclo `stopped` (`endReason: "stopped"`), itens `pending`
  viram `skipped`, e para as execuções vivas com `stopRun` (que já cancela no executor,
  `orchestrator.ts:284-287`). Libera o board e chama `startNextQueued`.

Regras do avanço (`advanceCycle`, puro e testado no contrato):

- Vagas = `concurrency` − itens `running`. Os próximos `pending` na ordem ocupam as vagas.
- Item `failed` com `onFailure: "stop"` → ciclo `stopped`, `endReason: "item_failed"`, `pending` →
  `skipped`. Os itens que ainda rodam terminam a etapa atual e saem do ciclo sem avançar (o card fica onde
  parou, `idle`), porque `planCompletion` lê o ciclo parado. Com `skip`, segue para o próximo.
- `waiting_input` (pergunta ou limite de retrabalho) e `stopped` (pessoa parou o card) não contam como falha:
  o ciclo segue com os outros, como a spec pede em "Riscos".
- Todos os itens fora de `pending` e `running` → `finished`, `endReason: "completed"`.

#### 4.4 Mudanças nas peças existentes

- **`decide.ts` `planTrigger`** (`:142-195`): aceita `cycleId?`. Com `trigger: "cycle"`, grava
  `cycleId` no card. Gatilho de pessoa (`drag`, `rerun`, `approve`, `answer`) grava `cycleId: null`: quem
  mexe à mão tira o card do ciclo.
- **`decide.ts` `newRunFor`** (`:107-131`): copia `cycleId` do card para o `run`.
- **`decide.ts` `planCompletion`** (`:297-394`): recebe `cycle: CycleRecord | null`. Ciclo `running` →
  passa `cycle: { holdStageKey }` para `resolveTransition`. Ciclo `stopped` ou `finished` com o card ainda
  ligado → o `success` não enfileira a etapa seguinte (o card fica `idle` na etapa em que terminou). O plano
  devolve também `cycleItem: CycleItemResult | null` e o card perde o `cycleId` quando `next === null`.
- **`run.repository.ts` `finishOnCard`** (`:208-289`): quando o card tem `cycleId`, lê o documento do ciclo
  na mesma transação e o passa ao `plan`. Devolve `cycle: { id, result } | null` para o chamador.
- **`run.repository.ts` `stopOnCard`** (`:292-353`): grava `cycleId: null` no card e devolve o `cycleId` que
  ele tinha.
- **`orchestrator.ts` `completeRun`** (`:105-149`) e **`stopRun`** (`:269-293`): depois da transação, se
  veio ciclo, chamam `onCycleItemSettled`.
- **`orchestrator.ts` `triggerStage`** (`:61-98`): repassa `cycleId`.
- **`orchestrator.ts` `toActiveRunView`** (`:408-415`) e **`decide.ts` `toStageDispatch`** (`:467-489`):
  `cycleId`.
- **`runner-job.ts` `toRunnerJob`**: `cycleId`.
- **`agent-tools.ts`**: `ask` num `run` com `cycleId` → `409 AGENT_ASK_IN_CYCLE` antes de gravar.
  `recordEvent` grava `cycleId` do `run` no evento. `complete_stage` grava `decisions` no evento `report`.
- **`card-events.ts` `agentEventFromTool`** (`:104-113`): `report` leva `decisions` (padrão `[]`).
- **`agent-card-view.ts`**: `card.cycleId`.
- **`fake-executor.ts`**: num `run` de ciclo com `success`, o relatório leva uma decisão técnica de exemplo e,
  na etapa de análise, uma de produto, para o `/test` ver os dois blocos da tela sem o `claude` real.
- **`runner/runs/[runId]/finish/route.ts`**: quando o `run` é de ciclo e `exit` é `deadline`, chama
  `tickSafely(board)` depois de gravar. O prazo é fechado pelo board (`apps/runner/src/report.ts:13-15`) e
  hoje só roda na leitura do quadro (`PRE-PRODUCTION.md`, "Tempo limite de etapa sem ninguém olhando o
  board"); sem isso, um ciclo noturno travaria no primeiro prazo estourado até alguém abrir o board.

#### 4.5 Erros novos

| `error.code` | Status | Quando |
|---|---|---|
| `CYCLE_NOT_FOUND` | 404 | Ciclo inexistente, apagado ou de outro board |
| `CYCLE_SPECS_INVALID` | 422 | Algum card não existe, não está em Tarefas, não está pronto ou já roda |
| `CYCLE_SPEC_BUSY` | 409 | Algum card já está noutro ciclo na fila ou rodando |
| `CYCLE_RUNNERS_UNAVAILABLE` | 409 | `concurrency: 2` sem dois runners online |
| `CYCLE_NOT_ACTIVE` | 409 | Parar um ciclo `finished` ou `stopped` |
| `AGENT_ASK_IN_CYCLE` | 409 | Agente chamou `ask` num `run` de ciclo |

Todos entram em `apiErrors` (`translations/packages/shared/utils.ts`); `apiErrorCodesTranslated.test.ts`
cobra.

### 5. Front (`apps/app`)

#### 5.1 Rotas

Sob `boards/(pages)/[id]/`:

| Rota | Arquivos | Conteúdo |
|---|---|---|
| `/boards/:id/cycles` | `cycles/page.tsx`, `cycles/BoardCyclesClient.tsx`, `cycles/loading.tsx` | `Table` com os ciclos (início, specs, status, quem iniciou) e o botão "Novo ciclo" (só com `trigger`) |
| `/boards/:id/cycles/new` | `cycles/new/page.tsx`, `cycles/new/NewCycleClient.tsx` | Escolha das specs e das opções |
| `/boards/:id/cycles/:cycleId` | `cycles/[cycleId]/page.tsx`, `CycleDetailClient.tsx`, `loading.tsx` | Tela Ciclo |

`BoardSectionNav.tsx:5,13-18` ganha `cycles` entre `board` e `members`, na ordem do desenho. Prefetch RSC com
`getServerApiClient()` e a mesma `queryKey`, como as páginas de membros e credenciais.

#### 5.2 Dados

- `queryKeys.boards.cycles(id)` e `queryKeys.boards.cycle(id, cycleId)` em `shared/lib/queryKeys.ts`.
- `useListBoardCycles` + `fetchBoardCycleList`; `useFindBoardCycleById` + `findBoardCycleById` com
  `refetchInterval` de 5 s enquanto o ciclo está `running` ou `queued`, como `useListBoardCards.tsx:21`.
- `useBoardCycleCrud`: `create` (invalida `cycles` e `cards`, navega para o detalhe) e `stop` (invalida o
  detalhe, a lista e `cards`). Erros por `handleClientError(new FormattedError(...))`.
- Novo ciclo lê os cards com o `useListBoardCards` que já existe e filtra `lane === "tasks" && ready &&
  activeRunId === null && cycleId === null`; os runners com `useListRunners` (aviso de "Até 2").

#### 5.3 Formulário Novo ciclo

Schema `(validations)/newCycleSchema.ts` como factory `buildNewCycleFormSchema(dictionary)`.

| Campo | Componente | Regra |
|---|---|---|
| `slugs` (ordem de escolha) | lista de `Toggle`/botão por card, com o número da posição (componente local `CycleSpecPicker`, como na tela) | 1 a 10 |
| `until` | `HookFormRadioGroup` | `testing` \| `pull_request`, padrão `pull_request` |
| `concurrency` | `HookFormRadioGroup` | `1` \| `2`, padrão `1`; aviso quando há menos de dois runners online |
| `onFailure` | `HookFormRadioGroup` | `skip` \| `stop`, padrão `skip` |

Aviso no topo quando há ciclo `running` ("Este entra na fila"). `Footer` dentro do `<form>`, botão
"Iniciar ciclo com N specs" bloqueado com `isPending`.

#### 5.4 Tela Ciclo

Componentes em `boards/(components)/`: `CycleSummary` (cabeçalho, contadores, botão Parar com
`StopCycleDialog`), `CycleProgressTable` (spec × etapa; a célula vem do card: etapas antes da atual "feita",
a atual com o estado, a de PR com o número da PR), `CycleDecisions` (decisões com a regra e o card/etapa),
`CycleReviewList` (as de `product: true`), `CycleActivity`. Funções puras: `cycleProgress.ts` (monta a
matriz) e `cycleCounters.ts` (contadores).

Selo: `BoardCardItem.tsx` mostra "Ciclo" quando `card.cycleId !== null`, ao lado de `CardStateBadge`.

Estados: loading (skeleton), ciclo na fila (cabeçalho e lista de specs, sem andamento), sem decisões ("Nenhuma
decisão registrada ainda"), erro de carga (`Container` com `loadError`), ciclo de outro board (404 → not
found).

### 6. i18n (pt-br)

```
apps.app.pages.common.boards
  nav.cycles                       "Ciclos"
  board.card.cycleBadge            "Ciclo"
  cycles
    list   { title, newCycle, empty, columns { startedAt, specs, status, startedBy } }
    status { queued, running, finished, stopped }
    endReason { completed, stopped, item_failed }
    itemStatus { pending, running, done, waiting_input, failed, skipped, stopped }
    new
      title, description, queuedNotice, viewCurrent
      specs { title, hint, empty }
      until { label, testing, pull_request }
      concurrency { label, one, two, runnersWarning }
      onFailure { label, skip, stop }
      footer, submit (com {count})
      validation { specsRequired, specsMax }
    detail
      summary (com {count}, {concurrency}, {until}, {login})
      counters { pullRequests, decisions, review, elapsed }
      stop { button, title, description, confirm }
      progress { title, spec, done, waiting }
      decisions { title, description, empty, rule { policy, spec, repo_pattern, least_impact } }
      review { title, description }
      activity { title, empty }
```

`apiErrors`: os seis códigos de §4.5.

### 7. Autorização e segurança

- Criar e parar exigem `trigger` na API (`requireBoardApi("trigger")`); a tela só esconde os botões.
- `startedBy` vem de `ctx.profile` e `ctx.member.login`, nunca do body. O body só traz slugs e opções,
  validados pelo schema do contrato.
- As etapas rodam com a credencial de quem iniciou. Um operator não consegue rodar etapa no runner de outra
  pessoa: o runner só pega `run` de quem o registrou (`CONTRACT.md`, regras do runner).
- Recusa de `ask` no servidor: a regra do kit tem espelho na API (regra de ouro 4).
- `decisions` são dado do agente, exibidas como texto (sem markdown renderizado, limite de 500 caracteres por
  decisão). Conteúdo de card continua sendo dado (regra 16): o disparo leva só `cycleId`, um id.
- Nenhum segredo novo.

### 8. Testes

| Nível | Arquivo | O que prova |
|---|---|---|
| Unit (contrato) | `packages/kanban-contract/src/__tests__/cycle.test.ts` | `createCycleInputSchema` (vazio, 11 slugs, duplicado, opções inválidas); `cycleHoldStageKey` com e sem etapa de PR; `advanceCycle`: vagas com 1 e 2, `skip` × `stop`, `waiting_input` e `stopped` não param, fim com `completed` |
| Unit (contrato) | `cardState.test.ts` (existente) | Com `cycle`: `optional` e `required` não seguram; `success` em `holdStageKey` fica `idle` na mesma etapa; `needs_rework` no limite vira `waiting_input` igual a fora do ciclo |
| Unit (contrato) | `agentContract.test.ts` (existente) | `decisions` opcional, regra fora da lista recusada, 21 decisões recusadas |
| Unit (API) | `orchestratorDecide.test.ts` (existente) | `planTrigger` grava/limpa `cycleId`; `planCompletion` com ciclo rodando, parado e sem ciclo; `cycleItem` em cada desfecho |
| Unit (API) | `cycleMapper.test.ts` | Timestamps para ISO, `items` com campos ausentes, whitelist |
| Unit (API) | `cardEvents.test.ts`, `cardMapper.test.ts`, `runMapper.test.ts` (existentes) | `decisions` padrão `[]`; `cycleId` ausente vira `null` |
| Rota (API) | `boardCyclesRoutes.test.ts` | Com `vi.mock` do guard e dos repositórios: 201 rodando e na fila; cada código de §4.5; viewer recebe 403 do guard; ciclo de outro board 404; parar ciclo terminado 409 |
| Rota (API) | `agentToolsRoutes.test.ts` (existente) | `ask` em `run` de ciclo → `409 AGENT_ASK_IN_CYCLE`; `complete_stage` com `decisions` grava no evento |
| Unit (runner) | `apps/runner` teste de `buildPrompt` | `--cycle <id>` só quando há ciclo |
| Emulador | `orchestratorRuns.emulator.test.ts` (existente, um caso novo) | Duas specs, `concurrency: 1`, executor de teste: a segunda só começa quando a primeira termina e o ciclo fecha `finished`. Prova o que o unitário não prova: as duas transações (fim de `run` lendo o ciclo, avanço no documento do ciclo) contra o Firestore real, sem corrida entre elas |
| Hook (app) | `useBoardCycleCrud.test.tsx` | Invalidações de `create` e `stop`, erro via `errorAlert` |
| Unit (app) | `cycleProgress.test.ts`, `newCycleSchema.test.ts` | Matriz spec × etapa; mensagens do Zod vindas do dicionário |

### 9. O que o `/test` vai percorrer

Ambiente: emulador + seed + `pnpm dev`, executor de teste (fake). Board do seed com pelo menos três cards
prontos em Tarefas.

1. **Novo ciclo com três specs** (`until: pull_request`, `concurrency: 1`, `onFailure: skip`): a ordem de
   escolha aparece numerada; o ciclo abre `running`; o quadro mostra o selo "Ciclo" nos três cards; a análise
   não para para aprovação mesmo com `approvalGate` ligado na etapa `analyze` (ligar antes em Configuração).
   Fim esperado: três cards em Aguardando PR, `idle`, com PR aberta pelo GitHub falso; ciclo `finished`.
2. **Decisões**: a tela lista as decisões do executor de teste com a regra, e a de produto aparece em "Para
   revisar".
3. **Falha com `skip` e com `stop`**: roteirizar `failed` na primeira spec
   (`pnpm --filter api fake-executor script <boardId> <slug> failed`). Com `skip`, a segunda começa; com
   `stop`, o ciclo fecha `stopped` e as restantes ficam "pulada".
4. **Ciclo na fila**: com um ciclo rodando, criar outro; a tela de Novo ciclo avisa, o novo aparece `queued`
   e começa quando o primeiro termina.
5. **Parar o ciclo** no meio de uma etapa: a execução viva para, o card fica `idle` sem selo, as pendentes
   ficam "pulada".
6. **`until: testing`**: o card termina em Testando, `idle`, sem PR.
7. **Validações**: viewer não vê "Novo ciclo" e recebe 403 ao chamar a rota; card já num ciclo some da lista;
   `concurrency: 2` com um runner mostra o aviso (no emulador o executor de teste dispensa a checagem; o
   aviso aparece com `useListRunners` vazio).
8. **Temas e viewport**: Novo ciclo e Ciclo em light, dark e mobile (390 px), sem rolagem horizontal na
   tabela de andamento (a tabela rola dentro do próprio contêiner).

Não observável sem infra externa (vira 🔒): o `--cycle` chegando ao `claude -p` real no runner local, e um
agente real deixando de chamar `ask`. O unitário de `buildPrompt` e a recusa da API cobrem o lado do board.

---

## Etapa 2: blueprint técnico

### 10.1 Contrato

```ts
// packages/kanban-contract/src/cycle.ts
export const MAX_CYCLE_SPECS = 10;
export const MAX_STAGE_DECISIONS = 20;
const MAX_DECISION_TEXT = 500;

export const CYCLE_STATUSES = ["queued", "running", "finished", "stopped"] as const;
export const CYCLE_END_REASONS = ["completed", "stopped", "item_failed"] as const;
export const CYCLE_ITEM_STATUSES = [
    "pending", "running", "done", "waiting_input", "failed", "skipped", "stopped",
] as const;
export const CYCLE_UNTIL = ["testing", "pull_request"] as const;
export const CYCLE_ON_FAILURE = ["skip", "stop"] as const;
export const DECISION_RULES = ["policy", "spec", "repo_pattern", "least_impact"] as const;

export const cycleOptionsSchema = z.object({
    until: z.enum(CYCLE_UNTIL),
    concurrency: z.union([z.literal(1), z.literal(2)]),
    onFailure: z.enum(CYCLE_ON_FAILURE),
});

export const createCycleInputSchema = z.object({
    slugs: z.array(z.string().regex(SLUG)).min(1).max(MAX_CYCLE_SPECS)
        .refine((slugs) => new Set(slugs).size === slugs.length),
    options: cycleOptionsSchema,
});

export const stageDecisionSchema = z.object({
    decision: z.string().trim().min(1).max(MAX_DECISION_TEXT),
    rule: z.enum(DECISION_RULES),
    product: z.boolean(),
});

/** The stage where the card stops inside a cycle; `null` lets it run to the pull request stage. */
export function cycleHoldStageKey(config: BoardConfig, until: CycleUntil): string | null;

/** What a stage result means for the cycle item: still running, or out of the cycle and why. */
export function cycleItemResult(position: CardPosition, next: boolean): CycleItemResult;

/** Records an item's result and picks the items to start now. Pure: the caller writes it. */
export function advanceCycle(cycle: CycleState, event: CycleEvent | null): {
    cycle: CycleState;
    start: string[];          // slugs to trigger
    ended: boolean;
};
```

`cycleHoldStageKey`: `testing` → a etapa antes da etapa de PR (`findPullRequestStage`, `boardConfig.ts:225`);
sem etapa de PR, a última etapa. `pull_request` → `null`.

```ts
// cardState.ts
export type TransitionInput = {
    config: BoardConfig;
    current: CardPosition & { stageKey: string };
    outcome: StageOutcome;
    approvalGateEnabled: boolean;
    cycle?: { holdStageKey: string | null };
};
```

Pseudo-diff de `resolveTransition`:

```diff
+    if (input.cycle && stage.key === input.cycle.holdStageKey) {
+        return { ...current, state: "idle" };
+    }
     if (stage.pullRequest !== undefined) {
         return { ...current, state: "idle" };
     }
     ...
-        state: requiresApproval(stage, approvalGateEnabled) ? "idle" : "queued",
+        state: !input.cycle && requiresApproval(stage, approvalGateEnabled) ? "idle" : "queued",
```

(O bloco novo vem depois dos ramos `needs_input`, `failed` e `needs_rework`.)

```diff
// agentContract.ts
 export const completeStageInputSchema = z.object({
     ...stageRef,
     outcome: z.enum(STAGE_OUTCOMES),
     summary: z.string().min(1).max(MAX_MARKDOWN),
+    decisions: z.array(stageDecisionSchema).max(MAX_STAGE_DECISIONS).optional(),
 });
```

`stageDecisionSchema` mora em `agentContract.ts` (é payload de ferramenta) e `cycle.ts` o importa, para não
criar ciclo de import com `cardState.ts`.

### 10.2 SDK

```ts
// packages/sdk/src/types/board/cycle.ts
export type CycleOptionsDTO = { until: CycleUntil; concurrency: 1 | 2; onFailure: CycleOnFailure };

export type CycleItemDTO = {
    slug: string; title: string; status: CycleItemStatus;
    code: string | null; startedAt: string | null; endedAt: string | null;
};

export type CycleDTO = {
    id: string; boardId: string; status: CycleStatus; endReason: CycleEndReason | null;
    options: CycleOptionsDTO; items: CycleItemDTO[];
    startedByLogin: string; stoppedByLogin: string | null;
    startedAt: string | null; finishedAt: string | null; createdAt: string; updatedAt: string;
};

export type CycleDecisionDTO = StageDecision & {
    eventId: string; slug: string; stageKey: string; at: string;
};

export type CycleActivityDTO = {
    eventId: string; slug: string; stageKey: string; type: "update" | "report";
    markdown: string; at: string;
};

export type CycleDetailDTO = {
    cycle: CycleDTO;
    cards: CardDTO[];                 // os cards dos itens, na ordem do ciclo
    decisions: CycleDecisionDTO[];    // mais recentes primeiro
    activity: CycleActivityDTO[];     // até 10
};

export type CreateCycleRequest = { slugs: string[]; options: CycleOptionsDTO };
```

```ts
// packages/sdk/src/actions/boardCycle/action.ts
list(boardId: string): Promise<CycleDTO[]>                       // GET  /boards/:id/cycles
findById(boardId: string, cycleId: string): Promise<CycleDetailDTO> // GET /boards/:id/cycles/:cycleId
create(boardId: string, body: CreateCycleRequest): Promise<CycleDTO> // POST /boards/:id/cycles
stop(boardId: string, cycleId: string): Promise<CycleDTO>        // POST /boards/:id/cycles/:cycleId/stop
```

`CardDTO` ganha `cycleId: string | null`; `RunDTO` ganha `cycleId: string | null`; `CardEventDTO` ganha
`decisions: StageDecision[]`.

### 10.3 Rotas

```ts
// apps/api/app/(routes)/boards/[id]/cycles/route.ts
export const GET = requireBoardApi("view", async (_req, ctx) => {
    const cycles = await cycleRepository.listByBoard(ctx.board.id);
    return Response.json({ data: cycles.map(toCycleDTO) });
});

export const POST = requireBoardApi("trigger", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const parsed = parseCreateCycle(body.value);
    if (!parsed.ok) return parsed.response;
    const result = await createCycle({
        board: ctx.board,
        input: parsed.value,
        by: { userId: ctx.profile.id, login: ctx.member.login },
        now: new Date(),
    });
    if (!result.ok) return errorResponse(result.code, result.status);
    return Response.json({ data: toCycleDTO(result.cycle) }, { status: HTTP_STATUS.CREATED });
});
```

Exemplo de pedido:

```json
{ "slugs": ["board-search", "card-labels", "theme-presets"],
  "options": { "until": "pull_request", "concurrency": 1, "onFailure": "skip" } }
```

Resposta `201`:

```json
{ "data": {
  "id": "Xc81…", "boardId": "b1", "status": "running", "endReason": null,
  "options": { "until": "pull_request", "concurrency": 1, "onFailure": "skip" },
  "items": [
    { "slug": "board-search", "title": "Busca por texto nos cards", "status": "running", "code": null,
      "startedAt": "2026-11-27T22:00:01.000Z", "endedAt": null },
    { "slug": "card-labels", "title": "Etiquetas no card", "status": "pending", "code": null,
      "startedAt": null, "endedAt": null },
    { "slug": "theme-presets", "title": "Temas prontos", "status": "pending", "code": null,
      "startedAt": null, "endedAt": null }
  ],
  "startedByLogin": "octocat", "stoppedByLogin": null,
  "startedAt": "2026-11-27T22:00:01.000Z", "finishedAt": null,
  "createdAt": "2026-11-27T22:00:00.000Z", "updatedAt": "2026-11-27T22:00:01.000Z"
} }
```

`complete_stage` com decisões:

```json
{ "cardId": "b1__board-search", "stage": "analyze", "outcome": "success",
  "summary": "### Análise — plano pronto\n…",
  "decisions": [
    { "decision": "Busca no cliente sobre a lista já carregada, sem índice novo.", "rule": "least_impact", "product": false },
    { "decision": "Busca só pelo título, não pelo corpo da spec.", "rule": "spec", "product": true }
  ] }
```

| `error.code` | Status |
|---|---|
| `VALIDATION_FAILED` | 400 / 413 |
| `CYCLE_SPECS_INVALID` | 422 |
| `CYCLE_SPEC_BUSY` | 409 |
| `CYCLE_RUNNERS_UNAVAILABLE` | 409 |
| `RUN_NO_CREDENTIAL_FOR_STAGE` | 409 |
| `RUN_EXECUTOR_UNAVAILABLE` | 503 |
| `CYCLE_NOT_FOUND` | 404 |
| `CYCLE_NOT_ACTIVE` | 409 |
| `AGENT_ASK_IN_CYCLE` | 409 |

### 10.4 Persistência

```
cycle/{autoId}
  boardId: "b1"
  status: "running"
  endReason: null
  options: { until: "pull_request", concurrency: 1, onFailure: "skip" }
  items: [ { slug, cardId, title, status, code, startedAt, endedAt }, … ]
  startedBy: { userId: "u1", login: "octocat" }
  stoppedBy: null
  startedAt: Timestamp, finishedAt: null
  createdAt, updatedAt: Timestamp, deletedAt: null
```

Repositório `cycle.repository.ts` (`super(db, CYCLE_TABLE, cycleMapper)`):

- `listByBoard(boardId)`, `listQueued(boardId)`, `listActiveSlugs(boardId)`.
- `createOnBoard({ board, cycle, now })`: transação no documento do board (`runningCycleId`).
- `applyAdvance(cycleId, decide)`: transação no documento do ciclo; `decide` é o `advanceCycle` do contrato.
- `finish(cycleId, boardId, endReason, by?, now)`: transação que fecha o ciclo e limpa `runningCycleId` se for
  ele.

Mapper `cycle.mapper.ts`: `normalizeFirestoreInstant` nas datas de topo e nos `startedAt`/`endedAt` de cada
item; `toPersistence` com whitelist; `toCycleDTO` troca `startedBy` por `startedByLogin`.

`card-event.repository.ts` ganha `listByCycle(cycleId, limit)`.

### 10.5 Front, árvore de arquivos

```
apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/
  (pages)/[id]/cycles/
    page.tsx · BoardCyclesClient.tsx · loading.tsx
    new/page.tsx · new/NewCycleClient.tsx
    [cycleId]/page.tsx · [cycleId]/CycleDetailClient.tsx · [cycleId]/loading.tsx
  (components)/
    CycleSpecPicker.tsx · CycleSummary.tsx · StopCycleDialog.tsx
    CycleProgressTable.tsx · CycleDecisions.tsx · CycleReviewList.tsx · CycleActivity.tsx
    cycleProgress.ts · cycleCounters.ts
    BoardSectionNav.tsx (cycles) · BoardCardItem.tsx (selo)
  (hooks)/
    useListBoardCycles.tsx · useFindBoardCycleById.tsx · useBoardCycleCrud.tsx
  (validations)/
    newCycleSchema.ts
apps/app/shared/lib/queryKeys.ts (cycles, cycle)
```

### 10.6 Kit e regra do modo board

Seção nova em `kit/.claude/rules/board-mode.md` e na cópia deste repositório (`.claude/rules/board-mode.md`,
hoje idêntica):

```markdown
## 2.1 Dentro de um ciclo (`--cycle <ciclo-id>`)

O disparo traz `--cycle <id>` (e `get_card` traz `card.cycleId`) quando a etapa roda dentro de um ciclo. Aí
ninguém vai responder antes de o ciclo terminar:

- **Nunca** chame `ask`: a API recusa com `AGENT_ASK_IN_CYCLE`.
- Decida tudo pela escada `.claude/cycle-policy.md` → recomendação da spec → padrão do repositório → menor
  impacto, e registre cada decisão em `complete_stage.decisions` com a regra usada.
- O que no modo board normal viraria pergunta (produto, escopo, nome visível) vai com `product: true`.
- `needs_input` só quando a etapa não tem como seguir nem com a recomendação; a spec sai do ciclo e espera você.
- Remova `--cycle <id>` de `$ARGUMENTS` junto com `--board`.
```

Cada `kit/commands/*.md` ganha uma linha no bloco "Modo board": "Com `--cycle`, siga a §2.1 da regra: sem
`ask`, decisões em `complete_stage.decisions`."

### 10.7 Ordem de implementação e commits

1. `feat(kanban-contract): add cycle types, decisions in complete_stage and the cycle transition` (com testes)
2. `feat(sdk): add the board cycle actions and cycle fields on card, run and events`
3. `feat(api): store cycles and the cycle id on cards, runs and events` (mappers, repositório, testes de
   mapper)
4. `feat(api): run cycles in the orchestrator` (`cycle.ts`, `decide.ts`, `run.repository.ts`, emulador)
5. `feat(api): add the cycle routes` (rotas + schema + testes de rota)
6. `feat(api): refuse ask and store decisions in cycle runs` (`agent-tools.ts`, `card-events.ts`,
   `agent-card-view.ts`, fake executor)
7. `feat(api): tick the board when a cycle run hits its deadline` (finish do runner)
8. `feat(runner): pass the cycle to the agent session`
9. `feat(app): add the cycle data hooks`
10. `feat(app): add the new cycle page`
11. `feat(app): add the cycle page and the cycle badge on cards`
12. `feat(internationalization): add cycle copy and error codes`
13. `feat(claude): add the cycle variant of board mode to the kit and this board`
14. `docs: describe cycles in the board architecture and the agent contract`
15. `docs(features): cycle-runs`

### 10.8 Env e configuração

Nenhuma env nova. Nenhum índice novo. O repositório importado não precisa mudar o `board.yml`; precisa da
seção nova da regra do modo board (kit) para o agente saber decidir sem `ask`. Sem ela, o agente que chamar
`ask` recebe `409` e tende a fechar com `failed` ou `needs_input`, e o ciclo segue com as outras specs.

### 10.9 Pré-requisitos manuais e modo degradado

| Pendência | Bloqueia a entrega? | Modo degradado |
|---|---|---|
| Kit aplicado no repositório importado (regra com §2.1) | Não | Agente sem a regra cai na recusa de `ask`; a spec sai do ciclo como falha ou aguardando você |
| Agendador para prazos sem ninguém olhando | Não | Com o runner local, o `finish` com `deadline` faz o tick (§4.4). Sem runner nenhum, `run` não pego fica `queued` até alguém abrir o board ou o ciclo, como hoje (`PRE-PRODUCTION.md`, item do `orchestrator`) |
| Dois runners para `concurrency: 2` | Não | A API recusa com `CYCLE_RUNNERS_UNAVAILABLE`; `concurrency: 1` funciona com um runner |

Nenhuma entrada nova em `docs/PRE-PRODUCTION.md`; o item "Tempo limite de etapa sem ninguém olhando o board"
ganha uma linha dizendo que o ciclo com runner local não depende mais dele para prazos.

---

## Riscos

- **Corrida entre o fim de `run` e o avanço.** São duas transações (card/run e ciclo). Se o processo cair
  entre elas, o card sai do ciclo e o item fica `running` no documento do ciclo. Mitigação na fatia 1: a
  leitura do detalhe do ciclo reconcilia item `running` cujo card não tem mais `cycleId` nem `run` vivo,
  aplicando o resultado pelo `lastRun` do card. Caso coberto no teste de `advanceCycle`.
- **Spec dependente no mesmo ciclo**: a segunda sai da base sem o código da primeira. Sem aviso na fatia 1
  (fatia 2). A ordem de escolha é a ordem de execução, então escolher na ordem do backlog reduz o problema.
- **Decisão errada no começo contamina as etapas seguintes.** A tela mostra a regra de cada decisão; mudar a
  decisão fica para a fatia 2.
- **Custo**: um ciclo de três specs são ~18 execuções do `claude` na conta de quem iniciou. O board não mostra
  custo (`DECISIONS.md`, "Custos no board").

---

## Perguntas em aberto

Rodada autônoma: cada item abaixo já foi adotado pela recomendação. Revisar de manhã.

| # | Decisão | Adotado | Alternativa descartada | Regra |
|---|---|---|---|---|
| Q1 | Escopo desta rodada (esforço G) | Fatia 1: motor, fila, parar, decisões, telas em leitura. Pausar, "Mudar", "Concordo", pendências de infra e aviso de dependência na fatia 2 | Entregar o corte inteiro de uma vez | Instrução da rodada (duas entregas) + menor impacto |
| Q2 | Agente chama `ask` dentro do ciclo | API recusa com `409 AGENT_ASK_IN_CYCLE` | Aceitar e tirar a spec do ciclo como "aguardando você" | Regra de ouro 4 (espelhar na API) |
| Q3 | Máximo de specs por ciclo | 10 | 3, como o `/cycle` do terminal (`cycle-policy.md` §7) | Menor impacto (documento pequeno, uma transação) |
| Q4 | "Até Testando" | Card fica `idle` em Testando, sem PR; a pessoa arrasta para a PR depois | Card ir para Aguardando PR `idle` sem abrir a PR | Spec ("até onde vai") + menor impacto |
| Q5 | Pessoa mexe num card do ciclo (arrastar, rodar de novo, parar) | O card sai do ciclo; o ciclo segue com as outras | Recusar a ação enquanto o card está no ciclo | Menor impacto; não tira controle da pessoa |
| Q6 | `onFailure: stop` com outra spec rodando | A que roda termina a etapa atual e para ali; nada novo começa | Parar a execução viva na hora | Spec ("pausar depois da etapa atual" é o padrão de interrupção suave) |
| Q7 | `concurrency: 2` | Exige dois runners online na criação (fora do emulador) | Aceitar e deixar o segundo `run` morrer com `no_runner` | Spec ("até duas com dois runners livres") |
| Q8 | Aprovação `required` no `board.yml` dentro do ciclo | Também é pulada | Respeitar `required` e parar o ciclo ali | Spec ("dentro do ciclo a aprovação do plano é pulada") |
| Q9 | Nome da coleção | `cycle` (singular) | `cycles`, como está em `ARCHITECTURE.md` | Padrão do repo (todas as coleções no singular) |
| Q10 | Spec em `proposed` | Analisada nesta rodada a pedido do usuário; status não muda | Parar a rodada até a aprovação | Instrução do usuário; aprovar é dele (`cycle-policy.md` §1) |
| Q11 | O que conta como decisão de produto | O que o modo board hoje mandaria como `ask` (`board-mode.md` §2) | Lista fechada de categorias | Recomendação da spec |
| Q12 | Prazo de etapa sem ninguém olhando | Tick no `finish` do runner quando o `run` é de ciclo e `exit: deadline` | Agendador pago (Vercel Pro, Blaze) | `cycle-policy.md` §2 (sem serviço pago) |

## Referências não lidas

- Canvas do Claude Design (`claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt`): privado. As telas foram lidas pelas
  fontes `docs/design/screens/CycleStart.dc.html` e `CycleRun.dc.html`, que o `SCREENS.md` dá como a mesma
  tela.
