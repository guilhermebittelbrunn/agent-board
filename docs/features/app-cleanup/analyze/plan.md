# Plano: App só com o board, área do usuário no cabeçalho e landing simples

- **Spec:** [`specs/features/app-cleanup.md`](../../../../specs/features/app-cleanup.md) (status `approved`)
- **Branch atual:** `guilhermebittelbrunn/chore-overnight-cycle-specs` (a `spec-authoring` foi entregue nela). Quem decide a branch desta entrega é o `/review`.
- **Modo:** rodada autônoma do `/cycle`. Nenhuma pergunta foi feita; as decisões estão em "Perguntas em aberto", cada uma com a alternativa descartada.

A spec já define o problema, o corte e o que fica de fora. Este plano não rediscute isso: diz como remover, em que ordem e o que precisa ser reescrito para o que fica continuar funcionando.

---

## Etapa 1: Análise

### 1. Contexto

**Resumo.** Tirar do app e da API o que veio do next-boilerplate e o board não usa (admin, impersonação, playground, CRUD `entity`, notificações, sidebar, aba Segurança), deixar o app autenticado só com as telas de board e a conta, levar conta e preferências para o menu do avatar no cabeçalho e pôr uma landing pública em `/{locale}` com a animação do board em vídeo.

**Objetivos observáveis**

1. Um perfil com `type: "admin"` gravado no Firestore entra e usa `/boards` sem impersonar (hoje `requireCommonPanelApi` recusa: `apps/api/app/(guards)/common-panel.ts:75`; e o layout comum manda para `/admin`: `(common)/layout.tsx:47-52`).
2. `/{locale}` sem sessão mostra a landing; com sessão, vai para `/{locale}/boards` (um redirect no proxy).
3. O cabeçalho autenticado tem marca (link para `/boards`), botão de tema e menu do avatar com Perfil, Preferências, Cookies (quando o consentimento existe) e Sair. Não há sidebar.
4. `grep` por `entity`, `requireAdminApi`, `isImpersonating`, `playground` em `apps/` e `packages/` não acha o recurso removido.
5. `pnpm turbo run lint typecheck test test:emulator` e `pnpm e2e` verdes, sem `focusNotObscured.spec.ts`, `entityCrud.spec.ts` e `panelSwitch.spec.ts`.

**Fora de escopo** (vem da spec, sem mudança): Cloud Storage e `files/route.ts`; upload de avatar; `@repo/analytics` e o banner de cookies; Arcjet; o segmento `[locale]`; E2E das telas do board; limpeza de documentos antigos no Firestore de produção.

**Corte de MVP.** É a spec inteira. Não dá para entregar metade: o guard novo depende de a impersonação sair, e a landing depende de a home de `entity` sair. O que dá para fatiar é a ordem dos commits (seção 10.7), que mantém o build compilando na maior parte do caminho.

**Apps impactados:** `apps/app`, `apps/api`, `apps/e2e`, `packages/sdk`, `packages/auth`, `packages/shared`, `packages/internationalization`, `firestore.indexes.json`, docs e `.claude/`. `packages/kanban-contract` e `apps/runner` não mudam (o `grep` por `x-role`, `UserType` e `entity` em `apps/runner/src` não acha nada).

**Área do painel.** Deixa de existir a divisão comum × admin. Fica um único app autenticado. O grupo de rota `(common)` mantém o nome (decisão 7).

**Papel no board.** Não muda. O acesso continua vindo de `requireBoardApi` (`apps/api/app/(guards)/board.ts:25`) e de `resolveBoardAccess` (`apps/api/(shared)/lib/board-access.ts:140`).

**Dependências externas e env.** Nenhuma variável nova. `ffmpeg` (presente em `/opt/homebrew/bin/ffmpeg`, versão 7.1) gera os vídeos uma vez, na máquina de quem desenvolve. O repositório recebe só os arquivos gerados; `ffmpeg` não vira dependência.

### 1.1 Fontes

- Spec `app-cleanup` (lida por completo) e decisões passadas pelo orquestrador nesta rodada (aba Segurança sai; slice de referência vira `boardMember`; avatar com upload fica; analytics fica; Storage fica; vídeo gerado do GIF; `/` com sessão vai para `/boards`).
- `docs/design/README.md:95`: o cabeçalho de referência do board tem "logo, nome do board, menu (...), estado do runner, botão de tema e avatar". Este plano entrega a parte global (logo, tema, avatar); o menu por board já existe dentro das telas.
- `docs/design/agent-board.gif`: 3.922.744 bytes, 880×495. Só o `README.md:7` cita.
- Não há link inacessível.

### 2. Dados (Firestore)

Nenhuma coleção nova e nenhum campo novo.

| Coleção / campo | O que acontece | Evidência |
|---|---|---|
| `entity` | O código deixa de ler e escrever. Os documentos em dev e produção ficam órfãos. | `entity.repository.ts`; seed `apps/api/scripts/seed-emulator.mjs:15-17,36-91` |
| `notification` | Igual. A emissão do `welcome` sai de `user-merge.ts:76-97`. | `lib/notifications.ts`; seed `:93-108` |
| `user.type` | Sai do DTO, do mapper e da gravação no `createDefaultUserProfile`. Perfis antigos com `type: "admin"` ou `"common"` continuam válidos: o mapper ignora a chave. | `user-merge.ts:82`, `user.mapper.ts:78`, SDK `types/user/user.ts:6-17` |
| `user.lastAccessAt` | Deixa de ser carimbado (o `activity-recorder` sai). Sai do DTO. Os valores gravados ficam no documento, sem leitor. | `common-panel.ts:85`, `user.repository.ts:68` |
| `card`, `board`, `boardMember`, `run`, `session`... | Sem mudança. | |

**Consultas e índices** (`firestore.indexes.json`):

| Índice | Linhas | Destino |
|---|---|---|
| `entity` (userId, deletedAt, createdAt / enabled / type) | 3-29 | sai |
| `user` (reference_id, deletedAt) | 30-37 | fica (guards e `findByReferenceId`) |
| `user` (deletedAt, type) | 38-45 | sai (resumo do admin) |
| `user` (deletedAt, lastAccessAt) | 46-53 | sai (atividade do admin) |
| `notification` (userId, createdAt / readAt) | 54-69 | sai |

**Regras.** `firestore.rules` e `storage.rules` já negam tudo ao cliente (`firestore.rules:32-34`, `storage.rules:27-29`). Só o exemplo comentado em `firestore.rules:39-52` cita `entity`: troca para um exemplo de `board` ou sai. `firestoreRules.emulator.test.ts` descobre as coleções pelos repositórios em tempo de execução, então perde `entity` e `notification` sozinho.

**Dados existentes.** Nada a migrar. Documentos órfãos de `entity` e `notification` e o campo `type` ficam no banco; a spec põe a limpeza fora do corte.

### 3. Contrato `@repo/sdk`

Só remoção. Nenhum DTO novo.

| Sai | Arquivo | Consumidor que quebra (e some antes) |
|---|---|---|
| `EntityActions`, `EntityDTO` e requests | `actions/entity/action.ts`, `types/entity/**` | telas `entities/**`, home comum, `entity-photo.ts` |
| `NotificationActions`, `NotificationDTO` | `actions/notification/action.ts`, `types/notification/**` | `NotificationsBell`, hooks de notificação |
| `UserActions` (list, summary, activitySummary, findById, create, update, delete) e `user/user/types.ts` | `actions/user/user/**` | admin, `useListUsers` |
| `AdminCreateUserRequest`, `AdminUpdateUserRequest`, `UserSummaryDTO`, `UserActivitySummaryDTO` | `types/user/user.ts` | rotas `users/**`, `user.repository.ts` |
| `UserType` e `UserDTO.type`, `UserDTO.lastAccessAt` | `types/user/user.ts:6-30` | ver seção 2 |
| `AuthMePayload.type` | `actions/auth/action.ts:8` | `postLoginNavigation.ts:92`, `notFoundHome.ts:9`, `panelSnapshot.ts` |
| `Context`, `Config.context`, `isAdminContext`, `isCommonContext`, `changeToAdminContext`, `changeToCommonContext`, `ensureIs*Context` | `client/base.ts:13-19`, `client/index.ts:46-79` | `shared/lib/client.ts:6`, `apiServerClient.ts`, `sessionAuthority.ts:36`, 8 chamadas a `getServerApiClient("common")` |
| `setAuthRequestContext`, `clearAuthRequestContext` e o `x-role` | `client/base.ts:31-61,95` | `AuthRequestPanelContext.tsx` |
| `PageDTO`, `PageQuery` | `types/pagination/**` | só hooks de notificação e entidade e `apps/app/shared/lib/pagination.ts`. Sai se o `grep` depois das remoções confirmar zero uso. |

