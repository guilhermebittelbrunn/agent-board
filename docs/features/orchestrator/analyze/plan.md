# Plano: orquestrador de etapas (estados, fila e transições)

Spec de origem: [`specs/features/orchestrator.md`](../../../../specs/features/orchestrator.md), status `proposed`
quando o `/cycle` a executou (o usuário pediu o máximo de tarefas nesta branch; a spec não foi aprovada por
ele). Depende de `card-timeline`, que está sendo implementada ao mesmo tempo a partir de
`docs/features/card-timeline/analyze/plan.md`. Este plano parte do working tree de 2026-11-26 (tarefas 1 a 6
implementadas, sem commit) e do que o plano da `card-timeline` promete. Onde a implementação dela mudar um nome
(`appendAgentEvent`, `agentEventFromTool`, `pendingAsk`, rota de resposta), o `/develop` segue o código real e
registra o desvio no handoff.

## Etapa 1: análise

### 1. Contexto

Hoje mover um card para uma coluna de etapa só muda onde ele está. A rota
`POST /boards/[id]/cards/[slug]/move` grava `lane` e `stageKey` e nunca toca em `state`
(`apps/api/app/(routes)/boards/[id]/cards/[slug]/move/route.ts:15`, `card.repository.ts:94`, comentário
"its execution state is the orchestrator's"). Todo card nasce `idle` e continua `idle`. A regra de transição
existe e tem testes (`packages/kanban-contract/src/cardState.ts:51`), mas ninguém a chama.

Esta spec liga as pontas: arrastar para uma etapa cria uma execução (`run`), um executor recebe o trabalho, o
resultado (`complete_stage`) passa por `resolveTransition` e o card anda sozinho, volta para Executando no
retrabalho ou para esperando alguém.

**Valor para o usuário:** quem opera o board arrasta uma vez e acompanha o card percorrer as etapas, com um
ponto único decidindo para onde ele vai. Os botões do card resolvem os casos de exceção (rodar de novo, parar,
aprovar).

**Corte de MVP** (o da spec, sem mudança):

1. Arrastar para uma coluna de etapa, por quem pode disparar, cria um `run` `queued` com quem disparou, etapa,
   modelo e esforço da coluna e a branch do card (`resolveBranchName`).
2. No máximo um `run` ativo por card; arrastar durante a execução é recusado com motivo.
3. Limite WIP por coluna, opcional no board: o excedente fica `queued`.
4. Ao receber `complete_stage`, aplica `resolveTransition` e enfileira a próxima etapa quando for o caso.
5. Responder a pergunta redispara a mesma etapa.
6. `run` sem `complete_stage` até o tempo limite vira `failed`.
7. Botões no card: "Rodar de novo", "Parar" e, com aprovação ligada, "Aprovar e seguir".
8. Interface de executor (adapter) com uma implementação falsa para testes.

A pergunta em aberto da spec ("cron da Vercel ou Cloud Functions?") tem resposta aqui: nenhum dos dois no MVP.
Ver 4.6 e a seção de infra.

**Fora de escopo:**

- Executores reais: `local-runner` (pull pelo runner) e `cloud-routines-runner` (spec).
- Token de execução, rotas HTTP e servidor MCP das ferramentas: `agent-contract`.
- Credencial de quem dispara e a escolha "Onde roda" do diálogo (`TriggerStage.png`): `execution-credentials`
  e `local-runner`. O diálogo do MVP não mostra o bloco "Roda com a sua credencial" nem as abas
  Runner local/Nuvem.
- Ciclos e agenda (`cycle-runs`, `cycle-schedule`), selo "Ciclo · 2 de 3", "Próxima do ciclo".
- Barra de progresso por turno ("turno 48 de 200") e "Ver log" (`Main.png`): dependem do runner transmitir turnos.
- Interruptor "Não pedir confirmação ao arrastar neste board" (`TriggerStage.png`): não está no corte (pergunta 6).
- Aba Execuções do detalhe e cabeçalho "Disparada por … · runner · turnos · min" de cada grupo da linha do tempo
  (`CardDetail.png`): `card-timeline` deixou para cá, mas o corte da spec não pede tela de histórico de `run`.
  Fica fora (pergunta 7). O card mostra o último `run` (motivo da falha, quem parou).
- Folha "Mover card" do celular redesenhada (`MMove.png`): o menu "⋯" da `card-backlog` continua e abre o mesmo
  diálogo de disparo (pergunta 5).
- Coluna Aguardando PR com PR, checks e `/mediate`: `pr-flow`. Aqui a etapa `pr` do `board.yml` é tratada como
  qualquer outra.
- Worker dedicado, cron, fila paga (Cloud Tasks, Redis).

### 1.1 Fronteiras com as specs vizinhas

| Quem | Faz | Não faz |
|------|-----|---------|
| `orchestrator` (esta) | Coleção `run`; `triggerStage`, `stopRun`, `completeRun`, `resumeAfterAnswer`, `tick`; única escrita de `state`, `activeRunId`, `lastRun` e `reworkLoops` do card; interface `StageExecutor` e o executor falso; rotas de disparo, parada e limites; selos e botões | Não emite token, não expõe ferramenta de agente, não roda Claude |
| `card-timeline` | Coleção `cardEvent`, `pendingAsk`, `agentEventFromTool`, `appendAgentEvent`, rota de resposta | Não grava `state`. Chama `resumeAfterAnswer` depois da transação da resposta (ponto de encaixe que ela deixou em 4.3) |
| `agent-contract` | Emite o token no despacho (envolve `executor.dispatch`), valida o token, chama `appendAgentEvent` para `post_update`/`ask`/`attach_artifact` e `completeRun` para `complete_stage` | Não decide transição, não grava `state` |
| `local-runner` | Implementa `StageExecutor` do tipo `local`: o `dispatch` só deixa o `run` disponível; o runner busca trabalho por polling, reporta turnos e chama `complete_stage` | Não cria nem move `run` por fora do orquestrador |

Pontos de encaixe deixados prontos:

- `completeRun({ runId, outcome, summary, now })` em `apps/api/(shared)/lib/orchestrator/orchestrator.ts`:
  idempotente; um segundo chamado para o mesmo `run` devolve `{ ignored: true }` (garantia do `CONTRACT.md`).
- `StageDispatch` leva `runId`; o `agent-contract` acrescenta o token sem mudar o orquestrador.
- `run.executor` grava o tipo (`fake` hoje); `local` e `cloud` entram como novos valores de
  `STAGE_EXECUTOR_KINDS`.
- `run.sessionUrl` e `run.turns` nascem `null`; o runner preenche.
- Eventos da linha do tempo gerados pelo executor falso levam `runId` (o campo que a `card-timeline` deixou
  `null`).

Regra 14: o card só muda de etapa ou estado por funções deste módulo, e toda mudança vinda de resultado de etapa
(agente, tempo limite, falha de despacho) passa por `resolveTransition`. "Parar" e mover para Tarefas/Concluído
são ações de pessoa fora do resultado de etapa; também ficam aqui (4.4).

