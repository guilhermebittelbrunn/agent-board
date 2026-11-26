# Revisão: membros, convites e papéis do board

Revisão do diff da tarefa 4 do `/cycle` (`board-members`). O working tree carrega também as tarefas
`github-app-integration`, `github-sign-in` e `board-import`, já revisadas e testadas. O plano de commits
abaixo cobre as quatro e substitui o de [`board-import/review/review.md`](../../board-import/review/review.md).

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada porque o usuário pediu para ficar nela. O regex
do padrão `<project>/<type>/<title>` reprova o nome (`BRANCH INVALIDA`): `guilhermebittelbrunn` não é
projeto e o título vem colado ao tipo. A revisão não renomeou nem criou branch. Nome que passa no regex, se
o usuário quiser trocar antes do push: `feat/github-board-import-and-members` (as quatro tarefas tocam
vários apps, então vai sem prefixo de projeto).

## Achados

| Severidade | Onde | Problema | Ação |
|---|---|---|---|
| 🟡 | `apps/app/.../boards/(pages)/[id]/members/BoardMembersClient.tsx:67` | `grantableRoles(actorRole)` gerava um array novo a cada render, e o `useEffect` do `ChangeMemberRoleDialog.tsx:57-65` depende dele. Com o diálogo aberto, qualquer render do pai (refetch ao voltar o foco, `isFetching`, `isPending` do salvar) chamava `form.reset` e devolvia o select ao papel atual do membro, apagando a escolha. | Corrigido: `rolesToGrant` em `useMemo` com `[canManage, actorRole]`. |
| 🟢 | `apps/api/app/(routes)/boards/[id]/route.ts:4` | O `GET /boards/[id]` devolve o `BoardDTO` inteiro a qualquer membro, inclusive `viewer`: `ownerUserId`, `ownerGithubId` e `installationId`. Nenhum é segredo (regra 15 trata de token e chave). | Mantido. Registrar se o board ganhar campo sensível. |
| 🟢 | `apps/api/(shared)/repositories/board-member.repository.ts:111-120` | Em conflito de id, `createOwnerMember` lê de volta o documento com o id do login do dono, que em tese pode ser um convite pendente. Só acontece se alguém convidar o login do dono antes de o dono passar pelo guard, e convidar exige um membro `maintainer` que não existe nesse board antigo. | Mantido, inalcançável hoje. |
| 🟢 | `apps/app/.../boards/(components)/BoardMembersTable.tsx:94` | A chave `members.table.noActions` ("—") também preenche a coluna Conferido sem data. Funciona, mas o nome da chave não diz isso. | Mantido. |

Nenhum achado 🔴.

### Segurança, item a item

- **Regra 13 em toda rota `/boards/*`.** `GET /boards/[id]` (`view`), `POST /boards/[id]/reload`
  (`configure`), `GET`/`POST /boards/[id]/members` (`view`/`manageMembers`) e `PATCH`/`DELETE
  /boards/[id]/members/[memberId]` (`manageMembers`) passam por `requireBoardApi`. Nenhuma rota usa mais
  `findOwnedBy` nem `ownerUserId` como autorização. `GET`/`POST /boards`, `/boards/preview` e
  `/boards/repositories` não recebem id de board e ficam no `requireCommonPanelApi`; o `POST /boards`
  continua exigindo `admin` via `resolveImportTarget`.
- **Escalonamento de papel.** `canGrantRole` (`packages/kanban-contract/src/roles.ts:67-75`) recusa `owner`
  e qualquer papel acima do efetivo do autor; o schema da borda só aceita `viewer`/`operator`/`maintainer`
  (`board-member.schema.ts:8`). `canChangeMember` (`roles.ts:81-92`) recusa o dono, a própria pessoa e quem
  tem papel guardado acima do efetivo do autor. As rotas usam o papel **efetivo** (`ctx.access.effectiveRole`),
  então um `maintainer` com `write` no GitHub vira `operator` e cai no 403 da capacidade. Um `maintainer`
  pode rebaixar ou remover outro `maintainer`: é a regra do plano ("papel acima" é o limite), não desvio.
- **IDOR em `[memberId]`.** `findChangeableTarget` responde 404 `BOARD_MEMBER_NOT_FOUND` quando o membro é
  de outro board (`members/[memberId]/route.ts:27`); o `findById` da base rejeita id com `/` ou reservado
  antes de consultar.
