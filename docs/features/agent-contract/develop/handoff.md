# Handoff do /develop: agent-contract

Implementação do plano `analyze/plan.md`, feita no `/cycle` noturno sem perguntas. Nada foi commitado. A branch
continua `guilhermebittelbrunn/chore-cycle-three-tasks`, com as tarefas 1 a 8 também no working tree sem commit. O
plano foi escrito antes do `orchestrator` existir em disco; onde o código real tem outro nome ou outra forma, segui o
código e listei abaixo.

## Correções ao plano (ler primeiro)

1. **O MCP atende as duas gerações do protocolo, e não só o `initialize`.** O plano descrevia um servidor com
   `initialize`, `ping`, `tools/list` e `tools/call`, e pedia para conferir as versões na especificação. Consultei
   modelcontextprotocol.io em 2026-11-26: a revisão atual é `2026-07-28`, que não tem handshake. Cada pedido leva a
   versão e as capacidades do cliente em `params._meta`, o servidor tem de implementar `server/discover`, e no HTTP os
   headers `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name` precisam bater com o corpo (senão `400` com `-32020`).
   Pela matriz de compatibilidade da própria especificação, um cliente só moderno contra um servidor só com
   `initialize` falha. O servidor ficou "dual-era", como a especificação permite: pedido com
   `_meta["io.modelcontextprotocol/protocolVersion"]` segue `2026-07-28`; pedido sem ele segue `2025-11-25`,
   `2025-06-18` ou `2025-03-26`. `2024-11-05` ficou de fora porque usava outro transporte (HTTP+SSE). Fontes,
   consultadas em 2026-11-26:
   - https://modelcontextprotocol.io/specification/versioning (versão atual `2026-07-28`)
   - https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning (negociação, `-32022`, matriz de eras)
   - https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http (headers, `-32020`,
     `202` para notificação, `405` em GET/DELETE, `404` + `-32601` para método desconhecido)
   - https://modelcontextprotocol.io/specification/2026-07-28/server/discover
   - https://modelcontextprotocol.io/specification/2026-07-28/basic/index (`_meta` obrigatório, `resultType`)
   - https://modelcontextprotocol.io/specification/2026-07-28/server/tools
   - https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle (`initialize` legado)
2. **O guard do agente mora em `(shared)/lib/agent-contract/agent-guard.ts`, não em `app/(guards)/agent.ts`.** O teste
   `impersonationReadOnly.test.ts` exige que todo `require*Api` em `app/(guards)` chame
   `assertReadOnlyWhileImpersonating` ou delegue a um guard de painel. O guard do agente não lê cookie nem sessão,
   então personificação não existe para ele, e chamar o helper sem contexto de sessão seria código morto. Mudar o
   teste para abrir exceção seria afrouxar asserção. O guard ficou junto do resto do contrato, como a rota do webhook
   do GitHub, que também autentica sem sessão dentro do próprio módulo. **O `/review` deve conferir se concorda.**
3. **O hash do token não entra em `RunRecord`.** O plano punha `tokenHash` e `tokenExpiresAt` no `RunRecord` e no
   mapper. `RunRecord` circula pelo orquestrador inteiro (despacho, fila, `toActiveRunView`), então um campo de
   segredo nele seria fácil de vazar num log ou num DTO futuro. Os dois campos são lidos à parte:
   `toRunTokenState(row)` no mapper e `runRepository.findWithToken(runId)`, que devolve `{ run, token }`. O
   `runMapper.toDTO` continua ignorando os dois, e o teste confere que nem o `RunRecord` nem o `RunDTO` os trazem.
   Efeito colateral bom: nenhum fixture de `RunRecord` das tarefas anteriores precisou mudar.

## Blueprint → arquivos

### Contrato (`packages/kanban-contract`)

| Item | Arquivos |
|------|----------|
| `AgentCardView`, `AgentAnsweredQuestion`, `AgentArtifactRef`, `AgentEventResult`, `AgentCompleteResult` | `src/agentResults.ts` (novo), `src/index.ts` |
| `AGENT_MCP_TOOLS` (cinco, sem `create_card`) e `isAgentContractTool` | `src/agentContract.ts` |

