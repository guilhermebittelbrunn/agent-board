# Revisão: app-cleanup

Revisão do working tree depois do `/develop`, na rodada autônoma do `/cycle`. Li o código e rodei só os gates
estáticos. Não subi app, API, emulador nem browser.

## Branch

`guilhermebittelbrunn/chore-overnight-cycle-specs`, reutilizada. O usuário pediu para manter todo o trabalho
da noite nela, então não criei nem renomeei branch. O nome não passa no regex do padrão
(`<project>/<type>/<title>`): o prefixo `guilhermebittelbrunn/` não é projeto e `chore-overnight-cycle-specs`
junta tipo e título. Fica registrado como decisão do usuário, não como achado desta feature.

## Achados

| Severidade | Onde | Problema | Ação |
|---|---|---|---|
| 🟡 | plano de commits | Vários arquivos misturam assuntos de commits diferentes (`panelTitles.ts`, `paths.ts`, `navbar/index.ts`, `apiErrors`, os testes de rota da API). Com um arquivo inteiro por commit, os commits intermediários não compilam sozinhos. A árvore final compila e passa nos gates. | Registrado. O plano abaixo põe cada arquivo num único commit; a verificação de typecheck vale para o último commit de código. |
| 🟡 | `apps/app/app/[locale]/(landing)/page.tsx:68-82` | Com `prefers-reduced-motion`, o `<video autoPlay>` só some por CSS (`motion-reduce:hidden`). O browser pode baixar e tocar o vídeo mesmo escondido. | Vai para "Verificar no `/test`". Não mexi: a correção (escolher no cliente) troca um Server Component por client e a spec só pede que o poster apareça. |
| 🟢 | `apps/api/(shared)/lib/agent-contract/agent-guard.ts:30-35`, `apps/api/(shared)/lib/runner/runner-guard.ts:23-28` | O develop tirou a menção à impersonação e deixou as linhas do JSDoc quebradas no meio. | Corrigido: só refluxo do texto, sem mudar o conteúdo. |
| 🟢 | `apps/app/package.json` | `zustand` sem nenhum import depois que o `panelStore` saiu. | Corrigido: saiu do `package.json` e do `pnpm-lock.yaml` (27 linhas, só `zustand`). |
| 🟢 | `BoardCredentialsClient.tsx:152,159` | `canRevoke` e `canGenerate` agora recebem sempre `true`; as props de `RunnerList` e `RunnerRegistrationPanel` ficaram sem função. | Aberto. Tirar as props mexe em dois componentes fora do escopo; fica para uma limpeza futura. |
| ✅ | `apps/api/app/(guards)/session.ts` | 401 `AUTH_INVALID_TOKEN` sem ator, 403 `AUTH_PROFILE_NOT_FOUND` sem perfil. `findByReferenceId` filtra `deletedAt == null`, então perfil arquivado continua barrado. | Nenhuma. |
| ✅ | rotas da API | Ver "Contagem de guards" abaixo. Nenhuma rota de board perdeu guard e nenhuma rota que exigia sessão ficou pública. | Nenhuma. |
| ✅ | `apps/app/proxy.ts:91-107` | `LANDING_PATH = "/"` comparado por igualdade. `/pt-br//boards` vira `//boards`, que não é `/` nem casa `/sign-in`, e cai no login. `/pt-br/` vira `/` e é público, como deve. | Nenhuma. |
| ✅ | `apps/app/shared/providers/ApiAuthProvider.tsx` | O bearer é escrito durante o render, só no browser (`typeof window`), antes de o contexto liberar `useAuthorizedQuery`. O header só sai quando `actorUid` é `null`. O server usa `getServerApiClient()` por request. | Nenhuma. |
| ✅ | `apps/api/(shared)/lib/cors.ts` | `ALLOWED_HEADERS` caiu para `Content-Type`, `Authorization`, `x-locale`. Nenhum cliente envia mais `x-role` nem os `x-request-*` (o SDK perdeu `setAuthRequestContext`). | Nenhuma. |
| ✅ | `firestore.rules`, `storage.rules` | Seguem com `allow read, write: if false` em `/{document=**}` e `/{allPaths=**}`. A única mudança em `firestore.rules` é o exemplo comentado, que trocou `entity` por `runner`. | Nenhuma. |
| ✅ | `apps/app/public/landing/` | `agent-board.mp4` 787.507 B, `agent-board.webm` 738.543 B, `agent-board-poster.png` 59.745 B (1,59 MB somados, e o browser baixa um só formato). Nenhum `.gif` em `public/`. A CSP já tem `mediaSrc: [SELF]` (`packages/security/middleware.ts:87`) e o proxy deixa passar arquivo com extensão sem sessão (`isStaticAssetPath`). | Nenhuma. |
| ✅ | `spec-authoring` | `drafts`, `attachments`, `spec/approve`, `spec/discard` e `spec` seguem sob `requireBoardApi` com a mesma capability de antes (`trigger`, `prioritize`, `view`). As mudanças nelas são só `ctx.subjectProfile` → `ctx.profile`. O MCP (`get_attachment`) não foi tocado. No app, `SpecDraftDetail` perdeu só o `&& !isImpersonating`. | Nenhuma. |

