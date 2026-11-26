# Plano: membros, convites e papéis do board

Spec de origem: [`specs/features/board-members.md`](../../../../specs/features/board-members.md) (status
`proposed`; executada no `/cycle` a pedido do usuário, sem aprovação formal). Depende de `board-import`, que
depende de `github-app-integration` e `github-sign-in`. As três estão no working tree, sem commit.

## Etapa 1: análise

### 1. Contexto

**Resumo.** Hoje um board é só de quem o criou: toda leitura filtra `ownerUserId` e o GitHub só é consultado
para importar e recarregar. Esta spec cria os membros. O dono (ou um mantenedor) convida pelo login do GitHub
com um papel; o convite fica pendente até a pessoa entrar; toda rota de board passa a resolver o papel efetivo
(papel no board limitado pela permissão no repositório) antes de agir. A tela Membros lista quem está no
board, com papel no board, permissão no GitHub, papel que vale e quando foi conferido.

**Objetivos (corte de MVP da spec, sem alteração):**

1. Guard de board: toda rota de board resolve o papel efetivo e responde `403` com código quando não basta.
2. Convite por login do GitHub, com papel; pendente até a pessoa entrar pela primeira vez.
3. Só `maintainer`/`owner` convidam; ninguém convida acima do próprio papel.
4. Lista de membros com papel no board, papel efetivo e data da última checagem.
5. Remover membro e mudar papel.
6. Webhook `member` do repositório invalida o cache de permissão.

O item 6 já está entregue pela `github-app-integration`: `applyWebhookEvent` chama
`cache.invalidateRepository(full_name)` no evento `member` (`apps/api/(shared)/lib/github/github-webhook-events.ts:33-44`),
com teste em `githubWebhookRoute.test.ts`. Aqui ele só ganha um teste que prova o efeito no guard (seção 7).

**Fora de escopo:**

- Disparo de etapa pelo `operator` com a própria credencial (spec `execution-credentials`). Não existe rota de
  disparo ainda; o guard expõe a capacidade `trigger` (`canTriggerStages`) para o `orchestrator` usar.
- Convite por e-mail (pergunta da spec, recomendação "não": adotada).
- Transferir a posse do board ou ter mais de um dono. `owner` não aparece entre os papéis do convite.
- Sair do board por conta própria e mudar o próprio papel.
- Cabeçalho próprio do board (menu Quadro · Ciclos · Membros · ...): spec `theme-toggle` e as specs de cada
  item. A tela entra no layout atual do painel comum, como a Configuração.
- Faixa "Foi convidado para um board?" do primeiro acesso (`BoardsEmpty.png`).
- Revalidar a permissão em cada listagem de membros (decisão 4 das perguntas).
- `POST /users` (admin cria conta com e-mail e senha), pergunta herdada da `github-sign-in`: veredito
  **fora de escopo**. Convite não cria conta; a conta nasce no primeiro login pelo GitHub.

**Apps impactados:** `packages/kanban-contract`, `packages/sdk`, `apps/api`, `apps/app`,
`packages/internationalization`. A spec diz "Nenhum" para o contrato; o plano acrescenta a `roles.ts` três funções
de "quem pode mudar quem", que a API e o app usam (pergunta 7). `resolveEffectiveRole` e as `can*` já existem, e
`githubLoginSchema` vem de `identity.ts:8`.

**Área do painel:** comum, `(common)/(pages)/boards/(pages)/[id]/members`.

**Dependências externas:** GitHub App (real ou o cliente falso do emulador). Nenhuma env nova, nenhuma
dependência nova.

### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/board-members.md` | Corte, risco do cache longo, sinais de pronto, pergunta do convite por e-mail |
| `docs/board/ACCESS.md` | Papéis × permissão mínima, "quem perdeu o repositório perde o board", quando checar, convite `pending` → `active` |
| `docs/board/ARCHITECTURE.md:71` | Coleção de membros: board, github id e login, papel, papel efetivo, última checagem, status do convite |
| `docs/board/DECISIONS.md:133` | Escopo por pessoa (`userId`) até esta spec; depois por board com guard de papel |
| `docs/board/ROADMAP.md:32,59` | Só o dono dispara até `execution-credentials`; esta spec põe o guard antes de existir ação que gaste dinheiro |
| `docs/design/screenshots/Members.png` e `screens/Members.dc.html` | Layout, textos, estados de linha (pendente "confere ao entrar", "limitado pelo GitHub", "Sem acesso / saiu do repositório") |
| `packages/kanban-contract/src/roles.ts` | `resolveEffectiveRole`, `canViewBoard`, `canTriggerStages`, `canManageMembers`, `canConfigureBoard` |
| `docs/features/board-import/analyze/plan.md:438-443` e risco R4 | Fronteira deixada para esta spec: trocar `findOwnedBy` pelo guard, criar o membro `owner`, revalidar ao abrir |
| `docs/features/github-app-integration/develop/handoff.md:134-136` | Antes de disparar, ignorar o cache de permissão (fica para o `orchestrator`) |
| `docs/features/github-sign-in/analyze/plan.md:719-728` | Perguntas herdadas: `POST /users` e conta GitHub no seed |

**Referências não lidas:** o canvas `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt` é privado. A cópia em
`docs/design/screens/Members.dc.html` e a imagem cobrem a tela.

### 2. Dados (Firestore)

#### 2.1 Coleção `boardMember` (nova)

Singular, como `board`, `entity` e `user`. Coleção de topo e não subcoleção: o `BaseRepository` trabalha com
`collection(this.table)` (`base.repository.ts:148`) e a lista "meus boards" precisa consultar membros de todos
os boards pelo `githubId`.

| Campo | Tipo | Default | `null`? | Justificativa |
|-------|------|---------|---------|---------------|
| `boardId` | string | - | não | Board do membro |
| `role` | `BoardRole` | - | não | Papel no board. `owner` só no membro criado com o board |
| `status` | `"pending" \| "active"` | `pending` | não | Pendente até a pessoa entrar (ACCESS.md) |
| `login` | string | login do convite | não | Exibição; reescrito quando a pessoa entra ou quando o login muda |
| `loginLower` | string | `login.toLowerCase()` | não | Logins do GitHub não diferenciam maiúsculas; é por ele que o convite pendente é reclamado |
| `githubId` | string (dígitos) | `null` | sim | Chave estável depois que a pessoa entra |
| `userId` | string | `null` | sim | Perfil que reclamou o convite |
| `name` / `avatarUrl` | string | `null` | sim | Cópia do `profile.github` no momento em que a pessoa entra, para a lista não ler o perfil de cada um |
| `invitedByUserId` | string | - | não | Autor do convite (o dono no membro `owner`) |
| `githubRole` | `GithubRepoRole` | `null` | sim | Última permissão lida no GitHub; `null` = ainda não conferido ("confere ao entrar") |
| `githubRoleCheckedAt` | Date | `null` | sim | "Conferido" da tela |
| `joinedAt` | Date | `null` | sim | Quando o convite virou `active` |
| `createdAt` / `updatedAt` / `deletedAt` | herdados | - | - | `deletedAt` fica sempre `null`: remoção apaga o documento (abaixo) |

O **papel efetivo não é gravado**: é `resolveEffectiveRole(role, githubRole)` calculado no mapper ou na rota.
Gravar duas fontes do mesmo fato abriria a chance de divergirem.

**Id determinístico:** `memberIdFor(boardId, login)` = `${boardId}__${login.toLowerCase()}`. O login do GitHub
só tem letras, dígitos e hífen (`identity.ts:4`), então o último `__` separa as duas partes. Mesmo padrão do id
do board (`board-import.ts:62`): o `doc(id).create()` falha com `ALREADY_EXISTS` e isso vira 409, sem corrida
entre dois convites iguais. O id passa em `isUsableDocumentId` (`pagination.ts:18-27`).

