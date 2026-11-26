# Handoff do develop: login com GitHub

Plano: [`analyze/plan.md`](../analyze/plan.md). Nada foi commitado; tudo está no working tree, junto com a
`github-app-integration` (tarefa anterior, também sem commit). Arquivos que as duas tarefas tocam:
`docs/PRE-PRODUCTION.md`, `apps/api/.env.example`, `packages/internationalization/translations/packages/shared/utils.ts`
e `pnpm-lock.yaml`. Em cada um, o hunk desta tarefa é separado do da outra (ver "Separar os commits").

## Desvios do plano (leia primeiro)

1. **Falha na troca com a API também apaga o cookie de sessão.** O plano manteve o esqueleto do Google
   (`signOut` quando a API recusa). Isso não basta: assim que o popup loga o cliente, o `AuthProvider`
   recebe o `onIdTokenChanged` e grava o cookie com o ID token do GitHub, em paralelo com a chamada à API.
   Se a API responde 502 (screen name inválido), o cookie ficaria e o critério "sem cookie" do plano
   falharia. `githubSignInApi.ts` agora faz `signOut` e, em seguida, `DELETE /api/auth/session`, que limpa
   o cookie e encerra o registro da sessão na API. Com o registro encerrado, uma gravação atrasada do
   provider é recusada pelo `sessionPOST` (`AUTH_SESSION_REVOKED`). Coberto por unitário (ver Validação);
   o caso de ponta a ponta está no E2E novo.
2. **O formulário de teste decide pela variável pública, não por `authEmulatorOrigin()`.**
   `authEmulatorHost()` lê primeiro `FIREBASE_AUTH_EMULATOR_HOST`, que só existe no servidor. Com só ela
   preenchida, o SSR mostraria um formulário que o navegador não mostra (e que não funcionaria, porque o
   SDK do navegador só enxerga `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`). Criei
   `apps/app/shared/lib/emulatorSignIn.ts` (`isEmulatorSignInEnabled`), no mesmo molde de
   `storageEnabled.ts`, lendo `env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`.
3. **`isSameGithubIdentity` mora em `user-merge.ts`, não em `github-identity.ts`.** `github-identity.ts`
   importa a Identity Toolkit, que puxa `@repo/auth/keys` e o `server-only`; três suítes que importam
   `user-merge` (`mergedUserPayload`, `userMergeArchivedProfile`, `welcomeNotification`) passaram a quebrar
   no import. A comparação é pura e só depende do schema do contrato.
4. **Docs que afirmavam Google além das três do plano.** Corrigi também `docs/ARCHITECTURE.md` (linha do
   login), `docs/board/ACCESS.md` (identidade e formato do perfil), `docs/board/README.md` e
   `docs/board/DECISIONS.md` (linha "Identidade"). Em `docs/SETUP.md`, além do plano, acrescentei o aviso
   de que a conta criada pelo `create-dev-admin --allow-real-project` não entra num projeto real, e como
   usar o popup no emulador. Em `docs/SECURITY.md`, a frase "o único host externo que o `img-src` deixa
   aparecer" ficou falsa com o avatar do GitHub e foi reescrita.
5. **Comentário do `apps/api/.env.example`** sobre o `FIREBASE_WEB_API_KEY` citava "Google"; agora cita a
   leitura da conta no login com GitHub.

Nenhuma decisão do plano estava errada no mérito; os desvios 1 e 2 corrigem lacunas de implementação.

## Blueprint → arquivos

