# Handoff: membros, convites e papéis do board

Implementação do plano `analyze/plan.md`, feita no `/cycle` sem acompanhamento. Nada foi commitado. O working
tree também tem as mudanças sem commit de `github-app-integration`, `github-sign-in` e `board-import`; a seção
"Separar os commits" diz o que é desta tarefa.

## Blueprint → arquivos

| Item do plano | Arquivos |
|---------------|----------|
| 10.3 regras de "quem muda quem" | `packages/kanban-contract/src/roles.ts` (`INVITABLE_BOARD_ROLES`, `InvitableBoardRole`, `canGrantRole`, `grantableRoles`, `canChangeMember`), `packages/kanban-contract/__tests__/roles.test.ts` |
| 10.1 contrato | `packages/sdk/src/types/board/member.ts` (novo), `types/board/index.ts`, `types/board/board.ts` (`BoardReloadResultDTO.board: BoardViewDTO`), `actions/boardMember/action.ts` (novo), `actions/board/action.ts` (`list`/`findById`/`create` tipados como `BoardViewDTO`), `client/index.ts` (`boardMember`) |
| 4.6 cliente falso por login | `apps/api/(shared)/lib/github/github-sample-repositories.ts` (`SAMPLE_COLLABORATOR_ROLES`), `github-fake-client.ts`, `__tests__/githubFakeClient.test.ts` |
| 2.1 e 4.4 coleção, mapper, repositório | `apps/api/(shared)/mappers/board-member.mapper.ts` (novo), `(shared)/repositories/board-member.repository.ts` (novo), `(shared)/repositories/board.repository.ts` (`listByIds`, batch com o membro dono, `findOwnedBy` removido) |
| 4.3 validação | `apps/api/(shared)/validation/board-member.schema.ts` (novo) |
| 4.1 guard | `apps/api/(shared)/lib/board-access.ts` (novo), `apps/api/app/(guards)/board.ts` (novo, `requireBoardApi`) |
| 4.2 rotas alteradas | `apps/api/app/(routes)/boards/route.ts` (GET por membro, POST com membro dono), `boards/[id]/route.ts`, `boards/[id]/reload/route.ts`, `apps/api/(shared)/lib/board-list.ts` (novo, a listagem do GET) |
| 4.3 rotas novas | `apps/api/app/(routes)/boards/[id]/members/route.ts`, `boards/[id]/members/[memberId]/route.ts` |
| 7 testes da API | `__tests__/boardAccess.test.ts`, `boardMemberMapper.test.ts`, `boardMembersRoutes.test.ts` (novos), `fakeBoardMemberRepository.ts` (fake em memória usado pelos três de rota/guard), `boardsRoutes.test.ts` (ajustado) |
| 5.2 dados no app | `apps/app/shared/lib/queryKeys.ts` (`boards.members`), `(hooks)/useListBoardMembers.tsx`, `(hooks)/useBoardMemberCrud.tsx` (novos), `useListBoards`/`useFindBoardById`/`useBoardCrud` com `BoardViewDTO` |
| 5.1 e 5.3 telas | `(pages)/[id]/members/{page.tsx,BoardMembersClient.tsx,loading.tsx}`, `(components)/{BoardSectionNav,InviteMemberForm,BoardMembersTable,ChangeMemberRoleDialog,BoardRolesGuide}.tsx` (novos), `(validations)/inviteMemberSchema.ts`, `BoardCard.tsx` (selo pelo papel), `BoardSettingsClient.tsx` (nav e "Recarregar" só para quem configura), `paths.ts` (`boards.members`), `shared/lib/panelTitles.ts` |
| 7 teste do app | `apps/app/__tests__/useBoardMemberCrud.test.tsx` |
| 10.8 i18n | `packages/internationalization/translations/apps/app/pages/common/boards.ts` (`roles`, `nav`, `members`; sai `list.ownerBadge`), `.../routes/index.ts` (`boards.members`), `translations/packages/shared/utils.ts` (6 `apiErrors`) |
| 10.7 docs | `docs/SETUP.md` (tabela dos logins do cliente falso) |
| fora do plano | `packages/design-system/components/ui/action-menu.tsx` (prop `triggerLabel`), `apps/app/package.json` + `pnpm-lock.yaml` (`@repo/kanban-contract` declarado no app) |

## Contrato e raio de impacto

`BoardViewDTO = BoardDTO & { access: BoardAccessDTO }` passa a sair de `GET /boards`, `GET /boards/[id]`,
`POST /boards` e do `board` do `reload`. O `BoardDTO` não mudou. Consumidores: os três hooks de board do app,
`BoardCard`, `BoardsListClient` (via `useListBoards`), `NewBoardClient` (via `onCreated`) e `BoardSettingsClient`.
O campo é aditivo.