**Remoção:** apaga o documento (`purge`, `base.repository.ts:238`), não estampa `deletedAt`. Com id
determinístico, um soft delete impediria convidar de novo o mesmo login. ACCESS.md diz que remover não apaga o
que o membro fez; isso vale para `runs` e `events`, que ainda não existem e guardam o autor por conta própria.

**Ownership:** quem pode ler e escrever é decidido pelo guard de board (seção 4.1), não por `userId`.

#### 2.2 O dono

O dono continua definido por `board.ownerUserId` (fonte da verdade, não muda nesta spec). Além disso, ganha um
documento `boardMember` com `role: "owner"`, `status: "active"`, para a lista e a checagem do GitHub serem iguais
para todos:

- `POST /boards` cria board e membro dono num `batch` com dois `create()` (atômico: se o board já existe, nada é
  gravado). `createForRepository` (`board.repository.ts:60-82`) passa a receber o login do dono.
- Boards criados antes desta spec (só no emulador; nada foi commitado nem publicado) não têm o documento. O
  guard o cria na primeira passagem do dono (seção 4.1, passo 3). São poucas linhas e evitam script de backfill.

#### 2.3 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| Membro ativo do board pela pessoa | `where("boardId","==",id).where("githubId","==",gid)` | nenhum composto: só igualdades |
| Convites pendentes da pessoa | `where("loginLower","==",l).where("status","==","pending")` | idem |
| Boards da pessoa | `where("githubId","==",gid).where("status","==","active")` + `getAll` dos boards | idem |
| Membros de um board | `where("boardId","==",id)`, ordenado em memória (dono, depois `role` desc, depois `login`) | campo único |
| Membro por id | `findById` + `member.boardId === board.id` | - |

Sem paginação: membros de um board pessoal ficam na casa das dezenas, como a lista de boards
(`board.repository.ts:34`). Se mudar, entra `paginate` com índice `boardId + createdAt`.

**Rules:** nenhuma mudança. `firestore.rules:32-33` nega todo acesso de cliente; a API usa o Admin SDK.

#### 2.4 Dados existentes

Coleção nova. O único dado antigo são boards sem o membro dono, tratados pelo guard (2.2).

### 3. Contrato `@repo/sdk`

Tipos novos em `packages/sdk/src/types/board/member.ts`; recurso `boardMember` em
`packages/sdk/src/actions/boardMember/action.ts`, registrado em `client/index.ts`. Contexto `common`.

Mudança no recurso `board`: `list()` e `findById()` passam a devolver `BoardViewDTO` (`BoardDTO` + `access`), e
`BoardReloadResultDTO.board` também. `create()` devolve `BoardViewDTO`. O `BoardDTO` em si não muda (o mapper
continua igual). Quem quebra: os hooks de board do app (`useListBoards`, `useFindBoardById`, `useBoardCrud`), que
trocam o tipo; o campo novo é aditivo e nenhum consumidor lê algo que sumiu.

### 4. API (`apps/api`)

#### 4.1 Guard de board: `requireBoardApi(capability, handler)`

Arquivo novo `apps/api/app/(guards)/board.ts`, ao lado de `common-panel.ts`. Envolve `requireCommonPanelApi`
(`common-panel.ts:30`), então sessão, personificação somente leitura e perfil comum continuam vindo de lá.

Capacidades, todas sobre o **papel efetivo** e lidas de `roles.ts` (regra 12, nada de comparação nova):

| `capability` | Função | Usada por |
|--------------|--------|-----------|
| `view` | `canViewBoard` | `GET /boards/[id]`, `GET /boards/[id]/members` |
| `manageMembers` | `canManageMembers` | `POST`/`PATCH`/`DELETE` de membros |
| `configure` | `canConfigureBoard` | `POST /boards/[id]/reload` |
| `trigger` | `canTriggerStages` | nenhuma rota ainda; reservada ao `orchestrator` |

Passos, em `apps/api/(shared)/lib/board-access.ts` (`resolveBoardAccess`), para o guard ficar fino e testável:

1. `resolveIdFromContext` → `boardRepository.findById(id)`; ausente ou apagado → 404 `BOARD_NOT_FOUND`.
2. Perfil sem `github` (conta de senha do seed) → 404 `BOARD_NOT_FOUND`. Não tem como ser membro.
3. Membro: `findActive(boardId, github.id)`. Se não há, e `profile.id === board.ownerUserId`, cria o membro dono
   (2.2). Se ainda não há, `findPending(boardId, github.login)` e reclama: `status: active`, `githubId`,
   `userId`, `login`, `name`, `avatarUrl`, `joinedAt`. Sem membro nenhum → 404 `BOARD_NOT_FOUND` (não revela que
   o board existe).
4. `getGithubClient()`; `null` → 503 `GITHUB_APP_NOT_CONFIGURED` (`github-errors.ts:54`).
5. `client.getCollaboratorRole(board.repository, github.login)`, com o cache de 5 min
   (`github-permission-cache.ts:3`). `GithubApiError` → `githubErrorResponse` (`github-errors.ts:46`).
6. `effectiveRole = resolveEffectiveRole(member.role, githubRole)`. `null` → 403
   `BOARD_REPOSITORY_ACCESS_LOST` (a pessoa é membro, então já sabe que o board existe; a mensagem diz o motivo).
7. Capacidade não atendida → 403 `BOARD_ROLE_INSUFFICIENT`.
8. Grava `githubRole` e `githubRoleCheckedAt` no membro quando o papel mudou ou a última checagem passou de 5
   minutos (o mesmo TTL do cache, então no máximo uma escrita por pessoa a cada 5 min). Login diferente do
   gravado também é reescrito.
9. Chama o handler com `ctx.board` (`BoardDTO`), `ctx.member` (`BoardMemberRecord`) e `ctx.access`
   (`BoardAccessDTO`).

**Sob personificação** os passos 3 (criar dono, reclamar convite) e 8 não gravam: a leitura calcula tudo em
memória. Uma escrita feita em nome de outra pessoa não tem autor confiável (`impersonation-read-only.ts:7-9`), e
reclamar o convite de alguém é ação dela. Consequência: o admin personificando alguém com convite pendente não vê
aquele board até a pessoa entrar. Registrado nos riscos.

**Ordem de 404 × 403:** não-membro recebe 404 sempre, mesmo que tenha `admin` no repositório. Quem tem `admin`
e quer um board de um repositório que já tem dono pede convite. O picker já mostra "Já tem board".

#### 4.2 Rotas alteradas

| Rota | Hoje | Passa a |
|------|------|---------|
| `GET /boards` | `listByOwner(profile.id)` (`boards/route.ts:16-19`) | Reclama convites pendentes do login (fora de personificação), lista membros ativos pelo `githubId`, `getAll` dos boards e une com `listByOwner` (boards antigos sem membro dono). Devolve `BoardViewDTO[]` com `access` montado do que está gravado no membro, **sem** consultar o GitHub. Conta sem `github`: só `listByOwner` (vazio na prática) |
| `POST /boards` | cria o board | Cria board + membro dono no mesmo batch; devolve `BoardViewDTO` com `access` do dono (`githubRole` que o `resolveImportTarget` já leu, `checkedAt` agora) |
| `GET /boards/[id]` | `findOwnedBy` (`[id]/route.ts:12-15`) | `requireBoardApi("view")`; devolve `{ ...ctx.board, access: ctx.access }` |
| `POST /boards/[id]/reload` | `findOwnedBy` + `resolveImportTarget` (`reload/route.ts:21-35`) | `requireBoardApi("configure")`; o `resolveImportTarget` continua (relê e confere `admin` de novo, com cache). `board` no resultado vira `BoardViewDTO` |
| `GET /boards/repositories` e `GET /boards/preview` | sem board no caminho | Sem mudança. O `linksFor` (`board.repository.ts:95-125`) continua marcando como `"taken"` o board em que a pessoa é membro sem ser dona: lacuna registrada, fora do corte |

`findOwnedBy` sai do `BoardRepository` quando nenhuma rota o usar mais.

#### 4.3 Rotas novas

