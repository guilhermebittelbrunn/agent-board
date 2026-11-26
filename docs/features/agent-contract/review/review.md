# Revisão: contrato dos agentes (HTTP + servidor MCP)

Revisão da tarefa 9 do `/cycle` noturno, sem perguntas. O working tree também traz as tarefas 1 a 8, já revisadas;
aqui só o diff da `agent-contract` foi lido. O plano de commits no fim cobre as nove tarefas, o plano da
`local-runner` e a spec dela.

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada (o orquestrador mandou não criar nem trocar). O regex de
`.claude/rules/git-commits.md` reprova o nome: `guilhermebittelbrunn/` não é projeto e `chore-cycle-three-tasks` não
separa tipo e título. É o mesmo veredito das oito revisões anteriores. A decisão continua com o `/review`: antes do
primeiro commit, criar uma branch válida a partir desta, por exemplo `feat/board-cards-and-runs` (vários apps, então
sem projeto). Nada foi renomeado. `git diff --cached --stat` saiu vazio.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | `apps/api/(shared)/lib/rate-limit-subject.ts:67-69`, `agent-guard.ts:52` | O balde é `ip.src` + `run:<runId>`, e o `runId` sai de um token que ninguém verificou. Quem manda `kbr_<id-aleatório>_<43 caracteres>` ganha um balde novo a cada id e, a cada pedido, custa uma leitura do Firestore (`findWithToken`) antes da recusa. Com JWT forjado o custo é parecido no balde, mas a recusa não lê o banco. | Registrado. Sem `ARCJET_KEY` não há rate limit nenhum, então o efeito só existe em produção. Recomendação para a `cloud-routines-runner` (que vai expor a rota na internet): um teto por endereço só para `/mcp` e `/agent/*`, alto o bastante para várias sessões atrás do mesmo NAT. |
| 🟢 | `apps/api/(shared)/repositories/card-event.repository.ts:128-141` | `ask` gravava `pendingAsk` na transação sem reler o card; o guard leu `active` antes, fora dela. Se o `run` fechasse e outro começasse nesse intervalo de milissegundos, o card novo ganharia uma pergunta da etapa anterior. | Corrigido: a pergunta com `runId` relê o card na transação e, se `activeRunId` for outro, nada é gravado e o agente recebe 409 `AGENT_RUN_CLOSED`. `appendAgentEvent` passa a devolver `{ ok, event }` ou `{ ok: false, code }`. |
| 🟢 | `apps/api/(shared)/lib/agent-contract/mcp.ts:106-127` | A rota HTTP registra `logEvent("agent", "tool", …)` em toda chamada; o `tools/call` do MCP não registra nada. As duas portas do mesmo núcleo ficam com observabilidade diferente. | Registrado. Tentei pôr o log no `callTool`, mas o `agentMcp.test.ts` usa `ctx = {}` e quebraria; desfeito. Cabe junto do primeiro ajuste no MCP, com o fixture. |
| 🟢 | `apps/api/(shared)/lib/agent-contract/mcp.ts:321-323` | `id` de outro tipo (objeto, booleano, `null`) virava `null` e o pedido era atendido. O JSON-RPC 2.0 aceita só string, número ou `null` e manda responder `-32600` com `id: null` quando não consegue ler o `id`; o MCP proíbe `null` como id de pedido (especificação `2025-11-25/basic`, consultada em 2026-11-26). | Corrigido: `id` presente que não é string nem número responde 400 `-32600` com `id: null`. |
| 🟢 | `docs/board/CONTRACT.md` | Dizia que o rate limit contava "por `run`, não pelo endereço de saída". O Arcjet usa `["ip.src", "subject"]` (`packages/security/index.ts:66`): conta pelos dois. | Corrigido. |
| 🟢 | `docs/features/card-timeline/review/review.md` (commit 6) | `packages/kanban-contract/__tests__/agentContract.test.ts`, criado na revisão da `card-timeline`, não estava em commit nenhum do plano. | Corrigido no plano: entra no commit 6, que já leva o `agentContract.ts`. |
| ✅ | `run-token.ts:23-33` | Só o SHA-256 do segredo é guardado; `timingSafeEqual` compara dois hex de 64 caracteres com o tamanho conferido antes. | |
| ✅ | `run-token-format.ts:10` | Regex ancorada: `runId` só alfanumérico (1 a 128, ids do Firestore não têm `_`), segredo com exatamente 43 caracteres base64url, que podem ter `_`. `runId` com `/`, `_` ou vazio não passa; `findWithToken` ainda filtra com `isUsableDocumentId`. Sem `node:crypto`, cabe no `proxy`. | |
| ✅ | `agent-guard.ts:46-74` | Formato errado responde 401 sem ler o banco. `run` inexistente e segredo errado dão a mesma resposta. Expiração conferida depois do hash; `tokenExpiresAt` ausente conta como expirado. Card de outro board responde 404. | |
| ✅ | `agent-tools.ts:114-134` | Ordem: ferramenta conhecida, schema do contrato (regra 16), escopo, `run` fechado. Com o `run` fechado, só `complete_stage` responde (`ignored: true`, sem evento); o resto leva 409. O token não é apagado ao fechar, mas fica inútil, e o `CONTRACT.md` descreve isso assim. | |
| ✅ | `agent-scope.ts` | `cardId` precisa ser o do `run`; `stage`, a etapa do `run` (menos em `get_card`); `create_card`, o board do `run`. | |
| ✅ | `agent-tools.ts:55-74`, `card-event.repository.ts:116-143` | Regra 14: o agente grava eventos e, no `ask`, o `pendingAsk`. `state` e `lane` só mudam por `completeRun`. | |
| ✅ | `run.mapper.ts:186-198`, `run.repository.ts:82-128` | `RunRecord` e `RunDTO` não têm `tokenHash` nem `tokenExpiresAt`. Os dois só saem por `findWithToken`, usado só pelo guard. `setToken` é transação e recusa `run` fechado, na fila ou sem prazo. | |
| ✅ | `agent-card-view.ts`, `agentResults.ts` | `get_card` devolve só o card do token: campos nomeados, respostas sem autor (`ResolvedAnswer` tem pergunta, cabeçalho e escolha), artefatos e o corpo da spec. Nada de membros, tokens ou outros cards. Falha do GitHub vira `logEvent` com o nome do erro, nunca a mensagem. | |
| ✅ | `agent/tools/[tool]/route.ts:15-19`, `rate-limit-subject.ts` | Os logs levam `runId`, ferramenta e código. O token não aparece em log, resposta nem DTO; o balde do rate limit é o hash de `run:<id>`. | |
| ✅ | `apps/api/proxy.ts:208-210` | O `matcher` é `/:path*`, então `/mcp` e `/agent/tools/*` passam pela checagem de `Origin` (fora da lista → 403 `AUTH_FORBIDDEN_ORIGIN`) e pelo balde padrão de POST. `isUnprovenCookieWrite` não atrapalha porque o agente manda `Authorization`. | |
| ✅ | `mcp.ts` | Lote → 400 `-32600`; JSON inválido → `-32700`; notificação → 202 sem corpo; corpo acima de 100 KiB → 413 pelo `parseRequestJson`. Era moderna: versão, `clientCapabilities` e os três headers conferidos contra o corpo (`-32022`, `-32602`, `-32020`). Era legada: `initialize` negocia a versão; header de versão moderna sem `_meta` é recusado. `GET`/`DELETE` → 405 com `Allow: POST`, sem guard e sem leitura. | |
| ✅ | `scripts/agent-token.mjs:18-25` | `refuseSeedReason` roda antes do `initializeApp`: sem os dois emuladores ou com projeto que não é `demo-*`, sai com 1. O teste de paridade compara `agentTokenMint.mjs` com `run-token.ts`. | |

