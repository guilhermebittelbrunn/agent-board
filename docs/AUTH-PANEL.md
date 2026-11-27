# Sessão e acesso no `apps/app`

Regra de acesso do app: quem entra, por onde a sessão passa e o que a API confere. Visão de sistema em
[`ARCHITECTURE.md`](ARCHITECTURE.md), vocabulário em [`GLOSSARY.md`](GLOSSARY.md). O acesso a um board
(owner/maintainer/operator/viewer, limitado pela permissão no GitHub) é outra camada, descrita em
[`board/ACCESS.md`](board/ACCESS.md).

O app não tem papel global. Toda pessoa com sessão e perfil no Firestore usa as mesmas telas; o que ela
pode fazer em cada board vem do papel efetivo naquele board. Não existe área administrativa nem
impersonação. Um perfil antigo com o campo `type` gravado continua funcionando: nenhum guard lê esse campo.

## 1. Camadas (todas no servidor)

```
proxy.ts                       default-deny: tudo exige sessão, exceto /{locale} e /{locale}/sign-in
  └── (authenticated)/layout.tsx   requireSession()     → sem sessão: /sign-in
        └── guard da API           requireSessionApi    → 401 sem token, 403 sem perfil
              └── rota de board    requireBoardApi      → papel efetivo no board
```

- O proxy é default-deny: uma rota autenticada nova já nasce protegida. Caminho terminado em extensão de
  arquivo passa direto (`isStaticAssetPath`), senão um arquivo de `public/` iria para o sign-in.
- A landing é pública só como raiz exata do locale (`LANDING_PATH`). `/pt-br/boards` e `/pt-br//boards`
  continuam exigindo sessão; `proxy.test.ts` cobre os dois.
- Quem tem sessão e abre a landing ou o sign-in vai para o `?redirect=` saneado ou, sem ele, para
  `/{locale}/boards`. O fallback não pode ser a raiz do locale: ela é pública e o redirect entraria em loop.
- UI oculta nunca é proteção. A última palavra é do guard da API.

## 2. Guard de sessão na API

`requireSessionApi` (`apps/api/app/(guards)/session.ts`):

1. resolve o usuário pelo bearer (`resolveApiActor`); sem usuário → `401 AUTH_INVALID_TOKEN`;
2. busca o perfil por `reference_id`; sem perfil → `403 AUTH_PROFILE_NOT_FOUND`;
3. chama o handler com `ctx.user` e `ctx.profile`.

Ele não lê nenhum cabeçalho `x-*` e não grava no perfil. `requireBoardApi` envolve o guard de sessão e
resolve o papel efetivo com `resolveBoardAccess`. Os cabeçalhos aceitos pelo CORS são `Content-Type`,
`Authorization` e `x-locale`.

## 3. Bearer no browser

`ApiAuthProvider` (`apps/app/shared/providers/ApiAuthProvider.tsx`) é o único dono do `Authorization` do
`apiClient`. Ele recebe `actorUid` do layout raiz e:

- escreve o token durante o render. O React roda o efeito do filho antes do efeito do pai, então um
  efeito aqui deixaria a primeira query do filho sair sem token;
- remove o header só quando o servidor diz que não há sessão (`actorUid === null`), nunca enquanto o token
  ainda está a caminho;
- expõe `useSdkAuthorized()`, que o `useAuthorizedQuery` usa para segurar as queries até o token existir.
  Uma request antes do token volta 401 e o React Query guarda a falha.

O `apiClient` é um singleton de processo. No servidor, o token nunca é escrito nele: Server Components
usam o cliente por request de `lib/server/apiServerClient.ts`, e o prefetch das telas usa esse cliente.

## 4. Pós-login

- O destino padrão é `/{locale}/boards`. Se a conta prefere outro idioma, `/{idioma}/boards`.
- O `?redirect=` passa por `postAuthRedirectTarget` (`@repo/auth/redirect`), que barra destino fora do app.
- A navegação depois do login é carga completa, nunca `router.push`: o `ApiAuthProvider` nasce no layout
  raiz com o estado da tela de login, sem sessão, e só uma carga nova o recria com o `actorUid`.

## 5. Códigos de erro de sessão

| `error.code` | HTTP | Quando |
|--------------|------|--------|
| `AUTH_INVALID_TOKEN` | 401 | token ou sessão inválidos ou expirados |
| `AUTH_PROFILE_NOT_FOUND` | 403 | sessão válida sem perfil no Firestore |
| `AUTH_SESSION_REVOKED` | 401 | sessão encerrada em outro dispositivo |

Todo código tem copy em `translations/packages/shared/utils.ts` (`apiErrors`). Use `/i18n-sync`.

## 6. Onde mexer

| Arquivo | Responsabilidade |
|---------|------------------|
| `apps/app/proxy.ts` | rotas públicas, redirect de quem tem sessão |
| `apps/app/lib/server/authSession.ts` | `requireSession` e a sessão no servidor |
| `apps/app/shared/providers/ApiAuthProvider.tsx` | bearer no browser e `useSdkAuthorized` |
| `apps/app/shared/lib/postLoginNavigation.ts` | destino depois do login |
| `apps/api/app/(guards)/session.ts` | guard de sessão |
| `apps/api/app/(guards)/board.ts` | guard de papel no board |

Testes: `apps/app/__tests__/proxy.test.ts`, `authHeaderOwnership.test.tsx`, `serverGuards.test.ts`,
`postLoginPreferences.test.ts` · `apps/api/__tests__/sessionGuard.test.ts`, `boardAccess.test.ts`.

Ao mudar qualquer regra desta página, atualize esta página.
