# Arquitetura

O board decide, os agentes executam e tudo volta para o card. Só uma peça é nova — o agent-board (UI + API + orquestrador); quem executa são os mecanismos que o Claude Code já oferece, atrás de adapters.

```
                ┌──────────────────────────── agent-board ───────────────────────────┐
  você ──drag──▶│ apps/app (board)  ──SDK──▶  apps/api                               │
                │                               ├─ orquestrador (estados + fila)      │◀── webhooks do GitHub
                │                               ├─ contrato dos agentes (HTTP + MCP)  │     (PR, review, checks, merge)
                │                               └─ Firestore                          │
                └───────────────┬─────────────────────────────▲──────────────────────┘
                     dispara etapa (card, slug, etapa, branch)  │ relata (post_update, ask, complete_stage)
                                ▼                               │
                ┌────────────── executores (adapters) ─────────┴──────┐
                │ runner local (claude -p) │ nuvem (tarefa agendada) │ GitHub Actions (depois)
                └──────────────────────────┬───────────────────────────┘
                                           ▼
                         sessão Claude Code no repositório importado
                         /analyze · /develop · /review · /test  --board <card-id>
                                           │
                                           └── commit + push na branch do card
```

## Componentes

| Peça | Onde | Responsabilidade |
|------|------|------------------|
| Board | `apps/app` | Colunas, cards, linha do tempo, perguntas, membros, configuração |
| API | `apps/api` | CRUD de boards/cards/membros, guards por papel efetivo |
| Orquestrador | `apps/api` | Aplica `resolveTransition`, mantém a fila de execuções, limites WIP, retries e a fila dos ciclos |
| Contrato | `apps/api` | Endpoints HTTP e servidor MCP com as ferramentas de [CONTRACT.md](CONTRACT.md) |
| Webhooks | `apps/api` | Eventos do GitHub App: PR aberta, review, comentários, checks, merge, mudança de membros |
| Runner local | `apps/runner` (spec `local-runner`) | CLI na máquina de quem desenvolve: registra-se com um código do board, busca trabalho por polling, cria um worktree na branch do card e roda a etapa com `claude -p`. Guarda o log em `~/.agent-board-runner/logs/` |
| Domínio | `packages/kanban-contract` | `board.yml`, papéis, estados, transições, payloads |

## Ciclo do card

| Coluna | Comando | Sai quando |
|--------|---------|------------|
| Rascunhos | `/spec <slug> --board <card>` (comando do bloco `specAuthoring`) | Alguém aprova a spec; o card vai para o fim de Tarefas |
| Tarefas | — | Alguém arrasta o card, ou um ciclo o puxa (spec `cycle-runs`) |
| Análise | `/analyze <slug> --board <card>` | Plano pronto, sem perguntas abertas |
| Executando | `/develop <slug> --board <card>` | Handoff escrito e type-check verde |
| Revisando | `/review <slug> --board <card>` | Revisão escrita, commits e push na branch |
| Testando | `/test <slug> --board <card>` | Testes relacionados verdes e critérios de aceite gerados |
| Aguardando PR | o board abre a PR (etapa com `pullRequest` no `board.yml`); `/observe` ao entrar; `/mediate` a cada comentário ou review, até `limits.maxPrCommentRunsPerHour` por hora | PR mergeada (vai para Concluído) ou fechada sem merge (volta ao fim de Tarefas) |
| Concluído | — | — |

O card tem uma **coluna** (a etapa) e um **estado** (`idle`, `queued`, `running`, `waiting_input`, `failed`). *Aguardando você* é o estado `waiting_input`: um selo no card, não uma coluna. Regras de transição (`packages/kanban-contract/src/cardState.ts`):

- `success` → próxima etapa; entra `queued`, ou `idle` se a etapa exige aprovação. Na etapa de PR (a que tem `pullRequest`), o card fica nela, `idle`, até o merge.
- `needs_input` → fica na etapa, `waiting_input`; volta a rodar quando alguém responde no card.
- `needs_rework` → volta para a etapa de `onRework` (review e teste voltam para develop) até `limits.maxReworkLoops`; depois disso, `waiting_input`.
- `failed` → fica na etapa, `failed`, com o motivo no card.