| Método e path | Guard | O que faz | Sucesso |
|---------------|-------|-----------|---------|
| `GET /boards/[id]/members` | `view` | Lista os membros com o papel efetivo calculado do que está gravado | 200 `{ data: BoardMemberDTO[] }` |
| `POST /boards/[id]/members` | `manageMembers` | Body `{ login, role }`; cria convite `pending` | 201 `{ data: BoardMemberDTO }` |
| `PATCH /boards/[id]/members/[memberId]` | `manageMembers` | Body `{ role }` | 200 `{ data: BoardMemberDTO }` |
| `DELETE /boards/[id]/members/[memberId]` | `manageMembers` | Remove o membro ou cancela o convite | 204 |

O segmento `[memberId]` usa um tipo de contexto novo, `BoardMemberRouteContext = { params: { id, memberId } | Promise<...> }`,
em `resolve-route-id.ts`, com `resolveParamsFromContext` (mesmo molde de `resolveIdFromContext`, `:8-13`).

Regras de papel, em funções puras novas de `packages/kanban-contract/src/roles.ts` (`canGrantRole`,
`grantableRoles`, `canChangeMember`, seção 10.3), usadas pela API e pela tela:

- **Convidar:** `role ∈ { viewer, operator, maintainer }` e `rank(role) ≤ rank(effectiveRole do autor)`. Senão 403
  `BOARD_MEMBER_ROLE_NOT_ALLOWED`. Um `maintainer` efetivo convida até `maintainer`; um `owner`, também até
  `maintainer` (dono único).
- **Mudar papel:** mesma regra para o papel novo, e o alvo não pode ser o dono, nem a própria pessoa, nem ter papel
  acima do autor. Senão 403 `BOARD_MEMBER_CHANGE_FORBIDDEN`.
- **Remover / cancelar convite:** alvo não pode ser o dono, nem a própria pessoa, nem ter papel acima do autor →
  403 `BOARD_MEMBER_CHANGE_FORBIDDEN`.
- Convite para quem já é membro (mesmo `loginLower` no board, ativo ou pendente, inclusive a própria pessoa) → 409
  `BOARD_MEMBER_ALREADY_EXISTS`. Detectado pelo `ALREADY_EXISTS` do id determinístico e, para membro ativo que
  trocou de login, por uma consulta `boardId + loginLower` antes do `create`.
- `memberId` inexistente ou de outro board → 404 `BOARD_MEMBER_NOT_FOUND`.
- O convite **não consulta o GitHub**: a tela mostra "confere ao entrar" (`Members.png`, linha ana-design). Login
  com erro de digitação fica pendente até alguém cancelar.

Validação na borda (`apps/api/(shared)/validation/board-member.schema.ts`):
`inviteBoardMemberSchema = z.object({ login: githubLoginSchema, role: z.enum(["viewer","operator","maintainer"]) })`,
`updateBoardMemberSchema = z.object({ role: ... })`, com `parseInviteBoardMember` / `parseUpdateBoardMember`
devolvendo 400 `VALIDATION_FAILED` como `parseCreateBoard`. `parseRequestJson` antes.

#### 4.4 Persistência

- `apps/api/(shared)/repositories/board-member.repository.ts`: `BoardMemberRepository extends
  BaseRepository<BoardMemberRecord>`, `super(db, "boardMember", boardMemberMapper)`, com `createMember(input)`
  (`doc(id).create`, `null` em `ALREADY_EXISTS`), `findActive(boardId, githubId)`, `findPending(boardId, login)`,
  `claimPendingFor(profile)` (todos os boards), `listByBoard(boardId)`, `listActiveBoardIds(githubId)`,
  `findByLogin(boardId, login)`, `updateRole(id, role)`, `recordCheck(id, githubRole, at, identity?)`,
  `activate(id, profile)`, `remove(id)` (`purge`) e `ownerMemberDocument(boardId, profile, githubRole)` para o
  batch do `POST /boards`.
- `apps/api/(shared)/mappers/board-member.mapper.ts`: `toDTO` normaliza as datas com
  `normalizeFirestoreInstant` e calcula `effectiveRole`; `toPersistence` com whitelist, como
  `board.mapper.ts:21-28`.
- `board.repository.ts`: `createForRepository(id, input, ownerMember)` passa a gravar os dois num `batch`.

#### 4.5 Webhook `member`

Nada muda na rota. O evento já invalida o cache em memória do processo que o recebeu. Com o cache vazio, a
próxima passagem de qualquer membro pelo guard pergunta ao GitHub e regrava `githubRole` (passo 8). Limite
conhecido: em várias instâncias da API, só a que recebeu o webhook perde o cache; as outras ficam até 5 min com o
valor antigo. É o mesmo prazo do cache e o que a spec aceita como "expiração curta" (risco R1).

#### 4.6 Cliente falso do GitHub: papel configurável por login

Hoje `getCollaboratorRole` do falso responde `admin` para todos (`github-fake-client.ts:80-90`). Sem mudança,
o `/test` não consegue provar nenhum dos dois sinais de pronto. Proposta: um mapa fixo em
`github-sample-repositories.ts`, aplicado a todos os repositórios de exemplo:

```ts
/** Emulator-only GitHub permissions, by login; anyone else is admin so the seed can import. */
export const SAMPLE_COLLABORATOR_ROLES: Readonly<Record<string, GithubRepoRole>> = {
    "qa-maintainer": "maintain",
    "qa-writer": "write",
    "qa-reader": "read",
    "qa-outsider": "none",
};
```

O falso lê `SAMPLE_COLLABORATOR_ROLES[username.toLowerCase()] ?? "admin"`. Efeitos colaterais medidos por
leitura: `listAdminRepositories` (`board-import.ts:205-230`) passa a esconder os repositórios de `qa-reader` &
cia, o que é o comportamento real; o E2E existente usa `e2e-octocat` e o QA da `github-sign-in` usou `qa-octocat`,
que continuam `admin`. Sem env nova: o falso só roda no emulador (`github-app-config.ts:37-44`).

Alternativas descartadas: (a) papel lido de um documento do Firestore editável no emulador, que permitiria
"perder o acesso" no meio da sessão, mas é código de produção a mais só para teste; (b) prefixo no login
(`read-*`), que é regra escondida em vez de tabela explícita. O "perdeu o acesso" fica provado com
`qa-outsider` convidado (ele entra já sem acesso) e no teste de rota.

#### 4.7 Erros novos

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `BOARD_ROLE_INSUFFICIENT` | 403 | Membro com papel efetivo abaixo do que a rota exige |
| `BOARD_REPOSITORY_ACCESS_LOST` | 403 | Membro sem permissão no repositório (`resolveEffectiveRole` → `null`) |
| `BOARD_MEMBER_NOT_FOUND` | 404 | `memberId` inexistente ou de outro board |
| `BOARD_MEMBER_ALREADY_EXISTS` | 409 | Login já é membro ou já tem convite |
| `BOARD_MEMBER_ROLE_NOT_ALLOWED` | 403 | Papel acima do próprio, ou `owner` |
| `BOARD_MEMBER_CHANGE_FORBIDDEN` | 403 | Mexer no dono, em si mesmo ou em quem tem papel acima |

Reaproveitados: `BOARD_NOT_FOUND` (404), `GITHUB_APP_NOT_CONFIGURED` (503), `GITHUB_RATE_LIMITED` (503),
`GITHUB_UNAVAILABLE` (502), `GITHUB_REPOSITORY_NOT_ACCESSIBLE` (404, do reload), `VALIDATION_FAILED` (400),
`AUTH_REQUEST_IMPERSONATION_READ_ONLY` (403). Os seis novos entram em `apiErrors`
(`packages/internationalization/translations/packages/shared/utils.ts`), cobrados pelo
`apiErrorCodesTranslated.test.ts`.

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

| URL | Arquivo | Referência |
|-----|---------|------------|
| `/boards/[id]/members` | `boards/(pages)/[id]/members/{page.tsx, BoardMembersClient.tsx, loading.tsx}` | `Members.png` |