### Contagem de guards

Comparei cada `route.ts` de `HEAD` com o working tree (`git show HEAD:<arquivo>`). Antes havia 55 arquivos
de rota, agora 43. Os 12 que saíram: 3 de `entities/**`, 4 de `notifications/**`, 4 de `users/**` (todos sob
`requireAdminApi`) e `account/password`. Dos que ficaram:

- 8 arquivos trocaram `requireCommonPanelApi` por `requireSessionApi`, um para um: `account` (GET, PUT),
  `boards` (GET, POST), `boards/preview`, `boards/repositories`, `files`, `runners` (GET),
  `runners/[id]` (DELETE), `runners/registrations`.
- 21 arquivos de `boards/[id]/**` (incluindo o próprio `boards/[id]`) seguem em `requireBoardApi` com a mesma capability de antes.
- Agente (`requireAgentApi`), runner (`requireRunnerApi`), `auth/*`, `health`, `github/webhook`,
  `runner/register` e o catch-all não mudaram de guard.

O guard antigo também barrava perfil com `type !== "common"`. O novo não lê `type`, como a spec pede: perfil
antigo com `type: "admin"` passa a entrar no próprio board.

## Correções aplicadas

- `apps/api/(shared)/lib/agent-contract/agent-guard.ts`: refluxo do JSDoc de `requireAgentApi`.
- `apps/api/(shared)/lib/runner/runner-guard.ts`: refluxo do JSDoc de `requireRunnerApi`.
- `apps/app/package.json` e `pnpm-lock.yaml`: `zustand` removido. O lockfile foi atualizado com
  `pnpm install --prefer-offline --lockfile-only` (o `--offline` puro falhou por falta de metadado de
  `@types/react` no cache) e `pnpm install --frozen-lockfile --offline` passou em seguida.

## Raio de impacto

- `@repo/sdk`: `Client` perde `user`, `entity`, `notification`, os métodos de contexto e `Config.context`;
  `UserDTO` perde `type` e `lastAccessAt`; `AuthMePayload` perde `type`. Consumidores são `apps/app`,
  `apps/api` e `apps/runner`, e o typecheck dos três passa.
- `@repo/auth`: saem `UserRoleLevel`, `IAuthContextProps`, `canSwitchPanelEnvironment`, `UserProfile`,
  `parseUserProfileResponse`. `grep` sem consumidor restante.
- `@repo/shared`: sai `AUTH_REQUEST_HEADER`. `isValidIanaTimeZone` e `resolveBrowserTimeZone` ficam e são
  usados por `DisplayTimeZoneProvider` e `displayTimeZone.ts`.
- `grep` por `x-role`, `x-request-`, `isImpersonating`, `subjectProfile`, `requireCommonPanelApi`,
  `requireAdminApi`, `UserType` e `zustand` em `apps/` e `packages/` (fora de testes) não acha uso. O
  `x-user-id` que sobra em `packages/auth/middleware.ts:83` é header interno do middleware, e a API não o lê.
- Produção: o item 10 de `docs/PRE-PRODUCTION.md` (publicar `firestore.indexes.json`, apagar índices
  antigos) continua manual.

## Divergência com a spec

A spec diz que `/[locale]` "redireciona para `/[locale]/boards`" no primeiro item do corte e, no item da
landing, que `/` mostra a landing e só quem tem sessão vai para `/boards`. A implementação segue o segundo:
landing pública para anônimo, redirecionamento com sessão. Os dois itens não brigam se lidos juntos; registro
para o `/spec --sync`.

## Verificar no `/test`

1. **Primeira carga autenticada sem 401.** É a afirmação que sustenta o `ApiAuthProvider`. Repro: entrar,
   recarregar `/pt-br/boards/<id>` com a aba de rede aberta e procurar 401 em `/boards/*`. Repetir num
   `/pt-br/account`.
