# Revisão: login com GitHub

Escopo: o diff desta tarefa no working tree (`packages/kanban-contract`, `packages/sdk`, `packages/auth`,
`apps/api`, `apps/app`, `apps/e2e`, `packages/internationalization`, docs), lido contra o
`develop/handoff.md`, o `analyze/plan.md` e o `docs/review-checklist.md`. O mesmo working tree tem a
`github-app-integration`, revisada à parte; o plano de commits abaixo cobre as duas.

## Branch

- Atual: `guilhermebittelbrunn/chore-cycle-three-tasks`, sem upstream e sem commit além de `main`.
- Regex do padrão `<project>/<type>/<title>`: **inválida**, pelo mesmo motivo registrado na revisão da
  `github-app-integration`. O usuário pediu as três tarefas do `/cycle` nesta branch, então a revisão não
  renomeou nem criou outra. A decisão em aberto continua a da tarefa 1: `git branch -m feat/cycle-three-tasks`
  antes do primeiro commit.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | `packages/auth/provider.tsx:290-297` (antes da correção), `apps/app/shared/lib/githubSignInApi.ts:44-54` | O desvio 1 do handoff não fecha a corrida que descreve. Quando a API recusa o login, o cliente faz `signOut` e `DELETE /api/auth/session`. Se o `POST /api/auth/session` do `AuthProvider` (disparado pelo `onIdTokenChanged` do popup) ainda estiver em voo, o `DELETE` sai sem cookie, `sessionDELETE` não encerra registro nenhum e o cookie chega depois e fica. A afirmação "a gravação atrasada é recusada com `AUTH_SESSION_REVOKED`" só vale quando o `DELETE` já leva o cookie. O cookie que sobra é `github.com`, aceito pela API: a pessoa fica com sessão sem a identidade gravada. | Corrigido no provider (ver abaixo). |