- **Aceitação de convite.** O login vem de `ctx.subjectProfile.github`, gravado no login GitHub pelo
  servidor; o único schema de entrada do login GitHub aceita só `idToken` (`auth.schema.ts:43`). A
  reivindicação usa o id determinístico `<boardId>__<login>` (`findPending`) e a transação de `activate`
  não ressuscita convite cancelado. O risco R2 (login que troca de dono antes do primeiro acesso) continua
  aceito pelo plano; o papel efetivo segue limitado pela permissão do novo dono do login.
- **Personificação não grava.** `findMembership` monta o dono em memória e não reivindica convite
  (`board-access.ts:83-97`), `recordCheck` só roda fora de personificação (`:190`), `listBoardsOf` não chama
  `claimPendingFor` (`board-list.ts:29`) e as escritas HTTP passam pelo `assertReadOnlyWhileImpersonating`
  do `requireCommonPanelApi`.
- **Desvio 1, gravação antes do 403.** O `recordCheck` atualiza só o documento do próprio membro, com
  `githubRole` vindo do GitHub e `login` vindo do perfil. Não muda `role` nem `status`, então não abre
  escrita que conceda acesso. O custo é uma escrita por pessoa a cada 5 min mesmo em leitura (R6).
- **`SAMPLE_COLLABORATOR_ROLES`.** Só o `createGithubFakeClient` lê o mapa, e o modo `fake` só é escolhido
  sem credencial do App e com `isEmulated()` (`github-app-config.ts`, `resolveGithubClientMode`).
- **`GET /boards` com convite pendente.** `claimPendingFor` ativa os convites do login antes de listar;
  a lista sai do último papel gravado, sem perguntar ao GitHub (R4). Quem perdeu o repositório vê o card e
  recebe 403 `BOARD_REPOSITORY_ACCESS_LOST` ao abrir.

## Desvios do handoff conferidos

| # | Veredito |
|---|---|
| 1 (gravar antes do 403) | Correto e sem escrita indevida (ver acima). Coberto em `boardAccess.test.ts`. |
| 2, 3, 4, 5 | Correto. Organização de módulo, sem efeito de contrato. |
| 6 (`ActionsMenu.triggerLabel`) | Prop opcional com fallback para `translation.trigger`. Consumidores atuais (`EntitiesListClient`, `UsersListClient`, `playground`, testes do design system e do app) não passam a prop e não mudam. |
| 7 (`@repo/kanban-contract` no app) | Correto: o app importa funções em runtime (`grantableRoles`, `canChangeMember`, `canManageMembers`, `canConfigureBoard`, `githubLoginSchema`). Dependência de workspace, sem pacote externo. |
| 8 a 12 | Sem impacto de segurança. O 9 confere: com body válido, `BOARD_MEMBER_ROLE_NOT_ALLOWED` e o 403 de papel acima no `PATCH` só existem como defesa. |

## Correções aplicadas

- `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/members/BoardMembersClient.tsx`:
  `rolesToGrant` em `useMemo` (antes, `canManage ? grantableRoles(actorRole) : []` a cada render). Import de
  `useMemo` ao lado do `useState`.

## Raio de impacto

- `@repo/kanban-contract`: funções novas em `roles.ts`; nada existente muda.
- `@repo/sdk`: `BoardViewDTO` sai de `list`/`findById`/`create` e do `board` do `reload`, aditivo sobre
  `BoardDTO`. Recurso novo `boardMember`.
- `@repo/design-system`: `ActionsMenu` ganha `triggerLabel` opcional.
- `apps/api`: `findOwnedBy` removido, sem uso restante. Coleção nova `boardMember`; o `POST /boards` grava
  board e membro dono no mesmo batch.
- `apps/app`: `BoardCard` mostra o papel; Configuração esconde "Recarregar" de quem não é dono efetivo.

## Verificar no `/test`

1. **Diálogo "Mudar papel" depois da correção.** Abrir o diálogo, trocar o select, sair e voltar à aba
   (refetch por foco) e clicar em "Salvar": o select mantém a escolha durante o salvamento e o papel salvo é
   o escolhido.
