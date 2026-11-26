---
slug: github-sign-in
title: Login com GitHub
task: -
spec: github-sign-in
branch: -
epic: -
updated: 2026-11-26 00:06
---

# Pipeline: login com GitHub

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-25 22:50 | analyze/plan.md | Popup GitHub no cliente, API recebe só o ID token do Firebase e lê `login` via `accounts:lookup`; identidade em `@repo/kanban-contract`; Google removido; senha só no emulador, recusada no cookie e na API fora dele; E2E novo do popup |
| develop | done    | 2026-11-25 23:15 | develop/handoff.md | Rota `POST /auth/sign-in/github` com `accounts:lookup`, filtro de método no cookie e na API (senha só no emulador), Google removido, tela e menu novos, E2E do popup escrito e não executado; typecheck, lint e testes verdes |
| review  | in-progress | 2026-11-25 23:45 | review/review.md | Corrida do cookie após recusa da API fechada no `AuthProvider` (com teste); `custom-token` e o proxy do app passam a recusar cookie de método não aceito; copy e instruções que ainda citavam Google corrigidas; gates verdes, `@repo/auth` 211/211; plano de 23 commits cobrindo esta tarefa e a `github-app-integration` |
| test    | done    | 2026-11-26 00:06 | test/report.md  | 13 de 14 critérios medidos e aprovados, 1 🔒 (R1); suíte 13/13, E2E do GitHub 10/10 depois de corrigir três corridas no próprio spec; corrida do cookie confirmada em runtime (some em menos de 207 ms); sem defeito de produção |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido explícito do usuário; a aprovação formal continua com ele.
- Mesma branch da `github-app-integration`, que está no working tree sem commit.
- O `login` atualizado em produção quando muda no GitHub depende do OAuth App criado (risco R1 do plano) e fica não verificado até lá.
