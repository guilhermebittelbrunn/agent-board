# Relatório de QA: contrato dos agentes (HTTP + servidor MCP)

Passada do `/test` dentro do `/cycle` noturno, sem perguntas. O working tree traz as tarefas 1 a 9 sem commit, na
branch `guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). O contrato foi provado por `curl` e por um
cliente MCP real contra a API de pé, com o `proxy` na frente; o app serviu para criar o `run`, responder a
pergunta e conferir a linha do tempo.

Resultado: os 13 critérios do contrato passam. O herdado do `orchestrator` (foco ao fechar os diálogos) continua
falhando em dois dos nove casos, por isso o `test` fica `blocked`.

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (raiz, com `test:emulator`, JDK 21, cache do turbo) | 13 de 13 tasks, 11 do cache. `api` 102 arquivos e 1229 testes; `test:emulator` 6 arquivos e 152 testes; `app` 114 arquivos e 871 testes; `kanban-contract` 119; `internationalization` 35 |
| `pnpm turbo run test --filter api` (depois do teste novo) | `api` 102 arquivos, 1232 testes |
| `vitest run __tests__/corsOrigin.test.ts` | 54 de 54 (3 novos) |
| `pnpm --filter api typecheck` | sem erro |
| `pnpm check` | 910 arquivos, sem erro |
| `apiErrors` | `apiErrorCodesTranslated.test.ts` passa dentro da suíte da `api`; nenhum código novo nesta passada |
| `pnpm e2e` (Playwright, completo, uma vez) | 31 de 31 em 1,6 min |
| `next build` da `apps/api` | passa; `/mcp` e `/agent/tools/[tool]` aparecem como rotas dinâmicas (`ƒ`) |

O `next build` com as variáveis do `.env.example` para no "Collecting page data" de `/github/webhook`, porque em
produção o `env.ts` exige a conta de serviço do Firebase Admin. Com valores descartáveis
(`FIREBASE_ADMIN_PROJECT_ID=demo-next-boilerplate`, e-mail de conta de serviço fictício, chave `descartavel`) o
build termina. A etapa de TypeScript do Next passou nas duas tentativas. Não é defeito: é o mesmo requisito de
qualquer build de produção da API.

### Teste criado

`apps/api/__tests__/corsOrigin.test.ts`, `describe("agent endpoints behind the proxy")`, três casos na faixa
barata (o `proxy` real com `checkRateLimit` mockado):

- `Origin` estranho em `/mcp` com token `kbr_` recebe 403 `AUTH_FORBIDDEN_ORIGIN` antes de qualquer chamada de rate
  limit;
- sem `Origin`, `/mcp` e `/agent/tools/get_card` passam do proxy (`x-middleware-next: 1`) com o orçamento
  `standard`;
- o balde é o mesmo para dois segredos do mesmo `run`, outro para outro `run` e outro para o anônimo.

Fecha a lacuna "`proxy` inteiro com bearer `kbr_`" que o handoff e a revisão deixaram.

## `card-event.repository.ts` depois da reescrita da revisão

O arquivo é novo nesta rodada (não rastreado), então não há `git diff`; li o arquivo inteiro. Não há resto de
corrupção: imports usados, um tipo por resultado (`AnswerQuestionsResult`, `AppendAgentEventResult`), nenhum
método duplicado ou truncado, e a transação do `appendAgentEvent` lê o card antes de escrever, como o Firestore
exige. Quem cobre o repositório real: `agentContract.emulator.test.ts` (4 de 4, incluindo o `ask` de um `run` que o
card já não roda) e `orchestratorRuns.emulator.test.ts` (6 de 6), dentro dos 152 do emulador. Os testes de rota
(`agentToolsRoutes`, `cardEventsRoutes`, `mcpRoute`) usam o repositório falso. Na passada pelo browser, o
repositório real gravou `post_update`, `ask`, `attach_artifact` e o relatório, abriu e fechou o `pendingAsk` e
gravou a resposta.

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito | O que foi medido |
|---|------|----------|------------------|
| 1 | Proxy real | ✅ confirmado | `POST /mcp` com `Origin: https://evil.example` e token válido: 403 `AUTH_FORBIDDEN_ORIGIN`; o mesmo em `/agent/tools/get_card`. Sem `Origin`, com token válido e corpo `{}`: 400 `{"jsonrpc":"2.0","id":null,"error":{"code":-32600,…}}`. Sem token: 401 com `www-authenticate: Bearer` e `AGENT_TOKEN_INVALID`. `Origin` da lista sem token: 401 |
| 2 | Percurso 1 a 13 | ✅ confirmado | Detalhe na tabela abaixo |
| 3 | Escopo | ✅ confirmado | `get_card` e `post_update` com o card `keyboard-shortcuts` usando o token de `search-cards`: 403 `AGENT_CARD_MISMATCH`; `"stage":"develop"` num `run` de `analyze`: 403 `AGENT_STAGE_MISMATCH` |
| 4 | Token adulterado e expirado | ✅ confirmado | Último caractere do segredo trocado: 401 `AGENT_TOKEN_INVALID`; `runId` inexistente e `kbr_abc`: o mesmo 401; `--expired`: 401 `AGENT_TOKEN_EXPIRED` |
| 5 | MCP nas duas eras | ✅ confirmado | Legado: `initialize` `2025-06-18` ecoa a versão, `2099-01-01` recebe `2025-11-25`, `notifications/initialized` 202. Moderno: `tools/list` com `_meta` e headers devolve as cinco ferramentas; sem `Mcp-Method` 400 `-32020`; versão `2099-01-01` 400 `-32022` com a lista suportada; sem `clientCapabilities` 400 `-32602`; `server/discover` com `resultType: "complete"`. `tools/call` de `post_update` nas duas eras grava o evento. Método desconhecido: `-32601` (200 no legado, 404 no moderno). Lote e `id` objeto: 400 `-32600`; JSON inválido 400 `-32700`. `GET /mcp`: 405 com `allow: POST` |
| 6 | Cliente MCP real | ✅ parcial, 🔒 Claude Code | Com o `@modelcontextprotocol/sdk` 1.30.0 (o cliente oficial, já no lockfile por baixo do `firebase-tools`), `Client` + `StreamableHTTPClientTransport` contra a API: negociou `2025-11-25` (era legada), listou as cinco ferramentas e chamou `get_card` e `post_update` sem erro. O cliente abre um `GET /mcp` para o stream SSE, recebe 405 e segue. O `claude` 2.1.321 em si ficou 🔒: o `claude mcp list` não conecta a servidor de `.mcp.json` sem aprovação gravada na configuração do usuário, e o `claude -p --mcp-config` roda o modelo (chamada paga) |
| 7 | `next build` | ✅ confirmado | Ver "Cobertura" |
| 8 | Herdados do `orchestrator` | ❌ foco, ✅ copy e layout | Ver "Defeitos" e "Remedição do `orchestrator`" |

