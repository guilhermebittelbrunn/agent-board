---
id: pr-flow
title: Coluna Aguardando PR (abrir, acompanhar e concluir)
status: in-progress
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
> - **Status:** `in-progress` · valor alto · esforço M · time · implementada na branch, aguardando PR
> - **Próximo passo:** abrir a PR da branch da noite e mergear com o CI verde; conferir o GitHub App (item 5 do `docs/PRE-PRODUCTION.md`) antes de usar num repositório real

## Problema

Depois do teste, o card precisa virar uma PR e acompanhar o que acontece nela: comentários de review que
pedem ajustes, CI falhando e o merge que conclui a tarefa. Hoje isso é manual e fora do card.

## O que já existe no repo

- Comandos `/observe` e `/mediate` nos repositórios importados (com a seção "Modo board" do kit).
- `onPrComment` em `packages/kanban-contract/src/boardConfig.ts`.
- **Lacuna:** abrir PR pelo App, webhooks de PR, fechamento do card.

## Referências

- Telas: [Card aguardando PR](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#github-app-do-board) — permissões e eventos.

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

## Nota de andamento (2026-11-27)

Implementada em 2026-11-27 na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (rodada autônoma do `/cycle`), com analyze, develop, review e test em `docs/features/pr-flow/`. A branch não tem PR, push nem CI; por isso a spec continua `in-progress` e não foi arquivada.

Conferido no código: abertura da PR pelo App (`apps/api/(shared)/lib/pull-request/pull-request-open.ts`), webhooks de PR, review, comentário e checks aplicados ao card (`pull-request-webhook.ts`), `onPrComment` disparado pelo orquestrador com limite por hora (`orchestrator.ts:235`) e o bloco da PR no card (`CardPullRequest.tsx`). Merge leva a Concluído e fechamento volta a Tarefas. O `/test` aprovou na rodada 2.

Para usar num repositório real falta infra: `Pull requests: Read and write` no GitHub App e a assinatura dos eventos `Pull request`, `Pull request review`, `Issue comment` e `Check suite` (item 5 do `docs/PRE-PRODUCTION.md`). Ficou aceito, sem correção, o contraste de 2,82:1 do ponto verde de checks no tema escuro.
