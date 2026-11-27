# Contrato dos agentes

As sessões do Claude Code falam com o board por um servidor MCP chamado `kanban` (as ferramentas aparecem como `mcp__kanban__<nome>`) ou pelos mesmos endpoints em HTTP, usados pelo runner local. Os schemas de entrada estão em `packages/kanban-contract/src/agentContract.ts`; nada aqui é redefinido em outro lugar.

## Autenticação

Cada execução recebe um token de execução que vale só para aquele `run` (card + etapa) e vai no header
`Authorization: Bearer <token>`. O formato é `kbr_<runId>_<segredo>`, com 32 bytes aleatórios em base64url no segredo.
O board guarda só o SHA-256 do segredo no documento do `run` e compara em tempo constante. O token expira no prazo do
`run` (`deadlineAt`), e uma emissão nova invalida a anterior.

O runner local recebe o token quando pega o `run` (`POST /runner/claim`, abaixo): o board emite o token na mesma
transação que marca o `run` como dele, e o runner o passa à sessão em `KANBAN_RUN_TOKEN`. O disparo da nuvem ainda
não existe. No emulador, `pnpm --filter api agent-token <boardId> <slug>` emite um token à mão com `issueRunToken`
(ver `docs/SETUP.md`).

Quando o `run` fecha (`complete_stage`, parada, tempo limite ou falha no despacho), o token deixa de servir: um
`complete_stage` repetido devolve `{ "ignored": true }` sem efeito, e qualquer outra ferramenta recebe
`409 AGENT_RUN_CLOSED`. O token também não sai do card, da etapa e do board do próprio `run`.

## Endpoints

| Rota | O que faz |
|------|-----------|
| `POST /agent/tools/<ferramenta>` | Uma ferramenta por chamada; o corpo é a entrada dela. Responde `200 { "data": … }` ou `{ "error": { "code" } }` |
| `POST /mcp` | Servidor MCP `kanban` em Streamable HTTP: uma mensagem JSON-RPC por POST, resposta `application/json`, sem sessão e sem SSE |
| `GET /mcp`, `DELETE /mcp` | `405`: não há stream avulso nem sessão para encerrar |

As duas rotas passam pelo mesmo núcleo (`callAgentTool`): valida com o schema do contrato, confere card e etapa, grava
o evento com o `runId` e encerra a etapa só por `completeRun`, que decide para onde o card vai.

O MCP atende as duas gerações do protocolo no mesmo endpoint. Pedido com `_meta["io.modelcontextprotocol/protocolVersion"]`
segue a revisão `2026-07-28`: `server/discover`, `tools/list` e `tools/call`, com os headers `MCP-Protocol-Version`,
`Mcp-Method` e `Mcp-Name` conferidos contra o corpo. Pedido sem `_meta` segue as revisões com `initialize`
(`2025-11-25`, `2025-06-18` e `2025-03-26`). `tools/list` traz seis ferramentas; `create_card` fica de fora.
Recusa de ferramenta volta como resultado com `isError: true` e `{ "error": { "code" } }` no texto. Falha de token
responde `401` HTTP antes de qualquer JSON-RPC.

Configuração do lado do agente:

```json
{ "mcpServers": { "kanban": { "type": "http", "url": "<API>/mcp",
  "headers": { "Authorization": "Bearer ${KANBAN_RUN_TOKEN}" } } } }
```

O rate limit conta por endereço de saída e por `run` (60 POST por minuto onde o provedor está configurado): sessões de
pessoas diferentes que saem do mesmo endereço não dividem o mesmo balde.

## Ferramentas

| Ferramenta | Entrada | O que o board faz |
|------------|---------|-------------------|
| `get_card` | `cardId` | Devolve spec, slug, branch, etapa atual, respostas às perguntas anteriores e links dos artefatos das etapas já feitas |
| `post_update` | `cardId`, `stage`, `markdown` | Adiciona um evento à linha do tempo do card |
| `ask` | `cardId`, `stage`, `questions[]` (1–4, cada uma com 2–4 opções e recomendação opcional; pergunta até 1.000 caracteres, cabeçalho até 24, rótulo da opção até 120, descrição até 500) | Guarda as perguntas; o card mostra o selo *aguardando você* |
| `attach_artifact` | `cardId`, `stage`, `path` (relativo à raiz do repositório, até 1.024 caracteres, sem `..`), `commitSha` | Liga um arquivo versionado (plano, handoff, revisão, critérios) ao card |
| `complete_stage` | `cardId`, `stage`, `outcome`, `summary`, `decisions?` (até 20; cada uma com `decision` até 500 caracteres, `rule` ∈ `policy` · `spec` · `repo_pattern` · `least_impact` e `product`) | Encerra a execução; o orquestrador aplica `resolveTransition` com o `outcome`. As decisões ficam no evento `report` e aparecem na tela do ciclo, as de `product: true` em "Para revisar" |
| `get_attachment` | `cardId`, `stage`, `attachmentId` (UUID) | Devolve um arquivo anexado ao pedido do card (`request.attachments` do `get_card`). Só acha anexos do próprio card |
| `create_card` | `boardId`, `title`, `specMarkdown`, `parentCardId?` | Ainda não disponível: valida e confere o board, e responde `501 AGENT_TOOL_NOT_AVAILABLE`. Cards nascem da sincronização das specs do repositório, e um card sem arquivo de spec ficaria órfão |

