---
slug: board-import
title: Criar board importando um repositório
task: -
spec: board-import
branch: -
epic: -
updated: 2026-11-26 02:49
---

# Pipeline: criar board importando um repositório

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 00:15 | analyze/plan.md | Coleção `board` com id `owner--name`, 6 rotas (`/boards`, repositórios, preview, create, reload), parse do YAML e issues por campo no contrato, telas Meus boards, Novo board (2 passos) e Configuração › Etapas |
| develop | done    | 2026-11-26 00:50 | develop/handoff.md | Contrato (`parseBoardConfigYaml`, issues, diff), SDK `board`, 5 rotas `/boards`, telas Meus boards, Novo board e Configuração; 16/16 tasks do turbo verdes, builds de API e app passando sem o GitHub App |
| review  | in-progress | 2026-11-26 01:00 | review/review.md | Sem achado bloqueante; corrigidos o link do GitHub com branch que tem `/` e um comentário do mapper; plano consolidado de 31 commits das três tarefas; depois da rodada 1 do `/test`, corrigidos a frase de acesso fixa no resumo do repositório e as cinco observações de layout e acessibilidade |
| test    | done    | 2026-11-26 02:49 | test/report.md | Remedição na passada da `board-members`: 768 px com menu aberto, prévia em `lg`/`xl` e `aria-live` do "Copiar" ✅; e2e 31/31; app 703, api 1006 |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido do usuário; a aprovação formal continua com ele.
- As dependências `github-app-integration` e `github-sign-in` estão no working tree, sem commit.
- O plano diverge da spec num ponto: a spec diz "Nenhum" impacto em `@repo/kanban-contract`, e o plano põe lá o parse do YAML, as issues por regra e o diff de etapas (pergunta 1 e 3 do plano).
- O `/test` encontrou `review` ainda `in-progress`: nenhum commit da feature existe, então o gate segue aberto à espera do plano de commits do `/review`.
