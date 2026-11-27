---
id: app-cleanup
title: App só com o board, área do usuário no cabeçalho e landing simples
status: in-progress
value: médio
effort: M
audience: dx
phase: 1
area: [apps/app, apps/api, apps/e2e, packages/sdk, packages/internationalization, docs, .claude]
depends_on: []
contends_on: [apps/app/app/[locale]/(authenticated)/(common)/layout.tsx, apps/api/app/(guards)/session.ts, apps/app/shared/components/ui/Navbar.tsx]
feature: app-cleanup
updated: 2026-11-27
---

# App só com o board, área do usuário no cabeçalho e landing simples

> **Resumo**
> - **O quê:** tirar do app e da API o que veio do next-boilerplate e o board não usa (admin, impersonação, playground, CRUD `entity`, notificações, sidebar genérica), deixar o app autenticado só com as telas de board, levar conta e preferências para o menu do usuário no cabeçalho e trocar o redirecionamento da raiz por uma landing que mostra a animação do board.
> - **Por quê:** hoje um usuário com `type: admin` não usa o board sem impersonar alguém, o E2E de `main` falha de forma intermitente num formulário de `entity` que ninguém usa, e cada spec nova passa por código e docs que descrevem outro produto.
> - **Status:** `in-progress` · valor médio · esforço M · dx · implementada na branch, aguardando PR
> - **Próximo passo:** abrir a PR da branch da noite e mergear com o CI verde; depois o `/spec --sync` arquiva e publica `firestore.indexes.json` (item 10 do `docs/PRE-PRODUCTION.md`)

## Problema