| 🟡 | `packages/internationalization/translations/apps/app/pages/common/account.ts:66-67` | `passwordUnavailable` dizia "Esta conta entra pelo Google". Toda conta sem senha agora é GitHub, e a tela da conta mostra esse texto para ela. | Corrigido: "pelo GitHub". |
| 🟡 | `packages/internationalization/translations/packages/auth/index.ts` | `auth/unauthorized-domain` dizia "login com Google", e o popup do GitHub dispara esse mesmo código em domínio não autorizado. `auth/credential-already-in-use` e `auth/user-mismatch` citavam conta Google e só existem em fluxo de vincular provedor, que o repo não tem mais (`git grep linkWith` só acha mocks de teste). | Corrigido: o primeiro passa a citar o GitHub; os dois de vínculo saíram. |
| 🟡 | `CLAUDE.md:9,31`, `AGENTS.md:58`, `apps/app/CLAUDE.md:89-90`, `docs/board/ROADMAP.md:56`, `docs/AUTH-PANEL.md:12` | Afirmavam login por e-mail/senha e Google em produção. `docs/AUTH-PANEL.md` não estava na lista do handoff. | Corrigidos com a menor troca de texto. |
| 🟢 | `specs/features/github-sign-in.md:22` | "Próximo passo" ainda mandava rodar `/develop`. | Corrigido para `/test github-sign-in`. |
| 🟡 | `packages/auth/session-routes.ts` (`customTokenPOST`), `packages/auth/server.ts` (`getUserFromSessionCookie`, usado pelo `apps/app/proxy.ts:240` e pelo `currentUser`) | Nenhum dos dois filtrava o método de entrada do cookie. Um cookie de senha emitido fora do emulador viraria, pelo `custom-token`, um ID token `custom`, que o filtro aceita sempre; e o proxy do app abriria as páginas autenticadas com ele. O comentário de `sign-in-method.ts` assume que todo cookie nasceu de método aceito, e isso só é verdade daqui para frente. Produção ainda não tem usuário. | Corrigido: `customTokenPOST` responde `403 AUTH_SIGN_IN_METHOD_DISABLED` e limpa o cookie; `getUserFromSessionCookie` devolve `null`. O `apps/app/proxy.ts` não mudou: passa a tratar o cookie recusado como ausência de sessão. |
| 🟢 | `apps/api/app/(routes)/account/password/route.ts:28-50` | O plano diz que a troca de senha responde `400 ACCOUNT_PASSWORD_UNSUPPORTED` para conta GitHub. Isso só acontece quando a conta não tem e-mail; conta GitHub com e-mail cai no `identitySignInWithPassword` e recebe o código de senha atual inválida. A tela esconde o formulário para essas contas (`AccountSecurityForm.tsx:63`), então só uma chamada direta chega lá, e nada é gravado. | Não corrigido: a tela de conta está fora do corte da spec. |
| 🟢 | `packages/security/middleware.ts:61` | O comentário do COOP fala do "Google sign-in popup". O motivo (o Firebase resolve o popup por `window.opener`) vale para qualquer provedor, e `apis.google.com` continua necessário no `script-src` porque o SDK do Firebase carrega o gapi para o popup do GitHub também. | Não corrigido: comentário de outro pacote, verdadeiro no mérito. |
| ✅ | `apps/api/app/(routes)/auth/sign-in/github/route.ts:41-80` | O `login` vem do `accounts:lookup` feito com o próprio ID token verificado; o corpo só aceita `idToken` (Zod descarta o resto). O `rawId` do lookup tem de bater com `firebase.identities["github.com"][0]` da claim, e a identidade passa por `githubIdentitySchema` antes de ir ao Firestore. Nenhum caminho lê o access token do GitHub. | Nenhuma. |
| ✅ | `packages/auth/session.ts:159-161`, `apps/api/(shared)/lib/resolve-api-actor.ts:17-29`, `apps/api/app/(routes)/auth/sign-in/route.ts:17-23` | Senha recusada fora do emulador nos três pontos onde credencial vira sessão ou ator: emissão do cookie (`sessionPOST` e `sessionRefreshPOST` passam pelo mesmo `mintSessionCookie`), bearer e cookie na API, e `POST /auth/sign-in` antes de ler o corpo. `google.com` é recusado mesmo no emulador. O `customTokenPOST` e o `getUserFromSessionCookie` passaram a filtrar também (achado acima). `account/password` só usa a senha para conferir, não devolve sessão. | Nenhuma. |
| ✅ | `apps/api/(shared)/validation/account.schema.ts:22,41,48` | O campo `github` do perfil não é gravável pelo cliente: os schemas de conta são `.strict()`. | Nenhuma. |
| ✅ | Remoção do Google | `git grep` não acha `signInWithGoogle`, `googleSignIn`, `/auth/sign-in/google` nem `GoogleSignIn*` em código. A rota foi apagada e saiu do rate limit estrito. Os dois códigos de erro novos têm copy; nenhum código de `apiErrors` ficou órfão (a rota do Google só usava códigos que outras rotas ainda emitem). `GOOGLE_AVATAR_ORIGIN` fica porque `entity-photo.ts` ainda aceita foto do Google, como o plano decidiu. | Nenhuma. |
| ✅ | `apps/app/proxy.ts:69-79` | CSP: `img-src` ganhou só `https://avatars.githubusercontent.com`. O popup do GitHub é outra janela e não passa pelo CSP da página; o iframe de relay continua liberado pelo `frame-src` do `authDomain`. | Nenhuma. |

## Correções aplicadas

- `packages/auth/provider.tsx`: o provider guarda o último usuário do `onIdTokenChanged` num ref
  (`firebaseUserRef`). Depois de gravar o cookie no caminho `no-session` de `applySignedInUser`, se o usuário
  já saiu enquanto a gravação estava em voo, ele chama `syncSessionCookie(null)`, que manda o `DELETE` agora
  com o cookie e encerra o registro da sessão. Antes, o cookie ficava. Cobre a corrida em qualquer ordem: se a
  resposta do `POST` chega antes do `DELETE` do cliente sair, o `DELETE` do cliente leva o cookie; se chega
  depois, o provider apaga. Um `DELETE` duplicado é idempotente. Teste novo:
  `apps/app/__tests__/authProviderSignOutDuringSessionWrite.test.tsx` segura o `POST` do cookie, emite o
  sign-out e solta a resposta; sem a correção, o caso falha (conferido revertendo a linha).
- `packages/auth/session-routes.ts`: `customTokenPOST` recusa cookie de método não aceito com
  `403 AUTH_SIGN_IN_METHOD_DISABLED` e limpa o cookie, antes do teto absoluto e da autoridade.
