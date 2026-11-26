# Plano: runner local

Spec de origem: [`specs/features/local-runner.md`](../../../../specs/features/local-runner.md), status `proposed` quando
o `/cycle` a executou (o usuário pediu o máximo de tarefas nesta branch; a spec não foi aprovada por ele). Depende
do `agent-contract`, que está sendo implementado ao mesmo tempo a partir de
[`docs/features/agent-contract/analyze/plan.md`](../../agent-contract/analyze/plan.md). Este plano parte do working tree
de 2026-11-26: tarefas 1 a 8 implementadas sem commit, e a 9 em andamento, com `run-token-format.ts`, `run-token.ts`
(`mintRunToken`, `issueRunToken`), `runRepository.setToken` e as rotas `/agent/tools/[tool]` e `/mcp` já no disco.
Onde o código real da `agent-contract` mudar um nome, o `/develop` segue o código e registra o desvio no handoff.

## Etapa 1: análise

### 1. Contexto

O orquestrador já dispara etapas, mas o único executor é o falso, que só existe no emulador
(`apps/api/(shared)/lib/orchestrator/executor-mode.ts:9-11`). Fora dele, `getStageExecutor()` devolve `null`, a rota
`runs` responde 503 `RUN_EXECUTOR_UNAVAILABLE` (`app/(routes)/boards/[id]/cards/[slug]/runs/route.ts:27`) e o quadro
avisa que nada pode ser disparado. A `agent-contract` dá ao agente as ferramentas e o token por `run`, mas ninguém
entrega esse token a uma sessão real.

Esta spec fecha o laço: um CLI na máquina de quem desenvolve se registra no board, busca trabalho por polling (só
conexões de saída), prepara um worktree na branch do card e roda `/<comando> <slug> --board <card>` com o login do
Claude dessa pessoa. A sessão escreve no card pelo MCP `kanban` com o token do `run`.

**Valor para o usuário:** é o que falta para o G2 do [ROADMAP](../../../board/ROADMAP.md) (três features de Análise a
Concluído no board). Sem o runner, o board só anda com o executor de teste.

**Corte de MVP** (o da spec, sem mudança de escopo):

1. CLI com `register` (troca um código do board por um token do runner) e `start` (polling).
2. Para cada `run`: clona ou atualiza o repositório numa pasta do runner, cria um worktree na branch do card e roda o
   comando da etapa com o modelo e o esforço da coluna.
3. Progresso no card (`post_update`) e o tempo da execução ao final.
4. Respeita `limits.maxTurnsPerStage`; Ctrl+C encerra a execução atual como `failed`.
5. Um runner atende só quem o registrou, e um `run` por vez.

**O que a spec não listou e o corte exige** (sem isso o corte não funciona; ver D4 e D5):

- O código de registro tem de nascer em algum lugar. Entra uma tela mínima, a seção "Runners locais" de
  [Minhas credenciais](../../../design/screenshots/Credentials.png): listar, gerar código e revogar. A spec dizia
  `apps/app` sem impacto.
- O orquestrador escolhe o executor por `run` (runner de quem disparou, executor falso no emulador, ou recusa) em vez
  de um executor global.

**Fora de escopo:**

- Várias execuções em paralelo no mesmo runner; rodar como serviço do sistema (spec).
- Publicar o CLI no npm (`npx agent-board-runner`, como no desenho). No MVP ele roda do checkout do agent-board.
- Estado do runner no cabeçalho do board, tarefas agendadas e API key do board (`execution-credentials`,
  `cloud-routines-runner`).
- Coleção `credentials` genérica e cifragem: o runner guarda só o hash do token (D6).
- Contagem de turnos de subagentes, custo por execução no board (custos estão fora do escopo do board,
  [DECISIONS](../../../board/DECISIONS.md)).

**Regras que governam o desenho:**

- Regra 14: o runner nunca move card. O agente chama `complete_stage`; quando o agente não chama (Ctrl+C, limite de
  turnos, processo morto), o runner chama `complete_stage(failed)` pela mesma rota do contrato, e o orquestrador
  aplica `resolveTransition` em `completeRun`.
- Regra 15: o token do runner sai da API uma vez, no registro, e o banco guarda só o hash. O token de execução sai uma
  vez, quando o runner pega o `run`, e vale só para aquele `run`. Nenhum token do GitHub App vai para o runner: o
  clone e o push usam as credenciais git da própria máquina.
- Regra 16: o prompt da sessão leva só `comando`, `slug` e `cardId`. Spec, respostas e comentários chegam pelo
  `get_card`, como dado.
