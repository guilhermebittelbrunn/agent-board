# Plano: login com GitHub

Spec: [`specs/features/github-sign-in.md`](../../../../specs/features/github-sign-in.md) (status `proposed`,
executada a pedido do usuário dentro do `/cycle`; a aprovação continua com ele). Roda na mesma branch da
`github-app-integration`, que está implementada e ainda não commitada no working tree.

## Etapa 1: análise

### 1. Contexto

Quem usa o board entra com a conta do GitHub. O perfil guarda o id numérico do GitHub (chave estável), o
`login`, o nome e o avatar, e o `login` é reescrito a cada entrada. E-mail/senha e Google somem da tela e
passam a ser recusados pelo servidor fora do emulador.

**Objetivos (corte de MVP da spec, sem alteração):**

1. Tela de login com um único botão "Entrar com GitHub".
2. Primeiro login grava `github.id`, `github.login`, `github.name` e `github.avatarUrl` no perfil.
3. A cada login o servidor relê a identidade e atualiza o que mudou (o `login` pode mudar no GitHub).
4. E-mail/senha e Google indisponíveis.
5. Sessão por cookie e guards continuam como estão.

**Fora do escopo:** permissão por repositório (`board-members`), restringir a uma organização,
convites, tela de conta adaptada ao GitHub (a seção de troca de senha continua lá e responde
`400 ACCOUNT_PASSWORD_UNSUPPORTED` para conta GitHub, `apps/api/app/(routes)/account/password/route.ts:33`),
criação de usuário pelo admin (`POST /users`, que cria conta com e-mail e senha) e conta GitHub no seed.

**Apps impactados:** `packages/kanban-contract` (formato da identidade), `packages/auth` (provedor, filtro
de método de login), `packages/sdk` (tipo e action), `apps/api` (rota de sincronização, filtro no
credential, rota de senha fechada fora do emulador), `apps/app` (tela, CSP, menu de perfil),
`packages/internationalization`, `apps/e2e` (teste novo do popup no emulador).

**Área do painel:** pré-sessão (`(unauthenticated)/sign-in`). O menu de perfil é comum aos dois painéis.

**Papel no board:** N/A. Nenhuma rota de board nasce aqui; o `login` gravado é o que a `board-members` vai
usar em `getCollaboratorRole(repo, username)` (`apps/api/(shared)/lib/github/github-client.ts`).

**Dependências externas:** Firebase Auth com o provedor GitHub (OAuth App do GitHub ligado ao projeto).
Nenhuma variável de ambiente nova e nenhuma dependência npm nova: `GithubAuthProvider` já vem no
`firebase/auth` que o `packages/auth/client.ts:3` importa.

### 1.1 Fontes lidas

