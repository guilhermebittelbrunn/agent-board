---
id: schedules-and-budgets
title: Agenda noturna, orçamento e painel de custos
status: proposed
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
> - **Status:** `proposed` · valor médio · esforço M · time
> - **Próximo passo:** aguardando triagem

## Problema

A ideia do board é trazer features prontas em rotinas longas: puxar o topo do backlog à noite e encontrar
PRs de manhã. Sem agenda e sem teto de gasto, isso depende de alguém arrastar cards e pode estourar o
orçamento num loop.

## O que já existe no repo

- `runs` com custo e tokens — spec `orchestrator`.
- **Lacuna:** agenda, orçamento e visão de custo.

## Referências

- Custos por modelo: [Claude Platform pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Proposta — corte de MVP

- [ ] Agenda por board: em horários definidos, puxa até N cards do topo de Tarefas para a primeira etapa.
- [ ] Orçamento mensal por board: ao atingir 80% avisa no board; a 100% não dispara nada novo.
- [ ] Painel de custos por board: por card, por etapa, por modelo e por membro, no mês.
- [ ] WIP por coluna respeitado pela agenda.

### Fora do corte

- Previsão de custo antes do disparo.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `apps/api` | Agenda (cron), contagem de orçamento |
| `apps/app` | Configuração de agenda e orçamento; painel de custos |

## Riscos e trade-offs

- Custo de execução por assinatura não tem valor em dólar exato: mostrar tokens e marcar como estimado.

## Sinais de pronto

- Um board com agenda às 22h e N=3 amanhece com três cards avançados e o gasto da noite visível.

## Perguntas em aberto

- Orçamento em dólares ou em tokens? — **recomendação:** dólares estimados, com tokens ao lado.
