---
slug: app-cleanup
title: App só com o board, área do usuário no cabeçalho e landing simples
task: -
spec: app-cleanup
branch: -
epic: -
updated: 2026-11-27 03:20
---

# Pipeline — App só com o board

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-27 02:09 | analyze/plan.md | Remove admin, impersonação, `entity`, notificações, playground, sidebar e aba Segurança; guard `requireSessionApi` sem `x-role` nem `type`; cabeçalho com menu do avatar; landing em `/{locale}` com vídeo gerado do GIF; 20 commits em ordem que compila |
| develop | done    | 2026-11-27 02:45 | develop/handoff.md | Admin, impersonação, `entity`, notificações, playground, sidebar e aba Segurança fora; `requireSessionApi` + `ApiAuthProvider`; landing com vídeo; docs e ferramental com slice `boardMember`; gates verdes (api 1012, app 659, emulador 133) |
| review  | done    | 2026-11-27 03:10 | review/review.md | Sem bloqueante; guards conferidos rota a rota (55 → 43, 8 em `requireSessionApi`, board intacto); `zustand` removido; JSDoc dos guards de agente e runner refluído; gates verdes; plano de 20 commits |
| test    | done    | 2026-11-27 03:20 | test/report.md | 20 critérios, 19 ✅ e 1 ✅ com ressalva (WebM de 738 KB baixado com `prefers-reduced-motion`, 🟡 não bloqueante); `pnpm test` 14/14, `pnpm e2e` 20/20, `next build` de app e api verdes; zero 401 na primeira carga; perfil `type: "admin"` usa o board. O harness bloqueou a gravação do `test/report.md`; o conteúdo foi devolvido ao orquestrador para gravar |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Análise feita na rodada autônoma do `/cycle`, sem perguntas. As 14 decisões tomadas estão em "Perguntas em aberto" do plano, cada uma com a alternativa descartada.
- Pré-requisito manual depois do merge: publicar `firestore.indexes.json` em produção. Os índices removidos do arquivo só somem do projeto com `--force` ou pelo console.
