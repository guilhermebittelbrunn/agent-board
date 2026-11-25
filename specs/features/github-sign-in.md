---
id: github-sign-in
title: Login com GitHub
status: proposed
value: alto
effort: M
audience: confianca
phase: 1
area: [packages/auth, apps/app, apps/api, packages/sdk]
depends_on: []
contends_on: []
feature: -
updated: 2026-11-25
---

# Login com GitHub

> **Resumo**
> - **O quê:** entrar no board só com a conta do GitHub, guardando `githubId`, `login` e avatar.
> - **Por quê:** a permissão de cada pessoa nos boards vem do GitHub; e-mail e Google não dizem nada sobre isso.
> - **Status:** `proposed` · valor alto · esforço M · confianca
> - **Próximo passo:** aguardando triagem

## Problema

No board, a identidade de quem usa é a conta do GitHub: é ela que define em quais repositórios a pessoa
pode ver e disparar etapas. Hoje o login herdado é e-mail/senha e Google, que não dizem nada sobre o
GitHub de quem entra.

## O que já existe no repo

- `packages/auth/client.ts:152` — `signInWithGoogle` com `signInWithPopup`; o mesmo padrão serve para
  `GithubAuthProvider`.
- `packages/auth/session.ts` e `packages/auth/session-routes.ts` — sessão por cookie já pronta.
- `apps/api/app/(guards)/common-panel.ts:30` — `requireCommonPanelApi`, guard das rotas autenticadas.
- **Lacuna:** não há provedor GitHub nem perfil com `githubId`/`login`.

## Referências

- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#identidade).
- Firebase Auth — provedor GitHub (OAuth App do GitHub configurado no console do Firebase).

## Proposta — corte de MVP

- [ ] Tela de login com um único botão "Entrar com GitHub".
- [ ] No primeiro login, o perfil do usuário guarda `githubId` (chave estável), `login`, nome e avatar.
- [ ] O `login` é atualizado a cada entrada (pode mudar no GitHub).
- [ ] Cadastro por e-mail/senha e Google ficam indisponíveis.
- [ ] Sessão e guards existentes continuam funcionando.

### Fora do corte

- Checagem de permissão por repositório — spec `board-members`.
- Restringir o login a uma organização do GitHub — decidir depois (ver perguntas).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/auth` | Provedor GitHub; remove e-mail/senha e Google |
| `apps/api` | Perfil do usuário com campos do GitHub |
| `apps/app` | Tela de login simplificada |
| Infra/env | OAuth App do GitHub ligado ao projeto Firebase do board |

## Riscos e trade-offs

- O token OAuth do GitHub devolvido no login não deve ser guardado: o board consulta o GitHub com o
  token do GitHub App, não com o do usuário.

## Sinais de pronto

- Um usuário novo entra com GitHub e aparece com avatar e `login` corretos.
- Não existe caminho na UI para cadastro por e-mail.

## Perguntas em aberto

- Restringir o login a membros de uma organização do GitHub? — **recomendação:** não no MVP; o acesso a cada board
  já é limitado pela permissão no repositório.