Fica: `UserDTO` (sem `type` e sem `lastAccessAt`), `UserPreferences`, `UserWithAuthDTO` (`types/account/account.ts:1`), `AccountActions`, `FileActions`, `AuthActions`, os recursos do board e `runner`.

`packages/auth/types.ts`: saem `UserRoleLevel`, `IAuthContextProps`, `canSwitchPanelEnvironment`, `UserProfile`, `parseUserProfileResponse` (os dois últimos já sem consumidor). `packages/shared/utils/helpers/auth-request-headers.ts`: sai `AUTH_REQUEST_HEADER`; ficam `isValidIanaTimeZone` e `resolveBrowserTimeZone`, usados por `DisplayTimeZoneProvider` e `displayTimeZone.ts`.

### 4. API (`apps/api`)

#### 4.1 O que sai

| Grupo | Arquivos |
|---|---|
| Rotas `entities/**` | `entities/route.ts`, `entities/[id]/route.ts`, `entities/summary/route.ts` |
| Rotas `notifications/**` | `notifications/route.ts`, `[id]/route.ts`, `[id]/read/route.ts`, `read-all/route.ts`, `unread-count/route.ts` |
| Rotas `users/**` | `users/route.ts`, `[id]/route.ts`, `summary/route.ts`, `activity-summary/route.ts` |
| Rota de senha | `account/password/route.ts` (aba Segurança) |
| Guards | `(guards)/admin.ts`; `(guards)/common-panel.ts` vira `(guards)/session.ts` |
| Libs | `entity-photo.ts` (depois de mover os helpers da conta), `notifications.ts`, `activity-recorder.ts`, `auth-request-context.ts`, `impersonation-read-only.ts`, `session-revocation.ts` (só a rota de senha usa) |
| Repositórios / mappers | `entity.repository.ts`, `notification.repository.ts`, `entity.mapper.ts`, `notification.mapper.ts`; em `user.repository.ts` saem `list`, `summary`, `activitySummary` e `stampLastAccess` (linha 68) |
| Validação | `entity.schema.ts`, `user-admin.schema.ts`, `pagination.schema.ts` (só entities e notifications usam); em `account.schema.ts` sai `parseChangePassword`. `password.schema.ts` fica: `auth.schema.ts:4-9` usa no login do emulador. |
| `toolkit-error-codes.ts` | Saem `mapAdminCreateUserErrorToCode` e `mapIdentityToolkitMessageToCode` (só `users/route.ts`). Ficam `mapPasswordCheckMessageToCode`, `statusForAuthErrorCode` e `adminAuthErrorReason` (login e `user-merge`). |
| `activity-windows.ts` | Fica, porque `session-tracker.ts:4` usa `ACTIVITY_WINDOW_MINUTES`. Saem `ACTIVE_WINDOW_DAYS`, `INACTIVE_AFTER_DAYS`, `buildActivityRecencyRanges` e os tipos, se o `grep` confirmar que só o admin usa. |

#### 4.2 Guard de sessão (substitui `requireCommonPanelApi`)

Hoje o guard resolve o ator, o perfil do ator, os cabeçalhos `x-*` (impersonação), recusa escrita impersonando, resolve o perfil do sujeito, exige `type === "common"` e carimba atividade (`common-panel.ts:34-97`). Depois:

1. `resolveApiActor(req)` → sem usuário: `401 AUTH_INVALID_TOKEN` (igual hoje).
2. `userRepository.findByReferenceId(uid)` → sem perfil: `403 AUTH_PROFILE_NOT_FOUND` (código novo; substitui `COMMON_PANEL_FORBIDDEN`).
3. Chama o handler com `{ ...routeContext, user, profile }`.

Não lê `x-role` nem nenhum `x-*`, não olha `type` e não carimba atividade. O nome passa a ser `requireSessionApi`, com o contexto `SessionAuthContext` e o perfil em `ctx.profile` (decisão 6). `requireBoardApi` passa a envolver `requireSessionApi` e chama `resolveBoardAccess` sem `isImpersonating`.

Quem usa o guard hoje (`grep requireCommonPanelApi`, fora de testes): `account/route.ts`, `boards/route.ts`, `boards/preview`, `boards/repositories`, `files/route.ts`, `runners/route.ts`, `runners/[id]`, `runners/registrations`, além de `(guards)/board.ts`. `ctx.subjectProfile` aparece em 24 arquivos de rota que ficam (contagem no inventário); todos passam a `ctx.profile`. A troca é mecânica.

#### 4.3 Impersonação fora do domínio do board

- `board-access.ts:78-110` (`findMembership`): sem o ramo `isImpersonating`. O dono sem documento de membro sempre ganha o documento (`createOwnerMember`), e o convite pendente sempre é ativado.
- `board-access.ts:199`: o registro da checagem de papel sempre grava quando está velho.
- `board-list.ts:25-33` (`listBoardsOf`): perde o parâmetro; sempre reivindica os convites pendentes quando há `github`.
- `boards/route.ts:21-26`: `listBoardsOf(ctx.profile)`.
- `account/route.ts`: perde a recusa "escrita impersonando" (a lógica estava no guard; o teste `accountRoute.test.ts:204-226` sai).

#### 4.4 Conta e foto

`account/route.ts:8-12` importa `isOwnStorageObject`, `isUsablePhotoReference` e `normalizePhotoReference` de `entity-photo.ts`, e `account-avatar.ts:3` importa `isAbsoluteHttpUrl`. Esses quatro helpers e o `isAllowedExternalImageUrl` (com `EXTERNAL_IMAGE_HOSTS`) mudam para `apps/api/(shared)/lib/photo-reference.ts`, sem mudar o código. `withPhotoUrl` e `withPhotoUrls` (`entity-photo.ts:66-95`) saem com `entity`.

O anexo da `spec-authoring` não depende de `entity-photo`: `boards/[id]/attachments/route.ts:3-8` usa `storage.ts` e `attachment.schema.ts`, que importa `sniffImageType` e `UPLOAD_IMAGE_EXTENSION` de `file.schema.ts:9-13`. `storage.ts`, `file.schema.ts`, `image-metadata.ts`, `read-capped-body.ts` e `attachment-name.ts` ficam intactos. O teste `storageEmulatorIsolation.test.ts` usa `withPhotoUrl` (linhas 62, 103, 210-222) e precisa trocar o caso de `entity` por um caso de avatar da conta ou de anexo.

#### 4.5 `user-merge.ts`

`createDefaultUserProfile` (linhas 76-97) deixa de gravar `type` e de chamar `emitNotificationQuietly`. O resto do merge (perfil arquivado, GitHub) não muda.

#### 4.6 CORS

`cors.ts:13-19`: `ALLOWED_HEADERS` fica `Content-Type, Authorization, x-locale`. Saem `x-role` e os cinco `AUTH_REQUEST_HEADER`. O `REQUEST_ID_HEADER` continua só em `EXPOSED_HEADERS` (`cors.ts:62`).

#### 4.7 Códigos de erro

| Código | Status | Situação |
|---|---|---|
| `AUTH_PROFILE_NOT_FOUND` | 403 | **novo** (guard de sessão, conta sem perfil) |
| `COMMON_PANEL_FORBIDDEN` | 403 | sai |
| `ADMIN_FORBIDDEN` | 403 | sai |
| `AUTH_REQUEST_*` (8 códigos) | 403 | saem com `auth-request-context.ts` |
| `USERS_DELETE_AUTH_FAILED`, `USERS_SELF_LOCKOUT_FORBIDDEN`, `USERS_NOTHING_TO_UPDATE`, `USERS_PROFILE_CREATE_FAILED` | vários | saem |
| `USERS_AUTH_*` só emitidos por `mapIdentityToolkitMessageToCode` (3 códigos) | vários | saem; `USERS_AUTH_RATE_LIMITED` e `USERS_AUTH_WEAK_PASSWORD` ficam (login) |
| `ENTITY_*` (2), `NOTIFICATION*` (2), `SUMMARY_INDEX_MISSING`, `PAGINATION_*` (2) | vários | saem |
| `ACCOUNT_CURRENT_PASSWORD_INVALID`, `ACCOUNT_PASSWORD_UNSUPPORTED`, `AUTH_SESSIONS_NOT_REVOKED` | vários | saem com a aba Segurança |
| `USERS_NOT_FOUND`, `AUTH_PASSWORD_TOO_SHORT`, `AUTH_INVALID_TOKEN` | | ficam (conta e login ainda emitem) |

