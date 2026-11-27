# Handoff do develop: app-cleanup

Implementação do [`analyze/plan.md`](../analyze/plan.md) na rodada autônoma do `/cycle`. Nada commitado e
nada preparado no índice (`git diff --cached --stat` vazio). Arquivos removidos foram apagados com `rm`, sem
`git rm`. Saldo no working tree: 183 removidos, 200 alterados, 12 caminhos novos (`git status --short`).

## Desvios do plano

1. **A landing é pública só como raiz exata, não pelo `PUBLIC_PATHS = ["/", "/sign-in"]`.** O plano
   punha `"/"` na lista de prefixos e contava com `startsWith("//")` nunca casar. Casa: `/pt-br//boards`
   vira `appPath = "//boards"`, que passaria como público. `proxy.ts` ganhou `LANDING_PATH = "/"`
   comparado por igualdade; `PUBLIC_PATHS` continua `["/sign-in"]`. Teste em `proxy.test.ts`:
   anônimo em `/pt-br//boards` vai para o sign-in.
2. **`ApiAuthProvider` escreve o bearer em todo render, não só no primeiro.** O plano previa escrita no
   primeiro render e reaplicação em efeito quando o token muda. Com efeito, o render em que
   `useSdkAuthorized()` vira `true` libera a query do filho, e o efeito do filho roda antes do efeito do
   pai: a request sairia sem token. A escrita é idempotente (`setHeader`) e só acontece no browser. O
   efeito ficou só para remover o header quando `actorUid` é `null`. Coberto por
   `authHeaderOwnership.test.tsx` ("has the header in place in the render that releases the queries").
3. **A landing usa `getBrand().name` no `h1`**, como o login e o 404, e o dicionário não tem `title`. O
   `metaTitle` ficou "Board Kanban para o Claude Code": com o nome do produto, o `createMetadata` geraria
   "agent-board | agent-board".
4. **`/account/password` saiu da lista estrita do rate limit** (`apps/api/proxy.ts`). O plano não citava; a
   rota não existe mais. A lista ficou `/auth/sign-in`, `/auth/sign-in/github`, `/files`, `/runner/register`.
5. **`user.repository` perdeu também `purgeProfile` e `touchLastAccess`**, que só o admin e o
   `activity-recorder` chamavam. O plano citava `list`, `summary`, `activitySummary` e `stampLastAccess`.
6. **Não havia `userMapper.toPersistence`.** O repositório de usuário não tem mapper; quem lia `type` era o
   `toSessionUser` (`user.mapper.ts`), que perdeu o campo. Documento antigo com `type` continua lido (o
   payload de sessão é allow-list; teste em `mergedUserPayload.test.ts` com perfil `type: "admin"`).
7. **`shared/lib/pagination.ts`, `MetricCard`, `ScrollToTopButton`, `PageBreadcrumb`,
   `useAuthorizedInfiniteQuery`** saíram depois de `grep` sem consumidor. Junto saiu
   `sharedComponentCopy.test.tsx`, que só testava o `PageBreadcrumb`.
8. **Testes renomeados**: `commonPanelGuard` → `sessionGuard`, `adminCreateUserErrorCodes` →
   `adminAuthErrorReason` (sobrou só `adminAuthErrorReason`, usado no `user-merge`), e os casos de
   `isUsablePhotoReference` do `entityPhotoReference` foram para `photoReference.test.ts`.
9. **`activityWindows.test.ts` saiu**: só testava exportações removidas e a constante de 15 minutos.
10. **`PANEL_PAGE_TITLES`**: o teste exigia que nenhum título de tela fosse igual ao nome da área. A área
    agora se chama "Boards" (`routes.platform.boards.list`), igual ao título de `/boards`. O teste passou a
    exigir só títulos distintos entre telas; o `default` do layout não aparece, porque toda tela registra o
    próprio título.
11. **`(common)/(pages)/loading.tsx` ficou.** Era o loading da home de `entity`, mas também cobre
    `/boards/new`, que não tem `loading.tsx` próprio.

## Blueprint → arquivos