2. **Consultas reais no Firestore emulado.** `findActive` (`boardId + githubId + status`), `claimPendingFor`
   (`loginLower + status`), `listActiveByGithubId` (`githubId + status`), a transação de `activate` e o batch
   do `POST /boards`. Repro: M1 e M2 do plano. Se alguma consulta pedir índice composto, o erro aparece aqui.
3. **Escalonamento chamado direto na API.** Com `qa-maintainer` membro `maintainer`: `POST
   /boards/<id>/members` com `role: "owner"` → 400 `VALIDATION_FAILED`; `PATCH` no membro dono → 403
   `BOARD_MEMBER_CHANGE_FORBIDDEN`; `PATCH` em si mesmo → 403. Com `qa-writer` convidado como `maintainer`
   (efetivo `operator`): `POST` de convite → 403 `BOARD_ROLE_INSUFFICIENT`.
4. **IDOR.** `PATCH /boards/<boardA>/members/<id de membro do boardB>` com quem gerencia o board A → 404
   `BOARD_MEMBER_NOT_FOUND`.
5. **Convite pendente.** Convidar `qa-reader`, entrar com ele: `GET /boards` lista o board com o selo
   "Leitor" e a linha dele deixa de ser "Convite pendente". Repetir com o admin personificando um convidado
   pendente: o convite continua pendente (R5).
6. **Perda de acesso.** `qa-outsider` convidado entra, recebe "Sem acesso" ao abrir o board, e a linha dele
   na tela Membros mostra "Sem acesso" / "saiu do repositório" (o desvio 1).
7. **Fluxos M1 a M12 do plano**, tela Membros em claro, escuro e 390 px: rolagem horizontal só dentro da
   tabela, `Popconfirm` com "Remover <login> do board?" e o nome acessível "Ações de <login>".
8. **Pendências da `board-import` (rodada 2):** a 768 px com o menu lateral aberto, a prévia de
   `/boards/new` não sai da borda e o link "Abrir o arquivo no GitHub" aparece inteiro; em `lg` a prévia fica
   em duas colunas e em `xl` em quatro, sem título cortado; o "Copiar" do primeiro acesso anuncia "Copiado"
   ou "Não foi possível copiar" num leitor de tela (`<output aria-live="polite">`).

## Lacunas de teste

| Lacuna | Veredito |
|---|---|
| Sem teste de componente de `BoardMembersClient`/`BoardMembersTable` | Continua aberta. O caso do item 1 acima caberia num teste do `ChangeMemberRoleDialog` com rerender do pai. |
| `boardMemberRepository` sem teste próprio | Continua aberta; só se prova com emulador (item 2). |
| Lacunas herdadas da `board-import` | Sem mudança desta revisão; seguem como registradas lá. |

## Decisões em aberto

- Nome da branch (acima). Recomendação: trocar antes do push; a revisão não trocou.
- Pergunta 12 do plano (o seletor de importação mostra "Já tem board" para quem é membro sem ser dono)
  continua com o usuário.
- Estratégia de commit para arquivos mistos (abaixo). Recomendação aplicada: commit misto com o porquê na
  mensagem, sem reconstruir blobs.

## Gates

| Gate | Resultado |
|---|---|
| `pnpm check` | `Checked 759 files`, sem erro |
| `pnpm turbo run typecheck` em `api`, `app`, `@repo/sdk`, `@repo/kanban-contract`, `@repo/internationalization`, `@repo/design-system` | `6 successful, 6 total` (4 do cache) |
| `npx vitest run apiErrorCodes` em `apps/api` | 2/2 |

A suíte Vitest não foi rodada aqui. Os números do handoff (API 1006 testes, app 701, contrato 67) são do
`/develop`; a correção não muda comportamento coberto por teste existente.

Varredura de segredo em `docs/features/board-members/`: nenhuma senha, token, chave ou e-mail real. Os
e-mails citados no plano são `@example.com`.

## Depois do `/test`, rodada 1

O [`test/report.md`](../test/report.md) achou um 🟡 e um 🟢. Os dois foram corrigidos na raiz, nos pacotes
compartilhados.

