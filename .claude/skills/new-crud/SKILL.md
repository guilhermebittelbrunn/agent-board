---
name: new-crud
description: Scaffolda um CRUD vertical completo de um recurso neste monorepo, do contrato no SDK até a UI no app — SDK actions, rotas na apps/api, hooks de dados, página de lista + formulários de criar/editar e chaves de tradução (pt-br). Use quando o usuário pedir "criar um CRUD de X", "adicionar o recurso X de ponta a ponta", "uma tela de listagem + cadastro de X". Segue o padrão dos membros do board (`boardMember`).
---

# CRUD vertical completo

Orquestra um recurso de ponta a ponta seguindo o **slice de referência `boardMember`** (os membros de um board). Esta skill compõe [`/new-api-route`](../new-api-route/SKILL.md) (camada API) e [`/i18n-sync`](../i18n-sync/SKILL.md) (traduções). Antes de começar, leia [`apps/app/CLAUDE.md`](../../../apps/app/CLAUDE.md) e [`apps/api/CLAUDE.md`](../../../apps/api/CLAUDE.md) (auto-carregados pelo Claude por escopo).

## 0. Alinhe o recurso com o usuário
- Nome singular/plural (ex.: `product`/`products`) e coleção Firestore.
- Campos + tipos (refletem o DTO).
- Escopo: o recurso é **de um board** (como `boardMember`: rotas sob `boards/[id]`, `requireBoardApi` com a capacidade exigida, leitura pelo escopo do board) ou **da pessoa** (como `runner`: `requireSessionApi`, campo `userId` e predicado no repositório)?
- Operações necessárias (list/create/get/update/delete) e se há coluna `enabled` (toggle).

> Antes de criar arquivos, **abra o slice `boardMember`** e use como template em cada camada (caminhos abaixo). Replique a estrutura, troque nomes/campos.

## 1. Contrato no SDK (`packages/sdk`)
- **Tipos** em `packages/sdk/src/types`: `XDTO`, `CreateXRequest`, `UpdateXRequest`, enums (`XType`).
- **Action** em `packages/sdk/src/actions/<recurso>/action.ts` espelhando `actions/boardMember/action.ts` (`list`, `invite`, `updateRole`, `remove`); num CRUD comum: `list`, `findById(id)`, `create(body)`, `update(id, body)` (retorna `{ id }`), `delete(id)`. Cada método usa `this.client.request<Response<...>>` e retorna `data.data`.
- **Registre** a action no `Client` (`packages/sdk/src/client/index.ts`): campo `x!: XActions;` + `this.x = new XActions(this)` no construtor.

## 2. Camada API (`apps/api`)
Siga [`/new-api-route`](../new-api-route/SKILL.md) na íntegra: validação Zod (`<recurso>.schema.ts`), mapper se houver normalização, repositório (`BaseRepository<XDTO>`), handlers em `(routes)/<plural>/route.ts` e `(routes)/<plural>/[id]/route.ts` (ou sob `boards/[id]/<plural>/` para recurso de board), guards, `error.code`. Garanta os `apiErrors` correspondentes.

## 3. Hooks de dados no app
Colocados em `apps/app/app/[locale]/(authenticated)/(common)/(pages)/<plural>/(hooks)/` (ou em `boards/(hooks)/` para recurso de board). Espelhe `useListBoardMembers.tsx`, `useFindBoardById.tsx` e `useBoardMemberCrud.tsx`:
- **`useListX.tsx`**: exporta `LIST_X_QUERY_KEY`, `fetchXList()` (chama `apiClient.x.list()`) e `useListX()` (`useQuery`).
- **`useFindXById.tsx`**: exporta `FIND_X_BY_ID_QUERY_KEY`, `findXById(id)` (retorna `undefined` se faltar `id`) e `useFindXById(id)` com `enabled: !!id`.
- **`useXCrud.tsx`**: mutations `create`/`update`/`delete` (com `invalidateQueries` + `successAlert`/`errorAlert` via `useAlert` e `handleClientError`/`FormattedError`). Se houver `enabled`, `toggleXStatusMutation` que faz `PUT { enabled }` e atualiza **só** o cache com `setQueryData` (lista + por id), **sem** `invalidateQueries`.

