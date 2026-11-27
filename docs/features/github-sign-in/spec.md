---
id: github-sign-in
title: Login com GitHub
status: done
value: alto
effort: M
audience: confianca
phase: 1
area: [packages/auth, apps/app, apps/api, packages/sdk]
depends_on: []
contends_on: []
feature: github-sign-in
updated: 2026-11-27
---

# Login com GitHub

> **Resumo**
> - **O quê:** entrar no board só com a conta do GitHub, guardando `githubId`, `login` e avatar.
> - **Por quê:** a permissão de cada pessoa nos boards vem do GitHub; e-mail e Google não dizem nada sobre isso.
> - **Status:** `done` · valor alto · esforço M · confianca
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

## Problema

No board, a identidade de quem usa é a conta do GitHub: é ela que define em quais repositórios a pessoa
pode ver e disparar etapas. Hoje o login herdado é e-mail/senha e Google, que não dizem nada sobre o
GitHub de quem entra.

## O que já existe no repo

- `apps/app/shared/lib/googleSignInApi.ts:32` — o login Google que a tela usa hoje: popup do Firebase no
  cliente, troca do ID token do Google por sessão em `POST /auth/sign-in/google`
  (`apps/api/app/(routes)/auth/sign-in/google/route.ts:17`, via `identitySignInWithGoogleIdToken` em
  `apps/api/(shared)/lib/firebase-identity-toolkit.ts:204`) e cookie pela rota de sessão do app. A chamada
  passa pelo SDK (`packages/sdk/src/actions/auth/action.ts:57`).
- `packages/auth/client.ts:152` — `signInWithGoogle` com `signInWithPopup` direto no cliente; hoje só o
  `packages/auth/provider.tsx:396` usa, a tela de login não.
- `packages/auth/session.ts` e `packages/auth/session-routes.ts` — sessão por cookie já pronta.
- `apps/api/app/(guards)/common-panel.ts:30` — `requireCommonPanelApi`, guard das rotas autenticadas.
- `apps/e2e/support/seedAccounts.ts` e `apps/e2e/tests/signIn.spec.ts` — a suíte E2E e o seed do emulador
  entram com e-mail e senha.
- **Lacuna:** não há provedor GitHub nem perfil com `githubId`/`login`.

> Nota da auditoria de 2026-11-25: esta seção citava só o `signInWithGoogle` de `packages/auth/client.ts`
> como padrão; o caminho que a tela usa de fato é o de `googleSignInApi.ts`, acima.

## Referências

- Telas: [Entrar](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Login). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../board/ACCESS.md#identidade).
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
- Tirar e-mail e senha quebra quem depende deles hoje: o seed do emulador, a suíte E2E (job `e2e` do CI)
  e a passada do `/test` com `agent-browser`. Sem uma porta de entrada para teste, o próprio pipeline
  deixa de validar telas autenticadas.
- O emulador do Firebase Auth atende o GitHub pelo popup (serve uma página de login falsa), mas
  `signInWithCredential` com token que não é JWT, como o access token do GitHub, não é suportado
  ([docs do emulador](https://firebase.google.com/docs/emulator-suite/connect_auth), coletado em
  2026-11-25). O desenho do Google troca o token na API pelo `signInWithIdp`; repetir isso com o access
  token do GitHub provavelmente esbarra no mesmo limite no emulador. É inferência pela doc, não medição.
  Se o `login` do GitHub aparece no usuário falso do emulador: não confirmado.
- Em produção, o OAuth App do GitHub precisa estar ligado ao projeto Firebase; sem ele o botão falha. Isso
  é pendência de infra, não de código.

## Sinais de pronto

- Um usuário novo entra com GitHub e aparece com avatar e `login` corretos.
- Não existe caminho na UI para cadastro por e-mail.

## Perguntas em aberto

- Restringir o login a membros de uma organização do GitHub? — **recomendação:** não no MVP; o acesso a cada board
  já é limitado pela permissão no repositório.
- Como fica o login por e-mail e senha? — **recomendação:** sai da UI e do cadastro, mas continua aceito
  quando o app roda contra o emulador, para o seed, a suíte E2E e o `/test` seguirem entrando.

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- O provedor GitHub ficou em `apps/app/shared/lib/githubSignInApi.ts`, não em `packages/auth`; o pacote ganhou só o filtro de método (`packages/auth/sign-in-method.ts`).
- `@repo/kanban-contract` ganhou `identity.ts`, camada que a tabela de impacto não citava.
- E-mail e senha continuam na tela quando o app roda contra o emulador, como a pergunta em aberto recomendava.