2. **Landing com `prefers-reduced-motion: reduce`.** O PNG aparece e o vídeo não. Na aba de rede, conferir se
   `agent-board.webm`/`.mp4` ainda é baixado (achado 🟡 acima). Sem a preferência, só um dos dois formatos
   desce.
3. **Rotas públicas exatas.** Anônimo: `/`, `/pt-br` e `/pt-br/` mostram a landing; `/pt-br//boards`,
   `/pt-br/boards` e `/pt-br/account` vão para o login com `?redirect=`. Com sessão: `/pt-br` vai para
   `/pt-br/boards`.
4. **Rotas removidas.** `/pt-br/entities`, `/pt-br/playground`, `/pt-br/admin`, `/pt-br/admin/users` dão 404
   e o botão do 404 leva a `/pt-br/boards` logado e a `/pt-br` anônimo. Na API com bearer, `GET /entities`,
   `/notifications`, `/users` respondem 404 `ROUTE_NOT_FOUND`.
5. **Perfil legado.** Gravar `type: "admin"` à mão num perfil no emulador; a pessoa abre `/boards` e cria
   board. `GET /boards` com `x-role: admin` responde 200 com os boards dela, não os de outra pessoa.
6. **`spec-authoring` ponta a ponta.** Rascunho com anexo, aprovar, descartar; o agente lê o anexo com
   `get_attachment`.
7. **Cabeçalho.** Marca leva a `/boards`, tema troca, menu do avatar com Perfil, Preferências, Cookies (com
   consentimento ligado) e Sair; 390×844 sem rolagem horizontal; light e dark.
8. **`next build` do app e da API.** O 404 das rotas removidas e a árvore de rotas só se provam no build.
9. **Primeiro quadro do vídeo** mostra o board (o develop só olhou o PNG).

## Lacunas de teste

- Nenhum E2E percorre um board (a conta do seed não tem GitHub): **continua aberta**, fora do corte pela spec.
- Barra fixa com formulário longo perdeu o E2E `focusNotObscured.spec.ts`: **continua aberta**, risco aceito
  na spec; o unitário `focusNotObscuredScrollPadding.test.tsx` fica.
- `BaseRepository.countQuery` sem teste e sem consumidor em produção: **continua aberta**. Candidato a sair do
  `BaseRepository` numa limpeza futura, não a ganhar teste.
- Escrita do bearer no primeiro render: **coberta** por `authHeaderOwnership.test.tsx`; o comportamento no
  browser é o item 1 acima.

## Decisões em aberto

- Nenhuma que bloqueie. As duas pendências do develop foram resolvidas assim: `zustand` saiu (commit 6 do
  plano); `canRevoke`/`canGenerate` ficam como estão (🟢 aberto).

## Gates

| Gate | Comando | Resultado |
|---|---|---|
| Lint | `pnpm check` | 834 arquivos, sem erro (antes e depois das correções) |
| Typecheck | `pnpm turbo run typecheck` | 13/13 tarefas, depois das correções |
| `apiErrors` | `pnpm --filter api test apiErrorCodes` | 2/2 |
| Lockfile | `pnpm install --frozen-lockfile --offline` | passou |

Não rodei Vitest nem o emulador: as correções não mudam comportamento. Os números do develop
(api 1012, app 659, emulador 133) seguem como a última medição.

## Plano de commits

Cada arquivo do working tree aparece em exatamente um commit (399 caminhos conferidos por script; nenhum
sobrando). Como há remoções não preparadas e os caminhos têm `[locale]` e `(grupo)`, use sempre
`git --literal-pathspecs add -A -- <caminhos>` (sem `--literal-pathspecs`, o git lê `[locale]` como
classe de caracteres).

Antes do primeiro commit, `git diff --cached --stat` tem de sair vazio. Depois de cada commit, conferir
`git show --stat --oneline HEAD`. Os commits intermediários não compilam sozinhos (achado 🟡); o typecheck
vale no commit 19.

