# Backlog do agent-board

A fila das specs em `specs/`, para decidir o que entra. **Esta é a fonte da ordem**; o arquivo de cada spec é
a fonte do conteúdo. Contrato e frontmatter: [`README.md`](README.md). Que tela cada spec constrói:
[`docs/board/SCREENS.md`](../docs/board/SCREENS.md). Evidência, gates e dependências da última auditoria:
[`reference/AUDIT.md`](reference/AUDIT.md).

## Ordem recomendada

Nenhuma spec pode começar agora. As cinco da noite de 2026-11-27 estão implementadas na branch
`guilhermebittelbrunn/chore-overnight-cycle-specs`, na PR #12, com o CI verde em `26eaf1f`; quatro já estão
arquivadas nessa branch e a `cycle-runs` segue na fatia 2. As três `proposed` restantes dependem de alguma delas.
O primeiro passo é a tarefa direta 1 (mergear a PR #12). Depois do merge, a ordem é esta:

| # | spec | o quê | status | valor · esforço | próximo comando |
|---|------|-------|--------|-----------------|-----------------|
| 1 | [`cloud-routines-runner`](features/cloud-routines-runner.md) | Etapas com o notebook fechado. Gate 3 | `proposed` | médio · M | liberada depois do merge da PR #12; aprovar → `/analyze cloud-routines-runner` |
| 2 | [`cycle-runs`](features/cycle-runs.md) (fatia 2) | Pausar e retomar, "Mudar"/"Concordo", infra na tela, aviso de `depends_on` | `in-progress` | alto · G | `/analyze cycle-runs`, depois do merge |
| 3 | [`spec-discovery`](features/spec-discovery.md) | Propostas de spec com evidência, triadas no board | `proposed` | médio · M | liberada depois do merge da PR #12; aprovar → `/analyze spec-discovery` |
| 4 | [`cycle-schedule`](features/cycle-schedule.md) | O ciclo começa sozinho à noite. Gate 4 | `proposed` | médio · P | depois da fatia 2 da `cycle-runs` |

## Em andamento

Implementada na branch da noite, na PR #12 aberta. Não está em `main`.

| spec | o quê | situação |
|------|-------|----------|
| [`cycle-runs`](features/cycle-runs.md) | Várias specs da Análise à PR sem parar | Fatia 1 de 2; spec inteira aprovada em 2026-11-27 |

## Aguardando triagem

| spec | o quê | fase | valor · esforço | bloqueada por |
|------|-------|------|-----------------|---------------|
| [`cloud-routines-runner`](features/cloud-routines-runner.md) | Etapas com o notebook fechado. Gate 3 | 2 | médio · M | merge da PR #12 (`execution-credentials`) |
| [`spec-discovery`](features/spec-discovery.md) | Propostas de spec com evidência, triadas no board | 3 | médio · M | merge da PR #12 (`spec-authoring`) |
| [`cycle-schedule`](features/cycle-schedule.md) | O ciclo começa sozinho à noite. Gate 4 | 3 | médio · P | `cycle-runs` inteira e merge da PR #12 (`execution-credentials`) |

## Adiadas e substituídas

| spec | status | motivo |
|------|--------|--------|
| [`clickup-import`](features/clickup-import.md) | `deferred` | A fonte do backlog é `specs/`; reavaliar depois da fase 2. |
| [`github-actions-runner`](features/github-actions-runner.md) | `deferred` | Runner local e nuvem cobrem o MVP. |
| [`schedules-and-budgets`](features/schedules-and-budgets.md) | `superseded` | Custos e orçamento saíram do escopo; a agenda virou [`cycle-schedule`](features/cycle-schedule.md). |

## Tarefas diretas

1. Mergear a PR #12. Os seis jobs do CI (`changes`, `verify`, `secrets`, `audit`, `coverage`, `e2e`) passaram em
   `26eaf1f`. O nome da branch continua fora do padrão. Ver [achado A14](reference/AUDIT.md#achados-e-pendências).
2. Depois do merge: publicar `firestore.indexes.json` (item 10 do `docs/PRE-PRODUCTION.md`), definir
   `CREDENTIALS_ENCRYPTION_KEY` e conferir o GitHub App (item 5). Ver [A15](reference/AUDIT.md#achados-e-pendências).
3. Selo "Ciclo" no card pendente de um ciclo em andamento. Ver [A16](reference/AUDIT.md#achados-e-pendências).
4. Marcar `review` como `done` no `STATE.md` das dez features da fase 1. Ver [A12](reference/AUDIT.md#achados-e-pendências).
5. Corrigir `docs/board/DECISIONS.md:139`, `docs/board/README.md:37` e a tabela da fase 1 do `ROADMAP.md`, que
   ainda dizem que o runner usa o Agent SDK. Ver [A11](reference/AUDIT.md#achados-e-pendências).
6. PRs do Dependabot #3, #4, #6 e #7 seguem abertas e vermelhas. Ver [A2](reference/AUDIT.md#achados-e-pendências).

## Precisam de decisão

- Quem virou `viewer` pode apagar a própria credencial? Hoje o `DELETE` exige `trigger`. **Recomendação:** liberar
  o `DELETE` da própria linha para qualquer membro; apagar segredo próprio não gasta nada.
- Ciclo parado por falha: com `onFailure: stop` e duas specs ao mesmo tempo, o próximo ciclo da fila começa antes de a spec viva terminar
  a etapa. **Recomendação:** manter na fatia 1 e rever na fatia 2.
- Contraste de 2,82:1 do ponto verde de checks no tema escuro, aceito no `/test` da `pr-flow`. **Recomendação:**
  corrigir junto com a tarefa direta 3, já que mexe no mesmo quadro.
- Três ajustes de produto vistos na `spec-authoring` e não feitos: o assistente de criação do quadro não mostra
  Rascunhos, clicar fora do diálogo Nova spec descarta o texto e arquivos pequenos aparecem como "1 kB".
  **Recomendação:** corrigir o segundo como tarefa direta; os outros dois podem esperar.

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
| `spec-authoring` | 2026-11-27 | [`docs/features/spec-authoring/spec.md`](../docs/features/spec-authoring/spec.md) (branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, PR #12, aguardando merge) |
| `app-cleanup` | 2026-11-27 | [`docs/features/app-cleanup/spec.md`](../docs/features/app-cleanup/spec.md) (branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, PR #12, aguardando merge) |
| `pr-flow` | 2026-11-27 | [`docs/features/pr-flow/spec.md`](../docs/features/pr-flow/spec.md) (branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, PR #12, aguardando merge) |
| `execution-credentials` | 2026-11-27 | [`docs/features/execution-credentials/spec.md`](../docs/features/execution-credentials/spec.md) (branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, PR #12, aguardando merge) |

## Contadores

`proposed` 3 · `approved` 0 · `in-progress` 1 · `deferred` 2 · `superseded` 1 · entregues 15 (4 aguardando o
merge da PR #12). Última auditoria: 2026-11-27, fim da rodada noturna ([`AUDIT.md`](reference/AUDIT.md)).