| Fonte | O que mudou no plano |
|-------|----------------------|
| Spec `github-sign-in` | Corte, riscos do emulador e do E2E, recomendação de manter e-mail/senha no emulador |
| `specs/reference/AUDIT.md` A1 e A4 | Confirmam que o pipeline depende do login por senha no emulador |
| `docs/board/ACCESS.md#identidade` | `GithubAuthProvider`; perfil `githubId` + `login` + nome + avatar |
| `docs/design/screens/Login.dc.html` | Título "Entrar", subtítulo, botão "Entrar com GitHub" e duas notas (permissão; token não guardado) |
| `docs/PRE-PRODUCTION.md` item 4 | Hoje pede o provedor Google; vai trocar pelo GitHub |
| [Emulador do Auth](https://firebase.google.com/docs/emulator-suite/connect_auth) (coletado 2026-11-25) | Popup de GitHub servido pelo emulador; `signInWithCredential` só com id token JWT ou JSON falso |
| `firebase-tools` `src/emulator/auth/operations.ts` e `widget_ui.ts`, branch `master` (coletado 2026-11-25; o repo fixa `15.30.1`, `package.json:34`) | `signInWithIdp` com `access_token` de `github.com` lança `NotImplementedError("The Auth Emulator does not support github.com sign-in with credentials")`. O popup falso tem o campo "Screen name", gravado como `screen_name` e depois em `providerUserInfo.screenName`; em login repetido o emulador faz `upsertProviders` com o valor novo |
| [ProviderUserInfo da Identity Toolkit](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/ProviderUserInfo) (coletado 2026-11-25) | `screenName`: "The user's screenName at Twitter or login name at GitHub"; `rawId`: identificador vindo do provedor |
| [`accounts:lookup`](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup) (coletado 2026-11-25) | Usuário final consulta a própria conta mandando `idToken`, sem credencial de serviço |

Referências não lidas: o artboard em `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt` (li o export local em
`docs/design/screens/Login.dc.html`, que é a mesma tela).

### 1.2 Como o login Google funciona hoje, e por que o GitHub não pode copiar

`apps/app/shared/lib/googleSignInApi.ts:32` abre o popup do Firebase, pega o id token do **Google**
(`credentialFromResult`, linha 58) e manda para `POST /auth/sign-in/google`
(`apps/api/app/(routes)/auth/sign-in/google/route.ts:17`), que chama `accounts:signInWithIdp` com
`id_token=...&providerId=google.com` (`apps/api/(shared)/lib/firebase-identity-toolkit.ts:204-220`) e
devolve uma sessão nova. O popup já tinha logado o cliente; a troca na API gera um segundo login.

O GitHub não emite id token, só access token OAuth. Repetir o desenho mandaria
`access_token=...&providerId=github.com` para o `signInWithIdp`, e o emulador recusa exatamente esse caso
(fonte acima, agora medida no código do emulador e não só inferida pela doc). Além disso, o desenho
obrigaria o access token do GitHub a trafegar até a API, o que a spec pede para evitar.

**Desenho adotado:** o cliente faz o popup (funciona no emulador) e manda para a API só o **ID token do
Firebase**. A API verifica o token, confere que o método de entrada foi `github.com` e lê a identidade com
`accounts:lookup` usando o próprio ID token: `providerUserInfo[github.com]` traz `rawId` (id numérico),
`screenName` (login), `displayName` e `photoUrl`. É a mesma chamada no emulador e em produção, sem access
token do GitHub, sem chamada à API do GitHub e sem dependência nova.

### 1.3 Mapa de cada dado exigido até a origem

| Dado | Origem | Confiável? |
|------|--------|------------|
| `github.id` | Claim `firebase.identities["github.com"][0]` do ID token verificado, conferido com `providerUserInfo.rawId` do lookup | Sim, assinado pelo Firebase (no emulador o token não é assinado e só o Admin SDK em modo emulador aceita) |
| `github.login` | `providerUserInfo.screenName` do `accounts:lookup` | Sim, vem do Firebase. Não vem do cliente: o login decide permissão em repositório na `board-members`, então aceitar o valor do navegador seria escalonamento |
| `github.name` | `providerUserInfo.displayName` | Sim; pode ser `null` |
| `github.avatarUrl` | `providerUserInfo.photoUrl` (`https://avatars.githubusercontent.com/u/<id>?v=4` em produção) | Sim; pode ser `null` |
| Nome e foto exibidos no menu | Registro do Firebase Auth (`displayName`, `photoURL`), que o Firebase preenche com os dados do provedor na criação da conta; `ProfileDropdown.tsx:34-36` já cai nele | Já existe |

### 2. Dados (Firestore)

#### 2.1 Coleção e documento

Coleção `user` (`apps/api/(shared)/repositories/user.repository.ts:24`). Campo novo, aninhado:

| Campo | Tipo | Default | `null`? | Por quê |
|-------|------|---------|---------|---------|
| `github` | `GithubIdentity` (`{ id: string; login: string; name: string \| null; avatarUrl: string \| null }`) | ausente | ausente em perfil antigo e em conta de senha do emulador | Identidade do GitHub da pessoa; `id` é a chave estável |

O `id` fica como string de dígitos (é o `rawId` da Identity Toolkit, string; no emulador é um número
aleatório de 40 dígitos). O campo `avatar` existente (foto escolhida pela pessoa, `UserDTO.avatar`) não
é tocado: o avatar do GitHub vive em `github.avatarUrl` e o menu já usa o `photoURL` do Firebase como
fallback.

Ownership: o perfil é da própria pessoa (`reference_id` = uid). Soft delete: `getMergedUserByUid` devolve
`null` para perfil arquivado (`apps/api/(shared)/lib/user-merge.ts:54-70`), e a rota responde como a do
Google hoje (`404 USERS_NOT_FOUND`).

#### 2.2 Consultas

Nenhuma nova. A busca por `github.login` ou `github.id` (convite por login) é da `board-members`, que deve
comparar login sem diferenciar maiúsculas (o GitHub não diferencia). O formato aqui não impede isso.

#### 2.3 Dados existentes

Perfis do seed (senha) ficam sem `github`. Nada a migrar: produção ainda não tem usuário.

### 3. Contrato

**`@repo/kanban-contract` (regra 12):** `src/identity.ts` com `githubLoginSchema`, `githubIdentitySchema` e
o tipo `GithubIdentity`, exportados pelo `index.ts`. É o formato que `board-import` e `board-members` vão
ler, então mora no pacote do domínio do board.

**`@repo/sdk`:**

- `UserDTO` ganha `github?: GithubIdentity | null` (`packages/sdk/src/types/user/user.ts:15`). Como
  `AccountDTO` estende `UserWithAuthDTO`, que estende `UserDTO`, o `GET /account` passa a trazer o campo
  sem mudança na rota (`mergeAuthAndFirestore` espalha o perfil, `user.mapper.ts:61-70`).
- `packages/sdk/package.json` ganha `"@repo/kanban-contract": "workspace:*"` (link de workspace, nenhum
  pacote externo; mesmo movimento que a `github-app-integration` fez na `apps/api`).
- `AuthActions` (`packages/sdk/src/actions/auth/action.ts`): sai `signInWithGoogle` e os tipos
  `GoogleSignIn*`; entra `signInWithGithub({ idToken }) → { user: AuthMePayload }`.
- `AuthMePayload` não muda (a allow-list fica como está; o login aparece pela conta).

Quem quebra: `apps/app/shared/lib/googleSignInApi.ts` (sai) e os testes que mockam
`signInWithGoogleViaApi` (seção 7).

### 4. API

#### 4.1 Rotas e guard

| Rota | Método | Guard | O que faz |
|------|--------|-------|-----------|
| `/auth/sign-in/github` (nova) | POST | nenhum (pré-sessão, como a do Google); verifica o ID token por dentro | Confere o método `github.com`, lê a identidade, cria ou atualiza o perfil, devolve `{ user }` |
| `/auth/sign-in/google` | POST | | **Sai** |
| `/auth/sign-in` (senha) | POST | | Fora do emulador responde `403 AUTH_SIGN_IN_METHOD_DISABLED` antes de chamar a Identity Toolkit |

`apps/api/proxy.ts:55-60`: troca `/auth/sign-in/google` por `/auth/sign-in/github` em
`STRICT_RATE_LIMITED_PATHS` (cada chamada gasta cota da Identity Toolkit).

#### 4.2 Filtro de método de login (servidor)

Novo `packages/auth/sign-in-method.ts`:

```ts
import { isEmulated } from "./emulator";

const ALWAYS_ACCEPTED = new Set(["github.com", "custom"]);
const EMULATOR_ONLY = new Set(["password"]);

export function isAcceptedSignInMethod(provider: string | undefined): boolean {
    if (!provider) {
        return false;
    }
    if (ALWAYS_ACCEPTED.has(provider)) {
        return true;
    }
    return isEmulated() && EMULATOR_ONLY.has(provider);
}
```

`custom` fica aceito porque a adoção da sessão entre apps (`customTokenPOST`,
`packages/auth/session-routes.ts:198`, e `bootstrapFromSessionCookie`, `provider.tsx:191`) troca o cookie
por um custom token, e o ID token resultante tem `sign_in_provider: "custom"`. O servidor só emite custom
token a partir de um cookie de sessão válido, que por sua vez só nasce de método aceito.

Aplicado em dois pontos, os que **criam ou aceitam** credencial:

1. `mintSessionCookie` (`packages/auth/session.ts:148`): depois de `verifyIdTokenClaims`, se
   `!isAcceptedSignInMethod(claims.firebase?.sign_in_provider)` devolve
   `{ ok: false, reason: "sign-in-method-disabled" }`, e `mintFailureResponse`
   (`session-routes.ts:83`) mapeia para `403 AUTH_SIGN_IN_METHOD_DISABLED`. Sem cookie, o proxy do app
   não deixa entrar em página autenticada.
2. `resolveFirebaseCredential` (`apps/api/(shared)/lib/resolve-api-actor.ts:29`): credencial cujo
   `claims.firebase.sign_in_provider` não é aceito vira `null` (anônimo → `401 AUTH_INVALID_TOKEN` nos
   guards). O cookie de sessão herda o claim do ID token de origem, então os dois transportes passam pelo
   mesmo teste.

O bloqueio primário em produção continua sendo desligar os provedores no Firebase Console (seção 11); o
código é a segunda barreira, exigida pela regra de ouro 4.

#### 4.3 Validação na borda

`auth.schema.ts`: sai `googleSignInSchema`/`parseGoogleSignIn`; entra
`githubSignInSchema = z.object({ idToken: z.string().min(1).max(ID_TOKEN_MAX) })` com
`ID_TOKEN_MAX = 4096` (mesmo teto de `session-routes.ts:23`) e `parseGithubSignIn`.

A identidade lida do Firebase também passa por `githubIdentitySchema` antes de ir ao Firestore: login fora
do formato do GitHub (possível no emulador, onde o "Screen name" é texto livre) vira erro em vez de dado
gravado.

#### 4.4 Persistência

`firebase-identity-toolkit.ts`: sai `identitySignInWithGoogleIdToken` e o `parseIdpResponse` que só ela
usa; entra `identityLookupProvider(idToken, providerId)` que chama
`POST ${base()}/accounts:lookup?key=${key}` com `{ idToken }` e devolve o `providerUserInfo` daquele
provedor (ou `null`). Usa o `base()` e o `getWebApiKey()` que já tratam o emulador (linhas 11-16 e 39-52).

`user-merge.ts`: nova `syncGithubIdentity(profile, identity)` que só escreve quando algum dos quatro campos
difere do gravado (`userRepository.update({ id, github })`; o `update` do `BaseRepository` carimba
`updatedAt`, `base.repository.ts:207-219`, por isso a escrita condicional). Login repetido sem mudança no
GitHub não gera escrita.

#### 4.5 Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `VALIDATION_FAILED` | 400 | Corpo inválido (existente) |
| `AUTH_INVALID_TOKEN` | 401 | ID token inválido, expirado ou de conta desativada (existente) |
| `AUTH_SIGN_IN_METHOD_DISABLED` (novo) | 403 | Token de método que não é `github.com` na rota nova; `/auth/sign-in` fora do emulador; `/api/auth/session` com método recusado |
| `AUTH_GITHUB_PROFILE_UNAVAILABLE` (novo) | 502 | `accounts:lookup` falhou, não trouxe `github.com`, `rawId` diverge da claim, ou `screenName` ausente ou fora do formato |
| `USERS_NOT_FOUND` | 404 | Perfil arquivado (existente, mesmo comportamento do Google) |

`HTTP_STATUS.BAD_GATEWAY` já existe (acrescentado pela `github-app-integration` em
`packages/shared/utils/helpers/httpStatus.ts`). As duas entradas novas vão para `apiErrors`.

### 5. Front-end

#### 5.1 Rotas e renderização

Sem rota nova. `sign-in/page.tsx` continua Server Component; `SignInForm` continua client.

#### 5.2 Dados

`apps/app/shared/lib/githubSignInApi.ts` substitui `googleSignInApi.ts` e mantém o mesmo esqueleto
(popup, `isNewAccount` antes da troca, `signOut` se a API recusar, cookie por `/api/auth/session`,
`setAuthorizationHeader`). Diferenças: `new GithubAuthProvider()` sem escopo extra, `idToken` vem de
`result.user.getIdToken()` e nada do `credentialFromResult` é lido (o access token do GitHub nunca sai do
SDK do Firebase).

`packages/auth/client.ts`: sai `signInWithGoogle`; `signIn` (senha) fica, usado só no emulador.
`packages/auth/provider.tsx`: sai a mutation `signInWithGoogle` do contexto (linhas 39, 395-400, 422).

#### 5.3 Tela

Conforme `docs/design/screens/Login.dc.html`:

- Título "Entrar" (já é `meta.title`), subtítulo novo, botão `Button` primário "Entrar com GitHub" com o
  ícone `FaGithub` de `react-icons/fa` (o pacote já é dependência, `SignInForm.tsx:21` usa `react-icons/fc`),
  e as duas notas em `text-muted-foreground text-sm`.
- O formulário de e-mail/senha só renderiza quando `authEmulatorOrigin()` (de `@repo/auth/emulator`) é
  verdadeiro, abaixo de um separador com o rótulo "Acesso de teste (emulador)". `NEXT_PUBLIC_*` é
  embutido no build, então servidor e cliente decidem igual e não há diferença de hidratação. Os rótulos do
  formulário não mudam, e assim `apps/e2e/support/signIn.ts:12-19` continua achando os campos.
- Erro do popup ou da API: `errorAlert(handleClientError(new FormattedError(error, locale)))`, como hoje.

Sem `brainstorming`: a tela já tem referência visual aprovada no `docs/design/`.

#### 5.4 Menu de perfil e CSP

- `ProfileDropdown.tsx:35`: a segunda linha mostra `@${account.github.login}` quando existe, senão o
  e-mail. É onde o sinal de pronto "aparece com avatar e `login` corretos" fica visível.
- `apps/app/proxy.ts:68-74`: `imgSrc` ganha `https://avatars.githubusercontent.com` (constante
  `GITHUB_AVATAR_ORIGIN`). O `AvatarImage` é `<img>` do Radix, não `next/image`, então o
  `next.config.ts` não muda.
- `GOOGLE_AVATAR_ORIGIN` fica: `EXTERNAL_IMAGE_HOSTS` da API (`entity-photo.ts:20`) ainda aceita URL do
  Google para foto de entidade e avatar gravados. Tirar é outra tarefa.
- O comentário de `frameSrc` (`proxy.ts:75-76`) cita o fluxo do Google; o iframe de relay é do Firebase e
  vale para qualquer popup, então o texto troca "Google sign-in" por "popup sign-in".

### 5.5 i18n

Seção 10.8.

### 6. Autorização e segurança

- **Token do GitHub:** não é lido, não trafega e não é gravado. A API só vê o ID token do Firebase.
- **Login forjado:** o `login` vem do Firebase (`accounts:lookup`), nunca do corpo da requisição.
- **Métodos desligados:** filtro no cookie e no credential da API (4.2), mais `/auth/sign-in` fechado fora
  do emulador. O emulador continua aceitando senha para seed, E2E e `/test`.
- **Emulador em produção:** o filtro depende de `isEmulated()`. Um deploy com `FIREBASE_AUTH_EMULATOR_HOST`
  setado já seria um defeito grave por si (o Admin SDK passaria a falar com o emulador); o filtro não piora
  esse caso.
- **Impersonação:** N/A. O filtro roda no credential do ator; a personificação por header
  (`resolveAuthRequestContext`) vem depois e não muda.
- **Rate limit:** a rota nova entra no orçamento estrito (4.1).
- **Admin:** quem entra pelo GitHub vira `UserType.COMMON` (`user-merge.ts:77-80`). O primeiro admin de
  produção precisa ter `type: "admin"` gravado à mão no Firestore (seção 11).

### 7. Testes

Todos unitários (Vitest), exceto o E2E do popup.

| Teste | Nível | Prova |
|-------|-------|-------|
| `packages/kanban-contract/__tests__/identity.test.ts` | schema | Login válido (`octocat`, `a-b`, 39 caracteres) passa; hífen inicial, hífen duplo, 40 caracteres e espaço falham; `id` só dígitos |
| `packages/auth/__tests__/signInMethod.test.ts` | unitário | `github.com` e `custom` aceitos sempre; `password` só com `FIREBASE_AUTH_EMULATOR_HOST`; `google.com` e ausente recusados |
| `packages/auth/__tests__/sessionRoutesAuthority.test.ts` (estender) | rota com mock | `sessionPOST` com token `password` fora do emulador → `403 AUTH_SIGN_IN_METHOD_DISABLED` e nenhum cookie; com `github.com` → 200 |
| `apps/api/__tests__/authSignInGithubRoute.test.ts` (novo) | rota com `vi.mock` de `@repo/auth/server`, toolkit e repositório | Caminho feliz cria perfil e grava `github`; segundo login com login novo atualiza; sem mudança não escreve; método `password` → 403; lookup sem `screenName` → 502; `rawId` divergente → 502; perfil arquivado → 404; corpo inválido → 400 |
| `apps/api/__tests__/firebaseIdentityLookup.test.ts` (novo) | unitário com `fetch` mockado | URL do emulador × produção, corpo `{ idToken }`, escolha do `providerUserInfo` por `providerId`, erro da toolkit vira `IdentityToolkitError` |
| `apps/api/__tests__/resolveApiActorSession.test.ts` (estender) | unitário | Bearer com `sign_in_provider: "password"` fora do emulador → anônimo |
| `apps/api/__tests__/authSignInRoute.test.ts` (ajustar) | rota | Fora do emulador → 403 sem chamar a toolkit; os casos atuais passam a rodar com `FIREBASE_AUTH_EMULATOR_HOST` setado no teste |
| `apps/app/__tests__/githubSignInApi.test.ts` (substitui `googleSignInApi.test.ts`) | unitário com mocks de `firebase/auth` e SDK | Manda o ID token do Firebase, nunca o access token; `signOut` quando a API recusa; `onAccountCreated` antes da troca |
| `apps/app/__tests__/signInForm.test.tsx` (novo) | componente | Sem emulador: só o botão do GitHub, nenhum campo de e-mail; com emulador: botão + formulário |
| `apps/e2e/tests/githubSignIn.spec.ts` (novo) | E2E Playwright | Ver abaixo |

Fixtures de token decodificado nos testes do `packages/auth` e da API que passam por `mintSessionCookie` ou
`resolveFirebaseCredential` precisam ganhar `firebase: { sign_in_provider: "github.com", identities: {} }`.
Arquivos afetados, pelo `git grep verifyIdToken`: `sessionAbsoluteCap`, `sessionOrigin`,
`sessionRefreshRoute`, `sessionRoutesAuthority`, `serverSessionRevocation`, `serverErrorLogging` (pacote) e
`resolveApiActorSession`, `sessionKey`, `sessionTracker` (API). O desenvolvedor confirma quais quebram de
fato; asserção nenhuma é afrouxada.

Removidos com o código que testam: `googleSignInApi.test.ts`, `authSignInGoogleRoute.test.ts`,
`authSignInGoogleToolkit.test.ts`. `googleSignInProfile.test.ts`: ler antes; se o que ele prova é a criação
de perfil no primeiro login, o caso migra para `authSignInGithubRoute.test.ts`. Ajustados por citarem o
Google: `authFormsPersistedSessionRedirect`, `authProviderSessionNotEstablished` (o caso "desloga sem
navegar quando a sessão do login com Google é recusada" passa a cobrir o GitHub em
`githubSignInApi.test.ts`), `postLoginFullPageNavigation`, `sessionExpiredSignOut`, `signInEnterResubmit` e
`corsOrigin.test.ts:429` (lista de caminhos estritos).

**E2E do popup (`githubSignIn.spec.ts`).** O objeto do teste é a infra: o popup falso do emulador, o
`accounts:lookup` devolvendo o `screenName` e o filtro de método aceitando `github.com` de ponta a ponta. O
unitário mocka exatamente essas três coisas, então não prova nenhuma delas. Fluxo: contexto sem
`storageState`, `page.waitForEvent("popup")` ao clicar "Entrar com GitHub", no popup "Add new account",
preencher e-mail (`gh-e2e-<timestamp>@example.com`), display name e screen name (`e2e-octocat`), confirmar,
esperar `/${LOCALE}`, abrir o menu de perfil e ver `@e2e-octocat`. Os seletores do popup dependem do HTML do
`firebase-tools` (fixado em `15.30.1`); se o desenvolvedor não achar seletor estável por papel ou texto, o
teste fica e a dependência vai registrada no handoff.

### 8. O que o `/test` vai percorrer

Stack local com emulador (`pnpm emulators`, `pnpm seed`, `pnpm dev`).

| Fluxo | Como produzir | O que medir |
|-------|---------------|-------------|
| Tela de login no emulador | Abrir `/pt-br/sign-in` | Botão "Entrar com GitHub", as duas notas, e o formulário sob "Acesso de teste (emulador)" |
| Primeiro login GitHub | Popup do emulador → "Add new account", screen name `qa-octocat` | Cai em `/pt-br`; menu mostra `@qa-octocat`; Firestore do emulador tem `github.login = "qa-octocat"` e `github.id` só dígitos |
| Login repetido com login novo | Sair; entrar de novo escolhendo a mesma conta no popup, mas antes trocar o screen name pela UI do emulador (`localhost:4000/auth`) ou entrar por "Add new account" com o mesmo e-mail | `github.login` atualizado. Se a UI do emulador não permitir trocar o screen name de conta existente, o critério fica 🔒 com o motivo |
| Screen name inválido | "Add new account" com screen name `-bad` | Alerta com o texto de `AUTH_GITHUB_PROFILE_UNAVAILABLE`, continua no login, sem cookie |
| Senha no emulador | `user@example.com` pelo formulário | Entra como hoje |
| Senha recusada fora do emulador | `curl` em `POST /auth/sign-in` contra a API subida sem `FIREBASE_AUTH_EMULATOR_HOST` não é viável (a API sem emulador exige projeto real); medir pelos testes unitários e registrar | 🔒 em runtime, ✅ por unitário |
| Tela sem emulador | `pnpm --filter app build` com o env do emulador vazio e abrir a página | Só o botão do GitHub. Se o build sem Firebase real não sobe, 🔒 com o motivo |
| Temas e viewport | Login em light, dark e mobile (390px) | Contraste das notas, botão com largura total, nada cortado |

Popup no `agent-browser`: o popup abre outra aba. Se o `agent-browser` não acompanhar a aba nova, o `/test`
usa a suíte `pnpm e2e` (que cobre o popup) como evidência do fluxo e registra a passada visual só da tela.

### 9. Critérios de aceite (rascunho)

1. Sem emulador, a tela de login tem só o botão "Entrar com GitHub" e nenhum campo de e-mail ou senha.
2. No emulador, a tela mostra o botão e, separado, o formulário de teste.
3. Primeiro login GitHub cria o perfil com `github.id`, `github.login`, `github.name`, `github.avatarUrl`.
4. O menu de perfil mostra `@<login>` e o avatar do GitHub (ou as iniciais quando não há foto).
5. Login repetido com `screenName` diferente atualiza `github.login`; sem mudança, não escreve.
6. A API nunca recebe o access token do GitHub (teste do `githubSignInApi` e leitura do corpo enviado).
7. Fora do emulador: `POST /auth/sign-in` → `403 AUTH_SIGN_IN_METHOD_DISABLED`; `/api/auth/session` com
   token de senha → 403; bearer de senha na API → 401.
8. `POST /auth/sign-in/google` não existe mais (404).
9. Sessão, refresh e guards continuam passando na suíte (`pnpm test`) e no `pnpm e2e`.
10. `AUTH_SIGN_IN_METHOD_DISABLED` e `AUTH_GITHUB_PROFILE_UNAVAILABLE` têm texto em `apiErrors`.

## Etapa 2: blueprint técnico

### 10.1 Árvore de arquivos

```
packages/kanban-contract/src/identity.ts                       (novo)
packages/kanban-contract/src/index.ts                          (+ export)
packages/kanban-contract/__tests__/identity.test.ts            (novo)
packages/sdk/package.json                                      (+ @repo/kanban-contract)
packages/sdk/src/types/user/user.ts                            (+ github)
packages/sdk/src/actions/auth/action.ts                        (- Google, + signInWithGithub)
packages/auth/sign-in-method.ts                                (novo)
packages/auth/session.ts                                       (mintSessionCookie)
packages/auth/session-routes.ts                                (mintFailureResponse)
packages/auth/client.ts                                        (- signInWithGoogle)
packages/auth/provider.tsx                                     (- mutation Google)
packages/auth/__tests__/signInMethod.test.ts                   (novo)
apps/api/(shared)/lib/firebase-identity-toolkit.ts             (- Google, + identityLookupProvider)
apps/api/(shared)/lib/github-identity.ts                       (novo: readGithubIdentity)
apps/api/(shared)/lib/user-merge.ts                            (+ syncGithubIdentity)
apps/api/(shared)/lib/resolve-api-actor.ts                     (filtro)
apps/api/(shared)/validation/auth.schema.ts                    (- Google, + GitHub)
apps/api/app/(routes)/auth/sign-in/github/route.ts             (novo)
apps/api/app/(routes)/auth/sign-in/google/route.ts             (removido)
apps/api/app/(routes)/auth/sign-in/route.ts                    (403 fora do emulador)
apps/api/proxy.ts                                              (caminho estrito)
apps/app/shared/lib/githubSignInApi.ts                         (novo)
apps/app/shared/lib/googleSignInApi.ts                         (removido)
apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx
apps/app/shared/components/ui/ProfileDropdown.tsx
apps/app/proxy.ts                                              (img-src, comentário do frame-src)
apps/e2e/tests/githubSignIn.spec.ts                            (novo)
packages/internationalization/translations/apps/app/pages/signIn/index.ts
packages/internationalization/translations/packages/auth/index.ts
packages/internationalization/translations/packages/shared/utils.ts
docs/PRE-PRODUCTION.md, docs/SECURITY.md, docs/SETUP.md        (docs)
```

### 10.2 Contrato (`packages/kanban-contract/src/identity.ts`)

```ts
import { z } from "zod";

// GitHub logins: 1 to 39 characters, letters, digits and single hyphens, never at either end.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const GITHUB_ID = /^\d+$/;

export const githubLoginSchema = z.string().regex(GITHUB_LOGIN);

export const githubIdentitySchema = z.object({
    id: z.string().regex(GITHUB_ID),
    login: githubLoginSchema,
    name: z.string().min(1).nullable(),
    avatarUrl: z.url({ protocol: /^https?$/ }).nullable(),
});

export type GithubIdentity = z.infer<typeof githubIdentitySchema>;
```

`avatarUrl` aceita `http` porque o emulador grava o que for digitado no popup; em produção o GitHub sempre
manda `https`.

### 10.3 SDK

```ts
// packages/sdk/src/types/user/user.ts
import type { GithubIdentity } from "@repo/kanban-contract";
export type UserDTO = {
    // ...campos atuais
    github?: GithubIdentity | null;
};

// packages/sdk/src/actions/auth/action.ts
export type GithubSignInRequest = { idToken: string };
export type GithubSignInResponse = { user: AuthMePayload };

async signInWithGithub(body: GithubSignInRequest): Promise<GithubSignInResponse> {
    const { data } = await this.client.request<GithubSignInResponse>({
        url: "/auth/sign-in/github",
        method: "POST",
        data: body,
    });
    return data;
}
```

### 10.4 Identity Toolkit (`firebase-identity-toolkit.ts`)

```ts
export type ToolkitProviderUserInfo = {
    providerId: string;
    rawId?: string;
    screenName?: string;
    displayName?: string;
    photoUrl?: string;
};

type ToolkitLookup = { users?: Array<{ providerUserInfo?: ToolkitProviderUserInfo[] }> };

export async function identityLookupProvider(
    idToken: string,
    providerId: string
): Promise<ToolkitProviderUserInfo | null> {
    const key = getWebApiKey();
    const res = await fetch(`${base()}/accounts:lookup?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
    });
    const data = await parseToolkitJson<ToolkitLookup>(res, "Account lookup failed");
    return data.users?.[0]?.providerUserInfo?.find((p) => p.providerId === providerId) ?? null;
}
```

### 10.5 Leitura da identidade (`apps/api/(shared)/lib/github-identity.ts`)

```ts
import { type GithubIdentity, githubIdentitySchema } from "@repo/kanban-contract";
import type { DecodedIdToken } from "firebase-admin/auth";
import { identityLookupProvider } from "./firebase-identity-toolkit";