| # | Mensagem | Caminhos |
|---|---|---|
| 1 | `refactor(app): remove the entities example, playground and admin area` | `(authenticated)/(admin)/`, `(common)/(pages)/entities/`, `(common)/(pages)/playground/`, `(common)/(pages)/page.tsx`, `(common)/(pages)/(components)/`, `(common)/(pages)/(hooks)/`, `lib/server/requireAdmin.ts`, `shared/hooks/useListUsers.ts`, `shared/components/ui/MetricCard.tsx` e os 20 testes de admin, entity e usuários |
| 2 | `refactor(app): remove notifications` | `shared/components/notifications/`, os 3 hooks de notificação, `useAuthorizedInfiniteQuery.ts`, `shared/lib/notifications.ts`, `shared/lib/pagination.ts`, 3 testes |
| 3 | `refactor(app): replace the panel state with a bearer-only auth provider` | `shared/providers/`, `shared/stores/`, `panelState.ts`, `authRequestHeaders.ts`, `client.ts`, `panelSnapshot.ts`, `apiServerClient.ts`, `ImpersonationReadOnlyNotice.tsx`, `PanelNavbarControls.tsx`, `useAuthorizedQuery.ts`, `[locale]/clientLayout.tsx`, `app/layout.tsx`, `(common)/(pages)/boards/`, 17 testes |
| 4 | `feat(app): header without sidebar and account in the avatar menu` | `(common)/layout.tsx`, `paths.ts`, `routes.tsx`, `sidebar.tsx`, `(common)/(pages)/account/`, `shared/components/ui/` (o que sobrou), `sidebarState.ts`, `navActive.ts`, `panelTitles.ts`, `queryKeys.ts`, `.env.example`, testes de conta, sidebar, títulos e menu |
| 5 | `feat(app): public landing page with the board animation` | `[locale]/(landing)/`, `public/`, `proxy.ts`, `notFoundHome.ts`, `postLoginNavigation.ts`, `useSignedInRedirect.ts`, `[locale]/(unauthenticated)/`, 9 testes |
| 6 | `chore(app): drop the unused zustand dependency` | `apps/app/package.json`, `pnpm-lock.yaml` |
| 7 | `refactor(api): remove the entity example resource` | `app/(routes)/entities/`, `entity.mapper.ts`, `entity.repository.ts`, `entity.schema.ts`, `entity-photo.ts`, `photo-reference.ts`, testes `entit*` e `photoReference` |
| 8 | `refactor(api): remove notifications` | `app/(routes)/notifications/`, `notification.mapper.ts`, `notification.repository.ts`, `lib/notifications.ts`, `pagination.schema.ts`, testes de notificação, `welcomeNotification`, `paginationQuery` |
| 9 | `refactor(api): remove admin user management` | `app/(routes)/users/`, `(guards)/admin.ts`, `activity-recorder.ts`, `activity-windows.ts`, `user.repository.ts`, `user-admin.schema.ts`, `toolkit-error-codes.ts`, `firestore.indexes.json`, testes de admin, usuários, atividade, `firestoreIndexes`, `baseRepository` |
| 10 | `refactor(api): session guard without panel role or impersonation` | o resto de `apps/api/app/`, `apps/api/(shared)/` e `apps/api/__tests__/`, `apps/api/proxy.ts`, `firestore.rules` |
| 11 | `chore(api): seed only common accounts` | `apps/api/scripts/`, `apps/api/package.json` |
| 12 | `refactor(sdk): drop entity, notification, admin user and panel context` | `packages/sdk/` |
| 13 | `refactor(auth): drop panel roles and request context types` | `packages/auth/` |
| 14 | `refactor(shared): drop the request context headers` | `packages/shared/` |
| 15 | `test(security): use board routes in the rate limit examples` | `packages/security/` |
| 16 | `refactor(internationalization): landing copy in, admin, entity, notification and panel copy out` | `packages/internationalization/` |
| 17 | `test(e2e): cover the landing and the board shell instead of entity and admin` | `apps/e2e/` |
| 18 | `docs: describe the board-only app` | `README.md`, `docs/AI-WORKFLOW.md`, `docs/ARCHITECTURE.md`, `docs/AUTH-PANEL.md`, `docs/GLOSSARY.md`, `docs/PRE-PRODUCTION.md`, `docs/SECURITY.md`, `docs/SETUP.md`, `docs/board/`, `docs/feature-analysis-guide.md`, `docs/review-checklist.md` |
| 19 | `feat(claude): use boardMember as the reference slice` | `CLAUDE.md`, `AGENTS.md`, `apps/api/CLAUDE.md`, `apps/app/CLAUDE.md`, `.claude/` |
| 20 | `docs(features): app-cleanup` | `docs/features/app-cleanup/` |

Os caminhos de app nas linhas 1 a 5 são relativos a `apps/app/` (e `(common)` a
`apps/app/app/[locale]/(authenticated)/(common)/`). A lista exata de arquivos de cada commit foi gerada na
sessão da revisão; quem commitar pode regerá-la a partir desta tabela.

A pasta `docs/features/app-cleanup/` não tem senha, token nem e-mail real.

Título de PR sugerido: `refactor: board-only app with a public landing`.

### Commits realizados

_(preenchido pelo orquestrador)_