### Percurso 1 a 13 do plano

Card `agent-board-demo--sample-app__search-cards`, roteiro `silent` no executor falso, disparado pelo menu "⋯" →
"Mover para Análise". Token citado como `kbr_0QnCMF0GPp7cyjf4jIXI_***`.

| # | Chamada | Medido |
|---|---------|--------|
| 1 | `get_card` sem header | 401 `AGENT_TOKEN_INVALID`, `www-authenticate: Bearer` |
| 2 | `get_card` com o token | 200; `run.stageKey: "analyze"`, branch `feat/search-cards`, `spec.content` com o markdown do GitHub falso; zero ocorrências de `tokenHash`, `tokenExpires` ou `kbr_` |
| 3 | `post_update` | 200 com `eventId`; "QA: lendo o repositório (via HTTP)" aparece como "Atualização" de `planejador-tarefa` no detalhe |
| 4 | `post_update` em outro card | 403 `AGENT_CARD_MISMATCH` |
| 5 | `ask` com 5 perguntas | 400 `VALIDATION_FAILED`, sem evento |
| 6 | `ask` com 1 pergunta | 200; estado "Aguardando você", bloco "A etapa Análise parou com 1 pergunta" com "Sim" recomendado e marcado |
| 7 | `attach_artifact` `../x` e `docs/x.md` | 422 `CARD_ARTIFACT_PATH_INVALID`; 200, artefato `docs/x.md aaaaaaa` na linha do tempo |
| 8 | MCP `initialize`, `tools/list`, `tools/call` | Envelope JSON-RPC; cinco ferramentas; três atualizações gravadas (moderno, legado e SDK) |
| 9 | Responder no app, depois `complete_stage` `success` | Resposta 200, card volta a "Rodando"; `get_card` traz a resposta sem autor; `complete_stage` devolve `{"ignored":false}`; o card sai de Análise para Executando e o executor falso dispara `/develop` |
| 10 | `complete_stage` de novo | `{"ignored":true}`; um único evento `report` no Firestore e um único "Concluída" na tela |
| 11 | `post_update` depois do fim | 409 `AGENT_RUN_CLOSED`; também `ask`, `get_card` e `tools/call` pelo MCP |
| 12 | `--expired` num `run` novo | Token do `run` de `develop`: 401 `AGENT_TOKEN_EXPIRED` |
| 13 | `GET /mcp` | 405, `allow: POST` |

