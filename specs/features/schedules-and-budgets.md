---
id: schedules-and-budgets
title: Agenda noturna, orçamento e painel de custos
status: superseded
value: médio
effort: M
audience: time
phase: 3
area: [apps/api, apps/app]
depends_on: [orchestrator, execution-credentials]
contends_on: []
feature: -
updated: 2026-11-25
---

# Agenda noturna, orçamento e painel de custos

> **Resumo**
> - **O quê:** puxar o backlog em horários definidos, com teto de gasto e painel de custos.
> - **Por quê:** features prontas de manhã sem risco de estourar o orçamento num loop.
> - **Status:** `superseded` · substituída por [`cycle-schedule`](cycle-schedule.md)
> - **Próximo passo:** nenhum

## Por que saiu

Em 2026-11-25 custos e orçamento saíram do escopo do board: nenhuma tela mostra valor, teto de gasto ou
painel de custos. A parte que continua valendo, rodar o backlog em horário definido, virou a spec
[`cycle-schedule`](cycle-schedule.md), que agenda um ciclo ([`cycle-runs`](cycle-runs.md)) em vez de puxar
cards soltos.