### `packages/shared`

| Item | Arquivos |
|------|----------|
| `HTTP_STATUS.ACCEPTED` (202) e `NOT_IMPLEMENTED` (501) | `utils/helpers/httpStatus.ts` |
| Escopo de log `agent` | `utils/helpers/log.ts` |

### API (`apps/api`)

| Item | Arquivos |
|------|----------|
| `parseRunToken`, `readBearer`, `RUN_TOKEN_PREFIX` (sem `node:crypto`) | `(shared)/lib/agent-contract/run-token-format.ts` (novo) |
| `mintRunToken`, `hashRunSecret`, `matchesRunToken` (`timingSafeEqual`), `isRunTokenExpired`, `issueRunToken` | `(shared)/lib/agent-contract/run-token.ts` (novo) |
| `AgentContext` | `(shared)/lib/agent-contract/agent-context.ts` (novo) |
| `requireAgentApi` | `(shared)/lib/agent-contract/agent-guard.ts` (novo; ver correção 2) |
| `checkToolScope` | `(shared)/lib/agent-contract/agent-scope.ts` (novo) |
| `buildAgentCardView`, `answeredQuestionsOf`, `artifactsOf` | `(shared)/lib/agent-contract/agent-card-view.ts` (novo) |
| `callAgentTool` | `(shared)/lib/agent-contract/agent-tools.ts` (novo) |
| `handleMcpMessage`, `mcpToolList`, `MCP_PROTOCOL_VERSIONS`, `JSON_RPC_ERROR` | `(shared)/lib/agent-contract/mcp.ts` (novo) |
| `POST /agent/tools/[tool]` | `app/(routes)/agent/tools/[tool]/route.ts` (novo) |
| `POST`, `GET`, `DELETE /mcp` | `app/(routes)/mcp/route.ts` (novo) |
| Balde de rate limit por `run` | `(shared)/lib/rate-limit-subject.ts` |
| `tokenHash`/`tokenExpiresAt` nulos no `run` novo, `RunTokenState`, `toRunTokenState` | `(shared)/mappers/run.mapper.ts` |
| `findWithToken`, `setToken` (transação: `active`, `running`, `deadlineAt`) | `(shared)/repositories/run.repository.ts` |
| Script de QA | `scripts/agent-token.mjs`, `scripts/agentTokenMint.mjs` (novos), `package.json` (`agent-token`) |
| Alias de `@repo/kanban-contract/spec-frontmatter` na suíte do emulador | `vitest.emulator.config.mts` |

`runId` no `CardEventWrite` já existia: o `orchestrator` fez esse trecho. Nada mudou no `card-event.mapper.ts`.

### i18n

`translations/packages/shared/utils.ts`: os sete códigos novos em `apiErrors`, com a copy do plano (10.6).

### Docs

- `docs/board/CONTRACT.md`: autenticação reescrita (formato, hash, prazo, revogação), seção "Endpoints" com as duas
  rotas, as duas eras do MCP e a configuração do lado do agente, `create_card` indisponível, seções "Respostas" e
  "Erros".
- `docs/board/ARCHITECTURE.md`: `run` com `tokenHash` e `tokenExpiresAt`.
- `docs/SETUP.md`: como emitir um token no emulador e chamar `get_card` por `curl`.
- `docs/PRE-PRODUCTION.md`: pendência "Token do agente no connector MCP da nuvem", dono `cloud-routines-runner`.

## Contrato mexido e quem consome

- `@repo/kanban-contract` ganhou tipos e `AGENT_MCP_TOOLS`/`isAgentContractTool`. Hoje só a `apps/api` importa; o
  `local-runner` vai importar os mesmos tipos de resposta.
- `HTTP_STATUS` ganhou duas chaves. `LogScope` ganhou `agent`.
- `RunRecord` e `RunDTO` não mudaram (correção 3). O documento `run` ganhou dois campos, nulos em `run` novo e
  ausentes nos antigos (o mapper lê ausente como `null`, sem migração).
