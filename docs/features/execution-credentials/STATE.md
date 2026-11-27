---
slug: execution-credentials
title: Credenciais de execução por membro
task: -
spec: execution-credentials
branch: -
epic: -
updated: 2026-11-27 06:05
---

# Pipeline — Credenciais de execução por membro

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-27 04:57 | analyze/plan.md | Operador disparando, escolha pelo runner de quem disparou e registro em `run` já existem; falta a tarefa agendada por etapa como credencial cifrada (coleção `credential`, AES-256-GCM, rotas e seção da nuvem na tela) e a escolha do executor respeitar `stage.runners`, com o motivo `no_credential` no card |
| develop | done    | 2026-11-27 05:20 | develop/handoff.md | Coleção `credential` cifrada com AES-256-GCM (AAD = id), rotas GET/PUT/DELETE, seção da nuvem em Minhas credenciais e escolha do executor por `stage.runners` com `RUN_NO_CREDENTIAL_FOR_STAGE` e `no_credential`; 10 desvios no handoff, gates e `test:emulator` verdes |
| review  | done    | 2026-11-27 06:05 | review/review.md | Rodada 2: D1 do `/test` corrigido (`pumpBoard` não promove run sem escolha calculada, teste novo) e D2 (`node:crypto` no Edge) resolvido cortando o import de `secret-box` na chave; sem 🔴; decisão do `DELETE` para `viewer` segue com o usuário |
| test    | done    | 2026-11-27 06:05 | test/report.md  | Rodada 2: D1 e D2 corrigidos; `pnpm test` 2x verde (api 1150, app 701, emulador 135), `pnpm e2e` 20/20 sem aviso de `node:crypto` no Edge; 17 de 17 critérios PASS (duplo clique em Salvar não medido); Chrome oferecendo salvar o token fica 🔒 manual |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- A spec está `proposed`. Rodou nesta rodada autônoma do `/cycle` porque o usuário pediu para levar o máximo de
  specs possível esta noite e a auditoria de hoje recomendou aprová-la depois da `pr-flow`. O status da spec não
  foi alterado: aprovar é decisão do usuário.
- As 9 decisões adotadas sem pergunta estão em "Perguntas em aberto" do plano.
- Pré-requisito manual de infra (não bloqueia a entrega): `CREDENTIALS_ENCRYPTION_KEY` no env de produção da API.
  Sem ela o cadastro da nuvem fica desligado e o resto do board funciona. Vai para o `docs/PRE-PRODUCTION.md`.