## Correção 2 do `/develop`: o guard fora de `(guards)`

Concordo. O `impersonationReadOnly.test.ts` existe para garantir que todo guard de sessão em `app/(guards)` bloqueie
escrita durante a personificação. O `requireAgentApi` não lê cookie nem sessão: um admin personificando alguém não
tem como chegar por ele, porque a única credencial aceita é um `kbr_` válido. Abrir exceção no teste afrouxaria a
regra para os guards que precisam dela. A rota do webhook do GitHub (`app/(routes)/github/webhook/route.ts`) já
autentica sem sessão com helper em `(shared)/lib/github/`, então o lugar novo segue um precedente que existe. O custo
é de descoberta: quem procurar guards em `app/(guards)` não acha este. O JSDoc do `requireAgentApi` explica o
motivo, e isso basta por ora.

As correções 1 (MCP nas duas eras) e 3 (hash fora do `RunRecord`) também ficam. A 3 fecha o vazamento mais provável
de segredo neste desenho.

## Correções aplicadas

- `docs/board/CONTRACT.md`: o parágrafo do rate limit diz que o balde é por endereço e por `run`.
- Plano de commits: `packages/kanban-contract/__tests__/agentContract.test.ts` entra no commit 6.
- `apps/api/(shared)/repositories/card-event.repository.ts`: `appendAgentEvent` relê o card na transação quando a
  pergunta traz `runId` e recusa se o card roda outro `run`. Tipo novo `AppendAgentEventResult`. Os chamadores do
  orquestrador (`executor.ts`, `orchestrator.ts`) ignoram o retorno e não mudaram; nos dois o `run` ainda é o ativo
  quando a pergunta é gravada.
