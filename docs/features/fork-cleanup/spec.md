---
id: fork-cleanup
title: Enxugar o fork do boilerplate
status: done
value: alto
effort: G
audience: dx
phase: 0
area: [apps/api, apps/app, apps/e2e, packages/auth, packages/internationalization, packages/sdk, packages/shared, packages/next-config, .claude, docs, specs]
depends_on: []
contends_on: []
feature: fork-cleanup
updated: 2026-11-25
---

# Enxugar o fork do boilerplate

> **Resumo**
> - **O quê:** tirar do agent-board o que era de produto para cliente final: landing, e-mail, cobrança,
>   organizações, trilha de auditoria, três idiomas, fluxos de conta de MVP e o ferramental de fork de produto.
> - **Por quê:** era código que ninguém ia usar, que os agentes liam a cada tarefa e que os gates continuavam
>   testando; cada feature do board construída por cima encareceria a remoção.
> - **Status:** `done` — entregue na PR #1 (`chore/bootstrap-agent-board`), fora do pipeline de etapas.
> - **Próximo passo:** nenhum; a fila segue em [`specs/BACKLOG.md`](../../../specs/BACKLOG.md).

## Como foi entregue

Feita direto na branch de bootstrap, junto com a criação do repositório, sem `/analyze → /test`: o escopo
era só remoção, decidido item a item com o dono, e os gates (typecheck, lint e testes de todos os
workspaces) provaram que nada do que ficou quebrou. Por isso esta pasta tem só a spec, sem `STATE.md` nem
artefatos de etapa.

## O que saiu

| Área | Removido |
|------|----------|
| Apps | `apps/web` (landing) e `apps/email` (preview dos templates) |
| Cobrança | `@repo/payments`, rotas e webhook de pagamentos, guard de plano, modo de produto `subscription`/`simple`, aviso de Stripe no boot da API |
| E-mail | `@repo/email`, canal de contato e variáveis do Resend |
| Organizações | Organizações, membros, convites por e-mail e o guard `requireOrganizationApi` |
| Auditoria | Trilha de auditoria (coleção, rotas e tela de admin) |
| Conta | Cadastro por e-mail, recuperação e redefinição de senha, verificação de e-mail, link por e-mail, MFA, tela de sessões, métodos vinculados, troca de e-mail, onboarding |
| i18n | `en` e `es`; o teste de paridade, sem sentido com um idioma, virou o teste de cobertura do `apiErrors` |
| E2E | Landing, Lighthouse, showcase, SSO entre apps, cadastro e posse por organização |
| Ferramental | `scripts/kickoff`, `/kickoff`, `/deliver`, `docs/delivery`, `docs/templates`, ROPA, subprocessadores, `PAYMENTS.md`, `AUTH-SSO.md`, `FORKING.md`, `BACKUP.md`, `INCIDENT-RESPONSE.md`, `RESEARCH-tanstack-vs-next.md`, `docs/assets` |
| Skills | `copywriting`, `seo-audit`, `ai-seo`, `payments-flow`, `market-research`, `brag-slim` |
| Histórico | `docs/features/*` do core (artefatos das features do boilerplate) |

## O que ficou

- `apps/app`, `apps/api` e `apps/e2e` (só `api` + `app`).
- Login por e-mail/senha e Google, troca de senha, perfil e preferências (tema).
- Admin de usuários com impersonação.
- Notificações no app (tipo `welcome`) e upload de arquivos.
- Registro de sessões no servidor, para revogar no logout — só a tela saiu.
- `@repo/design-system`, `@repo/sdk`, `@repo/shared`, `@repo/auth`, `@repo/security`, `@repo/analytics`,
  `@repo/seo`, `@repo/next-config`, `@repo/kanban-contract`.
- O pipeline `.claude` inteiro, com `/spec` e `estrategista-produto` reescritos para o roadmap do board.

## Desvios em relação à proposta

- **Organizações e trilha de auditoria saíram**, embora a proposta as deixasse "fora do corte". O board vai
  ter membros e papéis próprios, ligados ao GitHub (spec `board-members`), e a auditoria mínima mora em
  `runs`; manter as duas estruturas paralelas custaria mais do que recriar o pouco que servir.
- **O `entity` e o upload passaram a ser escopados por pessoa** (`userId`, `findOwnedBy`), já que o escopo
  por organização deixou de existir.
- **O login ficou com e-mail/senha e Google** até a spec `github-sign-in`, em vez de esperar o GitHub.

## Sinais de pronto — conferidos

- [x] Typecheck dos 12 workspaces e `pnpm check` limpos.
- [x] Testes Vitest de todos os workspaces verdes.
- [x] Nenhuma referência a `@repo/payments`, `@repo/email`, Stripe, Resend ou `apps/web` no código.
- [x] Locale único `pt-br`, mantendo o segmento `[locale]`.
- [ ] `pnpm e2e` e `test:emulator` — rodam no CI da PR #1 (precisam de emulador e browser).

## Riscos que continuam

- Cada remoção vira conflito "modificado no upstream / removido aqui" no próximo
  `git merge upstream/main`. Resolva mantendo a remoção; a tabela "O que saiu" é a lista de referência.