| Item | Arquivos |
|------|----------|
| SDK (10.1) | `packages/sdk/src/client/{base,index,sessionAuthority}.ts`, `types/user/user.ts`, `types/account/account.ts`, `types/index.ts`, `actions/auth/action.ts`, `actions/account/action.ts`; removidos `actions/{entity,notification,user}`, `types/{entity,notification,pagination}` |
| `@repo/auth` / `@repo/shared` | `packages/auth/types.ts` (sem `UserRoleLevel`, `IAuthContextProps`, `canSwitchPanelEnvironment`, `UserProfile`, `parseUserProfileResponse`); `packages/shared/utils/helpers/auth-request-headers.ts` (sem `AUTH_REQUEST_HEADER`); `log.ts` (sem o escopo `notifications`) |
| Guard (10.2) | novo `apps/api/app/(guards)/session.ts`; `board.ts`; removidos `common-panel.ts`, `admin.ts`; 23 arquivos de rota alterados (8 passaram a `requireSessionApi`, os demais trocaram `ctx.subjectProfile` por `ctx.profile`) |
| API, remoções (4.1) | rotas `entities/**`, `notifications/**`, `users/**`, `account/password`; libs `notifications`, `activity-recorder`, `auth-request-context`, `impersonation-read-only`, `session-revocation`, `entity-photo`; repos/mappers de `entity` e `notification`; schemas `entity`, `user-admin`, `pagination`; `scripts/create-dev-admin.mjs` |
| Impersonação fora (4.3) | `(shared)/lib/board-access.ts`, `board-list.ts`, `boards/route.ts` |
| Foto (4.4) | novo `(shared)/lib/photo-reference.ts`; `account/route.ts`, `account-avatar.ts` |
| `user-merge` / CORS (4.5, 4.6) | `user-merge.ts`, `cors.ts`, `user.mapper.ts`, `user.repository.ts`, `account.schema.ts`, `toolkit-error-codes.ts`, `activity-windows.ts`, `proxy.ts` |
| Índices / rules | `firestore.indexes.json` (só `user` por `reference_id` + `deletedAt`); `firestore.rules` (exemplo comentado com `runner`) |
| Seed | `apps/api/scripts/seed-emulator.mjs` (só `user@` e `user2@`), `apps/api/package.json` sem `create-dev-admin` |
| Shell do app (5.3) | `(common)/layout.tsx`, `Navbar.tsx`, `ProfileDropdown.tsx`, `Header.tsx`, `paths.ts`; removidos `sidebar.tsx`, `routes.tsx`, `Sidebar.tsx`, `sidebarState.ts`, `navActive.ts` |
| Bearer (5.4) | novo `shared/providers/ApiAuthProvider.tsx`; `clientLayout.tsx`, `app/layout.tsx`, `useAuthorizedQuery.ts`, `shared/lib/client.ts`, `lib/server/apiServerClient.ts`; removidos `AuthRequestPanelContext.tsx`, `panelStore.ts`, `panelState.ts`, `authRequestHeaders.ts`, `panelSnapshot.ts`, `requireAdmin.ts`, `PanelNavbarControls.tsx`, `ImpersonationReadOnlyNotice.tsx`, `useListUsers.ts` |
| Board e conta sem impersonação (5.5) | os 11 clientes da tabela 5.5 e as 7 `page.tsx` com prefetch incondicional |
| Remoções do app (5.6) | `(admin)/**`, `entities/**`, `playground/`, home de `entity`, notificações, `AccountSecurityForm.tsx`, senha em `accountFormSchema.ts` e `useAccountMutations.tsx`, `accountTabRouting.ts` com duas abas; `panelTitles.ts`, `queryKeys.ts` |
| Redirects (5.2) | `proxy.ts`, `SignInForm.tsx`, `useSignedInRedirect.ts`, `postLoginNavigation.ts`, `notFoundHome.ts` |
| Landing (5.7) | novo `app/[locale]/(landing)/page.tsx`; `public/landing/agent-board.{mp4,webm}`, `agent-board-poster.png` |
| i18n (5.9) | novo `pages/landing/index.ts`; `pages/index.ts`, `navbar/index.ts`, `common/index.ts`, `common/routes/index.ts`, `common/account.ts`, `shared/index.ts`, `packages/shared/utils.ts`; removidos `pages/admin/**`, `pages/impersonation`, `common/entities.ts`, `common/home.ts`, `shared/notifications.ts`, `__tests__/chartAxisLabels.test.ts` |
| E2E (7) | removidos `entityCrud`, `panelSwitch`, `focusNotObscured` e `support/panelNavigation.ts`; novo `support/accountMenu.ts`; `signIn`, `githubSignIn`, `accountSettings`, `a11yDark`, `global.setup`, `playwright.config.ts`, `support/{seedAccounts,paths}.ts` |
| Docs (10.8) | `docs/AUTH-PANEL.md` reescrito como página curta de sessão; `ARCHITECTURE`, `SECURITY`, `SETUP`, `GLOSSARY`, `PRE-PRODUCTION` (item 10 trocado por índices e dados órfãos), `AI-WORKFLOW`, `feature-analysis-guide`, `review-checklist`, `board/DECISIONS`, `board/SCREENS`, `README.md` |
| Ferramental (10.8) | `CLAUDE.md`, `AGENTS.md`, `apps/{api,app}/CLAUDE.md`, skills `new-crud`, `new-api-route`, `write-tests`, `i18n-sync`, agents `analista-qa`, `code-reviewer`, `desenvolvedor`, `estrategista-produto`, `mediador-pr`, `planejador-tarefa`, `revisor-codigo`, commands `analyze`, `cycle`, `test`, `rules/git-commits.md` |