- `apps/api/(shared)/lib/agent-contract/agent-tools.ts`: a recusa do repositório vira 409 `AGENT_RUN_CLOSED`.
- `apps/api/__tests__/fakeCardEventRepository.ts`: a mesma regra no repositório falso.
- `apps/api/(shared)/lib/agent-contract/mcp.ts`: `id` inválido responde `-32600`.
- Testes: `agentToolsRoutes.test.ts` e `agentContract.emulator.test.ts` ganharam o `ask` de um `run` que o card já não
  roda (409, sem `pendingAsk`, sem evento); `agentRunToken.test.ts` ganhou segredo com `_`, `runId` com 128 e com 129
  caracteres e `runId` com `_`; `agentMcp.test.ts` ganhou `id` `null`, objeto e booleano.

A tentativa de log no MCP foi desfeita (ver achados).

## Raio de impacto

- `@repo/kanban-contract`: `AGENT_MCP_TOOLS`, `isAgentContractTool` e os tipos de `agentResults.ts`. Só a `apps/api`
  importa hoje (busca em `apps/` e `packages/`); a `local-runner` vai importar os tipos de resposta.
- `HTTP_STATUS` ganhou `ACCEPTED` e `NOT_IMPLEMENTED`; `LogScope` ganhou `agent`. Só acréscimo.
- `rateLimitSubject` muda de balde só para bearer no formato `kbr_`; JWT e anônimo seguem iguais.
- Documento `run`: dois campos novos, nulos em `run` novo e ausentes nos antigos (lidos como `null`).
- Nenhum consumidor no `apps/app` nem no SDK.

## Verificar no `/test`