### 1.2 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/orchestrator.md` | Corte, riscos (corrida entre dois drags; fila sem worker), sinais de pronto |
| `.claude/cycle-policy.md` | Sem serviço pago nem dependência nova; modo degradado com `error.code`; corte manda; executor falso nunca em produção |
| `.claude/rules/board-mode.md` | O que o agente faz em cada etapa; `needs_input` com até 4 perguntas; `failed` por limite |
| `docs/board/ARCHITECTURE.md:36-58,66-76` | Ciclo do card, estados, executores, campos de `runs` |
| `docs/board/CONTRACT.md` | `complete_stage` idempotente; tempo limite vira `failed` com "sem resposta do agente"; resposta vai junto no próximo disparo |
| `docs/board/ACCESS.md:31,39,56` | `operator` arrasta e dispara; papel efetivo checado antes de disparar; `runs` gravam quem disparou e o modelo |
| `docs/board/DECISIONS.md` | Duas voltas de retrabalho; WIP por coluna; aprovação do plano em aberto ("por board?") |
| `docs/board/ROADMAP.md:63` | Fase 1, item 8 |
| `docs/board/SCREENS.md:26-28,37,52-53` | `Main`, `TriggerStage`, `CardDetail`, `Settings` (aba Etapas), `MBoard`, `MMove` |
| `docs/design/screenshots/Main.png` | Selos Rodando/Falhou/Aguardando você, "Volta 1 de 2", motivo da falha, "Rodar de novo", "Plano pronto · aguarda sua aprovação" com "Aprovar e seguir", resumo "3 rodando · 1 na fila" |
| `docs/design/screenshots/TriggerStage.png` + `screens/TriggerStage.dc.html` | Diálogo: título, descrição, Comando, Modelo e esforço, Branch do card, Limite em turnos, botões |
| `docs/design/screenshots/MMove.png` | Mover no celular dispara pela mesma confirmação |
| `docs/design/screens/Settings.dc.html` | Aba Etapas: colunas "Limite de cards" e "Aprovação", botão "Salvar limites e aprovação" |
| `packages/kanban-contract/src/cardState.ts` | `CARD_STATES`, `STAGE_OUTCOMES`, `resolveTransition`, `TransitionInput.approvalGateEnabled` |
| `packages/kanban-contract/src/boardConfig.ts` | `resolveBranchName`, `limits`, `approval` por etapa, `onRework` |
| `packages/kanban-contract/src/roles.ts:47` | `canTriggerStages` (`operator`+) |
| `packages/kanban-contract/src/cardEvent.ts:111` | `displayCardState` já implementado pela `card-timeline` |
| `apps/api/(shared)/lib/board-access.ts:28-44` | Capacidade `trigger` já existe e aponta para `canTriggerStages`; nenhuma rota a usa |
| `apps/api/(shared)/lib/card-move.ts`, `move/route.ts` | Mover não dispara; usa a capacidade `prioritize` |
| `apps/api/(shared)/repositories/card.repository.ts`, `mappers/card.mapper.ts` | Coleção `card`, id `<boardId>__<slug>`, campos `state`, `reworkLoops`, `branch` |
| `apps/api/(shared)/repositories/board-member.repository.ts:185` | Precedente de `db.runTransaction` no repo |
| `apps/api/(shared)/lib/github/github-client.ts`, `github-app-config.ts:39` | Precedente do modo falso: `isEmulated() ? "fake" : "off"` |
| `apps/api/(shared)/lib/card-sync.ts:155,232` | `branchFor` grava a branch enquanto o card está em Tarefas |
| `apps/app/.../boards/(components)/BoardColumns.tsx`, `CardMoveMenu.tsx`, `CardStateBadge.tsx`, `(hooks)/useBoardCardCrud.tsx` | Arrastar nativo + menu "⋯"; mutação otimista de `move`; selo de estado |
| `apps/app/shared/hooks/useUnreadNotificationsCount.ts:42` | Precedente de `refetchInterval` com `refetchIntervalInBackground: false` |
| `docs/features/card-backlog/analyze/plan.md:47-51,913-916` | O que ela deixou para cá: trocar "mover" por "disparar", assumir `branch`, tons dos selos |
| `docs/features/card-timeline/analyze/plan.md:50-68,137-147,210-221` | `pendingAsk`, `displayCardState`, ponto do redisparo depois da resposta |
| `specs/features/agent-contract.md`, `local-runner.md` | Token por `run`; runner faz polling, um `run` por vez |
| [Vercel, Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing), coletado em 2026-11-26 | Hobby: cron no máximo uma vez por dia, precisão de ±59 min |
| [Firebase pricing](https://firebase.google.com/pricing), coletado em 2026-11-26 | Cloud Functions não existem no plano Spark; exigem Blaze |

Referências não lidas: o canvas do Claude Design é privado; usei as cópias em `docs/design/`.

### 1.3 Apps e área

`packages/kanban-contract`, `packages/sdk`, `apps/api`, `apps/app`, `packages/internationalization`. Área comum
do painel, dentro das telas de board. A lógica do orquestrador fica em `apps/api`; vão para o contrato só os
tipos e funções puras do domínio (estados do `run`, interface do executor, ações disponíveis num card), como
pede a regra 12.

### 2. Dados (Firestore)

#### 2.1 Coleção `run` (nova)

Singular, como `card`, `boardMember` e `cardEvent`. Id automático. O `ARCHITECTURE.md` chama de `runs`; o
`/develop` corrige a tabela para o nome real.

| Campo | Tipo | `null`? | Por quê |
|-------|------|---------|---------|
| `boardId` | string | não | Escopo e consulta |
| `cardId` | string | não | `<boardId>__<slug>` |
| `slug` | string | não | Vai no despacho (`/analyze <slug>`) |
| `stageKey` | string | não | Etapa executada |
| `command`, `agent` | string, string\|null | `agent` sim | Copiados da etapa no disparo; o `board.yml` pode mudar depois |
| `model`, `effort` | `ModelAlias`, `Effort` | não | Idem (spec: "modelo e esforço da coluna") |
| `maxTurns` | number | não | `limits.maxTurnsPerStage` no disparo |
| `branch` | string | não | `card.branch` ou `resolveBranchName(config, slug)` |
| `trigger` | `RunTrigger` | não | `drag`, `rerun`, `approve`, `answer`, `transition` |
| `triggeredBy` | `{ userId, login }` | não | Quem disparou. Em `transition` (etapa seguinte automática) herda de quem disparou o `run` anterior: a credencial continua sendo a dessa pessoa (`ACCESS.md:50-56`) |
| `executor` | `StageExecutorKind` | não | `fake` hoje |
| `status` | `RunStatus` | não | `queued`, `running`, `finished`, `stopped` |
| `active` | boolean | não | `true` em `queued` e `running`; existe só para a consulta por igualdade (2.3) |
| `outcome` | `StageOutcome` | sim | Resultado aplicado ao fechar |
| `endReason` | `RunEndReason` | sim | `agent`, `timeout`, `dispatch_failed`, `stopped` |
| `stoppedBy` | `{ userId, login }` | sim | Só em `stopped` |
| `queuedAt`, `startedAt`, `deadlineAt`, `finishedAt` | Timestamp | os três últimos sim | `deadlineAt = startedAt + limits.stageTimeoutMinutes` |
| `sessionUrl`, `turns` | string, number | sim | Sempre `null` aqui; o executor real preenche |
| `createdAt`, `updatedAt`, `deletedAt` | Timestamp | `deletedAt` sim | Padrão do `BaseRepository` |

O resumo (`summary`) do `complete_stage` não é copiado para o `run`: ele vira o evento `report` da linha do
tempo (`card-timeline`), e o `run` guarda só o resultado.

#### 2.2 Card: campos novos

| Campo | Tipo | Default | Por quê |
|-------|------|---------|---------|
| `activeRunId` | string \| null | `null` | Trava "um `run` ativo por card"; lido dentro da transação do disparo |
| `lastRun` | `CardLastRun \| null` | `null` | `{ id, stageKey, status, outcome, endReason, stoppedByLogin, finishedAt }`. O quadro desenha motivo da falha, "Parado por …" e "aguarda sua aprovação" sem ler a coleção `run` |

`state`, `reworkLoops`, `stageKey`, `lane` e `branch` já existem e passam a ser escritos só por este módulo
(mais a sincronização do backlog, que continua gravando `branch` enquanto o card está em Tarefas). O mapper
devolve `null` quando os campos novos faltam: nenhuma migração.

#### 2.3 Board: campo novo

`stageSettings: Record<stageKey, { wipLimit: number | null; approvalGate: boolean }>`, default `{}`. É a
escolha do board que a aba Etapas da Configuração mostra ("Colunas, comandos e modelos vêm do board.yml. Aqui
ficam só as escolhas do board"). `approvalGate` só vale para etapa com `approval: optional`; `required` sempre
pede aprovação e `none` nunca pede (`cardState.ts:46-51`). Chave de etapa que sumiu do `board.yml` é ignorada na
leitura.

Também `runsPumpedAt: Timestamp`, escrito pela transação que promove `run`s da fila (4.5). Serve de trava: duas
promoções simultâneas no mesmo board conflitam nesse documento e uma delas repete. Não mexe em `updatedAt`.

#### 2.4 Contrato do `board.yml`

`limits.stageTimeoutMinutes`: inteiro de 5 a 240, default 45 (o número do `Main.png`, "não respondeu em 45
min"). Campo novo com default: todo `board.yml` válido continua válido. Alternativa descartada: constante na
API, que não deixaria um repositório com etapas lentas (Testando com browser) ajustar o próprio limite.

#### 2.5 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| `run`s ativos do board | `where("boardId","==",id).where("active","==",true)` | Nenhum (só igualdade) |
| `run` por id | `doc(id)` + conferência de `boardId` | Nenhum |

Sem `orderBy`: a fila ordena em memória por `queuedAt` (desempate por id). Volume: `run`s ativos de um board
são no máximo o número de cards em colunas de etapa (dezenas). `run`s encerrados não são lidos em nenhuma rota
deste corte. O `BaseRepository` não pagina, e aqui não precisa.

#### 2.6 Script do executor falso (só no emulador)

`fakeExecutorScript/<cardId>`: `{ outcomes: FakeOutcome[] }`, onde `FakeOutcome` é um `StageOutcome` ou
`"silent"` (não responde, para testar o tempo limite). Consumido em ordem; sem documento ou com a lista vazia, o
falso responde `success`. Escrito só pelo script de fixture do `/test` (8.2), que tem a trava do emulador.
Nunca lido fora do modo falso.

### 3. Contrato

**`@repo/kanban-contract`**, arquivo novo `src/run.ts` (regra 12):

- `RUN_STATUSES`, `RunStatus`; `RUN_END_REASONS`, `RunEndReason`; `RUN_TRIGGERS`, `RunTrigger`.
- `STAGE_EXECUTOR_KINDS = ["fake"] as const`, `StageExecutorKind`.
- `StageDispatch`: `{ runId, boardId, cardId, slug, stageKey, command, agent, model, effort, maxTurns, branch,
  repository: { owner, name }, triggeredBy }`. Só campos esperados (regra 16): nada da spec, de comentário nem
  de resposta vai no despacho; o agente lê isso pelo `get_card`.
- `StageExecutor`: `{ kind; dispatch(input: StageDispatch): Promise<{ ok: true; sessionUrl: string | null } |
  { ok: false; reason: string }>; cancel(runId: string): Promise<void>; collect?(runs: ActiveRunView[], now:
  Date): Promise<ExecutorReport[]> }`. `collect` é opcional: o falso usa para "responder"; um executor de nuvem
  pode usar para consultar a sessão; o runner local não implementa (ele chama `complete_stage`).
- `ExecutorReport`: `{ runId; outcome: StageOutcome; summary: string; questions?: Question[] }`.
- `CardLastRun` (tipo).
- `cardRunActions(card, { canTrigger, executorAvailable })` → `{ rerun, stop, approve }`, pura. Regras:
  `stop` com `activeRunId`; `approve` com card em etapa, `idle`, sem `run` ativo e `lastRun` = `finished` +
  `success` numa etapa diferente da atual; `rerun` com card em etapa, sem `run` ativo e estado `failed`,
  `waiting_input` sem pergunta pendente, ou `idle` com `lastRun.status = stopped`. Tudo falso sem `canTrigger`
  ou sem executor. Usada pela UI e pelo teste; a API refaz as checagens dela.
- `boardConfigSchema.limits` ganha `stageTimeoutMinutes` (2.4).

`roles.ts` não muda: disparar, parar, rodar de novo e aprovar usam `canTriggerStages`; editar limites usa
`canConfigureBoard`.

**`@repo/sdk`**:

- `types/board/run.ts`: `CardLastRunDTO`, `TriggerStageRequest = { stageKey }`, `TriggerStageResultDTO =
  { card: CardDTO; run: RunDTO }`, `RunDTO` (campos públicos do `run`), `BoardStageSettingsDTO`,
  `UpdateBoardStageSettingsRequest`.
- `CardDTO` ganha `activeRunId` e `lastRun`.
- `BoardDTO` ganha `stageSettings`; `BoardViewDTO` ganha `executor: StageExecutorKind | null` (`null` quando
  nenhum executor está disponível; a UI não oferece disparo).
- `MoveCardRequest` perde a variante `{ lane: "stage" }`: mover para etapa passa a ser disparar. Quebra só o
  `apps/app`, que é ajustado no mesmo slice.
- `boardCard` ganha `trigger(boardId, slug, body)` e `stop(boardId, slug)`; `board` ganha
  `updateStageSettings(boardId, body)`.

### 4. API (`apps/api`)

#### 4.1 Rotas

| Método e rota | Capacidade | O que faz |
|---------------|------------|-----------|
| `POST /boards/[id]/cards/[slug]/runs` | `trigger` | Dispara a etapa `stageKey`: arrastar, "Rodar de novo" e "Aprovar e seguir". 201 `{ card, run }` |
| `POST /boards/[id]/cards/[slug]/stop` | `trigger` | Para o `run` ativo. 200 `{ card }` |
| `PATCH /boards/[id]/stage-settings` | `configure` | Grava `stageSettings`. 200 `{ data: BoardViewDTO }` |
| `POST /boards/[id]/cards/[slug]/move` (existente) | `prioritize` | Passa a aceitar só `tasks` e `done`, e recusa card com `run` ativo |
| `GET /boards/[id]/cards`, `GET /boards/[id]/cards/[slug]` (existentes) | `view` | Rodam `tick(board)` antes de ler (4.6) |
| `GET /boards/[id]` (existente) | `view` | Acrescenta `executor` |

Todas passam por `requireBoardApi` (regra 13). Sob personificação, `POST`/`PATCH` já são recusados pelo
`requireCommonPanelApi`. `[slug]` passa em `isValidSlug`.

O tipo do disparo (`trigger`) é decidido no servidor, não no corpo: card em Tarefas ou em outra etapa →
`drag`; mesma etapa com aprovação pendente → `approve`; mesma etapa nos demais casos → `rerun`.

#### 4.2 Disparar (`triggerStage`)

1. `parseRequestJson` + `triggerStageSchema` (`{ stageKey }` com o regex de chave do contrato).
2. Executor: `getStageExecutor()` devolve `null` → 503 `RUN_EXECUTOR_UNAVAILABLE`.
3. Transação no documento do card (`run.repository.ts → enqueueOnCard`):
   - card não existe → 404 `CARD_NOT_FOUND`;
   - `activeRunId !== null` → 409 `CARD_RUN_ACTIVE`;
   - `decideTrigger(card, stageKey, config)` (puro): etapa inexistente → 422 `CARD_STAGE_NOT_FOUND`; card em
     Tarefas não pronto → 409 `CARD_NOT_READY` (mesma regra do `decideCardMove`); branch: `card.branch ??
     resolveBranchName(config, slug)`, que lança para slug inválido ou branch protegida → 422
     `CARD_BRANCH_INVALID`;
   - cria o `run` (`queued`, `active: true`) e atualiza o card: `lane: "stage"`, `stageKey`, `state: "queued"`,
     `activeRunId`, `branch`, `movedAt`, `movedByUserId`, e `reworkLoops: 0` quando o card vem de Tarefas
     (começo de um percurso novo; pergunta 3).
4. Fora da transação: `pumpBoard(board)` (4.5), que promove o `run` se houver vaga e chama o executor.
5. Devolve o card relido e o `run`.

Dois drags ao mesmo tempo no mesmo card: a transação lê o card; o segundo repete, vê `activeRunId` e recebe 409.
É o risco da spec, coberto pelo teste de emulador (7).

#### 4.3 Concluir (`completeRun`)

Chamado pelo `agent-contract` (`complete_stage`), pelo `tick` (tempo limite, executor falso) e pela falha de
despacho. Em transação (`run.repository.ts → finishOnCard`):

1. lê o `run`; inexistente ou `active === false` → `{ ignored: true }` (idempotência);
2. lê o card; `card.activeRunId !== runId` → fecha só o `run` e devolve `ignored`;
3. `planCompletion` (puro) chama `resolveTransition({ config, current: { stageKey, state, reworkLoops }, outcome,
   approvalGateEnabled: board.stageSettings[stageKey]?.approvalGate ?? false })` e traduz o resultado:
   - `stageKey: null` (última etapa) → `lane: "done"`, `state: "idle"`;
   - `state: "queued"` (etapa seguinte ou retrabalho) → cria o `run` seguinte na mesma transação, com
     `trigger: "transition"` e `triggeredBy` do `run` atual, e grava `activeRunId` dele;
   - demais (`idle` por aprovação, `waiting_input`, `failed`) → `activeRunId: null`;
   - caso especial: `outcome = needs_input` e `card.pendingAsk === null` (alguém já respondeu enquanto o agente
     ainda rodava) → reenfileira a mesma etapa com `trigger: "answer"`, para o card não ficar esperando uma
     pergunta que já tem resposta;
4. fecha o `run` (`status: finished`, `outcome`, `endReason`, `finishedAt`, `active: false`) e grava `lastRun`.

Depois da transação: `pumpBoard`, porque uma vaga abriu e talvez um `run` novo exista.

Tempo limite e falha de despacho entram aqui com `outcome: "failed"` e `endReason` próprio, então também passam
por `resolveTransition` (regra 14). O texto "sem resposta do agente" do `CONTRACT.md` vira a copy do
`endReason: timeout` na UI.

#### 4.4 Parar, mover e responder

- **Parar** (`stopRun`): transação no card; sem `activeRunId` → 409 `CARD_RUN_NOT_ACTIVE`. Fecha o `run` com
  `status: stopped`, `endReason: stopped`, `stoppedBy`; card fica na etapa com `state: "idle"` e `lastRun`
  apontando o motivo. Depois: `executor.cancel(runId)` (melhor esforço; o falso não faz nada) e `pumpBoard`.
  Não passa por `resolveTransition` porque não é resultado de etapa: é uma pessoa interrompendo.
  Alternativa descartada: `state: "failed"`, que poria "Falhou" num card que ninguém viu falhar.
- **Mover para Tarefas ou Concluído**: a rota `move` continua, com `parseMoveCard` aceitando só essas faixas
  (corpo com `lane: "stage"` → 400 `VALIDATION_FAILED` pelo schema) e uma checagem nova: `activeRunId` → 409
  `CARD_RUN_ACTIVE`. O card sai com `state: "idle"`. A escrita passa para `orchestrator.moveOutOfStages`, que
  chama `cardRepository.move` com o `state`.
- **Responder** (`card-timeline`): a rota `POST …/answers` chama `resumeAfterAnswer({ board, cardSlug, by })`
  depois da transação dela. Se o card está `waiting_input` sem `run` ativo e o executor existe, dispara a
  mesma etapa com `trigger: "answer"` e `triggeredBy` = quem respondeu (que é `operator`+, a capacidade
  `answer`). Caso contrário não faz nada. Erro aqui não derruba a resposta já gravada: a rota devolve 200 com
  o card e o redisparo fica para o botão "Rodar de novo". A copy do botão da `card-timeline` passa de
  "Responder" para "Responder e retomar a {column}" quando `board.executor !== null`.

#### 4.5 Fila e WIP (`pumpBoard`)

Transação que lê o documento do board (e grava `runsPumpedAt`) e os `run`s ativos do board:

1. `pickPromotions(runs, stageSettings)` (puro): por etapa, vagas = `wipLimit - running` (sem limite = todas);
   promove os `queued` mais antigos até acabar a vaga;
2. cada promovido vira `running` com `startedAt`, `deadlineAt` e `executor`, e o card vai para
   `state: "running"`.

Fora da transação, para cada promovido: `executor.dispatch(toStageDispatch(run, board))`. Resposta `ok: false`
ou exceção → `completeRun({ outcome: "failed", endReason: "dispatch_failed" })`.

O limite WIP vale para `running`, não para `queued`: o card entra na coluna na hora (o usuário vê onde soltou)
com o selo "Na fila". É o que a spec pede ("excedente fica `queued`") e o que o `TriggerStage.png` mostra
("O card entra na fila e começa em seguida").

#### 4.6 Sem worker: `tick` na leitura

A spec sugere "no próprio request + cron". O cron não serve no plano gratuito: na Vercel Hobby ele roda no
máximo uma vez por dia, com ±59 min de precisão, e Cloud Functions exigem o plano Blaze (fontes em 1.2). O
corte resolve sem os dois:

- tudo que depende de um evento (disparo, resultado, parada, resposta) roda no próprio request que o causa;
- o que depende do relógio (tempo limite, e a "resposta" do executor falso) roda no `tick(board, now)`, chamado
  no começo de `GET /boards/[id]/cards` e `GET /boards/[id]/cards/[slug]`.

`tick`: lê os `run`s ativos do board (uma consulta; se não houver, retorna); `findExpired(runs, now)` (puro) →
`completeRun` com `timeout`; `executor.collect?.(running, now)` → `completeRun` de cada relatório; `pumpBoard`
se algo fechou.

O quadro e o detalhe consultam a cada 5 s enquanto houver card `queued` ou `running` (`refetchInterval`, sem
rodar em segundo plano, como `useUnreadNotificationsCount.ts:42`). Enquanto alguém olha o board, o tempo limite é
aplicado em até 5 s. Ninguém olhando, o `run` vencido fica `running` no banco até a próxima leitura, e a tela
nunca mostra o estado velho porque a leitura aplica o `tick` antes. O efeito colateral real: a etapa seguinte de
um card que estourou o tempo de madrugada não começa até alguém abrir o board. Isso importa para `cycle-runs`
(ciclo noturno), não para este corte; fica registrado como pendência de infra (seção própria).

Escrita num `GET`: o `tick` grava só transições de sistema (sem autor), idempotentes. Sob personificação ele
também roda, e isso é aceitável porque nada é gravado em nome de ninguém.

#### 4.7 Executor

`apps/api/(shared)/lib/orchestrator/executor.ts`:

```ts
export function resolveStageExecutorMode(): StageExecutorKind | null {
    return isEmulated() ? "fake" : null;
}
export function getStageExecutor(): StageExecutor | null
```

Mesmo critério do cliente GitHub falso (`github-app-config.ts:39`): o falso só existe contra o emulador, que
fala com um projeto `demo-*` sem usuário real. Não há variável de ambiente que o ligue, então não há como
ativá-lo em produção por engano. Em produção, até o `local-runner` existir, `executor` é `null`: o quadro não
oferece disparo (arrastar para etapa fica desligado, com dica) e a API responde 503
`RUN_EXECUTOR_UNAVAILABLE`, nunca 500 (modo degradado da política).

**Executor falso** (`fake-executor.ts`):

- `dispatch`: devolve `{ ok: true, sessionUrl: null }` e grava um evento `update` na linha do tempo ("Executor
  de teste: `/analyze <slug>` iniciado na branch …"), com `runId`.
- `collect(running, now)`: para cada `run` com `now - startedAt >= FAKE_RUN_DURATION_MS` (3 s), consome o
  próximo resultado de `fakeExecutorScript/<cardId>` (transação) e devolve um relatório. `silent` não devolve
  nada (o `tick` aplica o tempo limite depois). Para `needs_input` inclui uma pergunta fixa de duas opções.
- Antes de `completeRun`, o `tick` grava os eventos pelos pontos de encaixe da `card-timeline`:
  `appendAgentEvent(card, agentEventFromTool("ask", …))` quando há perguntas (abre `pendingAsk`) e
  `agentEventFromTool("complete_stage", …)` com o resumo no molde do `board-mode.md`. Assim o executor falso
  exercita a linha do tempo e as perguntas do mesmo jeito que o agente real vai exercitar.
- `cancel`: nada.

Os textos do executor falso são conteúdo de agente (dado da linha do tempo), não copy de interface; ficam no
módulo do falso, em pt-br, e nunca aparecem fora do emulador.

#### 4.8 Erros novos

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `CARD_RUN_ACTIVE` | 409 | Disparar ou mover um card que já tem `run` ativo |
| `CARD_RUN_NOT_ACTIVE` | 409 | Parar um card sem `run` ativo |
| `CARD_BRANCH_INVALID` | 422 | `resolveBranchName` recusa (slug inválido ou branch protegida) |
| `RUN_EXECUTOR_UNAVAILABLE` | 503 | Nenhum executor disponível neste ambiente |

Os quatro entram em `apiErrors` (`translations/packages/shared/utils.ts`); `apiErrorCodesTranslated.test.ts`
cobra. Reaproveitados: `CARD_NOT_FOUND`, `CARD_NOT_READY`, `CARD_STAGE_NOT_FOUND`, `VALIDATION_FAILED`,
`BOARD_ROLE_INSUFFICIENT`.

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

Nenhuma rota nova. Mudam o quadro (`boards/[id]`), o detalhe do card (`boards/[id]/cards/[slug]`) e a
Configuração (`boards/[id]/settings`).

#### 5.2 Dados

- `useListBoardCards` e `useFindBoardCardBySlug` ganham `refetchInterval: (query) => hasActiveRun(query.state.data)
  ? 5000 : false` e `refetchIntervalInBackground: false`.
- `useBoardCardCrud` ganha `triggerMutation` (otimista: card na coluna com `state: "queued"`; rollback e
  `invalidateQueries` no erro, como o `moveMutation` faz) e `stopMutation`. Sucesso grava o card devolvido no
  cache da lista e do detalhe, e invalida os eventos do card (a linha do tempo da `card-timeline`).
- `useBoardCrud` ganha `updateStageSettingsMutation` (grava o `BoardViewDTO` devolvido em
  `queryKeys.boards.detail`).
- `queryKeys` não muda.

#### 5.3 Quadro (`Main.png`, `TriggerStage.png`, `MBoard.png`, `MMove.png`)

- **Soltar numa coluna de etapa** (arrastar ou menu "⋯" → "Mover para {column}"): abre o
  `TriggerStageDialog` em vez de chamar `move`. Soltar em Tarefas/Concluído continua chamando `move`.
- **`TriggerStageDialog`** (`dialog.tsx`): título "Disparar a {column}?"; descrição "Você soltou “{title}” em
  {column}. O agente roda a etapa na branch do card e escreve o resultado no card."; quatro campos em grade:
  Comando (`{command} {slug}`, mono), Modelo e esforço (`{model} · {effort}`), Branch do card (mono), Limite
  (`{maxTurns} turnos`). Linha extra quando a coluna está no limite WIP: "A coluna {column} está no limite de
  {wip} cards. O card entra na fila e começa quando uma vaga abrir." Linha extra com o executor falso:
  "Executor de teste: o resultado é simulado." Botões: "Cancelar e voltar o card" (secundário) e "Disparar
  {column}" (primário, `aria-busy` enquanto envia). O mesmo diálogo serve "Rodar de novo" e "Aprovar e seguir"
  com título "Rodar {column} de novo?" e "Aprovar e seguir para {column}?".
- **Sem executor** (`board.executor === null`): colunas de etapa não aceitam drop, o menu não lista colunas de
  etapa e o cabeçalho mostra "Nenhum executor disponível: as etapas não podem ser disparadas neste ambiente."
- **Card com `run` ativo**: não é arrastável; o menu só oferece "Parar".
- **`BoardCardItem`** ganha, abaixo do título: selo de `displayCardState(card)` (já existe `CardStateBadge`;
  `running` e `queued` com `secondary`, `failed` com `destructive`, `waiting_input` com `outline`: as variantes
  que o `badge.tsx` tem); chip "Volta {n} de {max}" quando `reworkLoops > 0` e o card está em etapa com
  `onRework`; linha de motivo pelo `lastRun` ("O agente não respondeu em {minutes} min.", "Não foi possível
  iniciar a etapa.", "Parado por {login}.", "Plano pronto · aguarda sua aprovação"); botões de
  `cardRunActions`: "Rodar de novo", "Parar", "Aprovar e seguir". Card `failed` e `waiting_input` ganham a borda
  de destaque do `Main.png` (`border-destructive`, `border-primary`, tokens do repo).
- **Resumo do cabeçalho** (`BoardSummaryLine`): "{running} rodando · {queued} na fila", só quando algum dos
  dois é maior que zero.
- **Parar** pede confirmação (`dialog.tsx`): "Parar {column}?", "A execução atual é interrompida e o card fica
  parado nesta coluna. O que o agente já enviou para a branch continua lá.", botões "Continuar rodando" e
  "Parar".
- Anúncio em `aria-live` (já existe em `BoardClient.tsx:86`): "{title}: {column} disparada.", "{title} entrou
  na fila de {column}.", "{title}: execução parada."

#### 5.4 Detalhe do card (`CardDetail.png`)

No cabeçalho do detalhe (o mesmo componente `CardRunActions` do quadro): selo, motivo do `lastRun` e os três
botões. O bloco de perguntas da `card-timeline` troca a copy do botão (4.4) e mostra, depois de enviar,
"Resposta enviada. {column} roda de novo com ela."

#### 5.5 Configuração, aba Etapas (`Settings.dc.html`)

Abaixo da tabela de etapas existente (`BoardStagesTable`), um formulário "Limites e aprovação" visível para
todos e editável só com `canConfigureBoard` (os outros veem os valores, desabilitados):

| Campo | Componente | Regra |
|-------|------------|-------|
| Limite de cards por etapa | `HookFormInput` `type="number"` | Vazio = sem limite; 1 a 20 |
| Aprovação, só em etapa `approval: optional` | `HookFormSwitch` | Rótulo "Pedir aprovação antes da próxima etapa" |

Etapa `required` mostra "Sempre" e `none` mostra "Não exige", como texto. Botão "Salvar limites e aprovação"
(`Footer`). Esquema RHF em `(validations)/stageSettingsSchema.ts`, espelho do Zod da API.

#### 5.6 i18n e a11y

Toda copy em `boards.ts` (árvore em 10.8). Botões com `aria-label` que inclui o título do card ("Parar
{title}"), porque o quadro tem vários botões iguais. O diálogo devolve o foco ao menu do card ao fechar, como o
`BoardColumns` já faz depois de mover.

### 6. Autorização e segurança

- Disparar, parar, rodar de novo e aprovar: `requireBoardApi("trigger")` → `canTriggerStages` (`operator`+). A UI
  usa o mesmo predicado sobre `board.access.effectiveRole`, mas a API é quem decide (regra 4).
- Limites e aprovação: `requireBoardApi("configure")` → `owner`.
- `viewer` vê selos e motivos, nunca os botões; a API recusa com 403 `BOARD_ROLE_INSUFFICIENT`.
- Personificação: `POST`/`PATCH` recusados pelo guard de sessão; o `tick` dos `GET` grava só transições de
  sistema.
- Executor falso: só com `isEmulated()`; o script de fixture usa a mesma trava do seed (`refuseSeedReason`).
- Regra 15: nenhum segredo nasce aqui. O token de execução é do `agent-contract`.
- Regra 16: o despacho leva só os campos de `StageDispatch`; título, spec, comentários e respostas não vão.
- `firestore.rules` nega tudo ao cliente; `run` e `fakeExecutorScript` herdam essa negação. Nada a mudar.
- Credencial: `triggeredBy` registra quem disparou; a escolha de credencial e a recusa "nada serve" são da
  `execution-credentials`.

### 7. Testes

| Nível | Arquivo | Prova |
|-------|---------|-------|
| Contrato, puro | `packages/kanban-contract/__tests__/run.test.ts` | `cardRunActions` em cada estado (ativo, falhou, parado, aguardando com e sem pergunta, aprovação pendente, `viewer`, sem executor); `stageTimeoutMinutes` default 45, recusa 4 e 241 |
| API, puro | `apps/api/__tests__/orchestratorDecide.test.ts` | `decideTrigger` (etapa inexistente, card não pronto, branch protegida, `reworkLoops` zerado só vindo de Tarefas, tipo `drag`/`rerun`/`approve`); `planCompletion` para os quatro resultados, última etapa → Concluído, aprovação ligada → próxima etapa `idle`, terceira volta → `waiting_input`, `needs_input` já respondido → reenfileira; `pickPromotions` com e sem WIP, ordem por `queuedAt`; `findExpired` |
| API, puro | `apps/api/__tests__/fakeExecutor.test.ts` | Responde só depois de 3 s; consome o script em ordem; `silent` não responde; sem script → `success`; `needs_input` traz pergunta válida no `askInputSchema` |
| API, puro | `apps/api/__tests__/stageExecutorMode.test.ts` | Fora do emulador → `null`; com `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` → `fake` |
| API, mapper | `__tests__/runMapper.test.ts`, `cardMapper.test.ts` (existente) | `Timestamp` → ISO; `activeRunId`/`lastRun` ausentes viram `null`; `stageSettings` ausente vira `{}` e chave de etapa desconhecida some |
| API, rota | `__tests__/cardRunsRoutes.test.ts` | Com `vi.mock` do `run.repository` e do guard, como as rotas da `card-backlog`: `viewer` → 403; sem executor → 503; 409 com `run` ativo; 201 com `{ card, run }`; `stop` sem `run` → 409; `move` para `stage` → 400 e com `run` ativo → 409; `PATCH stage-settings` por `operator` → 403, `wipLimit` 0 → 400 |
| API, emulador | `__tests__/orchestratorRuns.emulator.test.ts` | O que só o Firestore real prova: dois disparos simultâneos no mesmo card criam um `run` só (o outro leva `CARD_RUN_ACTIVE`); `complete_stage` repetido não cria dois `run`s seguintes; com WIP 1, duas promoções simultâneas deixam um `running` e um `queued`; e o percurso do sinal de pronto da spec com o executor falso e relógio injetado: Análise → Executando → Revisando → Testando, `needs_rework` volta para Executando, na terceira volta para em `waiting_input` |
| app, puro | `__tests__/hasActiveRun.test.ts` | Intervalo de consulta liga só com `queued`/`running` |
| app, componente | `__tests__/triggerStageDialog.test.tsx` | Mostra comando com slug, modelo, branch e turnos; aviso de WIP; botão chama `trigger`; cancelar não chama nada |
| app, componente | `__tests__/cardRunActions.test.tsx` | Botões certos por estado; `viewer` sem botões; motivo do `lastRun` por `endReason` |
| app, componente | `__tests__/boardColumnsMove.test.tsx` (existente) | Soltar em etapa abre o diálogo e não chama `move`; card ativo não é arrastável; sem executor, etapa não aceita drop |
| i18n | `apiErrorCodesTranslated.test.ts` (existente) | Os quatro códigos novos têm copy |

O teste de emulador é o único que sobe processo externo. Ele existe porque a trava de concorrência é uma
transação do Firestore, e um repositório em memória não reproduz o conflito nem a repetição.

### 8. O que o `/test` vai percorrer

#### 8.1 Fluxos

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, login no emulador, board importado do repositório de
exemplo `sample-app` (cliente GitHub falso) e backlog sincronizado. O quadro mostra "Executor de teste" no
diálogo.

1. **Percurso feliz:** arrastar um card pronto de Tarefas para Análise → diálogo com `/analyze <slug>`,
   `opus · alto`, `feat/<slug>`, `200 turnos` → "Disparar Análise" → selo "Na fila" ou "Rodando" → em ~3 s o
   card passa sozinho por Executando, Revisando, Testando, Aguardando PR e chega em Concluído. A linha do tempo
   do detalhe tem um relatório por etapa.
2. **Retrabalho:** script `success, success, needs_rework, success, needs_rework, success, needs_rework` (um
   resultado por `run`, na ordem: Análise, Executando, Revisando, Executando, Revisando, Executando, Revisando).
   O primeiro `needs_rework` devolve o card para Executando com "Volta 1 de 2", o segundo com "Volta 2 de 2", e
   o terceiro o deixa parado em Revisando com "Aguardando você" (`limits.maxReworkLoops: 2`).
3. **Pergunta:** script `needs_input` na análise → selo "Aguardando você", bloco de perguntas → responder →
   "Resposta enviada…" → Análise roda de novo e segue.
4. **Falha e rodar de novo:** script `failed` → selo "Falhou", "Rodar de novo" → diálogo → roda.
5. **Tempo limite:** script `silent` + `fake-executor expire` → próxima consulta marca "Falhou" com "O agente não
   respondeu em 45 min."
6. **Parar:** script `silent` → "Parar" → confirmação → card parado na coluna com "Parado por {login}" e
   "Rodar de novo".
7. **Aprovação:** como `owner`, ligar "Pedir aprovação" em Análise → disparar → card para em Executando com
   "Plano pronto · aguarda sua aprovação" e "Aprovar e seguir".
8. **WIP:** limite 1 em Análise → disparar dois cards → o segundo fica "Na fila" com o aviso no diálogo e
   começa quando o primeiro sai da coluna.
9. **Recusas:** arrastar card com `run` ativo (não arrasta; menu só com "Parar"); `qa-reader` (`viewer`) não
   vê botões nem arrasta; `operator` não edita limites.
10. **Celular:** menu "⋯" → "Mover para Análise" → mesmo diálogo, legível em 390 px.

Temas: claro e escuro em 1, 4 e 7. Viewports: desktop 1440 e celular 390 em 1, 6 e 10.

#### 8.2 Como produzir cada estado

`apps/api/scripts/fake-executor.mjs` (novo), com a trava `refuseSeedReason` de `emulatorTarget.mjs`:

- `node apps/api/scripts/fake-executor.mjs script <boardId> <slug> <outcome...>` grava
  `fakeExecutorScript/<cardId>`;
- `node apps/api/scripts/fake-executor.mjs expire <boardId> <slug>` põe `deadlineAt` do `run` ativo no passado.

O script fica no repositório (é ferramenta de QA do executor falso, como o seed), não é harness temporário.

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Soltar um card pronto numa etapa, como `operator`, abre a confirmação e cria um `run` com etapa, modelo,
   esforço, branch e quem disparou.
2. Um card com `run` ativo não é disparado nem movido de novo; a API responde 409 `CARD_RUN_ACTIVE`.
3. Com limite WIP, o excedente fica "Na fila" e começa quando uma vaga abre.
4. Com o executor falso, o card percorre as etapas sozinho e volta para Executando no `needs_rework`.
5. Na terceira volta de retrabalho, o card para com "Aguardando você".
6. Responder a pergunta redispara a mesma etapa.
7. Um `run` sem resposta até o limite vira "Falhou" com o motivo.
8. "Rodar de novo", "Parar" e "Aprovar e seguir" aparecem só quando fazem sentido e só para `operator`+.
9. Fora do emulador sem executor, nada dispara e a API responde 503 `RUN_EXECUTOR_UNAVAILABLE`.

## Etapa 2: blueprint técnico

### 10.1 Contrato do domínio (`packages/kanban-contract/src/run.ts`)

```ts
import type { BoardConfig } from "./boardConfig";
import type { Question } from "./agentContract";
import type { CardLane } from "./boardLanes";
import type { CardState, StageOutcome } from "./cardState";

export const RUN_STATUSES = ["queued", "running", "finished", "stopped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_END_REASONS = ["agent", "timeout", "dispatch_failed", "stopped"] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];

export const RUN_TRIGGERS = ["drag", "rerun", "approve", "answer", "transition"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const STAGE_EXECUTOR_KINDS = ["fake"] as const;
export type StageExecutorKind = (typeof STAGE_EXECUTOR_KINDS)[number];

export type RunPerson = { userId: string; login: string };

export type CardLastRun = {
    id: string;
    stageKey: string;
    status: RunStatus;
    outcome: StageOutcome | null;
    endReason: RunEndReason | null;
    stoppedByLogin: string | null;
    finishedAt: string | null;
};

export type StageDispatch = {
    runId: string;
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    agent: string | null;
    model: BoardConfig["stages"][number]["model"];
    effort: BoardConfig["stages"][number]["effort"];
    maxTurns: number;
    branch: string;
    repository: { owner: string; name: string };
    triggeredBy: RunPerson;
};

export type ActiveRunView = { runId: string; cardId: string; stageKey: string; startedAt: Date };

export type ExecutorReport = {
    runId: string;
    outcome: StageOutcome;
    summary: string;
    questions?: Question[];
};

export type StageExecutor = {
    kind: StageExecutorKind;
    dispatch(input: StageDispatch): Promise<{ ok: true; sessionUrl: string | null } | { ok: false; reason: string }>;
    cancel(runId: string): Promise<void>;
    collect?(runs: ActiveRunView[], now: Date): Promise<ExecutorReport[]>;
};

export type CardRunActions = { rerun: boolean; stop: boolean; approve: boolean };

export function cardRunActions(
    card: {
        lane: CardLane;
        stageKey: string | null;
        state: CardState;
        activeRunId: string | null;
        pendingAsk: unknown | null;
        lastRun: CardLastRun | null;
    },
    options: { canTrigger: boolean; executorAvailable: boolean }
): CardRunActions;
```

`boardConfig.ts`, dentro de `limits`:

```diff
                 maxTurnsPerStage: z.number().int().positive().default(DEFAULT_MAX_TURNS_PER_STAGE),
+                stageTimeoutMinutes: z
+                    .number()
+                    .int()
+                    .min(MIN_STAGE_TIMEOUT_MINUTES)
+                    .max(MAX_STAGE_TIMEOUT_MINUTES)
+                    .default(DEFAULT_STAGE_TIMEOUT_MINUTES),
```

`index.ts`: `export * from "./run";`.

### 10.2 SDK

`packages/sdk/src/types/board/run.ts`:

```ts
import type { CardLastRun, RunEndReason, RunStatus, RunTrigger, StageExecutorKind, StageOutcome } from "@repo/kanban-contract";
import type { CardDTO } from "./card";

export type CardLastRunDTO = CardLastRun;

export type RunDTO = {
    id: string;
    boardId: string;
    cardId: string;
    stageKey: string;
    command: string;
    model: string;
    effort: string;
    maxTurns: number;
    branch: string;
    trigger: RunTrigger;
    triggeredByLogin: string;
    executor: StageExecutorKind;
    status: RunStatus;
    outcome: StageOutcome | null;
    endReason: RunEndReason | null;
    queuedAt: string;
    startedAt: string | null;
    deadlineAt: string | null;
    finishedAt: string | null;
};

export type TriggerStageRequest = { stageKey: string };
export type TriggerStageResultDTO = { card: CardDTO; run: RunDTO };

export type BoardStageSettingDTO = { wipLimit: number | null; approvalGate: boolean };
export type BoardStageSettingsDTO = Record<string, BoardStageSettingDTO>;
export type UpdateBoardStageSettingsRequest = { stages: BoardStageSettingsDTO };
```

```diff
 // types/board/card.ts
 export type CardDTO = {
     …
     branch: string | null;
+    activeRunId: string | null;
+    lastRun: CardLastRunDTO | null;
     movedAt: string | null;
 …
-export type MoveCardRequest =
-    | { lane: "tasks" }
-    | { lane: "done" }
-    | { lane: "stage"; stageKey: string };
+export type MoveCardRequest = { lane: "tasks" } | { lane: "done" };

 // types/board/board.ts
 export type BoardDTO = {
     …
+    stageSettings: BoardStageSettingsDTO;

 // types/board/member.ts
-export type BoardViewDTO = BoardDTO & { access: BoardAccessDTO };
+export type BoardViewDTO = BoardDTO & { access: BoardAccessDTO; executor: StageExecutorKind | null };
```

```ts
// actions/boardCard/action.ts
async trigger(boardId: string, slug: string, body: TriggerStageRequest): Promise<TriggerStageResultDTO> // POST …/runs
async stop(boardId: string, slug: string): Promise<CardDTO>                                            // POST …/stop
// actions/board/action.ts
async updateStageSettings(boardId: string, body: UpdateBoardStageSettingsRequest): Promise<BoardViewDTO> // PATCH …/stage-settings
```

### 10.3 API (esqueletos)

```ts
// (shared)/lib/orchestrator/decide.ts (puro)
export type TriggerDecision =
    | { ok: false; code: "CARD_STAGE_NOT_FOUND" | "CARD_NOT_READY" | "CARD_BRANCH_INVALID"; status: number }
    | { ok: true; stage: StageConfig; branch: string; trigger: RunTrigger; resetReworkLoops: boolean };
export function decideTrigger(card: CardRecord, stageKey: string, config: BoardConfig): TriggerDecision;

export type CompletionPlan = {
    card: { lane: CardLane; stageKey: string | null; state: CardState; reworkLoops: number };
    next: { stageKey: string; trigger: "transition" | "answer" } | null;
};
export function planCompletion(input: {
    card: CardRecord;
    run: RunRecord;
    outcome: StageOutcome;
    config: BoardConfig;
    stageSettings: BoardStageSettingsDTO;
}): CompletionPlan; // única chamada a resolveTransition no app

export function pickPromotions(runs: RunRecord[], stageSettings: BoardStageSettingsDTO): RunRecord[];
export function findExpired(runs: RunRecord[], now: Date): RunRecord[];
```

```ts
// (shared)/lib/orchestrator/orchestrator.ts
export async function triggerStage(input: { board: BoardDTO; slug: string; stageKey: string; by: RunPerson; now?: Date }):
    Promise<{ ok: true; card: CardRecord; run: RunRecord } | { ok: false; code: string; status: number }>;
export async function stopRun(input: { board: BoardDTO; slug: string; by: RunPerson; now?: Date }):
    Promise<{ ok: true; card: CardRecord } | { ok: false; code: string; status: number }>;
export async function completeRun(input: { board: BoardDTO; runId: string; outcome: StageOutcome; endReason: RunEndReason; now?: Date }):
    Promise<{ ignored: boolean }>;
export async function resumeAfterAnswer(input: { board: BoardDTO; slug: string; by: RunPerson; now?: Date }): Promise<void>;
export async function moveOutOfStages(input: { board: BoardDTO; card: CardRecord; lane: "tasks" | "done"; by: RunPerson }):
    Promise<{ ok: true; card: CardRecord } | { ok: false; code: string; status: number }>;
export async function tick(board: BoardDTO, now?: Date): Promise<void>;
async function pumpBoard(board: BoardDTO, now: Date): Promise<void>;
```

```ts
// (shared)/repositories/run.repository.ts (as transações moram aqui)
class RunRepository extends BaseRepository<RunRecord> {
    constructor() { super(db, RUN_TABLE, runMapper); }
    listActiveByBoard(boardId: string): Promise<RunRecord[]>;
    enqueueOnCard(cardId: string, decide: (card: CardRecord) => EnqueueDecision, now: Date): Promise<EnqueueResult>;
    finishOnCard(runId: string, plan: (card: CardRecord, run: RunRecord) => CompletionPlan, close: RunClose, now: Date): Promise<FinishResult>;
    stopOnCard(cardId: string, by: RunPerson, now: Date): Promise<StopResult>;
    promote(boardId: string, pick: (runs: RunRecord[], board: BoardDTO) => RunRecord[], timeoutMinutes: number, now: Date): Promise<RunRecord[]>;
}
export const runRepository = new RunRepository();
```

```ts
// app/(routes)/boards/[id]/cards/[slug]/runs/route.ts
type CardRouteParams = { id: string; slug: string };

export const POST = requireBoardApi<CardRouteParams>("trigger", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const parsed = parseTriggerStage(body.value);
    if (!parsed.ok) return parsed.response;
    if (!getStageExecutor()) return errorResponse("RUN_EXECUTOR_UNAVAILABLE", HTTP_STATUS.SERVICE_UNAVAILABLE);

    const result = await triggerStage({
        board: ctx.board,
        slug: ctx.params.slug,
        stageKey: parsed.value.stageKey,
        by: { userId: ctx.subjectProfile.id, login: ctx.member.login },
    });
    if (!result.ok) return errorResponse(result.code, result.status);
    return Response.json(
        { data: { card: toCardDTO(result.card), run: toRunDTO(result.run) } },
        { status: HTTP_STATUS.CREATED }
    );
});
```

```ts
// app/(routes)/boards/[id]/cards/route.ts
export const GET = requireBoardApi("view", async (_req, ctx) => {
    await tick(ctx.board);
    const cards = await cardRepository.listByBoard(ctx.board.id);
    return Response.json({ data: sortCards(cards).map(toCardDTO) });
});
```

### 10.4 Payloads de exemplo

```http
POST /boards/b1/cards/agent-contract/runs
{ "stageKey": "analyze" }

201 { "data": {
  "card": { "slug": "agent-contract", "lane": "stage", "stageKey": "analyze", "state": "running",
            "activeRunId": "r9", "branch": "feat/agent-contract", "reworkLoops": 0, "lastRun": null, "…": "…" },
  "run":  { "id": "r9", "stageKey": "analyze", "command": "/analyze", "model": "opus", "effort": "high",
            "maxTurns": 200, "branch": "feat/agent-contract", "trigger": "drag", "triggeredByLogin": "qa-operator",
            "executor": "fake", "status": "running", "queuedAt": "2026-11-26T10:00:00.000Z",
            "startedAt": "2026-11-26T10:00:00.000Z", "deadlineAt": "2026-11-26T10:45:00.000Z", "…": "…" } } }

409 { "error": { "code": "CARD_RUN_ACTIVE" } }
503 { "error": { "code": "RUN_EXECUTOR_UNAVAILABLE" } }

PATCH /boards/b1/stage-settings
{ "stages": { "analyze": { "wipLimit": 1, "approvalGate": true }, "develop": { "wipLimit": null, "approvalGate": false } } }
200 { "data": { "stageSettings": { "analyze": { "wipLimit": 1, "approvalGate": true }, "…": "…" }, "executor": "fake", "…": "…" } }
```

### 10.5 Tabela `error.code` → status

| `error.code` | Status | Rota |
|--------------|--------|------|
| `CARD_RUN_ACTIVE` | 409 | `runs`, `move` |
| `CARD_RUN_NOT_ACTIVE` | 409 | `stop` |
| `CARD_BRANCH_INVALID` | 422 | `runs` |
| `RUN_EXECUTOR_UNAVAILABLE` | 503 | `runs` |
| `CARD_NOT_FOUND` (existente) | 404 | todas de card |
| `CARD_NOT_READY` (existente) | 409 | `runs` |
| `CARD_STAGE_NOT_FOUND` (existente) | 422 | `runs` |
| `VALIDATION_FAILED` (existente) | 400 | `runs`, `move`, `stage-settings` |
| `BOARD_ROLE_INSUFFICIENT` (existente) | 403 | todas as de escrita |

### 10.6 Documentos no Firestore

```
run/<auto> = {
  boardId, cardId: "<boardId>__<slug>", slug, stageKey: "review", command: "/review", agent: "revisor-codigo",
  model: "opus", effort: "high", maxTurns: 200, branch: "feat/<slug>",
  trigger: "transition", triggeredBy: { userId, login }, executor: "fake",
  status: "finished", active: false, outcome: "needs_rework", endReason: "agent", stoppedBy: null,
  queuedAt, startedAt, deadlineAt, finishedAt, sessionUrl: null, turns: null,
  createdAt, updatedAt, deletedAt: null
}

card/<boardId>__<slug> += {
  activeRunId: "<id do run de develop>" | null,
  lastRun: { id, stageKey: "review", status: "finished", outcome: "needs_rework", endReason: "agent",
             stoppedByLogin: null, finishedAt } | null
}

board/<boardId> += {
  stageSettings: { analyze: { wipLimit: 1, approvalGate: true } },
  runsPumpedAt: Timestamp
}

fakeExecutorScript/<boardId>__<slug> = { outcomes: ["success", "needs_rework", "silent"] }   // só emulador
```

### 10.7 Árvore de arquivos

```
packages/kanban-contract/
  src/run.ts (novo), src/boardConfig.ts (stageTimeoutMinutes), src/index.ts
  __tests__/run.test.ts (novo), __tests__/boardConfig.test.ts (limite)
packages/sdk/src/
  types/board/run.ts (novo), types/board/card.ts, types/board/board.ts, types/board/member.ts, types/board/index.ts
  actions/boardCard/action.ts (trigger, stop), actions/board/action.ts (updateStageSettings)
apps/api/
  (shared)/lib/orchestrator/decide.ts            (novo, puro)
  (shared)/lib/orchestrator/orchestrator.ts      (novo)
  (shared)/lib/orchestrator/executor.ts          (novo)
  (shared)/lib/orchestrator/fake-executor.ts     (novo)
  (shared)/lib/card-move.ts                      (sem a faixa stage; recusa run ativo)
  (shared)/mappers/run.mapper.ts                 (novo)
  (shared)/mappers/card.mapper.ts                (activeRunId, lastRun)
  (shared)/mappers/board.mapper.ts               (stageSettings, runsPumpedAt)
  (shared)/repositories/run.repository.ts        (novo)
  (shared)/repositories/card.repository.ts       (move grava state)
  (shared)/repositories/board.repository.ts      (updateStageSettings)
  (shared)/validation/run.schema.ts              (novo: parseTriggerStage, parseStageSettings)
  (shared)/validation/card.schema.ts             (parseMoveCard sem stage)
  app/(routes)/boards/[id]/route.ts              (executor no GET)
  app/(routes)/boards/[id]/stage-settings/route.ts (novo, PATCH)
  app/(routes)/boards/[id]/cards/route.ts        (tick)
  app/(routes)/boards/[id]/cards/[slug]/route.ts (tick)
  app/(routes)/boards/[id]/cards/[slug]/runs/route.ts (novo, POST)
  app/(routes)/boards/[id]/cards/[slug]/stop/route.ts  (novo, POST)
  app/(routes)/boards/[id]/cards/[slug]/move/route.ts  (moveOutOfStages)
  app/(routes)/boards/[id]/cards/[slug]/answers/route.ts (da card-timeline: + resumeAfterAnswer)
  scripts/fake-executor.mjs                      (novo)
  __tests__/orchestratorDecide.test.ts, fakeExecutor.test.ts, stageExecutorMode.test.ts, runMapper.test.ts,
  cardRunsRoutes.test.ts, orchestratorRuns.emulator.test.ts (novos); cardMapper.test.ts, boardCardsRoutes.test.ts,
  cardMove.test.ts, fakeCardRepository.ts (ajustes)
apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/
  (components)/TriggerStageDialog.tsx   (novo)
  (components)/StopRunDialog.tsx        (novo)
  (components)/CardRunActions.tsx       (novo: selo, motivo, botões; quadro e detalhe)
  (components)/cardRunReason.ts         (novo, puro: lastRun → texto)
  (components)/hasActiveRun.ts          (novo, puro)
  (components)/BoardStageSettingsForm.tsx (novo)
  (components)/BoardCardItem.tsx, BoardColumns.tsx, CardMoveMenu.tsx, CardStateBadge.tsx, BoardSummaryLine.tsx
  (hooks)/useBoardCardCrud.tsx (trigger, stop), useBoardCrud.tsx (stage settings),
  (hooks)/useListBoardCards.tsx, useFindBoardCardBySlug.tsx (refetchInterval)
  (validations)/stageSettingsSchema.ts  (novo)
  (pages)/[id]/BoardClient.tsx, (pages)/[id]/cards/[slug]/CardDetailClient.tsx, (pages)/[id]/settings/BoardSettingsClient.tsx
apps/app/__tests__/
  hasActiveRun.test.ts, triggerStageDialog.test.tsx, cardRunActions.test.tsx (novos); boardColumnsMove.test.tsx
packages/internationalization/translations/
  apps/app/pages/common/boards.ts, packages/shared/utils.ts (apiErrors)
docs/board/ARCHITECTURE.md (runs → run, campos reais), docs/board/CONTRACT.md (tempo limite configurável)
```

### 10.8 Chaves de i18n (pt-br)

```ts
// boards.ts
board: {
    summaryRuns: "{running} rodando · {queued} na fila",
    noExecutor: "Nenhum executor disponível: as etapas não podem ser disparadas neste ambiente.",
    card: {
        reworkLoop: "Volta {loop} de {max}",
        triggered: "{title}: {column} disparada.",
        queued: "{title} entrou na fila de {column}.",
        stopped: "{title}: execução parada.",
        runReason: {
            timeout: "O agente não respondeu em {minutes} min.",
            dispatchFailed: "Não foi possível iniciar a etapa.",
            stopped: "Parado por {login}.",
            awaitingApproval: "Plano pronto · aguarda sua aprovação",
        },
        runActions: {
            rerun: "Rodar de novo",
            rerunAria: "Rodar de novo: {title}",
            stop: "Parar",
            stopAria: "Parar: {title}",
            approve: "Aprovar e seguir",
            approveAria: "Aprovar e seguir: {title}",
        },
    },
},
trigger: {
    title: "Disparar a {column}?",
    rerunTitle: "Rodar {column} de novo?",
    approveTitle: "Aprovar e seguir para {column}?",
    description: "Você soltou “{title}” em {column}. O agente roda a etapa na branch do card e escreve o resultado no card.",
    command: "Comando",
    modelAndEffort: "Modelo e esforço",
    branch: "Branch do card",
    limit: "Limite",
    turns: "{count} turnos",
    wipFull: "A coluna {column} está no limite de {wip} cards. O card entra na fila e começa quando uma vaga abrir.",
    fakeExecutor: "Executor de teste: o resultado é simulado.",
    cancel: "Cancelar e voltar o card",
    confirm: "Disparar {column}",
    confirmRerun: "Rodar de novo",
    confirmApprove: "Aprovar e seguir",
},
stop: {
    title: "Parar {column}?",
    description: "A execução atual é interrompida e o card fica parado nesta coluna. O que o agente já enviou para a branch continua lá.",
    cancel: "Continuar rodando",
    confirm: "Parar",
},
settings: {
    stageSettings: {
        title: "Limites e aprovação",
        description: "Quantos cards cada etapa roda ao mesmo tempo e onde o board pede aprovação antes de seguir.",
        wipLimit: "Limite de cards",
        wipLimitHint: "Vazio para não limitar.",
        approvalGate: "Pedir aprovação antes da próxima etapa",
        approvalAlways: "Sempre",
        approvalNever: "Não exige",
        save: "Salvar limites e aprovação",
        saved: "Limites e aprovação salvos.",
        wipLimitInvalid: "Use um número de 1 a 20.",
        readOnly: "Só o dono do board muda limites e aprovação.",
    },
},
// card-timeline: troca de copy do botão
cardDetail.questions.submitAndResume: "Responder e retomar a {column}",
cardDetail.questions.resumed: "Resposta enviada. {column} roda de novo com ela.",

// packages/shared/utils.ts → apiErrors
CARD_RUN_ACTIVE: "Este card já está rodando uma etapa. Pare a execução ou espere ela terminar.",
CARD_RUN_NOT_ACTIVE: "Este card não está rodando nenhuma etapa.",
CARD_BRANCH_INVALID: "Não foi possível montar uma branch válida para este card. Confira o branchPattern do board.yml.",
RUN_EXECUTOR_UNAVAILABLE: "Nenhum executor disponível para rodar etapas neste ambiente.",
```

### 10.9 Pseudo-diffs

```diff
 // apps/api/(shared)/lib/card-move.ts
 export function decideCardMove(
-    card: Pick<CardRecord, "lane" | "stageKey" | "ready">,
+    card: Pick<CardRecord, "lane" | "stageKey" | "ready" | "activeRunId">,
     target: MoveCardRequest,
-    config: BoardConfig
 ): CardMoveDecision {
-    const targetStageKey = …; if (… stage inexistente) return CARD_STAGE_NOT_FOUND
+    if (card.activeRunId !== null) {
+        return { ok: false, code: "CARD_RUN_ACTIVE", status: HTTP_STATUS.CONFLICT };
+    }
     …
-    return { ok: true, unchanged: card.lane === target.lane && card.stageKey === targetStageKey };
+    return { ok: true, unchanged: card.lane === target.lane };
 }
```

```diff
 // apps/api/(shared)/repositories/card.repository.ts
 export type CardMovePatch = {
-    lane: CardRecord["lane"];
-    stageKey: string | null;
+    lane: "tasks" | "done";
     order?: number;
     movedByUserId: string;
 };
 …
-            .update({ lane: patch.lane, stageKey: patch.stageKey, …
+            .update({ lane: patch.lane, stageKey: null, state: "idle", …
```

```diff
 // apps/app/.../(components)/BoardColumns.tsx (dropOn)
         const target = moveTargetOf(column);
         if (target && !isCardInColumn(card, column)) {
-            onMove(card, { column, target });
+            if (column.lane === "stage") {
+                onTrigger(card, column);
+            } else {
+                onMove(card, { column, target });
+            }
         }
```

```diff
 // apps/app/.../(components)/BoardColumns.tsx (ColumnCard)
-                draggable={canPrioritize}
+                draggable={canPrioritize && card.activeRunId === null}
```

```diff
 // card-timeline: app/(routes)/boards/[id]/cards/[slug]/answers/route.ts
     const answered = await cardEventRepository.answer(…);   // transação da card-timeline
+    await resumeAfterAnswer({
+        board: ctx.board,
+        slug: ctx.params.slug,
+        by: { userId: ctx.subjectProfile.id, login: ctx.member.login },
+    }).catch(logResumeFailure);
+    const card = await cardRepository.findBySlug(ctx.board.id, ctx.params.slug);
     return Response.json({ data: { event: answered.event, card: toCardDTO(card ?? answered.card) } });
```

`logResumeFailure` usa o `log` de `@repo/shared/utils/helpers/log` (o redisparo que falha não pode transformar uma
resposta gravada em 500).

### 10.10 Ordem de implementação e commits

Sequência SDK → API → app → i18n, com o contrato antes de tudo:

1. `feat(kanban-contract): add run lifecycle types, executor interface and stage timeout` (`run.ts`,
   `stageTimeoutMinutes`, testes).
2. `feat(sdk): expose stage runs, stop and stage settings` (tipos, `MoveCardRequest` sem `stage`, ações).
3. `feat(api): store runs and decide transitions in the orchestrator` (`decide.ts`, `run.mapper`,
   `run.repository`, campos do card e do board, testes puros e de mapper).
4. `feat(api): trigger, stop and limit stage runs per column` (rotas `runs`, `stop`, `stage-settings`, `move`
   sem etapa, `executor` no `GET` do board, teste de rotas).
5. `feat(api): run a fake stage executor against the emulator` (`executor.ts`, `fake-executor.ts`, `tick` nos
   `GET`, `scripts/fake-executor.mjs`, teste do falso e do modo).
6. `feat(api): resume a stage after its questions are answered` (`resumeAfterAnswer` na rota da
   `card-timeline`).
7. `test(api): cover concurrent triggers and the full pipeline on the emulator`.
8. `feat(app): confirm stage triggers when dropping a card on a stage column` (diálogo, `BoardColumns`,
   `CardMoveMenu`, `useBoardCardCrud`, testes).
9. `feat(app): show run state, reasons and controls on cards` (`CardRunActions`, `StopRunDialog`, resumo,
   polling, detalhe, testes).
10. `feat(app): edit per-stage limits and approval in board settings`.
11. `feat(internationalization): add copy for stage runs and their errors`.
12. `docs(board): describe the run collection and the stage timeout`.
13. `docs(features): orchestrator` (último).

### 10.11 Env e configuração

Nenhuma variável nova. O executor falso depende só de `isEmulated()`. `firestore.indexes.json` não muda (só
consultas por igualdade). `firestore.rules` não muda.

## Infra (seção separada)

Nada a provisionar para o corte. Duas pendências entram em `docs/PRE-PRODUCTION.md`, seção "Pendências
registradas pelo pipeline", pelo `/develop`:

1. **Sem executor em produção até o `local-runner`.** Fora do emulador, `executor` é `null` e o quadro não
   dispara etapas. Esperado; some com a spec `local-runner`.
2. **Tempo limite sem ninguém olhando.** O `tick` só roda quando alguém lê o board ou quando um resultado chega.
   Para ciclos noturnos (`cycle-runs`), um `run` vencido só é marcado quando alguém abre o board. Opções quando
   isso pesar, todas pagas ou com custo de operação: Vercel Pro (cron por minuto), Firebase Blaze (função
   agendada, com cota gratuita de invocações) ou um agendador externo chamando uma rota protegida por segredo.
   Decisão de custo fica com o dono; o gatilho para reavaliar é o primeiro ciclo noturno que travar por isso.

## Riscos

- **Escrita em `GET`.** O `tick` grava em leitura. É idempotente e sem autor, mas uma leitura passa a custar
  uma consulta extra (`run`s ativos) e, quando algo fecha, transações. Volume de board pessoal: dezenas de
  documentos.
- **Promoção serializada pelo documento do board.** Todo `pumpBoard` grava `runsPumpedAt`; com muitos cards
  terminando juntos, transações repetem. Aceitável na escala de um board pessoal; a métrica para reavaliar é
  repetição de transação aparecendo no log.
- **`card-timeline` em implementação.** Nomes de `appendAgentEvent`, `agentEventFromTool` e da rota de resposta
  podem mudar. O `/develop` segue o código real; se a `card-timeline` não estiver pronta, o commit 6 e os eventos
  do executor falso esperam por ela, e o resto do slice não depende dela.
- **`pendingAsk` × `state`.** A `card-timeline` mostra "Aguardando você" por `pendingAsk`; aqui `state` passa
  a ser `waiting_input` no `needs_input` e no fim das voltas de retrabalho. Os dois concordam no fluxo normal.
  O caso "respondeu antes do `complete_stage`" é tratado em 4.3.
- **`MoveCardRequest` estreitado.** Quebra qualquer chamada a `move` com `stage`. Só o `apps/app` chama, e ele
  muda no mesmo slice; o `typecheck` pega o resto.
- **Etapa `pr` sem `pr-flow`.** Com o falso, o card passa por Aguardando PR como qualquer etapa. Com executor
  real, `/observe` roda sem PR aberta até a `pr-flow` chegar. Não afeta o corte.

## Perguntas em aberto

Decisões técnicas tomadas sem perguntar estão marcadas como **Adotada**; as de produto também, com a
alternativa, porque o `/cycle` roda sem ninguém.

1. **Cron da Vercel ou Cloud Functions (pergunta da spec).** **Adotada: nenhum dos dois.** Eventos no próprio
   request, relógio no `tick` das leituras e polling de 5 s com execução ativa. Os dois caminhos exigem plano
   pago para rodar mais de uma vez por dia (fontes em 1.2). Alternativa: Vercel Pro ou Blaze, registrada em
   Infra.
2. **Onde guardar WIP e aprovação.** **Adotada: no documento do board (`stageSettings`), editável pelo dono na
   aba Etapas**, como o desenho da Configuração mostra. Alternativa: campos novos no `board.yml`, que fariam
   cada mudança de limite virar commit no repositório importado.
3. **Zerar `reworkLoops`.** **Adotada: zera quando o card entra numa etapa vindo de Tarefas; "Rodar de novo" não
   zera.** Na terceira volta o card para; quem roda de novo assume a decisão, e um novo `needs_rework` para de
   novo. Alternativa: "Rodar de novo" zera o contador e o agente ganha mais duas voltas.
4. **Parar deixa o card `idle`.** **Adotada**, com "Parado por {login}" e "Rodar de novo". Alternativa: `failed`
   com motivo.
5. **Celular.** **Adotada: o menu "⋯" da `card-backlog` abre o mesmo diálogo de disparo.** A folha de destinos
   do `MMove.png` fica para uma melhoria de UI. Alternativa: implementar a folha agora com `drawer.tsx`.
6. **"Não pedir confirmação ao arrastar neste board".** **Adotada: fora do corte**; todo disparo confirma.
   Alternativa: preferência por pessoa e board.
7. **Histórico de execuções (aba Execuções, cabeçalho dos grupos da linha do tempo).** **Adotada: fora do corte**;
   o card mostra o último `run`. A coleção já guarda tudo para uma spec de histórico. Alternativa: incluir
   `GET …/runs` e a aba agora.
8. **Tempo limite padrão.** **Adotada: 45 min, configurável em `limits.stageTimeoutMinutes` (5 a 240)**.
   Alternativa: constante na API.
9. **Quem é o autor de uma etapa automática.** **Adotada: `triggeredBy` herdado do `run` anterior**, para a
   credencial seguir sendo de quem disparou. Alternativa: "board" como autor, o que exigiria a API key do board
   da fase 4.
10. **Produção sem executor.** **Adotada: o quadro não oferece disparo e a API responde 503
    `RUN_EXECUTOR_UNAVAILABLE`.** Arrastar para etapa deixa de funcionar fora do emulador até o `local-runner`,
    o que tira de produção o "mover para etapa sem disparar" da `card-backlog`. Alternativa: manter o mover
    sem disparo quando não há executor, com dois comportamentos para o mesmo gesto.