- `rateLimitSubject` devolve um ator por `run` quando o bearer tem formato `kbr_`; JWT segue como antes.
- Nenhum consumidor do `apps/app` nem do SDK.

## Códigos de erro novos

| Código | Status | Onde |
|--------|--------|------|
| `AGENT_TOKEN_INVALID` | 401 | guard |
| `AGENT_TOKEN_EXPIRED` | 401 | guard |
| `AGENT_TOOL_NOT_FOUND` | 404 | `callAgentTool` |
| `AGENT_CARD_MISMATCH` | 403 | `checkToolScope` |
| `AGENT_STAGE_MISMATCH` | 403 | `checkToolScope` |
| `AGENT_RUN_CLOSED` | 409 | `callAgentTool`, `issueRunToken` |
| `AGENT_TOOL_NOT_AVAILABLE` | 501 | `create_card` |

Os sete estão em `apiErrors`; `apiErrorCodesTranslated.test.ts` passa dentro da suíte da API.

## Desvios menores

1. **Testes de MCP em dois arquivos com papéis diferentes.** `agentMcp.test.ts` testa o protocolo com
   `callAgentTool` mockado; `mcpRoute.test.ts` testa a rota com o núcleo real e os repositórios falsos. O plano
   previa o mesmo par de arquivos, mas com `tools/call` inválido no teste puro; esse caso ficou no de rota, onde a
   validação é real.
2. **`get_card` monta `answers` a partir dos eventos `answer`** (cada um já traz `questionEventId`), em vez de partir
   das perguntas e seguir `answeredByEventId`. O resultado é o mesmo par, com uma passada só.
3. **`get_card` com GitHub falhando** registra `logEvent("agent", "spec_unavailable", { runId, reason })` com o nome do
   erro, nunca a mensagem.
4. **`issueRunToken(runId)` não recebe `now`.** A transação lê o `run` e usa o `deadlineAt` dele; não há relógio a
   injetar.
5. **Ordem no núcleo:** depois do escopo, `run` fechado responde 409 a qualquer ferramenta menos `complete_stage`,
   inclusive `create_card`. Com `run` vivo, `create_card` do próprio board responde 501.
6. **Teste de paridade do script** ficou em `agentTokenScript.test.ts` junto com o teste da trava. O script importa
   `agentTokenMint.mjs` (puro, duas funções) e o teste compara com `run-token.ts`.
7. **Ajustes em arquivos de teste existentes, só arranjo ou acréscimo:** `fakeCardEventRepository.ts` ganhou
   `appendAgentEvent` (o `seed` virou função interna, mesmo comportamento); `rateLimitSubject.test.ts` e
   `runMapper.test.ts` ganharam um `describe` novo cada. Nenhuma asserção existente mudou.

## Separar os commits

Arquivos que já tinham diff de tarefas anteriores e o trecho que é desta:

| Arquivo compartilhado | Trecho desta tarefa |
|-----------------------|---------------------|
| `packages/kanban-contract/src/agentContract.ts` | `AGENT_MCP_TOOLS` e `isAgentContractTool`, no fim do arquivo |
| `packages/kanban-contract/src/index.ts` | `export * from "./agentResults";` |
| `packages/shared/utils/helpers/httpStatus.ts` | `ACCEPTED: 202` e `NOT_IMPLEMENTED: 501` (`BAD_GATEWAY` é de outra tarefa) |
| `packages/shared/utils/helpers/log.ts` | A linha `"agent"` (`"github"` e `"orchestrator"` são de outras tarefas) |
| `apps/api/(shared)/mappers/run.mapper.ts` | `tokenHash: null` e `tokenExpiresAt: null` em `newRunDocument`; `RunTokenState` e `toRunTokenState` no fim |
| `apps/api/(shared)/repositories/run.repository.ts` | Imports de `RunTokenState`/`toRunTokenState`; tipos `SetTokenResult` e `RunWithToken`; métodos `findWithToken` e `setToken` |
| `apps/api/__tests__/runMapper.test.ts` | Import de `toRunTokenState` e o `describe("run agent token")` |
| `apps/api/__tests__/fakeCardEventRepository.ts` | `seed` como `const` interna e o método `appendAgentEvent` |
| `apps/api/package.json` | A linha `agent-token` |
| `packages/internationalization/translations/packages/shared/utils.ts` | De `AGENT_TOKEN_INVALID` até `AGENT_TOOL_NOT_AVAILABLE` |
| `docs/board/ARCHITECTURE.md` | O trecho do token na linha `run` |
| `docs/board/CONTRACT.md` | Seção "Autenticação" inteira, seção "Endpoints", a linha `create_card`, seções "Respostas" e "Erros" |
| `docs/SETUP.md` | O bloco do `agent-token` depois do parágrafo do `fake-executor` |
| `docs/PRE-PRODUCTION.md` | A subseção "Token do agente no connector MCP da nuvem" |

