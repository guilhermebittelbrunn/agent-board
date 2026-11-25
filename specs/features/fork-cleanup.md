---
id: fork-cleanup
title: Enxugar o fork do boilerplate
status: approved
value: alto
effort: G
audience: dx
phase: 1
area: [apps/web, apps/email, apps/e2e, apps/api, apps/app, packages/auth, packages/internationalization, packages/payments, packages/email, packages/next-config, .claude, .github, docs]
depends_on: []
contends_on: []
feature: -
updated: 2026-11-25
---

# Enxugar o fork do boilerplate

> **Resumo**
> - **O quê:** tirar do agent-board tudo que é de produto para cliente final: landing, e-mail, cobrança, três idiomas, fluxos de conta de MVP e o ferramental de fork de produto.
> - **Por quê:** é código que ninguém vai usar, que os agentes leem a cada tarefa e que os gates continuam testando; cada feature do board construída por cima encarece a remoção.
> - **Status:** `approved` · valor alto · esforço G · dx
> - **Próximo passo:** `/analyze fork-cleanup`

## Problema

O agent-board é a `main` do next-boilerplate (commit `b7f9124`) com o histórico do core e o remoto
`upstream` apontando para ele. Só os resíduos listados no `docs/FORKING.md` §1 foram limpos na criação.
Todo o resto veio junto: landing, preview de e-mail, cobrança, modo de produto, três idiomas, cadastro por
e-mail, recuperação de conta, MFA, sessões, troca de e-mail, kickoff e etapa de entrega. A remoção não foi
feita na cópia porque a landing agora está amarrada à suíte E2E, ao Lighthouse, ao SSO entre apps e ao job
`e2e` do CI: tirar só a pasta deixaria o CI vermelho.

## O que já existe no repo

- `apps/web/` (landing) e `apps/email/` (preview dos templates).
- `apps/e2e/tests/landing.spec.ts`, `apps/e2e/tests/crossAppSignOut.spec.ts`, `apps/e2e/support/urls.ts` e
  `apps/e2e/lighthouse/` — dependem da landing; o job `e2e` de `.github/workflows/ci.yml` sobe `api`, `app` e
  `web`.
- `packages/payments/`, `apps/api/app/(routes)/payments/`, `apps/api/app/(routes)/webhooks/payments/route.ts:288`
  e `apps/api/app/(guards)/plan.ts:30` (`requirePlanApi`) — cobrança e plano.
- `packages/next-config/product-mode.ts` — modo `subscription`/`simple`.
- `packages/email/` e `apps/api/app/(routes)/contact/` — Resend e canal de contato.
- `packages/internationalization/utils.ts:3` — `locales = ["pt-br", "en", "es"]`; `translations/apps/web/` é
  da landing.
- `packages/auth/client.ts:147` (e-mail/senha), `:156` (link por e-mail) e `:171` (Google); telas
  `apps/app/app/[locale]/(unauthenticated)/{sign-up,forgot-password,reset-password,verify-email,invite}` e
  `apps/app/app/[locale]/(authenticated)/(common)/(pages)/account`.
- `scripts/kickoff/`, `.claude/commands/kickoff.md`, `.claude/commands/deliver.md`, `docs/delivery/`,
  `docs/templates/`, `docs/ROPA.md`, `docs/SUBPROCESSORS.md` — ferramental de fork de produto.
- `.claude/skills/{copywriting,seo-audit,ai-seo,payments-flow,market-research,brag-slim}` e o enquadramento
  "core de MVPs" em `.claude/commands/spec.md` e `.claude/agents/estrategista-produto.md`.
- `.claude/settings.json` — allowlist herdado; os caminhos absolutos já apontam para o agent-board.
- **Já feito na criação:** `package.json` (nome, versão, `bin`, `files`, `engines`, dependências do CLI),
  `tsup.config.ts`, `.autorc`, `CHANGELOG.md` e `.firebaserc`, conforme `docs/FORKING.md` §1.
- **Lacuna:** nada do que está acima foi removido.

## Referências

- Escopo decidido em [`docs/board/README.md`](../../docs/board/README.md#escopo).
- [`docs/FORKING.md`](../../docs/FORKING.md) — como trazer melhorias do core depois (`git merge upstream/main`).

## Proposta — corte de MVP

- [ ] `apps/web` e `apps/email` saem, com `apps/e2e`, Lighthouse, SSO entre apps e o job `e2e` do CI
      ajustados para só `api` e `app`.
- [ ] Cobrança sai: `@repo/payments`, rotas e webhook de pagamentos, guard de plano e modo de produto.
- [ ] `@repo/email` sai, com o canal de contato e as variáveis de Resend.
- [ ] i18n reduzido a pt-br; a regra "sem string solta" continua valendo.
- [ ] Fluxos de conta de MVP saem: cadastro por e-mail, recuperação, verificação, link por e-mail, MFA,
      sessões, métodos vinculados e troca de e-mail. O login fica com o que `github-sign-in` vai substituir.
- [ ] Kickoff e etapa de entrega saem (comandos, scripts e docs), junto com as skills de marketing e
      pagamento; `/spec` e `estrategista-produto` deixam de falar em "core de MVPs".
- [ ] Docs atualizadas: `ARCHITECTURE.md`, `AGENTS.md`, `AI-WORKFLOW.md`, `SETUP.md`, `FORKING.md` (ou
      removido), `CLAUDE.md` aninhados; `PAYMENTS.md` e `AUTH-SSO.md` removidos.
- [ ] Gates verdes: `pnpm turbo run lint typecheck test test:emulator` e `pnpm e2e`.

### Fora do corte

- Login GitHub — spec `github-sign-in`.
- Organizações, notificações, trilha de auditoria e upload de arquivos ficam: podem servir ao board
  (membros, avisos, auditoria). Decidir nas specs que os usarem.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `apps/*` | Remove `web` e `email`; `e2e` passa a cobrir só `api` e `app` |
| `packages/*` | Remove `payments` e `email`; reduz `internationalization`; ajusta `next-config` e `auth` |
| `apps/api` | Remove pagamentos, plano, contato e rotas de conta que saem |
| `apps/app` | Remove telas de conta e de recuperação; roteamento só pt-br |
| `.claude` | Remove kickoff, deliver e skills de marketing/pagamento; adapta `/spec` |
| CI | Job `e2e` sem a landing; Lighthouse removido ou apontado para o app |

## Riscos e trade-offs

- Cada remoção vira conflito "modificado no upstream / removido aqui" no próximo `git merge upstream/main`.
  Resolver mantendo a remoção é rápido, mas acontece a cada merge que tocar nessas pastas.
- Remoção grande esconde regressão: "um commit por aplicação" e "pulverize por funcionalidade".

## Sinais de pronto

- Gates do CI verdes num clone limpo, incluindo `e2e`.
- Nenhuma referência a `@repo/payments`, `@repo/email`, Stripe, Resend ou `apps/web` no código.
- O app sobe em pt-br e a tela de login continua acessível.

## Perguntas em aberto

- Manter o segmento `[locale]` nas rotas com um único idioma? — **recomendação:** manter agora.
- Remover também o kickoff e o `/deliver`? — **recomendação:** sim; o board não é entregue a cliente.
- Tratar a remoção como uma spec só ou dividir (landing/e-mail, cobrança, conta, ferramental)? —
  **recomendação:** dividir no `/analyze` em subtarefas de um épico.