Recurso novo `apiClient.boardMember` (`list`, `invite`, `updateRole`, `remove`), consumido pelos dois hooks novos e
pelo prefetch de `members/page.tsx`.

`boardRepository.findOwnedBy` foi removido; nenhuma rota usa mais.

## Códigos de erro novos

`BOARD_ROLE_INSUFFICIENT` (403), `BOARD_REPOSITORY_ACCESS_LOST` (403), `BOARD_MEMBER_NOT_FOUND` (404),
`BOARD_MEMBER_ALREADY_EXISTS` (409), `BOARD_MEMBER_ROLE_NOT_ALLOWED` (403), `BOARD_MEMBER_CHANGE_FORBIDDEN` (403).
Os seis estão em `apiErrors`; `pnpm vitest run __tests__/apiErrorCodesTranslated.test.ts` na API passa (2 testes).

## Desvios

1. **Ordem do guard (decisão do plano errada).** O plano grava a checagem (passo 8) depois das recusas 403 (passos
   6 e 7). Nessa ordem, quem perdeu o repositório recebe 403 e nada é gravado, então a linha dele nunca mostra
   `none` / "Sem acesso" e o fluxo M8 do `/test` não teria como passar. O guard grava a checagem antes de recusar
   (fora de personificação). Coberto em `boardAccess.test.ts` ("refuses a member who lost the repository and
   records it").
2. `ownerMemberWrite`, `identityFields`, `MemberIdentity`, `MemberWrite` e `BOARD_MEMBER_TABLE` ficaram no módulo
   do mapper, não no repositório. O `POST /boards`, o guard (dono sob personificação, montado em memória) e o
   fake de teste usam a mesma função, e o mock do repositório não a substitui.
3. A listagem do `GET /boards` foi para `apps/api/(shared)/lib/board-list.ts`, e o `BoardRepository` ganhou
   `listByIds` (`getAll`). O plano não nomeava esses dois.
4. `resolve-route-id.ts` não mudou. O guard resolve `params` sozinho e a rota de `[memberId]` declara o tipo
   localmente. `next typegen` + `tsc` nas duas apps passam com as rotas novas.
5. O tipo do contexto em `requireBoardApi` é um alias local (`BoardRouteContext`), porque o teste
   `impersonationReadOnly.test.ts` procura a delegação `return requireCommonPanelApi<...>(` com uma regex que não
   aceita genérico aninhado. O teste não foi alterado.
6. `ActionsMenu` ganhou `triggerLabel` opcional para o `aria-label` "Ações de <login>". Sem ele, todas as linhas
   teriam o mesmo nome acessível "Ações".
7. `apps/app/package.json` declara `@repo/kanban-contract` (workspace). O app passou a importar funções em runtime
   (`grantableRoles`, `canChangeMember`, `canManageMembers`, `canConfigureBoard`, `githubLoginSchema`), não só
   tipos. Não é dependência externa nova.
8. Convite pendente só tem "Cancelar convite" no menu, sem "Mudar papel", como no `Members.png`. A API aceita o
   `PATCH` num pendente.
9. `PATCH` com papel acima do autor responde `BOARD_MEMBER_CHANGE_FORBIDDEN`, como o plano pede. Na prática nem
   esse caso nem `BOARD_MEMBER_ROLE_NOT_ALLOWED` são alcançáveis com body válido: o schema só aceita
   `viewer`/`operator`/`maintainer` e a capacidade `manageMembers` já exige `maintainer` efetivo. Ficam como defesa.
10. A tabela de membros tem `onRefresh` e não tem `searchFields`.
11. A chave `guide.requires` é uma só (`"Exige {role} no GitHub"`), com o papel do GitHub em `<code>`, em vez de uma
    por papel. Entraram também `members.table.noActions` ("—") e `members.changeRole.role`.
12. `docs/PRE-PRODUCTION.md` não foi tocado. O plano pedia uma linha de pendência, mas não há infra nova; os
    sinais com permissão real e webhook real continuam dependendo dos itens 4 e 5 já registrados lá.

## Decisões em aberto / pendências

- Nenhum bloqueio.
- O picker de importação continua mostrando "Já tem board" para um board em que a pessoa é membro sem ser dona
  (pergunta 12 do plano, deixada como está).
- Um documento `boardMember` órfão com o id do dono (board apagado e reimportado) faria o batch do `POST /boards`
  falhar com `BOARD_ALREADY_EXISTS`. Hoje não existe rota que apague board.

## Validação

| Comando | Resultado |
|---------|-----------|
| `pnpm check` | 759 arquivos, sem erro |
| `pnpm turbo run typecheck --filter=api --filter=app --filter=@repo/sdk --filter=@repo/kanban-contract --filter=@repo/internationalization --filter=@repo/design-system` | 6/6 ok |
| `pnpm exec next typegen` + `pnpm typecheck` em `apps/api` e `apps/app` | ok (rotas de membros no `validator.ts`) |
| `pnpm turbo run test --filter=api --filter=app` | api 83 arquivos / 1006 testes; app 98 arquivos / 701 testes; 11/11 tasks |
| `pnpm --filter @repo/kanban-contract test` | 67 testes |
| `pnpm turbo run test` nos demais pacotes tocados (sdk, i18n, design-system) | verdes |
| `apiErrorCodesTranslated.test.ts` | 2 testes, verdes |

Não rodei emulador, app nem browser. Nenhum smoke local.

## A verificar no `/test`

Nada abaixo foi medido; os testes de rota provam a API com repositório em memória.

- Consultas reais do `boardMemberRepository` no Firestore emulado: igualdade em dois campos sem índice composto
  (`boardId + githubId + status`, `loginLower + status`, `githubId + status`), a transação de `activate` e o batch
  do `POST /boards` gravando board e membro. Repro: M1 e M2 do plano.
- Fluxos M1 a M12 do plano, com as contas `qa-*` criadas pelo popup do emulador.
- Tela Membros em claro, escuro e 390 px: rolagem horizontal só dentro da tabela, o `Dialog` de "Mudar papel", o
  `Popconfirm` de remover/cancelar com o título "Remover <login> do board?" e o `aria-label` "Ações de <login>".
- `BoardCard` com o selo do papel ("Operador" para `qa-reader`) e Configuração sem "Recarregar" para quem não é
  dono efetivo.
- Formulário de convite: erro de login inválido no campo sem chamada à API (M4) e campo limpo após sucesso.

## Lacunas de teste conhecidas

- Nenhum teste de componente para `BoardMembersClient`/`BoardMembersTable` (formulário escondido para `viewer`,
  linha do dono e a própria sem ações, sob personificação sem formulário). Só o `/test` cobre hoje.
- `boardMemberRepository` não tem teste próprio; as rotas e o guard usam `fakeBoardMemberRepository.ts`.

## Separar os commits

Os arquivos de `board-import` e de `github-app-integration` ainda são untracked, então esta tarefa não dá para
separar com `git add -p` nesses arquivos. A ordem sugerida é commitar as tarefas anteriores primeiro e, para os
arquivos abaixo, desfazer na cópia o trecho desta tarefa antes do commit delas (ou commitar o arquivo inteiro no
commit desta tarefa, se o revisor preferir).

Arquivos só desta tarefa (novos ou com diff só meu):

- `packages/kanban-contract/src/roles.ts` e `__tests__/roles.test.ts` (diff inteiro)
- `packages/sdk/src/types/board/member.ts`, `packages/sdk/src/actions/boardMember/action.ts`
- `packages/sdk/src/client/index.ts`: as linhas `BoardMemberActions` (import, campo, construtor). As linhas de
  `BoardActions` são da `board-import`.
- `apps/api/(shared)/lib/board-access.ts`, `board-list.ts`, `mappers/board-member.mapper.ts`,
  `repositories/board-member.repository.ts`, `validation/board-member.schema.ts`, `app/(guards)/board.ts`,
  `app/(routes)/boards/[id]/members/**`
- `apps/api/__tests__/boardAccess.test.ts`, `boardMemberMapper.test.ts`, `boardMembersRoutes.test.ts`,
  `fakeBoardMemberRepository.ts`
- `apps/app/__tests__/useBoardMemberCrud.test.tsx`, `(hooks)/useListBoardMembers.tsx`,
  `(hooks)/useBoardMemberCrud.tsx`, `(validations)/inviteMemberSchema.ts`, `(components)/BoardSectionNav.tsx`,
  `InviteMemberForm.tsx`, `BoardMembersTable.tsx`, `ChangeMemberRoleDialog.tsx`, `BoardRolesGuide.tsx`,
  `(pages)/[id]/members/**`
- `packages/design-system/components/ui/action-menu.tsx` (diff inteiro)

Trechos desta tarefa dentro de arquivos de tarefas anteriores:

- `packages/sdk/src/types/board/board.ts`: o import de `BoardViewDTO` e `board: BoardViewDTO` em
  `BoardReloadResultDTO`.
- `packages/sdk/src/types/board/index.ts`: `export * from "./member"`.
- `packages/sdk/src/actions/board/action.ts`: troca de `BoardDTO` por `BoardViewDTO` em `list`, `findById`, `create`.
- `apps/api/(shared)/lib/github/github-sample-repositories.ts`: import de `GithubRepoRole` e `SAMPLE_COLLABORATOR_ROLES`.
- `apps/api/(shared)/lib/github/github-fake-client.ts`: JSDoc de `createGithubFakeClient`, import de
  `SAMPLE_COLLABORATOR_ROLES` e o papel por login em `getCollaboratorRole`.
- `apps/api/__tests__/githubFakeClient.test.ts`: título do teste "outside the QA logins" e o teste "answers the
  listed permission for the QA logins".
- `apps/api/(shared)/repositories/board.repository.ts`: import de `BOARD_MEMBER_TABLE`/`MemberWrite`, remoção do
  comentário de `ownedBy` e de `findOwnedBy`, `listByIds`, o parâmetro `ownerMember` e o batch em
  `createForRepository` (com a frase sobre o membro dono no JSDoc).
- `apps/api/app/(routes)/boards/route.ts`: `GET` via `listBoardsOf`; no `POST`, a checagem de `github`, `boardId`,
  `createdAt`, `ownerMemberWrite`, o 3º argumento de `createForRepository` e a resposta `BoardViewDTO`.
- `apps/api/app/(routes)/boards/[id]/route.ts`: arquivo reescrito para `requireBoardApi("view")`.
- `apps/api/app/(routes)/boards/[id]/reload/route.ts`: `requireBoardApi("configure")` no lugar de
  `findOwnedBy`, `BoardViewDTO` no resultado.
- `apps/api/__tests__/boardsRoutes.test.ts`: mocks `listByIds`/`findById` no lugar de `findOwnedBy`, o mock por
  `Proxy` do `boardMemberRepository`, `UNCHECKED_OWNER_ACCESS`, os dois testes novos de `GET /boards`, os de
  `GET /boards/[id]` (404 de outro dono, 404 inexistente, `access`), o de membro dono no `POST /boards` e, no
  `reload`, os testes "refuses the owner who lost admin" (antes "rechecks the admin role", agora com
  `BOARD_ROLE_INSUFFICIENT`, ainda 403 e sem escrita) e "refuses a maintainer".
- `apps/app/.../boards/(hooks)/useListBoards.tsx`, `useFindBoardById.tsx`, `useBoardCrud.tsx`: só `BoardDTO` →
  `BoardViewDTO` (e a ordem de import no `useBoardCrud`).
- `apps/app/.../boards/(components)/BoardCard.tsx`: tipo `BoardViewDTO` e o selo `roles[board.access.role]`.
- `apps/app/.../boards/(pages)/[id]/settings/BoardSettingsClient.tsx`: `ReloadConfigButton`, `canReload`,
  `BoardSectionNav`, imports de `canConfigureBoard`/`BoardSectionNav`, `id` como `""` em vez de `undefined`.
- `apps/app/shared/lib/queryKeys.ts`: `boards.members`.
- `apps/app/app/[locale]/(authenticated)/(common)/paths.ts`: `boards.members`.
- `apps/app/shared/lib/panelTitles.ts`: a entrada `"/boards/[id]/members"`.
- `apps/app/package.json`: `"@repo/kanban-contract": "workspace:*"`.
- `pnpm-lock.yaml`: o bloco `'@repo/kanban-contract'` no importer `apps/app` (hunk `@@ -127,6 +130,9 @@`).
- `packages/internationalization/translations/apps/app/pages/common/boards.ts`: remoção de `list.ownerBadge` e os
  blocos `roles`, `nav`, `members`.
- `packages/internationalization/translations/apps/app/pages/common/routes/index.ts`: `members: "Membros"`.
- `packages/internationalization/translations/packages/shared/utils.ts`: os seis `BOARD_*` novos depois de
  `BOARD_GITHUB_ACCOUNT_REQUIRED`.
- `docs/SETUP.md`: o parágrafo e a tabela dos logins `qa-*`, logo depois de
  `auth/account-exists-with-different-credential`.

Ordem dos commits sugerida, seguindo o plano (10.9): `kanban-contract` → `sdk` → `api` (cliente falso; guard,
repositório e mapper; rotas e testes de rota) → `design-system` (`triggerLabel`) → `internationalization` → `app`
(hooks e `package.json`/lockfile; telas) → `docs` (`SETUP.md`) → `docs(features): board-members`.