`outcome` ∈ `success` · `needs_input` · `needs_rework` · `failed`.

### Respostas

Os tipos estão em `packages/kanban-contract/src/agentResults.ts`.

| Ferramenta | `data` |
|------------|--------|
| `get_card` | `AgentCardView`: `card` (id, slug, título, coluna, etapa, estado, voltas, branch), `run` (id, etapa, comando, modelo, esforço, turnos, branch, prazo), `repository` (dono, nome, branch base), `spec` (caminho, ref, sha e corpo sem frontmatter; `null` nos dois últimos se o GitHub não respondeu), `request` (o pedido escrito no board, com os anexos sem o caminho no bucket; `null` para card do repositório), `pendingAsk`, `answers` (respostas de pessoas com a pergunta que fecham, de todas as etapas), `artifacts` e `pullRequest` (`number`, `url`, `draft`, `state` da PR que o board abriu para o card; `null` antes da etapa de PR). `card.cycleId` vem preenchido quando a etapa roda dentro de um ciclo. `card.origin` diz se o card nasceu no board (`board`) ou na sincronização (`repository`), e `spec.ref` é a branch onde a spec está: a do card para um rascunho ou card aprovado ainda não mergeado |
| `get_attachment` | `AgentAttachmentContent`: id, nome, tipo, tamanho e `base64`. Pelo MCP, imagem volta como conteúdo `image`, texto como `text` e PDF como `resource` com `blob` |
| `post_update`, `ask`, `attach_artifact` | `{ "eventId" }` |
| `complete_stage` | `{ "ignored" }`: `true` quando o `run` já tinha fechado |

### Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `AGENT_TOKEN_INVALID` | 401 | Sem token, formato errado, `run` inexistente ou segredo diferente |
| `AGENT_TOKEN_EXPIRED` | 401 | Depois do prazo do `run` |
| `AGENT_TOOL_NOT_FOUND` | 404 | Ferramenta fora do contrato |
| `AGENT_CARD_MISMATCH` | 403 | `cardId` (ou `boardId` no `create_card`) de outro `run` |
| `AGENT_STAGE_MISMATCH` | 403 | `stage` diferente da etapa do `run` |
| `AGENT_RUN_CLOSED` | 409 | Qualquer ferramenta menos `complete_stage` depois de o `run` fechar |
| `AGENT_ASK_IN_CYCLE` | 409 | `ask` num `run` de ciclo: ninguém responde antes de o ciclo terminar, então o agente decide e registra em `decisions` |
| `AGENT_TOOL_NOT_AVAILABLE` | 501 | `create_card` |
| `AGENT_ATTACHMENT_NOT_FOUND` | 404 | `get_attachment` com id que não está no pedido do card, ou objeto que sumiu do bucket |
| `STORAGE_NOT_CONFIGURED` | 503 | `get_attachment` sem Cloud Storage configurado |
| `VALIDATION_FAILED` | 400/413 | Entrada fora do schema ou acima de 100 KiB |
| `CARD_STAGE_NOT_FOUND`, `CARD_ARTIFACT_PATH_INVALID` | 404, 422 | Etapa fora do `board.yml`; caminho de artefato com `..`, barra inicial ou `\` |
| `BOARD_NOT_FOUND`, `CARD_NOT_FOUND` | 404 | O board ou o card do `run` sumiu |

## Relatório da etapa

O `summary` de `complete_stage` segue um molde fixo, para que o card seja legível sem abrir o código:

```markdown
### <Etapa> — <resultado em uma linha>