O `apiErrorCodesTranslated.test.ts` só confere que todo código emitido tem copy. Depois da remoção, o `/review` faz a conferência inversa à mão: cada chave de `apiErrors` removida não aparece mais em `apps/api` fora de testes.

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

| Rota | Antes | Depois |
|---|---|---|
| `/{locale}` | home de `entity` (`(common)/(pages)/page.tsx`) | landing pública: `app/[locale]/(landing)/page.tsx` |
| `/{locale}/boards/**` | fica | fica |
| `/{locale}/account?tab=profile\|preferences` | fica | fica, sem a aba `security` |
| `/{locale}/account?tab=security` | aba Segurança | cai em `profile` (`resolveAccountTab` já faz fallback, `accountTabRouting.ts:5-8`) |
| `/{locale}/entities/**`, `/{locale}/playground`, `/{locale}/admin/**` | existem | 404 (`app/not-found.tsx`) |
| `/{locale}/sign-in` | fica | fica |

Por que `/{locale}` e não `/`: o proxy redireciona todo caminho sem locale para `/{defaultLocale}{path}` (`apps/app/proxy.ts:215-228`), então quem abre `/` chega em `/pt-br`. `apps/app/app/page.tsx` fica como está (redireciona para `/${locale}`).

A landing fica num grupo próprio, `(landing)`, sem `layout.tsx`. O grupo `(unauthenticated)` tem um layout de duas colunas pensado para o login (`(unauthenticated)/layout.tsx:15-44`) que não serve para a landing.

#### 5.2 Proxy e redirecionamentos

- `PUBLIC_PATHS = ["/", "/sign-in"]` (`proxy.ts:91`). `matchesPathPrefix` compara `path === prefix || path.startsWith(prefix + "/")`; para `"/"` o segundo ramo vira `startsWith("//")`, que nunca casa com um caminho normal. Na prática `"/"` só libera a raiz do locale. Isso é sutil, então entra um teste no `proxy.test.ts`: anônimo em `/pt-br/boards` continua indo para `/pt-br/sign-in?redirect=...`, e anônimo em `/pt-br` recebe a página.
- O fallback do ramo "público com sessão" (`proxy.ts:259-262`) passa de `/${currentLocale}` para `/${currentLocale}/boards`. É isso que manda quem tem sessão da landing para o board, e o login para o board quando não há `?redirect=`. Sem essa troca, `/pt-br` com sessão redirecionaria para `/pt-br` em loop.
- `SignInForm.tsx:55` e `useSignedInRedirect.ts:60`: `fallbackPath` passa a `/${locale}/boards`.
- `postLoginNavigation.ts:86-99` (`destinationForAccount`): sai o ramo de admin; quando o locale preferido é outro, o destino passa a `/${preferredLocale}/boards`.
- `notFoundHome.ts`: com sessão, `/{locale}/boards`; sem sessão, `/{locale}` (a landing).
- `(common)/layout.tsx`: sai o redirect de admin para `/admin` (linhas 42-52) e com ele a última leitura de `type` no app.

#### 5.3 Shell autenticado

`(common)/layout.tsx` depois:

```tsx
const AppLayout = async ({ children }: AppLayoutProperties) => {
    if (env.ARCJET_KEY) {
        await secure(["CATEGORY:PREVIEW"]);
    }
    return (
        <div className="flex min-h-dvh flex-col">
            <Navbar />
            <main className="flex flex-1 flex-col">{children}</main>
        </div>
    );
};
```

O `generateMetadata` mantém `panelTitleTemplate(...)`, com a área nomeada por `routes.platform.boards.list` ("Boards") no lugar de `navbar.environmentCommon` ("Painel do usuário").

`Navbar.tsx` depois: à esquerda a marca (avatar com `brand.logoUrl` ou a inicial, mais `brand.name`, como `Sidebar.tsx:139-160` faz hoje), dentro de um `Link` para `/{locale}/boards` com `aria-label` do dicionário; à direita `ModeToggle` e `ProfileDropdown`. Saem `SidebarTrigger`, `PanelNavbarControls` e a prop `notifications`. O atributo `data-panel-navbar` fica, porque o `scroll-padding` do `<html>` (`app/layout.tsx:66`) depende dele.

`ProfileDropdown.tsx` depois: "Minha conta" vira dois itens, Perfil (`/account?tab=profile`, ícone `UserIcon`) e Preferências (`/account?tab=preferences`, ícone `SlidersHorizontalIcon` do `lucide-react`, já dependência). Os rótulos reutilizam `pages.common.account.tabs.profile` e `.preferences`. Cookies e Sair ficam como estão.

`Header.tsx:28-46`: o separador antes da página só aparece quando há `breadcrumbs`. Hoje ele sempre aparece, e passa a ficar sozinho nas telas que perdem o crumb "Início".

Breadcrumbs: `COMMON_ROUTES.root` sai de `paths.ts:11-14`. As oito telas que começam com `routes.root` (lista de boards, novo board, quadro, card, configuração, membros, credenciais, conta) perdem esse primeiro item. A lista de boards e a conta ficam sem crumb anterior; as telas dentro de um board continuam começando por "Boards".

#### 5.4 Autenticação do `apiClient` no browser

`AuthRequestPanelProvider` (`shared/providers/AuthRequestPanelContext.tsx`, 258 linhas) faz duas coisas: escreve o bearer e os `x-*` no `apiClient`, e expõe `sdkAuthorized`, que segura os `useAuthorizedQuery` até o token existir (`useAuthorizedQuery.ts:29-34`). A segunda continua necessária; a primeira encolhe para o bearer.

Substituto: `shared/providers/ApiAuthProvider.tsx`, cliente, com um `createContext<boolean>` (sem zustand):

- recebe `actorUid: string | null` do `app/layout.tsx`;
- no primeiro render, no browser, com `actorUid` e `accessToken`, chama `apiClient.setAuthorizationHeader(token)` (mesma razão do comentário atual em `AuthRequestPanelContext.tsx:56-67`: um efeito do filho roda antes do efeito do pai);
- em efeito, reaplica quando o token muda e, quando `actorUid` é `null`, remove o `Authorization`;
- expõe `useSdkAuthorized()`; `useAuthorizedQuery` passa a ler daí.

O que sai junto: `shared/stores/panelStore.ts`, `shared/lib/panelState.ts`, `shared/lib/authRequestHeaders.ts`, `lib/server/panelSnapshot.ts`, `lib/server/requireAdmin.ts`, `shared/components/ui/PanelNavbarControls.tsx`, `shared/components/ui/ImpersonationReadOnlyNotice.tsx`, `shared/hooks/useListUsers.ts`. `app/layout.tsx` para de chamar `resolvePanelSnapshot` (linha 48) e passa só `actorUid` para o `ClientLayout`. Os cookies `bp:panel-request-role` e `bp:impersonate-firebase-uid` param de ser lidos; quem já os tem no browser fica com cookie morto até expirar (14 dias, `panelState.ts:38-43`).

A regra "pós-login é carga completa" (`apps/app/CLAUDE.md`, seção de auth) continua valendo: o provider continua nascendo no layout raiz com o estado da tela de login.

#### 5.5 Boards e conta sem `isImpersonating`

Em cada arquivo, `isImpersonating` some da condição e o aviso `ImpersonationReadOnlyNotice` some do JSX:

| Arquivo | Linhas |
|---|---|
| `boards/(components)/SpecDraftDetail.tsx` | 182-187 |
| `boards/(pages)/(home)/BoardsListClient.tsx` | 69 |
| `boards/(pages)/new/NewBoardClient.tsx` | 93, 121, 215 |
| `boards/(pages)/[id]/BoardClient.tsx` | 102, 225-230, 313, 329 |
| `boards/(pages)/[id]/settings/BoardSettingsClient.tsx` | 59, 114, 132, 154 |
| `boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx` | 91, 121, 259, 275-276 |
| `boards/(pages)/[id]/members/BoardMembersClient.tsx` | 50, 66, 115 |
| `boards/(pages)/[id]/credentials/BoardCredentialsClient.tsx` | 45, 142, 157, 164 |
| `account/(components)/AccountPreferencesForm.tsx` | 33, 93 |
| `account/(components)/AccountProfileForm.tsx` | 33, 134 |
| `account/(components)/AccountTabs.tsx` | 21, 80, 126 |

As sete `page.tsx` com prefetch (`boards/(home)`, `[id]`, `[id]/settings`, `[id]/cards/[slug]`, `[id]/members`, `[id]/credentials`, `account/(home)`) trocam `if (!(await isImpersonating()))` por um prefetch incondicional e `getServerApiClient("common")` por `getServerApiClient()`.

#### 5.6 Remoções no app

