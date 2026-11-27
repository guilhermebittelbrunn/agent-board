---
id: pr-flow
title: Coluna Aguardando PR (abrir, acompanhar e concluir)
status: done
value: alto
effort: M
audience: time
phase: 2
area: [apps/api, apps/app, packages/kanban-contract]
depends_on: [github-app-integration, orchestrator]
contends_on: []
feature: pr-flow
updated: 2026-11-27
---

# Coluna Aguardando PR (abrir, acompanhar e concluir)

> **Resumo**
> - **O quê:** abrir a PR do card, acompanhar reviews e CI e concluir no merge.
> - **Por quê:** o fim da tarefa acontece no GitHub e hoje fica fora do card.
> - **Status:** `done` · valor alto · esforço M · time
> - **Próximo passo:** nenhum. Entregue na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (PR #12); spec arquivada em 2026-11-27. Antes de usar num repositório real, conferir o GitHub App (item 5 do `docs/PRE-PRODUCTION.md`).

## Problema

Depois do teste, o card precisa virar uma PR e acompanhar o que acontece nela: comentários de review que
pedem ajustes, CI falhando e o merge que conclui a tarefa. Hoje isso é manual e fora do card.

## O que já existe no repo

- Comandos `/observe` e `/mediate` nos repositórios importados (com a seção "Modo board" do kit).
- `onPrComment` em `packages/kanban-contract/src/boardConfig.ts`.
- **Lacuna:** abrir PR pelo App, webhooks de PR, fechamento do card.

## Referências

- Telas: [Card aguardando PR](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../board/ACCESS.md#github-app-do-board) — permissões e eventos.

## Proposta — corte de MVP

- [ ] Ao entrar em Aguardando PR, o board abre a PR da branch do card para a base (draft ou não, conforme
      o board) com o resumo dos relatórios, e roda o comando da coluna (`/observe`).
- [ ] Comentário novo de review dispara `onPrComment` (`/mediate`) no card.
- [ ] Estado do CI e das reviews aparece no card.
- [ ] Merge move o card para Concluído; PR fechada sem merge devolve o card para Tarefas com o motivo.

### Fora do corte

- Merge automático (nunca).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Eventos de PR no card |
| `apps/api` | Abertura de PR, webhooks `pull_request*`, `issue_comment`, `check_suite` |
| `apps/app` | Bloco da PR no card |

## Riscos e trade-offs

- Loop de comentários: limite de execuções do `/mediate` por PR e por hora.

## Sinais de pronto

- Um card que passa do teste vira PR, recebe um comentário, o `/mediate` responde no card e o merge o conclui.

## Perguntas em aberto

- PR como draft por padrão? — **recomendação:** sim.

## Nota de entrega

Conferida no código da branch `guilhermebittelbrunn/chore-overnight-cycle-specs` em 2026-11-27, no fechamento (`/spec --sync pr-flow`), depois do `/test`. Os quatro itens do corte estão implementados:

- Ao entrar na etapa de PR, o board abre a PR: a etapa é marcada com `pullRequest` no `board.yml` (`packages/kanban-contract/src/boardConfig.ts:61`), o orquestrador chama `openPullRequestOnEntry` (`apps/api/(shared)/lib/orchestrator/orchestrator.ts:167`) e `pull-request-open.ts` abre como rascunho, com recaída para PR pronta quando o repositório recusa rascunho (linhas 94-123). O comando da coluna é `/observe` (`.kanban/board.yml:49`).
- Comentário novo dispara `onPrComment`: `onPullRequestComment` (`orchestrator.ts:228`), com o limite por hora a partir da linha 235.
- CI e reviews no card: o webhook trata `pull_request_review`, `issue_comment` e `check_suite` (`pull-request-webhook.ts:27-29`, `:212-216`), e `CardPullRequest.tsx` mostra checks (linha 119) e reviews (linha 150).
- Merge leva a Concluído e fechamento sem merge volta a Tarefas: `settlePullRequest` (`orchestrator.ts:197`), alimentado pelo evento `closed` com `merged` (`pull-request-webhook.ts:71-77`, `:253-260`).

O `/test` aprovou na rodada 2. Ficam 🔒, só verificáveis com GitHub real: PR com autor `[bot]`, respostas 403 e 422 do GitHub e a entrega real dos eventos. Ficou aceito, sem correção, o contraste de 2,82:1 do ponto verde de checks no tema escuro (achado A17 do `specs/reference/AUDIT.md`).

O que saiu diferente do texto acima: o `/mediate` por comentário tem limite por hora, como o risco pedia; os textos da linha do tempo da PR são gravados em pt-br pela API, decisão registrada no `review.md` da feature.

Para usar num repositório real falta infra: `Pull requests: Read and write` no GitHub App e a assinatura dos eventos `Pull request`, `Pull request review`, `Issue comment` e `Check suite` (item 5 do `docs/PRE-PRODUCTION.md`).