Arquivos só desta tarefa (diff inteiro): `rate-limit-subject.ts`, `rateLimitSubject.test.ts`,
`vitest.emulator.config.mts`, tudo em `(shared)/lib/agent-contract/`, `app/(routes)/agent/`, `app/(routes)/mcp/`,
`scripts/agent-token.mjs`, `scripts/agentTokenMint.mjs`, `packages/kanban-contract/src/agentResults.ts` e os testes
novos (`agentRunToken`, `agentToolScope`, `agentToolsRoutes`, `agentMcp`, `mcpRoute`, `agentTokenScript`,
`agentRunFixtures.ts`, `agentContract.emulator`).

Ordem sugerida, seguindo o plano (10.8): contrato; `feat(shared)` com os dois status (ou junto do commit 1 da API, como
o escopo de log); API em cinco commits (token: `run-token-format`, `run-token`, mapper e repositório do `run`, testes
de token e de mapper; ferramentas HTTP: `agent-context`, `agent-guard`, `agent-scope`, `agent-card-view`,
`agent-tools`, rota, `fakeCardEventRepository`, `agentRunFixtures`, testes de escopo e de rota; MCP: `mcp.ts`, rota,
`agentMcp` e `mcpRoute`; rate limit; script + `package.json` + teste do script + teste de emulador + alias do vitest);
i18n; docs; `docs(features): agent-contract` por último. O i18n precisa entrar antes do commit da API ficar verde no
`apiErrorCodesTranslated`, ou os commits da API ficam vermelhos até ele, como nos planos anteriores.

## Decisões em aberto e pendências

- As quatro perguntas do plano seguem com a recomendação aplicada: `create_card` responde 501; sem recheque de papel
  por chamada; MCP escrito à mão, sem dependência nova; header com token no MVP e a nuvem decidida pela
  `cloud-routines-runner` (pendência em `docs/PRE-PRODUCTION.md`).
- Correção 2 (lugar do guard) é a que mais merece olhar do `/review`.
- `issueRunToken` não tem chamador em produção, como o plano decidiu (D2). O único emissor hoje é o script do
  emulador.
- Risco aceito do plano, mantido: dois `complete_stage` simultâneos no mesmo `run` podem gravar dois relatórios; a
  transição continua única porque `completeRun` é idempotente.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 910 arquivos, sem erro |