`paths.ts` ganha `boards.members(id)`; `panelTitles.ts` ganha `"/boards/[id]/members"` com título próprio (o
`panelTitles.test.ts` exige título distinto para toda página). `page.tsx` faz prefetch de
`boards.detail(id)` e `boards.members(id)` com `if (!(await isImpersonating()))`, como
`settings/page.tsx:25-33`.

Navegação: um componente `BoardSectionNav` (links "Configuração" e "Membros", `aria-current="page"` no ativo,
`Button asChild variant="ghost"`) logo abaixo do `Header` nas duas páginas do board. Sem ele não há como chegar a
Membros. O cabeçalho completo do desenho fica para a spec que o trouxer; o `BoardSectionNav` é o que ela substitui.

#### 5.2 Dados

`queryKeys.boards.members: (id: string) => [...queryKeys.boards.all, "members", id] as const`.

| Arquivo | Conteúdo |
|---------|----------|
| `(hooks)/useListBoardMembers.tsx` | `fetchBoardMembers(id)` + `useListBoardMembers(id)` (`useAuthorizedQuery`, `enabled: Boolean(id)`) |
| `(hooks)/useBoardMemberCrud.tsx` | `invite`, `changeRole`, `remove`; sucesso invalida `boards.members(id)`, `successAlert`; erro `handleClientError(new FormattedError(...))` + `errorAlert` (`useBoardCrud.tsx:24-28`) |
| `useListBoards`, `useFindBoardById`, `useBoardCrud` | tipo `BoardViewDTO` no lugar de `BoardDTO` |

#### 5.3 Telas e estados

**`BoardMembersClient` (`Members.png`)**

- `Header` com breadcrumb Início › Boards, página = nome do board; `BoardSectionNav`; `PageHeader` "Membros" e
  o subtítulo do desenho.
