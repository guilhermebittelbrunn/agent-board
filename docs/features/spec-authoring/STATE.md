---
slug: spec-authoring
title: Escrever spec com um agente, a partir de texto e anexos
task: -
spec: spec-authoring
branch: guilhermebittelbrunn/chore-overnight-cycle-specs
epic: -
updated: 2026-11-27 01:58
---

# Pipeline — Escrever spec com um agente

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-27 00:44 | analyze/plan.md | Coluna Rascunhos fixa (faixa `drafts`, etapa reservada `spec`), bloco `specAuthoring` no `board.yml`, anexos por rota do board e ferramenta `get_attachment`, aprovação e descarte; slug gerado pela API |
| develop | done    | 2026-11-27 01:16 | develop/handoff.md | Contrato, SDK, API (anexos, rascunho, aprovar/descartar, `get_attachment`), coluna Rascunhos, diálogo Nova spec e página do rascunho, i18n, `/spec` em modo board no kit; lint, typecheck e Vitest verdes, UI a verificar no `/test` |
| review  | done        | 2026-11-27 02:40 | review/review.md | Rodada 2: códigos próprios para recusa de anexo e `needs_rework` da escrita vira `failed`; selo duplicado e input de arquivo na árvore de acessibilidade corrigidos; check, typecheck e Vitest dos arquivos tocados verdes |
| test    | done    | 2026-11-27 01:58 | test/report.md | Rodada 2: 18 de 19 critérios verificados e 1 não verificável (PDF via MCP); os dois defeitos da rodada 1 conferidos corrigidos no app e na API; `pnpm test` da raiz 14/14 |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Análise feita na rodada autônoma do `/cycle`, sem perguntas. As dez decisões tomadas pela recomendação estão em "Perguntas em aberto" do plano.
