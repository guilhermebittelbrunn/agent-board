---
slug: card-backlog
title: Cards a partir do backlog de specs e board com colunas
task: -
spec: card-backlog
branch: -
epic: -
updated: 2026-11-26 04:53
---

# Pipeline: cards a partir do backlog de specs e board com colunas

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 02:15 | analyze/plan.md | Coleção `card` (id `<boardId>__<slug>`), sincronização do `BACKLOG.md` pelo `readFile`, quadro em `/boards/[id]` com Tarefas, etapas e Concluído, reordenar e mover sem disparo (capacidade `prioritize`, `operator`+), detalhe com a spec renderizada pelo lexer do `marked` e recusa de recarga que remove coluna com cards |
| develop | done    | 2026-11-26 03:21 | develop/handoff.md | Coleção `card`, seis rotas de cards com `prioritize`, recusa de recarga, quadro em `/boards/[id]` com arrastar nativo e menu, detalhe com `SpecMarkdown` (lexer do `marked` 13.0.3); gates verdes, UI a verificar no `/test` |
| review  | in-progress | 2026-11-26 04:30 | review/review.md | Slugs `sync`/`order` reservados; rodada 1 do `/test` corrigida: frontmatter cortado na rota da spec (`specBody`), foco volta ao menu do card depois de mover, órfão sem status; remedição no browser na QA da `theme-toggle`; plano de 51 commits |
| test    | done    | 2026-11-26 04:53 | test/report.md | 17/17 critérios ✅; remedição na passada da `theme-toggle`: frontmatter fora do detalhe, foco volta ao gatilho do menu depois de mover e reordenar, órfão só com "Spec removida"; app 810, api 1055, e2e 31/31; arraste com mouse real segue 🔒 |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido do usuário; a aprovação formal continua com ele.
- Depende de `board-import` e `board-members`, ambas no working tree sem commit (com `github-app-integration` e
  `github-sign-in`). Os commits desta spec entram depois dos delas.
- O plano vai além do corte da spec num ponto: a recusa de recarga quando a coluna removida tem cards, que a
  `board-import` deixou para cá (pergunta 9 do plano).
- Duas escolhas evitam dependência nova e estão nas perguntas 1 e 2: arrastar nativo com menu no lugar de
  `@dnd-kit`, e `marked` (já no lockfile) no lugar de `react-markdown`.
- O `/test` encontrou `review` ainda `in-progress`: nenhum commit das cinco tarefas existe, então o gate segue aberto à espera do plano de commits.