| Item | Arquivos |
|------|----------|
| Contrato da identidade | `packages/kanban-contract/src/identity.ts` (novo), `src/index.ts`, `__tests__/identity.test.ts` (novo) |
| SDK | `packages/sdk/package.json` (+ `@repo/kanban-contract`), `src/types/user/user.ts` (`github?`), `src/actions/auth/action.ts` (sai `signInWithGoogle` e tipos `GoogleSignIn*`; entra `signInWithGithub`, `GithubSignInRequest/Response`), `pnpm-lock.yaml` |
| Filtro de método | `packages/auth/sign-in-method.ts` (novo), `package.json` (export `./sign-in-method`), `session.ts` (`sign-in-method-disabled`), `session-routes.ts` (403), `__tests__/signInMethod.test.ts` (novo) |
| Google fora do pacote `auth` | `packages/auth/client.ts` (sai `signInWithGoogle`), `provider.tsx` (sai a mutation) |
| Identity Toolkit | `apps/api/(shared)/lib/firebase-identity-toolkit.ts` (sai Google e `parseIdpResponse`; entra `identityLookupProvider`) |
| Leitura da identidade | `apps/api/(shared)/lib/github-identity.ts` (novo) |
| Sincronização | `apps/api/(shared)/lib/user-merge.ts` (`syncGithubIdentity`) |
| Schema | `apps/api/(shared)/validation/auth.schema.ts` (`githubSignInSchema`, `parseGithubSignIn`) |
| Rota nova | `apps/api/app/(routes)/auth/sign-in/github/route.ts` |
| Rota removida | `apps/api/app/(routes)/auth/sign-in/google/route.ts` |
| Senha fora do emulador | `apps/api/app/(routes)/auth/sign-in/route.ts` (403 antes de ler o corpo) |
| Credencial da API | `apps/api/(shared)/lib/resolve-api-actor.ts` (`asCredential` filtra o método) |
| Rate limit | `apps/api/proxy.ts` (`/auth/sign-in/github` na lista estrita) |
| Cliente do popup | `apps/app/shared/lib/githubSignInApi.ts` (novo), `googleSignInApi.ts` (removido), `shared/lib/emulatorSignIn.ts` (novo) |
| Tela | `apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx` |
| Menu e CSP | `apps/app/shared/components/ui/ProfileDropdown.tsx` (`@login`), `apps/app/proxy.ts` (`GITHUB_AVATAR_ORIGIN`, comentário do `frameSrc`) |
| i18n | `translations/apps/app/pages/signIn/index.ts`, `translations/packages/auth/index.ts`, `translations/packages/shared/utils.ts` |
| E2E | `apps/e2e/tests/githubSignIn.spec.ts` (novo, não executado) |
| Docs | `docs/PRE-PRODUCTION.md` (item 4 reescrito, ordem da primeira ida), `docs/SETUP.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/board/{ACCESS,README,DECISIONS}.md`, `apps/api/.env.example` |

## Contrato

- `UserDTO.github?: GithubIdentity | null`. `AccountDTO` herda, então `GET /account` passa a trazer o
  campo sem mudança na rota. Consumidor novo: `ProfileDropdown`.
- `AuthActions.signInWithGithub({ idToken }) → { user: AuthMePayload }`. Consumidor: `githubSignInApi.ts`.
- Saíram `AuthActions.signInWithGoogle`, `GoogleSignInRequest/Session/Response`, `signInWithGoogle` do
  `@repo/auth/client` e do contexto do `AuthProvider`. `git grep -i signInWithGoogle -- apps packages` não
  encontra mais nada.
- `@repo/kanban-contract` exporta `githubLoginSchema`, `githubIdentitySchema`, `GithubIdentity`.

## Códigos de erro novos

| Código | Status | Onde |
|--------|--------|------|
| `AUTH_SIGN_IN_METHOD_DISABLED` | 403 | rota GitHub (método diferente de `github.com`), `POST /auth/sign-in` fora do emulador, `/api/auth/session` com método recusado |
| `AUTH_GITHUB_PROFILE_UNAVAILABLE` | 502 | lookup falhou, sem `github.com`, `rawId` diferente da claim, `screenName` ausente ou fora do formato |

Os dois estão em `apiErrors`. Também entrou `auth/account-exists-with-different-credential` na tradução de
erros do Firebase. `apiErrorCodesTranslated` passa (ver Validação).

## Validação

Medido nesta etapa, com cache do turbo e sem `--force`:

