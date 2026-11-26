# Plano: contrato dos agentes (HTTP + servidor MCP)

Spec de origem: [`specs/features/agent-contract.md`](../../../../specs/features/agent-contract.md), status `proposed`
quando o `/cycle` a executou (o usuário pediu o máximo de tarefas nesta branch; a spec não foi aprovada por
ele). Depende do `orchestrator`, que está sendo implementado ao mesmo tempo a partir de
[`docs/features/orchestrator/analyze/plan.md`](../../orchestrator/analyze/plan.md). Este plano parte do working
tree de 2026-11-26 (tarefas 1 a 7 implementadas, sem commit) e das fronteiras que o plano do `orchestrator`
promete: coleção `run`, `runRepository`, `completeRun`, `StageDispatch`, `StageExecutor`. Onde o código real
do `orchestrator` mudar um nome, o `/develop` segue o código e registra o desvio no handoff.

## Etapa 1: análise

### 1. Contexto

Hoje nada fora de uma pessoa logada escreve no card. A `card-timeline` deixou prontos os pontos de encaixe
para o agente (`agentEventFromTool` em `apps/api/(shared)/lib/card-events.ts:51` e `appendAgentEvent` em
`apps/api/(shared)/repositories/card-event.repository.ts:116`), mas nenhuma rota os chama. O `orchestrator`
cria o `run` e expõe `completeRun` como única porta para `resolveTransition`, e também não tem quem o chame
pelo lado do agente (plano do `orchestrator`, tabela de fronteiras, linha `agent-contract`).

Esta spec liga a sessão do Claude Code ao board: as seis ferramentas de `AGENT_CONTRACT_TOOLS`
(`packages/kanban-contract/src/agentContract.ts:72`) viram endpoints HTTP e um servidor MCP `kanban`, e cada
chamada é autenticada por um token que vale só para um `run`.

**Valor para o usuário:** é a ponte que falta para o `local-runner` e para as sessões na nuvem escreverem no
card e encerrarem a etapa. Sem ela o board só anda com o executor falso.

**Corte de MVP** (o da spec, sem mudança):

1. Token de execução por `run`, curto e revogado quando a etapa termina.
2. Rotas HTTP para as seis ferramentas, validando com os schemas do contrato.
3. Servidor MCP `kanban` em HTTP remoto com as mesmas ferramentas.
4. `get_card` devolve spec, slug, branch, etapa, respostas e artefatos.
5. `complete_stage` idempotente por `run`.
6. Testes de contrato: payload inválido recusado com código; token de outro card recusado.

**Fora de escopo:**

- `create_card` com quebra de épico automática (spec). Ver decisão D6: a rota existe, valida e responde 501.
- Quem entrega o token ao agente: o `local-runner` (no momento em que o runner pega o trabalho) e o
  `cloud-routines-runner` (no disparo). Aqui fica a função que emite o token e o script de QA que a imita.
- Registrar o runner, credenciais por pessoa (`execution-credentials`), OAuth para connectors da nuvem.
- Tela nova. A linha do tempo da `card-timeline` já mostra o que o agente escreve.

**Regras que governam o desenho:**

- Regra 14: o agente informa o resultado; `complete_stage` só chama `completeRun`. Nenhuma linha deste módulo
  grava `state`, `lane` ou `stageKey`.
- Regra 15: o token sai da API uma vez, no momento da emissão. O documento guarda só o hash SHA-256 do segredo,
  e o token expira no `deadlineAt` do `run`.
- Regra 16: tudo que o agente manda é validado com os schemas do contrato e gravado como dado. O `get_card`
  devolve campos nomeados, sem texto de instrução montado pelo board.

#### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/agent-contract.md` | Corte, risco de markdown não confiável, pergunta "token no header ou OAuth" com recomendação header |
| `.claude/cycle-policy.md` | Sem dependência nova sem relatório; modo degradado com `error.code`; corte manda |
| `docs/board/CONTRACT.md` | Tabela das ferramentas com os limites de tamanho; idempotência; resposta vai no próximo disparo |
| `docs/board/ARCHITECTURE.md:31,76-78` | Contrato mora em `apps/api`; `runs` e `cardEvent.runId` |
| `docs/board/ACCESS.md:46-56` | Quem disparou fica no `run`; credencial de quem disparou |
| `docs/board/ROADMAP.md:64` | Fase 1, item 9; o `local-runner` (item 10) depende deste |
| `.claude/rules/board-mode.md` | O agente chama `get_card` no início, `ask` com até 4 perguntas, `complete_stage` sempre no fim |
| `packages/kanban-contract/src/agentContract.ts` | Os seis schemas; `MAX_MARKDOWN` 20.000 |
| `packages/kanban-contract/src/cardEvent.ts` | `ResolvedAnswer`, `CardPendingAsk`, `displayCardState` |
| `apps/api/(shared)/lib/card-events.ts` | `agentEventFromTool` (valida etapa e caminho do artefato), `normalizeArtifactPath` |
| `apps/api/(shared)/repositories/card-event.repository.ts` | `appendAgentEvent` abre `pendingAsk` na mesma transação; `listByCard` ordenado |
| `apps/api/(shared)/mappers/card-event.mapper.ts:39,44-58,75` | `runId` existe no documento, mas `CardEventWrite` não o aceita e `cardEventDocument` grava `null` |
| `docs/features/card-timeline/develop/handoff.md` | Desvio 1: `CARD_ARTIFACT_PATH_INVALID` já tem copy; `listByCard` devolve DTO puro "para o `agent-contract`" |
| `docs/features/orchestrator/analyze/plan.md` (2.1, 4.3, 4.7, 10.1, 10.3) | `run` com `active`, `status`, `deadlineAt`, `branch`, `command`, `model`, `effort`, `maxTurns`; `completeRun({ board, runId, outcome, endReason, now }) → { ignored }`; `StageDispatch` com `runId` |
| `apps/api/proxy.ts:55-68,133-196` | Todo POST entra no orçamento `standard` por endereço e ator; origem nula é aceita |
| `apps/api/(shared)/lib/cookie-write-origin.ts:12` | Requisição com `Authorization` não é tratada como escrita por cookie |
| `apps/api/(shared)/lib/rate-limit-subject.ts:61` | Ator só sai de JWT; um token que não é JWT cai em `anonymous` |
| `apps/api/app/(routes)/github/webhook/route.ts` | Precedente de rota autenticada sem sessão (assinatura), com `error.code` |
| `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/route.ts` | Como ler o corpo da spec pelo cliente GitHub, com modo degradado |
| `apps/api/(shared)/lib/parse-request-json.ts` | Corpo limitado a 100 KiB, 400/413 com `VALIDATION_FAILED` |
| `packages/shared/utils/helpers/httpStatus.ts` | Não há 501 na tabela |
| `pnpm-lock.yaml:2067,13267` | `@modelcontextprotocol/sdk@1.30.0` existe só como dependência do `firebase-tools` (ferramenta de dev); `apps/api/package.json` não o declara |
| `specs/features/local-runner.md`, `cloud-routines-runner.md` | O runner busca trabalho por polling; a nuvem usa connector MCP configurado na tarefa agendada |
| `specs/reference/AUDIT.md:76-82` | `local-runner`, `cycle-runs`, `spec-authoring` e `cloud-routines-runner` dependem deste |