| Grupo | Caminhos |
|---|---|
| Admin | `app/[locale]/(authenticated)/(admin)/**` |
| Entidades e playground | `(common)/(pages)/entities/**`, `(common)/(pages)/playground/` |
| Home de `entity` | `(common)/(pages)/page.tsx`, `(common)/(pages)/(components)/CommonHomeClient.tsx` e o que mais houver em `(pages)/(components)` e `(pages)/(hooks)` só para ela (conferir com `grep`) |
| Sidebar | `(common)/sidebar.tsx`, `(common)/routes.tsx`, `shared/components/ui/Sidebar.tsx`, `lib/server/sidebarState.ts`, `shared/lib/navActive.ts` |
| Notificações | `shared/components/notifications/**`, `shared/hooks/useListNotifications.ts`, `useUnreadNotificationsCount.ts`, `useNotificationActions.ts`, `shared/lib/notifications.ts` |
| Segurança | `account/(components)/AccountSecurityForm.tsx`, `buildAccountPasswordSchema` em `account/(validations)/accountFormSchema.ts`, a mutation de senha em `account/(hooks)/useAccountMutations.tsx`, `security` em `accountTabValues` |
| Órfãos depois das remoções | `shared/hooks/useAuthorizedInfiniteQuery.ts`, `shared/lib/pagination.ts`, `shared/components/ui/MetricCard.tsx`, `ScrollToTopButton.tsx`, `PageBreadcrumb.tsx` (cada um só tem consumidor nas áreas removidas; o `/develop` confirma com `grep` antes de apagar) |
| Rotas e títulos | `paths.ts`: `root`, `playground`, `entities`, `account.security`; `panelTitles.ts`: `/entities*`, `/playground`, `/admin/*`; `queryKeys.ts:38-61`: `entities`, `notifications`, `users` |

Os primitivos do `@repo/design-system` que ficam sem consumidor (sidebar, chart, popover, accordion etc.) **ficam**: o pacote é genérico e a regra do repo é mudança mínima fora do app.

#### 5.7 Landing

Server Component, sem `"use client"`. Árvore:

```
apps/app/app/[locale]/(landing)/page.tsx
apps/app/public/landing/agent-board.webm
apps/app/public/landing/agent-board.mp4
apps/app/public/landing/agent-board-poster.png
```

Conteúdo, de cima para baixo: uma barra com a marca e o `ModeToggle`; um `h1` com o nome; um parágrafo com a ideia ("cada card é uma spec, cada coluna é uma etapa; arrastar o card dispara a etapa do Claude Code e o agente escreve no card o que fez"); o vídeo; um `Button asChild` com `Link` para `/{locale}/sign-in`, rótulo "Entrar com GitHub". Sem preço, depoimento, lista de recursos ou chamada de venda.

Vídeo:

```tsx
<video
    aria-label={landing.videoLabel}
    autoPlay
    className="aspect-video w-full rounded-lg border motion-reduce:hidden"
    height={495}
    loop
    muted
    playsInline
    poster="/landing/agent-board-poster.png"
    preload="metadata"
    width={880}
>
    <source src="/landing/agent-board.webm" type="video/webm" />
    <source src="/landing/agent-board.mp4" type="video/mp4" />
</video>
<img
    alt={landing.videoLabel}
    className="hidden aspect-video w-full rounded-lg border motion-reduce:block"
    height={495}
    src="/landing/agent-board-poster.png"
    width={880}
/>
```

Com `prefers-reduced-motion`, o vídeo some e a imagem parada aparece. O Biome pode pedir `next/image` para o `<img>`; se pedir, usa `next/image` com `unoptimized` (arquivo de `public/`).

CSP: `mediaSrc: [SELF]` e `imgSrc` com `self` já cobrem arquivos de `public/` (`packages/security/middleware.ts:81-87`). Arquivo com extensão passa pelo proxy sem sessão (`isStaticAssetPath`, `proxy.ts:117-121`).

Geração (uma vez, na máquina de quem desenvolve; os números da spec saíram destes parâmetros):

```bash
mkdir -p apps/app/public/landing
ffmpeg -i docs/design/agent-board.gif -an -movflags +faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 26 \
  apps/app/public/landing/agent-board.mp4
ffmpeg -i docs/design/agent-board.gif -an -c:v libvpx-vp9 -crf 36 -b:v 0 \
  apps/app/public/landing/agent-board.webm
ffmpeg -i docs/design/agent-board.gif -frames:v 1 \
  apps/app/public/landing/agent-board-poster.png
```

Tamanhos esperados pela medição da spec: MP4 ≈ 782 KB, WebM ≈ 739 KB, poster ≈ 60 KB. O `/develop` confere que o primeiro quadro mostra o board (não uma tela vazia) e, se não mostrar, escolhe outro com `-ss` e registra no handoff. O GIF fica em `docs/design/` para o README e não vai para `public/`.

Metadata: `generateMetadata` com título e descrição do dicionário (`pages.landing.metaTitle`, `metaDescription`).

#### 5.8 Estados

A landing não tem estado de dados. O cabeçalho depende de `useMyAccount` (avatar e nome), que já tem fallback para o usuário do Firebase (`ProfileDropdown.tsx:33-38`). A conta mantém o `Container` com `loadError`.

### 5.9 i18n (pt-br)

**Sai:**

- `translations/apps/app/pages/admin/**`, `pages/impersonation/index.ts`, `pages/common/entities.ts`, `pages/common/home.ts`, `shared/notifications.ts`, e as entradas correspondentes em `pages/index.ts`, `pages/common/index.ts` e `shared/index.ts`;
- `pages/common/routes/index.ts`: `home`, `platform.title`, `platform.playground`, `platform.entities`, `platform.settings` e o que mais só a sidebar usava (o inventário cita `documentation`);
- `pages/common/account.ts`: `tabs.security` (linha 7), `sections.security` (15), o bloco `security` (58-74), `messages.passwordChanged` (89);
- `pages/navbar/index.ts`: `environmentLabel`, `environmentAdmin`, `environmentCommon`, `actingAsUserLabel`, `selectUserPlaceholder`;
- `shared/index.ts`: `profileDropdown.myAccount`;
- `components/ui/sidebar.ts`: fica, porque o `sidebar.tsx` do design system ainda importa (decisão 9);
- `translations/packages/shared/utils.ts`: os códigos listados em 4.7;
- `packages/internationalization/__tests__/chartAxisLabels.test.ts` (importa `admin/home`).

**Entra:**

```ts
// pages/landing/index.ts
export const landingTranslations = {
    "pt-br": {
        metaTitle: "agent-board",
        metaDescription:
            "Um board Kanban que dispara as etapas do Claude Code nos seus repositórios.",
        title: "agent-board",
        tagline:
            "Cada card é uma spec e cada coluna é uma etapa. Arraste o card e a etapa roda com o Claude Code; o agente escreve no card o que fez.",
        videoLabel:
            "Animação: um card é arrastado de coluna, a etapa roda e o agente registra o resultado no card.",
        signIn: "Entrar com GitHub",
    },
};

// pages/navbar/index.ts
export const navbarTranslations = {
    "pt-br": {
        homeLinkLabel: "Ir para os boards",
    },
};

// translations/packages/shared/utils.ts (apiErrors)
AUTH_PROFILE_NOT_FOUND: "Sua conta não tem perfil neste app. Saia e entre de novo.",
```

O `metaTitle` e o `title` usam o nome do produto; se a marca vier de `getBrand().name`, a página usa a marca e essas duas chaves saem (o `/develop` decide pelo que o `NotFoundPage` e o login já fazem).

### 6. Autorização e segurança

- **Camadas:** `proxy.ts` (sessão; agora `/` e `/sign-in` públicos) → `requireSession` (layout `(authenticated)`) → `requireSessionApi` → `requireBoardApi` (papel efetivo). Sai `requireAdmin`.
- **Perfil `type: "admin"` existente:** o guard não olha `type`; o perfil vira uma pessoa comum, com o acesso dado pelo papel em cada board. Quem antes só entrava impersonando passa a entrar direto. Teste unitário do guard cobre um perfil com `type: "admin"` gravado.
- **Cabeçalhos forjados:** um cliente que ainda mande `x-role` ou `x-request-user-id` é ignorado (o guard não lê). O CORS deixa de listá-los, então o browser nem os envia em requisição com preflight.
- **Ownership:** sem mudança. Rotas de board continuam escopadas pelo `requireBoardApi`; conta e upload pelo `ctx.profile`.
- **Landing pública:** só texto do dicionário e arquivos estáticos. Nada de dado de usuário. A rota pública nova é só `"/"` exato (teste de proxy na seção 5.2).
- **Segredos:** nenhum novo.
- **Impersonação:** deixa de existir; não há mais caso a cobrir.