Repro do handoff: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*`, importar `sample-app`, sincronizar o
backlog, `pnpm --filter api fake-executor script <boardId> <slug> silent`, arrastar o card para Análise como
`operator`, depois `export KANBAN_RUN_TOKEN="$(pnpm --silent --filter api agent-token <boardId> <slug>)"`. No
relatório, o token aparece como `kbr_<runId>_***`.

1. **Proxy real na frente das rotas novas.** É a afirmação de maior risco: os testes chamam o handler sem o `proxy`.
   - `curl -i -X POST localhost:3002/mcp -H 'Origin: https://evil.example' -H "Authorization: Bearer $KANBAN_RUN_TOKEN" -d '{}'` → 403 `AUTH_FORBIDDEN_ORIGIN`.
   - O mesmo sem `Origin` → passa do proxy e chega ao MCP (400 `-32600` com esse corpo).
   - `curl -i -X POST localhost:3002/agent/tools/get_card -H 'content-type: application/json' -d '{"cardId":"x"}'` → 401 com `WWW-Authenticate: Bearer`.
2. **Percurso 1 a 13 do plano (8.3) por `curl`**, com atenção a: `get_card` com `spec.content` vindo do GitHub
   falso; `post_update` aparecendo na linha do tempo no app; "Aguardando você" depois do `ask`; responder no app e
   `complete_stage` com `success` movendo o card; o segundo `complete_stage` devolvendo `{"ignored":true}`;
   `post_update` depois disso → 409 `AGENT_RUN_CLOSED`.
3. **Escopo.** Com o token de um card, `get_card` com o `cardId` de outro card do mesmo board → 403
   `AGENT_CARD_MISMATCH`; `post_update` com `"stage":"develop"` num `run` de `analyze` → 403 `AGENT_STAGE_MISMATCH`.
4. **Token adulterado e expirado.** Trocar um caractere do segredo → 401 `AGENT_TOKEN_INVALID`;
   `agent-token <boardId> <slug> --expired` → 401 `AGENT_TOKEN_EXPIRED`.
5. **MCP pelas duas eras.** Legado: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}` ecoa a versão. Moderno: `tools/list` com `params._meta` (versão `2026-07-28` e `clientCapabilities: {}`) e os headers `MCP-Protocol-Version: 2026-07-28` e `Mcp-Method: tools/list` → cinco ferramentas; sem `Mcp-Method` → 400 `-32020`. `curl -i localhost:3002/mcp` → 405.
6. **Cliente MCP real.** `claude -p` com o `--mcp-config` do `CONTRACT.md` e o token na env, pedindo
   `mcp__kanban__get_card` e `mcp__kanban__post_update`. Mostra qual era o Claude Code usa hoje. Se não der para
   montar, registrar como não verificado.
7. **`next build`** aceita o tipo das duas rotas novas (o `tsc` passa; o build não rodou).
8. **Herdados do `orchestrator`** ("Depois do /test, rodada 1", corrigidos sem browser):
   - foco ao fechar `TriggerStageDialog` e `StopRunDialog` por Cancelar, Escape e confirmar, abertos por arrasto, pelo
     menu "⋯" e por "Rodar de novo": o foco volta ao elemento que abriu, ou ao menu do card, ou ao primeiro botão de
     `run`, ou ao título; nunca ao `body`;
   - copy nova: "Disparar a etapa {column}?", "A etapa {stage} parou com…", "Responder e retomar a etapa {column}",
     o limite de WIP sem "1 cards", a descrição do diálogo sem "Você soltou", o corpo de "Aprovar e seguir" sem "de
     novo", Concluído sem o selo "Parado" no quadro e o placeholder "Sem limite" inteiro a 1440 px;
   - em claro, escuro e 390 px.

O rate limit por `run` só tem efeito com `ARCJET_KEY`; sem a chave, fica coberto só pelo teste unitário de
`rateLimitSubject`.

## Lacunas de teste

- `complete_stage` concorrente no mesmo `run`: continua aberta (risco aceito no plano; a transição é única porque
  `completeRun` é idempotente).
- `setToken` concorrente com `finishOnCard` sem teste de emulador: continua aberta.
- `proxy` inteiro com bearer `kbr_`: continua aberta; o item 1 de "Verificar no `/test`" mede o caminho da `Origin`.
- `parseRunToken` sem caso fixo de segredo com `_` e de `runId` acima de 128: fechada aqui.
- `ask` sobre um `run` que o card já não roda: fechada aqui, na rota (repositório falso) e no emulador (transação
  real).

## Decisões em aberto

- Nome da branch (acima).
- Teto por endereço para `/mcp` e `/agent/*` (achado 🟡): fica para a `cloud-routines-runner`, quando a rota for
  exposta. Recomendação registrada no achado.

## Gates

| Gate | Resultado |
|------|-----------|
| `pnpm --filter api --filter @repo/kanban-contract typecheck` | 2 de 2, sem erro (o da `api` refeito depois das correções) |
| `pnpm check` | 910 arquivos, sem erro |
| `apiErrors` | Nenhum código novo; `apiErrorCodesTranslated.test.ts` passa |
| Testes dos arquivos tocados | `vitest run` de `agentMcp`, `agentRunToken`, `agentTokenScript`, `agentToolScope`, `agentToolsRoutes`, `cardEventsRoutes`, `mcpRoute`, `orchestrator*`, `cardRunsRoutes`, `fakeExecutor` e `apiErrorCodes`: 11 arquivos, 134 testes |
| Emulador | `pnpm --filter api test:emulator` com JDK 21: 6 arquivos, 152 testes (`agentContract.emulator.test.ts` 4 de 4). Portas 8080 e 9199 livres depois |