Referências não lidas: o artboard `CardPr` do canvas do Claude Design é privado. O relatório da etapa já está
desenhado pela `card-timeline` a partir de `docs/design/`, e esta spec não muda tela.

### 1.2 Apps impactados

| Onde | O quê |
|------|-------|
| `packages/kanban-contract` | Tipos das respostas das ferramentas (`agentResults.ts`, só tipos) e a lista de ferramentas expostas no MCP |
| `packages/shared` | `HTTP_STATUS.ACCEPTED` e `HTTP_STATUS.NOT_IMPLEMENTED` (duas linhas) |
| `apps/api` | Token de execução, guard do agente, núcleo das ferramentas, rota HTTP, rota MCP, ajuste no balde de rate limit, script de QA |
| `packages/internationalization` | Sete códigos novos em `apiErrors` (o `apiErrorCodesTranslated.test.ts` exige copy para todo código literal em `(shared)/`) |
| `apps/app`, `packages/sdk` | Nenhum. O agente não usa o SDK do front; o app já desenha os eventos |

A spec dizia "Nenhum" para `packages/kanban-contract`. Os tipos de resposta entram lá porque o `local-runner`
vai consumir as mesmas respostas, e a regra 12 manda o domínio dos agentes para o contrato (desvio D7).

### 2. Dados (Firestore)

#### 2.1 `run`: campos novos

A coleção é do `orchestrator`. Este plano acrescenta dois campos, lidos e escritos só por este módulo:

| Campo | Tipo | Default | Por quê |
|-------|------|---------|---------|
| `tokenHash` | string \| null | `null` | SHA-256 em hex do segredo do token. Uma emissão nova sobrescreve (a anterior deixa de valer) |
| `tokenExpiresAt` | Timestamp \| null | `null` | Igual ao `deadlineAt` do `run` no momento da emissão |

O mapper do `run` lê os dois com `null` quando faltam (nenhuma migração). `RunDTO` (público, plano do
`orchestrator` 10.2) não ganha esses campos; o teste do mapper confere que `toRunDTO` não os expõe.

Por que hash e não cifra: a regra 15 fala em "cifrados" para segredos que o servidor precisa ler de volta
(token de instalação, chave de API). O token de execução nunca é lido de volta: a API só compara. Hash de um
segredo de 256 bits aleatórios é suficiente e não exige chave de cifra nova nem env.

#### 2.2 `cardEvent`: `runId` preenchido

O campo já existe (`card-event.mapper.ts:39`) e nasce `null`. `CardEventWrite` passa a aceitar `runId`
opcional e `cardEventDocument` grava `write.runId ?? null`. O plano do `orchestrator` pede o mesmo para o
executor falso; se o `/develop` dele já fez, reutilize.

#### 2.3 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| `run` pelo token | `doc(runId)`, com o `runId` tirado do próprio token | Nenhum |
| Eventos do card (`get_card`) | `cardEventRepository.listByCard(cardId)` (existente, só igualdade) | Nenhum |

O token carrega o id do `run`, então autenticar custa uma leitura por id, sem consulta por hash. O volume de
eventos por card é de centenas no máximo (comentário em `card-event.repository.ts:43`), então o `get_card`
filtra em memória.

### 3. Contrato

#### 3.1 Formato do token

`kbr_<runId>_<segredo>`, em que `segredo` são 32 bytes de `randomBytes` em base64url (43 caracteres). Regex
`^kbr_([A-Za-z0-9]{1,128})_([A-Za-z0-9_-]{43})$`. O id automático do Firestore não tem `_`, então o primeiro
`_` depois do prefixo separa as partes sem ambiguidade. O prefixo deixa o token reconhecível em varredura de
segredo e permite ao `proxy` escolher o balde de rate limit sem verificar nada (4.5).

#### 3.2 Tipos de resposta (`packages/kanban-contract/src/agentResults.ts`, só tipos)

`AgentCardView` (resposta do `get_card`), `AgentEventResult` (`{ eventId }`) e `AgentCompleteResult`
(`{ ignored: boolean }`). Forma em 10.1. `index.ts` reexporta.

#### 3.3 Quem quebra

Ninguém. `CardEventWrite` ganha um campo opcional. `RunRecord` ganha dois campos internos. `HTTP_STATUS`
ganha duas chaves.

### 4. API

#### 4.1 Rotas

