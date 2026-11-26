---
slug: board-members
title: Membros, convites e papéis do board
task: -
spec: board-members
branch: -
epic: -
updated: 2026-11-26 04:12
---

# Pipeline: membros, convites e papéis do board

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 01:41 | analyze/plan.md | Coleção `boardMember` (id `<boardId>__<login>`), guard `requireBoardApi` com papel efetivo em toda rota de board, 4 rotas de membros, tela Membros, regras de "quem muda quem" em `roles.ts` e cliente falso do GitHub com papel por login |
| develop | done    | 2026-11-26 02:08 | develop/handoff.md | Guard `requireBoardApi` em `GET /boards/[id]`, `reload` e 4 rotas de membros; tela Membros; cliente falso por login; desvio: checagem gravada antes do 403 |
| review  | in-progress | 2026-11-26 02:40 | review/review.md | Segurança conferida sem 🔴 (guard em toda rota `[id]`, escalonamento, IDOR, convite, personificação); 1 🟡 corrigido no diálogo de papel; plano de 40 commits das quatro tarefas; rodada 1 do `/test`: antd em `@layer antd` abaixo das utilidades e ícones do `ActionsMenu` fora do nome acessível |
| test    | done    | 2026-11-26 04:12 | test/report.md | 16/16 critérios ✅ (M1–M12, escalonamento, IDOR, personificação); o 🟡 da seção ativa foi corrigido pelo `@layer antd` e remedido na passada da `card-backlog` (fundo `secondary` em claro e escuro, antd sem mudança visual; paginação 🔒); app 703, api 1006, e2e 31/31 |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido do usuário; a aprovação formal continua com ele.
- Depende de `board-import`, `github-app-integration` e `github-sign-in`, as três no working tree sem commit. Os
  commits desta spec entram depois dos delas.
- O plano diverge da spec num ponto: a spec diz "Nenhum" impacto em `@repo/kanban-contract`, e o plano põe lá as
  regras de convidar, mudar papel e remover (pergunta 7 do plano).
- O item "webhook `member` invalida o cache" do corte já foi entregue pela `github-app-integration`; aqui só ganha
  teste do efeito no guard.
- O `/test` encontrou `review` ainda `in-progress`: nenhum commit das quatro tarefas existe, então o gate segue aberto à espera do plano de commits do `/review`.
