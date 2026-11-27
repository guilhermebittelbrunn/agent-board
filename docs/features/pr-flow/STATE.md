---
slug: pr-flow
title: Coluna Aguardando PR (abrir, acompanhar e concluir)
task: -
spec: pr-flow
branch: -
epic: -
updated: 2026-11-27 04:53
---

# Pipeline — Coluna Aguardando PR

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-27 03:28 | analyze/plan.md | Etapa de PR marcada no `board.yml`; o board abre a PR pelo App (cliente falso no emulador), webhooks de PR/review/comentário/check atualizam o card, `/mediate` por comentário com limite por hora, merge leva a Concluído e fechamento volta a Tarefas |
| develop | done    | 2026-11-27 04:02 | develop/handoff.md | Contrato, SDK, API (cliente GitHub com escrita, abertura, webhook, /mediate por comentário, merge/fechamento), app (bloco da PR, linha no card) e i18n; `resolveTransition` segura o card na etapa de PR; gates verdes (api 1102, app 670, contrato 170, emulador 133) |
| review  | done    | 2026-11-27 05:30 | review/review.md | Rodada 2: corrigido o 🔴 do /test (PR fechada antiga movia o card no fim de qualquer run), o 🟡 do sr-only e dois 🟢; gates e Vitest verdes; 14 commits propostos |
| test    | done    | 2026-11-27 04:53 | test/report.md  | Rodada 2: 🔴 (PR antiga movendo o card) e 🟡 (rolagem horizontal) não se reproduzem; nota do merge e `break-words` ok; api 1109, app 675, contrato 171, emulador 133, e2e 20 (rodada 1); fica 🟢 aceito (ponto verde 2,82:1 no dark) e 🔒 de GitHub real |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Rodada autônoma do `/cycle`: as 8 decisões adotadas sem pergunta estão em "Perguntas em aberto" do plano.
- Pré-requisito manual de infra (não bloqueia a entrega): conferir `Pull requests: Read and write` no GitHub App e
  assinar os eventos `Pull request`, `Pull request review`, `Issue comment` e `Check suite`. Vai para o item 5 do
  `docs/PRE-PRODUCTION.md`.