| Rota | Autenticação | O que faz |
|------|--------------|-----------|
| `POST /agent/tools/[tool]` | `Authorization: Bearer kbr_…` | Uma ferramenta por chamada; o corpo é a entrada da ferramenta. `200 { data }` ou `{ error: { code } }` |
| `POST /mcp` | `Authorization: Bearer kbr_…` | Servidor MCP `kanban` (Streamable HTTP sem sessão, resposta `application/json`) |
| `GET /mcp`, `DELETE /mcp` | nenhuma | `405`: o servidor não abre stream SSE nem guarda sessão, o que a especificação do transporte permite |

Uma rota dinâmica e não seis arquivos: o mapa `AGENT_CONTRACT_TOOLS` já é a tabela de despacho, e o MCP usa o
mesmo núcleo (4.3). `get_card` também é `POST` para que HTTP e MCP tenham a mesma forma; a leitura não muda
estado.

Nenhuma das duas passa por `requireCommonPanelApi` ou `requireBoardApi`: quem chama é o agente, não uma pessoa.
Desvio declarado da regra 13 (D3): o papel efetivo foi resolvido por `requireBoardApi("trigger")` quando a
pessoa disparou o `run`, e o token não sai do `run`, do card e da etapa dele.

#### 4.2 Guard do agente (`app/(guards)/agent.ts`)

`requireAgentApi(handler)` resolve, nesta ordem:

1. Header `Authorization` ausente, sem `Bearer` ou fora da regex → 401 `AGENT_TOKEN_INVALID`, com
   `WWW-Authenticate: Bearer`.
2. `runRepository.findById(runId)`; inexistente → 401 `AGENT_TOKEN_INVALID` (mesmo código, para não revelar
   quais ids existem).
3. `tokenHash` nulo ou diferente do hash do segredo (`timingSafeEqual`) → 401 `AGENT_TOKEN_INVALID`.
4. `now >= tokenExpiresAt` → 401 `AGENT_TOKEN_EXPIRED`.
5. Board (`boardRepository.findById(run.boardId)`) e card (`cardRepository.findById(run.cardId)`); ausentes
   → 404 `BOARD_NOT_FOUND` / `CARD_NOT_FOUND` (códigos existentes).

Entrega ao handler `AgentContext = { run, board, card, now }`. Sessão de cookie e personificação não entram:
o guard não lê cookie, então sob personificação nada muda.

#### 4.3 Núcleo das ferramentas (`(shared)/lib/agent-contract/agent-tools.ts`)

`callAgentTool(tool: string, rawInput: unknown, ctx: AgentContext): Promise<AgentToolOutcome>`, com
`AgentToolOutcome = { ok: true; data: unknown } | { ok: false; code: string; status: number }`. Ordem:

1. `tool` fora de `AGENT_CONTRACT_TOOLS` → 404 `AGENT_TOOL_NOT_FOUND`.
2. `safeParse` com o schema do contrato → 400 `VALIDATION_FAILED` (o código padrão do repo).
3. Escopo (`checkToolScope`, puro): `cardId` diferente de `run.cardId` → 403 `AGENT_CARD_MISMATCH`; `stage`
   diferente de `run.stageKey` → 403 `AGENT_STAGE_MISMATCH`; em `create_card`, `boardId` diferente de
   `run.boardId` → 403 `AGENT_CARD_MISMATCH`.
4. `run` encerrado (`active === false`): `complete_stage` → 200 `{ ignored: true }`; as demais → 409
   `AGENT_RUN_CLOSED`. É a revogação: depois do `complete_stage`, da parada ou do tempo limite, o token só
   serve para repetir o `complete_stage` sem efeito.
5. Execução:

| Ferramenta | Execução | `data` |
|------------|----------|--------|
| `get_card` | `buildAgentCardView` (4.4) | `AgentCardView` |
| `post_update`, `ask`, `attach_artifact` | `agentEventFromTool({ tool, input }, { card, config: board.config })`; recusa vira 404 `CARD_STAGE_NOT_FOUND` ou 422 `CARD_ARTIFACT_PATH_INVALID`; depois `cardEventRepository.appendAgentEvent(card, { ...write, runId: run.id })` | `{ eventId }` |
| `complete_stage` | Evento `report` como acima, depois `completeRun({ board, runId: run.id, outcome, endReason: "agent", now })` | `{ ignored }` vindo do `completeRun` |
| `create_card` | Nada (D6) | 501 `AGENT_TOOL_NOT_AVAILABLE` |

O evento `report` é gravado antes do `completeRun` para a linha do tempo ficar na ordem certa (o relatório da
etapa antes dos eventos do despacho seguinte, que o `completeRun` pode provocar). O passo 4 já barra o caso
comum de repetição. Duas chamadas simultâneas de `complete_stage` no mesmo `run` podem gravar dois relatórios;
a transição continua única porque o `completeRun` é idempotente. Fica registrado como risco aceito.

#### 4.4 `get_card`

`buildAgentCardView({ run, board, card })`:

- `card`: `id`, `boardId`, `slug`, `title`, `lane`, `stageKey`, `state: displayCardState(card)`,
  `reworkLoops`, `branch`.
- `run`: `id`, `stageKey`, `command`, `model`, `effort`, `maxTurns`, `branch`, `deadlineAt`.
- `repository`: `owner`, `name`, `baseBranch` (de `board.repository` e `board.config.baseBranch`).
- `spec`: `path`, `ref` (`baseBranch`), `sha`, `content` (corpo sem frontmatter, via `specBody`). Mesma leitura
  da rota `cards/[slug]/spec`. GitHub não configurado ou erro do GitHub → `content: null` e `sha: null`, com
  `logEvent("agent", "spec-unavailable", { runId })`. O agente tem o checkout e lê o arquivo de lá; o `get_card`
  não falha por isso.
- `pendingAsk`: `card.pendingAsk`.
- `answers`: para cada evento `question` com `answeredByEventId`, o par
  `{ questionEventId, stageKey, answeredAt, answers: ResolvedAnswer[] }`, em ordem cronológica, de todas as
  etapas. O agente filtra pela dele.