- 🟡 **Link ativo da navegação sem fundo.** O `BoardSectionNav` monta o link com `buttonVariants`
  (`bg-secondary` no ativo), mas o fundo calculado saía transparente. A causa está no antd 5.29: ao montar
  qualquer componente, ele injeta um reset global `a { color: colorLink; background-color: transparent; ... }`
  (`genLinkStyle`, via `getResetStyles` em `theme/util/genStyleUtils.js`) fora de qualquer `@layer`. Regra
  fora de camada vence as camadas do Tailwind v4, então toda utilidade de cor ou fundo num `<a>` perdia nas
  telas com antd. O defeito não é desta tela: atinge os links com `buttonVariants`/`asChild` de
  `Sidebar.tsx`, `NotFoundPage.tsx`, `PanelNavbarControls.tsx`, `ProfileDropdown.tsx`,
  `NotificationsBell.tsx`, `BoardsFirstAccess.tsx`, `BoardConfigFileCard.tsx` e `RepositoryPicker.tsx`
  quando dividem a tela com um componente antd. As regras `html [data-slot="breadcrumb"] ...` e
  `html [data-slot="sidebar-menu-button"]` de `globals.css` são remendos antigos do mesmo vazamento.

  Correção:
  - `packages/design-system/providers/antd-app.tsx`: o `ConfigProvider` passa a ficar dentro de
    `<StyleProvider layer>` (`@ant-design/cssinjs`), e o antd injeta tudo em `@layer antd`. Com `layer`, o
    cssinjs anexa os `<style>` ao fim do `head` em vez de prependê-los, e o antd não declara dependência de
    camada, então nada é prependido antes da folha do app.
  - `apps/app/app/styles.css`: primeira instrução `@layer theme, base, antd, components, utilities;`, antes
    do `@import "tailwindcss"`. O antd fica acima do preflight (como hoje, quando vencia tudo) e abaixo das
    utilidades. A declaração tinha de ir na entrada do app, não no `globals.css`: a entrada importa o
    Tailwind antes do `globals.css`, e a ordem das camadas é a da primeira declaração. Compilado com
    `@tailwindcss/node` 4.1.16, a saída começa com `@layer properties;` e
    `@layer theme, base, antd, components, utilities;`.
  - `packages/design-system/package.json`: `@ant-design/cssinjs` `^1.24.0` declarado. O lockfile resolve a
    1.24.0, a mesma instância que o antd usa; com duas cópias o contexto do `StyleProvider` não chegaria
    ao antd.

  Por que a raiz é segura: com o antd abaixo das utilidades, só mudam os elementos que têm classe do
  Tailwind e regra do antd ao mesmo tempo. No design system, isso se resume ao `w-full` do `AntdTable`
  (`table.tsx:151`); nenhuma tela do app passa `className` ao `Table`. As regras `html .ant-*` sem camada do
  `globals.css` continuam vencendo como antes. O preflight continua abaixo do antd. O teste de hidratação
  do `antdTheme.test.tsx` passa.

- 🟢 **Itens do `ActionsMenu` com nome "delete Remover".** O `@ant-design/icons` renderiza
  `<span role="img" aria-label="delete">`, e o leitor de tela somava esse nome ao rótulo do item. Os ícones
  `EditOutlined` e `DeleteOutlined` ganharam `aria-hidden` (`action-menu.tsx:110` e `:134`). Vale para
  todos os consumidores do menu.

Testes novos, cada um conferido falhando sem a correção:

- `packages/design-system/__tests__/antdTheme.test.tsx`: todo `<style data-css-hash>` injetado pelo antd,
  inclusive o reset de `a`, começa com `@layer antd`.
- `packages/design-system/__tests__/actionMenu.test.tsx`: os itens se chamam exatamente "Editar" e
  "Excluir" (`getByRole("menuitem", { name })`).
- `apps/app/__tests__/stylesLayerOrder.test.ts`: a primeira instrução de `styles.css` é a ordem das
  camadas e a segunda é o `@import "tailwindcss"`.

A remedição no browser fica para a passada de QA da `card-backlog`, que mexe nessa mesma navegação. O que
medir lá: o link ativo de "Seções do board" com o fundo `secondary` calculado em claro e escuro; os demais
links com `buttonVariants` listados acima sem mudança indesejada; tabela, menu de ações, `Popconfirm` e
paginação do antd com a mesma aparência de antes; o nome acessível dos itens do menu sem "delete"/"edit".

