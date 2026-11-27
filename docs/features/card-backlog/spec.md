---
id: card-backlog
title: Cards a partir do backlog de specs e board com colunas
status: done
value: alto
effort: G
audience: time
phase: 1
area: [apps/api, apps/app, packages/sdk, packages/design-system, packages/kanban-contract]
depends_on: [board-import, board-members]
contends_on: []
feature: card-backlog
updated: 2026-11-27
---

# Cards a partir do backlog de specs e board com colunas

> **Resumo**
> - **O quê:** o backlog de specs do repositório aparece como cards, com prioridade e colunas.
> - **Por quê:** é onde o time decide o que entra e acompanha o andamento.
> - **Status:** `done` · valor alto · esforço G · time
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

## Problema

O backlog de cada repositório já existe em `specs/` com a ordem em `specs/BACKLOG.md`. O board precisa
mostrar esse backlog como cards, permitir priorizar e arrastar entre colunas, e manter os cards em sincronia
quando as specs mudam no repositório.

## O que já existe no repo

- `packages/kanban-contract/src/cardState.ts` — `CARD_STATES` e a posição do card (`stageKey`, `state`,
  `reworkLoops`).
- `packages/kanban-contract/src/boardConfig.ts` — `backlog.index` e `backlog.readyStatus`.
- Leitura de arquivo do repositório — spec `github-app-integration`.
- **Lacuna:** coleção `cards`, leitura do frontmatter das specs, UI de board.

## Referências

- Telas: [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main) · [Board recém-criado](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardEmpty) · [quadro no celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MBoard). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- Formato das specs: `specs/README.md` do repositório importado.
- [`docs/board/ARCHITECTURE.md`](../../board/ARCHITECTURE.md#ciclo-do-card).

## Proposta — corte de MVP

- [ ] "Sincronizar backlog": lê `backlog.index`, cria um card por spec com status `readyStatus` e marca as
      demais como "não prontas" (visíveis, mas fora de Tarefas).
- [ ] Card guarda slug (id da spec), título, caminho e sha da spec, ordem e posição.
- [ ] Tela do board: uma coluna por etapa do `board.yml`, mais Tarefas e Concluído; cards com título,
      estado (selo) e branch.
- [ ] Reordenar cards em Tarefas (a ordem do board passa a valer sobre a do `BACKLOG.md`).
- [ ] Arrastar um card para outra coluna: nesta spec só muda a posição, sem disparo (o disparo é do
      `orchestrator`).
- [ ] Abrir o card mostra a spec renderizada.

### Fora do corte

- Disparo de etapas e linha do tempo — specs `orchestrator` e `card-timeline`.
- Criar card sem spec (`backlog.source: manual`).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipo do card (se ainda não houver) |
| `packages/sdk` | Recurso `cards` |
| `apps/api` | Coleção `cards`, sincronização com o repositório |
| `apps/app` | Tela do board com drag-and-drop, detalhe do card |
| `packages/design-system` | Componente de board/coluna, se não houver equivalente |

## Riscos e trade-offs

- Biblioteca de drag-and-drop: escolher uma acessível por teclado.
- Spec removida do repositório com card em andamento: o card fica, marcado como órfão.

## Sinais de pronto

- O backlog do next-boilerplate aparece como cards na ordem do `BACKLOG.md`.
- Um `viewer` não consegue arrastar.

## Perguntas em aberto

- A ordem do board deve ser escrita de volta no `BACKLOG.md`? — **recomendação:** não no MVP.

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- A coleção se chama `card` e o recurso do SDK, `boardCard`.
- Soltar o card numa coluna de etapa dispara a etapa pelo `orchestrator`; a rota `move` aceita só `tasks` e `done`. O "mover sem disparo" do corte deixou de existir quando o orquestrador entrou, e é o comportamento esperado.
- Em Tarefas, o card mostra posição e título, sem selo nem branch (`BoardCardItem.tsx:81`, `:97`). Corte silencioso, achado A9 da auditoria.
- Arrastar é o nativo do navegador, com menu "⋯" para teclado; a spec fica numa aba que não abre por padrão.