Rascunhos é uma faixa própria (`drafts`), fixa antes de Tarefas, e a escrita roda como a etapa reservada
`spec`. Ela não passa por `resolveTransition`: `success` deixa o rascunho `idle` com a spec pronta,
`needs_input` deixa `waiting_input`, `needs_rework` e `failed` deixam `failed`, que sai com "Rodar
de novo". O rascunho não se arrasta nem se move pelo menu; só sai de Rascunhos pela aprovação (`POST .../spec/approve`, que exige rodada
concluída sem pergunta aberta) ou pelo descarte, que apaga o card do quadro e deixa a branch no GitHub.

A etapa de PR tem transições próprias, vindas do webhook (`apps/api/(shared)/lib/pull-request/`):
ao entrar nela o board abre a PR antes de rodar o comando (`ensurePullRequest`, também em
`POST .../pull-request`); a PR mergeada leva o card a Concluído e a fechada sem merge o devolve ao fim de
Tarefas, sempre depois de a execução viva terminar (`settlePullRequest`); comentário ou review que pede algo
dispara o `onPrComment` com `trigger: pr_comment`, ou fica esperando a execução viva acabar ou o limite por
hora liberar (`unhandledCommentAt`). O GitHub falso do emulador abre a PR sem estado e recusa as branches
`feat/qa-pr-permission` (403) e `feat/qa-pr-rejected` (422); `pnpm --filter api github-webhook` manda os
eventos.

## Executores

| Executor | Quando usar | Credencial |
|----------|-------------|-----------|
| Runner local | Etapas que precisam do ambiente da máquina (emulador Firebase, browser, credenciais de dev). Padrão do MVP. | Login do Claude de quem registrou o runner |
| Nuvem (tarefas agendadas com gatilho de API) | Etapas que rodam com o notebook fechado | Tarefas agendadas da conta de quem disparou |
| GitHub Actions | Depois do MVP, se o time preferir rodar no CI | Segredo do repositório |

Na nuvem, cada etapa começa num clone novo. Por isso, no modo board, a branch do card nasce na Análise e toda etapa termina com commit e push nela ([`.claude/rules/board-mode.md`](../../.claude/rules/board-mode.md)).

## Dados (Firestore)

`board`, `boardMember`, `card`, `cardEvent`, `run`, `runner`, `credential` e `cycle` já existem com esses nomes, no singular. As outras coleções ainda não
foram criadas; o nome final sai da spec que as criar.