## 4. UI no app
Sob `(pages)/<plural>/`:
- **Validação do form**: `(validations)/xFormSchema.ts` — schema Zod do formulário (com mensagens do dictionary quando fizer sentido) + o tipo dos valores (como `inviteMemberSchema.ts`).
- **Campos**: `(components)/XFormFields.tsx` usando `HookFormInput/Textarea/Select/Switch/DateInput/RadioGroup` de `@repo/design-system/components/form/hookform`, envoltos em `FormContainer` (1 col mobile / 2 col md+).
- **Lista**: `(pages)/(home)/page.tsx` com o `Table` do design system (`searchFields`, `onRefresh`, `refreshLoading`). Coluna `enabled` = `Switch` controlado disparando o toggle. Miniaturas via `ResponsiveImage`.
- **Criar/editar**: `(pages)/create/page.tsx` e `(pages)/edit/[id]/page.tsx` com `Container` (`contentOnly`, `loadError`), `FormContainer` e `Footer` **dentro** do `<form>`.
- **Rotas/paths**: registre em `(authenticated)/(common)/paths.ts`. O app não tem sidebar: a tela nova é alcançada pelo cabeçalho do board ou por um link da tela vizinha.
- **Título da aba**: as três telas (lista, criar, editar) entram em `PANEL_PAGE_TITLES` (`apps/app/shared/lib/panelTitles.ts`), reaproveitando os rótulos de rota do `paths.ts`, e exportam `generateMetadata = panelPageMetadata("/<plural>")` (e `/<plural>/create`, `/<plural>/edit/[id]`). Página com `"use client"` leva o export num `layout.tsx` irmão que só devolve `children`. Sem isso, `apps/app/__tests__/panelTitles.test.ts` reprova o CRUD novo.
- **Textos**: tudo via dictionary — ver passo 5.

## 5. Traduções
Use [`/i18n-sync`](../i18n-sync/SKILL.md): crie `translations/apps/app/pages/common/<recurso>.ts` (modelo: o bloco `members` de `common/boards.ts`) com `title`, `fields`, `messages`, `table`, etc. em `"pt-br"`; conecte no `index.ts`. Garanta os `apiErrors` do passo 2.

## 6. Fechamento
- Rode `pnpm check` e `pnpm --filter app typecheck` + `pnpm --filter api typecheck`.
- **Smoke local**: abra as telas de lista/criar/editar o suficiente para saber se o slice está de pé. Não guarde screenshot — a validação que vira evidência é do `/test`, que percorre os fluxos de lista/criar/editar/excluir/toggle com o `agent-browser` e cobre estados de erro/vazio, responsivo e tema. Registre no handoff o que não conseguiu medir, como "a verificar no `/test`".
- Considere chamar o agente **`code-reviewer`** sobre o diff para validar as convenções.

## Mapa de arquivos do recurso de referência (`boardMember`)
```
packages/sdk/src/types/board/member.ts                          # BoardMemberDTO, InviteBoardMemberRequest
packages/sdk/src/actions/boardMember/action.ts                  # action por recurso
packages/sdk/src/client/index.ts                                # registro no Client
apps/api/(shared)/validation/board-member.schema.ts             # Zod + parseInvite/parseUpdate
apps/api/(shared)/mappers/board-member.mapper.ts                # normalização + BOARD_MEMBER_TABLE
apps/api/(shared)/repositories/board-member.repository.ts       # BaseRepository<DTO> (+ mapper)
apps/api/app/(routes)/boards/[id]/members/route.ts              # GET list + POST (requireBoardApi)
apps/api/app/(routes)/boards/[id]/members/[memberId]/route.ts   # PATCH/DELETE
apps/app/.../(common)/(pages)/boards/(hooks)/useListBoardMembers.tsx, useBoardMemberCrud.tsx
apps/app/.../(common)/(pages)/boards/(validations)/inviteMemberSchema.ts
apps/app/.../(common)/(pages)/boards/(components)/InviteMemberForm.tsx, BoardMembersTable.tsx
apps/app/.../(common)/(pages)/boards/(pages)/[id]/members/      # page.tsx (prefetch) + client + loading
packages/internationalization/translations/apps/app/pages/common/boards.ts   # bloco members
packages/internationalization/translations/packages/shared/utils.ts   # apiErrors
```

## Checklist final
- [ ] Front chama a API **só** via `apiClient`/SDK; sem `fetch` cru nem URL hardcoded.
- [ ] Guards na API espelham a autorização; posse checada quando aplicável.
- [ ] Zero string de UI literal; chaves no dicionário; `apiErrors` cobertos (`pnpm --filter api test apiErrorCodes`).
- [ ] Hooks seguem `useListX`/`useFindXById`; toggle via `setQueryData`.
- [ ] Design system usado (HookForm*/Table/Footer/FormContainer/Container); sem primitivos duplicados.
- [ ] `pnpm check` + typechecks passam.