| Lint, typecheck e testes | `pnpm turbo run lint typecheck test` | 25 de 25 tasks (10 do cache) |
| Testes da API | `pnpm --filter api exec vitest run` | 102 arquivos, 1223 testes |
| Emulador | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator` | 6 arquivos, 151 testes; `agentContract.emulator.test.ts` 3 de 3. Portas 8080 e 9199 livres antes e depois (`lsof`); o script subiu e derrubou os próprios emuladores |
| `apiErrors` | `apiErrorCodesTranslated.test.ts`, dentro da suíte da API | passa |

Medido em `agentContract.emulator.test.ts`, contra o Firestore do emulador, com `triggerStage` e `completeRun` reais e
a rota `POST /agent/tools/[tool]` chamada com o guard real:

- `issueRunToken` grava `tokenExpiresAt` como `Timestamp`, igual ao `deadlineAt`; `findWithToken` o devolve em ISO; o
  documento serializado não contém o segredo; `get_card` com o token responde 200;
- `post_update` 200, `complete_stage` → `{ ignored: false }`, repetido → `{ ignored: true }`, `post_update` depois →
  409 `AGENT_RUN_CLOSED`; um único evento `report`, com o `runId`; o `run` fica `active: false`, `outcome: success`,
  `endReason: agent`; o card sai de `analyze`; `issueRunToken` no `run` fechado → `AGENT_RUN_CLOSED`;
- `tokenExpiresAt` no passado → 401 `AGENT_TOKEN_EXPIRED`.

Medido em testes unitários e de rota (repositórios falsos, `completeRun` mockado): sem header 401 com
`WWW-Authenticate: Bearer` e sem leitura do banco; formato errado 401 sem leitura; `run` inexistente e segredo errado
dão a mesma resposta; ferramenta desconhecida 404; `ask` com cinco perguntas 400 `VALIDATION_FAILED` sem evento;
outro card 403 `AGENT_CARD_MISMATCH` sem evento; outra etapa 403; `ask` abre `pendingAsk`; artefato com `..` 422;
`create_card` 501 no próprio board e 403 em outro; `get_card` sem GitHub devolve `spec.content: null` com as respostas
pareadas, e a resposta não contém o segredo. MCP: `initialize` ecoa versão conhecida e oferece `2025-11-25` para
desconhecida; notificação 202 sem corpo; `tools/list` com cinco ferramentas e `maxItems: 4` em `ask`; `server/discover`
com `resultType: "complete"`; `Mcp-Name` em base64 aceito; header divergente 400 `-32020`; versão desconhecida 400
`-32022` com a lista suportada; sem `clientCapabilities` 400 `-32602`; método desconhecido 404 `-32601` (moderno) e
`-32601` (legado); lote 400 `-32600`; JSON inválido 400 `-32700`; `GET`/`DELETE` 405 com `Allow: POST`. O script
`agent-token.mjs` sai com 1 sem os dois emuladores e com projeto que não é `demo-*`, sem imprimir `kbr_`.

## A verificar no `/test`

Repro: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*` (`docs/SETUP.md`), importar `sample-app`,
sincronizar o backlog, `pnpm --filter api fake-executor script <boardId> <slug> silent`, arrastar o card para Análise
como `operator`, `export KANBAN_RUN_TOKEN="$(pnpm --silent --filter api agent-token <boardId> <slug>)"`. O relatório
cita o token como `kbr_<runId>_***`. Nada abaixo foi medido nesta etapa, porque não subi API nem app:

- Percurso 1 a 13 do plano (8.3) por `curl` contra a API de pé, incluindo o `proxy` real: sem header 401; `get_card`
  com `spec.content` vindo do GitHub falso; o evento do agente aparecendo na linha do tempo do card no app; "Aguardando
  você" depois do `ask`; responder no app e `complete_stage success` movendo o card; `GET /mcp` 405.
- O Next aceita o tipo das duas rotas novas no `next build` (o `tsc` passa; o build não foi rodado).
- `POST /mcp` sem `Origin` passa pelo `proxy` e com `Origin` fora da lista leva 403 `AUTH_FORBIDDEN_ORIGIN`.
- Handshake com um cliente MCP real: `claude -p` com o `--mcp-config` do `CONTRACT.md` e o token na env, pedindo
  `mcp__kanban__get_card` e `mcp__kanban__post_update`. Mostra qual era do protocolo o Claude Code usa hoje. Se não der
  para montar, fica **não verificado**.
- Rate limit por `run`: só tem efeito com `ARCJET_KEY`; sem ele `checkRateLimit` degrada. O teste unitário cobre a
  escolha do ator.

## Lacunas de teste conhecidas

- Nenhum teste prova `complete_stage` concorrente no mesmo `run` (risco aceito acima).
- `setToken` concorrente com `finishOnCard` não tem teste de emulador; as duas são transações no documento do `run`,
  então a perdedora repete e encontra o `run` fechado.
- O `proxy` com bearer `kbr_` só tem teste no nível de `rateLimitSubject`, não no `proxy` inteiro.