### 7. Testes

Inventário completo feito com `grep`. Resumo:

| Workspace | Saem | Editados | Novos |
|---|---|---|---|
| `apps/api/__tests__` (124 arquivos) | 21 | 22 | 0 (casos novos em arquivos que ficam) |
| `apps/app/__tests__` (122 arquivos) | 40 | 17 | 1 (`landingPage.test.tsx`) |
| `packages/internationalization/__tests__` | 1 | 0 | 0 |
| `apps/e2e` | 3 specs + `support/panelNavigation.ts` | 8 | 0 |

**API, saem:** `adminGuard`, `authRequestContext`, `impersonationReadOnly`, `entitiesRouteImpersonation`, `entitiesRouteList`, `entitiesRouteOwnerScope`, `entitiesSummaryRoute`, `entityPhotoReference` (os casos de `normalizePhotoReference`/`isUsablePhotoReference`, se houver, mudam para um `photoReference.test.ts`), `notificationMapper`, `notificationRepository`, `notificationsRoute`, `notificationsRouteImpersonation`, `usersRoute`, `usersSummaryRoute`, `usersActivitySummaryRoute`, `usersAdminArchiveAccess`, `userActivitySummaryRepository`, `userRepositoryList`, `accountPasswordRoute`, `welcomeNotification`, `activityRecorder`. `activityWindows` só sai se as exportações que ele cobre saírem.

**API, editados:** `commonPanelGuard` vira `sessionGuard` (401 sem token, 403 `AUTH_PROFILE_NOT_FOUND` sem perfil, passa com perfil `type: "admin"`, ignora `x-role`); `guardsStampActivity` sai ou vira o caso "o guard não grava atividade" dentro de `sessionGuard`; `boardsRoutes`, `boardCardsRoutes`, `boardMembersRoutes`, `cardEventsRoutes`, `cardRunsRoutes`, `runnersRoutes`, `specDraftRoutes`, `fileUploadRoute`, `storageUpload.emulator` perdem o ator admin e os cabeçalhos de papel; `boardAccess` perde o argumento `isImpersonating` e ganha "dono sem documento ganha documento"; `accountRoute` perde o caso de impersonação; `storageEmulatorIsolation` troca `withPhotoUrl`; `accountAvatar` importa de `photo-reference`; `mergedUserPayload`, `authSignInGithubRoute`, `userMergeArchivedProfile` perdem o mock de `lib/notifications`; `baseRepository` troca a fixture `entity` por `board-member` ou por uma fixture local; `firestoreIndexes` perde as asserções de `entity`, `notification` e dos dois índices de admin; `adminCreateUserErrorCodes` fica só com `adminAuthErrorReason`; `accountSchema` perde `parseChangePassword`; `paginationQuery` sai junto com `pagination.schema`; `corsOrigin` troca `/entities` por `/boards` nos caminhos de exemplo e confere que `x-role` não está mais em `Access-Control-Allow-Headers`.

**App, saem:** `accountSecurityForm`, `adminHomeActivityDegraded`, `adminHomeClient`, `adminHomePrefetch`, `authRequestPanel`, `deriveAuthRequestProps`, `panelNavbarControls`, `panelSnapshot`, `panelState`, `panelStore`, `impersonationReadOnlyNotice`, `commonHomeClient`, `commonNavRoutes`, `editUserPageOwnAccount`, `useUserCrudSelfLockout`, `userActivitySection`, `userFormFieldsTypeLock`, `userRecencyChart`, `usersListArchiveLabels`, `usersListLastAccess`, `useListUsers`, `entitiesListReadOnly`, `entityBirthdateField`, `entityFormSchema`, `entityFormsReadOnly`, `entityTypeChart`, `useEntityCrud`, `useEntitySummary`, `useListEntities`, `notificationCopy`, `notificationsBell`, `useNotifications`, `sidebarActiveQuery`, `sidebarBrand`, `sidebarState`, `sidebarPersistence`, `navActive`.

**App, editados:** `accountTabs` (duas abas, sem aviso de impersonação); `accountPreferencesForm`, `boardMembersChangeRole`, `specDraftDetail` (sem mock do painel; sai o caso "admin impersonando"); `focusNotObscuredScrollPadding` (sem mocks de sidebar e `PanelNavbarControls`); `panelLayoutTitle` (só o layout comum); `panelTitles` (sem `admin` e `/entities`); `panelErrorRequestId` (dirigido por um hook de board, ex.: `useBoardMemberCrud`); `serverGuards` (sem `requireAdmin`); `passwordPolicySchemas` e `passwordPolicyCopy` (sem admin e sem `account.security`; ficam os casos do login do emulador, se houver); `accountFormSchema` (sem senha); `postLoginPreferences` (sem o redirect de admin; destino com locale preferido termina em `/boards`); `authHeaderOwnership` (passa a cobrir o `ApiAuthProvider`: bearer aplicado no primeiro render, limpo sem sessão, `sdkAuthorized` só com token); `postAuthRedirectTarget` (troca `/admin/users` por `/boards/x`); `imageUploadInput` (copy de `account` no lugar de `entities.form.photoUpload`); `proxy` (casos novos de 5.2); `profileDropdownAccount` (Perfil e Preferências com os `href` certos).

**App, novo:** `landingPage.test.tsx`: renderiza a página com o dicionário real; tem `h1`, o texto da ideia, um `<video>` com `muted`, `loop`, `playsInline`, duas `source` (webm antes de mp4) e `poster`, e o link para `/pt-br/sign-in`. É teste de componente, sem servidor.

**Nível:** tudo unitário ou de rota com `vi.mock`. Os testes de emulador que ficam (`firestoreRules.emulator`, `storageRules.emulator`, `storageUpload.emulator`, `storageEmulatorIsolation`) só são editados, porque o objeto deles é a infra.

**E2E (`apps/e2e`):**

| Arquivo | Destino |
|---|---|
| `tests/entityCrud.spec.ts`, `tests/panelSwitch.spec.ts`, `tests/focusNotObscured.spec.ts` | saem |
| `support/panelNavigation.ts` | sai; entra `support/accountMenu.ts` (abre o menu do avatar e escolhe Perfil ou Preferências) |
| `tests/signIn.spec.ts` | comum entra e cai em `/{locale}/boards`; deep link usa `/{locale}/account?tab=preferences` no lugar de `/entities`; sai o caso de admin (linhas 43-53) |
| `tests/githubSignIn.spec.ts` | destino esperado `/{locale}/boards` (linha 53) |
| `tests/accountSettings.spec.ts` | chega à conta pelo menu do avatar; sem `?tab=security` (linhas 17-58) |
| `tests/a11yDark.spec.ts` | anônimo: `/{locale}` (landing) e `/sign-in`; comum: `/boards` (vazio, a conta do seed não tem GitHub) e `/account?tab=profile\|preferences`; sai o bloco admin (74-89) |
| `tests/global.setup.ts` | sem o login de admin (56-66); o comum espera `/{locale}/boards` e aquece `/boards` e `/account` no lugar das rotas de `entity` (38-54) |
| `playwright.config.ts:16` | `CRITICAL_FLOWS = /signIn\.spec\.ts$/` |
| `support/seedAccounts.ts`, `support/paths.ts` | sem a conta admin, sem `SEEDED_ENTITY_NAME`, sem `AUTH_STATE.admin` |

A barra fixa com formulário longo, que o `focusNotObscured.spec.ts` media, perde cobertura E2E (risco aceito pela spec). O `focusNotObscuredScrollPadding.test.tsx` unitário continua.

**Seed (`apps/api/scripts`):** `seed-emulator.mjs` cria só `user@example.com` e `user2@example.com` (senha de dev já documentada no `docs/SETUP.md`), sem entities, sem notificações e sem as coleções `entity` e `notification` na limpeza (linhas 15-17, 25-29, 36-108, 153-219). `create-dev-admin.mjs` sai, junto com o script `create-dev-admin` em `apps/api/package.json:11`. `seed:timeline` não muda.

### 8. O que o `/test` vai percorrer

Rodar `pnpm emulators`, `pnpm seed`, `pnpm seed:timeline`, `pnpm dev`. Light, dark e celular (390×844).