- Regra de uso próprio da assinatura ([ACCESS](../../../board/ACCESS.md#com-que-credencial-a-execução-roda)): a API só
  entrega a um runner `run`s disparados pela pessoa que o registrou.

#### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/local-runner.md` | Corte, riscos (uso próprio, disco dos worktrees), sinal de pronto, pergunta "Agent SDK ou `claude -p`" |
| `.claude/cycle-policy.md` | Sem dependência nova sem relatório; escopo em `apps/*` salvo pacote de contrato; modo degradado com `error.code` |
| `docs/board/ARCHITECTURE.md` | Runner como adapter de executor; `run` com `executor`, `sessionUrl`, `turns` vazios até existir executor real |
| `docs/board/ACCESS.md:46-56` | Ordem de escolha da credencial; recusa com motivo no card; assinatura só para uso próprio |
| `docs/board/DECISIONS.md` | Riscos de agente sem supervisão; modelo e esforço vêm da coluna; Agent SDK devolve custo |
| `docs/board/ROADMAP.md` | Fase 1, item 10; G2 depende deste |
| `docs/board/CONTRACT.md` | Ferramentas e garantias (idempotência, tempo limite) |
| `.claude/rules/board-mode.md`, `kit/.claude/rules/board-mode.md` | O agente chama `get_card` no início, cria a branch na Análise, commita e pusha em toda etapa |
| `docs/design/screens/Credentials.dc.html` | Lista de runners (online, offline, ocupado com, último contato, final do token), código de 10 minutos, comando `register`/`start`, "Aguardando o runner se apresentar…" |
| `docs/features/orchestrator/develop/handoff.md` | `StageExecutor`, executor falso por polling no `tick`, `run.executor` preenchido na promoção |
| `apps/api/(shared)/lib/orchestrator/orchestrator.ts:134,152,176-218,273-319` | `getStageExecutor()` global em `stopRun`, `resumeAfterAnswer`, `pumpBoard` e `tick`; `collect` recebe todo `run` rodando |
| `apps/api/(shared)/lib/orchestrator/executor.ts`, `executor-mode.ts`, `fake-executor.ts` | Executor falso só no emulador; `collect` reporta qualquer `run` vencido que receba |
| `apps/api/(shared)/repositories/run.repository.ts:305-360` | `promote` grava o mesmo `executor` em todos os `run`s escolhidos |
| `apps/api/(shared)/mappers/run.mapper.ts` | `RunRecord` com `turns` e `sessionUrl` nulos; `toRunDTO` |
| `packages/kanban-contract/src/run.ts:15,32` | `RUN_END_REASONS`, `STAGE_EXECUTOR_KINDS = ["fake"]`, `StageDispatch`, `StageExecutor` |
| `apps/api/(shared)/lib/agent-contract/run-token-format.ts`, `run-token.ts` | `kbr_<runId>_<segredo>`, `mintRunToken`, `matchesRunToken`, `issueRunToken` (código em andamento) |
| `apps/api/(shared)/lib/rate-limit-subject.ts:61-64` | Ator só sai de JWT; o plano da `agent-contract` acrescenta `kbr_` |
| `apps/api/app/(guards)/common-panel.ts:64-69` | `assertReadOnlyWhileImpersonating` já recusa escrita sob personificação |
| `apps/api/(shared)/lib/board-view.ts:14` | `executor` do `BoardViewDTO` vem de `resolveStageExecutorMode()` |
| `apps/app/.../boards/(components)/cardRunReason.ts:39`, `TriggerStageDialog.tsx:175`, `BoardClient.tsx:91,116`, `BoardSectionNav.tsx` | Onde o app lê `executor` e `endReason` |
| `packages/kanban-contract/src/boardConfig.ts:21-22,69,84` | Modelos `opus`/`sonnet`/`haiku`; esforços `low` a `max`; `maxTurnsPerStage`; `environment.install` |
| `pnpm-lock.yaml`, `package.json` dos workspaces | Nem `@anthropic-ai/claude-agent-sdk` nem `tsx` no lockfile; `typescript` e `vitest` já em todos os workspaces |
| `claude --help` (CLI 2.1.321 instalado na máquina) | `-p`, `--output-format stream-json`, `--model`, `--effort`, `--mcp-config`, `--permission-mode`; `--max-turns` não aparece na ajuda |
| `pnpm-workspace.yaml` | Workspaces `apps/*` e `packages/*` |
| `firestore.rules:32-34` | Nega tudo ao cliente |
| `specs/reference/AUDIT.md:22,77-78,98` | `packages/runner` ainda não existe; `execution-credentials` depende deste |
| `specs/features/execution-credentials.md` | Dona da tela completa de credenciais, da coleção `credentials` e da cifragem |

Referências não lidas: o canvas do Claude Design é privado; usei a fonte e o PNG em `docs/design/`. As páginas da
documentação do Agent SDK e do Help Center citadas pela spec não foram abertas, porque o plano não usa o SDK (D1).

### 1.2 Apps impactados

| Onde | O quê |
|------|-------|
| `apps/runner` (novo) | O CLI: `register`, `start`, supervisor da sessão, worktrees, agente de teste e fixture de repositório |
| `packages/kanban-contract` | `STAGE_EXECUTOR_KINDS` ganha `local`; `RUN_END_REASONS` ganha `no_runner`; tipos e schemas do protocolo runner ↔ board (`runner.ts`) |
| `apps/api` | Coleções `runner` e `runnerRegistration`; guard do runner; rotas de registro, polling, heartbeat e fim; escolha do executor por `run`; correção do `collect` do falso; ator de rate limit por runner |
| `packages/sdk` | Recurso `runner` (listar, gerar código, revogar) e `RunnerDTO` |
| `apps/app` | Página "Minhas credenciais" do board com a seção "Runners locais"; aba no `BoardSectionNav`; texto do executor local no diálogo de disparo; motivo `no_runner` no card |
| `packages/internationalization` | Textos da página, do diálogo e do motivo; cinco códigos novos em `apiErrors` |
| Docs | `ARCHITECTURE.md`, `CONTRACT.md`, `SETUP.md`, `PRE-PRODUCTION.md`, `board-mode.md` (repo e kit) |

Área do painel: comum, dentro do board. Nada no admin.

### 2. Dados (Firestore)

#### 2.1 `runner` (nova)

| Campo | Tipo | Default | Por quê |
|-------|------|---------|---------|
| `userId` | string | | Dono; o `subjectProfile.id` de quem gerou o código |
| `name` | string | | Nome da máquina, `^[A-Za-z0-9._-]{1,40}$` |
| `tokenHash` | string | | SHA-256 em hex do segredo do token do runner |
| `tokenLast4` | string | | Os quatro últimos caracteres do segredo, para a tela ("token terminando em 7f2c") |
| `lastSeenAt` | Timestamp | criação | Último polling ou heartbeat; gravado no máximo a cada 30 s |
| `currentRunId` | string \| null | `null` | O `run` que o runner pegou e ainda não encerrou; garante um por vez |
| `createdAt`, `updatedAt` | Timestamp | | Padrão |
| `deletedAt` | Timestamp \| null | `null` | Revogar é soft delete; o guard recusa com `RUNNER_REVOKED` |

Id automático. `RunnerRecord` (interno) tem tudo; `RunnerDTO` (público) não tem `tokenHash` nem `userId`.

#### 2.2 `runnerRegistration` (nova)

| Campo | Tipo | Por quê |
|-------|------|---------|
| id do documento | SHA-256 do código normalizado | A busca é por id, e o código em claro não fica no banco |
| `userId` | string | Quem gerou |
| `expiresAt` | Timestamp | Criação + 10 minutos (o desenho diz "vale por 10 minutos") |
| `usedAt` | Timestamp \| null | Uso único |
| `runnerId` | string \| null | O runner que nasceu do código; a tela usa para sair de "Aguardando o runner se apresentar…" |
| `createdAt` | Timestamp | Padrão |

Código: oito caracteres do alfabeto Crockford base32 (sem `I`, `L`, `O`, `U`), mostrado como `XXXX-XXXX`. São 40 bits,
uso único, 10 minutos de validade, e a rota de registro está no orçamento de 60 POST por minuto por endereço. Documentos
vencidos ficam no banco; o volume é de poucos por mês.

#### 2.3 `run`: campos novos

| Campo | Tipo | Default | Por quê |
|-------|------|---------|---------|
| `runnerId` | string \| null | `null` | Qual runner pegou o `run`; o heartbeat e o fim conferem |
| `claimedAt` | Timestamp \| null | `null` | Quando o runner pegou; o `tick` usa para recusar `run` local que ninguém pegou |
| `runnerFinishedAt` | Timestamp \| null | `null` | Torna o `finish` idempotente (um só evento de tempo na linha do tempo) |

`turns` (já existe) passa a ser preenchido pelo heartbeat e pelo fim. `executor` aceita `local`. O mapper lê os campos
novos com `null` quando faltam (sem migração). O `RunDTO` não expõe `turns` nem os campos novos, e a tela de
execuções é de outra spec, então o DTO não muda.

`tokenHash`/`tokenExpiresAt` são da `agent-contract` e são gravados aqui também, na transação do `claim` (4.4).

#### 2.4 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| Runners de uma pessoa | `runner where userId == X`, filtro de `deletedAt` em memória | Nenhum (igualdade simples) |
| `run`s que um runner pode pegar | `run where executor == "local" and active == true and runnerId == null and triggeredBy.userId == X` | Nenhum composto: só igualdades, que o Firestore resolve juntando índices de campo único. O teste de emulador prova (7) |
| Runner pelo token | `doc(runnerId)`, com o id tirado do próprio token | Nenhum |
| Registro pelo código | `doc(sha256(código))` | Nenhum |

O `BaseRepository` não tem `orderBy`; a escolha do `run` mais antigo é em memória. Uma pessoa tem poucos `run`s
locais esperando ao mesmo tempo (o WIP limita), então o volume não pesa.

### 3. Contrato

#### 3.1 `packages/kanban-contract`

- `STAGE_EXECUTOR_KINDS = ["fake", "local"]`.
- `RUN_END_REASONS` ganha `no_runner`: o `run` não tinha runner online de quem disparou, ou nenhum runner o pegou
  dentro de `RUNNER_CLAIM_GRACE_MS`.
- `src/runner.ts` (novo): constantes de tempo, schemas Zod do registro e do fim, e os tipos das respostas que o CLI
  consome (`RunnerJob`, `RunnerClaimResult`, `RunnerHeartbeatResult`, `RunnerRegisterResult`). Forma em 10.1.

O CLI importa só **tipos** do contrato (`import type`): ele é compilado com `tsc` e o contrato é publicado como fonte
TypeScript (`exports: ./src/index.ts`), que o Node não carrega. Os schemas ficam no contrato porque a API os usa.

#### 3.2 `@repo/sdk`

| Tipo / ação | Contexto | Forma |
|-------------|----------|-------|
| `RunnerDTO` | common | `{ id, name, online, lastSeenAt, createdAt, tokenLast4, currentRun: { boardId, cardId, slug, stageKey } \| null }` |
| `RunnerRegistrationDTO` | common | `{ code, expiresAt }` |
| `runner.list()` | `GET /runners` | `RunnerDTO[]` |
| `runner.createRegistration()` | `POST /runners/registrations` | `RunnerRegistrationDTO` |
| `runner.revoke(id)` | `DELETE /runners/[id]` | `void` |

As rotas `/runner/*` do CLI não entram no SDK: o SDK é a porta do front, e o CLI não é front.

#### 3.3 Quem quebra

- `StageExecutorKind` ganha `local`: `TriggerStageDialog` compara com `"fake"` e continua compilando; o texto do local
  entra novo.
- `RunEndReason` ganha `no_runner`: `cardRunReason` passa a tratar o caso.
- `getStageExecutor()` passa a receber o tipo (`getStageExecutor(kind)`); `toBoardView` passa a receber o executor
  resolvido por quem pede. Os testes de rota que mockam esses módulos mudam de arranjo, sem afrouxar asserção.

### 4. API

#### 4.1 Rotas

| Rota | Autenticação | O que faz |
|------|--------------|-----------|
| `GET /runners` | `requireCommonPanelApi` | Runners da pessoa, sem segredo |
| `POST /runners/registrations` | `requireCommonPanelApi` (escrita recusada sob personificação) | Gera um código de 10 minutos |
| `DELETE /runners/[id]` | `requireCommonPanelApi` | Revoga (soft delete); runner de outra pessoa → 404 `RUNNER_NOT_FOUND` |
| `POST /runner/register` | nenhuma (o código é a credencial) | `{ code, name }` → `{ runnerId, name, token }`, uma vez |
| `POST /runner/claim` | `Authorization: Bearer kbl_…` | Atualiza `lastSeenAt`; devolve `{ job }` ou `{ job: null }` |
| `POST /runner/runs/[runId]/heartbeat` | `Bearer kbl_…` | `{ turns }` → `{ active }`; `active: false` manda o runner encerrar a sessão |
| `POST /runner/runs/[runId]/finish` | `Bearer kbl_…` | `{ turns, durationMs, exit, sessionId? }`; grava `turns`, libera o runner e escreve o evento de tempo |

Nenhuma rota `/runner/*` passa por `requireBoardApi`: quem chama é a máquina, não a pessoa. O papel efetivo foi
checado no disparo (`requireBoardApi("trigger")`), e o `claim` só entrega `run` cujo `triggeredBy.userId` é o dono do
runner. Mesmo argumento da D3 da `agent-contract`.

#### 4.2 Token do runner

`kbl_<runnerId>_<segredo>`, segredo de 32 bytes em base64url (43 caracteres), regex
`^kbl_([A-Za-z0-9]{1,128})_([A-Za-z0-9_-]{43})$`. Mesmo formato do `kbr_` da `agent-contract`, com outro prefixo para
que um token nunca sirva no lugar do outro. `runner-token-format.ts` fica sem `node:crypto` (o `proxy` importa), e o
hash e a comparação reaproveitam `hashRunSecret`/`timingSafeEqual` de `run-token.ts` (renomear para algo neutro, como
`hashTokenSecret`, fica a critério do `/develop`).

#### 4.3 Guard `requireRunnerApi` (`app/(guards)/runner.ts`)

1. Sem `Bearer`, fora da regex, runner inexistente ou hash diferente → 401 `RUNNER_TOKEN_INVALID`, com
   `WWW-Authenticate: Bearer`.
2. `deletedAt` preenchido → 401 `RUNNER_REVOKED` (o CLI diz "runner revogado, registre de novo").
3. Grava `lastSeenAt = now` se o valor guardado tiver mais de 30 s (`RUNNER_SEEN_WRITE_INTERVAL_MS`).
4. Entrega `RunnerContext = { runner, now }`.

Não lê cookie; personificação não se aplica.

#### 4.4 `claim`

`runnerRepository.claimNext(runner, now)` numa transação:

1. Relê o runner. Revogado → recusa. `currentRunId` preenchido e esse `run` ainda `active` → `{ job: null }` (um por
   vez, garantido no servidor). `currentRunId` de `run` já encerrado → limpa.
2. Consulta de 2.4 dentro da transação; `pickClaimable(runs, runner, now)` (puro) fica com os `run`s `running` cujo
   `deadlineAt` ainda não passou e escolhe o de `startedAt` mais antigo.
3. `mintRunToken(run.id)`; grava no `run` `runnerId`, `claimedAt`, `tokenHash` e `tokenExpiresAt = deadlineAt`; grava
   no runner `currentRunId`.
4. Fora da transação, monta `RunnerJob` com o board (`boardRepository.findById`): repositório, `baseBranch` e
   `environment.install` do snapshot do `board.yml`, e devolve o token em claro.

Dois runners da mesma pessoa pedindo ao mesmo tempo: a transação relê o `run` e só um grava `runnerId`.

Reusar `issueRunToken` exigiria uma segunda transação; o `claim` grava o token na mesma, com `mintRunToken`. Se o
`/develop` da `agent-contract` mudar o nome dos campos do token, segue o código de lá.

#### 4.5 `heartbeat` e `finish`

- `heartbeat`: `run.runnerId !== runner.id` → 403 `RUNNER_RUN_MISMATCH`. Grava `turns` (inteiro ≥ 0) e devolve
  `{ active: run.active }`. É assim que "Parar" chega à máquina: a API não abre conexão para o runner, e o runner
  encerra a sessão no próximo heartbeat (a cada 15 s).
- `finish`: mesma checagem. Grava `turns` e `runnerFinishedAt`; limpa `runner.currentRunId` se for este `run`; se
  `runnerFinishedAt` já estava preenchido, devolve 200 sem nada gravar. Acrescenta um evento `update` de agente à
  linha do tempo, com `runId`, montado pela API a partir dos números (nenhum texto livre do runner):
  `Runner \`macbook\`: \`/analyze\` terminou em 12 min · 84 turnos.` com uma segunda linha por `exit` (interrompida no
  runner, limite de turnos, prazo, parada no board, erro) e, se houver, `Sessão local: \`<uuid>\`` para `claude --resume`.
  Mesmo precedente de markdown pt-br escrito pela API que o `fakeReport` usa.

O evento de tempo não vai por `post_update` porque, depois do `complete_stage`, o token do `run` só aceita repetir o
`complete_stage` (409 `AGENT_RUN_CLOSED` na `agent-contract`).

#### 4.6 Escolha do executor por `run` (orquestrador)

Hoje `getStageExecutor()` é global e `promote` grava o mesmo `executor` em todo `run` promovido
(`run.repository.ts:337,351`). Passa a ser por pessoa:

```ts
// executor-mode.ts
export function resolveStageExecutorMode(input: { hasOnlineRunner: boolean }): StageExecutorKind | null {
    if (input.hasOnlineRunner) return "local";
    return isEmulated() ? "fake" : null;
}
```

- `resolveExecutorFor(userId, now)` (em `executor.ts`) lê os runners da pessoa e aplica `isRunnerOnline`
  (`lastSeenAt` nos últimos 60 s, `RUNNER_ONLINE_WINDOW_MS`).
- Rota `runs`: troca `getStageExecutor() === null` por `resolveExecutorFor(subjectProfile.id) === null` → 503
  `RUN_EXECUTOR_UNAVAILABLE` (código existente, copy ajustada para falar do runner).
- `pumpBoard`: antes do `promote`, resolve o executor de cada `triggeredBy.userId` dos `run`s na fila (uma leitura por
  pessoa distinta). `promote` recebe `executorFor(run) → kind | null` no lugar de `executor`. Depois do `promote`, `run`
  sem executor vai para `completeRun(failed, endReason: "no_runner")`; com executor, `getStageExecutor(kind).dispatch`.
  O executor local não faz nada no `dispatch` (quem busca é o runner) e devolve `{ ok: true, sessionUrl: null }`.
- `tick`:
  - **correção:** o `collect` do falso recebe só `run`s com `executor === "fake"`. Hoje recebe todo `run` rodando
    (`orchestrator.ts:289-296`) e responderia no lugar do runner depois de 3 s.
  - `findUnclaimed(runs, now)` (puro): `run` `local`, `running`, `runnerId === null` e `startedAt` há mais de
    `RUNNER_CLAIM_GRACE_MS` (2 min) → `completeRun(failed, "no_runner")`. Cobre o runner que ficou offline entre o
    disparo e a promoção (card esperando na fila por WIP).
- `resumeAfterAnswer`: a checagem `getStageExecutor() === null` vira `resolveExecutorFor(input.by.userId)`.
- `stopRun`: lê o `run` parado e chama `getStageExecutor(run.executor)?.cancel`. Os dois `cancel` não fazem nada; a
  parada chega ao runner pelo heartbeat.
- `toBoardView(board, access, executor)`: as rotas de board resolvem `executor` uma vez por requisição para quem pede.
  Com runner online, `local`; no emulador sem runner, `fake`; fora dele sem runner, `null`, e o quadro mostra o aviso
  com link para "Minhas credenciais".

Runner que cai no meio de um `run` já pego não é detectado pelo heartbeat no MVP: o prazo da etapa (`deadlineAt`)
encerra como `timeout`. Risco registrado.

#### 4.7 Rate limit

`rateLimitSubject` reconhece `kbl_` como reconhece `kbr_` (plano da `agent-contract`, 4.5) e usa
`runner:<runnerId>` como ator. O polling a cada 10 s fica em 6 POST por minuto, longe dos 60 do orçamento.

#### 4.8 Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `RUNNER_TOKEN_INVALID` | 401 | Sem token, formato errado, runner inexistente ou segredo diferente |
| `RUNNER_REVOKED` | 401 | Runner revogado |
| `RUNNER_CODE_INVALID` | 400 | Código inexistente, vencido ou já usado (um código só, para não virar oráculo) |
| `RUNNER_NOT_FOUND` | 404 | `DELETE` de runner inexistente ou de outra pessoa |
| `RUNNER_RUN_MISMATCH` | 403 | `heartbeat`/`finish` de `run` que este runner não pegou |
| `VALIDATION_FAILED` (existente) | 400/413 | Corpo fora do schema |
| `RUN_EXECUTOR_UNAVAILABLE` (existente) | 503 | Disparo sem runner online de quem dispara, fora do emulador |

Os cinco novos entram em `apiErrors`.

### 5. CLI (`apps/runner`)

#### 5.1 Onde mora e como roda

Workspace `apps/runner`, pacote `runner`, TypeScript compilado com `tsc` para `dist/`, sem dependência de runtime além
do Node 22 (`fetch`, `child_process`, `fs`, `crypto`, `readline`). Script `cli`: `tsc -p tsconfig.build.json && node
dist/cli.js`. Uso: `pnpm --filter runner cli register KQ7M-4XPD --api https://…` e `pnpm --filter runner cli start`.
Sem script `build`, para não entrar no `turbo build` nem no deploy. `typecheck` e `test` (Vitest) como os demais.

#### 5.2 Comandos e opções

| Comando | O que faz |
|---------|-----------|
| `register <código> [--api <url>] [--name <nome>]` | Chama `POST /runner/register`; grava `~/.agent-board-runner/config.json` (modo 0600) com `apiUrl`, `runnerId`, `name` e `token`. Nome padrão: `os.hostname()` saneado |
| `start` | Laço de polling; um `run` por vez |

Opções de `start` (todas com padrão; nenhuma obrigatória no uso real):

| Opção | Padrão | Para quê |
|-------|--------|----------|
| `--home <dir>` / `AGENT_BOARD_RUNNER_HOME` | `~/.agent-board-runner` | Config, clones, worktrees e logs |
| `--poll-interval <s>` | 10 | Intervalo do polling ocioso |
| `--repo-base <url>` | `https://github.com` | Clone em `<base>/<owner>/<name>.git`. Aceita `file://` |
| `--permission-mode <modo>` | `bypassPermissions` | Repassado ao `claude` (pergunta 1) |
| `--keep-worktrees` | desligado | Não apaga o worktree no fim, para depurar |
| `--agent-command <cmd>` | `claude` | **Modo de teste**: roda outro executável no lugar do `claude` (5.6). Só aceito com `--repo-base file://…` |

#### 5.3 Um `run`, passo a passo

1. `claim` devolve `job`. Revalida `slug`, `cardId`, `branch` e `command` com regex antes de usar em git ou processo
   (tudo por `spawn` com argv, nunca shell, exceto o `install`).
2. Repositório: `<home>/repos/<owner>/<name>`. Não existe → `git clone <url>`; existe → `git fetch origin --prune`.
3. Worktree em `<home>/worktrees/<runId>`: se `origin/<branch>` existe,
   `git worktree add -B <branch> <dir> origin/<branch>`; senão, `git worktree add --no-track -B <branch> <dir>
   origin/<baseBranch>`. O `--no-track` evita a branch nova apontar para `origin/main` e o `git push` do agente cair
   na base. Commit local de etapa anterior que não foi pushado é descartado: a regra do modo board exige push em toda
   etapa.
4. `post_update` com o token do `run`: "Runner `macbook` começou `/analyze search-cards` na branch `feat/search-cards`."
5. `environment.install` do `board.yml`, se houver, com `sh -c` no worktree. Falha → passo 9 com `exit: "error"`.
6. Arquivo `<home>/runs/<runId>/mcp.json` (0600):
   `{ "mcpServers": { "kanban": { "type": "http", "url": "<apiUrl>/mcp", "headers": { "Authorization": "Bearer ${KANBAN_RUN_TOKEN}" } } } }`.
   O token vai na env do processo filho, não no arquivo. O `/develop` confirma na documentação do Claude Code que a
   expansão de `${VAR}` vale para `--mcp-config`; se não valer, grava o token literal nesse arquivo 0600 fora do
   worktree e o apaga no fim, e registra o desvio.
7. Processo: `claude -p "<command> <slug> --board <cardId>" --model <model> --effort <effort> --output-format
   stream-json --verbose --mcp-config <arquivo> --permission-mode <modo> --max-turns <maxTurns>`, `cwd` no worktree,
   env herdada **sem** o token do runner e com `KANBAN_RUN_TOKEN`, `KANBAN_API_URL`, `KANBAN_CARD_ID`.
   `--max-turns` não aparece no `--help` do CLI 2.1.321; o `/develop` confirma na referência do CLI. A contagem do
   runner (passo 8) é a garantia, com ou sem a flag.
8. Supervisor, lendo o `stream-json` linha a linha:
   - conta turnos: mensagens `assistant` com `parent_tool_use_id` nulo (sessão principal). Passou de `maxTurns` →
     encerra o processo (`SIGTERM`, `SIGKILL` depois de 10 s) com `exit: "turn_limit"`;
   - guarda o `session_id` da mensagem `system/init`;
   - imprime no terminal uma linha curta por ferramenta usada, e o custo do `result` (`total_cost_usd`) só no
     terminal: o board não mostra custo, mas o G2 precisa medir consumo;
   - grava o stream inteiro em `<home>/logs/<runId>.jsonl`;
   - heartbeat a cada 15 s com `turns`; `active: false` → encerra com `exit: "stopped"`; 401 `RUNNER_REVOKED` →
     encerra com `exit: "error"`;
   - prazo: no `deadlineAt` encerra com `exit: "deadline"` (o `tick` já marca `timeout`).
9. Fim, em qualquer caso:
   - se `exit` não é `stopped` nem `deadline`, chama `complete_stage(failed)` com o molde de relatório do CONTRACT.md e
     o motivo. Se o agente já tinha chamado, a `agent-contract` devolve `{ ignored: true }` sem gravar nada. Saída 0 do
     processo sem `complete_stage` vira "O agente terminou sem chamar complete_stage.";
   - `finish` com `turns`, `durationMs`, `exit` e `sessionId`;
   - remove o worktree (`git worktree remove --force` + `git worktree prune`) e `<home>/runs/<runId>`, salvo
     `--keep-worktrees`.
10. Volta ao polling.

Ctrl+C: o primeiro `SIGINT` faz o passo 9 com `exit: "interrupted"` e sai; o segundo sai na hora. Sem `run` em
andamento, sai direto.

Falha de rede no polling: espera crescente até 60 s e tenta de novo; 401 no polling encerra o CLI com a mensagem do
código.

#### 5.4 Arquivos

```
apps/runner/
  package.json            runner, type module, scripts cli/test/typecheck
  tsconfig.json           base + module ESNext + moduleResolution Bundler (typecheck, inclui __tests__)
  tsconfig.build.json     outDir dist, rootDir src
  vitest.config.mts
  src/
    cli.ts                parse de argv (sem biblioteca), despacha register/start
    config.ts             caminhos do home, ler/gravar config 0600
    api.ts                cliente fetch: register, claim, heartbeat, finish, tools (post_update, complete_stage)
    poll.ts               laço de polling com espera crescente
    git.ts                worktreePlan (puro: argv de cada passo) e runGit
    session.ts            buildPrompt, buildAgentArgs, buildAgentEnv, mcpConfig (puros)
    supervisor.ts         spawn, leitura do stream-json, limite de turnos, heartbeat, prazo, sinais
    turns.ts              countTurn / readStreamLine (puros)
    report.ts             failureSummary (molde do CONTRACT.md) e mensagens por exit
    run-job.ts            orquestra 5.3 para um job
  scripts/
    stub-agent.mjs        agente de teste (5.6)
    fixture-repo.mjs      cria um repositório bare local para o teste (5.6)
  __tests__/
```

Os relativos usam extensão `.js` nos imports (o `tsc` emite como está).

#### 5.5 Mensagens do CLI

Saem em pt-br no terminal, sem passar pelo `@repo/internationalization`: o dicionário é da UI web e o CLI não depende
de pacote de runtime do monorepo. Desvio declarado da regra 2, que fala de texto de interface do app.

#### 5.6 Modo de teste (sem chamada paga)

`--agent-command "node apps/runner/scripts/stub-agent.mjs"` troca só o executável. Todo o resto é o caminho real:
registro, polling, `claim`, token do `run`, clone, worktree, `install`, arquivo MCP, supervisor, heartbeat,
`complete_stage`, `finish` e limpeza.

Travas para nunca tocar repositório real no teste:

- o CLI recusa `--agent-command` sem `--repo-base file://…`;
- o `stub-agent.mjs` confere `git remote get-url origin` e recusa push se a URL não começa com `file://`.

`stub-agent.mjs` (Node puro, sem dependência):

1. Lê `KANBAN_RUN_TOKEN`, `KANBAN_API_URL`, `KANBAN_CARD_ID` e o prompt (`argv`), e o `--mcp-config` para provar que o
   arquivo existe e aponta para `/mcp`.
2. Imprime `stream-json` falso: um `system/init` com `session_id`, `STUB_TURNS` mensagens `assistant` (padrão 3) e um
   `result`.
3. `get_card` e `post_update` pelo HTTP do contrato (`/agent/tools/...`).
4. Escreve `docs/features/<slug>/runner-smoke/<stageKey>.md` no worktree, `git commit` e `git push origin <branch>`
   (para o repositório bare local).
5. `complete_stage` com `STUB_OUTCOME_<STAGE>` ou `STUB_OUTCOME` (padrão `success`). `STUB_OUTCOME=none` sai sem chamar
   `complete_stage`. `needs_input` chama `ask` antes, com uma pergunta fixa.
6. `STUB_HANG=1` dorme até receber sinal (para Ctrl+C e "Parar").

`fixture-repo.mjs <dir>` cria `<dir>/agent-board-demo/sample-app.git` (bare) com um commit em `main` (README e
`.kanban/board.yml` mínimo), que é o dono e o nome do repositório de exemplo do emulador
(`github-sample-repositories.ts:223`).

### 6. Front-end

#### 6.1 Rotas

| Rota | Arquivo | O quê |
|------|---------|-------|
| `/boards/[id]/credentials` | `boards/(pages)/[id]/credentials/page.tsx` + `BoardCredentialsClient.tsx` | "Minhas credenciais" com a seção "Runners locais" do desenho e o quadro lateral "Com que credencial cada disparo roda" só com o item 1 e o 3 (o 2, API key, é da fase 4) |

A página fica no board porque é onde o desenho a põe; os runners são da pessoa e aparecem iguais em todo board. A
`execution-credentials` completa a página com a nuvem.

Prefetch RSC: `board.findById(id)` e `runner.list()`, com o mesmo `isImpersonating()` das outras páginas do board.

#### 6.2 Componentes e hooks

| Item | Arquivo | Notas |
|------|---------|-------|
| `useListRunners` + `fetchRunnerList` | `boards/(hooks)/useListRunners.tsx` | `refetchInterval` de 5 s só enquanto há código aberto ou algum runner ocupado; nada com `invalidateQueries` em toggle |
| `useRunnerCrud` | `boards/(hooks)/useRunnerCrud.tsx` | `createRegistrationMutation`, `revokeMutation` (remove da lista em cache) |
| `RunnerList` | `boards/(components)/RunnerList.tsx` | Um item por runner: nome, selo Online/Offline (`Badge`), "Ocupado com `<slug>` · <coluna>" ou "Sem contato desde …", "Registrado em … · último contato há … · token terminando em …", botão Revogar |
| `RunnerRegistrationPanel` | `boards/(components)/RunnerRegistrationPanel.tsx` | Botão "Gerar código"; depois, os dois comandos em fonte mono com Copiar, a validade e "Aguardando o runner se apresentar…" até um runner novo aparecer na lista |
| `RevokeRunnerDialog` | `boards/(components)/RevokeRunnerDialog.tsx` | Confirmação; avisa que um `run` em andamento nessa máquina para no próximo heartbeat |
| `runnerCommands` | `boards/(components)/runnerCommands.ts` | Monta `pnpm --filter runner cli register <código> --api <NEXT_PUBLIC_API_URL>` e `pnpm --filter runner cli start` |

Estados: carregando (skeleton), vazio ("Nenhum runner registrado" + o painel aberto), erro (`handleClientError`),
personificação (`ImpersonationReadOnlyNotice`, botões desabilitados; a API já recusa a escrita).

#### 6.3 Ajustes em telas existentes

- `BoardSectionNav`: seção `credentials` ("Minhas credenciais"), para todo membro.
- `BoardClient`: o aviso sem executor (`board.executor === null`) passa a dizer que nenhum runner seu está online, com
  link para "Minhas credenciais".
- `TriggerStageDialog`: `executor === "local"` mostra "Roda no seu runner local." no lugar do aviso do executor de
  teste.
- `cardRunReason`: `endReason === "no_runner"` → "Nenhum runner seu pegou esta etapa. Inicie o runner e rode de novo."
- `paths.ts`: `boards.credentials(id)`. `queryKeys`: `runners.list()`.

### 7. i18n (pt-br)

```
apps.app.pages.common.boards
  nav.credentials
  board.noExecutor                     (texto novo, com {link})
  board.card.runReason.noRunner
  trigger.localExecutor
  credentials.{ title, description, runners.{ title, description, empty, online, offline, busy, lastSeen,
    neverSeen, registered, tokenEnding, revoke }, register.{ title, generate, step1, step2, validity,
    waiting, copy, copied }, revokeDialog.{ title, description, confirm, cancel, success },
    howItRuns.{ title, own, refused } }
packages.shared.utils.apiErrors
  RUNNER_TOKEN_INVALID, RUNNER_REVOKED, RUNNER_CODE_INVALID, RUNNER_NOT_FOUND, RUNNER_RUN_MISMATCH
  RUN_EXECUTOR_UNAVAILABLE                (copy ajustada)
```

Valores em 10.6.

### 8. Autorização e segurança

- Token do runner: 256 bits, só o hash no banco, comparação em tempo constante, revogável. O arquivo de config fica em
  modo 0600 no home da pessoa, fora de qualquer repositório.
- Código de registro: 40 bits, uso único, 10 minutos, hash como id, orçamento de rate limit por endereço.
- Escopo do runner: só `run`s disparados pelo dono (`triggeredBy.userId`), checado dentro da transação do `claim`.
  Teste dedicado.
- O processo do agente recebe o token do `run`, nunca o do runner.
- Nenhuma credencial do GitHub App sai da API: clone e push usam git e as credenciais da máquina. Commits saem no nome
  do git configurado na máquina, que é o de quem disparou (ACCESS).
- `--permission-mode bypassPermissions` por padrão (pergunta 1): a sessão roda sem pedir permissão, dentro do worktree,
  com os hooks do repositório (o `block-protected-branch-write.sh` continua valendo) e o ruleset do GitHub como rede.
- `environment.install` roda com shell. Vem do `board.yml` do mesmo repositório cujo código o agente já executa; não
  abre superfície nova.
- Personificação: `POST`/`DELETE /runners` já são recusados por `assertReadOnlyWhileImpersonating`. `GET` mostra os
  runners da pessoa personificada, sem segredo.
- Nenhum log com token. `logEvent("runner", …)` leva `runnerId`, `runId` e o código.
- `firestore.rules` nega tudo ao cliente; as coleções novas herdam.

### 9. Testes

| Nível | Arquivo | O que prova |
|-------|---------|-------------|
| Contrato | `packages/kanban-contract/__tests__/runner.test.ts` | `runnerRegisterSchema` recusa código com caractere fora do alfabeto e nome com espaço; normaliza `kq7m-4xpd`; `runnerFinishSchema` recusa `turns` negativo e `exit` desconhecido |
| Contrato | `__tests__/run.test.ts` (existente) | `no_runner` está em `RUN_END_REASONS`; `local` em `STAGE_EXECUTOR_KINDS` |
| API, puro | `apps/api/__tests__/runnerToken.test.ts` | Formato `kbl_`; um `kbr_` não passa como `kbl_` e vice-versa; hash bate; segredo diferente recusado |
| API, puro | `__tests__/runnerClaim.test.ts` | `pickClaimable`: ignora `run` de outra pessoa, de executor `fake`, já pego, vencido; escolhe o mais antigo. `isRunnerOnline` no limite de 60 s |
| API, puro | `__tests__/orchestratorDecide.test.ts` (existente) | `findUnclaimed` no limite de 2 min; não pega `run` já pego nem `fake` |
| API, puro | `__tests__/stageExecutorMode.test.ts` (existente) | Runner online → `local` dentro e fora do emulador; sem runner → `fake` no emulador e `null` fora |
| API, orquestrador | `__tests__/orchestratorTick.test.ts` (novo, repositórios mockados) | **Regressão:** o `collect` do falso não recebe `run` `local`; `run` local sem runner na promoção vira `completeRun(failed, "no_runner")`; `run` não pego há 2 min idem |
| API, rota | `__tests__/runnerRoutes.test.ts` | Com `vi.mock` dos repositórios: registro com código inválido, vencido ou usado → 400 `RUNNER_CODE_INVALID`; registro válido devolve token uma vez e o repositório recebe só o hash; `claim` sem token 401, revogado 401 `RUNNER_REVOKED`; `claim` com `run` em andamento devolve `job: null`; `heartbeat` de outro runner 403; `heartbeat` de `run` parado devolve `active: false`; `finish` duas vezes grava um evento só |
| API, rota | `__tests__/runnersRoutes.test.ts` | `GET /runners` sem `tokenHash` nem `userId` na resposta; `DELETE` de runner alheio 404; `POST /runners/registrations` personificando 403 (guard real) |
| API, rota | `__tests__/cardRunsRoutes.test.ts` (existente) | Fora do emulador, sem runner online → 503; com runner online → 201 |
| API, puro | `__tests__/rateLimitSubject.test.ts` (existente) | `kbl_` vira ator por runner |
| API, emulador | `__tests__/runnerClaim.emulator.test.ts` | O que o unitário não prova: a consulta com quatro igualdades, uma delas em `triggeredBy.userId`, roda no Firestore sem índice composto; dois `claim` simultâneos de runners da mesma pessoa entregam o `run` a um só; o `tokenExpiresAt` gravado no `claim` é lido pelo guard do agente (`get_card` responde 200 com o token devolvido) |
| Runner | `apps/runner/__tests__/turns.test.ts` | Conta só `assistant` da sessão principal; ignora linha que não é JSON |
| Runner | `__tests__/git.test.ts` | `worktreePlan` com e sem `origin/<branch>`: argv esperados, `--no-track` no segundo |
| Runner | `__tests__/session.test.ts` | Prompt `/<cmd> <slug> --board <cardId>`; argv com modelo, esforço e `--max-turns`; env sem o token do runner; `--agent-command` recusado sem `file://` |
| Runner | `__tests__/supervisor.test.ts` | Com um filho `node -e` que imprime N linhas `assistant`: encerra em `maxTurns + 1` com `turn_limit`; `active: false` no heartbeat encerra com `stopped`; `SIGINT` gera `interrupted` |
| Runner | `__tests__/runJob.test.ts` | Ponta a ponta sem API real: servidor `node:http` no próprio teste no lugar da API, repositório bare em `tmpdir` (via `fixture-repo.mjs`) e o `stub-agent.mjs`. Prova clone, worktree na branch nova, push para o bare, `complete_stage` e `finish` chamados, worktree apagado. Usa o binário `git` da máquina, sem rede |
| i18n | `apiErrorCodesTranslated.test.ts` (existente) | Os cinco códigos têm copy |

### 10. O que o `/test` vai percorrer

#### 10.1 Preparação (emulador, sem custo)

1. `pnpm emulators`, `pnpm seed`, `pnpm dev`. Contas `qa-*` de `docs/SETUP.md`. Importar `sample-app` e sincronizar o
   backlog.
2. `TMP=$(mktemp -d)`; `node apps/runner/scripts/fixture-repo.mjs $TMP/repos`.
3. Como `octo` (dono), abrir **Minhas credenciais**, gerar o código, copiar o comando.
4. `pnpm --filter runner cli register <código> --api http://localhost:3002 --name qa-runner --home $TMP/home`.
   A tela sai de "Aguardando…" e mostra `qa-runner` Online.
5. `pnpm --filter runner cli start --home $TMP/home --repo-base file://$TMP/repos --agent-command "node
   apps/runner/scripts/stub-agent.mjs"`.

Nenhum token entra em arquivo de `docs/features/`. O relatório cita `kbl_<id>_***`.

#### 10.2 Fluxos

| # | Fluxo | Como produzir | Esperado |
|---|-------|---------------|----------|
| 1 | Etapas reais pelo runner | Arrastar um card pronto para Análise como `octo` | Diálogo diz "Roda no seu runner local."; o card roda, recebe "Runner `qa-runner` começou…", o evento do stub e o relatório; segue sozinho até Concluído; o bare tem `feat/<slug>` com um commit por etapa (`git -C $TMP/repos/agent-board-demo/sample-app.git log feat/<slug>`); `$TMP/home/worktrees` vazio no fim; um evento "terminou em … · 3 turnos" por etapa |
| 2 | Pergunta | `STUB_OUTCOME_ANALYZE=needs_input` | Card em "Aguardando você"; responder no app redispara e o runner pega de novo |
| 3 | Ctrl+C | `STUB_HANG=1`, disparar, `Ctrl+C` no runner | Card "Falhou" com relatório "interrompida no runner"; evento de tempo com o motivo; worktree removido |
| 4 | Limite de turnos | `STUB_TURNS=300` (limite 200 no `board.yml`) | Processo encerrado em 201; card "Falhou" com o motivo do limite |
| 5 | Parar no board | `STUB_HANG=1`, botão "Parar" | Em até 15 s o runner encerra o processo; card parado por `octo`; nenhum relatório de falha do runner |
| 6 | Agente sem `complete_stage` | `STUB_OUTCOME=none` | Card "Falhou" com "O agente terminou sem chamar complete_stage." |
| 7 | Uso próprio | Com o runner de `octo` ligado, disparar como outro `operator` sem runner | O `run` de outra pessoa nunca é pego pelo `qa-runner`; no emulador cai no executor de teste ("Executor de teste" no diálogo) |
| 8 | Runner offline | Parar o CLI, esperar 60 s, disparar | Diálogo mostra "Executor de teste" (emulador); fora do emulador seria 503, coberto por teste de rota |
| 9 | Revogar | Revogar `qa-runner` na tela | O CLI sai com "runner revogado"; a lista não o mostra mais |
| 10 | Tela | Minhas credenciais em claro, escuro e 390 px | Itens do desenho, comandos em mono, Copiar funcionando, selo Online/Offline com contraste nos dois temas |

#### 10.3 Caminho com o `claude` real (🔒 roteiro manual, fica **não verificado** no `/test`)

Gasta a assinatura e exige um repositório de teste no GitHub com o kit aplicado. Roteiro para a pessoa rodar:

1. Repositório descartável `<conta>/agent-board-sandbox` com `node kit/apply.mjs`, protegido por ruleset em `main`.
2. API apontando para o GitHub real (ou o emulador com o board apontando para esse repositório, quando der).
3. `claude login` na máquina; `gh auth status` ok.
4. `pnpm --filter runner cli start` sem `--agent-command` e sem `--repo-base`.
5. Arrastar uma spec pequena para Análise; conferir `docs/features/<slug>/analyze/plan.md` commitado em
   `feat/<slug>`, relatório no card e o custo impresso no terminal.

### 11. Critérios de aceite

1. Um código gerado na tela registra um runner em até 10 minutos, uma vez só; o banco guarda só o hash do token.
2. Com o runner ligado, arrastar um card faz a etapa rodar na máquina, num worktree da branch do card, e o card mostra
   o início, os eventos do agente e o tempo ao final.
3. O runner só pega `run` de quem o registrou e um por vez.
4. Ctrl+C, limite de turnos e agente que não fecha a etapa deixam o card em "Falhou" com o motivo; "Parar" no board
   encerra a sessão em até 15 s.
5. Sem runner online, o disparo é recusado (fora do emulador) ou o `run` termina com `no_runner` e o motivo aparece
   no card.
6. O executor de teste continua funcionando no emulador para quem não tem runner, e nunca responde por um `run` local.
7. O processo do agente nunca recebe o token do runner; nenhum token aparece em resposta, log ou `RunnerDTO`.
8. O worktree é apagado no fim de cada `run`.

## Infra e pendências de ambiente

- **Local (dev):** nada novo para a API. O runner precisa de `git` e, no uso real, do CLI `claude` logado e de
  credenciais git que façam push no repositório.
- **Dependências:** nenhuma nova. O CLI usa só Node e `tsc`/`vitest`, que já estão no lockfile.
- **Custo de uso do Claude:** cada etapa real gasta a assinatura de quem registrou o runner. O modo de teste não gasta
  nada. O roteiro 10.3 gasta.
- **Firestore (produção):** um runner ocioso faz um polling a cada 10 s, cerca de 8.640 por dia, com duas leituras
  cada (runner e consulta de `run`) e uma escrita de `lastSeenAt` a cada 30 s (cerca de 2.880 por dia). Cabe na cota
  gratuita para um runner; com vários, encosta nela. `--poll-interval` permite espaçar. Registrar em
  `docs/PRE-PRODUCTION.md` com o número e a data.
- **API pública em HTTPS:** o runner e o MCP precisam alcançar a API; em dev é `localhost:3002`.
- **`docs/PRE-PRODUCTION.md`:** a linha acima e "rodar o roteiro 10.3 antes de declarar o G2".

## Decisões tomadas sem perguntar

| # | Decisão | Alternativa descartada e por quê |
|---|---------|----------------------------------|
| D1 | `claude -p` como subprocesso, com `stream-json` | `@anthropic-ai/claude-agent-sdk`, que a spec recomenda: não está no lockfile, e a política proíbe dependência nova sem relatório. O CLI está instalado, usa o login da pessoa, e `stream-json` dá turnos, sessão e custo. O supervisor fica atrás de `buildAgentArgs`/`supervisor.ts`; trocar pelo SDK depois mexe em dois arquivos. Vira a pergunta 2 |
| D2 | `apps/runner`, não `packages/runner` | A spec e o `ARCHITECTURE.md` dizem `packages/runner`, mas a política manda escopo em `apps/*` salvo pacote de contrato ou integração, e o runner é um executável como `apps/e2e`. O `/develop` corrige o `ARCHITECTURE.md` |
| D3 | `tsc` para `dist/`, só `import type` do contrato | `tsx` ou `esbuild` como dependência declarada; Node com `--experimental-strip-types` não carrega o contrato, que importa sem extensão |
| D4 | Tela mínima de runners em `boards/[id]/credentials` | Registro só pelo CLI, com login no navegador: exige fluxo OAuth no CLI. A página segue o desenho e a `execution-credentials` a completa |
| D5 | Executor escolhido por `run`, pela pessoa que disparou | Executor global como hoje: não atende "o runner só roda o que o dono disparou" nem deixa o falso e o local conviverem no emulador para o QA |
| D6 | Coleções `runner` e `runnerRegistration`, hash sem cifra | Coleção `credentials` com cifragem: é o corte da `execution-credentials`, e o token nunca é lido de volta |
| D7 | Polling de 10 s e heartbeat de 15 s; "Parar" chega pelo heartbeat | Conexão aberta (SSE, long polling): a spec pede só conexões de saída simples, e funções serverless têm limite de duração |
| D8 | Evento de tempo escrito pela API no `finish` | `post_update` do runner depois do fim: o token do `run` não aceita escrita depois do `complete_stage` |
| D9 | Worktree apagado ao fim de cada `run`, com `--keep-worktrees` para depurar | Apagar só quando o card chega a Concluído: a regra do modo board já exige push por etapa, e guardar worktree por card enche o disco que a spec cita como risco |
| D10 | Turnos contados na sessão principal, com `--max-turns` como reforço | Contar subagentes: o CLI não os conta no limite, e o prazo da etapa já é o teto |
| D11 | Modo de teste por `--agent-command`, travado em `file://` | Mockar o runner inteiro: não exercitaria polling, token, git e limpeza, que são o que pode quebrar |
| D12 | Mensagens do CLI em pt-br direto no código | Passar pelo `@repo/internationalization`: o dicionário é da UI web, e o CLI ficaria dependente de pacote de runtime do monorepo |
| D13 | `run` local não pego em 2 min termina com `no_runner` | Esperar o prazo de 45 min: a pessoa ficaria sem saber que o runner caiu |

## Etapa 2: blueprint técnico

### 10.1 Contrato (`packages/kanban-contract/src/runner.ts`)

```ts
import { z } from "zod";
import type { StageConfig } from "./boardConfig";

export const RUNNER_TOKEN_PREFIX = "kbl_";
export const RUNNER_CODE_TTL_MS = 10 * 60_000;
export const RUNNER_ONLINE_WINDOW_MS = 60_000;
export const RUNNER_CLAIM_GRACE_MS = 2 * 60_000;
export const RUNNER_SEEN_WRITE_INTERVAL_MS = 30_000;

const CODE_ALPHABET = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const normalizeRunnerCode = (code: string) => code.replaceAll("-", "").trim().toUpperCase();

export const runnerRegisterSchema = z.object({
    code: z.string().transform(normalizeRunnerCode).pipe(z.string().regex(CODE_ALPHABET)),
    name: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
});

export const RUNNER_EXITS = ["exited", "interrupted", "turn_limit", "deadline", "stopped", "error"] as const;
export type RunnerExit = (typeof RUNNER_EXITS)[number];

export const runnerHeartbeatSchema = z.object({ turns: z.number().int().min(0) });
export const runnerFinishSchema = z.object({
    turns: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    exit: z.enum(RUNNER_EXITS),
    sessionId: z.string().uuid().optional(),
});

export type RunnerJob = {
    runId: string;
    boardId: string;
    cardId: string;
    slug: string;
    stageKey: string;
    command: string;
    agent: string | null;
    model: StageConfig["model"];
    effort: StageConfig["effort"];
    maxTurns: number;
    branch: string;
    repository: { owner: string; name: string; baseBranch: string };
    install: string | null;
    deadlineAt: string;
    runToken: string;
};

export type RunnerRegisterResult = { runnerId: string; name: string; token: string };
export type RunnerClaimResult = { job: RunnerJob | null };
export type RunnerHeartbeatResult = { active: boolean };
```

`run.ts`:

```diff
 export const RUN_END_REASONS = [
     "agent",
     "timeout",
     "dispatch_failed",
     "stopped",
+    "no_runner",
 ] as const;
-export const STAGE_EXECUTOR_KINDS = ["fake"] as const;
+export const STAGE_EXECUTOR_KINDS = ["fake", "local"] as const;
```

`index.ts`: `export * from "./runner";`.

### 10.2 SDK (`packages/sdk`)

```ts
// src/types/board/runner.ts
export type RunnerCurrentRunDTO = { boardId: string; cardId: string; slug: string; stageKey: string };
export type RunnerDTO = {
    id: string;
    name: string;
    online: boolean;
    lastSeenAt: string;
    createdAt: string;
    tokenLast4: string;
    currentRun: RunnerCurrentRunDTO | null;
};
export type RunnerRegistrationDTO = { code: string; expiresAt: string };
```

`src/actions/runner/action.ts`: `list()`, `createRegistration()`, `revoke(id)`, no padrão de `board/action.ts`;
registrar `runner` no client como os outros recursos.

### 10.3 API: arquivos

```
apps/api/
  (shared)/lib/runner/
    runner-token-format.ts     parseRunnerToken (sem node:crypto; o proxy importa)
    runner-token.ts            mintRunnerToken, matchesRunnerToken
    runner-code.ts             mintRunnerCode, hashRunnerCode
    runner-claim.ts            pickClaimable, isRunnerOnline (puros)
    runner-job.ts              toRunnerJob(run, board, token)
    runner-finish.ts           finishMarkdown(run, runner, input) (puro)
  (shared)/lib/orchestrator/
    executor-mode.ts           resolveStageExecutorMode({ hasOnlineRunner })
    executor.ts                getStageExecutor(kind), resolveExecutorFor(userId, now), executorsForUsers(ids, now)
    local-executor.ts          createLocalExecutor (dispatch e cancel sem efeito)
    decide.ts                  + findUnclaimed
    orchestrator.ts            pumpBoard por run, collect só do fake, unclaimed no tick, resume e stop por pessoa
  (shared)/lib/board-view.ts   toBoardView(board, access, executor)
  (shared)/lib/rate-limit-subject.ts   + kbl_
  (shared)/mappers/runner.mapper.ts    RunnerRecord, toRunnerDTO
  (shared)/mappers/run.mapper.ts       + runnerId, claimedAt, runnerFinishedAt
  (shared)/repositories/runner.repository.ts            listByUser, create, revoke, touch, claimNext, release
  (shared)/repositories/runner-registration.repository.ts   create, consume (transação)
  (shared)/repositories/run.repository.ts   promote com executorFor; setTurns; markRunnerFinished
  (shared)/validation/runner.schema.ts      parseRunnerRegister, parseRunnerHeartbeat, parseRunnerFinish
  app/(guards)/runner.ts                    requireRunnerApi
  app/(routes)/runners/route.ts                         GET
  app/(routes)/runners/[id]/route.ts                    DELETE
  app/(routes)/runners/registrations/route.ts           POST
  app/(routes)/runner/register/route.ts                 POST
  app/(routes)/runner/claim/route.ts                    POST
  app/(routes)/runner/runs/[runId]/heartbeat/route.ts   POST
  app/(routes)/runner/runs/[runId]/finish/route.ts      POST
  app/(routes)/boards/route.ts, boards/[id]/route.ts, boards/[id]/reload/route.ts, (shared)/lib/board-list.ts
                                            executor resolvido por quem pede
  app/(routes)/boards/[id]/cards/[slug]/runs/route.ts   resolveExecutorFor
```

`LogScope` ganha `runner` (`packages/shared/utils/helpers/log.ts`).

### 10.4 Esqueletos

```ts
// app/(guards)/runner.ts
export type RunnerContext = { runner: RunnerRecord; now: Date };
export function requireRunnerApi<TParams = Record<string, never>>(
    handler: (req: NextRequest, ctx: RunnerContext & { params: TParams }) => Promise<Response>
): (req: NextRequest, route: { params: Promise<TParams> }) => Promise<Response>;
```

```ts
// app/(routes)/runner/claim/route.ts
export const POST = requireRunnerApi(async (_req, ctx) => {
    const claimed = await runnerRepository.claimNext(ctx.runner, ctx.now);
    if (claimed === null) {
        return Response.json({ data: { job: null } satisfies RunnerClaimResult });
    }
    const board = await boardRepository.findById(claimed.run.boardId);
    if (board === null) {
        return errorResponse("BOARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    logEvent("runner", "claimed", { runnerId: ctx.runner.id, runId: claimed.run.id });
    return Response.json({ data: { job: toRunnerJob(claimed.run, board, claimed.token) } });
});
```

```ts
// (shared)/repositories/runner.repository.ts
claimNext(runner: RunnerRecord, now: Date): Promise<{ run: RunRecord; token: string } | null>;
// transação: relê runner; currentRunId ativo → null; consulta de 2.4; pickClaimable;
// mintRunToken; update run { runnerId, claimedAt, tokenHash, tokenExpiresAt: deadlineAt };
// update runner { currentRunId, lastSeenAt }
```

```ts
// (shared)/lib/runner/runner-claim.ts
export function isRunnerOnline(runner: Pick<RunnerRecord, "lastSeenAt" | "deletedAt">, now: Date): boolean;
export function pickClaimable(runs: RunRecord[], runner: Pick<RunnerRecord, "userId">, now: Date): RunRecord | null;
```

```ts
// (shared)/lib/orchestrator/decide.ts
export function findUnclaimed(runs: RunRecord[], now: Date): RunRecord[]; // local, running, runnerId null, startedAt + grace <= now
```

```diff
 // orchestrator.ts, pumpBoard
-    const executor = getStageExecutor();
-    if (executor === null) {
-        return;
-    }
-    const started = await runRepository.promote({
-        …
-        executor: executor.kind,
+    const queued = await runRepository.listActiveByBoard(board.id);
+    const byUser = await executorsForUsers(
+        queued.filter((run) => run.status === "queued").map((run) => run.triggeredBy.userId),
+        now
+    );
+    const started = await runRepository.promote({
+        …
+        executorFor: (run) => byUser.get(run.triggeredBy.userId) ?? null,
     });
     for (const run of started) {
+        const executor = run.executor === null ? null : getStageExecutor(run.executor);
+        if (executor === null) {
+            await completeRun({ board, runId: run.id, outcome: "failed", endReason: "no_runner", now });
+            continue;
+        }
```

```diff
 // orchestrator.ts, tick
-    const executor = getStageExecutor();
+    const fake = getStageExecutor("fake");
     const expiredIds = new Set(expired.map((run) => run.id));
     const running = runs.filter(
-        (run) => run.status === "running" && !expiredIds.has(run.id)
+        (run) => run.status === "running" && !expiredIds.has(run.id) && run.executor === "fake"
     );
+    for (const run of findUnclaimed(runs, now).filter((run) => !expiredIds.has(run.id))) {
+        await completeRun({ board, runId: run.id, outcome: "failed", endReason: "no_runner", now });
+    }
```

`getStageExecutor("fake")` continua `null` fora do emulador.

```ts
// apps/runner/src/session.ts
export function buildPrompt(job: RunnerJob): string; // `${job.command} ${job.slug} --board ${job.cardId}`
export function buildAgentArgs(job: RunnerJob, mcpConfigPath: string, permissionMode: string): string[];
export function buildAgentEnv(base: NodeJS.ProcessEnv, job: RunnerJob, apiUrl: string): NodeJS.ProcessEnv;
// remove AGENT_BOARD_RUNNER_TOKEN e qualquer kbl_ herdado; acrescenta KANBAN_RUN_TOKEN, KANBAN_API_URL, KANBAN_CARD_ID
export function mcpConfig(apiUrl: string): object;
```

```ts
// apps/runner/src/git.ts
export type GitStep = { args: string[]; cwd: string };
export function worktreePlan(input: {
    repoDir: string; worktreeDir: string; branch: string; baseBranch: string; remoteHasBranch: boolean;
}): GitStep[];
```

```ts
// apps/runner/src/supervisor.ts
export type SupervisorResult = { exit: RunnerExit; turns: number; sessionId: string | null; durationMs: number; exitCode: number | null };
export function superviseAgent(input: {
    command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; maxTurns: number; deadlineAt: Date;
    heartbeat: (turns: number) => Promise<{ active: boolean } | { revoked: true }>;
    logFile: string; signal: AbortSignal;
}): Promise<SupervisorResult>;
```

### 10.5 Exemplos

```http
POST /runner/register
{ "code": "KQ7M-4XPD", "name": "macbook-gui" }

200 { "data": { "runnerId": "r7Hk…", "name": "macbook-gui", "token": "kbl_r7Hk…_***" } }
400 { "error": { "code": "RUNNER_CODE_INVALID" } }
```

```http
POST /runner/claim
Authorization: Bearer kbl_r7Hk…_***

200 { "data": { "job": { "runId": "q2…", "boardId": "agent-board-demo--sample-app",
  "cardId": "agent-board-demo--sample-app__search-cards", "slug": "search-cards", "stageKey": "analyze",
  "command": "/analyze", "agent": "planejador-tarefa", "model": "opus", "effort": "high", "maxTurns": 200,
  "branch": "feat/search-cards", "repository": { "owner": "agent-board-demo", "name": "sample-app", "baseBranch": "main" },
  "install": "pnpm install --frozen-lockfile", "deadlineAt": "2026-11-26T11:45:00.000Z", "runToken": "kbr_q2…_***" } } }
200 { "data": { "job": null } }
```

```http
POST /runner/runs/q2…/finish
Authorization: Bearer kbl_r7Hk…_***
{ "turns": 84, "durationMs": 720000, "exit": "exited", "sessionId": "0b6f…" }

200 { "data": { "recorded": true } }
```

Documento `runner`:

```json
{ "userId": "u1", "name": "macbook-gui", "tokenHash": "9f…", "tokenLast4": "7f2c",
  "lastSeenAt": "<Timestamp>", "currentRunId": null, "createdAt": "<Timestamp>", "updatedAt": "<Timestamp>", "deletedAt": null }
```

### 10.6 i18n

```ts
// translations/apps/app/pages/common/boards.ts
nav: { …, credentials: "Minhas credenciais" },
board: {
    noExecutor: "Nenhum runner seu está online, então as etapas não podem ser disparadas. Veja {link}.",
    card: { runReason: { …, noRunner: "Nenhum runner seu pegou esta etapa. Inicie o runner e rode de novo." } },
},
trigger: { …, localExecutor: "Roda no seu runner local." },
credentials: {
    title: "Minhas credenciais",
    description: "Quando você dispara uma etapa, ela roda com uma credencial sua. O board nunca usa a sua credencial para o que outra pessoa disparou.",
    runners: {
        title: "Runners locais",
        description: "Rodam na sua máquina, com o seu login do Claude. Servem para etapas que precisam de emulador, browser ou credenciais de dev.",
        empty: "Nenhum runner registrado.",
        online: "Online",
        offline: "Offline",
        busy: "Ocupado com {slug} · {column}",
        lastSeen: "Sem contato desde {when}",
        registered: "Registrado em {date}",
        seenAgo: "último contato {when}",
        tokenEnding: "token terminando em {last4}",
        revoke: "Revogar",
    },
    register: {
        title: "Registrar um runner",
        generate: "Gerar código",
        step1: "Na máquina que vai rodar as etapas, registre com o código abaixo. Ele vale por 10 minutos.",
        step2: "Deixe o runner buscando trabalho. Ele só abre conexões de saída.",
        expiresAt: "Vale até {time}.",
        waiting: "Aguardando o runner se apresentar…",
        copy: "Copiar",
        copied: "Copiado",
    },
    revokeDialog: {
        title: "Revogar {name}?",
        description: "O runner deixa de buscar trabalho. Uma etapa rodando nessa máquina para em até 15 segundos.",
        confirm: "Revogar",
        cancel: "Cancelar",
        success: "Runner revogado.",
    },
    howItRuns: {
        title: "Com que credencial cada disparo roda",
        own: "Um runner seu que esteja online.",
        refused: "Se nenhum servir, o disparo é recusado e o motivo aparece no card.",
    },
},
```

```ts
// translations/packages/shared/utils.ts, apiErrors
RUN_EXECUTOR_UNAVAILABLE: "Nenhum runner seu está online. Inicie o runner e tente de novo.",
RUNNER_TOKEN_INVALID: "Token do runner inválido.",
RUNNER_REVOKED: "Este runner foi revogado. Registre de novo.",
RUNNER_CODE_INVALID: "Código inválido ou vencido. Gere outro no board.",
RUNNER_NOT_FOUND: "Runner não encontrado.",
RUNNER_RUN_MISMATCH: "Esta execução não pertence a este runner.",
```

### 10.7 Front: árvore

```
apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/
  (pages)/[id]/credentials/page.tsx
  (pages)/[id]/credentials/loading.tsx
  (pages)/[id]/credentials/BoardCredentialsClient.tsx
  (components)/RunnerList.tsx
  (components)/RunnerRegistrationPanel.tsx
  (components)/RevokeRunnerDialog.tsx
  (components)/runnerCommands.ts
  (components)/BoardSectionNav.tsx          + credentials
  (components)/TriggerStageDialog.tsx       + local
  (components)/cardRunReason.ts             + no_runner
  (hooks)/useListRunners.tsx
  (hooks)/useRunnerCrud.tsx
  (pages)/[id]/BoardClient.tsx              aviso com link
apps/app/app/[locale]/(authenticated)/(common)/paths.ts   + boards.credentials
apps/app/shared/lib/queryKeys.ts                          + runners.list
apps/app/shared/lib/panelTitles.ts                        + /boards/[id]/credentials
```

### 10.8 Documentação

- `docs/board/ARCHITECTURE.md`: runner em `apps/runner`; coleções `runner` e `runnerRegistration`; `run` com
  `runnerId`, `claimedAt`, `runnerFinishedAt`, `executor` `local`; motivo `no_runner`.
- `docs/board/CONTRACT.md`: seção "Protocolo do runner" (registro, `claim`, heartbeat, fim, token `kbl_`) e a ordem do
  runner ao encerrar (`complete_stage(failed)` quando o agente não fechou).
- `docs/SETUP.md`: como subir o runner contra o emulador com `fixture-repo.mjs` e o agente de teste.
- `.claude/rules/board-mode.md` e `kit/.claude/rules/board-mode.md`: no runner local, o worktree já está na branch do
  card; a Análise não recria a branch, só faz push com `-u`.
- `docs/PRE-PRODUCTION.md`: polling no Firestore e o roteiro 10.3.
- `specs/reference/AUDIT.md` não muda aqui (é do `/spec --sync`).

### 10.9 Ordem de implementação e commits

1. `feat(kanban-contract): runner protocol types, local executor and no_runner reason`
2. `feat(sdk): runner resource`
3. `feat(api): runner registration and token` (coleções, mappers, repositórios, guard, rotas `/runners*` e
   `/runner/register`, testes)
4. `feat(api): runner claim, heartbeat and finish` (`claimNext`, campos do `run`, rotas, testes, teste de emulador)
5. `feat(api): pick the stage executor per run` (executor por pessoa, executor local, `findUnclaimed`, correção do
   `collect`, `toBoardView`, rota `runs`, testes)
6. `feat(api): rate limit runners per runner` (`rate-limit-subject.ts` e teste)
7. `feat(runner): local runner CLI` (`apps/runner` sem os scripts de teste, testes unitários)
8. `test(runner): stub agent and fixture repository for local runs` (`stub-agent.mjs`, `fixture-repo.mjs`,
   `runJob.test.ts`)
9. `feat(internationalization): runner copy and error codes`
10. `feat(app): local runners page` (página, componentes, hooks, nav, paths, queryKeys)
11. `feat(app): local executor in the trigger dialog and no_runner reason`
12. `docs(board): local runner protocol and setup`
13. `docs(features): local-runner` (por último)

i18n vem antes do app para cada commit do app passar no typecheck, como no `orchestrator`.

Env nova: nenhuma na API. O CLI lê `AGENT_BOARD_RUNNER_HOME` (opcional).

## Perguntas em aberto

1. **Permissões da sessão no runner.** Sem ninguém no teclado, o `claude -p` precisa rodar Bash, git e pnpm sem
   pedir. Recomendação: `--permission-mode bypassPermissions` como padrão, dentro do worktree, com os hooks do
   repositório e o ruleset do GitHub como rede, e a opção `--permission-mode` para quem quiser `acceptEdits` com a
   lista de `allow` do `.claude/settings.json` (nesse modo, comando fora da lista falha e a etapa tende a parar).
2. **`claude -p` ou Agent SDK?** A spec recomenda o SDK. Recomendação: CLI agora (zero dependência, mesmo login), SDK
   quando o G2 mostrar que falta algo que o `stream-json` não dá (interceptar `AskUserQuestion`, hooks
   programáticos).
3. **Onde fica o runner.** A spec diz `packages/runner`; a política manda `apps/*`. Recomendação: `apps/runner`,
   corrigindo o `ARCHITECTURE.md`.
4. **Tela "Minhas credenciais" entra aqui?** A spec não lista `apps/app`, mas o registro precisa de um código gerado
   pelo board. Recomendação: só a seção "Runners locais", no lugar do desenho; a `execution-credentials` completa.