No Firestore, depois do percurso: os oito eventos do agente têm o `runId` do `run` de análise; a resposta tem
`runId: null` e autor pessoa. O `run` de análise ficou `active=false`, `status=finished`, `outcome=success`,
`endReason=agent`, `tokenHash` com 64 hex, `tokenExpiresAt` igual ao `deadlineAt` e sem `kbr_` no documento. O log
da API não tem nenhuma ocorrência de `kbr_`; as linhas `[agent] tool runId=… tool=… code=…` trazem só `runId`,
ferramenta e código.

## Defeitos

### 1. 🟡 Foco cai no `body` ao fechar o diálogo aberto pelo menu "⋯" (herdado, continua aberto)

Repro: no quadro, "Ações de <card>" → "Mover para Análise" e feche o diálogo com "Cancelar e voltar o card" ou
`Escape`. `document.activeElement` fica `BODY`. Acontece com clique e só com teclado (Enter no botão de ações,
setas, Enter, Escape).

Causa medida: `restoreRunDialogFocus` recebe como `opener` o item de menu do antd. O antd não desmonta o dropdown ao
fechar: o `<li>` "Mover para Análise" continua no DOM (`isConnected: true`) dentro de
`.ant-dropdown.ant-dropdown-hidden`, invisível. A função chama `opener.focus()` num elemento oculto, o navegador
ignora, e o fallback (menu do card, botões do `run`, título) nunca roda. Correção sugerida para o `/develop`: só usar
o `opener` se ele puder receber foco (por exemplo, `opener.checkVisibility()`, ou conferir
`document.activeElement === opener` depois do `focus()` e cair no fallback se não).

Os outros sete casos passam: menu e confirmar vão para "Parar: <card>"; arrasto e Cancelar/Escape, para o link do
card; arrasto e confirmar, para "Parar"; "Rodar de novo" e Cancelar/Escape, de volta a "Rodar de novo: <card>";
"Rodar de novo" e confirmar, para "Parar"; "Parar" e Continuar rodando/Escape, de volta a "Parar: <card>"; "Parar"
e confirmar, para "Ações de <card>". "Aprovar e seguir" com Escape também devolve o foco ao botão.

### Observação (sem defeito de comportamento)

- O `sr-only` do título de coluna usa "{count} cards" e o leitor de tela lê "Executando 1 cards". Não é a copy do
  aviso de WIP que a revisão do `orchestrator` corrigiu; fica como ajuste de i18n para quem mexer no quadro.

## Remedição do `orchestrator` (item 8)

Registrada também em `docs/features/orchestrator/test/report.md`, seção "Remedição na passada da agent-contract".
Copy, medida no app: "Disparar a etapa Análise?"; "A etapa Análise parou com 1 pergunta"; "Responder e retomar a
etapa Análise"; aviso de WIP "A coluna Executando já tem o máximo de cards rodando (1)."; descrição do disparo sem
"Você soltou"; "Aprovar e seguir para Executando?" com corpo sem "de novo"; card movido para Concluído depois de
parado aparece sem o selo "Parado"; placeholder "Sem limite" com 68,3 px de texto em 134 px de espaço útil a 1440
px. Em 390 px no claro, o diálogo vai de 16 a 374 px, `scrollWidth` 390, fundo `lab(100)` e texto `lab(2.75)`; o
detalhe do card também tem `scrollWidth` 390. O foco continua com o defeito 1.

## Decisões de custo de teste