1. **Landing anônima.** Janela anônima em `/` e em `/pt-br`: landing com título, frase, vídeo tocando em loop sem som e o botão "Entrar com GitHub". O botão leva a `/pt-br/sign-in`. Medir o peso do vídeo baixado na aba de rede (só um formato). Com `prefers-reduced-motion: reduce` emulado, aparece a imagem parada e o vídeo não.
2. **Landing com sessão.** Logado, abrir `/pt-br`: vai direto para `/pt-br/boards`, sem a landing aparecer.
3. **Rota protegida anônima.** Anônimo em `/pt-br/boards`: vai para `/pt-br/sign-in?redirect=%2Fpt-br%2Fboards`; ao entrar, volta para `/pt-br/boards`.
4. **Cabeçalho.** Em `/boards`, um board e um card: marca à esquerda leva a `/boards`, tema troca, menu do avatar mostra Perfil, Preferências, Cookies (se o consentimento estiver ativo) e Sair. Sem sidebar e sem botão de abrir sidebar. No celular, o cabeçalho cabe sem rolagem horizontal.
5. **Conta.** Perfil e Preferências pelo menu abrem a aba certa. `/pt-br/account?tab=security` abre Perfil. Salvar uma preferência funciona.
6. **Perfil admin legado.** No emulador, gravar `type: "admin"` no documento `user` de `user@example.com` (console do emulador do Firestore), recarregar: `/boards` abre, criar/abrir board funciona, nenhuma ida para `/admin`.
7. **Rotas removidas.** `/pt-br/entities`, `/pt-br/playground`, `/pt-br/admin` e `/pt-br/admin/users` dão a página 404; o botão "início" do 404 leva a `/pt-br/boards` logado e a `/pt-br` anônimo.
8. **Board continua de pé.** Mover card, abrir card, responder pergunta, membros (trocar papel), credenciais e rascunho de spec com anexo (a `spec-authoring`) funcionam como antes. Isso pega regressão do `isImpersonating` removido e do guard novo.
9. **API.** Com o bearer de `user@example.com`: `GET /entities`, `/notifications`, `/users` → 404 `ROUTE_NOT_FOUND` (catch-all `apps/api/app/[[...path]]/route.ts:8`); `GET /boards` com `x-role: admin` no cabeçalho → 200 com os boards da própria pessoa.

Sem infra externa: nada fica 🔒. O GitHub App real não é preciso; o cliente falso do emulador cobre os papéis.

### 9. Critérios de aceite (rascunho para o `/test`)

O `/test` escreve no formato §9.1. Os casos que não podem faltar: perfil `type: "admin"` usa o board; `x-role` ignorado; landing anônima e redirect com sessão; `/boards` anônimo ainda protegido; menu do avatar com os quatro itens; `?tab=security` cai em Perfil; rotas removidas em 404 (app) e sem rota (API); fluxos do board e anexo da `spec-authoring` sem regressão; `prefers-reduced-motion`; light, dark e celular.

---

## Etapa 2: Blueprint técnico

### 10.1 Contrato

Sem DTO novo. Diferença no SDK:

```ts
// packages/sdk/src/types/user/user.ts (depois)
export type UserPreferences = {
    theme: "light" | "dark" | "system";
    locale: "pt-br";
};

export type UserDTO = {
    id: string;
    reference_id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    phone?: string | null;
    avatar?: string | null;
    preferences?: UserPreferences | null;
    github?: GithubIdentity | null;
};

export type UserWithAuthDTO = UserDTO & { /* sem mudança */ };

// packages/sdk/src/actions/auth/action.ts
export type AuthMePayload = {
    uid: string;
    email: string | null;
    preferences: UserPreferences | null;
};

// packages/sdk/src/client/base.ts
export type Project = "app" | "web" | "api";
export type Config = { project: Project; url: string };
// saem: Context, setAuthRequestContext, clearAuthRequestContext, x-role

// packages/sdk/src/client/index.ts
export class Client extends BaseClient {
    application!: ApplicationActions;
    authApi!: AuthActions;
    board!: BoardActions;
    boardCard!: BoardCardActions;
    boardDraft!: BoardDraftActions;
    boardMember!: BoardMemberActions;
    file!: FileActions;
    account!: AccountActions;
    runner!: RunnerActions;
    // saem: user, entity, notification e os métodos de contexto
}
```

Sai também o getter `requestRole` (`base.ts:93-98`), que lê o `x-role` dos cabeçalhos padrão do axios.

### 10.2 Guard

```ts
// apps/api/app/(guards)/session.ts
export type SessionAuthContext = {
    user: UserRecord;
    profile: UserDTO;
};

export function requireSessionApi<TRouteContext extends RouteContext = undefined>(
    handler: SessionHandler<TRouteContext>
) {
    return async (req: NextRequest, routeContext?: TRouteContext) => {
        const user = await resolveApiActor(req);
        if (!user) {
            return Response.json(
                { error: { code: "AUTH_INVALID_TOKEN" } },
                { status: HTTP_STATUS.UNAUTHORIZED }
            );
        }
        const profile = await userRepository.findByReferenceId(user.uid);
        if (!profile) {
            return Response.json(
                { error: { code: "AUTH_PROFILE_NOT_FOUND" } },
                { status: HTTP_STATUS.FORBIDDEN }
            );
        }
        return handler(req, { ...(routeContext ?? {}), user, profile } as ...);
    };
}
```

```ts
// apps/api/app/(guards)/board.ts (trecho)
-export type BoardAuthContext = CommonPanelAuthContext & {
+export type BoardAuthContext = SessionAuthContext & {
...
-    return requireCommonPanelApi<BoardRouteContext>(async (req, ctx) => {
+    return requireSessionApi<BoardRouteContext>(async (req, ctx) => {
         const params = await ctx.params;
         const resolved = await resolveBoardAccess({
             boardId: params.id,
-            profile: ctx.subjectProfile,
+            profile: ctx.profile,
             capability,
-            isImpersonating: ctx.authRequest.isImpersonating,
         });
```

Exemplo de resposta: `GET /boards` sem perfil no Firestore →

```json
{ "error": { "code": "AUTH_PROFILE_NOT_FOUND" } }
```

com status 403.

### 10.3 Tabela `error.code` → status

| Código | Status | Onde |
|---|---|---|
| `AUTH_INVALID_TOKEN` | 401 | guard de sessão (sem mudança) |
| `AUTH_PROFILE_NOT_FOUND` | 403 | guard de sessão (novo) |
| `BOARD_NOT_FOUND`, `BOARD_ROLE_INSUFFICIENT`, `BOARD_REPOSITORY_ACCESS_LOST` | 404, 403, 403 | `requireBoardApi` (sem mudança) |

### 10.4 Persistência

Documento `user` gravado por `createDefaultUserProfile` depois: `{ reference_id, createdAt, updatedAt, deletedAt: null }` mais o que o merge do GitHub já acrescenta. `userMapper.toPersistence` tira `type` e `lastAccessAt` da whitelist; `toDTO` deixa de ler os dois. Documento antigo com `type` continua lido sem erro.

### 10.5 Front: arquivos

**Novos:**

```
apps/app/app/[locale]/(landing)/page.tsx
apps/app/public/landing/agent-board.{webm,mp4}
apps/app/public/landing/agent-board-poster.png
apps/app/shared/providers/ApiAuthProvider.tsx
apps/app/__tests__/landingPage.test.tsx
packages/internationalization/translations/apps/app/pages/landing/index.ts
apps/api/(shared)/lib/photo-reference.ts
apps/api/app/(guards)/session.ts
apps/e2e/support/accountMenu.ts
```

**Pseudo-diffs principais:**

```diff
// apps/app/proxy.ts
-export const PUBLIC_PATHS = ["/sign-in"] as const;
+export const PUBLIC_PATHS = ["/", "/sign-in"] as const;
...
             const target = postAuthRedirectTarget(
                 request.nextUrl.searchParams.get("redirect"),
-                `/${currentLocale}`
+                `/${currentLocale}/boards`
             );
```

O comentário em `proxy.ts:255-259`, que explica o salto de admin pelo layout comum, sai ou passa a dizer só que o destino padrão é a lista de boards.

```diff
// apps/app/app/layout.tsx
-        panelSnapshot,
...
-        resolvePanelSnapshot(),
...
-    const initialPanel = { snapshot: panelSnapshot, actorUid: sessionUser?.uid ?? null };
...
-                                    <ClientLayout initialPanel={initialPanel}>
+                                    <ClientLayout actorUid={sessionUser?.uid ?? null}>
```

```diff
// apps/app/app/[locale]/clientLayout.tsx
-        <AuthRequestPanelProvider initialPanel={initialPanel}>
+        <ApiAuthProvider actorUid={actorUid}>
```

```diff
// apps/app/shared/hooks/useAuthorizedQuery.ts
-import { usePanelState } from "@/shared/stores/panelStore";
+import { useSdkAuthorized } from "@/shared/providers/ApiAuthProvider";
...
-    const sdkAuthorized = usePanelState((state) => state.sdkAuthorized);
+    const sdkAuthorized = useSdkAuthorized();
```