- `artifacts`: eventos `artifact` em ordem, `{ stageKey, path, commitSha, createdAt }`.

Comentários de pessoas não entram neste corte (CONTRACT.md não os pede).

#### 4.5 Rate limit

O `proxy` coloca todo POST no orçamento `standard` (60 por minuto por endereço e ator). O token não é JWT, então
hoje todo agente cairia no ator `anonymous` do endereço. Na nuvem, sessões de pessoas diferentes saem dos
mesmos endereços da Anthropic e dividiriam um balde. `rateLimitSubject` passa a reconhecer o prefixo `kbr_` e
usa o hash de `run:<runId>` como ator, sem verificar o token: o mesmo argumento do comentário em
`rate-limit-subject.ts:56-59` (um id forjado só compra um balde novo para uma requisição que o guard recusa).
O parse do formato fica num módulo sem `node:crypto` (`run-token-format.ts`), importável pelo `proxy`.

#### 4.6 Emissão do token (`(shared)/lib/agent-contract/run-token.ts`)

```ts
export async function issueRunToken(runId: string, now?: Date):
    Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; code: "AGENT_RUN_CLOSED" }>;
```

Transação no `run` (`runRepository.setToken`): exige `active === true`, `status === "running"` e `deadlineAt`
preenchido; grava `tokenHash` e `tokenExpiresAt = deadlineAt`. Devolve o token em claro uma vez.

Ninguém chama `issueRunToken` em produção neste corte (D2). Os consumidores previstos são a rota em que o
`local-runner` pega um `run` e o despacho do `cloud-routines-runner`. O executor falso não usa token: ele grava
na linha do tempo direto, como o plano do `orchestrator` define.

#### 4.7 MCP mínimo (`(shared)/lib/agent-contract/mcp.ts`)

JSON-RPC 2.0 sobre o transporte Streamable HTTP, sem sessão e sem SSE, escrito à mão (D1). Um POST leva uma
mensagem; a resposta é `application/json`.

| Mensagem | Resposta |
|----------|----------|
| `initialize` | `{ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "kanban", version } }`. Devolve a versão do cliente se estiver em `MCP_PROTOCOL_VERSIONS`, senão a mais nova da lista |
| `notifications/initialized` e qualquer notificação | HTTP 202 sem corpo |
| `ping` | `{}` |
| `tools/list` | As cinco ferramentas de `AGENT_MCP_TOOLS` (sem `create_card`), com `inputSchema` de `z.toJSONSchema(schema)` (Zod 4, já no repo) e uma descrição curta em inglês |
| `tools/call` | `callAgentTool(name, arguments, ctx)`. Sucesso: `{ content: [{ type: "text", text: JSON.stringify(data) }] }`. Recusa: o mesmo com `isError: true` e `{ error: { code } }` no texto |
| Método desconhecido | erro `-32601` |
| Corpo que não é objeto JSON-RPC, ou um array (lote) | erro `-32600` |
| JSON inválido | erro `-32700` (o `parseRequestJson` responde 400 antes; o handler converte para o envelope JSON-RPC) |

Erro de autenticação não vira JSON-RPC: o guard responde 401 HTTP antes, como pede a parte de autorização da
especificação. A lista `MCP_PROTOCOL_VERSIONS` e os nomes dos campos são conferidos pelo `/develop` contra a
especificação publicada em modelcontextprotocol.io no dia da implementação; este plano não fixa números de
versão de memória.

O `proxy` já recusa `Origin` fora da lista de CORS, que é a proteção contra DNS rebinding que a especificação
pede ao servidor. O Claude Code não manda `Origin`, e origem nula passa (`cors.ts:53`).

Configuração do lado do agente, para documentar no `CONTRACT.md`:

```json
{ "mcpServers": { "kanban": { "type": "http", "url": "<API>/mcp",
  "headers": { "Authorization": "Bearer ${KANBAN_RUN_TOKEN}" } } } }
```

#### 4.8 Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `AGENT_TOKEN_INVALID` | 401 | Sem token, formato errado, `run` inexistente ou segredo diferente |
| `AGENT_TOKEN_EXPIRED` | 401 | Depois de `tokenExpiresAt` |
| `AGENT_TOOL_NOT_FOUND` | 404 | Nome de ferramenta fora do contrato |
| `AGENT_CARD_MISMATCH` | 403 | `cardId` (ou `boardId` no `create_card`) diferente do `run` |
| `AGENT_STAGE_MISMATCH` | 403 | `stage` diferente da etapa do `run` |
| `AGENT_RUN_CLOSED` | 409 | Ferramenta de escrita ou leitura depois de o `run` fechar |
| `AGENT_TOOL_NOT_AVAILABLE` | 501 | `create_card` neste corte |
| `VALIDATION_FAILED` (existente) | 400/413 | Payload fora do schema ou acima de 100 KiB |
| `CARD_STAGE_NOT_FOUND`, `CARD_ARTIFACT_PATH_INVALID` (existentes) | 404, 422 | Recusas de `agentEventFromTool` |
| `BOARD_NOT_FOUND`, `CARD_NOT_FOUND` (existentes) | 404 | Board ou card do `run` sumiu |

Os sete novos entram em `apiErrors` (`translations/packages/shared/utils.ts`). Nenhuma tela os mostra hoje, mas
o `apiErrorCodesTranslated.test.ts` varre `(shared)/` atrás de literais `UPPER_SNAKE`.

### 5. Front-end

N/A. Os eventos do agente aparecem na linha do tempo que a `card-timeline` já desenha, e o selo e a coluna vêm do
`orchestrator`.

### 6. Autorização e segurança

- Token: 256 bits aleatórios; só o hash no banco; comparação em tempo constante; expira no `deadlineAt`;
  revogado na prática quando o `run` fecha (4.3, passo 4). Emissão nova invalida a anterior.