- `pnpm turbo run typecheck` em `@repo/kanban-contract`, `@repo/sdk`, `@repo/auth`,
  `@repo/internationalization`, `api`, `app`, `e2e`: 7/7 tarefas com sucesso.
- `pnpm check`: 680 arquivos, nenhum erro.
- `pnpm turbo run test` nos mesmos workspaces (12 tarefas com as dependências): todas passam. Números:
  `api` 78 arquivos / 892 testes; `app` 92 / 667; `@repo/auth` 14 / 206; `@repo/kanban-contract` 4 / 41;
  `@repo/sdk` 1 / 9; `@repo/internationalization` 5 / 35; `e2e` (Vitest) 2 / 16.
- `apiErrorCodesTranslated` (dentro da suíte da `api`): passa com os dois códigos novos.

O que os unitários provam, com o arquivo:

- Senha aceita só no emulador e recusada fora: `packages/auth/__tests__/signInMethod.test.ts` (função),
  `sessionRoutesAuthority.test.ts` (`sessionPOST` com token de senha fora do emulador → 403, sem cookie;
  dentro → 200 com cookie), `apps/api/__tests__/resolveApiActorSession.test.ts` (bearer e cookie de senha
  fora do emulador → anônimo; dentro → usuário; Google recusado mesmo no emulador; `github.com` e `custom`
  aceitos) e `authSignInRoute.test.ts` (403 fora do emulador sem chamar a toolkit; os casos antigos rodam
  com o host do emulador setado).
- Rota nova: `apps/api/__tests__/authSignInGithubRoute.test.ts` (primeiro login cria o perfil e grava
  `github`; login mudado atualiza; sem mudança não escreve; `login` no corpo é ignorado; 400, 401, 403
  para `password`/`google.com`/`custom`, 502 nos quatro casos de identidade inválida e na falha da
  toolkit, 404 para perfil arquivado). Os casos do antigo `googleSignInProfile.test.ts` (criação única,
  arquivado → 404) migraram para cá.
- `apps/api/__tests__/firebaseIdentityLookup.test.ts`: URL de produção e do emulador, corpo `{ idToken }`,
  escolha por `providerId`, erro vira `IdentityToolkitError`, sem chave em produção não chama `fetch`.
- `apps/app/__tests__/githubSignInApi.test.ts`: só o ID token do Firebase vai para a API e para o cookie
  (o access token do fixture não aparece em nenhuma chamada); recusa da API faz `signOut` e
  `DELETE /api/auth/session`; conta nova reportada antes da troca.
- `apps/app/__tests__/signInForm.test.tsx`: sem o host (ausente ou vazio), só o botão e as notas, nenhum
  `input[name=email|password]`; com o host, botão e formulário sob "Acesso de teste (emulador)".
- `profileDropdownAccount.test.tsx`: `@octocat` no lugar do e-mail quando há `github`; e-mail quando não há.
- `securityHeaders.test.ts`: `img-src` contém `https://avatars.githubusercontent.com`.

Fixtures ajustados por causa do filtro (claim `firebase.sign_in_provider: "github.com"` acrescentada,
nenhuma asserção mudou): `sessionAbsoluteCap`, `sessionOrigin`, `sessionRefreshRoute`,
`sessionRoutesAuthority` (pacote `auth`) e `resolveApiActorSession` (API). `serverSessionRevocation`,
`serverErrorLogging`, `sessionKey` e `sessionTracker` não passam pelo filtro e não precisaram de ajuste.

Testes removidos com o código que testavam: `apps/api/__tests__/authSignInGoogleRoute.test.ts`,
`authSignInGoogleToolkit.test.ts`, `googleSignInProfile.test.ts`, `apps/app/__tests__/googleSignInApi.test.ts`
e o caso "desloga sem navegar quando a sessão do login com Google é recusada" de
`authProviderSessionNotEstablished.test.tsx` (o equivalente para o GitHub está em `githubSignInApi.test.ts`).
Os mocks de `signInWithGoogle` saíram de `postLoginFullPageNavigation` e `sessionExpiredSignOut`;
`authFormsPersistedSessionRedirect` e `signInEnterResubmit` passaram a mockar o GitHub e a ligar o
formulário de teste.