O comentário em `useAuthorizedQuery.ts:11-19` cita o "impersonation picker" e a lista de entidades como exemplos; troca por um exemplo que ainda exista (a lista de boards) ou fica só a regra.

```diff
// apps/app/lib/server/apiServerClient.ts
-export async function getServerApiClient(context: Context = "common"): Promise<Client | null> {
+export async function getServerApiClient(): Promise<Client | null> {
...
-    const client = new Client({ url, project: "app", context });
+    const client = new Client({ url, project: "app" });
```

```diff
// apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/page.tsx (e as outras 6 page.tsx)
-    if (id && !(await isImpersonating())) {
-        const client = await getServerApiClient("common");
+    if (id) {
+        const client = await getServerApiClient();
```

```diff
// apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/BoardClient.tsx
-function permissionsFor(role, isImpersonating: boolean) {
+function permissionsFor(role) {
     return {
-        canPrioritize: canPrioritizeCards(role) && !isImpersonating,
-        canTrigger: canTriggerStages(role) && !isImpersonating,
+        canPrioritize: canPrioritizeCards(role),
+        canTrigger: canTriggerStages(role),
```

```diff
// apps/api/(shared)/lib/user-merge.ts
-    const defaultProps = { type: UserType.COMMON, reference_id: uid, ...dto };
-    const created = await userRepository.create({ ...defaultProps });
-    if (created.type === UserType.COMMON) {
-        await emitNotificationQuietly({ ... });
-    }
-    return created;
+    return userRepository.create({ reference_id: uid, ...dto });
```

### 10.6 i18n

Ver 5.9. Árvore final de `pages`: `common` (boards, account sem security, routes só com boards, notFound), `landing`, `navbar` (`homeLinkLabel`), `signIn` e o que já existe fora de admin, entidades e impersonação.

### 10.7 Ordem de implementação e commits

A ordem padrão do repo é SDK → API → app → i18n. Para remover, ela inverte: tira primeiro quem consome, depois quem fornece, senão o `typecheck` quebra a cada commit. A cópia nova (`landing`, `homeLinkLabel`, `AUTH_PROFILE_NOT_FOUND`) entra antes do código que a usa, pelo mesmo motivo. A tabela é a sugestão para o `/review`; ele pode juntar commits vizinhos.

| # | Commit | Conteúdo | Compila? |
|---|---|---|---|
| 1 | `feat(internationalization): add landing, header and session profile copy` | `pages/landing`, `navbar.homeLinkLabel`, `AUTH_PROFILE_NOT_FOUND` | sim (só acréscimo; `navbar` antigo fica até o 15) |
| 2 | `refactor(app): remove the playground, entities and entity home` | telas, hooks, testes, entradas em `paths`, `routes`, `panelTitles`, `queryKeys`; `/{locale}` provisoriamente sem página até o 6 | sim |
| 3 | `refactor(app): remove the admin area` | `(admin)/**`, `requireAdmin`, `useListUsers`, ramos de admin em `postLoginNavigation`, `notFoundHome`, `(common)/layout.tsx`; testes | sim |
| 4 | `refactor(app): remove notifications` | componentes, hooks, `useAuthorizedInfiniteQuery`, `shared/lib/pagination`, testes | sim |
| 5 | `refactor(app): replace the panel state with a bearer-only auth provider` | `ApiAuthProvider`, `useAuthorizedQuery`, remoção de `panelStore`/`panelState`/`authRequestHeaders`/`panelSnapshot`/`PanelNavbarControls`/`ImpersonationReadOnlyNotice`, os 11 arquivos de 5.5 e as 7 `page.tsx`; testes | sim (o SDK ainda tem os métodos de contexto, só ninguém chama) |
| 6 | `feat(app): header without sidebar and account in the avatar menu` | `Navbar`, `ProfileDropdown`, `(common)/layout.tsx`, `Header`, breadcrumbs, aba Segurança fora, sidebar fora; testes | sim |
| 7 | `feat(app): public landing page with the board animation` | `(landing)/page.tsx`, `public/landing/*`, `proxy.ts`, fallbacks do login e do 404; `landingPage.test.tsx`, `proxy.test.ts` | sim |
| 8 | `refactor(api): remove the entity example resource` | rotas, repo, mapper, schema, `photo-reference.ts`, índices de `entity`, testes | sim |
| 9 | `refactor(api): remove notifications` | rotas, repo, mapper, lib, `welcome` no `user-merge`, `pagination.schema`, índices, testes | sim |
| 10 | `refactor(api): remove admin user management` | `users/**`, `admin.ts`, `activity-recorder`, métodos de `user.repository`, `user-admin.schema`, mapeadores do toolkit, índices de admin, testes | sim |
| 11 | `refactor(api): session guard without panel role or impersonation` | `session.ts`, `board.ts`, `board-access`, `board-list`, as rotas com `ctx.profile`, `auth-request-context` e `impersonation-read-only` fora, `account/password` e `session-revocation` fora, CORS, `user-merge` sem `type`, mapper; testes | sim |
| 12 | `refactor(sdk): drop entity, notification, admin user and panel context` | ver 10.1 | sim (API e app já não usam) |
| 13 | `refactor(auth): drop panel roles and request context types` | `packages/auth/types.ts` | sim |
| 14 | `refactor(shared): drop the request context headers` | `AUTH_REQUEST_HEADER` | sim |
| 15 | `refactor(internationalization): remove admin, entity, notification and panel copy` | ver 5.9 | sim |
| 16 | `chore(api): seed only common accounts` | `seed-emulator.mjs`, `create-dev-admin.mjs`, `apps/api/package.json` | sim |
| 17 | `test(e2e): cover the landing and the board shell instead of entity and admin` | ver seção 7 | sim |
| 18 | `docs: describe the board-only app` | `README.md`, `docs/*.md` (fora de `docs/features/`), `docs/AUTH-PANEL.md` | n/a |
| 19 | `feat(claude): use boardMember as the reference slice` | `CLAUDE.md`, `AGENTS.md`, `apps/*/CLAUDE.md`, skills, agents, commands | n/a |
| 20 | `docs(features): app-cleanup` | `docs/features/app-cleanup/` | n/a |

`firestore.indexes.json` fica na raiz e não tem projeto próprio no padrão de commits. Ele entra nos commits 8, 9 e 10, junto com o `firestoreIndexes.test.ts` que o confere.

Entre o commit 2 e o 7, `/{locale}` não tem página e o proxy manda o anônimo para o login (não é rota pública ainda). Ninguém usa a branch nesse intervalo, mas se o `/review` preferir, os commits 2 e 7 podem trocar a home de `entity` direto pela landing.

### 10.8 Docs e ferramental

Inventário por arquivo (contagem de menções a `entity`, admin, impersonação, notificação, sidebar, `AUTH-PANEL`):