A suíte inteira da API não foi rodada (é do `/test`).

## Plano de commits (tarefas 1 a 9)

> Substituído pelo plano das tarefas 1 a 10 em
> [`local-runner/review/review.md`](../../local-runner/review/review.md#plano-de-commits-tarefas-1-a-10).

Este plano substitui o de
[`orchestrator/review/review.md`](../../orchestrator/review/review.md#plano-de-commits-tarefas-1-a-8). Mensagens,
arquivos e comandos de blob de lá (e dos planos que ele cita) continuam valendo com as mudanças abaixo. A estratégia é
a mesma: arquivo misto entra inteiro no primeiro commit que já o leva, e a mensagem ganha uma linha de corpo.

Os commits intermediários da API ficam vermelhos no typecheck e no `apiErrorCodes` até os commits novos entrarem
(por exemplo, o 35 já leva `setToken`, que só ganha chamador no 40, e os códigos `AGENT_*` só chegam no 64). O PR
fica verde no último commit, como nos planos anteriores.

### Numeração

| Novo | No plano de 77 | Commit |
|------|----------------|--------|
| 1 a 7 | 1 a 7 | sem mudança (1 com mensagem nova; 2, 3, 5, 6 e 7 com os blobs abaixo; 6 com um arquivo a mais) |
| **8** | novo | `feat(kanban-contract): add the results of the agent tools` |
| 9 a 39 | 8 a 38 | sem mudança |
| **40** | novo | `feat(api): issue run tokens that store only the hash of their secret` |
| **41** | novo | `feat(api): let a run's agent call the board tools over HTTP` |
| **42** | novo | `feat(api): serve the kanban MCP server over Streamable HTTP` |
| **43** | novo | `feat(api): rate limit agent calls per run` |
| **44** | novo | `chore(api): add a script that issues an agent token in the emulator` |
| **45** | novo | `test(api): cover agent tokens and tools against the emulator` |
| 46 a 75 | 39 a 68 | sem mudança (69 e 70 com mensagem nova) |
| **76** | novo | `docs(specs): start the local-runner spec` |
| 77 a 83 | 69 a 75 | sem mudança |
| 84 | 76 | `docs(features): orchestrator` |
| **85** | 77 | `docs(features): agent-contract`, agora a pasta inteira |
| **86** | novo | `docs(features): local-runner` |

O antigo 8 a 38 soma 1, o 39 a 68 soma 7 e o 69 a 77 soma 8 (o antigo 15 é o 16, o 34 é o 35, o 57 é o 64, o 64 é
o 71).

### Onde a tarefa 9 entra em commits existentes (numeração nova)

| Arquivo | Commit | Corpo acrescentado |
|---------|--------|--------------------|
| `packages/shared/utils/helpers/httpStatus.ts`, `log.ts` | 1 | Mensagem passa a `feat(shared): add the github, orchestrator and agent log scopes and the 202, 501 and 502 statuses` |
| `packages/kanban-contract/src/agentContract.ts` + `packages/kanban-contract/__tests__/agentContract.test.ts` (faltava no plano) | 6 | `Also lists the tools the MCP server offers.` |
| `apps/api/package.json` | 16 | Linha `agent-token`; o script chega no 44 |
| `apps/api/(shared)/repositories/card-event.repository.ts` | 32 | `A question from a run the card no longer runs is refused.` |
| `apps/api/__tests__/fakeCardEventRepository.ts` | 33 | |
| `apps/api/(shared)/mappers/run.mapper.ts`, `repositories/run.repository.ts`, `__tests__/runMapper.test.ts` | 35 | `The run also keeps the hash of its agent token, read apart from the run record.` |
| `packages/internationalization/translations/packages/shared/utils.ts` | 64 | Os sete códigos `AGENT_*` |
| `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` | 68 | |
| `docs/board/ARCHITECTURE.md` | 70 | `The run keeps the hash of the agent token and its expiry.` |
| `docs/board/CONTRACT.md` | 71 | Mensagem passa a `docs(board): document agent authentication, endpoints, payload limits and the stage timeout` |

### Blobs do `packages/kanban-contract/src/index.ts`

O barril agora exporta `./agentResults`, que só existe a partir do commit 8:

- commit 2: `grep -vE '\./(boardConfigDiff|boardConfigIssues|boardLanes|specBacklog|cardEvent|run|agentResults)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 3: `grep -vE '\./(boardLanes|specBacklog|cardEvent|run|agentResults)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 5: `grep -vE '\./(cardEvent|run|agentResults)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 6: `grep -vE '\./(run|agentResults)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 7 (antes ia inteiro): `grep -vE '\./agentResults"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- em cada um, `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/src/index.ts`. O commit 8 leva o
  arquivo inteiro com `git add`.

### Commits novos

8. `feat(kanban-contract): add the results of the agent tools`
   - `packages/kanban-contract/src/agentResults.ts`, `index.ts` (inteiro)
40. `feat(api): issue run tokens that store only the hash of their secret`
   - corpo: `A token is kbr_<runId>_<secret>, expires with the run's deadline and is compared in constant time.`
   - `apps/api/(shared)/lib/agent-contract/run-token-format.ts`, `run-token.ts`
   - `apps/api/__tests__/agentRunToken.test.ts`
41. `feat(api): let a run's agent call the board tools over HTTP`
   - corpo: `A token only reaches its own card and stage; complete_stage ends the run through completeRun.`
   - `apps/api/(shared)/lib/agent-contract/agent-context.ts`, `agent-guard.ts`, `agent-scope.ts`,
     `agent-card-view.ts`, `agent-tools.ts`
   - `apps/api/app/(routes)/agent/tools/[tool]/route.ts`
   - `apps/api/__tests__/agentRunFixtures.ts`, `agentToolScope.test.ts`, `agentToolsRoutes.test.ts`
42. `feat(api): serve the kanban MCP server over Streamable HTTP`
   - corpo: `Answers the 2026-07-28 revision and the initialize-based ones on one endpoint, without sessions.`
   - `apps/api/(shared)/lib/agent-contract/mcp.ts`, `apps/api/app/(routes)/mcp/route.ts`
   - `apps/api/__tests__/agentMcp.test.ts`, `mcpRoute.test.ts`
43. `feat(api): rate limit agent calls per run`
   - `apps/api/(shared)/lib/rate-limit-subject.ts`, `apps/api/__tests__/rateLimitSubject.test.ts`
44. `chore(api): add a script that issues an agent token in the emulator`
   - `apps/api/scripts/agent-token.mjs`, `agentTokenMint.mjs`
   - `apps/api/__tests__/agentTokenScript.test.ts`
45. `test(api): cover agent tokens and tools against the emulator`
   - `apps/api/__tests__/agentContract.emulator.test.ts`, `apps/api/vitest.emulator.config.mts`
76. `docs(specs): start the local-runner spec`
   - `specs/features/local-runner.md`
85. `docs(features): agent-contract`
   - `docs/features/agent-contract/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md` e,
     depois do `/test`, `test/`)
86. `docs(features): local-runner`
   - `docs/features/local-runner/` (`STATE.md`, `analyze/plan.md`)

As pastas `docs/features/agent-contract/` e `docs/features/local-runner/` e a spec `specs/features/local-runner.md`
foram varridas atrás de senha, token e e-mail: o token só aparece como formato (`kbr_<runId>_<segredo>`,
`kbr_<runId>_***`), sem valor. Uma varredura dos arquivos alterados contra os nove planos não achou outro arquivo fora
de commit além do `agentContract.test.ts` já corrigido.

Antes do commit 1, `git diff --cached --stat` vazio (conferido nesta revisão); depois de cada commit,
`git show --stat --oneline HEAD` conferido contra a lista. Toda mensagem termina com a linha de coautoria da sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members, cards, card timeline, stage runs, agent contract and theme toggle`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
