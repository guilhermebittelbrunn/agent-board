---
id: orchestrator
title: Orquestrador de etapas (estados, fila e transições)
status: done
value: alto
effort: G
audience: time
phase: 1
area: [apps/api, apps/app, packages/kanban-contract]
depends_on: [card-timeline]
contends_on: []
feature: orchestrator
updated: 2026-11-27
---

# Orquestrador de etapas (estados, fila e transições)

> **Resumo**
> - **O quê:** arrastar um card dispara a etapa e o resultado move o card sozinho.
> - **Por quê:** sem um ponto único, telas e agentes moveriam cards cada um do seu jeito.
> - **Status:** `done` · valor alto · esforço G · time
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

## Problema

Arrastar um card precisa virar uma execução da etapa certa, com a credencial certa, uma de cada vez por card,
e o resultado da etapa precisa mover o card sozinho (ou devolvê-lo para Executando, ou parar esperando
alguém). Sem um ponto único que faça isso, cada tela e cada agente moveria cards por conta própria.

## O que já existe no repo

- `packages/kanban-contract/src/cardState.ts` — `resolveTransition` (sucesso, pergunta, rework com limite,
  falha, aprovação opcional) com testes.
- `packages/kanban-contract/src/boardConfig.ts` — `resolveBranchName`, `limits`.
- **Lacuna:** coleção `runs`, fila, disparo para executores, WIP, tempo limite.

## Referências

- Telas: [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main) · [Disparar etapa](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-TriggerStage) · [mover card no celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MMove) · aba Etapas da [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ARCHITECTURE.md`](../../board/ARCHITECTURE.md) — ciclo do card, executores e dados.

## Proposta — corte de MVP

- [ ] Arrastar para uma coluna de etapa (por quem pode disparar) cria um `run` `queued` com quem disparou,
      etapa, modelo e esforço da coluna e a branch do card (`resolveBranchName`).
- [ ] Um card tem no máximo um `run` ativo; drag durante execução é recusado com motivo.
- [ ] Limite WIP por coluna (opcional no board): excedente fica `queued`.
- [ ] Ao receber `complete_stage`, aplica `resolveTransition` e enfileira a próxima etapa quando for o caso.
- [ ] Resposta a pergunta redispara a mesma etapa.
- [ ] `run` sem `complete_stage` até o tempo limite vira `failed`.
- [ ] Botões no card: "Rodar de novo", "Parar" e, com aprovação ligada, "Aprovar e seguir".
- [ ] Interface de executor (adapter) com uma implementação falsa para testes.

### Fora do corte

- Executores reais — specs `local-runner` e `cloud-routines-runner`.
- Ciclos e agenda — specs `cycle-runs` e `cycle-schedule`.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipo `Run` e interface do adapter de executor |
| `apps/api` | Coleção `runs`, fila, transições, rotas de disparo |
| `apps/app` | Selos de estado, botões de controle no card |

## Riscos e trade-offs

- Corrida entre dois drags: a criação do `run` precisa ser transacional por card.
- Fila em Firestore é simples, mas sem worker dedicado: o MVP pode processar no próprio request + cron.

## Sinais de pronto

- Com o executor falso, um card percorre Análise → Executando → Revisando → Testando sozinho e volta para
  Executando quando o falso responde `needs_rework`.
- Na terceira volta, o card para com o selo *aguardando você*.

## Perguntas em aberto

- Processar a fila com cron da Vercel ou com Cloud Functions do Firebase? — **recomendação:** decidir no
  `/analyze`, preferindo o que não exigir plano pago.

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- Limite WIP e gate de aprovação ficam em `board.stageSettings`, gravados por `PATCH /boards/[id]/stage-settings`, e não no `board.yml`.
- Não há cron nem worker: o `tick` roda nas leituras do board e do card. Isso respondeu a pergunta em aberto (nem cron da Vercel, nem Cloud Functions).
- Além do corte: executor escolhido por pessoa, motivos de encerramento `no_runner` e `dispatch_failed`, e recusa `RUN_EXECUTOR_UNAVAILABLE` quando não há executor.