| Arquivo | O que muda |
|---|---|
| `CLAUDE.md` | "Referência viva" (linhas 85-89) aponta para o slice `boardMember`; regra de ouro 4 cita `requireSessionApi` e `requireBoardApi`; a linha da skill `/new-crud` diz "padrão `boardMember`" |
| `AGENTS.md` | linhas 9, 46, 47, 57, 58, 80: tira admin, impersonação e o exemplo `super(db, "entity", ...)` (troca por `super(db, "boardMember", boardMemberMapper)` ou o nome real da coleção) |
| `apps/app/CLAUDE.md` | cabeçalho (linha 3), seção "Autenticação / admin / contexto de painel" (76-89) reescrita para sessão + `ApiAuthProvider` + `useAuthorizedQuery`; 404 (100); exemplos `entitiesMessages` (66); sidebar (88) |
| `apps/api/CLAUDE.md` | linhas 3, 12, 31: guards `requireSessionApi`/`requireBoardApi`; exemplo de 404 com `boardMember` |
| `.claude/skills/new-crud/SKILL.md` | o mapa de arquivos (50-64) e o texto passam a `boardMember`; guard é `requireBoardApi` (recurso de board) ou `requireSessionApi` (recurso da pessoa) |
| `.claude/skills/new-api-route/SKILL.md` | exemplos em 8, 13, 22, 34, 40, 41, 44 |
| `.claude/skills/write-tests/SKILL.md` | exemplos de schema, mapper, repo, rota e hook com `board-member`; mock do guard (55); sai o item de impersonação (72) |
| `.claude/skills/i18n-sync/SKILL.md` | modelo de arquivo `common/boards.ts` (bloco `members`) no lugar de `entities.ts` |
| `.claude/agents/*.md`, `.claude/commands/analyze.md`, `cycle.md`, `test.md` | referências a `entity`, matriz comum × admin × impersonação, link para `AUTH-PANEL.md` |
| `docs/feature-analysis-guide.md` | seção 0 (tabela do slice), 1 (área do painel), 4.1 (guards), 5.1 (prefetch com `isImpersonating`), 6 (impersonação), 8 e 9 (comum × admin) |
| `docs/review-checklist.md` | linhas 25, 62-67, 83, 91, 98, 116, 118 |
| `docs/ARCHITECTURE.md` | contexto de painel e `x-role` (27-48), seção de impersonação (68-75), "Notificações no app" (77-79) |
| `docs/SECURITY.md` | lista de rotas (26), `x-role` (40), `entity-photo` (102), admin (9-34, 188, 229) |
| `docs/SETUP.md` | seed sem admin, sem entities (256-262, 413, 511-513), seção "Primeiro admin" / `create-dev-admin` (568-599) sai |
| `docs/GLOSSARY.md` | termos de admin, impersonação, painel e sidebar (36-57, 73); `entity` (14) |
| `docs/PRE-PRODUCTION.md` | itens de admin (68-75, 87, 95) e TTL de notificação (200-209) saem |
| `docs/AI-WORKFLOW.md` | 61, 212 |
| `docs/board/DECISIONS.md:131` | o que ficou do core passa a ser só auth, conta, Storage e analytics |
| `docs/AUTH-PANEL.md` | vira uma página curta sobre sessão (proxy → `requireSession` → `requireSessionApi` → `requireBoardApi`, bearer no SDK, pós-login com carga completa). Os seis arquivos que linkam para ele continuam válidos (decisão 8). |
| `README.md` | lista de recursos (63), seed (82), link de auth (119) |
| `docs/board/SCREENS.md` | uma linha para a landing e uma para o cabeçalho/menu do avatar |
| `specs/reference/AUDIT.md` | não editar: é do `/spec --sync` |
| `.claude/rules/git-commits.md:23`, `revisor-codigo.md:61` | o exemplo de branch `api/feat/entity-soft-delete` troca por um nome de board (ex.: `api/feat/board-archive`) |

Varredura de saída (o `/review` roda):

```bash
grep -rniE "\bentit(y|ies)\b|requireAdminApi|requireCommonPanelApi|isImpersonating|playground|AUTH-PANEL|x-role" \
  CLAUDE.md AGENTS.md apps packages .claude docs README.md \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=features
```

Sobra aceitável: `Mapper<Entity, DTO>` como nome genérico em `Mapper.ts`, a palavra "identity", texto genérico das skills de design, e `docs/features/**` (histórico).

### 10.9 Env e config

Nenhuma variável nova. Nenhuma variável sai: não há env só de admin, entidade ou notificação (conferir `apps/api/.env.example` e `apps/app/.env.example` por `ADMIN`; `FIREBASE_ADMIN_*` é o Admin SDK e fica).

### 10.10 Pré-requisitos manuais de infra (fora do código)

| Item | Quem / quando |
|---|---|
| Publicar `firestore.indexes.json` no projeto de produção (`firebase deploy --only firestore:indexes`). Os índices removidos do arquivo **não** somem do projeto sem `--force` ou sem apagar no console; sobram sem custo de leitura, mas ocupam a lista. | usuário, depois do merge; registrar em `docs/PRE-PRODUCTION.md` |
| Regras do Firestore e do Storage: nada a publicar (só o comentário de exemplo muda). | n/a |
| Dados órfãos em produção (`entity`, `notification`, `type`, `lastAccessAt`): ficam; limpeza é script avulso, fora do corte. | registrar em `docs/PRE-PRODUCTION.md` |
| Dev local: quem tem emulador com estado antigo roda `pnpm seed` de novo (ele limpa Auth e Firestore). | quem desenvolve |

### 10.11 Riscos

| Risco | Mitigação |
|---|---|
| `"/"` em `PUBLIC_PATHS` abrir rotas por prefixo | teste de proxy: anônimo em `/pt-br/boards` continua indo para o login |
| Loop `/pt-br` ↔ `/pt-br` com sessão | fallback do proxy para `/boards` no mesmo commit da landing; teste de proxy cobre |
| Primeiro request do browser sair sem bearer | `ApiAuthProvider` mantém a escrita no primeiro render e o `sdkAuthorized`; `authHeaderOwnership.test.tsx` reescrito cobre |
| Link quebrado em string (`/admin`, `/entities`, `/playground`, `?tab=security`) | `grep` da 10.8 mais o fluxo 7 do `/test` |
| Conflito com specs em paralelo (`board-access.ts`, `utils.ts` do i18n, quase todo arquivo de `boards/`) | rodar sozinha, como a spec manda |
| Merge do upstream com "modificado lá, removido aqui" | `docs/board/DECISIONS.md` manda manter a remoção; a lista deste plano (seções 4.1, 5.6, 5.9) é o registro |
| E2E mais fino | aceito pela spec; `focusNotObscuredScrollPadding.test.tsx` continua |
| Cookie `bp:*` de painel antigo no browser | ninguém lê; expira sozinho em até 14 dias |
| Perfil sem `github` (conta de senha do emulador) vê `/boards` vazio | é o comportamento atual de `listBoardsOf` (`board-list.ts:30-35`); o a11y mede o estado vazio |

---

## Perguntas em aberto

Nenhuma ficou sem resposta. As decisões abaixo foram tomadas pela escada spec → padrão do repo → menor raio de impacto; o usuário pode reverter qualquer uma antes do `/develop`.

1. **Aba Segurança sai** (decidida pelo orquestrador). Saem a rota `account/password`, `session-revocation.ts` e três códigos. Descartada: manter a aba só no emulador.
2. **Slice de referência vira `boardMember`** (decidida pelo orquestrador). Descartada: criar um recurso de exemplo novo.
3. **Upload de avatar fica** (decidida pelo orquestrador); `files/route.ts` e o Storage ficam, e os helpers de foto mudam para `photo-reference.ts`. Descartada: avatar sempre do GitHub.
4. **`@repo/analytics` e o banner de cookies ficam** (decidida pelo orquestrador); o item Cookies continua no menu do avatar.
5. **Landing em `/{locale}`, num grupo `(landing)` sem layout**, porque o proxy já leva `/` para `/{locale}`. Descartadas: um app separado (outro deploy para uma página) e a landing dentro de `(unauthenticated)` (o layout do login não serve).
6. **Guard renomeado para `requireSessionApi`, com `ctx.profile`**, e código `AUTH_PROFILE_NOT_FOUND` no lugar de `COMMON_PANEL_FORBIDDEN`. Recomendação: renomear, porque "painel comum" e "subject" só fazem sentido com impersonação, e as skills e docs vão ser reescritas de qualquer forma. Descartada: manter os nomes (menos arquivos tocados, mas o nome passaria a mentir em todas as rotas).
7. **O grupo de rota `(common)` mantém o nome.** Renomear não muda URL e tocaria todos os caminhos de teste e doc. Descartada: renomear para `(app)`.
8. **`docs/AUTH-PANEL.md` vira uma página curta sobre sessão**, no mesmo caminho, para não quebrar os seis links que apontam para ele. Descartada: apagar e corrigir os links (a spec aceita as duas).
9. **Primitivos do `@repo/design-system` sem consumidor ficam** (sidebar, chart, popover etc.) e a copy `components/ui/sidebar.ts` também. Mudança mínima fora do app; um fork futuro pode usar. Descartada: limpar o design system nesta spec.
10. **`UserType` e o campo `type` saem por inteiro**, não só o valor `ADMIN`. Um enum de um valor não carrega informação, e o guard não lê mais. Descartada: manter `UserType.COMMON` sozinho (menos testes tocados, mas o campo fica sem leitor).
11. **`lastAccessAt` deixa de ser carimbado e sai do DTO** junto com o registro de atividade. Descartada: manter o carimbo para uma métrica futura (ninguém lê hoje).
12. **Header `x-user-timezone` sai** com os outros `x-*`: a API lê e valida (`auth-request-context.ts:132-145`), mas nenhum handler usa `userTimezone`. Descartada: manter um cabeçalho de fuso sem consumidor.
13. **O seed fica sem conta admin.** O caso "perfil admin legado" vira teste unitário do guard e um passo manual do `/test` (fluxo 6). Descartada: manter `admin@example.com` no seed só para esse teste.
14. **Copy da landing**: a frase da seção 5.9 é proposta deste plano, a partir da descrição do produto no `CLAUDE.md`. O usuário pode trocar o texto sem mexer em código.