- `ImpersonationReadOnlyNotice`.
- **`InviteMemberForm`** (card "Convidar pelo login do GitHub"), só quando `canManageMembers(access.effectiveRole)`
  e fora de personificação. RHF + Zod (`(validations)/inviteMemberSchema.ts`, com `githubLoginSchema` vindo do
  SDK reexportado ou de `@repo/kanban-contract`, ver pergunta 7): `HookFormInput` "Login" (placeholder "por exemplo,
  joao-pm"), `HookFormSelect` "Papel no board" com as opções até o papel efetivo do autor (sem `owner`),
  botão "Convidar" com `loading` (sem duplo envio). Texto de ajuda do desenho abaixo. Sucesso limpa o campo.
- **`BoardMembersTable`** (`Table` do design system, sem `searchFields`): colunas Membro (avatar com iniciais,
  login, "você" na própria linha), Papel no board, Permissão no GitHub (mono; "confere ao entrar" quando
  `githubRole === null`), Papel que vale (`Badge`: papel efetivo; "limitado pelo GitHub" quando efetivo < papel;
  "Sem acesso" + "saiu do repositório" quando efetivo `null` e conferido; "Convite pendente" quando `pending`),
  Conferido (`useFormatDisplayDateTime` de `githubRoleCheckedAt`, ou "convidado em <data>" no pendente) e Ações.
- **Ações**: `ActionsMenu` (`packages/design-system/components/ui/action-menu.tsx`) com o item "Mudar papel" e
  `onDelete` "Remover" (ou "Cancelar convite" no pendente) usando o `Popconfirm` que ele já tem (`deleteLabels`).
  Sem ações (traço) para o dono, para a própria linha e para quem tem papel acima; nenhuma ação sem
  `canManageMembers` ou sob personificação. A regra de exibição usa as mesmas funções de `roles.ts` que a API
  (`grantableRoles`, `canChangeMember`).
- **`ChangeMemberRoleDialog`**: `Dialog` com `HookFormSelect` (mesmas opções do convite) e "Salvar".
- **`BoardRolesGuide`** ("O que cada papel pode fazer"): quatro `Card` com o texto do desenho e "Exige `read`/
  `write`/`maintain`/`admin` no GitHub". Estático.
- Carregando: `loading.tsx` com skeleton do card de convite e de linhas. Erro: `Container` com `loadError`
  (403 `BOARD_REPOSITORY_ACCESS_LOST` mostra a frase do `apiErrors`).

**Mudanças em telas existentes**

- `BoardCard` (`BoardCard.tsx:28`): o selo fixo "Dono" passa a mostrar o papel no board (`access.role`): Dono,
  Mantenedor, Operador, Leitor.
- `BoardSettingsClient`: `BoardSectionNav`; "Recarregar configuração" só aparece com
  `canConfigureBoard(access.effectiveRole)`. Para os demais, o card do arquivo fica só com a linha "Lido de ...".
- Com 403 `BOARD_REPOSITORY_ACCESS_LOST` ou `BOARD_ROLE_INSUFFICIENT` em qualquer página do board, o `loadError`
  traduzido já cobre (mesmo caminho do `BOARD_NOT_FOUND` hoje).

Desvios do desenho, registrados: "Conferido" com data e hora absolutas em vez de "há 5 min" (o app não tem
formatador relativo e criar um é fora do corte); sem o cabeçalho do board; sem o menu de tema.

#### 5.4 i18n e a11y

Toda string acima no dicionário (10.8). `aria-label` no avatar de iniciais (login), no `ActionsMenu` ("Ações de
<login>") e no select do diálogo. A tabela usa os cabeçalhos do `Table`.

### 6. Autorização e segurança

| Regra | Onde |
|-------|------|
| Sessão, perfil comum, personificação somente leitura | `requireCommonPanelApi`, de dentro de `requireBoardApi` |
| Papel efetivo em toda rota de board (regra 13) | `requireBoardApi` em `GET /boards/[id]`, `reload` e nas quatro rotas de membros |
| Não-membro não descobre o board | 404 `BOARD_NOT_FOUND` antes de qualquer consulta ao GitHub |
| Quem perdeu o repositório perde o board | passo 6 do guard; fecha o risco R4 da `board-import` |
| Ninguém convida ou promove acima do próprio papel | funções de `roles.ts` aplicadas nas rotas; a UI usa as mesmas só para esconder opções |
| Dono intocável | regra de mudança e remoção |
| Login do convite não vira permissão sozinho | o convite dá o papel no board; o efetivo depende de `getCollaboratorRole` com o login do **perfil**, que vem do Firebase (`github-sign-in`), nunca do cliente |
| `GET /boards` sem GitHub | lista o que o membro tinha; abrir o board revalida. Board de quem perdeu o acesso aparece na lista e abre com 403 |

**Reivindicação de convite por login.** Quem tiver o login convidado no momento em que entrar reclama o convite.
Se o login trocar de dono no GitHub entre o convite e o primeiro acesso, a pessoa errada vira membro, ainda
limitada pela própria permissão no repositório. É o desenho do ACCESS.md (convite por login, pendente até
entrar); risco R2.

**Disparo.** Não existe rota de disparo. O sinal de pronto "a API recusa o disparo do viewer chamada direto" fica
provado no guard (capacidade `trigger` com `viewer` → 403, teste de unidade) e por analogia nas ações que existem
(`reload` e membros recusam `viewer`). A rota real chega com o `orchestrator`, que também deve ignorar o cache
antes de disparar (`github-app-integration/develop/handoff.md:134-136`) e restringir ao dono até
`execution-credentials` (ROADMAP.md:32).

### 7. Testes

Todos Vitest, sem emulador. As consultas são só igualdades e o `create` com id fixo tem precedente coberto
(`notification.repository`, `board.repository`).

| Teste | Nível | Prova |
|-------|-------|-------|
| `packages/kanban-contract/__tests__/roles.test.ts` (acréscimo) | unit | `canGrantRole`, `grantableRoles` e `canChangeMember` para cada par (papel efetivo do autor × papel alvo × papel novo); dono intocável; própria pessoa recusada; `null` não pode nada |
| `apps/api/__tests__/boardMemberMapper.test.ts` | unit | `Timestamp` → ISO; `effectiveRole` calculado (`operator` + `read` → `viewer`; `githubRole: null` → `null`); whitelist |
| `apps/api/__tests__/boardAccess.test.ts` | unit com `vi.mock` dos dois repositórios e de `getGithubClient` | Os nove passos do guard: 404 board ausente; 404 sem `github`; 404 não-membro mesmo com `admin`; dono antigo ganha o membro; pendente é reclamado; nada é gravado sob personificação; 503 sem App; `GithubApiError` → código; 403 `BOARD_REPOSITORY_ACCESS_LOST`; 403 `BOARD_ROLE_INSUFFICIENT` (`viewer` em `manageMembers`, `configure` e `trigger`); checagem gravada só quando mudou ou passou de 5 min |
| `apps/api/__tests__/boardMembersRoutes.test.ts` | rota com `vi.mock` do guard de sessão e dos repositórios | `GET` lista; `POST` 201 / 409 / 403 papel acima / 400 login inválido; `PATCH` e `DELETE` 404 de outro board / 403 dono / 403 si mesmo / 204; `operator` recebe 403 `BOARD_ROLE_INSUFFICIENT`; personificação 403 |
| `apps/api/__tests__/boardsRoutes.test.ts` (ajuste) | rota | `GET /boards` une membros e `listByOwner` e reclama pendentes; `GET /boards/[id]` passa pelo guard e traz `access`; `POST /boards` grava o membro dono no batch; `reload` com `maintainer` → 403. Os casos `findOwnedBy` atuais são reescritos para o guard |
| `apps/api/__tests__/githubFakeClient.test.ts` (acréscimo) | unit | `qa-reader` → `read`, `qa-outsider` → `none`, outro login → `admin`, sem diferenciar maiúsculas |
| `apps/api/__tests__/githubWebhookRoute.test.ts` (acréscimo) ou `boardAccess.test.ts` | unit | Depois de `applyWebhookEvent("member", ...)`, o guard consulta o cliente de novo (o cache não responde) |
| `apps/app/__tests__/useBoardMemberCrud.test.tsx` | hook | convite invalida `boards.members(id)`; erro chama `errorAlert` com a frase do código |
| `apps/app/__tests__/panelTitles.test.ts` | existente | cobra o título de `/boards/[id]/members` |
| `apps/api/__tests__/apiErrorCodesTranslated.test.ts` | existente | cobra os seis códigos novos |

### 8. O que o `/test` vai percorrer

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, API no modo `fake`. Contas criadas pelo popup do GitHub
do emulador (`docs/SETUP.md:402-404`) com screen names `qa-owner` (vira `admin`), `qa-reader`, `qa-writer`,
`qa-maintainer` e `qa-outsider`, cada uma com e-mail novo `qa-board-members-<papel>@example.com`. O seed não ganha
conta GitHub (pergunta 6). Varra o relatório: nenhuma senha, e as contas listadas no fim para limpeza.

| # | Fluxo | Resultado esperado |
|---|-------|--------------------|
| M1 | `qa-owner` importa `sample-app`, abre Configuração → "Membros" | Tela com a linha do dono: "Dono", `admin`, "Dono", conferido agora, sem ações; "O que cada papel pode fazer" com quatro cards |
| M2 | Convidar `qa-reader` como Operador, `qa-writer` como Operador, `qa-maintainer` como Mantenedor, `qa-outsider` como Operador | Quatro linhas "Convite pendente", "confere ao entrar", ação "Cancelar convite" |
| M3 | Convidar `qa-reader` de novo | Erro traduzido de `BOARD_MEMBER_ALREADY_EXISTS`; nenhuma linha nova |
| M4 | Login inválido (`-bad`) | Erro de validação no campo, sem chamada (e 400 se chamado direto) |
| M5 | Entrar como `qa-reader`, abrir `/boards` | O board aparece com selo "Operador"; Configuração abre **sem** "Recarregar"; Membros abre **sem** o card de convite e sem ações |
| M6 | Voltar como `qa-owner` em Membros | `qa-reader`: Operador, `read`, "Leitor" + "limitado pelo GitHub" (sinal de pronto 2) |
| M7 | `qa-reader` chama direto `POST /boards/<id>/reload` e `POST /boards/<id>/members` (curl com o cookie da sessão) | 403 `BOARD_ROLE_INSUFFICIENT` nos dois (sinal de pronto 1, nas ações que existem) |
| M8 | Entrar como `qa-outsider` e abrir o board pelo link | Tela de erro com a frase de `BOARD_REPOSITORY_ACCESS_LOST`; no `qa-owner`, a linha mostra `none` e "Sem acesso" |
| M9 | Entrar como `qa-maintainer` | Vê o card de convite com opções Leitor, Operador, Mantenedor; pode mudar o papel de `qa-writer`; não tem ações na linha do dono; `PATCH` direto no dono → 403 `BOARD_MEMBER_CHANGE_FORBIDDEN`; convite direto com `role: "owner"` → 400/403 |
| M10 | `qa-owner` muda `qa-writer` para Leitor e remove `qa-outsider` | Linha atualizada; linha removida; `qa-outsider` passa a receber "Board não encontrado." |
| M11 | Conta de senha do seed abre `/boards/<id>/members` | "Board não encontrado.", sem 500 |
| M12 | Admin personificando `qa-owner` | Membros abre sem formulário e sem ações; `ImpersonationReadOnlyNotice` visível |

Temas e tamanhos: M1, M2 e M6 em claro, escuro e 390 px (tabela com rolagem horizontal dentro do próprio
contêiner, sem rolagem da página). Comparar com `Members.png`, anotando os desvios previstos (sem cabeçalho do
board, "Conferido" absoluto).

**Não observável sem infra:** permissão real de um repositório real, webhook `member` real chegando do GitHub
e o limite de várias instâncias (R1). 🔒, item 5 do `docs/PRE-PRODUCTION.md`.

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Toda rota de board (`GET /boards/[id]`, `reload`, membros) resolve o papel efetivo; não-membro recebe 404.
2. `operator` no board com `read` no GitHub aparece e age como `viewer`.
3. Membro sem acesso ao repositório recebe 403 `BOARD_REPOSITORY_ACCESS_LOST` e aparece como "Sem acesso".
4. Convite por login cria linha pendente; a pessoa vira ativa ao entrar e vê o board na lista.
5. Só `maintainer`/`owner` efetivos convidam, mudam papel e removem; ninguém passa do próprio papel; o dono e a
   própria linha não têm ações, na UI e na API.
6. A lista mostra papel no board, permissão no GitHub, papel que vale e quando foi conferido.
7. Remover e cancelar convite apagam o membro; o removido deixa de ver o board.
8. `viewer` não vê "Recarregar" nem ações de membros, e a API recusa as duas chamadas diretas.
9. Webhook `member` faz a próxima checagem perguntar ao GitHub (teste).
10. Erros com `error.code` traduzido, nunca 500; personificação lê e não escreve.
11. Claro, escuro e 390 px sem rolagem horizontal da página.

## Etapa 2: blueprint técnico

### 10.1 Contrato (SDK)

`packages/sdk/src/types/board/member.ts`:

```ts
import type { BoardRole, GithubRepoRole, InvitableBoardRole } from "@repo/kanban-contract";
import type { BoardDTO } from "./board";

export type BoardMemberStatus = "pending" | "active";
export type { InvitableBoardRole } from "@repo/kanban-contract";

export type BoardAccessDTO = {
    role: BoardRole;
    githubRole: GithubRepoRole | null;
    effectiveRole: BoardRole | null;
    checkedAt: string | null;
};

export type BoardViewDTO = BoardDTO & { access: BoardAccessDTO };

export type BoardMemberDTO = {
    id: string;
    boardId: string;
    login: string;
    name: string | null;
    avatarUrl: string | null;
    role: BoardRole;
    status: BoardMemberStatus;
    githubRole: GithubRepoRole | null;
    effectiveRole: BoardRole | null;
    githubRoleCheckedAt: string | null;
    joinedAt: string | null;
    createdAt: string;
    /** The member is the person asking; the screen hides their own actions. */
    isSelf: boolean;
};

export type InviteBoardMemberRequest = { login: string; role: InvitableBoardRole };
export type UpdateBoardMemberRequest = { role: InvitableBoardRole };
```

`board.ts`: `BoardReloadResultDTO.board: BoardViewDTO`. Exportar `member.ts` em `types/board/index.ts`.

`packages/sdk/src/actions/boardMember/action.ts` (`BoardMemberActions`, molde de `BoardActions`):

```ts
list(boardId: string): Promise<BoardMemberDTO[]>                                        // GET    /boards/:id/members
invite(boardId: string, body: InviteBoardMemberRequest): Promise<BoardMemberDTO>        // POST   /boards/:id/members
updateRole(boardId: string, memberId: string, body: UpdateBoardMemberRequest): Promise<BoardMemberDTO> // PATCH /boards/:id/members/:memberId
remove(boardId: string, memberId: string): Promise<void>                                // DELETE /boards/:id/members/:memberId
```

Cada parte do caminho com `encodeURIComponent`, como `board/action.ts:30`. `BoardActions.list/findById/create`
passam a tipar `BoardViewDTO`. Registrar `boardMember!: BoardMemberActions` em `Client`.

### 10.2 Guard e acesso

`apps/api/(shared)/lib/board-access.ts`:

```ts
export type BoardCapability = "view" | "manageMembers" | "configure" | "trigger";

const CAPABILITY_CHECK: Record<BoardCapability, (role: BoardRole | null) => boolean> = {
    view: canViewBoard,
    manageMembers: canManageMembers,
    configure: canConfigureBoard,
    trigger: canTriggerStages,
};

export type BoardAccess =
    | { ok: false; response: Response }
    | { ok: true; board: BoardDTO; member: BoardMemberRecord; access: BoardAccessDTO };

export async function resolveBoardAccess(input: {
    boardId: string;
    profile: UserDTO;
    capability: BoardCapability;
    isImpersonating: boolean;
}): Promise<BoardAccess>;
```

`apps/api/app/(guards)/board.ts`:

```ts
export type BoardAuthContext = CommonPanelAuthContext & {
    board: BoardDTO;
    member: BoardMemberRecord;
    access: BoardAccessDTO;
};

export function requireBoardApi<TParams extends { id: string }>(
    capability: BoardCapability,
    handler: (req: NextRequest, ctx: BoardAuthContext & { params: TParams }) => Promise<Response>
) {
    return requireCommonPanelApi<{ params: TParams | Promise<TParams> }>(async (req, ctx) => {
        const params = await ctx.params;
        const resolved = await resolveBoardAccess({
            boardId: params.id,
            profile: ctx.subjectProfile,
            capability,
            isImpersonating: ctx.authRequest.isImpersonating,
        });
        if (!resolved.ok) return resolved.response;
        return handler(req, { ...ctx, params, board: resolved.board, member: resolved.member, access: resolved.access });
    });
}
```

`BoardMemberRecord` é o tipo interno da API (o documento mapeado, com `userId`, `githubId`, `loginLower`,
`invitedByUserId`); o `BoardMemberDTO` público omite `userId`, `githubId` e `invitedByUserId`.

### 10.3 Rotas (esqueletos)

`apps/api/app/(routes)/boards/[id]/members/route.ts`:

```ts
export const GET = requireBoardApi("view", async (_req, ctx) => {
    const members = await boardMemberRepository.listByBoard(ctx.board.id);
    return Response.json({ data: members.map((m) => toBoardMemberDTO(m, ctx.member.id)) });
});

export const POST = requireBoardApi("manageMembers", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const parsed = parseInviteBoardMember(body.value);
    if (!parsed.ok) return parsed.response;

    if (!canGrantRole(ctx.access.effectiveRole, parsed.value.role)) {
        return errorResponse("BOARD_MEMBER_ROLE_NOT_ALLOWED", HTTP_STATUS.FORBIDDEN);
    }
    if (await boardMemberRepository.findByLogin(ctx.board.id, parsed.value.login)) {
        return errorResponse("BOARD_MEMBER_ALREADY_EXISTS", HTTP_STATUS.CONFLICT);
    }
    const created = await boardMemberRepository.createMember({
        boardId: ctx.board.id,
        login: parsed.value.login,
        role: parsed.value.role,
        invitedByUserId: ctx.subjectProfile.id,
    });
    if (!created) return errorResponse("BOARD_MEMBER_ALREADY_EXISTS", HTTP_STATUS.CONFLICT);
    return Response.json({ data: toBoardMemberDTO(created, ctx.member.id) }, { status: HTTP_STATUS.CREATED });
});
```

`apps/api/app/(routes)/boards/[id]/members/[memberId]/route.ts`: `PATCH` e `DELETE` com
`requireBoardApi<{ id: string; memberId: string }>("manageMembers", ...)`; carregam o alvo com
`findById(memberId)`, conferem `target.boardId === ctx.board.id` (senão 404 `BOARD_MEMBER_NOT_FOUND`) e aplicam
`canChangeMember(ctx.member, ctx.access.effectiveRole, target)` antes de `updateRole` / `remove`.

`packages/kanban-contract/src/roles.ts` (acréscimo, exportado pelo barril):

```ts
export const INVITABLE_BOARD_ROLES = ["viewer", "operator", "maintainer"] as const;
export type InvitableBoardRole = (typeof INVITABLE_BOARD_ROLES)[number];
export function grantableRoles(actor: BoardRole | null): InvitableBoardRole[];
export function canGrantRole(actor: BoardRole | null, role: BoardRole): boolean;
export function canChangeMember(actor: { id: string; role: BoardRole | null }, target: { id: string; role: BoardRole }): boolean;
```

`canGrantRole` exige `canManageMembers(actor)`, `role !== "owner"` e `BOARD_ROLES.indexOf(role) ≤
BOARD_ROLES.indexOf(actor)`. `canChangeMember` exige `canManageMembers(actor.role)`, `target.role !== "owner"`,
`target.id !== actor.id` e o papel do alvo ≤ o do autor. O SDK reexporta `InvitableBoardRole` em vez de
redefinir com `Exclude` (10.1). O app já recebe o contrato pelo SDK (`packages/sdk/package.json:8`); o `/develop`
confere se `apps/app/package.json` precisa declarar `@repo/kanban-contract` para importar as funções (é pacote do
workspace, não dependência nova).

### 10.4 Payloads de exemplo

`POST /boards/agent-board-demo--sample-app/members` `{ "login": "qa-reader", "role": "operator" }` → 201:

```json
{
  "data": {
    "id": "agent-board-demo--sample-app__qa-reader",
    "boardId": "agent-board-demo--sample-app",
    "login": "qa-reader",
    "name": null,
    "avatarUrl": null,
    "role": "operator",
    "status": "pending",
    "githubRole": null,
    "effectiveRole": null,
    "githubRoleCheckedAt": null,
    "joinedAt": null,
    "createdAt": "2026-11-26T10:00:00.000Z",
    "isSelf": false
  }
}
```

Depois que `qa-reader` abre o board, `GET .../members` traz a linha com `status: "active"`, `githubRole:
"read"`, `effectiveRole: "viewer"` e `githubRoleCheckedAt` preenchido.

`GET /boards/agent-board-demo--sample-app` como `qa-reader` → 200 `{ "data": { ...BoardDTO, "access": { "role":
"operator", "githubRole": "read", "effectiveRole": "viewer", "checkedAt": "..." } } }`.

`POST /boards/agent-board-demo--sample-app/reload` como `qa-reader` → 403 `{ "error": { "code":
"BOARD_ROLE_INSUFFICIENT" } }`.

### 10.5 Tabela `error.code` → status

| Código | Status |
|--------|--------|
| `VALIDATION_FAILED` | 400 |
| `BOARD_ROLE_INSUFFICIENT` | 403 |
| `BOARD_REPOSITORY_ACCESS_LOST` | 403 |
| `BOARD_MEMBER_ROLE_NOT_ALLOWED` | 403 |
| `BOARD_MEMBER_CHANGE_FORBIDDEN` | 403 |
| `AUTH_REQUEST_IMPERSONATION_READ_ONLY` | 403 |
| `BOARD_NOT_FOUND` | 404 |
| `BOARD_MEMBER_NOT_FOUND` | 404 |
| `BOARD_MEMBER_ALREADY_EXISTS` | 409 |
| `GITHUB_UNAVAILABLE` | 502 |
| `GITHUB_APP_NOT_CONFIGURED` | 503 |
| `GITHUB_RATE_LIMITED` | 503 |

### 10.6 Documento no Firestore

```
boardMember/agent-board-demo--sample-app__qa-reader
{
  boardId: "agent-board-demo--sample-app",
  role: "operator",
  status: "active",
  login: "qa-reader",
  loginLower: "qa-reader",
  githubId: "<dígitos>",
  userId: "<profile id>",
  name: "QA Reader",
  avatarUrl: null,
  invitedByUserId: "<profile id do dono>",
  githubRole: "read",
  githubRoleCheckedAt: Timestamp,
  joinedAt: Timestamp,
  createdAt: Timestamp, updatedAt: Timestamp, deletedAt: null
}
```

### 10.7 Árvore de arquivos

```
packages/kanban-contract/
  src/roles.ts                                         (+ INVITABLE_BOARD_ROLES, canGrantRole, grantableRoles, canChangeMember)
  __tests__/roles.test.ts                              (+ casos)
packages/sdk/src/
  types/board/member.ts                                novo
  types/board/{board.ts,index.ts}                      (BoardViewDTO no reload; export)
  actions/boardMember/action.ts                        novo
  actions/board/action.ts                              (tipos BoardViewDTO)
  client/index.ts                                      (+ boardMember)
apps/api/
  app/(guards)/board.ts                                novo
  (shared)/lib/board-access.ts                         novo
  (shared)/lib/resolve-route-id.ts                     (+ contexto com memberId)
  (shared)/lib/github/github-sample-repositories.ts    (+ SAMPLE_COLLABORATOR_ROLES)
  (shared)/lib/github/github-fake-client.ts            (papel pelo mapa)
  (shared)/repositories/board-member.repository.ts     novo
  (shared)/repositories/board.repository.ts           (batch com o membro dono; sai findOwnedBy)
  (shared)/mappers/board-member.mapper.ts              novo
  (shared)/validation/board-member.schema.ts           novo
  app/(routes)/boards/route.ts                         (GET por membro; POST com membro dono)
  app/(routes)/boards/[id]/route.ts                    (requireBoardApi("view"))
  app/(routes)/boards/[id]/reload/route.ts             (requireBoardApi("configure"))
  app/(routes)/boards/[id]/members/route.ts            novo (GET, POST)
  app/(routes)/boards/[id]/members/[memberId]/route.ts novo (PATCH, DELETE)
  __tests__/boardMemberMapper.test.ts, boardAccess.test.ts, boardMembersRoutes.test.ts  novos
  __tests__/boardsRoutes.test.ts, githubFakeClient.test.ts                                                       (ajustes)
apps/app/
  shared/lib/queryKeys.ts                              (+ boards.members)
  shared/lib/panelTitles.ts                            (+ /boards/[id]/members)
  app/[locale]/(authenticated)/(common)/paths.ts       (+ boards.members)
  app/[locale]/(authenticated)/(common)/(pages)/boards/
    (components)/BoardSectionNav.tsx                   novo
    (components)/InviteMemberForm.tsx                  novo
    (components)/BoardMembersTable.tsx                 novo
    (components)/ChangeMemberRoleDialog.tsx            novo
    (components)/BoardRolesGuide.tsx                   novo
    (components)/BoardCard.tsx                         (selo pelo papel)
    (validations)/inviteMemberSchema.ts                novo
    (hooks)/useListBoardMembers.tsx                    novo
    (hooks)/useBoardMemberCrud.tsx                     novo
    (hooks)/useListBoards.tsx, useFindBoardById.tsx, useBoardCrud.tsx   (BoardViewDTO)
    (pages)/[id]/members/{page.tsx,BoardMembersClient.tsx,loading.tsx}  novo
    (pages)/[id]/settings/BoardSettingsClient.tsx      (nav; recarregar só para quem configura)
  __tests__/useBoardMemberCrud.test.tsx                novo
packages/internationalization/translations/
  apps/app/pages/common/boards.ts                      (+ members, roles, nav)
  apps/app/pages/common/routes/index.ts                (+ platform.boards.members)
  packages/shared/utils.ts                             (+ 6 apiErrors)
docs/SETUP.md                                          (logins do cliente falso, ao lado da linha 402)
```

### 10.8 Chaves de i18n (pt-br)

```
apps.app.pages.common.routes.platform.boards.members: "Membros"

apps.app.pages.common.boards:
  roles: { owner: "Dono", maintainer: "Mantenedor", operator: "Operador", viewer: "Leitor" }
  nav: { label: "Seções do board", settings: "Configuração", members: "Membros" }
  members:
    title: "Membros"
    subtitle: "O papel que vale é o menor entre o papel no board e a permissão da pessoa no repositório. O board confere no GitHub ao abrir o board e antes de cada disparo."
    loadError: "Não foi possível carregar os membros."
    invite:
      title: "Convidar pelo login do GitHub"
      login: "Login"
      loginPlaceholder: "por exemplo, joao-pm"
      loginInvalid: "Use o login do GitHub: letras, números e hífen, até 39 caracteres."
      role: "Papel no board"
      submit: "Convidar"
      hint: "O convite fica pendente até a pessoa entrar no agent-board pela primeira vez. Ninguém convida para um papel acima do próprio."
      success: "Convite criado para {login}."
    table:
      member: "Membro"
      boardRole: "Papel no board"
      githubRole: "Permissão no GitHub"
      effectiveRole: "Papel que vale"
      checkedAt: "Conferido"
      actions: "Ações"
      you: "você"
      checksOnJoin: "confere ao entrar"
      pending: "Convite pendente"
      invitedAt: "convidado em {date}"
      limitedByGithub: "limitado pelo GitHub"
      noAccess: "Sem acesso"
      leftRepository: "saiu do repositório"
      actionsAria: "Ações de {login}"
      avatarAria: "Avatar de {login}"
    actions:
      changeRole: "Mudar papel"
      remove: "Remover"
      removeConfirmTitle: "Remover {login} do board?"
      removeConfirmDescription: "A pessoa deixa de ver o board. O que ela fez continua no histórico."
      cancelInvite: "Cancelar convite"
      cancelInviteConfirmTitle: "Cancelar o convite de {login}?"
      removed: "{login} saiu do board."
      inviteCanceled: "Convite de {login} cancelado."
    changeRole:
      title: "Mudar o papel de {login}"
      save: "Salvar"
      cancel: "Cancelar"
      success: "Papel de {login} atualizado."
    guide:
      title: "O que cada papel pode fazer"
      viewer: { body: "Vê o board, os cards, os ciclos e os relatórios. Comenta.", requires: "Exige {role} no GitHub" }
      operator: { body: "Escreve, descobre e aprova specs, arrasta cards e roda ciclos com a própria credencial.", requires: "Exige {role} no GitHub" }
      maintainer: { body: "Convida e remove membros, edita o ciclo agendado e os limites das colunas.", requires: "Exige {role} no GitHub" }
      owner: { body: "Tudo, mais a API key do board, a aprovação de planos e excluir o board.", requires: "Exige {role} no GitHub" }

packages.shared.utils.apiErrors (+):
  BOARD_ROLE_INSUFFICIENT: "Seu papel neste board não permite esta ação."
  BOARD_REPOSITORY_ACCESS_LOST: "Você não tem mais acesso a este repositório no GitHub, então não pode abrir o board."
  BOARD_MEMBER_NOT_FOUND: "Membro não encontrado neste board."
  BOARD_MEMBER_ALREADY_EXISTS: "Esta pessoa já é membro ou já tem convite neste board."
  BOARD_MEMBER_ROLE_NOT_ALLOWED: "Você não pode dar um papel acima do seu."
  BOARD_MEMBER_CHANGE_FORBIDDEN: "Você não pode mudar o dono, a si mesmo nem quem tem papel acima do seu."
```

As frases do `guide` e do subtítulo vêm do `Members.dc.html`. `list.ownerBadge` (`boards.ts`) sai: o selo passa a
usar `roles`. Interpolação `{x}` com o `fillMessage` já usado nas telas de board.

### 10.9 Ordem de implementação e commits

0. `packages/kanban-contract`: as três funções e os testes → `feat(kanban-contract): add who-can-change-whom member rules`.
1. `packages/sdk`: `member.ts`, `BoardViewDTO`, `BoardMemberActions` → `feat(sdk): add board members resource`.
2. `apps/api`, em três commits:
   a. cliente falso com papel por login + teste → `feat(api): let the emulator GitHub client answer per-login roles`;
   b. repositório, mapper, schema, regras, `board-access.ts`, guard e testes de unidade → `feat(api): resolve the effective board role in a board guard`;
   c. rotas de membros, troca do `findOwnedBy` nas rotas de board, batch do dono e testes de rota → `feat(api): add board member routes`.
3. `packages/internationalization`: dicionário e `apiErrors` → `feat(internationalization): add board members copy and error codes`.
   Fica antes do app para cada commit passar no typecheck sozinho (o handoff da `board-import` registrou o mesmo
   problema).
4. `apps/app`, em dois commits: (a) `queryKeys`, hooks e testes; (b) página Membros,
   `BoardSectionNav`, `BoardCard`, `BoardSettingsClient`, `paths`, `panelTitles`.
5. `docs`: a linha dos logins do cliente falso em `docs/SETUP.md` → `docs: list the emulator GitHub logins and their roles`.
6. `docs(features): board-members`.

Todos depois dos commits da `board-import`, que criam os arquivos que esta spec altera.

### 10.10 Env e configuração

Nenhuma variável nova. Nenhum índice composto. Nenhuma mudança em `firestore.rules`.

## Pré-requisitos manuais de infra

Nada novo além do que as specs anteriores já registraram em `docs/PRE-PRODUCTION.md`:

- **Item 5 (GitHub App do board)**, com o webhook apontando para `POST /github/webhook` e o evento `member`
  marcado. Sem ele, fora do emulador, abrir qualquer board responde `GITHUB_APP_NOT_CONFIGURED`, e a remoção de um
  colaborador no GitHub só chega ao board quando o cache expira (5 min).
- **Item 4 (login com GitHub)**: sem ele ninguém tem `github.login` e nenhum convite pode ser reclamado.

O `/develop` acrescenta ao `docs/PRE-PRODUCTION.md`, em "Pendências registradas pelo pipeline", uma linha: os
sinais de pronto com permissão real (abaixo de `admin`) e webhook real ficam 🔒 até os itens 4 e 5.

## Riscos

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | Cache de permissão em memória por processo: com várias instâncias, só quem recebeu o webhook `member` esquece o papel; as outras levam até 5 min | TTL curto (o "expiração curta" da spec). Antes de disparar, o `orchestrator` ignora o cache. Cache compartilhado fica para quando houver número medido |
| R2 | Convite por login: se o login mudar de dono no GitHub antes do primeiro acesso, a pessoa errada reclama o convite | Desenho do ACCESS.md; o papel efetivo continua limitado pela permissão dela no repositório; o mantenedor vê o nome na lista e remove |
| R3 | Id do membro pelo login: um membro que trocou de login e é convidado de novo pelo novo, ou um login reaproveitado por outra pessoa, colide ou passa pela checagem | Consulta `boardId + loginLower` antes do `create`; caso raro, registrado |
| R4 | `GET /boards` não consulta o GitHub: quem perdeu o acesso ainda vê o card do board na lista | Abrir o board revalida e responde 403 com a frase; a lista mostra o papel no board, não promete acesso |
| R5 | Personificação não reclama convite nem grava checagem: o admin personificando um convidado pendente não vê o board | Comportamento coerente com "personificação só lê"; anotado para o suporte |
| R6 | Mais uma escrita no Firestore por abertura de board quando a checagem venceu | No máximo uma por pessoa a cada 5 min (passo 8) |
| R7 | A troca de `findOwnedBy` pelo guard reescreve casos do `boardsRoutes.test.ts` da `board-import`, que também está sem commit | Os commits desta spec entram depois dos da `board-import`; o `/develop` mantém os casos antigos e só muda o mock |

## Perguntas em aberto

Cada item traz a opção adotada pelo `/cycle` e o porquê.

1. **O dono vira documento em `boardMember` ou fica implícito em `board.ownerUserId`?** Opções: (a) documento
   criado no batch do `POST /boards`, com o guard criando o que faltar; (b) dono só no board, linha sintetizada na
   lista. **Adotada: (a)**, com `board.ownerUserId` como fonte da verdade da posse. Lista e checagem iguais para
   todos, e é o que o plano da `board-import` previu (seção 6 de lá).
2. **Convite consulta o GitHub (existência do login, permissão)?** **Adotada: não.** O desenho mostra "confere ao
   entrar" no pendente, e o falso não sabe o id que o emulador vai dar à conta. Login errado fica pendente até ser
   cancelado.
3. **Chave do membro: login (id determinístico) ou github id?** **Adotada: id pelo login, `githubId` como campo**
   depois que a pessoa entra. O convite só conhece o login; trocar o id na ativação exigiria apagar e recriar. Ver
   R3.
4. **A lista de membros revalida a permissão de cada um no GitHub?** Opções: (a) não, mostra a última checagem
   de cada pessoa; (b) revalida as vencidas, com concorrência 8. **Adotada: (a).** O desenho mostra "há 2 h" e
   "há 3 dias", ou seja, a data da última checagem própria; (b) custaria uma chamada por membro a cada abertura.
5. **`owner` entre os papéis do convite?** **Adotada: não.** Um dono só, enquanto não houver transferência de posse.
   O "ninguém convida acima do próprio" continua valendo para os outros três.
6. **Conta GitHub no seed** (pergunta herdada da `github-sign-in`). **Adotada: não.** O `/test` cria as contas pelo
   popup do emulador com os logins de `SAMPLE_COLLABORATOR_ROLES`; o seed segue só com as contas de senha. Ganho
   pequeno para mais um caminho de escrita no seed.
7. **Regras de "quem pode mudar quem" no contrato ou em cada app?** Opções: (a) `@repo/kanban-contract`
   (`roles.ts`), usado pela API e pelo app; (b) helper na API e cópia no app. **Adotada: (a)**, contrariando o
   "Nenhum" da spec para o contrato: `canGrantRole`, `grantableRoles` e `canChangeMember` são regra do domínio do
   board (regra 12), e a tela precisa esconder exatamente o que a API recusa. A `cycle-policy.md` §2 permite
   mexer em pacote de contrato.
8. **Cliente falso com papel por login** (pedido do orquestrador). **Adotada: mapa fixo
   `SAMPLE_COLLABORATOR_ROLES`** (4.6). Descartadas: documento editável no emulador e regra por prefixo.
9. **`POST /users`** (pergunta herdada da `github-sign-in`). **Adotada: fora de escopo.** Convite não cria conta;
   decidir o destino do cadastro pelo admin continua com você.
10. **Convite por e-mail** (pergunta da spec). **Adotada a recomendação dela: não.**
11. **"Conferido" relativo ("há 5 min") como no desenho?** **Adotada: data e hora absolutas** com o formatador
    existente. Recomendação para você: um formatador relativo compartilhado na spec de tela que precisar dele de
    novo.
12. **Picker mostra "Já tem board" para um board em que a pessoa é membro sem ser dona.** **Adotada: deixar.**
    Corrigir pede uma consulta de membros no picker; vira achado de backlog (`board.repository.ts:95-125`).