**O que foi feito:** 2–4 linhas.
**Decisões tomadas sem você:** cada uma com a recomendação aplicada (ou "nenhuma").
**Commits:** `abc1234` type(project): ... (um por linha).
**Verificação:** typecheck, lint, testes (números), validação visual (feita / não feita e por quê).
**Pendências:** o que ficou para depois, com dono.
```

Tempo, modelo e link da sessão são preenchidos pelo board a partir do `run`.

## Protocolo do runner local

O runner (`apps/runner`) é a máquina de quem desenvolve buscando trabalho no board. Ele só abre conexões de saída e
fala com a API em HTTP; os tipos das respostas estão em `packages/kanban-contract/src/runner.ts`.

| Rota | Autenticação | O que faz |
|------|--------------|-----------|
| `POST /runner/register` | o código de registro | `{ code, name }` → `{ runnerId, name, token }`. O código é gerado em "Minhas credenciais", vale 10 minutos e serve uma vez |
| `POST /runner/claim` | `Bearer kbl_…` | Atualiza o último contato e devolve `{ job }` com o próximo `run` local de quem registrou o runner, ou `{ job: null }` |
| `POST /runner/runs/<runId>/heartbeat` | `Bearer kbl_…` | `{ turns }` → `{ active }`. `active: false` quer dizer que o `run` foi parado no board e o runner encerra a sessão |
| `POST /runner/runs/<runId>/finish` | `Bearer kbl_…` | `{ turns, durationMs, exit, sessionId? }`. Libera o runner e grava na linha do tempo quanto a etapa levou. Repetido, não grava nada |

O token do runner tem o formato `kbl_<runnerId>_<segredo>`, igual ao de execução com outro prefixo, para que um nunca
sirva no lugar do outro. O board guarda só o hash, e revogar o runner na tela faz a próxima chamada responder
`401 RUNNER_REVOKED`. O runner guarda o token em `~/.agent-board-runner/runners/<runnerId>.json`, com permissão `0600`; vários runners da mesma máquina dividem a pasta.

Regras que o board aplica:

- Um runner só recebe `run` disparado por quem o registrou, e um de cada vez; as duas checagens rodam dentro da
  transação do `claim`.
- O executor de cada `run` é escolhido no momento em que ele sai da fila, entre os que a etapa aceita no `runners` do
  `board.yml`: `local` se a etapa aceita o runner local e quem disparou tem um runner com contato no último minuto, o
  executor de teste no emulador (que faz as vezes do local e da nuvem), ou nenhum. Sem executor, o `run` termina com
  `no_credential` quando a etapa não aceita o runner local e com `no_runner` quando um runner online serviria. Um
  `run` local que nenhum runner pegou em 2 minutos também termina com `no_runner`. O disparo faz a mesma escolha antes
  de entrar na fila e recusa com `409 RUN_NO_CREDENTIAL_FOR_STAGE` ou `503 RUN_EXECUTOR_UNAVAILABLE`.
- "Parar" chega à máquina pelo heartbeat, a cada 15 segundos.

O que o runner faz por `run`: clona ou atualiza o repositório, cria um worktree na branch do card, avisa o início com
`post_update`, roda `environment.install`, roda `claude -p "<comando> <slug> --board <card>"` (com `--cycle <ciclo>` no fim quando o `run` é de um ciclo) com o modelo, o esforço e
o limite de turnos da etapa, e conta os turnos da sessão principal. Quando a sessão termina sem ter fechado a etapa
(Ctrl+C, limite de turnos, erro ou saída sem `complete_stage`), o runner chama `complete_stage` com `failed` e o
motivo. Se o agente já tinha fechado, essa chamada volta `{ "ignored": true }`. Parada no board e prazo vencido são
fechados pelo próprio board. Por último, `finish`, e o worktree é apagado. Um `finish` com `exit: "deadline"` de um
`run` de ciclo faz o board aplicar o prazo na hora, para o ciclo seguir sem ninguém abrir a tela.

Permissões da sessão: o padrão é `--permission-mode acceptEdits` com a lista `permissions.allow` do
`.claude/settings.json` do repositório. O runner soma a essa lista o que o modo board exige em qualquer repositório:
as ferramentas do servidor `kanban` (`mcp__kanban`), `git add`, `git commit` e o push da branch do card (`git push`,
`git push origin <branch>` e `git push -u origin <branch>`). Sem essas regras, o `claude -p` nega a ferramenta e a
sessão segue sem conseguir ler o card nem fechar a etapa. Qualquer outro comando fora da lista é recusado, e a etapa
tende a falhar. A opção `--dangerously-skip-permissions` do runner desliga todas as checagens e imprime um aviso ao
iniciar.

Um runner encerrado no meio de uma etapa (processo morto, máquina desligada) deixa a pasta da execução para trás.
Quando ele volta, a limpeza mata o que sobrou do agente, apaga o worktree e fecha a etapa no board com
`complete_stage` `failed`, usando o token da própria execução. Se o prazo da etapa já passou, o board recusa o token
e a etapa fecha pelo tempo limite.

## Garantias do lado do board

- Um `complete_stage` repetido para o mesmo `run` é ignorado (idempotente).
- Uma execução que não chama `complete_stage` até o tempo limite vira `failed` com o motivo "sem resposta do agente".
  O limite é `limits.stageTimeoutMinutes` do `board.yml` (5 a 240 minutos, padrão 45) e conta a partir do início da
  execução, não da entrada na fila. Sem um agendador, o board aplica o limite na próxima leitura do quadro ou do card.
- Perguntas de uma etapa ficam ligadas ao `run`; a resposta vai junto no próximo disparo da mesma etapa.
