# Backlog do agent-board

Índice priorizado das specs em `specs/`. **Esta é a fonte da ordem**; o arquivo de cada spec é a fonte do
conteúdo. Contrato e frontmatter: [`README.md`](README.md). Cada spec cita as telas que constrói; o mapa
completo está em [`docs/board/SCREENS.md`](../docs/board/SCREENS.md).

> **Semeadura inicial:** 2026-11-25, a partir do plano de integração e de [`docs/board/`](../docs/board/README.md).
> Base: `main` do next-boilerplate em `b7f9124`, enxugada pelo `fork-cleanup`. As specs citam caminhos desse
> estado; rode `/spec --sync` depois de cada entrega.
>
> **Revisão de 2026-11-25, depois do desenho das telas:** entram a escrita de spec com um agente, a
> descoberta de specs, o ciclo com várias specs, a agenda de ciclos e o tema claro e escuro. Custos e
> orçamento saem do escopo.

## Contadores

| status | qtd |
|--------|-----|
| `proposed` | 17 |
| `deferred` | 2 |
| `superseded` | 1 |
| entregues | 1 |

**Por fase** (sem contar `superseded`; ver [`docs/board/ROADMAP.md`](../docs/board/ROADMAP.md)): 1 → 10 · 2 → 5 · 3 → 3 · 4 → 1.

## Ordem recomendada

A fase 0 está entregue, falta só provar o G1 (ver o roadmap). A ordem respeita `depends_on` e fecha a fase 1
(MVP local) antes da nuvem. Aprove as specs na ordem;
nenhuma está `approved` ainda — a próxima é `github-sign-in`.

| # | id | fase | por que agora |
|---|----|------|---------------|
| 1 | [`github-sign-in`](features/github-sign-in.md) | 1 | A identidade é o GitHub; todo o resto depende de saber quem é a pessoa no GitHub. |
| 2 | [`github-app-integration`](features/github-app-integration.md) | 1 | Ler repositórios e consultar permissões; destrava importação e papéis. Pode correr em paralelo com o #1. |
| 3 | [`board-import`](features/board-import.md) | 1 | Primeiro valor visível: o next-boilerplate vira um board com as colunas do seu `board.yml`. |
| 4 | [`board-members`](features/board-members.md) | 1 | Guard por papel efetivo antes de existir qualquer ação que dispare uma execução. |
| 5 | [`card-backlog`](features/card-backlog.md) | 1 | O backlog de specs aparece como cards; dá para priorizar e arrastar. |
| 6 | [`theme-toggle`](features/theme-toggle.md) | 1 | O cabeçalho do board nasce no #5; o botão de tema entra logo, antes de as telas crescerem. Esforço pequeno. |
| 7 | [`card-timeline`](features/card-timeline.md) | 1 | Onde os agentes escrevem; é o que torna o card legível sem abrir código. |
| 8 | [`orchestrator`](features/orchestrator.md) | 1 | Arrastar passa a disparar; transições automáticas com o executor falso. |
| 9 | [`agent-contract`](features/agent-contract.md) | 1 | As ferramentas que os agentes chamam, com token por execução. |
| 10 | [`local-runner`](features/local-runner.md) | 1 | Fecha o MVP: etapas reais na sua máquina. **Gate 2: 3 features ponta a ponta.** |
| 11 | [`execution-credentials`](features/execution-credentials.md) | 2 | Outros membros disparam com a própria credencial. |
| 12 | [`pr-flow`](features/pr-flow.md) | 2 | Aguardando PR: abrir, acompanhar, concluir. |
| 13 | [`spec-authoring`](features/spec-authoring.md) | 2 | O backlog passa a nascer no board: texto ou anexo vira spec, com as perguntas no card. |
| 14 | [`cycle-runs`](features/cycle-runs.md) | 2 | Várias specs da Análise à PR sem parar, com as decisões registradas para revisar depois. |
| 15 | [`cloud-routines-runner`](features/cloud-routines-runner.md) | 2 | Etapas com o notebook fechado. **Gate 3.** |
| 16 | [`spec-discovery`](features/spec-discovery.md) | 3 | Propostas de spec com evidência, triadas no board. |
| 17 | [`cycle-schedule`](features/cycle-schedule.md) | 3 | O ciclo começa sozinho à noite. **Gate 4: uma semana de backlog sem intervenção.** |

## Dependências

| spec | `depends_on` |
|------|--------------|
| `github-sign-in` · `github-app-integration` | — |
| `board-import` | `github-app-integration`, `github-sign-in` |
| `board-members` | `board-import` |
| `card-backlog` | `board-import`, `board-members` |
| `theme-toggle` | `card-backlog` |
| `card-timeline` | `card-backlog` |
| `orchestrator` | `card-timeline` |
| `agent-contract` | `orchestrator` |
| `local-runner` | `agent-contract` |
| `execution-credentials` | `board-members`, `local-runner` |
| `pr-flow` | `github-app-integration`, `orchestrator` |
| `spec-authoring` | `orchestrator`, `agent-contract`, `card-timeline` |
| `cycle-runs` | `orchestrator`, `agent-contract`, `pr-flow` |
| `cloud-routines-runner` | `agent-contract`, `execution-credentials` |
| `spec-discovery` | `spec-authoring` |
| `cycle-schedule` | `cycle-runs`, `execution-credentials` |

## Adiadas

| spec | motivo |
|------|--------|
| [`clickup-import`](features/clickup-import.md) | A fonte do backlog é `specs/`; reavaliar depois da fase 2. |
| [`github-actions-runner`](features/github-actions-runner.md) | Runner local e nuvem cobrem o MVP. |

## Substituídas

| spec | motivo |
|------|--------|
| [`schedules-and-budgets`](features/schedules-and-budgets.md) | Custos e orçamento saíram do escopo; a agenda virou [`cycle-schedule`](features/cycle-schedule.md). |

## Entregues

| spec | data | onde |
|------|------|------|
| `fork-cleanup` | 2026-11-25 | [`docs/features/fork-cleanup/spec.md`](../docs/features/fork-cleanup/spec.md) — PR #1, fase 0 |

## Feito na criação do repositório (fora do backlog)

- `packages/kanban-contract`: schema do `board.yml`, papéis × permissão do GitHub, estados e transições do
  card, payloads das ferramentas dos agentes — com testes.
- `kit/` e a regra `.claude/rules/board-mode.md`, aplicados neste repositório e prontos para o
  next-boilerplate.
- Resíduos de CLI do core (`package.json`, `tsup.config.ts`, `.autorc`, `CHANGELOG.md`, `.firebaserc`) e
  remoto `upstream` apontando para o next-boilerplate.
