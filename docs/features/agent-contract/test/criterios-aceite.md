# Critérios de Aceite (Checklist)

Contrato dos agentes: `POST /agent/tools/[tool]` e `POST /mcp`, autenticados pelo token de execução
`kbr_<runId>_<segredo>`. Não há tela nova; o app só mostra o efeito das chamadas na linha do tempo e no selo
do card. Os critérios 13 e 14 vêm do `orchestrator` e foram remedidos nesta passada.

- [x] **Sem token, com formato errado ou de `run` inexistente: 401 `AGENT_TOKEN_INVALID`**
  Uma chamada sem `Authorization` recebe 401 com `WWW-Authenticate: Bearer` e o corpo
  `{"error":{"code":"AGENT_TOKEN_INVALID"}}`, sem leitura do banco. Formato errado (`kbr_abc`), `runId` que não
  existe e segredo com um caractere trocado dão a mesma resposta, para quem testa não distinguir "run existe"
  de "segredo errado". O mesmo vale para `POST /mcp`.

- [x] **Token expirado: 401 `AGENT_TOKEN_EXPIRED`**
  Um token emitido com `--expired` (validade no passado) recebe 401 `AGENT_TOKEN_EXPIRED`. A validade do token é o
  `deadlineAt` do `run`. Emitir um token novo para o mesmo `run` sobrescreve o hash, e o token anterior passa a
  receber 401 `AGENT_TOKEN_INVALID`.

- [x] **Escopo por card e por etapa**
  O token só lê e escreve no card do seu `run`. `get_card` ou `post_update` com o `cardId` de outro card do mesmo
  board recebem 403 `AGENT_CARD_MISMATCH`, sem evento gravado. `post_update` com `"stage":"develop"` num `run` de
  `analyze` recebe 403 `AGENT_STAGE_MISMATCH`. `create_card` para outro board recebe 403 `AGENT_CARD_MISMATCH`.

- [x] **Payload fora do contrato: 400 `VALIDATION_FAILED`, pelas duas portas**
  `ask` com cinco perguntas (o máximo é quatro) recebe 400 `VALIDATION_FAILED` pelo HTTP. Pelo MCP, o mesmo pedido
  devolve `isError: true` com o mesmo código no texto do resultado. Nenhum evento é gravado.

- [x] **Ferramenta desconhecida e `create_card`**
  Ferramenta fora do contrato (`/agent/tools/do_magic`) recebe 404 `AGENT_TOOL_NOT_FOUND`. `create_card` para o
  próprio board recebe 501 `AGENT_TOOL_NOT_AVAILABLE` e não aparece no `tools/list` do MCP.

- [x] **`get_card` devolve só o card do token**
  A resposta traz o card (slug, branch, `stageKey`, `state`), o `run` (comando, modelo, prazo), o repositório, a
  spec com `content` lido do GitHub falso, `pendingAsk`, as respostas sem autor e os artefatos. Nenhum campo
  `tokenHash`, `tokenExpiresAt` ou o próprio token aparece na resposta.

- [x] **`post_update`, `ask` e `attach_artifact` aparecem na linha do tempo com o `runId`**
  Cada chamada grava um evento com o `runId` do token e autor `agent`. No detalhe do card, as atualizações
  aparecem como "Atualização", a pergunta como "Perguntas" com "Aguardando resposta", e o artefato com o caminho
  e os sete primeiros caracteres do commit. Caminho com `..` recebe 422 `CARD_ARTIFACT_PATH_INVALID`.

- [x] **`ask` deixa o card em "Aguardando você"**
  Depois do `ask` com uma pergunta, o estado do card no detalhe passa a "Aguardando você", com o formulário "A
  etapa Análise parou com 1 pergunta" e a opção recomendada marcada. Responder no app fecha o `pendingAsk`, e o
  `get_card` seguinte traz a resposta pareada com a pergunta, sem o autor.

- [x] **`complete_stage` move o card só pelo `completeRun` e é idempotente**
  `complete_stage` com `success` responde `{"ignored":false}`, grava um relatório e move o card pela regra do
  `resolveTransition`. Repetido, responde `{"ignored":true}` e não grava um segundo relatório. O `run` fica
  `active: false`, `outcome: success`, `endReason: agent`.

- [x] **Depois do fim do `run`, 409 `AGENT_RUN_CLOSED`**
  `post_update`, `ask` e `get_card` com o token de um `run` encerrado recebem 409 `AGENT_RUN_CLOSED`, pelo HTTP e
  pelo MCP. Uma pergunta tardia não abre `pendingAsk` no `run` seguinte do card.

- [x] **MCP nas duas eras do protocolo**
  Legado: `initialize` com `2025-06-18` ecoa a versão; versão desconhecida recebe `2025-11-25`; notificação
  responde 202 sem corpo; `tools/list` traz as cinco ferramentas. Moderno (`2026-07-28`): `_meta` com versão e
  `clientCapabilities` e os headers `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name`; sem `Mcp-Method`, 400
  `-32020`; versão desconhecida, 400 `-32022`; sem `clientCapabilities`, 400 `-32602`. Lote e `id` de tipo
  inválido recebem 400 `-32600`; JSON inválido, 400 `-32700`; `GET /mcp`, 405 com `Allow: POST`.

- [x] **Proxy real na frente das rotas novas**
  `POST /mcp` e `POST /agent/tools/*` com `Origin` fora da lista recebem 403 `AUTH_FORBIDDEN_ORIGIN`, mesmo com um
  token válido. Sem `Origin` (chamada de servidor), o pedido passa do proxy e chega à rota. O rate limit conta um
  balde por `run`, que só vale onde `ARCJET_KEY` está configurada.

- [x] **O banco guarda só o hash; nada vaza em log**
  O documento `run` guarda `tokenHash` com 64 caracteres hex e `tokenExpiresAt` igual ao `deadlineAt`; o documento
  serializado não contém `kbr_`. O log da API registra `runId`, ferramenta e código, nunca o token.

- [ ] **Foco ao fechar os diálogos de etapa (herdado do `orchestrator`)**
  Ao fechar `TriggerStageDialog` ou `StopRunDialog` por Cancelar, Escape ou confirmando, o foco volta ao elemento
  que abriu o diálogo, ao menu do card, ao primeiro botão do `run` ou ao título, e nunca ao `body`. Falha quando o
  diálogo foi aberto pelo menu "⋯" e fechado por Cancelar ou Escape: o foco cai no `body`.

- [x] **Copy e layout herdados do `orchestrator` em claro, escuro e 390 px**
  "Disparar a etapa {column}?", "A etapa {stage} parou com…", "Responder e retomar a etapa {column}", aviso de WIP
  "(1)" sem "1 cards", descrição sem "Você soltou", "Aprovar e seguir" sem "de novo", Concluído sem o selo
  "Parado" e o placeholder "Sem limite" inteiro a 1440 px. O diálogo e o detalhe cabem em 390 px nos dois temas.
