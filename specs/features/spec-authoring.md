---
id: spec-authoring
title: Escrever spec com um agente, a partir de texto e anexos
status: proposed
value: alto
effort: G
audience: time
phase: 2
area: [packages/kanban-contract, packages/sdk, apps/api, apps/app, kit]
depends_on: [orchestrator, agent-contract, card-timeline]
contends_on: [packages/kanban-contract/src/boardConfig.ts]
feature: -
updated: 2026-11-25
---

# Escrever spec com um agente, a partir de texto e anexos

> **Resumo**
> - **O quê:** descrever uma tarefa em texto livre, com anexos, e um agente transforma o pedido numa spec pronta para o pipeline, perguntando o que faltar.
> - **Por quê:** hoje uma ideia só vira card depois que alguém escreve a spec no repositório; com isso o backlog passa a nascer dentro do board.
> - **Status:** `proposed` · valor alto · esforço G · time
> - **Próximo passo:** aguardando triagem

## Problema

O board só cria cards a partir de specs aprovadas em `specs/` na branch base (spec `card-backlog`). Uma
ideia que chega como conversa, print ou PDF precisa sair do board, virar spec à mão, entrar no repositório e
ser sincronizada. O `/spec` já escreve uma spec a partir de uma ideia, mas faz as perguntas pelo terminal,
não recebe anexo e não tem como devolver as perguntas para o board.

## O que já existe no repo

- `.claude/commands/spec.md` — modo "spec dirigida": texto livre vira spec no formato de
  `specs/reference/TEMPLATE.md`, escrita pelo `estrategista-produto`.
- `.claude/rules/board-mode.md` — no modo board, perguntas viram `mcp__kanban__ask` e toda etapa termina
  com commit e push na branch do card.
- `packages/kanban-contract/src/agentContract.ts` — `ask`, `post_update` e `complete_stage`.
- Spec `card-timeline` — bloco de perguntas no card, com a opção recomendada marcada.
- **Lacuna:** coluna de rascunhos, upload de anexo, disparo do `/spec` em modo board e o passo de
  aprovação da spec.

## Referências

- Telas: [Nova spec](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewSpec) ·
  [Spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-SpecDraft) · coluna
  Rascunhos no [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main). Mapa completo em
  [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/ARCHITECTURE.md`](../../docs/board/ARCHITECTURE.md#ciclo-do-card) — ciclo do card.

## Proposta — corte de MVP

- [ ] "Nova spec" no quadro: texto livre e anexos (imagem, PDF ou texto). Cria um card na coluna
      Rascunhos e dispara a escrita.
- [ ] A escrita roda `/spec "<pedido>" --board <card>`, com os anexos como dados do card. O agente lê o
      código e o backlog antes de perguntar.
- [ ] Perguntas em rodadas de até 4, cada uma com a opção recomendada, no mesmo bloco de perguntas do card.
      Responder dispara a rodada seguinte.
- [ ] O rascunho aparece no card enquanto é escrito, com as seções que ainda dependem de resposta.
- [ ] A spec é gravada em `specs/features/<slug>.md` na branch do card a cada rodada e vai na mesma PR do
      código.
- [ ] "Aprovar spec" só fica disponível sem perguntas abertas e move o card para Tarefas.
- [ ] "Descartar rascunho" arquiva o card. A branch fica no GitHub até alguém apagar.
- [ ] O `board.yml` ganha um bloco opcional para a escrita de specs (comando, modelo, esforço e
      executores), com `/spec` como padrão.

### Fora do corte

- Editar a spec à mão pelo board: quem quiser edita no GitHub, na branch do card.
- Quebrar um pedido grande em várias specs (`create_card` com `parentCardId`).
- Escrever spec sem executor: a escrita é uma etapa como as outras e precisa de runner ou nuvem.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Bloco de escrita de specs no `boardConfigSchema`; estados do card em Rascunhos (escrevendo, aguardando você, pronta) |
| `kit/` | Trecho do modo board no `/spec`: aceitar `--board`, ler os anexos do card, não usar `AskUserQuestion` |
| `packages/sdk` | Criar rascunho com anexos; aprovar e descartar spec |
| `apps/api` | Upload de anexo, card em Rascunhos, rota de aprovação; a sincronização do backlog ignora spec que já tem card |
| `apps/app` | Diálogo Nova spec, coluna Rascunhos e tela da spec em escrita |
| Infra/env | Regras do Storage para os anexos do card |

## Riscos e trade-offs

- Anexo é conteúdo não confiável: chega ao agente como dado, nunca como instrução (regra de ouro 16).
- A spec vive na branch do card até o merge. Quando ela chegar na base, a sincronização do backlog precisa
  reconhecer o slug e não criar um segundo card.
- O slug escolhido pelo agente pode colidir com uma spec existente. A API recusa e o agente escolhe outro.

## Sinais de pronto

- Um pedido com um print vira spec no formato do template, com pelo menos uma rodada de perguntas
  respondida pelo board.
- Aprovar move o card para Tarefas e a spec aparece na branch `feat/<slug>`.

## Perguntas em aberto

- A coluna Rascunhos é fixa ou é uma etapa do `board.yml`? — **recomendação:** fixa no board, com comando e
  modelo configuráveis no `board.yml`.
- Quem pode aprovar uma spec? — **recomendação:** `operator` ou acima; não precisa ser quem pediu.
