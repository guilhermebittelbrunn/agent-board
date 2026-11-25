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
                │ runner local (Agent SDK) │ nuvem (tarefa agendada) │ GitHub Actions (depois)
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
| Runner local | `packages/runner` (spec `local-runner`) | CLI na máquina-alvo: busca trabalho no board, cria worktree, roda a etapa com o Agent SDK, transmite o log |
| Domínio | `packages/kanban-contract` | `board.yml`, papéis, estados, transições, payloads |

## Ciclo do card

| Coluna | Comando | Sai quando |
|--------|---------|------------|
| Rascunhos | `/spec "<pedido>" --board <card>` | Spec aprovada por alguém (spec `spec-authoring`) |
| Tarefas | — | Alguém arrasta o card, ou um ciclo o puxa (spec `cycle-runs`) |
| Análise | `/analyze <slug> --board <card>` | Plano pronto, sem perguntas abertas |
| Executando | `/develop <slug> --board <card>` | Handoff escrito e type-check verde |
| Revisando | `/review <slug> --board <card>` | Revisão escrita, commits e push na branch |
| Testando | `/test <slug> --board <card>` | Testes relacionados verdes e critérios de aceite gerados |
| Aguardando PR | `/observe` ao entrar; `/mediate` a cada comentário | PR aprovada e mergeada |
| Concluído | — | — |

O card tem uma **coluna** (a etapa) e um **estado** (`idle`, `queued`, `running`, `waiting_input`, `failed`). *Aguardando você* é o estado `waiting_input`: um selo no card, não uma coluna. Regras de transição (`packages/kanban-contract/src/cardState.ts`):

- `success` → próxima etapa; entra `queued`, ou `idle` se a etapa exige aprovação.
- `needs_input` → fica na etapa, `waiting_input`; volta a rodar quando alguém responde no card.
- `needs_rework` → volta para a etapa de `onRework` (review e teste voltam para develop) até `limits.maxReworkLoops`; depois disso, `waiting_input`.
- `failed` → fica na etapa, `failed`, com o motivo no card.

## Executores

| Executor | Quando usar | Credencial |
|----------|-------------|-----------|
| Runner local | Etapas que precisam do ambiente da máquina (emulador Firebase, browser, credenciais de dev). Padrão do MVP. | Login do Claude de quem registrou o runner |
| Nuvem (tarefas agendadas com gatilho de API) | Etapas que rodam com o notebook fechado | Tarefas agendadas da conta de quem disparou |
| GitHub Actions | Depois do MVP, se o time preferir rodar no CI | Segredo do repositório |

Na nuvem, cada etapa começa num clone novo. Por isso, no modo board, a branch do card nasce na Análise e toda etapa termina com commit e push nela ([`.claude/rules/board-mode.md`](../../.claude/rules/board-mode.md)).

## Dados (Firestore)

| Coleção | Campos principais |
|---------|-------------------|
| `boards` | repositório (`owner/name`), instalação do GitHub App, `board.yml` validado (snapshot + sha), runner padrão, agenda de ciclos |
| `members` | board, usuário (github id e login), papel no board, papel efetivo e data da última checagem, status do convite |
| `cards` | board, slug, título, spec (caminho + sha), ordem, etapa, estado, branch, PR, voltas de rework, ciclo atual |
| `runs` | card, etapa, quem disparou, credencial usada, executor, id/URL da sessão, modelo, esforço, início/fim, resultado, turnos, decisões registradas |
| `events` | card, etapa, autor (agente ou pessoa), tipo (resumo, pergunta, resposta, artefato, log), corpo em markdown |
| `credentials` | dono (membro ou board), tipo (runner local, tarefa agendada por etapa, API key), referência cifrada, última verificação |
| `cycles` | board, specs em ordem, opções (até onde vai, quantas ao mesmo tempo, o que fazer se uma falhar), quem iniciou, estado, decisões |
| `discoveries` | board, quem pediu, parâmetros (fontes, foco, quantidade), propostas com evidência e a decisão sobre cada uma |