| Coleção | Campos principais |
|---------|-------------------|
| `board` | repositório (`owner/name`), instalação do GitHub App, `board.yml` validado (snapshot + sha), última sincronização do backlog (`backlogSync`), escolhas do board por etapa (`stageSettings`: limite de cards rodando e aprovação antes da etapa seguinte), `runsPumpedAt` (trava da fila), `runningCycleId` (o ciclo que o board roda agora, trava da fila de ciclos; fica fora do `BoardDTO`); depois: runner padrão, agenda de ciclos |
| `boardMember` | board, usuário (github id e login), papel no board, papel efetivo e data da última checagem, status do convite. Id `<boardId>__<login>` |
| `card` | board, slug, título, spec (caminho, sha e status), pronto, órfão, faixa (`drafts`, `tasks`, `stage`, `done`) e etapa, origem (`repository` ou `board`), onde a spec está (`spec.ref`: a branch do card enquanto ela não está na base), pedido escrito no board (`request`: texto, anexos e quem pediu), aprovação no board (`specApproval`), ordem em Tarefas, estado, voltas de rework, branch, perguntas pendentes (`pendingAsk`: evento, etapa e quantidade), execução viva (`activeRunId`, no máximo uma) e resumo da última (`lastRun`: etapa, status, resultado, motivo do fim, quem parou), ciclo atual (`cycleId`, `null` fora de ciclo; um disparo feito por pessoa tira o card do ciclo); depois: PR. Id `<boardId>__<slug>` |
| `run` | board, card e slug, etapa, comando, agente, modelo, esforço e limite de turnos copiados da etapa no disparo, branch, tipo de disparo (`drag`, `rerun`, `approve`, `answer`, `transition`, `pr_comment`, `cycle`), quem disparou (id e login), ciclo (`cycleId`, copiado do card no disparo), executor (`fake` só no emulador, `local` quando quem disparou tinha um runner online), status (`queued`, `running`, `finished`, `stopped`), `active` (verdadeiro enquanto na fila ou rodando), resultado, motivo do fim (`agent`, `timeout`, `dispatch_failed`, `stopped`, `no_runner`, `no_credential`), quem parou, entrada na fila, início, prazo, fim, URL da sessão (vazia), turnos (o runner local informa no heartbeat e no fim), o runner que pegou o `run` (`runnerId`, `claimedAt`) e quando ele avisou o fim (`runnerFinishedAt`, que torna o aviso idempotente), e o token do agente: `tokenHash` (SHA-256 do segredo, nunca o token) e `tokenExpiresAt` (igual ao prazo). Id automático. Só o orquestrador escreve, sempre em transação no documento do card; o token é gravado na transação do `claim` do runner (ou por `issueRunToken`, no emulador), e nunca sai em `RunDTO`; depois: credencial usada |
| `cardEvent` | board, card, etapa e faixa do card no momento, autor (agente pelo nome, ou pessoa pelo id e login), tipo (`update`, `question`, `answer`, `artifact`, `report`, `comment`), corpo em markdown e os campos de cada tipo (perguntas, respostas com o rótulo copiado, artefato com caminho e sha, resultado da etapa); `runId` aponta o `run` que gerou o evento de agente, e `cycleId` o ciclo daquele `run`; comentários e respostas de pessoa ficam sem os dois. Um `report` guarda também as `decisions` que o agente informou no `complete_stage` (vazias fora de ciclo). Id automático. Só o autor edita ou apaga (soft delete) um comentário; eventos de agente não mudam |
| `runner` | dono (`userId`), nome da máquina, `tokenHash` (SHA-256 do segredo do token `kbl_`), os quatro últimos caracteres do segredo para a tela, último contato (`lastSeenAt`, gravado no máximo a cada 30 s), `run` em andamento (`currentRunId`, um por vez), revogação como soft delete. Id automático |
| `runnerRegistration` | quem gerou o código, validade (10 minutos), uso (`usedAt`) e o runner que nasceu dele. O id do documento é o SHA-256 do código, que nunca fica no banco em claro |
| `credential` | tarefa agendada de uma pessoa para uma etapa: dono (`userId`), board, etapa (`stageKey`), tipo (`scheduled_task`; a API key do board entra aqui depois), `sealed` (Fire URL e token cifrados juntos com AES-256-GCM, IV novo a cada gravação e o id do documento como dado autenticado), os quatro últimos caracteres do id `trig_…` e do token para a tela, última verificação (`lastCheckedAt`, `lastCheckStatus`, vazias até o executor da nuvem existir), remoção como soft delete que também apaga o `sealed`. Id `<boardId>__<userId>__<stageKey>`. A chave fica em `CREDENTIALS_ENCRYPTION_KEY`, no ambiente da API, e `sealed` nunca sai do repositório. O runner local não mora aqui: guarda só o hash do token, na coleção `runner` |
| `cycle` | board, status (`queued`, `running`, `finished`, `stopped`), motivo do fim (`completed`, `stopped`, `item_failed`), opções (`until`: `testing` ou `pull_request`; `concurrency`: 1 ou 2; `onFailure`: `skip` ou `stop`), itens na ordem de execução (1 a 10: slug, id do card, título copiado, status, `code` do disparo recusado, início e fim), quem iniciou (as etapas rodam com a credencial dessa pessoa), quem parou, início e fim. Id automático. Criar, avançar e parar são transações que leem o documento do board (`runningCycleId`), então só um ciclo roda por board e o próximo da fila começa uma vez só. As decisões ficam nos eventos `report` dos cards, achados por `cycleId` |
| `discoveries` | board, quem pediu, parâmetros (fontes, foco, quantidade), propostas com evidência e a decisão sobre cada uma |