- `packages/auth/server.ts`: `getUserFromSessionCookie` devolve `null` para cookie de método não aceito.
- Testes do `@repo/auth`: a claim `firebase.sign_in_provider: "github.com"` entrou nos fixtures de cookie do
  `customTokenPOST` (`sessionRefreshRoute.test.ts`, três casos; `givenStaleCookie` de
  `sessionRoutesAuthority.test.ts`), sem mudar asserção. Casos novos: cookie de senha recusado fora do
  emulador e aceito dentro, no `customTokenPOST` (`sessionRoutesAuthority.test.ts`) e no
  `getUserFromSessionCookie` (`serverSessionRevocation.test.ts`, mais o cookie do GitHub fora do emulador).
- `packages/internationalization/translations/apps/app/pages/common/account.ts`: `passwordUnavailable` cita o GitHub.
- `packages/internationalization/translations/packages/auth/index.ts`: `auth/unauthorized-domain` cita o GitHub;
  saíram `auth/credential-already-in-use` e `auth/user-mismatch`.
- `CLAUDE.md`, `AGENTS.md`, `apps/app/CLAUDE.md`: login pelo GitHub, senha só no emulador; o pós-login cita o
  login com GitHub no lugar do Google.
- `docs/board/ROADMAP.md`, `docs/AUTH-PANEL.md`: mesma correção de fato.
- `specs/features/github-sign-in.md`: "Próximo passo" aponta para o `/test`.

## Raio de impacto

- `UserDTO.github?` (`packages/sdk`): campo opcional novo. `AccountDTO` herda, `GET /account` passa a
  devolver. Consumidor novo: `ProfileDropdown`. A allow-list do `AuthMePayload` não muda.
- `AuthActions.signInWithGoogle` e os tipos `GoogleSignIn*` saíram do SDK; `signInWithGoogle` saiu do
  `@repo/auth/client` e do contexto do `AuthProvider`. Nenhum consumidor restante.
- `@repo/sdk` passa a depender de `@repo/kanban-contract` (link de workspace).
- `@repo/auth` exporta `./sign-in-method`. `mintSessionCookie` ganhou o motivo `sign-in-method-disabled`,
  que só `session-routes.ts` consome.
- `AuthProvider`: a correção da corrida vale para todos os apps que montam o provider, mas só age quando o
  Firebase sai enquanto o `POST` do cookie está em voo.
- `getUserFromSessionCookie` filtra o método: afeta o `apps/app/proxy.ts` e o `currentUser()` do
  `@repo/auth/server`. Cookie de senha só continua valendo no emulador.

## Verificar no `/test`

1. **Corrida do cookie depois da recusa (correção desta revisão).** O unitário prova a ordem simulada; a
   ordem real dos `fetch` só aparece executando. Repro: `pnpm e2e` com `apps/e2e/tests/githubSignIn.spec.ts`,
   caso do screen name `-bad`, com `--repeat-each=5`; nenhum cookie `access-token` ao final de nenhuma
   repetição. Rodar também a suíte do `app` (`pnpm turbo run test --filter=app`): a revisão mexeu no
   provider e rodou só o arquivo de teste novo dele.
2. **Claim `firebase.identities["github.com"][0]` igual ao `rawId` do lookup no emulador.** A rota inteira
   depende disso; se o emulador montar a claim de outro jeito, todo login cai em 502. Repro: o caso feliz do
   mesmo E2E (cai em `/pt-br`, menu com `@e2e-octocat`).
3. **`github.id` só com dígitos e `github.login` igual ao screen name** no Firestore do emulador
   (`localhost:4000/firestore`, coleção `user`), depois do login acima.
4. **Seletores do popup** (`#email-input`, `#display-name-input`, `#screen-name-input`, `#sign-in`) contra o
   `firebase-tools` 15.30.1. Se o E2E falhar no popup, o problema é seletor, não a feature.
5. **Login por senha no emulador continua entrando** (`signIn.spec.ts` existente).
6. **Tela sem emulador**: build do app com `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=""`, só o botão do
   GitHub e as notas. Hoje só há prova por unitário (`signInForm.test.tsx`).
7. **Tela em light, dark e mobile (390 px)**: contraste das notas, botão com largura total, separador sobre
   `bg-card`.
8. **Texto da conta sem senha**: na tela de conta de um usuário GitHub do emulador, a seção de senha mostra
   "Esta conta entra pelo GitHub e não tem senha para trocar."
9. 🔒 **Login atualizado em produção quando muda no GitHub (risco R1)**: depende do OAuth App, item 4 do
   `docs/PRE-PRODUCTION.md`.

## Lacunas de teste