- Escopo: um token só lê e escreve no card, na etapa e no board do próprio `run`. Teste dedicado (7).
- Nada loga o header `Authorization` nem o token. `logEvent` recebe só `runId`, `tool` e o código.
- Regra 16: entrada validada pelos schemas com os limites do contrato (pergunta até 1.000, markdown até
  20.000, caminho sem `..`). O markdown é renderizado sem HTML pela `card-timeline` (risco da spec).
- `firestore.rules` nega tudo ao cliente; `tokenHash` herda essa negação.
- Personificação: N/A, o guard não usa sessão.
- Regra 13 (desvio D3): sem recheque do papel por chamada. Uma pessoa que perde acesso ao repositório durante
  o `run` não interrompe o agente até o fim da etapa; quem tem `operator` pode parar o `run`, e a parada
  revoga o token.

### 7. Testes

| Nível | Arquivo | O que prova |
|-------|---------|-------------|
| API, puro | `apps/api/__tests__/agentRunToken.test.ts` | Formato `kbr_`; parse recusa prefixo errado, segredo curto, `runId` com caractere inválido; hash bate; comparação recusa segredo diferente e de tamanho diferente; expirado no instante exato do `tokenExpiresAt` |
| API, puro | `__tests__/agentToolScope.test.ts` | `checkToolScope`: card de outro `run` → `AGENT_CARD_MISMATCH`; etapa errada → `AGENT_STAGE_MISMATCH`; `create_card` de outro board; casos válidos |
| API, puro | `__tests__/agentMcp.test.ts` | `initialize` negocia versão; notificação devolve sem corpo; `tools/list` tem cinco ferramentas, sem `create_card`, e o `inputSchema` de `ask` traz `maxItems: 4`; `tools/call` com entrada inválida devolve `isError` e `VALIDATION_FAILED`; método desconhecido `-32601`; lote `-32600` |
| API, rota | `__tests__/agentToolsRoutes.test.ts` | Com `vi.mock` de `runRepository`, `boardRepository`, `cardRepository`, do `completeRun` e do cliente GitHub, e o `fakeCardEventRepository.ts` existente: sem header 401; token errado 401; expirado 401; ferramenta desconhecida 404; **payload inválido 400 `VALIDATION_FAILED`**; **token de outro card 403 `AGENT_CARD_MISMATCH`**; etapa errada 403; `post_update` grava evento com `runId`; `ask` abre `pendingAsk`; artefato com `..` 422; `complete_stage` grava um `report` e chama `completeRun` uma vez com `endReason: "agent"`; repetido com `run` fechado devolve `{ ignored: true }` sem novo `report` nem `completeRun`; `post_update` com `run` fechado 409; `create_card` 501; `get_card` com GitHub desligado devolve `spec.content: null` e as respostas pareadas |
| API, rota | `__tests__/mcpRoute.test.ts` | Mesmo guard: sem token 401 sem envelope JSON-RPC; `tools/call` de `post_update` grava pelo mesmo núcleo; `GET` 405 |
| API, puro | `__tests__/rateLimitSubject.test.ts` (existente) | Token `kbr_` vira ator por `run`; dois `run`s, dois atores; formato quebrado continua `anonymous` |
| API, mapper | teste do mapper do `run` (o do `orchestrator`) | `tokenHash`/`tokenExpiresAt` ausentes viram `null`; `toRunDTO` não os expõe |
| API, puro | `__tests__/agentTokenScript.test.ts` | O hash do script `agent-token.mjs` é igual ao de `run-token.ts` para o mesmo segredo (o script reimplementa duas linhas) |
| API, emulador | `__tests__/agentContract.emulator.test.ts` | O que o unitário não prova: `issueRunToken` grava `tokenExpiresAt` como `Timestamp` e o guard o lê de volta pelo mapper real; `issueRunToken` recusa `run` encerrado dentro da transação; depois de um `completeRun` real, `complete_stage` repetido devolve `ignored` e `post_update` 409 |
| i18n | `apiErrorCodesTranslated.test.ts` (existente) | Os sete códigos têm copy |

### 8. O que o `/test` vai percorrer

Sem tela nova, então sem matriz de tema e viewport (política 3.1). O `/test` sobe emulador e API, usa o app
só para criar o `run` e olhar o card uma vez, e prova o contrato por `curl`.

#### 8.1 Preparação

1. `pnpm emulators`, `pnpm seed`, `pnpm dev`.
2. Card pronto no board de exemplo. Roteiro `silent` no executor falso, para ele não responder no lugar do
   agente: `node apps/api/scripts/fake-executor.mjs script <boardId> <slug> silent` (script do `orchestrator`).
3. Arrastar o card para Análise como `operator` e confirmar. O `run` fica `running`.
4. `node apps/api/scripts/agent-token.mjs <boardId> <slug>` imprime o token no terminal. O token **não** entra em
   nenhum arquivo de `docs/features/`; o relatório cita `kbr_<runId>_***`.

#### 8.2 Script `apps/api/scripts/agent-token.mjs` (novo, fica no repositório)

Com a trava `refuseSeedReason` de `emulatorTarget.mjs`. Lê o card `<boardId>__<slug>`, pega `activeRunId`,
exige `run` `running`, grava `tokenHash` e `tokenExpiresAt = deadlineAt` e imprime o token. `--expired` grava
`tokenExpiresAt` no passado, para o caso 401 `AGENT_TOKEN_EXPIRED`. Script `agent-token` no
`apps/api/package.json`, como `seed:timeline`.

#### 8.3 Percurso

