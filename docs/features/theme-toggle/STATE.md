---
slug: theme-toggle
title: Tema claro e escuro no board
task: -
spec: theme-toggle
branch: -
epic: -
updated: 2026-11-26 04:53
---

# Pipeline: tema claro e escuro no board

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 02:22 | analyze/plan.md | `ModeToggle` alterna direto (sem menu, ícone e rótulo da ação por classe `dark:`), usado no navbar do painel ao lado do avatar em todas as telas do board; teste de leitura de arquivo barra cor fixa em `boards/**` |
| develop | done    | 2026-11-26 04:18 | develop/handoff.md | `ModeToggle` vira botão que alterna direto (rótulo da ação por classe `dark:`), i18n `useDark`/`useLight`, teste barra cor fixa em `boards/**` (61 arquivos limpos); gates verdes |
| review  | in-progress | 2026-11-26 04:30 | review/review.md | Semântica `sr-only`/`hidden` certa e sem risco de hidratação; teste de tokens passou a pegar `ring-offset-<cor>`; plano final das seis tarefas com 54 commits, a tarefa 6 separada por pacote |
| test    | done    | 2026-11-26 04:53 | test/report.md | 11/11 critérios ✅ e 10/10 do "Verificar no `/test`" (nome acessível só "Usar tema escuro"/"Usar tema claro" por tema, sem hidratação, sem piscar, 390 px ao lado do avatar); 3 herdados da `card-backlog` confirmados; app 810, api 1055, e2e 31/31; nenhum defeito |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido do usuário; a aprovação formal continua com ele.
- Depende de `card-backlog`, que só tem o plano e entra antes desta. O plano dela não cria cabeçalho próprio do
  board: o botão fica no navbar do painel (pergunta 1 do plano).
- Nenhuma mudança de API, SDK ou Firestore.
- O `/test` encontrou `review` ainda `in-progress`: nenhum commit das seis tarefas existe, então o gate segue aberto à espera do plano de commits.