| Lacuna (do handoff) | Veredito |
|---------------------|----------|
| Popup do emulador de ponta a ponta | Continua aberta: E2E escrito, nunca executado. Item 1 e 2 acima. |
| Identidade gravada no Firestore do emulador | Continua aberta. Item 3. |
| Claim × `rawId` no emulador | Continua aberta. Item 2. |
| Tela em temas e mobile | Continua aberta. Item 7. |
| Senha no emulador | Continua aberta, coberta pela suíte E2E existente. Item 5. |
| Tela sem emulador em build real | Continua aberta. Item 6. |
| R1 em produção | Fora de alcance até o OAuth App existir. |
| Corrida do cookie no provider (nova) | Fechada aqui por unitário (`authProviderSignOutDuringSessionWrite.test.tsx`). A medição de ponta a ponta continua no item 1. |
| `customTokenPOST` e `getUserFromSessionCookie` com cookie de método recusado (nova) | Fechada aqui (`sessionRoutesAuthority.test.ts`, `serverSessionRevocation.test.ts`). |

## Decisões em aberto

1. **Nome da branch**: a mesma da tarefa 1 (`git branch -m feat/cycle-three-tasks`).
2. **Commits intermediários inconsistentes.** `pnpm-lock.yaml`, `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` e
   `translations/packages/shared/utils.ts` têm hunks das duas tarefas. O plano põe cada arquivo inteiro num
   commit só (detalhe abaixo) para não exigir `git add -p`; o efeito é que o commit do SDK fica sem a linha
   do lockfile até o commit de env da API, e o teste `apiErrorCodes` falha até o commit do i18n. Só afeta
   quem fizer bisect.