| # | Chamada | Esperado |
|---|---------|----------|
| 1 | `POST /agent/tools/get_card` sem header | 401 `AGENT_TOKEN_INVALID` |
| 2 | `get_card` com o token | 200 com slug, branch, `run.stageKey: "analyze"`, `spec.content` do fake GitHub |
| 3 | `post_update` | 200; o detalhe do card mostra o evento do agente |
| 4 | `post_update` com `cardId` de outro card | 403 `AGENT_CARD_MISMATCH` |
| 5 | `ask` com 5 perguntas | 400 `VALIDATION_FAILED` |
| 6 | `ask` com 1 pergunta | 200; o card mostra "Aguardando você" |
| 7 | `attach_artifact` com `../x` e com `docs/x.md` | 422 `CARD_ARTIFACT_PATH_INVALID`; 200 |
| 8 | `POST /mcp` `initialize`, `tools/list`, `tools/call` (`post_update`) | Envelope JSON-RPC; cinco ferramentas; evento gravado |
| 9 | Responder a pergunta no app, depois `complete_stage` `success` | 200 `{ ignored: false }`; o card sai de Análise pela regra do `resolveTransition` (consulta ao card pelo REST do emulador ou o quadro) |
| 10 | `complete_stage` de novo | 200 `{ ignored: true }`, sem segundo relatório na linha do tempo |
| 11 | `post_update` depois do fim | 409 `AGENT_RUN_CLOSED` |
| 12 | Token emitido com `--expired` num `run` novo | 401 `AGENT_TOKEN_EXPIRED` |
| 13 | `GET /mcp` | 405 |

Opcional, se o ambiente tiver o CLI do Claude: `claude -p` com o `--mcp-config` de 4.7 e o token na env,
pedindo `mcp__kanban__get_card` e `mcp__kanban__post_update`. Prova o handshake com um cliente MCP real. O sinal
de pronto completo da spec (`/develop … --board` movendo o card) depende do `local-runner` entregar o token, e
fica **não verificado** se não der para montar à mão.

### 9. Critérios de aceite

1. Uma chamada sem token, com token de formato errado ou de `run` inexistente recebe 401
   `AGENT_TOKEN_INVALID`.
2. Um token só lê e escreve no card e na etapa do seu `run`; outro card recebe 403 `AGENT_CARD_MISMATCH`.
3. Payload fora do schema do contrato recebe 400 `VALIDATION_FAILED`, pelo HTTP e pelo MCP.
4. `post_update`, `ask` e `attach_artifact` aparecem na linha do tempo do card com o `runId`.
5. `complete_stage` move o card só pelo `completeRun`; repetido, devolve `{ ignored: true }` sem efeito.
6. Depois de o `run` fechar, as outras ferramentas recebem 409 `AGENT_RUN_CLOSED`; depois do `deadlineAt`, 401
   `AGENT_TOKEN_EXPIRED`.
7. O servidor MCP responde `initialize`, `tools/list` (cinco ferramentas) e `tools/call` com o mesmo resultado
   do HTTP.
8. O banco guarda só o hash do token; nenhuma resposta, log ou `RunDTO` traz o token ou o hash.

### Infra e pendências de ambiente

- **Local:** nada novo. Nenhuma env, índice, rule ou dependência.
- **Produção, connector da nuvem:** o MCP precisa da API em HTTPS público, e o connector das tarefas agendadas
  precisa aceitar um token por execução. Connector configurado na conta costuma ter credencial fixa, e o token
  aqui muda a cada `run`. É problema do `cloud-routines-runner` (passar o token no disparo, ou OAuth). O
  `/develop` registra a pendência em `docs/PRE-PRODUCTION.md` com esse dono.
- **Rate limit:** sem provedor configurado, `checkRateLimit` degrada (`rateLimitDegraded.test.ts`); o balde
  por `run` só tem efeito onde o rate limit está ligado.

### Decisões tomadas sem perguntar

| # | Decisão | Alternativa descartada e por quê |
|---|---------|----------------------------------|
| D1 | MCP escrito à mão: JSON-RPC sem sessão, `initialize`/`ping`/`tools/list`/`tools/call` (~150 linhas) | `@modelcontextprotocol/sdk` como dependência da `apps/api`: está no lockfile só por baixo do `firebase-tools`, então importar exigiria declarar dependência nova (política 2). O transporte do SDK também espera Node `req/res` ou um adaptador para `Request` do Next. Reavaliar se o MCP precisar de recursos, prompts ou stream |
| D2 | `issueRunToken` é uma função que o executor real chama na hora de entregar o trabalho; o orquestrador não muda | Envolver `executor.dispatch` (o que o plano do `orchestrator` sugeria): o `local-runner` entrega o trabalho quando o runner pega o `run` por polling, não no despacho, e o executor falso não usa token. Emitir no despacho criaria token que ninguém recebe |
| D3 | Rotas do agente sem `requireBoardApi`; papel checado no disparo | Rechecar o papel de quem disparou a cada chamada: uma chamada ao GitHub por ferramenta (o cache de membro é de 5 min) e uma falha do GitHub derrubaria a etapa no meio |
| D4 | Token expira no `deadlineAt` do `run` | Folga depois do prazo: o `tick` já marca o `run` como `failed` no prazo, então um `complete_stage` atrasado seria ignorado de qualquer forma |
| D5 | Uma rota dinâmica `POST /agent/tools/[tool]` | Seis arquivos de rota iguais: o mapa do contrato já é a tabela de despacho |
| D6 | `create_card`: rota valida e confere o board, responde 501 `AGENT_TOOL_NOT_AVAILABLE`; fora do `tools/list` do MCP | Implementar: cards nascem da sincronização de specs do repositório (`card.repository.ts:56`), e um card sem arquivo de spec vira órfão na sincronização seguinte. O desenho certo é da spec `spec-authoring` |
| D7 | Tipos de resposta em `@repo/kanban-contract` | Tipos em `apps/api`: o `local-runner` vai importar as mesmas respostas, e a regra 12 põe o domínio dos agentes no contrato |
| D8 | Hash SHA-256 do segredo, sem cifra | Cifra com chave em env: o token nunca é lido de volta, e uma env nova seria infra sem ganho |
| D9 | Balde de rate limit por `run` no `proxy` | Deixar no ator `anonymous`: na nuvem todos os agentes que saem dos endereços da Anthropic dividiriam 60 POST por minuto |

## Etapa 2: blueprint técnico

