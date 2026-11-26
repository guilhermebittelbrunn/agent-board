---
id: card-timeline
title: Linha do tempo do card, perguntas e respostas
status: in-progress
value: alto
effort: M
audience: time
phase: 1
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [card-backlog]
contends_on: []
feature: card-timeline
updated: 2026-11-26
---

# Linha do tempo do card, perguntas e respostas

> **Resumo**
> - **O quê:** cada card mostra o que os agentes fizeram em cada etapa, as perguntas e as respostas.
> - **Por quê:** quem prioriza ou revisa precisa entender a tarefa sem abrir código nem sessões.
> - **Status:** `in-progress` · valor alto · esforço M · time
> - **Próximo passo:** `/develop` (plano em `docs/features/card-timeline/analyze/plan.md`)

## Problema

O valor do board está no que os agentes escrevem em cada etapa: o que foi feito, decisões, testes, perguntas.
Sem uma linha do tempo no card, quem decide prioridade ou revisa resultado precisa abrir sessões e arquivos.

## O que já existe no repo

- `packages/kanban-contract/src/agentContract.ts` — schemas de `post_update`, `ask`, `attach_artifact` e
  `complete_stage` (o molde do relatório está em `docs/board/CONTRACT.md`).
- **Lacuna:** coleção `events`, renderização no card, resposta a perguntas.

## Referências

- Telas: [Card aguardando você](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardDetail) · [responder perguntas no celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MCard). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/CONTRACT.md`](../../docs/board/CONTRACT.md).

## Proposta — corte de MVP

- [ ] Coleção `events` por card: autor (agente ou pessoa), etapa, tipo (atualização, pergunta, resposta,
      artefato, relatório, comentário) e corpo em markdown.
- [ ] Linha do tempo no card, mais recente em cima, agrupada por etapa.
- [ ] Perguntas pendentes no topo do card, com as opções e a recomendação marcada; responder escolhendo uma
      opção ou escrevendo outra.
- [ ] Artefatos como links para o arquivo no GitHub no sha informado.
- [ ] Comentário livre de membros (`viewer` também comenta).

### Fora do corte

- Notificações fora do board.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipos de evento, se ainda não houver |
| `packages/sdk` | Recurso `events` |
| `apps/api` | Coleção `events`, rotas de resposta e comentário |
| `apps/app` | Linha do tempo e bloco de perguntas no detalhe do card |

## Riscos e trade-offs

- Markdown vindo de agentes é conteúdo não confiável: renderizar sem HTML bruto.

## Sinais de pronto

- Um relatório de etapa no molde do contrato aparece legível no card.
- Responder uma pergunta tira o selo *aguardando você* (com o `orchestrator`, redispara a etapa).

## Perguntas em aberto

- Editar ou apagar eventos? — **recomendação:** só comentários de pessoas, pelo autor.
