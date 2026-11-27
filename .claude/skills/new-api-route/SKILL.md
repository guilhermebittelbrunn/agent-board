---
name: new-api-route
description: Cria uma rota HTTP em apps/api seguindo o padrão do repo — validação Zod na borda, guard de auth, repositório+mapper Firestore e error.code traduzível. Use quando o usuário pedir "criar/adicionar uma rota/endpoint na API", "expor um recurso na api", ou como passo da skill new-crud. Para o CRUD vertical completo (SDK + app + i18n) use /new-crud.
---

# Nova rota na API (`apps/api`)

Gera handlers HTTP em `apps/api` no padrão do repo. **Referência viva**: os membros do board (`apps/api/app/(routes)/boards/[id]/members/`). Antes de codar, leia [`apps/api/CLAUDE.md`](../../../apps/api/CLAUDE.md) (auto-carregado pelo Claude ao trabalhar em `apps/api`).

## Entradas a confirmar com o usuário
- **Recurso** (singular + plural, ex.: `product` / `products`) e a **coleção** Firestore.
- **Operações**: list / create / get-by-id / update / delete (quais aplicam).
- **Guard**: recurso da pessoa (`requireSessionApi`, posse por `userId`) ou de um board (`requireBoardApi`, com a capacidade exigida)?
- **Campos** do recurso e seus tipos (refletem o DTO no `@repo/sdk`).

## Passo a passo

### 1. DTO e tipos no SDK
Garanta que `XDTO`, `CreateXRequest`, `UpdateXRequest` existam em `packages/sdk/src/types` (e enums como `XType`). A API importa o DTO de `@repo/sdk/src/types` — o contrato nasce no SDK.

### 2. Validação (`apps/api/(shared)/validation/<recurso>.schema.ts`)
Espelhe `board-member.schema.ts`:
- `createXSchema` (campos obrigatórios) e `updateXSchema` (tudo `.optional()` + `.refine(v => Object.keys(v).length > 0)`).
- Exporte `parseCreateX` / `parseUpdateX` que devolvem `{ ok: true, value } | { ok: false, response }`, respondendo `{ error: { code: "VALIDATION_FAILED" } }` com `HTTP_STATUS.BAD_REQUEST` em falha.

### 3. Mapper (`apps/api/(shared)/mappers/<recurso>.mapper.ts`)
Só se precisar normalizar (datas `Timestamp`→ISO, opcionais). Estenda `Mapper<XFirestoreRow, XDTO>`:
- `toDTO`: monta o DTO a partir do row; use `stringIfExists` e `normalizeFirestoreInstant` de `@repo/shared/utils`.
- `toPersistence`: copia só as chaves definidas (`AllOptional<XDTO>`).
- Exporte uma instância única (`xMapper`).
Recursos sem normalização podem dispensar mapper (ver `user.repository`).

### 4. Repositório (`apps/api/(shared)/repositories/<recurso>.repository.ts`)
Estenda `BaseRepository<XDTO>` e, **se houver mapper**, passe-o no `super`: `super(db, "<coleção>", xMapper)`. `BaseRepository` já dá `findById`/`create`/`update`/`delete` (soft delete via `deletedAt`). Adicione queries específicas (ex.: `listByBoard`, `listByUser`) seguindo `board-member.repository.ts` e `runner.repository.ts`. Exporte instância única (`xRepository`).

### 5. Handlers
- **Coleção** — `apps/api/app/(routes)/<plural>/route.ts`: `GET` (list) + `POST` (create).
- **Item** — `apps/api/app/(routes)/<plural>/[id]/route.ts`: `GET`/`PUT`/`DELETE`.

Padrões obrigatórios (ver `boards/[id]/members/route.ts` e `members/[memberId]/route.ts`):
- Envolva cada handler no guard do escopo (ver **Escopo** abaixo): `export const GET = requireSessionApi(async (req, ctx) => {...})`, ou `requireBoardApi("<capacidade>", async (req, ctx) => {...})` sob `boards/[id]`. Para rota `[id]` da pessoa, parametrize o guard (`requireSessionApi<RouteIdParamsContext>(...)`) e use `const id = await resolveIdFromContext(ctx)`.
- Body de POST/PUT via `parseRequestJson(req)` → cheque `.ok`; depois `parseCreateX`/`parseUpdateX`.
- PATCH parcial: `const patch = omitUndefined(parsed.value)` antes do `update`.
- **Escopo**: recurso **da pessoa** grava `userId` (id do perfil) e o predicado fica no repositório (como `runnerRepository.revokeOwned(id, ctx.profile.id, …)`); a rota responde `{ error: { code: "X_NOT_FOUND" } }`, 404, quando o repositório não acha — inclusive quando o documento existe mas é de outra pessoa. Leitura simples pode usar `row.userId !== ctx.profile.id` → 404. Recurso **de um board** lê pelo escopo do board depois do `requireBoardApi` (como `target.boardId !== ctx.board.id` → 404 nos membros).
- Respostas: create → `Response.json({ data: created }, { status: 201 })`; get → `{ data: row }`; PUT fire-and-forget → `{ data: { id } }`; delete → `new Response(null, { status: 204 })`.
- Erros sempre como `{ error: { code: "X_..." } }` com status correto — nunca stack trace.

### 6. Códigos de erro → i18n
Todo `error.code` novo (ex.: `X_NOT_FOUND`, `X_CREATE_FAILED`) precisa de entrada em `apiErrors` — `pnpm --filter api test apiErrorCodes` falha se faltar. Use a skill [`/i18n-sync`](../i18n-sync/SKILL.md) (arquivo `packages/internationalization/translations/packages/shared/utils.ts`).

## Checklist final
- [ ] Guard aplicado em todos os métodos; autorização não depende só da UI.
- [ ] Validação Zod na borda; `parseRequestJson`/`omitUndefined`/`resolveIdFromContext` usados.
- [ ] DTO no SDK e import de `@repo/sdk/src/types` na API.
- [ ] `error.code` com copy em `apiErrors` (`pnpm --filter api test apiErrorCodes`).
- [ ] Sem import de React/`apps/app` na API.
- [ ] `pnpm --filter api typecheck` e `pnpm check` passam.

> Lembre: o front consome esta rota **apenas** via `@repo/sdk` (action por recurso). Adicione/atualize a action correspondente — ver `/new-crud`.
