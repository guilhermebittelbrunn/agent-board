---
slug: card-timeline
title: Linha do tempo do card, perguntas e respostas
task: -
spec: card-timeline
branch: -
epic: -
updated: 2026-11-26 06:54
---

# Pipeline: linha do tempo do card, perguntas e respostas

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 02:28 | analyze/plan.md | Coleção `cardEvent` (6 tipos) + `pendingAsk` no card; rotas de leitura, comentário (autor edita e apaga) e resposta (`operator`+) sob `requireBoardApi`; `agentEventFromTool` pronto para o `agent-contract`; linha do tempo, perguntas e artefatos no detalhe da `card-backlog`; fixture do `/test` por script travado no emulador |
| develop | done    | 2026-11-26 05:13 | develop/handoff.md | Contrato (`cardEvent`, `resolveAnswers`, `displayCardState`, papéis), SDK, coleção `cardEvent` + `pendingAsk`, 4 rotas sob `requireBoardApi`, transação de resposta via `planAnswer`, `seed:timeline` travado no emulador, perguntas + abas + linha do tempo + artefatos no detalhe; gates verdes, sem smoke |
| review  | in-progress | 2026-11-26 05:50 | review/review.md | Rotas, IDOR, soft delete, transação de resposta, regras 14 e 16 conferidos por leitura; limites em `questionSchema` e no `path`; rodada 1 do /test corrigida (barra fixa, id do textarea, abas, subtítulo do leitor); plano de commits das sete tarefas (66); gates verdes |
| test    | done    | 2026-11-26 06:54 | test/report.md | Suíte (raiz 13/13) e `pnpm e2e` 31/31 verdes; transação de resposta concorrente confirmada no emulador; os três defeitos de tela (barra fixa em 390 px, nome do campo de edição, abas) fechados na remedição da passada do orchestrator |
| observe | pending | -                | -               | - (opcional)     |

## Notas
- Depende da implementação da `card-backlog` (coleção `card`, detalhe do card, `SpecMarkdown`), que nesta rodada entra antes desta.
