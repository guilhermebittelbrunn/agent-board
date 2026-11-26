---
slug: github-app-integration
title: Integração com o GitHub App do board
task: -
spec: github-app-integration
branch: -
epic: -
updated: 2026-11-25 22:43
---

# Pipeline: integração com o GitHub App do board

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-25 21:08 | analyze/plan.md | Cliente GitHub (JWT RS256, token de instalação em cache, repositórios, arquivo, permissão), cliente falso no emulador e webhook `POST /github/webhook` com HMAC; só `apps/api` |
| develop | done    | 2026-11-25 21:32 | develop/handoff.md | Cliente GitHub real e falso, webhook com HMAC, 7 `apiErrors`, item 5 no `PRE-PRODUCTION.md`; 887 testes da API passando, build sem as variáveis do App |
| review  | in-progress | 2026-11-25 21:37 | review/review.md | Sem defeito de código; webhook (HMAC antes do parse, teto de 1 MiB, `timingSafeEqual`) e modo degradado conferidos; branch fora do padrão fica em aberto |
| test    | done    | 2026-11-25 22:43 | test/report.md  | Sem defeito de produção; webhook medido por HTTP (proxy sem `Origin` → 200, 413 chunked, log sem segredo), 888 testes da API, 13 critérios ✅ e 2 🔒 (R4 sem `ARCJET_KEY`, repositório real sem o App) |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Spec ainda `proposed` quando o `/cycle` a executou, a pedido explícito do usuário; a aprovação formal continua com ele.
- Os sinais de pronto contra um repositório real dependem do GitHub App criado (seção 11 do plano) e ficam não verificados até lá.
- `/test`: `review` segue `in-progress` porque o `/cycle` não commita; não há commit da feature em `main..HEAD`. O plano de commits do `review.md` aguarda o usuário.