export const GITHUB_PROVIDER_ID = "github.com";

export const signedInWithGithub = (claims: DecodedIdToken): boolean =>
    claims.firebase?.sign_in_provider === GITHUB_PROVIDER_ID;

export async function readGithubIdentity(
    idToken: string,
    claims: DecodedIdToken
): Promise<GithubIdentity | null> {
    const claimedId = claims.firebase?.identities?.[GITHUB_PROVIDER_ID]?.[0];
    const info = await identityLookupProvider(idToken, GITHUB_PROVIDER_ID);
    if (!(info && claimedId) || String(info.rawId) !== String(claimedId)) {
        return null;
    }
    const parsed = githubIdentitySchema.safeParse({
        id: String(info.rawId),
        login: info.screenName,
        name: info.displayName || null,
        avatarUrl: info.photoUrl || null,
    });
    return parsed.success ? parsed.data : null;
}
```

Erro de rede ou `IdentityToolkitError` no lookup sobe para a rota, que responde 502 (10.6).

### 10.6 Rota (`apps/api/app/(routes)/auth/sign-in/github/route.ts`)

```ts
export async function POST(req: Request) {
    const parsedBody = await parseRequestJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = parseGithubSignIn(parsedBody.value);
    if (!parsed.ok) return parsed.response;

    const { idToken } = parsed.value;
    const session = await getIdTokenSession(idToken);     // @repo/auth/server, rejeita conta desativada
    if (!session) return error("AUTH_INVALID_TOKEN", HTTP_STATUS.UNAUTHORIZED);
    if (!signedInWithGithub(session.decoded)) {
        return error("AUTH_SIGN_IN_METHOD_DISABLED", HTTP_STATUS.FORBIDDEN);
    }

    let identity: GithubIdentity | null;
    try {
        identity = await readGithubIdentity(idToken, session.decoded);
    } catch (e) {
        if (!(e instanceof IdentityToolkitError)) throw e;
        identity = null;
    }
    if (!identity) {
        logEvent("auth", "github-identity-unavailable", {});
        return error("AUTH_GITHUB_PROFILE_UNAVAILABLE", HTTP_STATUS.BAD_GATEWAY);
    }

    const user = await getMergedUserByUid(session.user.uid);   // cria o perfil no primeiro login
    if (!user) return error("USERS_NOT_FOUND", HTTP_STATUS.NOT_FOUND);

    await syncGithubIdentity(String(user.id), user.github, identity);
    return Response.json({ user: toSessionUser(user) });
}
```

O log não leva login, id nem token (regra do `logEvent`, que não carrega dado pessoal). Se `"auth"` não for
escopo aceito por `log.ts`, usar o que a rota do Google usa hoje via `user-merge.ts:62`.

`syncGithubIdentity(profileId, stored, next)`: compara os quatro campos e chama
`userRepository.update({ id: profileId, github: next })` só se algum diferir.

Exemplo:

```http
POST /auth/sign-in/github
{ "idToken": "<Firebase ID token>" }

