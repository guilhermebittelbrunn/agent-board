# Backlog do agent-board

A fila das specs em `specs/`, para decidir o que entra. **Esta é a fonte da ordem**; o arquivo de cada spec é
a fonte do conteúdo. Contrato e frontmatter: [`README.md`](README.md). Que tela cada spec constrói:
[`docs/board/SCREENS.md`](../docs/board/SCREENS.md). Evidência, gates e dependências da última auditoria:
[`reference/AUDIT.md`](reference/AUDIT.md).

## Ordem recomendada

A fase 1 está entregue no código (PR #8); falta provar o G2 rodando três features pelo board (ver o
[roadmap](../docs/board/ROADMAP.md)). A ordem das três primeiras é a que o usuário definiu para a rodada de
2026-11-27.

| # | spec | o quê | status | valor · esforço | próximo comando |
|---|------|-------|--------|-----------------|-----------------|
| 1 | [`spec-authoring`](features/spec-authoring.md) | Escrever spec no board, com as perguntas no card | `approved` | alto · G | `/analyze spec-authoring` |
| 2 | [`app-cleanup`](features/app-cleanup.md) | App só com o board, conta no menu do usuário e landing simples | `approved` | médio · M | `/analyze app-cleanup`, depois da #1 e sozinha |
| 3 | [`pr-flow`](features/pr-flow.md) | Abrir, acompanhar e concluir a PR | `approved` | alto · M | `/analyze pr-flow` |

## Em andamento

Nenhuma.

## Aguardando triagem

Todas `proposed`, na ordem sugerida.

| # | spec | o quê | fase | valor · esforço | próximo comando |
|---|------|-------|------|-----------------|-----------------|
| 4 | [`execution-credentials`](features/execution-credentials.md) | Cada membro dispara com a própria credencial | 2 | alto · M | aprovar → `/analyze execution-credentials` |
| 5 | [`cycle-runs`](features/cycle-runs.md) | Várias specs da Análise à PR sem parar | 2 | alto · G | depois de `pr-flow` |
| 6 | [`cloud-routines-runner`](features/cloud-routines-runner.md) | Etapas com o notebook fechado. Gate 3 | 2 | médio · M | depois de #4 |
| 7 | [`spec-discovery`](features/spec-discovery.md) | Propostas de spec com evidência, triadas no board | 3 | médio · M | depois de `spec-authoring` |
| 8 | [`cycle-schedule`](features/cycle-schedule.md) | O ciclo começa sozinho à noite. Gate 4 | 3 | médio · P | depois de #4 e #5 |

## Adiadas e substituídas

| spec | status | motivo |
|------|--------|--------|
| [`clickup-import`](features/clickup-import.md) | `deferred` | A fonte do backlog é `specs/`; reavaliar depois da fase 2. |
| [`github-actions-runner`](features/github-actions-runner.md) | `deferred` | Runner local e nuvem cobrem o MVP. |
| [`schedules-and-budgets`](features/schedules-and-budgets.md) | `superseded` | Custos e orçamento saíram do escopo; a agenda virou [`cycle-schedule`](features/cycle-schedule.md). |

## Tarefas diretas

- Marcar `review` como `done` no `STATE.md` das dez features da fase 1: os commits entraram pela PR #8. Ver
  [achado A12](reference/AUDIT.md#achados-e-pendências).
- PRs do Dependabot #3, #4, #6 e #7 seguem com o CI vermelho. Ver [achado A2](reference/AUDIT.md#achados-e-pendências).
- Corrigir `docs/board/DECISIONS.md`, `docs/board/README.md` e `docs/board/ROADMAP.md`, que ainda dizem que o
  runner usa o Agent SDK. Ver [achado A11](reference/AUDIT.md#achados-e-pendências).

## Precisam de decisão

- `operator` já dispara etapas no código; o roadmap deixava isso para a fase 2. Manter? **Recomendação:**
  manter e corrigir o roadmap.
- Aprovar `execution-credentials`? **Recomendação:** sim, depois da `pr-flow`; é o que destrava a nuvem.
- As perguntas em aberto da `app-cleanup` (aba Segurança, slice de referência, avatar, analytics).
  **Recomendação:** as da própria spec.

## Entregues

| spec | data | onde |
|------|------|------|
| `fork-cleanup` | 2026-11-25 | [`docs/features/fork-cleanup/spec.md`](../docs/features/fork-cleanup/spec.md) (PR #1, fase 0) |
| `github-app-integration` | 2026-11-27 | [`docs/features/github-app-integration/spec.md`](../docs/features/github-app-integration/spec.md) (PR #8) |
| `github-sign-in` | 2026-11-27 | [`docs/features/github-sign-in/spec.md`](../docs/features/github-sign-in/spec.md) (PR #8) |
| `board-import` | 2026-11-27 | [`docs/features/board-import/spec.md`](../docs/features/board-import/spec.md) (PR #8) |
| `board-members` | 2026-11-27 | [`docs/features/board-members/spec.md`](../docs/features/board-members/spec.md) (PR #8) |
| `card-backlog` | 2026-11-27 | [`docs/features/card-backlog/spec.md`](../docs/features/card-backlog/spec.md) (PR #8) |
| `theme-toggle` | 2026-11-27 | [`docs/features/theme-toggle/spec.md`](../docs/features/theme-toggle/spec.md) (PR #8) |
| `card-timeline` | 2026-11-27 | [`docs/features/card-timeline/spec.md`](../docs/features/card-timeline/spec.md) (PR #8) |
| `orchestrator` | 2026-11-27 | [`docs/features/orchestrator/spec.md`](../docs/features/orchestrator/spec.md) (PR #8) |
| `agent-contract` | 2026-11-27 | [`docs/features/agent-contract/spec.md`](../docs/features/agent-contract/spec.md) (PR #8) |
| `local-runner` | 2026-11-27 | [`docs/features/local-runner/spec.md`](../docs/features/local-runner/spec.md) (PR #8) |

## Contadores

`proposed` 5 · `approved` 3 · `in-progress` 0 · `deferred` 2 · `superseded` 1 · entregues 11. Última
auditoria: 2026-11-27 ([`AUDIT.md`](reference/AUDIT.md)).