### 10.1 Contrato (`packages/kanban-contract`)

`src/agentResults.ts` (novo):

```ts
import type { ResolvedAnswer, CardPendingAsk } from "./cardEvent";
import type { CardLane } from "./boardLanes";
import type { CardState } from "./cardState";

export type AgentAnsweredQuestion = {
    questionEventId: string;
    stageKey: string | null;
    answeredAt: string;
    answers: ResolvedAnswer[];
};

export type AgentArtifactRef = { stageKey: string | null; path: string; commitSha: string; createdAt: string };

export type AgentCardView = {
    card: { id: string; boardId: string; slug: string; title: string; lane: CardLane; stageKey: string | null;
            state: CardState; reworkLoops: number; branch: string | null };
    run: { id: string; stageKey: string; command: string; model: string; effort: string; maxTurns: number;
           branch: string; deadlineAt: string };
    repository: { owner: string; name: string; baseBranch: string };
    spec: { path: string; ref: string; sha: string | null; content: string | null };
    pendingAsk: CardPendingAsk | null;
    answers: AgentAnsweredQuestion[];
    artifacts: AgentArtifactRef[];
};

export type AgentEventResult = { eventId: string };
export type AgentCompleteResult = { ignored: boolean };
```

`src/agentContract.ts`, no fim:

```ts
/** `create_card` stays out until cards can be born outside the spec sync. */
export const AGENT_MCP_TOOLS = ["get_card", "post_update", "ask", "attach_artifact", "complete_stage"] as const
    satisfies readonly AgentContractTool[];
```

`src/index.ts`: `export * from "./agentResults";`.

### 10.2 `packages/shared`

```diff
     CREATED: 201,
+    ACCEPTED: 202,
 …
     INTERNAL_SERVER_ERROR: 500,
+    NOT_IMPLEMENTED: 501,
     BAD_GATEWAY: 502,
```

### 10.3 API: arquivos

```
apps/api/
  (shared)/lib/agent-contract/
    run-token-format.ts     parseRunToken, RUN_TOKEN_PREFIX (sem node:crypto; usado pelo proxy)
    run-token.ts            mintRunToken, hashRunSecret, matchesRunToken, isRunTokenExpired, issueRunToken
    agent-scope.ts          checkToolScope (puro)
    agent-card-view.ts      buildAgentCardView
    agent-tools.ts          callAgentTool
    mcp.ts                  handleMcpMessage, MCP_PROTOCOL_VERSIONS, mcpToolList
  (shared)/lib/rate-limit-subject.ts      + ator por run
  (shared)/mappers/card-event.mapper.ts   + runId em CardEventWrite
  (shared)/mappers/run.mapper.ts          + tokenHash, tokenExpiresAt (arquivo do orchestrator)
  (shared)/repositories/run.repository.ts + setToken (arquivo do orchestrator)
  app/(guards)/agent.ts                   requireAgentApi
  app/(routes)/agent/tools/[tool]/route.ts
  app/(routes)/mcp/route.ts
  scripts/agent-token.mjs
  package.json                            + "agent-token"
```

### 10.4 Esqueletos

```ts
// (shared)/lib/agent-contract/run-token-format.ts
export const RUN_TOKEN_PREFIX = "kbr_";
const RUN_TOKEN = /^kbr_([A-Za-z0-9]{1,128})_([A-Za-z0-9_-]{43})$/;
export function parseRunToken(token: string): { runId: string; secret: string } | null;
export function readBearer(header: string | null): string | null;
```

```ts
// (shared)/lib/agent-contract/run-token.ts
const SECRET_BYTES = 32;
export function mintRunToken(runId: string): { token: string; tokenHash: string };
export function hashRunSecret(secret: string): string; // sha256 hex
export function matchesRunToken(secret: string, tokenHash: string | null): boolean; // timingSafeEqual
export function isRunTokenExpired(expiresAt: string | null, now: Date): boolean; // null conta como expirado
export async function issueRunToken(runId: string, now?: Date):
    Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; code: "AGENT_RUN_CLOSED" }>;
```

```ts
// app/(guards)/agent.ts
export type AgentContext = { run: RunRecord; board: BoardDTO; card: CardRecord; now: Date };
export function requireAgentApi<TParams>(
    handler: (req: NextRequest, ctx: AgentContext & { params: TParams }) => Promise<Response>
): (req: NextRequest, route: { params: Promise<TParams> }) => Promise<Response>;
```

```ts
// (shared)/lib/agent-contract/agent-scope.ts
export type ScopeRefusal = "AGENT_CARD_MISMATCH" | "AGENT_STAGE_MISMATCH";
export function checkToolScope(
    tool: AgentContractTool,
    input: { cardId?: string; stage?: string; boardId?: string },
    run: Pick<RunRecord, "boardId" | "cardId" | "stageKey">
): ScopeRefusal | null;
```

```ts
// (shared)/lib/agent-contract/agent-tools.ts
export type AgentToolOutcome = { ok: true; data: unknown } | { ok: false; code: string; status: number };
export async function callAgentTool(tool: string, rawInput: unknown, ctx: AgentContext): Promise<AgentToolOutcome>;
```

```ts
// app/(routes)/agent/tools/[tool]/route.ts
type ToolRouteParams = { tool: string };

export const POST = requireAgentApi<ToolRouteParams>(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const outcome = await callAgentTool(ctx.params.tool, body.value, ctx);
    logEvent("agent", "tool", { runId: ctx.run.id, tool: ctx.params.tool, code: outcome.ok ? null : outcome.code });
    return outcome.ok
        ? Response.json({ data: outcome.data })
        : Response.json({ error: { code: outcome.code } }, { status: outcome.status });
});
```

