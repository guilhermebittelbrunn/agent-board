---
id: spec-authoring
title: Escrever spec com um agente, a partir de texto e anexos
status: done
value: alto
effort: G
audience: time
phase: 2
area: [packages/kanban-contract, packages/sdk, apps/api, apps/app, kit]
depends_on: [orchestrator, agent-contract, card-timeline]
contends_on: [packages/kanban-contract/src/boardConfig.ts]
feature: spec-authoring
updated: 2026-11-27
---

# Escrever spec com um agente, a partir de texto e anexos

> **Resumo**
> - **O quê:** descrever uma tarefa em texto livre, com anexos, e um agente transforma o pedido numa spec pronta para o pipeline, perguntando o que faltar.
> - **Por quê:** hoje uma ideia só vira card depois que alguém escreve a spec no repositório; com isso o backlog passa a nascer dentro do board.
> - **Status:** `done` · valor alto · esforço G · time
> - **Próximo passo:** nenhum. Entregue na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (PR #12); spec arquivada em 2026-11-27, chega a `main` com o merge da PR.

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
  [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ARCHITECTURE.md`](../../board/ARCHITECTURE.md#ciclo-do-card) — ciclo do card.

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


## Aprovação e pré-condições

Aprovada em 2026-11-27 por pedido direto do usuário, que mandou executá-la na rodada noturna do `/cycle` como a primeira da fila.

As três dependências estão entregues e em `main` (PR #8): `orchestrator`, `agent-contract` e `card-timeline`, arquivadas em `docs/features/<slug>/spec.md`. O corte roda sem infraestrutura externa quando a API está no emulador, com duas ressalvas:

- **Anexos.** A API já tem upload para o Cloud Storage (`apps/api/app/(routes)/files/route.ts:13`, com `lib/storage.ts` e URL assinada), testado no emulador do Storage. Esse upload aceita só imagem JPEG, PNG ou WebP até 4 MiB (`apps/api/(shared)/validation/file.schema.ts:11`, `:35`), então PDF e texto exigem ampliar a validação. Em produção, o Storage exige o plano Blaze e o item 12 do `docs/PRE-PRODUCTION.md`; sem ele a rota responde `503 STORAGE_NOT_CONFIGURED`. Por isso o pedido em texto precisa funcionar sozinho, com o anexo como acréscimo opcional.
- **Executor.** A escrita é uma etapa como as outras: roda no runner local (`apps/runner`) ou no executor falso do emulador, no `/test`. A nuvem continua com a `cloud-routines-runner`.

Outra lacuna fica dentro do corte: o `kit/commands/` não traz `spec.md`, e o `.claude/commands/spec.md` deste repositório ainda não tem modo board. Os dois entram na fatia `kit/` descrita na tabela de impacto.

A spec `app-cleanup` vem logo depois desta e mantém o upload e o Storage justamente por causa dos anexos.

## Perguntas em aberto

- A coluna Rascunhos é fixa ou é uma etapa do `board.yml`? — **recomendação:** fixa no board, com comando e
  modelo configuráveis no `board.yml`.
- Quem pode aprovar uma spec? — **recomendação:** `operator` ou acima; não precisa ser quem pediu.

## Nota de entrega

Conferida no código da branch `guilhermebittelbrunn/chore-overnight-cycle-specs` em 2026-11-27, no fechamento (`/spec --sync spec-authoring`), depois do `/test`. Os oito itens do corte estão implementados:

- Nova spec com texto e anexos: `NewSpecDialog.tsx`, `POST boards/[id]/drafts` (`drafts/route.ts:28`) e `POST boards/[id]/attachments` (`attachments/route.ts:15`). O card nasce na faixa `drafts` (`packages/kanban-contract/src/boardLanes.ts:3`).
- A escrita roda o `/spec` em modo board (`kit/commands/spec.md`, bloco `board-mode`); os anexos chegam pela ferramenta `get_attachment` (`agentContract.ts:101`).
- Perguntas no bloco do card: o estado do rascunho vem de `draftStatus` (`specAuthoring.ts:88`), que passa a `waiting` com `pendingAsk` aberto.
- O rascunho aparece no card enquanto é escrito: `SpecDraftDetail.tsx:101` renderiza a spec com `SpecMarkdown`.
- A spec é gravada em `specs/features/<slug>.md` na branch do card: `specDraftPath` (`specAuthoring.ts:61`) e o commit por rodada pedido em `kit/commands/spec.md:18`.
- Aprovar só sem pergunta aberta e move para Tarefas: `spec/approve/route.ts:32`, com a recusa em `checkDraftApprovable` (`apps/api/(shared)/lib/spec-draft.ts:288`) e a ordem em Tarefas na linha 71.
- Descartar arquiva o card: `spec/discard/route.ts:17`, via `cardRepository.discardDraft`.
- Bloco opcional no `board.yml`: `specAuthoringConfigSchema` (`boardConfig.ts:31`, ligado na linha 121) e a etapa reservada `spec` (`boardConfig.ts:29`).

O `/test` fechou 18 de 19 critérios. O que ficou sem verificar (🔒) é a leitura de PDF pelo modelo via MCP, que depende de runner real.

O que saiu diferente do texto acima:

- O slug é gerado pela API, não escolhido pelo agente, então a colisão descrita nos riscos não acontece.
- Os anexos (imagem, PDF ou texto, até 3 MB) não vão embutidos no card: o agente os lê com `get_attachment`. A spec estava imprecisa.
- `needs_rework` na etapa de escrita deixa o card `failed`, de onde "Rodar de novo" sai.
- A aprovação fica no card (`specApproval`), sem gravar `status: approved` no arquivo. A barra "N de 8 seções prontas" ficou fora, por decisão do plano.

Ajustes de produto vistos e não feitos (achado A19 do `specs/reference/AUDIT.md`): o assistente de criação do quadro não mostra Rascunhos, clicar fora do diálogo Nova spec descarta o texto e arquivos pequenos aparecem como "1 kB".