## Contrato e raio de impacto

- `Client` perde `user`, `entity`, `notification`, os métodos de contexto, `setAuthRequestContext`,
  `clearAuthRequestContext` e o getter `requestRole`. `Config` perde `context`.
- `UserDTO` perde `type` e `lastAccessAt`; `UserType` sai. `AuthMePayload` perde `type`.
- `AccountActions.changePassword`, `ChangePasswordRequest` e `AccountConfirmation` saem.
- Consumidores fora de `apps/app` e `apps/api`: `apps/runner` não importa nada disso (typecheck do runner
  verde, ver abaixo).

## Códigos de erro

- Novo: `AUTH_PROFILE_NOT_FOUND` (403), com copy em `apiErrors`.
- Removidos de `apiErrors` (27), cada um sem emissor em `apps/`, `packages/` fora de testes, medido com um
  `grep` por chave: `ADMIN_FORBIDDEN`, 8 `AUTH_REQUEST_*`, `USERS_DELETE_AUTH_FAILED`,
  `USERS_SELF_LOCKOUT_FORBIDDEN`, `ACCOUNT_CURRENT_PASSWORD_INVALID`, `ACCOUNT_PASSWORD_UNSUPPORTED`,
  `AUTH_SESSIONS_NOT_REVOKED`, `USERS_NOTHING_TO_UPDATE`, `USERS_AUTH_EMAIL_ALREADY_IN_USE`,
  `USERS_AUTH_INVALID_EMAIL`, `USERS_AUTH_SIGN_UP_FAILED`, `USERS_PROFILE_CREATE_FAILED`,
  `COMMON_PANEL_FORBIDDEN`, `ENTITY_NOT_FOUND`, `ENTITY_PHOTO_INVALID`, `PAGINATION_CURSOR_INVALID`,
  `PAGINATION_INDEX_MISSING`, `SUMMARY_INDEX_MISSING`, `NOTIFICATION_NOT_FOUND`, `NOTIFICATIONS_INDEX_MISSING`.

## Landing: vídeo

Gerado com os três comandos `ffmpeg` da seção 5.7 do plano (ffmpeg 7.1). Tamanhos por `ls -l`:
`agent-board.mp4` 787.507 B, `agent-board.webm` 738.543 B, `agent-board-poster.png` 59.745 B (GIF de
origem: 3.922.744 B). O primeiro quadro mostra o board com o título sobreposto; conferi abrindo o PNG, o
que não é medição, então o `/test` confirma.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 834 arquivos, sem erro |
| Typecheck + Vitest + lint, todos os workspaces | `pnpm turbo run lint typecheck test` | 27/27 tarefas; api 87 arquivos / 1012 testes, app 83 / 659, auth 211, sdk 9, shared 51, i18n 33, security 65, e2e 16, runner 46 |
| Emulador | `PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH pnpm --filter api test:emulator` | 8 arquivos / 133 testes; o script subiu e derrubou os emuladores (`lsof` nas portas 8080/9199 vazio depois) |
| `apiErrors` | `pnpm --filter api test apiErrorCodes` | 2/2 |
| Testes da `spec-authoring` | incluídos no `api test` e `app test` acima (`specDraftRoutes`, `specDraftDetail`, `specDraftActions`, `storageEmulatorIsolation`, attachments) | verdes |

Não rodei `next build`, `next dev`, smoke no browser nem `pnpm e2e`. Não há `.env` em `apps/app` nem em
`apps/api` neste checkout.

## Varredura de referências mortas

Comando: `grep -rniE "\bentit(y|ies)\b|requireAdminApi|requireCommonPanelApi|isImpersonating|playground|x-role|/admin\b|notification|UserType|tab=security|imperson|subjectProfile|COMMON_PANEL|create-dev-admin|admin@example" CLAUDE.md AGENTS.md apps packages .claude docs README.md kit firestore.rules` (fora de `node_modules`, `.next`, `docs/features`). O que sobrou, e por quê:

- `Mapper<Entity, DTO>` e `toDTO(entity)` em `Mapper.ts`, `MapperInterface.ts`, `session.mapper.ts`, e as
  menções a "Entity (persistência)" em `GLOSSARY`, `ARCHITECTURE`, `AGENTS.md`, `apps/api/CLAUDE.md`,
  `feature-analysis-guide`: nome genérico do documento persistido.
- `SpecMarkdown.tsx`: entidades HTML do `marked`.
- `mcp.ts`, `agentMcp.test.ts`, `mcpRoute.test.ts`: notificação do JSON-RPC.
- `useAlert.ts`: `NotificationType` do toast do design system.
- `sessionGuard.test.ts`, `authHeaderOwnership.test.tsx`, `firestoreIndexes.test.ts`,
  `accountSettings.spec.ts` (`?tab=security`): testes que afirmam a ausência.
- `AUTH-PANEL.md`, `ARCHITECTURE.md`, `SECURITY.md`, `PRE-PRODUCTION.md`, `board/DECISIONS.md`: frases que
  dizem que admin, impersonação, notificações e `entity` saíram.
- `.claude/agents/analista-qa.md:40`: cita a feature histórica `impersonation-read-only` como exemplo de
  custo de screenshot.
- `frontend-design`, `ui-ux-pro-max`, `vercel-react-best-practices`, `brainstorming`: texto genérico de
  skill de terceiros.
- `specs/BACKLOG.md` e `specs/reference/AUDIT.md` ficaram como estavam: são do `/spec --sync`.

## A verificar no `/test`

- Landing anônima em `/` e `/pt-br`: título, frase, vídeo em loop e mudo, botão para `/pt-br/sign-in`;
  só um formato de vídeo baixado (aba de rede); com `prefers-reduced-motion: reduce`, o PNG aparece e o
  vídeo não. Unitário cobre a marcação (`landingPage.test.tsx`), não o comportamento no browser.
- `/pt-br` com sessão vai para `/pt-br/boards` no browser (unitário: `proxy.test.ts`).
- Cabeçalho: marca leva a `/boards`, tema troca, menu do avatar com Perfil, Preferências, Cookies (com
  consentimento ligado) e Sair; no celular (390×844) sem rolagem horizontal. Light e dark.
- Primeira carga autenticada sem 401 no console de rede (o bearer escrito no render). Repro: entrar,
  recarregar `/pt-br/boards/<id>` com a aba de rede aberta e procurar 401.
- Perfil com `type: "admin"` gravado à mão no emulador abre `/boards` e cria board (unitário só no guard).
- `/pt-br/entities`, `/pt-br/playground`, `/pt-br/admin`, `/pt-br/admin/users` dão 404; o "início" do 404
  leva a `/pt-br/boards` logado e a `/pt-br` anônimo.
- API com bearer: `GET /entities`, `/notifications`, `/users` → 404 `ROUTE_NOT_FOUND`; `GET /boards` com
  `x-role: admin` → 200 com os boards da pessoa.
- Fluxos do board e da `spec-authoring` (rascunho com anexo, aprovar, descartar), membros, credenciais.
- `next build` do app e da API (o 404 das rotas removidas e a árvore de rotas só se provam no build).
- Primeiro quadro do vídeo mostra o board (conferido por mim só olhando o PNG).

## Lacunas de teste conhecidas

- Nenhum E2E percorre um board: a conta do seed não tem GitHub. Fora do corte, como a spec diz.
- A barra fixa com formulário longo perdeu o E2E (`focusNotObscured.spec.ts`); fica o unitário
  `focusNotObscuredScrollPadding.test.tsx`. Risco aceito na spec.
- `BaseRepository.paginate` e `countQuery` não têm mais consumidor em produção. `paginate` segue coberto
  por um repositório de teste local em `baseRepository.test.ts`; `countQuery` ficou sem teste.

## Pendências

- `zustand` ficou em `apps/app/package.json` sem uso (`grep` sem import). Tirar mexe no `pnpm-lock.yaml`;
  deixei para o `/review` decidir.
- `RunnerList.canRevoke` e `RunnerRegistrationPanel.canGenerate` agora recebem sempre `true`. A prop ficou
  para não mexer nos componentes além do necessário.
- Pré-requisito manual depois do merge: item 10 de `docs/PRE-PRODUCTION.md` (publicar índices, apagar os
  antigos, dados órfãos).
- Quem tem emulador com estado antigo roda `pnpm seed` de novo.