```ts
// (shared)/lib/agent-contract/mcp.ts
export type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown;
                                error?: { code: number; message: string } };
export async function handleMcpMessage(message: unknown, ctx: AgentContext): Promise<JsonRpcResponse | null>; // null = notificação
export function mcpToolList(): { name: string; description: string; inputSchema: unknown }[];

// app/(routes)/mcp/route.ts
export const POST = requireAgentApi(async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return Response.json(jsonRpcError(null, PARSE_ERROR), { status: HTTP_STATUS.BAD_REQUEST });
    const reply = await handleMcpMessage(body.value, ctx);
    return reply === null ? new Response(null, { status: ACCEPTED }) : Response.json(reply);
});
export function GET() { return new Response(null, { status: HTTP_STATUS.METHOD_NOT_ALLOWED, headers: { Allow: "POST" } }); }
export const DELETE = GET;
```

`ACCEPTED` (202) e `NOT_IMPLEMENTED` (501) entram em `HTTP_STATUS` (10.2).

```diff
 // (shared)/lib/rate-limit-subject.ts
 export async function rateLimitSubject(request: Request): Promise<string> {
-    const subject = readJwtSubject(readBearerToken(request));
+    const bearer = readBearerToken(request);
+    const runToken = parseRunToken(bearer);
+    const subject = runToken ? `run:${runToken.runId}` : readJwtSubject(bearer);
```

```diff
 // (shared)/mappers/card-event.mapper.ts
             | "artifact"
             | "outcome"
+            | "runId"
 …
-        runId: null,
+        runId: write.runId ?? null,
```

```ts
// (shared)/repositories/run.repository.ts (acréscimo ao arquivo do orchestrator)
setToken(runId: string, tokenHash: string, now: Date):
    Promise<{ ok: true; expiresAt: string } | { ok: false }>; // transação: active, running, deadlineAt
```

### 10.5 Exemplos

```http
POST /agent/tools/ask
Authorization: Bearer kbr_r9Xa…_***
{ "cardId": "b1__agent-contract", "stage": "analyze",
  "questions": [{ "question": "Token no header ou OAuth?", "header": "Auth MCP",
                  "options": [{ "label": "Header" }, { "label": "OAuth" }], "recommended": 0 }] }

200 { "data": { "eventId": "e42" } }
403 { "error": { "code": "AGENT_CARD_MISMATCH" } }
```

```http
POST /mcp
Authorization: Bearer kbr_r9Xa…_***
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "complete_stage", "arguments": { "cardId": "b1__agent-contract", "stage": "analyze",
              "outcome": "success", "summary": "### Análise — plano pronto\n…" } } }

200 { "jsonrpc": "2.0", "id": 3, "result": { "content": [{ "type": "text", "text": "{\"ignored\":false}" }] } }
```

### 10.6 i18n (`translations/packages/shared/utils.ts`, em `apiErrors`)

```ts
AGENT_TOKEN_INVALID: "Token de execução inválido.",
AGENT_TOKEN_EXPIRED: "O token desta execução expirou.",
AGENT_TOOL_NOT_FOUND: "Ferramenta desconhecida.",
AGENT_CARD_MISMATCH: "Este token não vale para este card.",
AGENT_STAGE_MISMATCH: "Este token não vale para esta etapa.",
AGENT_RUN_CLOSED: "Esta execução já terminou.",
AGENT_TOOL_NOT_AVAILABLE: "Esta ferramenta ainda não está disponível.",
```

### 10.7 Documentação

- `docs/board/CONTRACT.md`: formato do token, os dois endpoints, a configuração MCP de 4.7, as respostas de cada
  ferramenta, a tabela de erros, a revogação pelo fechamento do `run` e `create_card` indisponível.
- `docs/board/ARCHITECTURE.md`: `runs` ganha `tokenHash`/`tokenExpiresAt`; `cardEvent.runId` deixa de ficar
  vazio.
- `docs/SETUP.md`: como emitir um token no emulador com `agent-token`.
- `docs/PRE-PRODUCTION.md`: a pendência do connector da nuvem (seção "Infra").

### 10.8 Ordem de implementação e commits

1. `feat(kanban-contract): agent tool result types and MCP tool list`
2. `feat(shared): add 202 and 501 to HTTP_STATUS`
3. `feat(api): per-run agent token` (`run-token-format.ts`, `run-token.ts`, `setToken`, campos no mapper do
   `run`, testes de token e de mapper)
4. `feat(api): agent tool routes over HTTP` (guard, escopo, `agent-card-view.ts`, `agent-tools.ts`, `runId` no
   evento, rota, testes de escopo e de rota)
5. `feat(api): kanban MCP server` (`mcp.ts`, rota, testes)
6. `feat(api): rate limit agents per run` (`rate-limit-subject.ts` e teste)
7. `chore(api): agent token script for the emulator` (script, `package.json`, teste de paridade, teste de
   emulador)
8. `feat(internationalization): agent contract error copy`
9. `docs(board): agent contract endpoints and token`
10. `docs(features): agent-contract` (por último)

Env nova: nenhuma.

## Perguntas em aberto

1. **`create_card` responde 501 neste corte?** Cards nascem da sincronização das specs do repositório; criar
   card pela ferramenta sem arquivo de spec gera órfão. Recomendação: 501 `AGENT_TOOL_NOT_AVAILABLE` agora, e a
   `spec-authoring` decide se a ferramenta grava a spec no repositório.
2. **Recheque de papel por chamada do agente (regra 13)?** Recomendação: não no MVP. O papel é checado no
   disparo e a parada revoga o token. Rechecar custa uma chamada ao GitHub por ferramenta.
3. **MCP escrito à mão ou `@modelcontextprotocol/sdk`?** Recomendação: à mão (sem dependência nova); adotar o
   SDK quando o servidor precisar de stream, recursos ou prompts.
4. **Autenticação do connector na nuvem.** O token por `run` funciona para o runner local (header com env por
   execução), mas um connector configurado uma vez na conta não troca de token a cada `run`. Recomendação: header
   no MVP, como a spec propõe, e a decisão entre token no disparo e OAuth fica com o `cloud-routines-runner`.