200 { "user": { "uid": "abc", "type": "common", "email": "octocat@example.com", "preferences": null } }
403 { "error": { "code": "AUTH_SIGN_IN_METHOD_DISABLED" } }
502 { "error": { "code": "AUTH_GITHUB_PROFILE_UNAVAILABLE" } }
```

Documento depois do primeiro login:

```json
{
  "reference_id": "abc",
  "type": "common",
  "deletedAt": null,
  "github": { "id": "583231", "login": "octocat", "name": "The Octocat",
              "avatarUrl": "https://avatars.githubusercontent.com/u/583231?v=4" }
}
```

### 10.7 Filtro (pseudo-diff)

```diff
// packages/auth/session.ts
 export type MintSessionResult =
     | { ok: true }
-    | { ok: false; reason: "invalid-token" | "absolute-cap" };
+    | { ok: false; reason: "invalid-token" | "absolute-cap" | "sign-in-method-disabled" };
 ...
     const claims = await verifyIdTokenClaims(idToken);
     if (!claims) {
         return { ok: false, reason: "invalid-token" };
     }
+    if (!isAcceptedSignInMethod(claims.firebase?.sign_in_provider)) {
+        return { ok: false, reason: "sign-in-method-disabled" };
+    }

// packages/auth/session-routes.ts (mintFailureResponse)
+    if (minted.reason === "sign-in-method-disabled") {
+        return jsonError("AUTH_SIGN_IN_METHOD_DISABLED", HTTP_STATUS.FORBIDDEN);
+    }