O `fork-cleanup` (PR #1) tirou organizações, cobrança, e-mail e trilha de auditoria, mas manteve de propósito o admin com impersonação, as notificações e o CRUD de exemplo. Com a fase 1 entregue, esse resto atrapalha de três jeitos:

- **Bloqueia uso real.** Toda rota de board passa por `requireCommonPanelApi`, que recusa quem tem `type` diferente de `common` (`apps/api/app/(guards)/session.ts:74`). O layout comum manda admin sem impersonação para `/admin` (`apps/app/app/[locale]/(authenticated)/(common)/layout.tsx:47-52`).
- **Quebra o CI.** Em `main`, o job `e2e` falhou nos pushes de `a19ece1` (run 45865765915) e `a80dd70` (run 45888331957) no mesmo teste, `apps/e2e/tests/focusNotObscured.spec.ts:188`, que mede o formulário de edição de `entity`. O push seguinte, `dac8f60`, passou: é intermitente, e num teste de uma tela que o board não usa.
- **Ensina o padrão errado.** `CLAUDE.md`, `AGENTS.md`, as skills `new-crud` e `new-api-route` e o `docs/feature-analysis-guide.md` apontam o CRUD `entity` como referência viva. Os agentes copiam dali um guard de painel com impersonação que o board não tem.

O pedido do usuário, em 2026-11-27: "limpar a aplicação, ainda existe bastante coisa que esse repositório herdou do boilerplate que não iremos utilizar, como página de admin, página de playground, crud de entidades e entre outros, a aplicação como um todo pode ser apenas rota de board, adicione as áreas de usuário dentro dela e remova todo o componente por fora. Pode adicionar uma landing page com o gif gerado para a animação de instrução, sem tentar vender o produto, apenas mostrar a ideia."

## Aprovação

Aprovada em 2026-11-27 por pedido direto do usuário, que mandou executá-la na rodada noturna do `/cycle`, logo depois da `spec-authoring`.

## O que já existe no repo

Inventário de 2026-11-27, com o uso conferido por `grep`.

**Rotas do app** (`apps/app/app/[locale]/(authenticated)/`):

- `(common)/(pages)/boards/**`: as sete telas do board (lista, novo, quadro, card, configuração, membros, credenciais). Ficam.
- `(common)/(pages)/account/`: conta em abas `?tab=` profile, security e preferences (`(common)/paths.ts:82-99`). A aba security só troca senha, que só existe no emulador (`AccountSecurityForm.tsx:61`, `lacksPasswordProvider`).
- `(common)/(pages)/page.tsx`: home com o resumo de `entity` (`client.entity.summary()`, linha 22). Nenhuma tela do board aponta para ela.
- `(common)/(pages)/entities/**` e `(common)/(pages)/playground/` (`page.tsx` com 1.268 linhas): nada do board importa daqui.
- `(admin)/admin/**`: home do admin, CRUD de usuários, `paths.ts`, `routes.tsx` e `sidebar.tsx`.
- `apps/app/app/page.tsx`: só redireciona para `/${locale}`. O proxy trata como pública apenas `/sign-in` (`apps/app/proxy.ts:91`). Não existe `apps/app/public/`; arquivo estático com extensão já passa pelo proxy (`isStaticAssetPath`).

**Shell do app:**

- `(common)/layout.tsx:55-60`: `SidebarProvider` + `SidebarCommon` + `Navbar` com `NotificationsBell`.
- `shared/components/ui/Sidebar.tsx` e `lib/server/sidebarState.ts`: usados só pelos layouts comum e admin.
- `(common)/routes.tsx:30-43`: itens Playground e Entidades no menu.
- `shared/components/ui/Navbar.tsx`: `SidebarTrigger`, `PanelNavbarControls` (troca admin/comum e impersonação, 285 linhas), `ModeToggle` (linha 29) e `ProfileDropdown` (linha 30). O `ProfileDropdown` já tem avatar, link para a conta, preferências de cookies e sair.
- Impersonação: `shared/lib/panelState.ts`, `shared/stores/panelStore.ts`, `shared/providers/AuthRequestPanelContext.tsx`, `lib/server/panelSnapshot.ts`, `lib/server/requireAdmin.ts`, `ImpersonationReadOnlyNotice.tsx`. `isImpersonating` aparece em 12 arquivos de `boards/` no app e em 6 arquivos da API (`board.ts`, `boards/route.ts`, `board-access.ts`, `board-list.ts` entre eles).
- `shared/lib/postLoginNavigation.ts:92-94` e `lib/server/notFoundHome.ts:9` mandam admin para `/admin`.

**API** (`apps/api/app/(routes)/`):

- Ficam: `boards/**`, `runner/**`, `runners/**`, `agent/tools/[tool]`, `mcp`, `github/webhook`, `auth/**`, `health/**` (o readiness é usado pelo `apps/e2e/playwright.config.ts:83`) e `account` (GET/PUT, usado pelo menu do usuário e pela tela de conta).
- `entities/**`: sem consumidor no board. `account/route.ts` e `lib/account-avatar.ts` importam helpers de `lib/entity-photo.ts`, que precisam mudar de arquivo antes de apagar.
- `notifications/**`: o único produtor é a notificação `welcome` em `(shared)/lib/user-merge.ts:89`; o único consumidor é o `NotificationsBell` do layout.
- `users/**`: todas as rotas com `requireAdminApi`; o board não chama `client.user.*`. `lib/activity-recorder.ts` só alimenta métricas do admin.
- `files/route.ts`: upload de imagem para o Cloud Storage, usado hoje só pelo avatar da conta e pelas telas de `entity`. A `spec-authoring` vai precisar dele para os anexos.
- `(guards)/admin.ts` só serve a `users/**`.

**SDK, i18n, testes, seed, Firebase:**

- `packages/sdk/src/client/index.ts:17-43` registra `entity`, `notification`, `user` e `file`, além dos recursos do board; `isAdminContext`/`changeToAdminContext` mandam o cabeçalho `x-role`.
- Traduções só do boilerplate: `translations/apps/app/pages/admin/**`, `pages/common/entities.ts`, `pages/common/home.ts`, `pages/impersonation/index.ts`, `shared/notifications.ts`, e códigos em `translations/packages/shared/utils.ts` (`ADMIN_*`, `AUTH_REQUEST_*IMPERSONATION*`, `USERS_*`, `ENTITY_*`, `NOTIFICATION*`). O `apiErrorCodesTranslated.test.ts` cobra a paridade entre código e copy.
- Cerca de 40 arquivos de teste no `apps/app/__tests__` e 30 no `apps/api/__tests__` cobrem só admin, entity, notificação, painel, impersonação e sidebar.
- `apps/e2e/tests/`: `entityCrud.spec.ts`, `panelSwitch.spec.ts` e `focusNotObscured.spec.ts` são só boilerplate; `a11yDark.spec.ts` mede rotas de `entity` e de `/admin`. Não existe nenhum E2E de tela do board.
- `apps/api/scripts/seed-emulator.mjs` cria `admin@example.com`, entities e notificações; `scripts/create-dev-admin.mjs` existe só para o admin. Boards vêm do `seed:timeline`.
- `firestore.indexes.json`: três índices de `entity`, dois de `notification` e dois de `user` usados só pelo resumo do admin. O índice `user` (`reference_id`, `deletedAt`) fica: os guards usam.
- `docs/design/agent-board.gif`: 3.922.744 bytes, 880×495, 230 quadros, 23 s, citado só no `README.md:7`.

**Docs e ferramental que usam `entity` como referência:** `CLAUDE.md` (seção "Referência viva"), `AGENTS.md`, `apps/api/CLAUDE.md`, `apps/app/CLAUDE.md`, `.claude/skills/new-crud/SKILL.md` (20 menções), `.claude/skills/new-api-route/SKILL.md`, `.claude/skills/write-tests/SKILL.md` (19), `.claude/skills/i18n-sync/SKILL.md`, `docs/feature-analysis-guide.md` (19), `docs/review-checklist.md`, `docs/SETUP.md`, `docs/SECURITY.md`, `docs/GLOSSARY.md`, `docs/ARCHITECTURE.md` e `docs/AUTH-PANEL.md` (52 menções a admin e impersonação; o documento inteiro é sobre isso).

- **Lacuna:** nada disso foi pedido pelo board, e nenhuma spec cobre a remoção. A landing não existe.

## Referências

- Spec arquivada [`fork-cleanup`](../../docs/features/fork-cleanup/spec.md): a primeira rodada de corte, que deixou admin, notificações e upload de fora de propósito.
- [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md): as telas do board que ficam.
- web.dev, "Replace animated GIFs with video" (https://web.dev/articles/replace-gifs-with-videos, coletado em 2026-11-27): recomenda `<video autoplay loop muted playsinline>` com fontes WebM e MP4 no lugar do GIF, e cita um GIF de 3,7 MB que virou MP4 de 551 KB e WebM de 341 KB.
- Medição local em 2026-11-27, com `ffmpeg` sobre o `agent-board.gif`: MP4 H.264 (`-crf 26`) com 782.202 bytes e WebM VP9 (`-crf 36`) com 738.543 bytes, cerca de 80% menores que o GIF; o primeiro quadro em PNG, para `poster`, tem 59.745 bytes.

## Proposta — corte de MVP

- [ ] **Só board no app autenticado.** Saem `(admin)/**`, `entities/**`, `playground/` e a home de `entity`. `/[locale]` redireciona para `/[locale]/boards`, e o pós-login e o `not-found` passam a mandar para lá.
- [ ] **Layout do board sem sidebar.** O layout autenticado vira um cabeçalho com a marca (link para `/boards`), o botão de tema e o menu do usuário. Saem `Sidebar`, `sidebarState`, `PanelNavbarControls`, `NotificationsBell` e os itens Playground e Entidades.
- [ ] **Área do usuário pelo menu do cabeçalho.** O menu do avatar leva a Perfil e Preferências (as abas que já existem em `/account`) e a Sair. A tela de conta usa o mesmo layout do board. A aba Segurança sai, porque troca senha e a senha só existe no emulador.
- [ ] **Sem papel de plataforma nem impersonação.** Sai o `type` admin como critério de acesso: o guard de sessão da API deixa de ler `x-role` e de exigir `type: common`, e o acesso ao board continua vindo só do papel no board (`requireBoardApi`). Saem `requireAdminApi`, as rotas `users/**`, o registro de atividade, o estado de painel no app e os métodos de contexto admin do SDK. Os 18 arquivos do board que leem `isImpersonating` deixam de ler.
- [ ] **Sem notificações e sem CRUD `entity` na API.** Saem `notifications/**`, `entities/**`, os repositórios, mappers e schemas deles, a emissão do `welcome` no `user-merge.ts`, os recursos `entity`, `notification` e `user` (admin) do SDK, as traduções e os códigos de erro correspondentes, e os índices do Firestore que só eles usavam. Os helpers de `lib/entity-photo.ts` que a conta usa mudam de arquivo antes.
- [ ] **Landing pública na raiz.** `/` mostra o nome, uma frase sobre a ideia (card arrastado dispara a etapa do Claude Code e o agente escreve no card), a animação e um botão "Entrar com GitHub" que leva a `/sign-in`. Sem preço, depoimento, lista de recursos ou chamada de venda. Quem já tem sessão vai direto para `/boards`. A animação entra como vídeo MP4 e WebM com `poster`, em `apps/app/public/`, e o GIF de 3,9 MB não vai para o bundle. Com `prefers-reduced-motion`, a página mostra o `poster` parado. Todo texto vem do dicionário.
- [ ] **Testes, E2E e seed coerentes.** Saem os testes unitários e os E2E de admin, `entity`, painel, impersonação, notificação e sidebar, inclusive o `focusNotObscured.spec.ts`. O `a11yDark.spec.ts` passa a medir a landing, `/sign-in`, `/boards` e a conta. O seed deixa de criar admin, entities e notificações; o `create-dev-admin` sai. `pnpm turbo run lint typecheck test test:emulator` e `pnpm e2e` continuam verdes.
- [ ] **Docs e skills apontam para um recurso do board.** O slice de referência deixa de ser `entity` e passa a ser `boardMember` (SDK `boardMember`, rotas `boards/[id]/members/**` sob `requireBoardApi`, repositório e mapper `board-member`, tela Membros, i18n). As skills `new-crud`, `new-api-route`, `write-tests` e `i18n-sync` continuam e trocam os exemplos. `CLAUDE.md`, `AGENTS.md`, os `CLAUDE.md` aninhados e os docs da lista acima deixam de citar admin, impersonação e `entity`; o `docs/AUTH-PANEL.md` sai ou vira uma página curta sobre sessão. Os registros em `docs/features/*` ficam como estão: são histórico.

### Fora do corte

- **Upload e Cloud Storage** (`files/route.ts`, `lib/storage.ts`, `storage.rules`, emulador do Storage): ficam, porque a `spec-authoring` usa para os anexos. O upload de avatar na aba Perfil também fica até alguém decidir trocar pelo avatar do GitHub.
- **`@repo/analytics`** (consentimento de cookies e eventos) e o Arcjet: ficam. Uma ferramenta pessoal talvez não precise de banner de consentimento, mas isso é decisão separada (pergunta abaixo).
- **O segmento `[locale]`**: fica, como decidiu o `fork-cleanup`.
- **E2E das telas do board**: não existe e continua não existindo; esta spec só troca o que media `entity` por rotas do board no `a11yDark`. Um E2E do fluxo do board é spec própria.
- **Apagar dados antigos no Firestore de produção** (documentos de `entity` e `notification`, `type: admin` nos perfis): as regras já negam tudo ao cliente, e o código deixa de ler esses campos. Limpeza do banco, se um dia fizer falta, é script avulso.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Nenhum. |
| `packages/sdk` | Saem `entity`, `notification`, as ações admin de `user`, os tipos correspondentes e os métodos de contexto admin. `UserDTO` fica; `UserType.ADMIN` sai junto com o papel. |
| `apps/api` | Saem `entities/**`, `notifications/**`, `users/**`, `(guards)/admin.ts` e a impersonação; o guard de sessão fica sem `x-role` e sem checagem de `type`. |
| `apps/app` | Layout autenticado sem sidebar, menu do usuário com conta e preferências, landing pública em `/`, `/` incluída em `PUBLIC_PATHS`, vídeo e `poster` em `apps/app/public/`. |
| `packages/internationalization` | Saem as traduções de admin, `entity`, home, impersonação e notificações e os códigos de erro correspondentes; entram as chaves da landing e do menu. |
| `apps/e2e` e seed | Saem três specs; `a11yDark` e `support/` sem admin; seed sem admin, entities e notificações. |
| Infra/env | `firestore.indexes.json` sem os índices de `entity`, `notification` e do resumo do admin. Nenhuma variável nova. |
| Docs e `.claude/` | Referência viva trocada para `boardMember`; skills e docs sem `entity` e sem admin. |

## Riscos e trade-offs

- **Mexe em quase todo arquivo do board.** Os `contends_on` declarados são os três pontos de contato mais certos, mas a remoção do `isImpersonating` passa por 12 arquivos de `boards/` no app e pelo `board-access.ts` da API, e os códigos de erro mudam em `translations/packages/shared/utils.ts`, que quase toda spec também altera. Rodar em paralelo com `spec-authoring` ou `pr-flow` quase certamente dá conflito; esta spec roda sozinha, na ordem da fila.
- **O E2E fica mais fino.** Sem `entityCrud`, `panelSwitch` e `focusNotObscured`, a suíte passa a medir login, conta e acessibilidade de poucas telas. Isso tira um teste intermitente de `main`, mas também tira cobertura de componentes do design system (o formulário longo com barra de ações fixa) que o board ainda não exercita.
- **Perfis com `type: admin` em produção.** Depois da mudança eles usam o board como qualquer pessoa, pelo papel no board. Quem hoje só entra impersonando passa a entrar direto. O `/test` precisa medir isso com um perfil admin no emulador.
- **Doc e ferramental desatualizados quebram os agentes.** Uma skill que ainda mande copiar `entity` faz o `/develop` procurar arquivo que não existe. A varredura por `entity` e `requireAdminApi` em `.claude/`, `docs/` (fora de `docs/features/`), `CLAUDE.md` e `AGENTS.md` precisa sair limpa.
- **Merge do upstream.** Cada `git merge upstream/main` vai trazer conflito "modificado lá, removido aqui" em mais arquivos. `docs/board/DECISIONS.md` já manda resolver mantendo a remoção; a lista do que saiu precisa ficar registrada (no `fork-cleanup` ou nesta spec arquivada).
- **Peso da landing.** MP4 e WebM juntos somam cerca de 1,5 MB no repositório, mas o navegador baixa só um dos dois. `preload="metadata"` e o `poster` evitam baixar o vídeo antes de ele aparecer.
- **Links quebrados.** Saem rotas com link em `panelTitles.ts`, `queryKeys.ts`, `paths.ts` e no dicionário. `typecheck` pega o que é import; link em string só aparece no `/test` ou num `grep` por `/admin`, `/entities` e `/playground`.

## Sinais de pronto

- `grep -rn "entity\|entities\|playground\|requireAdminApi\|isImpersonating" apps packages` não acha nada fora de `node_modules` (com exceção de palavras que não são o recurso, como `entityTag` de alguma biblioteca, listadas no `/review`).
- Um perfil `type: admin` no emulador entra e usa `/boards` sem impersonar.
- `/` sem sessão mostra a landing com o vídeo; com sessão, vai para `/boards`. O botão leva a `/sign-in`.
- O menu do avatar abre Perfil e Preferências, e a tela de conta não tem sidebar.
- `pnpm turbo run lint typecheck test test:emulator` e `pnpm e2e` verdes, sem o `focusNotObscured.spec.ts`.

## Perguntas em aberto

- A aba Segurança sai mesmo, já que a senha só existe no emulador? — **recomendação:** sim. O E2E e o seed continuam entrando por e-mail e senha no emulador, pela tela de login.
- O slice de referência das skills e do `CLAUDE.md` passa a ser `boardMember`? — **recomendação:** sim. Tem as quatro camadas, guard de board com papel efetivo e tela com tabela e diálogo, que é o padrão que as specs novas vão seguir.
- O avatar continua com upload ou passa a ser sempre o do GitHub? — **recomendação:** manter o upload nesta spec e decidir depois da `spec-authoring`, que também usa o Storage.
- O consentimento de cookies e o `@repo/analytics` saem? — **recomendação:** fora desta spec. Abrir uma spec pequena depois, se o usuário quiser.
- A landing fica no mesmo app (`apps/app`) ou num app separado? — **recomendação:** no mesmo app, como rota pública; um app novo traria outro deploy na Vercel para uma página só.

## Nota de andamento (2026-11-27)

Implementada em 2026-11-27 na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (rodada autônoma do `/cycle`), com analyze, develop, review e test em `docs/features/app-cleanup/`. A branch não tem PR, push nem CI; por isso a spec continua `in-progress` e não foi arquivada.

Conferido no código: o app autenticado só tem `account` e `boards`; a landing está em `apps/app/app/[locale]/(landing)/` com `apps/app/public/landing/agent-board.{mp4,webm}` e o poster; a API ficou com os guards `session.ts` e `board.ts`; nenhum arquivo de `apps/` ou `packages/` lê `isImpersonating`, `x-role` (fora do teste que prova que o cabeçalho é ignorado), `requireAdminApi` ou `requireCommonPanelApi`; o `focusNotObscured.spec.ts` saiu do E2E. O `/test` fechou 20 critérios e `pnpm e2e` 20/20.

Diferenças em relação ao texto acima: o guard de sessão virou `apps/api/app/(guards)/session.ts` (`requireSessionApi`), que substituiu o `common-panel.ts` (o `contends_on` acima já aponta para ele); o `docs/AUTH-PANEL.md` ficou como página curta sobre sessão. Pendente sem bloqueio: as props `canRevoke` e `canGenerate` de `RunnerList` e `RunnerRegistrationPanel` ficaram sem função.