| Módulo | Decisão |
|--------|---------|
| `proxy.ts` com `/mcp` e `/agent/*` | Teste novo na faixa barata (`corsOrigin.test.ts`): o `proxy` é função pura sobre o `NextRequest`, e o mock do rate limit basta para provar `Origin`, passagem e balde |
| `agent-tools`, `agent-guard`, `agent-scope`, `mcp.ts`, rotas | Nada novo: `agentToolsRoutes`, `agentMcp`, `mcpRoute`, `agentRunToken` e `agentToolScope` já cobrem cada código de erro e cada era do MCP |
| `run.repository` (`setToken`, `findWithToken`), `card-event.repository` | Nada novo: `agentContract.emulator.test.ts` já é o teste da faixa cara que prova a transação e a serialização de `Timestamp` contra o Firestore real |
| Script `agent-token.mjs` | Coberto por `agentTokenScript.test.ts` (trava e paridade) e usado de fato nesta passada |

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| `proxy` inteiro com bearer `kbr_` | Fechada: teste novo e medição com `curl` |
| `complete_stage` concorrente no mesmo `run` | Continua aberta (risco aceito no plano; a transição é única porque `completeRun` é idempotente) |
| `setToken` concorrente com `finishOnCard` | Continua aberta |
| `parseRunToken` com segredo com `_` e `runId` acima de 128 | Fechada na revisão; não remedida |
| `ask` sobre `run` que o card já não roda | Fechada na revisão (rota e emulador); por `curl`, o token velho depois do novo `run` recebe 409 `AGENT_RUN_CLOSED` |
| Rate limit por `run` com `ARCJET_KEY` | Fora de escopo local: sem chave o rate limit degrada; a escolha do balde está no teste novo |
| Handshake com o Claude Code | 🔒 (item 6) |
| Teto por endereço para `/mcp` e `/agent/*` (achado 🟡 da revisão) | Fora de escopo, fica com a `cloud-routines-runner` |

## Cross-check

- Papéis: o contrato não usa papel de board (decisão D3 do plano); o disparo foi feito como dono do board. Sem
  personificação: o guard do agente não lê sessão.
- Claro e escuro: linha do tempo com eventos do agente no escuro a 1280 px e no claro a 390 px; diálogo de
  aprovação no escuro a 1440 px e no claro a 390 px.
- Mobile e desktop: ver "Remedição do `orchestrator`".

## Ambiente do e2e

- No início, as portas padrão (3000, 3002, 4001, 4400, 4500, 8080, 9099, 9199) e as alternativas estavam livres;
  o `quahog` não estava de pé.
- `pnpm test` e `pnpm e2e` subiram e derrubaram os próprios emuladores e servidores nas portas padrão.
- Para a passada manual, subi o emulador com uma config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI), JDK 21, e rodei o seed contra ele. `api` em 3012 e
  `app` em 3010 com o ambiente do `.env.example` trocando portas e hosts. Um proxy de log em 3013 registrou os
  pedidos do cliente MCP com o token redigido.
- No fim, fechei a sessão do `agent-browser`, matei `api`, `app` e o proxy por PID (com os filhos) e mandei SIGINT
  ao `firebase-tools`. As portas 3010, 3012, 3013, 8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias.
  Apaguei `apps/api/AGENTS.md`, `apps/app/AGENTS.md`, os dois `firestore-debug.log`, `apps/e2e/playwright-report`,
  `apps/e2e/test-results` e os arquivos temporários com tokens.

## Evidências

Prints em `docs/features/agent-contract/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-linha-do-tempo-agente-escuro.png`, `02-aprovar-wip-escuro-1440.png`, `03-aprovar-claro-390.png`,
`04-linha-do-tempo-claro-390.png`.

Artefatos da ferramenta, não do produto: o `click` e o `find … click` do `agent-browser` falham em silêncio quando
o alvo está abaixo da dobra (botões do popup do emulador de auth, "Criar board", "Responder e retomar", "Salvar
limites"); com `scrollIntoView` antes, funcionam. O `drag` do `agent-browser` não abre o diálogo; o arrasto foi
feito com `DragEvent`s em sequência, com o link do card focado, como num arrasto com o mouse.

## Dados de QA

Tudo no emulador local, já descartado: a conta GitHub `qa-owner` (e-mail `qa-agent-contract-owner@example.com`),
criada pelo popup do emulador; o board `agent-board-demo--sample-app`, os três cards, os `run`s, os eventos do
percurso e os limites (WIP 1 em Executando, aprovação depois de Análise). Nenhuma conta em projeto Firebase real.
Nenhum token foi gravado em arquivo versionado.

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das nove tarefas existe; o gate do `/review` segue aberto à
espera do plano de commits. O `test` fica `blocked` pelo defeito 1, herdado do `orchestrator`, que volta ao
`/develop`. O contrato dos agentes em si não tem defeito aberto.

## Desbloqueio depois da passada do local-runner

O `test` desta tarefa ficou `blocked` só pelo defeito 1, herdado do `orchestrator`. Em 2026-11-26, no `/test` do
`local-runner`, o foco voltou ao botão "Ações de <card>" ao fechar por "Cancelar e voltar o card" e por Escape o
diálogo aberto pelo menu "⋯", com mouse e só com teclado. O registro está em
`docs/features/orchestrator/test/report.md` ("Remedição na passada do local-runner"). O contrato dos agentes não tem
defeito próprio aberto, então o `test` passou a `done`.