// apps/api/(shared)/lib/resolve-api-actor.ts
 function asCredential(session) {
-    return session ? { user: session.user, claims: session.decoded } : null;
+    if (!(session && isAcceptedSignInMethod(session.decoded.firebase?.sign_in_provider))) {
+        return null;
+    }
+    return { user: session.user, claims: session.decoded };
 }
```

Atenção no `resolveFirebaseCredential`: hoje, se o bearer não é ID token válido, ele tenta o bearer como
cookie (`resolve-api-actor.ts:35-42`). Com o filtro dentro de `asCredential`, um bearer recusado cai
para a tentativa seguinte e termina em `null`, que é o resultado certo. `packages/auth/package.json`
exporta arquivo por arquivo (linhas 5-17), então ganha `"./sign-in-method": "./sign-in-method.ts"`.

```diff
// apps/api/app/(routes)/auth/sign-in/route.ts
 export async function POST(req: Request) {
+    if (!isEmulated()) {
+        return Response.json(
+            { error: { code: "AUTH_SIGN_IN_METHOD_DISABLED" } },
+            { status: HTTP_STATUS.FORBIDDEN }
+        );
+    }
```

### 10.8 i18n

```ts
// translations/apps/app/pages/signIn/index.ts
enterWithYourAccount: "Acompanhe e dispare o pipeline de agentes dos seus repositórios: análise, desenvolvimento, revisão, teste e PR.",
githubSignIn: "Entrar com GitHub",
permissionNote: "Você só vê e dispara o que a sua permissão no repositório permite.",
tokenNote: "O board não guarda o seu token do GitHub. Ele lê os repositórios pelo GitHub App instalado.",
emulatorAccess: "Acesso de teste (emulador)",
// saem: orContinueWith, googleSignIn

// translations/packages/auth/index.ts (firebase.error)
"auth/account-exists-with-different-credential":
    "Já existe uma conta com este e-mail usando outro método de entrada.",

// translations/packages/shared/utils.ts (apiErrors)
AUTH_SIGN_IN_METHOD_DISABLED: "Este método de entrada não está disponível. Entre com o GitHub.",
AUTH_GITHUB_PROFILE_UNAVAILABLE: "Não foi possível ler seu perfil do GitHub. Tente entrar novamente.",
```

A chave `profileDropdown` não muda: `@login` é dado, não texto de UI.

### 10.9 Front (`SignInForm.tsx`, esboço)

```tsx
const showEmulatorAccess = Boolean(authEmulatorOrigin());

const githubSignIn = useMutation({
    mutationFn: () => signInWithGithubViaApi({
        onAccountCreated: () => trackEvent(ANALYTICS_EVENT.signUp, { method: "github" }),
    }),
    onError: (error) => errorAlert(handleClientError(new FormattedError(error, locale))),
    onSuccess: async (result) => { /* igual ao Google: successAlert, resolveAppPostLoginPath, replace */ },
});

// JSX: título, subtítulo, <Button className="w-full" ...><FaGithub aria-hidden />{copy.githubSignIn}</Button>,
// as duas notas, e {showEmulatorAccess && (<>separador com copy.emulatorAccess + <Form>…</Form></>)}
```

`resolveAppPostLoginPath` recebe `idToken`; o resultado de `signInWithGithubViaApi` passa a devolver
`{ idToken, user }` (o `idToken` do Firebase usado no cookie).

### 10.10 Ordem de implementação e commits

1. `feat(kanban-contract): add the GitHub identity schema` (identity.ts + teste)
2. `feat(sdk): carry the GitHub identity on the profile and add GitHub sign-in` (package.json, tipos, action,
   remoção do Google) + `pnpm install` para o link
3. `feat(auth): accept only GitHub sign-in outside the emulator` (sign-in-method.ts, session.ts,
   session-routes.ts, client.ts, provider.tsx, testes e fixtures do pacote)
4. `feat(api): sync the GitHub identity on sign-in` (toolkit, github-identity.ts, user-merge.ts, schema,
   rota nova, remoção da rota Google, proxy.ts, testes)
5. `feat(api): refuse password and Google credentials outside the emulator` (resolve-api-actor.ts, rota de
   senha, fixtures da API)
6. `feat(app): sign in with GitHub` (githubSignInApi.ts, SignInForm, remoção do Google, testes do app)
7. `feat(app): show the GitHub login and allow GitHub avatars` (ProfileDropdown, proxy.ts)
8. `feat(internationalization): copy for GitHub sign-in`
9. `test(e2e): sign in with GitHub through the emulator popup`
10. `docs: switch the sign-in setup to GitHub` (PRE-PRODUCTION item 4, SECURITY.md linhas 7, 10, 22, SETUP.md)
11. `docs(features): github-sign-in`

Env nova: nenhuma.

## 11. Pré-requisitos manuais de infra

Vão para `docs/PRE-PRODUCTION.md`, item 4 (Login), substituindo o texto do Google:

- [ ] OAuth App do GitHub (Settings → Developer settings → OAuth Apps → New OAuth App) com
      Authorization callback URL `https://<authDomain>/__/auth/handler` (o `authDomain` do projeto
      Firebase, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`). É separado do GitHub App do item 5.
- [ ] Firebase Console → Authentication → Sign-in method → GitHub ligado, com o Client ID e o Client Secret
      do OAuth App.
- [ ] Email/Password e Google **desligados** no mesmo lugar.
- [ ] Domínio do painel em Authentication → Settings → Authorized domains.
- [ ] Depois do primeiro login, gravar `type: "admin"` à mão no documento `user` de quem administra
      (todo login GitHub nasce `common`).

Sem esses passos o botão falha com `auth/operation-not-allowed` (já traduzido) e nada mais quebra.

## 12. Decisões tomadas sem perguntar

| Decisão | Adotada | Descartada | Por quê |
|---------|---------|------------|---------|
| Como a API recebe o login do GitHub | Popup no cliente; API recebe só o ID token do Firebase e lê `screenName` via `accounts:lookup` | (a) Repetir o desenho do Google com `signInWithIdp` + access token; (b) API chamar `GET api.github.com/user` com o access token; (c) cliente mandar o login no corpo | (a) o emulador recusa `github.com` com credencial (medido no código do emulador) e o `/test` ficaria cego; (b) o access token trafegaria e o emulador devolve um token falso; (c) login forjado vira permissão de repositório na `board-members` |
| Destino do login por senha | Fica no emulador (UI e servidor), recusado fora dele | Tirar de vez e adaptar seed, E2E e `/test` para GitHub | Recomendação da própria spec; menor raio: `global.setup.ts`, `signIn.spec.ts` e as contas do seed seguem iguais |
| Onde recusar os métodos desligados | `mintSessionCookie` + `resolveFirebaseCredential` | Dentro de `getIdTokenSession`/`verifyIdTokenClaims`/`getSessionFromCookie` | Os dois pontos são onde a credencial nasce e é aceita; mexer nas três funções baixas obrigaria mudar todos os chamadores e mais fixtures |
| Google | Removido (rota, SDK, cliente, provider, schema, toolkit, testes) | Deixar o código e só esconder o botão | A rota do Google cria perfil (`getMergedUserByUid` chama `findOrCreateProfile`) antes de qualquer filtro; deixá-la seria porta aberta para criar documentos |
| Rota `/auth/sign-in` (senha) | Fica, com 403 fora do emulador | Remover | Nenhum front a chama (o app usa `signInWithEmailAndPassword` no cliente, `packages/auth/client.ts:144`), mas ela tem teste e está em listas de rate limit; o 403 fecha a porta com menos arquivos tocados |
| Onde mora o formato da identidade | `@repo/kanban-contract` | `@repo/sdk` ou `@repo/auth` | Regra 12: `board-import` e `board-members` vão ler esse formato |
| Campo no perfil | Objeto `github` | Campos soltos `githubId`/`githubLogin` | Um campo só para sincronizar e comparar; a `board-members` consulta `github.login` igual |
| Avatar | `github.avatarUrl` no perfil; menu usa o `photoURL` do Firebase como hoje | Escrever no `avatar` da conta | `avatar` é a foto escolhida pela pessoa e passa pelo filtro de host (`entity-photo.ts:20`), que não aceita GitHub |
| Atualização do nome e da foto do Firebase Auth a cada login | Não | Reescrever `displayName`/`photoURL` | A spec só exige o `login` atualizado; a pessoa pode ter editado o nome na tela de conta |
| Ícone | `FaGithub` de `react-icons` | SVG próprio | Pacote já instalado |

## 13. Perguntas em aberto

1. **Restringir a uma organização do GitHub?** Opções: não; sim, por variável `GITHUB_ALLOWED_ORG`.
   Adotada: não (recomendação da spec; o acesso a cada board já depende da permissão no repositório).
2. **`POST /users` (admin cria conta com e-mail e senha) continua?** Com e-mail/senha desligado no console,
   a conta criada não consegue entrar. Opções: deixar como está e registrar; remover a criação do painel
   admin; trocar por convite por login (é a `board-members`). Adotada: deixar, fora do corte. Recomendo
   tratar junto com a `board-members`.
3. **Seção de troca de senha na tela de conta** aparece para conta GitHub e responde 400. Opções: esconder
   quando não há provedor `password`; deixar. Adotada: deixar (fora do corte, comportamento já tratado pela
   API). Vira achado de backlog.
4. **Seed com conta GitHub?** Daria para criar pelo REST do emulador (`accounts:batchCreate` aceita
   `providerUserInfo` com `screenName`). Adotada: não agora; o E2E cria a conta pelo popup. Vale reabrir na
   `board-members`, que vai precisar de logins conhecidos no seed.

## 14. Riscos

- **R1. `screenName` em produção.** A doc da Identity Toolkit diz que `screenName` é o login do GitHub, e o
  emulador o atualiza a cada login (`upsertProviders`). Que o Firebase de produção também reescreva o
  `screenName` quando o login muda no GitHub não foi medido; só dá para medir com o OAuth App criado e uma
  troca de login real. Se não reescrever, o `login` fica parado no do primeiro acesso. Mitigação possível
  depois: ler `GET api.github.com/user/{id}` com o token de instalação do GitHub App. Fica como critério 🔒
  no `/test`.
- **R2. Popup no `agent-browser`.** Não sei se ele segue a aba do popup. Mitigação no item 8: o E2E cobre o
  fluxo e o `agent-browser` cobre a tela.
- **R3. Seletores do popup do emulador** mudam com a versão do `firebase-tools`. O repo fixa `15.30.1`; a
  atualização do `firebase-tools` pode quebrar o E2E novo.
- **R4. Fixtures.** O filtro faz testes que hoje passam token sem `firebase.sign_in_provider` falharem até a
  fixture ganhar o claim. É mudança de dado de teste, não de asserção.
- **R5. `auth/account-exists-with-different-credential`.** No emulador, quem digitar no popup um e-mail que
  já existe no seed (`user@example.com`) cai nesse erro. A tradução nova cobre; o roteiro do `/test` usa
  e-mail novo.