## Gates

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | `Checked 680 files in 1891ms. No fixes applied.` |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=app --filter=e2e --filter=@repo/auth --filter=@repo/sdk --filter=@repo/kanban-contract --filter=@repo/internationalization` | 7/7 tarefas sem erro (4 do cache). |
| `apiErrors` | `pnpm --filter api test apiErrorCodes` | 1 arquivo, 2/2 testes. |
| Lint, após o filtro no cookie | `pnpm check` | `Checked 681 files in 1123ms. No fixes applied.` |
| Typecheck, após o filtro no cookie | `pnpm turbo run typecheck --filter=@repo/auth --filter=app` | 2/2 sem erro. |
| Testes do `@repo/auth` | `pnpm --filter @repo/auth test` | 14 arquivos, 211/211 (eram 206; +5 casos novos). |
| Teste novo do provider | `vitest run __tests__/authProviderSignOutDuringSessionWrite.test.tsx` (em `apps/app`) | 2/2; o caso da corrida falha com a correção revertida. |

A suíte do `app`, da `api` e o E2E não rodaram aqui. O i18n mudou depois das medições do handoff (item 1 do
"Verificar no `/test`").

## Plano de commits (tarefas 1 e 2)

> Substituído pelo plano das quatro tarefas em
> [`board-members/review/review.md`](../../board-members/review/review.md#plano-de-commits-tarefas-1-a-4).

> Substituído pelo plano das três tarefas em
> [`board-import/review/review.md`](../../board-import/review/review.md#plano-de-commits-tarefas-1-2-e-3).
> Use aquele; este fica como registro.

Ordem global de dependência: pacotes (`shared`, `kanban-contract`, `sdk`, `auth`) → `apps/api` →
`apps/app` → `apps/e2e` → i18n → docs → instruções de agente → specs → artefatos. Cada commit é de uma
tarefa só, salvo os quatro marcados como misto.

Arquivos mistos e onde entram:

- `pnpm-lock.yaml` → commit 6 (env da API), com os dois links novos (API e SDK). Separar exige `git add -p`
  num arquivo de 6 linhas.
- `apps/api/.env.example` → commit 6. A troca de uma linha de comentário (`FIREBASE_WEB_API_KEY`) é da tarefa 2.
- `packages/internationalization/translations/packages/shared/utils.ts` → commit 16, que vira o commit de
  copy dos códigos de erro das duas tarefas.
- `docs/SETUP.md` e `docs/PRE-PRODUCTION.md` → commit 18, que documenta o setup das duas tarefas. Os hunks
  se intercalam no mesmo arquivo.
- `packages/auth/provider.tsx` → commit 4: a remoção do Google (tarefa 2) e a correção da corrida (desta
  revisão) estão no mesmo arquivo.

1. `feat(shared): add github log scope and BAD_GATEWAY status` (tarefa 1)
   - `packages/shared/utils/helpers/log.ts`
   - `packages/shared/utils/helpers/httpStatus.ts`
2. `feat(kanban-contract): add the GitHub identity schema` (tarefa 2)
   - `packages/kanban-contract/src/identity.ts`
   - `packages/kanban-contract/src/index.ts`
   - `packages/kanban-contract/__tests__/identity.test.ts`
3. `feat(sdk): replace Google sign-in with GitHub sign-in` (tarefa 2)
   - `packages/sdk/package.json`
   - `packages/sdk/src/types/user/user.ts`
   - `packages/sdk/src/actions/auth/action.ts`
4. `refactor(auth): remove Google sign-in and clear a cookie written after sign-out` (tarefa 2 + revisão)
   - `packages/auth/client.ts`
   - `packages/auth/provider.tsx`
5. `feat(auth): refuse sign-in methods other than GitHub outside the emulator` (tarefa 2 + revisão)
   - `packages/auth/sign-in-method.ts`
   - `packages/auth/package.json`
   - `packages/auth/session.ts`
   - `packages/auth/session-routes.ts`
   - `packages/auth/server.ts`
   - `packages/auth/__tests__/signInMethod.test.ts`
   - `packages/auth/__tests__/serverSessionRevocation.test.ts`
   - `packages/auth/__tests__/sessionAbsoluteCap.test.ts`
   - `packages/auth/__tests__/sessionOrigin.test.ts`
   - `packages/auth/__tests__/sessionRefreshRoute.test.ts`
   - `packages/auth/__tests__/sessionRoutesAuthority.test.ts`
6. `chore(api): declare GitHub App environment variables` (tarefa 1, misto)
   - `apps/api/env.ts`
   - `apps/api/.env.example`
   - `apps/api/package.json`
   - `pnpm-lock.yaml`
7. `feat(api): add GitHub App client with a sample client for the emulator` (tarefa 1)
   - `apps/api/(shared)/lib/github/github-app-config.ts`
   - `apps/api/(shared)/lib/github/github-app-jwt.ts`
   - `apps/api/(shared)/lib/github/github-client.ts`
   - `apps/api/(shared)/lib/github/github-errors.ts`
   - `apps/api/(shared)/lib/github/github-installation-tokens.ts`
   - `apps/api/(shared)/lib/github/github-permission-cache.ts`
   - `apps/api/(shared)/lib/github/github-rest-client.ts`
   - `apps/api/(shared)/lib/github/github-fake-client.ts`
   - `apps/api/(shared)/lib/github/github-sample-repositories.ts`
   - `apps/api/__tests__/githubAppJwt.test.ts`
   - `apps/api/__tests__/githubRestClient.test.ts`
   - `apps/api/__tests__/githubPermissionCache.test.ts`
   - `apps/api/__tests__/githubErrorResponse.test.ts`
   - `apps/api/__tests__/githubFakeClient.test.ts`
   - `apps/api/__tests__/githubClientMode.test.ts`
8. `feat(api): add signed GitHub webhook endpoint` (tarefa 1)
   - `apps/api/(shared)/lib/github/github-webhook-signature.ts`
   - `apps/api/(shared)/lib/github/github-webhook-events.ts`
   - `apps/api/(shared)/validation/github-webhook.schema.ts`
   - `apps/api/app/(routes)/github/webhook/route.ts`
   - `apps/api/__tests__/githubWebhookSignature.test.ts`
   - `apps/api/__tests__/githubWebhookRoute.test.ts`
9. `feat(api): warn at boot when the GitHub App is not configured` (tarefa 1)
   - `apps/api/instrumentation.ts`
   - `apps/api/__tests__/githubBootNotice.test.ts`
   - `apps/api/__tests__/corsOriginBoot.test.ts`
10. `feat(api): replace Google sign-in with GitHub sign-in` (tarefa 2)
    - `apps/api/(shared)/lib/firebase-identity-toolkit.ts`
    - `apps/api/(shared)/lib/github-identity.ts`
    - `apps/api/(shared)/lib/user-merge.ts`
    - `apps/api/(shared)/validation/auth.schema.ts`
    - `apps/api/app/(routes)/auth/sign-in/github/route.ts`
    - `apps/api/app/(routes)/auth/sign-in/google/route.ts` (removido)
    - `apps/api/proxy.ts`
    - `apps/api/__tests__/authSignInGithubRoute.test.ts`
    - `apps/api/__tests__/firebaseIdentityLookup.test.ts`
    - `apps/api/__tests__/corsOrigin.test.ts`
    - `apps/api/__tests__/authSignInGoogleRoute.test.ts` (removido)
    - `apps/api/__tests__/authSignInGoogleToolkit.test.ts` (removido)
    - `apps/api/__tests__/googleSignInProfile.test.ts` (removido)
11. `feat(api): refuse password sign-in outside the emulator` (tarefa 2)
    - `apps/api/(shared)/lib/resolve-api-actor.ts`
    - `apps/api/app/(routes)/auth/sign-in/route.ts`
    - `apps/api/__tests__/authSignInRoute.test.ts`
    - `apps/api/__tests__/resolveApiActorSession.test.ts`
12. `feat(app): sign in with GitHub on the sign-in screen` (tarefa 2)
    - `apps/app/shared/lib/githubSignInApi.ts`
    - `apps/app/shared/lib/emulatorSignIn.ts`
    - `apps/app/shared/lib/googleSignInApi.ts` (removido)
    - `apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx`
    - `apps/app/__tests__/githubSignInApi.test.ts`
    - `apps/app/__tests__/signInForm.test.tsx`
    - `apps/app/__tests__/googleSignInApi.test.ts` (removido)
    - `apps/app/__tests__/authFormsPersistedSessionRedirect.test.tsx`
    - `apps/app/__tests__/authProviderSessionNotEstablished.test.tsx`
    - `apps/app/__tests__/postLoginFullPageNavigation.test.tsx`
    - `apps/app/__tests__/sessionExpiredSignOut.test.tsx`
    - `apps/app/__tests__/signInEnterResubmit.test.tsx`
13. `feat(app): show the GitHub login in the profile menu and allow GitHub avatars` (tarefa 2)
    - `apps/app/shared/components/ui/ProfileDropdown.tsx`
    - `apps/app/proxy.ts`
    - `apps/app/__tests__/profileDropdownAccount.test.tsx`
    - `apps/app/__tests__/securityHeaders.test.ts`
14. `test(app): cover a sign-out while the session cookie is being written` (revisão)
    - `apps/app/__tests__/authProviderSignOutDuringSessionWrite.test.tsx`
15. `test(e2e): cover GitHub sign-in through the emulator popup` (tarefa 2)
    - `apps/e2e/tests/githubSignIn.spec.ts`
16. `feat(internationalization): add copy for GitHub and sign-in error codes` (tarefas 1 e 2, misto)
    - `packages/internationalization/translations/packages/shared/utils.ts`
17. `feat(internationalization): replace Google sign-in copy with GitHub` (tarefa 2 + revisão)
    - `packages/internationalization/translations/apps/app/pages/signIn/index.ts`
    - `packages/internationalization/translations/packages/auth/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/account.ts`
18. `docs: document GitHub App and GitHub sign-in setup` (tarefas 1 e 2, misto)
    - `docs/SETUP.md`
    - `docs/PRE-PRODUCTION.md`
19. `docs: describe GitHub as the only sign-in method` (tarefa 2 + revisão)
    - `docs/ARCHITECTURE.md`
    - `docs/SECURITY.md`
    - `docs/AUTH-PANEL.md`
    - `docs/board/ACCESS.md`
    - `docs/board/README.md`
    - `docs/board/DECISIONS.md`
    - `docs/board/ROADMAP.md`
20. `chore(claude): state GitHub as the sign-in method in agent instructions` (revisão)
    - `CLAUDE.md`
    - `AGENTS.md`
    - `apps/app/CLAUDE.md`
21. `docs(specs): reconcile backlog with the code` (tarefa 1, mais o "Próximo passo" da tarefa 2)
    - `specs/BACKLOG.md`
    - `specs/reference/AUDIT.md`
    - `specs/features/board-import.md`
    - `specs/features/github-app-integration.md`
    - `specs/features/github-sign-in.md`
    - `specs/features/spec-discovery.md`
22. `docs(features): github-app-integration`
    - `docs/features/github-app-integration/`
23. `docs(features): github-sign-in`
    - `docs/features/github-sign-in/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md`;
      o `test/` entra quando existir)

As remoções (`google/route.ts`, `googleSignInApi.ts` e os testes) precisam de `git add` explícito do caminho
apagado (ou `git rm`) no commit correspondente. Antes do commit 1, `git diff --cached --stat` tem de sair vazio.

Varredura de segredo em `docs/features/github-sign-in/`: nenhuma senha, token ou chave. Os e-mails citados
são `@example.com` de fixture.

Commits realizados: _(preenchido pelo orquestrador)_
