# Backlog do agent-board

A fila das specs em `specs/`, para decidir o que entra. **Esta é a fonte da ordem**; o arquivo de cada spec é
a fonte do conteúdo. Contrato e frontmatter: [`README.md`](README.md). Que tela cada spec constrói:
[`docs/board/SCREENS.md`](../docs/board/SCREENS.md). Evidência, gates e dependências da última auditoria:
[`reference/AUDIT.md`](reference/AUDIT.md).

## Ordem recomendada

Nenhuma spec está `approved`. A fase 0 está entregue e falta provar o G1 (ver o
[roadmap](../docs/board/ROADMAP.md)). Aprovar as três primeiras da triagem abaixo libera o começo da fase 1.

## Aguardando triagem

Todas `proposed`, na ordem sugerida. A ordem respeita `depends_on` e fecha a fase 1 (MVP local) antes da
nuvem.

| # | spec | o quê | fase | valor · esforço | próximo comando |
|---|------|-------|------|-----------------|-----------------|
| 1 | [`github-app-integration`](features/github-app-integration.md) | O board fala com o GitHub por um App próprio | 1 | alto · M | aprovar → `/analyze github-app-integration` |
| 2 | [`github-sign-in`](features/github-sign-in.md) | Entrar só com a conta do GitHub | 1 | alto · M | decidir o login por e-mail → aprovar → `/analyze github-sign-in` |
| 3 | [`board-import`](features/board-import.md) | Criar board a partir do `.kanban/board.yml` de um repositório | 1 | alto · M | depois de #1 e #2 |
| 4 | [`board-members`](features/board-members.md) | Membros, convites e guard por papel efetivo | 1 | alto · M | depois de #3 |
| 5 | [`card-backlog`](features/card-backlog.md) | O backlog de specs vira cards | 1 | alto · G | depois de #3 e #4 |
| 6 | [`theme-toggle`](features/theme-toggle.md) | Tema claro e escuro no cabeçalho do board | 1 | médio · P | depois de #5 |
| 7 | [`card-timeline`](features/card-timeline.md) | Linha do tempo do card, onde os agentes escrevem | 1 | alto · M | depois de #5 |
| 8 | [`orchestrator`](features/orchestrator.md) | Arrastar dispara a etapa; transições automáticas | 1 | alto · G | depois de #7 |
| 9 | [`agent-contract`](features/agent-contract.md) | Ferramentas dos agentes, com token por execução | 1 | alto · M | depois de #8 |
| 10 | [`local-runner`](features/local-runner.md) | Etapas reais na sua máquina. Gate 2 | 1 | alto · G | depois de #9 |
| 11 | [`execution-credentials`](features/execution-credentials.md) | Cada membro dispara com a própria credencial | 2 | alto · M | depois de #4 e #10 |
| 12 | [`pr-flow`](features/pr-flow.md) | Abrir, acompanhar e concluir a PR | 2 | alto · M | depois de #1 e #8 |
| 13 | [`spec-authoring`](features/spec-authoring.md) | Escrever spec no board, com as perguntas no card | 2 | alto · G | depois de #7, #8 e #9 |
| 14 | [`cycle-runs`](features/cycle-runs.md) | Várias specs da Análise à PR sem parar | 2 | alto · G | depois de #8, #9 e #12 |
| 15 | [`cloud-routines-runner`](features/cloud-routines-runner.md) | Etapas com o notebook fechado. Gate 3 | 2 | médio · M | depois de #9 e #11 |
| 16 | [`spec-discovery`](features/spec-discovery.md) | Propostas de spec com evidência, triadas no board | 3 | médio · M | depois de #13 |
| 17 | [`cycle-schedule`](features/cycle-schedule.md) | O ciclo começa sozinho à noite. Gate 4 | 3 | médio · P | depois de #11 e #14 |

`github-app-integration` passou à frente de `github-sign-in` nesta rodada: só mexe na API, não tem tela e dá
para testar sem o App criado. O login com GitHub tem uma decisão pendente (o que fazer com o login por e-mail,
de que o seed, o E2E e o `/test` dependem).

## Em andamento

Nenhuma.

## Adiadas e substituídas

| spec | status | motivo |
|------|--------|--------|
| [`clickup-import`](features/clickup-import.md) | `deferred` | A fonte do backlog é `specs/`; reavaliar depois da fase 2. |
| [`github-actions-runner`](features/github-actions-runner.md) | `deferred` | Runner local e nuvem cobrem o MVP. |
| [`schedules-and-budgets`](features/schedules-and-budgets.md) | `superseded` | Custos e orçamento saíram do escopo; a agenda virou [`cycle-schedule`](features/cycle-schedule.md). |

## Tarefas diretas

- Os PRs de dependência do Dependabot (#3, #4, #6, #7) estão com o CI vermelho. Ver
  [achado A2](reference/AUDIT.md#achados-e-pendências).

## Precisam de decisão

- Aprovar `github-app-integration`, `github-sign-in` e `board-import`? **Recomendação:** sim, nessa ordem.
- Login por e-mail e senha depois do `github-sign-in`? **Recomendação:** some da UI, mas segue aceito quando
  o app roda contra o emulador, para o seed, o E2E e o `/test`.
- Cliente GitHub falso quando a API roda contra o emulador? **Recomendação:** sim, com um repositório de
  exemplo; sem ele, `board-import` não é percorrida no `/test` sem credencial real.

## Entregues

| spec | data | onde |
|------|------|------|
| `fork-cleanup` | 2026-11-25 | [`docs/features/fork-cleanup/spec.md`](../docs/features/fork-cleanup/spec.md) (PR #1, fase 0) |

## Contadores

`proposed` 17 · `approved` 0 · `in-progress` 0 · `deferred` 2 · `superseded` 1 · entregues 1. Última
auditoria: 2026-11-25 ([`AUDIT.md`](reference/AUDIT.md)).