Gates desta rodada: `pnpm check` com `Checked 761 files`, sem erro; `pnpm turbo run typecheck` em `app` e
`@repo/design-system` com `2 successful`; suíte do `@repo/design-system` 142/142 (14 arquivos); no app,
`stylesLayerOrder` e `securityHeaders` 25/25.

## Plano de commits (tarefas 1 a 4)

> Substituído pelo plano das tarefas 1 a 5 em
> [`card-backlog/review/review.md`](../../card-backlog/review/review.md#plano-de-commits-tarefas-1-a-5). A
> lista abaixo fica como histórico; os blobs de `index.ts` dos commits 2 e 3 mudaram lá.

Ordem: pacotes → `apps/api` → `apps/app` → `apps/e2e` → i18n → docs → instruções de agente → specs →
artefatos. Antes do commit 1, `git diff --cached --stat` precisa sair vazio. Depois de cada commit,
`git show --stat --oneline HEAD` contra a lista.

### Arquivos com trechos de mais de uma tarefa

Os arquivos que nasceram untracked na tarefa 3 e foram alterados na 4 não têm versão intermediária no git.
Isolar a tarefa 4 exigiria escrever à mão a versão da tarefa 3 de cerca de 20 arquivos e gravar cada uma
com `git hash-object`, e nenhuma dessas versões foi testada. A revisão escolheu o caminho simples: cada um
desses arquivos entra inteiro no primeiro commit que precisa dele, e a mensagem do commit diz que ele já
traz a parte de membros. Os arquivos que são só da tarefa 4 ficam em commits próprios, logo depois. A ordem
foi montada para que cada commit de código só importe arquivos já commitados (exceto i18n, como antes).

Arquivos mistos e onde entram: `packages/sdk/src/types/board/{board,index}.ts`,
`packages/sdk/src/actions/board/action.ts`, `packages/sdk/src/client/index.ts` (commit 7);
`github-fake-client.ts`, `github-sample-repositories.ts` (commit 13); `board.repository.ts`,
`githubFakeClient.test.ts` (commit 18); `boards/route.ts`, `boards/[id]/route.ts`,
`boards/[id]/reload/route.ts`, `boardsRoutes.test.ts` (commit 20); `useListBoards.tsx`,
`useFindBoardById.tsx`, `useBoardCrud.tsx`, `queryKeys.ts` (commit 25); `BoardCard.tsx`,
`BoardSettingsClient.tsx`, `paths.ts`, `panelTitles.ts` (commit 26); i18n `boards.ts`, `routes/index.ts`,
`utils.ts` (commits 30 e 32); `docs/SETUP.md` (commit 33); `pnpm-lock.yaml` (commits 3 e 10, como antes).

Os preparos por blob do plano anterior continuam valendo: `packages/kanban-contract/src/index.ts` no
commit 2 e `pnpm-lock.yaml` no commit 3 (comandos em
[`board-import/review/review.md`](../../board-import/review/review.md#plano-de-commits-tarefas-1-2-e-3)).
O `pnpm-lock.yaml` inteiro no commit 10 já traz o link `@repo/kanban-contract` do importer `apps/app` e o
`@ant-design/cssinjs` do `@repo/design-system`. Os commits 11 e 12 declaram essas dependências nos
`package.json` logo em seguida, para nenhum commit de código rodar com lockfile e `package.json` em desacordo.

Os commits do app só passam no typecheck com o 32 aplicado (dicionário), e os da API só passam no
`apiErrorCodes` com o 30. O PR fica verde no último commit.

### Lista

1. `feat(shared): add github log scope and BAD_GATEWAY status`
   - `packages/shared/utils/helpers/log.ts`, `packages/shared/utils/helpers/httpStatus.ts`
2. `feat(kanban-contract): add the GitHub identity schema` (`index.ts` parcial, só `./identity`)
   - `packages/kanban-contract/src/identity.ts`, `packages/kanban-contract/src/index.ts`,
     `packages/kanban-contract/__tests__/identity.test.ts`
3. `feat(kanban-contract): parse board.yml text and map validation issues` (lockfile parcial, só o `yaml`)
   - `packages/kanban-contract/package.json`
   - `packages/kanban-contract/src/boardConfig.ts`, `boardConfigIssues.ts`, `boardConfigDiff.ts`,
     `boardConfigYaml.ts`, `index.ts` (resto)
   - `packages/kanban-contract/__tests__/boardConfigYaml.test.ts`, `boardConfigIssues.test.ts`,
     `boardConfigDiff.test.ts`
   - `pnpm-lock.yaml` (só o `yaml`)
4. `feat(kanban-contract): add rules for granting and changing board roles`
   - `packages/kanban-contract/src/roles.ts`, `packages/kanban-contract/__tests__/roles.test.ts`
5. `feat(design-system): name the ActionsMenu trigger and keep icon names out of its items`
   - `packages/design-system/components/ui/action-menu.tsx`
   - `packages/design-system/__tests__/actionMenu.test.tsx`
6. `feat(sdk): replace Google sign-in with GitHub sign-in`
   - `packages/sdk/package.json`, `packages/sdk/src/types/user/user.ts`,
     `packages/sdk/src/actions/auth/action.ts`
7. `feat(sdk): add boards and board members resources`
   - corpo: `The board types and client were written together with the members resource, so they ship in one commit.`
   - `packages/sdk/src/types/board/board.ts`, `packages/sdk/src/types/board/index.ts`,
     `packages/sdk/src/types/board/member.ts`, `packages/sdk/src/types/index.ts`
   - `packages/sdk/src/actions/board/action.ts`, `packages/sdk/src/actions/boardMember/action.ts`
   - `packages/sdk/src/client/index.ts`
8. `refactor(auth): remove Google sign-in and clear a cookie written after sign-out`
   - `packages/auth/client.ts`, `packages/auth/provider.tsx`
9. `feat(auth): refuse sign-in methods other than GitHub outside the emulator`
   - `packages/auth/sign-in-method.ts`, `packages/auth/package.json`, `packages/auth/session.ts`,
     `packages/auth/session-routes.ts`, `packages/auth/server.ts`
   - `packages/auth/__tests__/signInMethod.test.ts`, `serverSessionRevocation.test.ts`,
     `sessionAbsoluteCap.test.ts`, `sessionOrigin.test.ts`, `sessionRefreshRoute.test.ts`,
     `sessionRoutesAuthority.test.ts`
10. `chore(api): declare GitHub App environment variables`
    - `apps/api/env.ts`, `apps/api/.env.example`, `apps/api/package.json`
    - `pnpm-lock.yaml` (inteiro)
11. `chore(app): depend on @repo/kanban-contract`
    - `apps/app/package.json`
12. `fix(design-system): put antd styles in a cascade layer below Tailwind utilities`
    - `packages/design-system/package.json`, `packages/design-system/providers/antd-app.tsx`
    - `packages/design-system/__tests__/antdTheme.test.tsx`
13. `feat(api): add GitHub App client with a sample client for the emulator`
    - corpo: `The sample client answers a fixed repository permission for the QA logins, used to test board roles.`
    - `apps/api/(shared)/lib/github/github-app-config.ts`, `github-app-jwt.ts`, `github-client.ts`,
      `github-errors.ts`, `github-installation-tokens.ts`, `github-permission-cache.ts`,
      `github-rest-client.ts`, `github-fake-client.ts`, `github-sample-repositories.ts`
    - `apps/api/__tests__/githubAppJwt.test.ts`, `githubRestClient.test.ts`,
      `githubPermissionCache.test.ts`, `githubErrorResponse.test.ts`, `githubClientMode.test.ts`
14. `feat(api): add signed GitHub webhook endpoint`
    - `apps/api/(shared)/lib/github/github-webhook-signature.ts`, `github-webhook-events.ts`
    - `apps/api/(shared)/validation/github-webhook.schema.ts`
    - `apps/api/app/(routes)/github/webhook/route.ts`
    - `apps/api/__tests__/githubWebhookSignature.test.ts`, `githubWebhookRoute.test.ts`
15. `feat(api): warn at boot when the GitHub App is not configured`
    - `apps/api/instrumentation.ts`
    - `apps/api/__tests__/githubBootNotice.test.ts`, `corsOriginBoot.test.ts`
16. `feat(api): replace Google sign-in with GitHub sign-in`
    - `apps/api/(shared)/lib/firebase-identity-toolkit.ts`, `github-identity.ts`, `user-merge.ts`
    - `apps/api/(shared)/validation/auth.schema.ts`
    - `apps/api/app/(routes)/auth/sign-in/github/route.ts`
    - `apps/api/app/(routes)/auth/sign-in/google/route.ts` (removido)
    - `apps/api/proxy.ts`
    - `apps/api/__tests__/authSignInGithubRoute.test.ts`, `firebaseIdentityLookup.test.ts`,
      `corsOrigin.test.ts`
    - `apps/api/__tests__/authSignInGoogleRoute.test.ts`, `authSignInGoogleToolkit.test.ts`,
      `googleSignInProfile.test.ts` (removidos)
17. `feat(api): refuse password sign-in outside the emulator`
    - `apps/api/(shared)/lib/resolve-api-actor.ts`
    - `apps/api/app/(routes)/auth/sign-in/route.ts`
    - `apps/api/__tests__/authSignInRoute.test.ts`, `resolveApiActorSession.test.ts`
18. `feat(api): store boards imported from a repository with their owner member`
    - corpo: `The board repository writes the owner's member document in the same batch, so the member mapper ships here.`
    - `apps/api/(shared)/validation/board.schema.ts`
    - `apps/api/(shared)/mappers/board.mapper.ts`, `apps/api/(shared)/mappers/board-member.mapper.ts`
    - `apps/api/(shared)/repositories/board.repository.ts`
    - `apps/api/(shared)/lib/board-import.ts`
    - `apps/api/vitest.config.mts`
    - `apps/api/__tests__/boardMapper.test.ts`, `boardMemberMapper.test.ts`, `githubFakeClient.test.ts`
19. `feat(api): resolve the effective board role in a board guard`
    - `apps/api/(shared)/repositories/board-member.repository.ts`
    - `apps/api/(shared)/lib/board-access.ts`, `apps/api/(shared)/lib/board-list.ts`
    - `apps/api/app/(guards)/board.ts`
    - `apps/api/__tests__/boardAccess.test.ts`, `apps/api/__tests__/fakeBoardMemberRepository.ts`
20. `feat(api): add board routes behind the board role guard`
    - corpo: `Board routes were written against the role guard, so they ship already guarded.`
    - `apps/api/app/(routes)/boards/route.ts`, `boards/repositories/route.ts`, `boards/preview/route.ts`,
      `boards/[id]/route.ts`, `boards/[id]/reload/route.ts`
    - `apps/api/__tests__/boardsRoutes.test.ts`
21. `feat(api): add board member routes`
    - `apps/api/(shared)/validation/board-member.schema.ts`
    - `apps/api/app/(routes)/boards/[id]/members/route.ts`,
      `apps/api/app/(routes)/boards/[id]/members/[memberId]/route.ts`
    - `apps/api/__tests__/boardMembersRoutes.test.ts`
22. `feat(app): sign in with GitHub on the sign-in screen`
    - `apps/app/shared/lib/githubSignInApi.ts`, `emulatorSignIn.ts`
    - `apps/app/shared/lib/googleSignInApi.ts` (removido)
    - `apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx`
    - `apps/app/__tests__/githubSignInApi.test.ts`, `signInForm.test.tsx`,
      `authFormsPersistedSessionRedirect.test.tsx`, `authProviderSessionNotEstablished.test.tsx`,
      `postLoginFullPageNavigation.test.tsx`, `sessionExpiredSignOut.test.tsx`,
      `signInEnterResubmit.test.tsx`
    - `apps/app/__tests__/googleSignInApi.test.ts` (removido)
23. `feat(app): show the GitHub login in the profile menu and allow GitHub avatars`
    - `apps/app/shared/components/ui/ProfileDropdown.tsx`, `apps/app/proxy.ts`
    - `apps/app/__tests__/profileDropdownAccount.test.tsx`, `securityHeaders.test.ts`
24. `test(app): cover a sign-out while the session cookie is being written`
    - `apps/app/__tests__/authProviderSignOutDuringSessionWrite.test.tsx`
25. `feat(app): add board data hooks`
    - corpo: `The board hooks already read the caller's role on each board.`
    - `apps/app/shared/lib/queryKeys.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoards.tsx`,
      `useFindBoardById.tsx`, `useBoardCrud.tsx`, `useListImportableRepositories.tsx`,
      `usePreviewBoardImport.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardConfigIssueMessage.ts`
    - `apps/app/__tests__/useBoardCrud.test.tsx`, `boardConfigIssueMessage.test.ts`
26. `feat(app): add boards, new board and board settings screens`
    - corpo: `The list shows the caller's role on each board, and settings links to the members section.`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/`: `BoardCard.tsx`,
      `BoardColumnsPreview.tsx`, `BoardConfigFileCard.tsx`, `BoardConfigIssues.tsx`,
      `BoardReloadResult.tsx`, `BoardRulesSummary.tsx`, `BoardSectionNav.tsx`, `BoardStagesTable.tsx`,
      `BoardsFirstAccess.tsx`, `RepositoryPicker.tsx`, `RepositorySummary.tsx`, `githubFileUrl.ts`,
      `newBoardWizardCopy.ts`, `shortSha.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/(home)/` (3 arquivos),
      `(pages)/[id]/settings/` (3 arquivos), `(pages)/new/` (2 arquivos)
    - `apps/app/__tests__/newBoardWizardCopy.test.tsx`, `githubFileUrl.test.ts` (este faltava no plano
      anterior)
    - `apps/app/app/[locale]/(authenticated)/(common)/paths.ts`,
      `apps/app/app/[locale]/(authenticated)/(common)/routes.tsx`, `apps/app/shared/lib/panelTitles.ts`
27. `feat(app): add the board members screen`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardMembers.tsx`,
      `useBoardMemberCrud.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/inviteMemberSchema.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/InviteMemberForm.tsx`,
      `BoardMembersTable.tsx`, `ChangeMemberRoleDialog.tsx`, `BoardRolesGuide.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/members/` (3 arquivos)
    - `apps/app/__tests__/useBoardMemberCrud.test.tsx`
28. `fix(app): order the antd layer between Tailwind's preflight and utilities`
    - `apps/app/app/styles.css`, `apps/app/__tests__/stylesLayerOrder.test.ts`
29. `test(e2e): cover GitHub sign-in through the emulator popup`
    - `apps/e2e/tests/githubSignIn.spec.ts`
30. `feat(internationalization): add copy for GitHub, sign-in, board and board member error codes` (misto)
    - `packages/internationalization/translations/packages/shared/utils.ts`
31. `feat(internationalization): replace Google sign-in copy with GitHub`
    - `packages/internationalization/translations/apps/app/pages/signIn/index.ts`
    - `packages/internationalization/translations/packages/auth/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/account.ts`
32. `feat(internationalization): add boards and board members copy` (misto)
    - `packages/internationalization/translations/apps/app/pages/common/boards.ts`
    - `packages/internationalization/translations/apps/app/pages/common/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/routes/index.ts`
33. `docs: document GitHub App, GitHub sign-in and the QA logins of the sample client` (misto)
    - `docs/SETUP.md`, `docs/PRE-PRODUCTION.md`
34. `docs: describe GitHub as the only sign-in method`
    - `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/AUTH-PANEL.md`, `docs/board/ACCESS.md`,
      `docs/board/README.md`, `docs/board/DECISIONS.md`, `docs/board/ROADMAP.md`
35. `chore(claude): state GitHub as the sign-in method in agent instructions`
    - `CLAUDE.md`, `AGENTS.md`, `apps/app/CLAUDE.md`
36. `docs(specs): reconcile backlog with the code`
    - `specs/BACKLOG.md`, `specs/reference/AUDIT.md`, `specs/features/board-import.md`,
      `specs/features/board-members.md`, `specs/features/github-app-integration.md`,
      `specs/features/github-sign-in.md`, `specs/features/spec-discovery.md`
37. `docs(features): github-app-integration` · `docs/features/github-app-integration/`
38. `docs(features): github-sign-in` · `docs/features/github-sign-in/`
39. `docs(features): board-import` · `docs/features/board-import/`
40. `docs(features): board-members` · `docs/features/board-members/`

Os arquivos removidos entram com `git add` explícito do caminho (ou `git rm`) no commit correspondente.
Toda mensagem termina com a linha de coautoria definida na sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import and board members`.

Commits realizados: _(preenchido pelo orquestrador)_
