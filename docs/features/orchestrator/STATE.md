---
slug: orchestrator
title: Orquestrador de etapas (estados, fila e transições)
task: -
spec: orchestrator
branch: -
epic: -
updated: 2026-11-26 09:37
---

# Pipeline: orquestrador de etapas (estados, fila e transições)

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 04:59 | analyze/plan.md | Coleção `run` + `activeRunId`/`lastRun` no card e `stageSettings` no board; disparo, parada e limites sob `requireBoardApi("trigger"/"configure")`; `completeRun` idempotente como única porta para `resolveTransition`; fila e WIP em transação do Firestore; `tick` nas leituras no lugar de cron; executor falso só no emulador, com script de fixture para o `/test` |
| develop | done    | 2026-11-26 06:15 | develop/handoff.md | Coleção `run`, transações de fila/WIP/idempotência, `completeRun` como única porta de `resolveTransition`, executor falso só no emulador, rotas `runs`/`stop`/`stage-settings`, diálogo de disparo e controles no quadro e no detalhe; gates 25/25 e emulador 6/6 |
| review  | in-progress | 2026-11-26 07:05 | review/review.md | Dois defeitos corrigidos na revisão e, depois da rodada 1 do `/test`, o foco ao fechar os diálogos de etapa e seis ajustes de copy e tela; regras 13 e 14, idempotência e executor só no emulador conferidos; gates limpos; plano de commits das oito tarefas com 77 commits |
| test    | done    | 2026-11-26 09:37 | test/report.md | Raiz 13/13 (emulador 148, `orchestratorRuns` 6/6) e `pnpm e2e` 31/31 verdes; fluxos 1 a 10 no browser em claro, escuro e 390 px, correções da revisão confirmadas; a rodada 1 bloqueou porque o foco caía no `body` ao fechar os diálogos de disparo, rodar de novo e parar. Remedido em 2026-11-26 07:47 na passada da `agent-contract`: arrasto, rodar de novo, parar e copy passam; continua no `body` ao fechar por Cancelar ou Escape o diálogo aberto pelo menu "⋯" (o antd mantém o item oculto no DOM). Remedido de novo em 2026-11-26 09:37 na passada do `local-runner`: o foco volta ao "⋯" ao fechar por Cancelar ou Escape (mouse e teclado) e as colunas leem "1 card"/"2 cards"; defeito fechado. `review` segue `in-progress` (sem commits) |
| observe | pending | -                | -               | - (opcional)     |

## Notas
- Depende da `card-timeline` (eventos, `pendingAsk`, rota de resposta), implementada na mesma rodada. Se ela não estiver pronta no `/develop`, o redisparo depois da resposta e os eventos do executor falso esperam; o resto do slice segue.