Smoke local: não rodei. Nenhum processo estava nas portas 3000, 3002 e 9099 (`lsof -ti tcp:<porta>` vazio),
e subir emulador, API e app com a máquina carregada não traria nada que os unitários e o E2E não cubram.

## A verificar no `/test`

Nenhuma destas afirmações foi medida em runtime:

- **Popup do emulador de ponta a ponta.** `pnpm e2e` com `apps/e2e/tests/githubSignIn.spec.ts`: login cai
  em `/pt-br` e o menu mostra `@e2e-octocat`; screen name `-bad` mostra o texto de
  `AUTH_GITHUB_PROFILE_UNAVAILABLE`, fica em `/pt-br/sign-in` e não há cookie `access-token`. Os seletores
  do popup são ids do HTML do `firebase-tools` 15.30.1 (`#email-input`, `#display-name-input`,
  `#screen-name-input`, `#sign-in`) e o botão "Add new account" por papel. Se a versão mudar, quebram.
- **`github.id` gravado só com dígitos e `github.login` igual ao screen name** no Firestore do emulador
  (`localhost:4000/firestore`, coleção `user`).
- **Claim `firebase.identities["github.com"][0]` igual ao `rawId` do lookup no emulador.** A rota depende
  disso; se o emulador montar a claim de outro jeito, todo login cai em 502. O E2E acima denuncia.
- **Tela em light, dark e mobile (390 px):** contraste das notas, botão com largura total, separador do
  emulador sobre `bg-card`.
- **Login por senha no emulador continua entrando** (`user@example.com` / senha do seed): o `signIn.spec.ts`
  existente cobre; rodar a suíte.
- **Tela sem emulador:** build do app com `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=""`. Só há prova por
  unitário (`signInForm.test.tsx`).
- **Login atualizado em produção quando muda no GitHub (risco R1):** sem medição possível antes do OAuth
  App existir. Passo de verificação registrado no item 4 do `PRE-PRODUCTION.md`.

## Decisões em aberto e pendências

- Perguntas 1 a 4 do plano continuam como estavam (sem organização obrigatória; `POST /users` fica;
  seção de troca de senha fica para conta GitHub; seed sem conta GitHub). O `PRE-PRODUCTION.md` agora diz
  que a conta criada por `POST /users` não entra com Email/Password desligado.
- **Arquivos de instrução com texto desatualizado que não editei**, porque são configuração do agente e
  pedem a sua decisão: `CLAUDE.md` (linhas 9 e 31 dizem que o login é e-mail/senha e Google até a
  `github-sign-in`), `AGENTS.md:58` e `apps/app/CLAUDE.md:89-90` (citam "Google" no fluxo pós-login; o
  comportamento descrito vale igual para o GitHub). `docs/board/ROADMAP.md:56` também diz "hoje o login é
  e-mail/senha e Google"; fica para o `/spec --sync`.
- Nenhum bloqueio.

## Separar os commits

Os hunks desta tarefa nos arquivos compartilhados com a `github-app-integration`:

- `packages/internationalization/translations/packages/shared/utils.ts`: as duas entradas logo abaixo de
  `AUTH_INVALID_CREDENTIALS` são desta tarefa; o bloco `GITHUB_*` é da outra.
- `docs/PRE-PRODUCTION.md`: o item 4 e a palavra "GitHub" na ordem da primeira ida são desta tarefa; o
  item 5 é da outra.
- `apps/api/.env.example`: só a linha do comentário do `FIREBASE_WEB_API_KEY` é desta tarefa.
- `pnpm-lock.yaml`: o link `@repo/kanban-contract` em `packages/sdk` é desta tarefa; o da `apps/api` é da
  outra.
- As remoções (`google/route.ts`, `googleSignInApi.ts` e os testes) estão só no working tree; o índice está
  vazio.
