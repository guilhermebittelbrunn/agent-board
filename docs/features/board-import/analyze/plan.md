# Plano: criar board importando um repositório

Spec de origem: [`specs/features/board-import.md`](../../../../specs/features/board-import.md) (status
`proposed`; executada no `/cycle` a pedido do usuário, sem aprovação formal). Depende de
`github-app-integration` e `github-sign-in`, as duas implementadas no working tree e ainda sem commit.

## Etapa 1: análise

### 1. Contexto

**Resumo.** A pessoa escolhe um repositório da instalação do GitHub App, a API lê `.kanban/board.yml` na
branch padrão, valida com o contrato e mostra os erros por campo; com o arquivo válido, o board é criado
guardando o repositório, o snapshot da configuração e o sha lido, e quem criou vira dono. Depois, "Recarregar
configuração" relê o arquivo e mostra o que mudou nas colunas.

**Objetivos (corte de MVP da spec, sem alteração):**

1. Tela "Novo board": lista os repositórios da instalação; ao escolher, a API lê e valida o `board.yml`.
2. Erros de validação por campo, com o caminho (`stages[2].onRework`).
3. Board criado guarda repositório, snapshot e sha; quem criou vira `owner`.
4. "Recarregar configuração" relê o arquivo e mostra o que mudou nas colunas.
5. Lista de boards do usuário.

**Fora de escopo** (spec + telas de referência):

- Cards, a tela do quadro com colunas e a recusa de recarga quando a coluna removida tem cards: spec
  `card-backlog`. Aqui ainda não existe card, então a recarga sempre aplica.
- Membros, convites, guard de papel efetivo genérico e o papel `Leitor` na lista: spec `board-members`.
- Passos 3 (Executores) e 4 (Puxar o backlog) do assistente da tela NewBoard: `local-runner` e
  `card-backlog`. Aqui o assistente tem dois passos e termina em "Criar board".
- Na lista (Boards.png): barra de distribuição dos cards, selos "aguardando você/rodando/com falha", "Ativo
  há", ciclo noturno e a faixa "O GitHub App está instalado em N repositórios; M ainda não têm board".
  Dependem de cards, runs e ciclos. A faixa custaria uma listagem completa no GitHub a cada abertura da
  lista; fica como pergunta.
- Na Configuração (Settings.png): abas Ciclo e agenda, Specs, Execução e Board; na aba Etapas, as colunas
  editáveis "Limite de cards" e "Aprovação" e o botão "Salvar limites e aprovação" (`orchestrator`).
- Cabeçalho próprio do board (logo, menu Quadro · Ciclos · …, botão de tema): `theme-toggle` e as specs de
  cada item. As telas entram no layout atual do painel comum (sidebar + navbar).
- Excluir board.
- Mais de um board por repositório (pergunta da spec, recomendação "não": adotada).

**Apps impactados:** `packages/kanban-contract`, `packages/sdk`, `apps/api`, `apps/app`,
`packages/internationalization`.

**Área do painel:** comum, `(common)/(pages)/boards`. Admin não importa board: o layout comum redireciona
admin sem personificação para `/admin` (`apps/app/app/[locale]/(authenticated)/(common)/layout.tsx:47`).

**Papel no board:** só o dono existe nesta spec. Criar e recarregar exigem `admin` no repositório do GitHub
(o papel `owner` pede `admin`, `packages/kanban-contract/src/roles.ts:20-25`). Ver a seção 6 para a fronteira
com `board-members`.

**Dependências externas:** GitHub App (cliente real ou o falso do emulador). Nenhuma env nova. Uma
dependência direta nova, `yaml@2.9.1`, já resolvida no lockfile (`pnpm-lock.yaml:8436`, `17284`).

**Genérico × específico:** o parse do YAML, a tradução dos erros do Zod em regras estáveis e a diferença
entre duas listas de etapas são regras do domínio do board e vão para `@repo/kanban-contract` (regra 12).
Rotas, coleção e telas ficam em `apps/*`.

### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/board-import.md` | Corte, riscos (coluna removida com cards, parser YAML) e a pergunta "um board por repositório" |
| `docs/board/IMPORT.md` | Passo 4: escolher o repositório, ler `board.yml` na branch base, validar com `parseBoardConfig` |
| `docs/board/ACCESS.md` | Papel × permissão no GitHub; quando checar a permissão |
| `docs/board/DECISIONS.md:133` | "Escopo dos dados: por pessoa (`userId`) até a spec `board-members`" |
| `docs/board/ARCHITECTURE.md:70` | Coleção `boards`: repositório, instalação, `board.yml` validado (snapshot + sha) |
| `docs/design/screenshots/{Boards,MBoards,NewBoard,BoardsEmpty,Settings}.png` e os `.dc.html` | Layout, textos e estados de cada tela (seção 5) |
| `docs/features/github-app-integration/develop/handoff.md` | Fronteira `GithubClient`, cliente falso, `SAMPLE_BOARD_CONFIGS`, e o teste `parse(yml)` que ficou para esta spec |
| `docs/features/github-sign-in/{develop/handoff.md,test/report.md}` | `UserDTO.github`; no emulador, o popup do GitHub cria conta com `github.login` |
| `kit/.kanban/board.yml`, `.kanban/board.yml` | O arquivo real tem comentários YAML e a etapa `pr` com `onPrComment` |

**Referências não lidas:** o canvas `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt` é privado. As fontes
copiadas em `docs/design/screens/` e as imagens em `docs/design/screenshots/` cobrem as telas citadas.

### 2. Dados (Firestore)

#### 2.1 Coleção `board` (nova)

Nome no singular, como `entity` e `user`. Rota plural (`/boards`).

| Campo | Tipo | Default | `null`? | Justificativa |
|-------|------|---------|---------|---------------|
| `ownerUserId` | string (id do perfil) | — | não | Escopo por pessoa até `board-members` (DECISIONS:133). Mesmo papel de `entity.userId` |
| `ownerGithubId` | string (dígitos) | — | não | Chave estável do GitHub de quem criou. A `board-members` usa para criar o membro `owner` sem reler o perfil |
| `name` | string | `config.name` | não | Título do card na lista; vem do `board.yml` |
| `repository` | `{ installationId: number, owner: string, name: string, fullName: string, defaultBranch: string, private: boolean }` | — | não | Mesmo formato de `GithubRepository` (`apps/api/(shared)/lib/github/github-client.ts:16-20`), para chamar `readFile`/`getCollaboratorRole` sem reconsultar |
| `config` | `BoardConfig` (já com os defaults do schema) | — | não | Snapshot validado. Guardar o objeto, não o texto: quem lê (orquestrador, quadro) usa o objeto, e o texto continua no git pelo sha |
| `configSource` | `{ path: ".kanban/board.yml", ref: string, sha: string, readAt: Date }` | — | não | O que a tela Configuração mostra ("Lido de main em 55be30c, 25/11 às 14:02") |
| `createdAt` / `updatedAt` / `deletedAt` | herdados do `BaseRepository` | — | — | `create` estampa (`base.repository.ts:171-177`) |

**Id do documento determinístico:** `boardIdForRepository("Agent-Board-Demo/sample-app")` →
`agent-board-demo--sample-app` (minúsculas, `/` vira `--`). Login e nome de organização do GitHub não têm
dois hífens seguidos (`packages/kanban-contract/src/identity.ts:4`), então o primeiro `--` separa dono e nome
sem ambiguidade. Com isso:

- "um repositório, um board" vira garantia atômica: `doc(id).create()` falha com `ALREADY_EXISTS`, como em
  `notification.repository.ts:121-128` (`isAlreadyExistsError`, `infra/firestore-errors.ts:4`). Duplo
  clique ou duas pessoas importando ao mesmo tempo não criam dois boards.
- a listagem de repositórios descobre quais já têm board com um `getAll` das referências, sem consulta nem
  índice.

O id passa em `isUsableDocumentId` (`apps/api/(shared)/lib/pagination.ts:18-27`): sem `/`, nunca `.`/`..`,
e não casa `__.*__` porque começa pelo dono. Repositório renomeado ou transferido mantém o id antigo; o
`repository.fullName` é atualizado na recarga (seção 4).

**Ownership:** recurso da pessoa até `board-members`. Toda leitura filtra `ownerUserId ===
ctx.subjectProfile.id` (padrão `findOwnedBy`, `entity.repository.ts:26-32`); board de outra pessoa → 404.

**Soft delete:** não há exclusão nesta spec. Se um dia houver, o id determinístico exige `purge` ou reviver
o documento; fica anotado para a spec que trouxer "Excluir board".

#### 2.2 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| Boards da pessoa | `where("ownerUserId","==",id).where("deletedAt","==",null)`, ordenado em memória por `createdAt` desc | Nenhum composto: só igualdades, o Firestore junta os índices de campo único |
| Board por id | `findById` + checagem de dono | — |
| Quais repositórios já têm board | `db.getAll(...refs)` pelos ids determinísticos | — |

Sem paginação na lista: um board por repositório e uso pessoal mantêm a lista na casa das dezenas. Se isso
mudar, troca-se por `paginate` (`base.repository.ts:97-133`) com o índice `ownerUserId + deletedAt +
createdAt desc`. Decisão registrada, não improviso.

**Rules:** nenhuma mudança. `firestore.rules` nega todo acesso de cliente e a API usa o Admin SDK.

#### 2.3 Dados existentes

Coleção nova, sem documentos antigos e sem backfill. O mapper trata ausência por segurança (`?? null`,
`?? []`), como o de `entity`.

### 3. Contrato `@repo/sdk`

Novo recurso `board` em `packages/sdk/src/types/board/board.ts` e `packages/sdk/src/actions/board/action.ts`,
registrado em `packages/sdk/src/client/index.ts:13-31`. Contexto `common`. O SDK já depende de
`@repo/kanban-contract` (`packages/sdk/package.json:8`), então `BoardConfig`, `GithubRepoRole` e os tipos
novos de issue/diff vêm de lá com `import type`.

Ações: `list()`, `findById(id)`, `listRepositories()`, `preview(repository)`, `create(body)`,
`reload(id)`. Nenhum consumidor existente quebra: o recurso é novo.

### 4. API (`apps/api`)

#### 4.1 Rotas e guard

Todas com `requireCommonPanelApi` (`apps/api/app/(guards)/common-panel.ts:30`). Personificação: as escritas
(`POST`) são recusadas pelo guard com `AUTH_REQUEST_IMPERSONATION_READ_ONLY`
(`impersonation-read-only.ts:19-31`); as leituras funcionam com o perfil personificado.

| Método e path | O que faz | Status de sucesso |
|---------------|-----------|-------------------|
| `GET /boards` | Boards da pessoa | 200 `{ data: BoardDTO[] }` |
| `GET /boards/repositories` | Repositórios da instalação em que a pessoa é `admin`, com o board existente | 200 `{ data: ImportableRepositoryDTO[] }` |
| `GET /boards/preview?repository=<owner>/<name>` | Lê e valida o `board.yml` sem gravar | 200 `{ data: BoardImportPreviewDTO }` |
| `POST /boards` | Relê, valida e cria | 201 `{ data: BoardDTO }` |
| `GET /boards/[id]` | Um board da pessoa | 200 `{ data: BoardDTO }` |
| `POST /boards/[id]/reload` | Relê, valida, aplica se válido e devolve a diferença | 200 `{ data: BoardReloadResultDTO }` |

O segmento estático `repositories`/`preview` tem precedência sobre `[id]` no App Router. Mesmo assim, um id
`repositories` nunca existe: o id determinístico sempre tem `--`.

Preview é `GET` de propósito: é leitura, funciona sob personificação e o React Query faz cache e "Ler de
novo" com `refetch`.

#### 4.2 Fluxo comum: `resolveImportTarget`

Um helper em `apps/api/(shared)/lib/board-import.ts` concentra o que preview, create e reload repetem:

1. `getGithubClient()` (`github-client.ts:44`); `null` → `githubAppNotConfiguredResponse()` (503
   `GITHUB_APP_NOT_CONFIGURED`, `github-errors.ts:54`).
2. `ctx.subjectProfile.github?.login` ausente (conta de senha do seed) → 403 `BOARD_GITHUB_ACCOUNT_REQUIRED`.
3. `listInstallationRepositories()` e busca por `fullName` sem diferenciar maiúsculas. **O
   `installationId` nunca vem do cliente**: o corpo leva só `"owner/name"`. Repositório fora da instalação →
   404 `GITHUB_REPOSITORY_NOT_ACCESSIBLE`.
4. `getCollaboratorRole(repo, login)`: `none` → 404 `GITHUB_REPOSITORY_NOT_ACCESSIBLE` (não vaza a
   existência); qualquer papel abaixo de `admin` → 403 `BOARD_IMPORT_FORBIDDEN`. A regra é
   `resolveEffectiveRole("owner", role) === "owner"` (`roles.ts:30-41`), não uma comparação nova.
5. `readFile(repo, ".kanban/board.yml", repo.defaultBranch)` e `parseBoardConfigYaml(content)`.
6. `GithubApiError` em qualquer passo → `githubErrorResponse(error)` (`github-errors.ts:46`); outro erro é
   relançado.

**Branch lida:** a padrão do repositório (`defaultBranch`). O `baseBranch` está dentro do próprio arquivo,
então não dá para usá-lo antes de ler. Decisão registrada nas perguntas.

#### 4.3 `GET /boards/repositories`

Lista a instalação, consulta o papel da pessoa em cada repositório (cache de 5 min,
`github-permission-cache.ts`) com no máximo 8 chamadas simultâneas, e devolve **só** os repositórios em que
ela é `admin`. Sem esse filtro, qualquer conta logada veria todos os repositórios privados da instalação.
Para cada um, `boardId` (seu board), `"taken"` (board de outra pessoa, sem dizer de quem) ou `null`.

Sem App fora do emulador: 503 `GITHUB_APP_NOT_CONFIGURED`, e a tela mostra o estado vazio traduzido.

#### 4.4 `GET /boards/preview`

Query `repository` validada com Zod (`owner/name`, regex de login para o dono e
`^[A-Za-z0-9._-]{1,100}$` para o nome). Resposta, sempre 200 depois do fluxo da 4.2:

- `status: "missing"`: `readFile` devolveu `null` (repositório `no-kanban`).
- `status: "invalid"`: YAML sem sintaxe válida ou falha do schema; `issues[]` preenchido.
- `status: "valid"`: `config` preenchido.
- `boardId` / `taken` como na listagem, para a tela já avisar que o repositório tem board.

Arquivo ausente e inválido não são erros HTTP: são o estado do arquivo, e a tela precisa dos `issues` para
mostrar por campo (o padrão `{ error: { code } }` não carrega detalhes).

#### 4.5 `POST /boards`

Body `{ repository: "owner/name" }` (`parseCreateBoard`). Repete o fluxo da 4.2 no servidor; não confia no
preview do cliente (o arquivo pode ter mudado entre um e outro). Depois:

- arquivo ausente → 422 `BOARD_CONFIG_NOT_FOUND`;
- inválido → 422 `BOARD_CONFIG_INVALID` (a tela já mostra os `issues` do preview e relê ao receber o erro);
- `boardRepository.createForRepository(id, data)` → `ALREADY_EXISTS` → 409 `BOARD_ALREADY_EXISTS`;
- sucesso → 201 com o `BoardDTO`.

#### 4.6 `POST /boards/[id]/reload`

`findOwnedBy(id, ctx.subjectProfile.id)` → `null` → 404 `BOARD_NOT_FOUND`. Depois o fluxo da 4.2 com o
`repository.fullName` guardado (isso já revalida `admin` e pega `installationId`/`defaultBranch` atuais).
Resultado:

| `outcome` | Quando | Grava? |
|-----------|--------|--------|
| `unchanged` | sha igual ao guardado | não |
| `updated` | válido e sha diferente | `config`, `configSource`, `name`, `repository` |
| `invalid` | YAML ou schema falhou | não; devolve `issues` e o board mantém o snapshot anterior |
| `missing` | arquivo sumiu | não |

`changes` vem de `diffBoardStages(antes, depois)`. Quando `card-backlog` existir, ela acrescenta aqui a
recusa para coluna removida com cards (risco da spec). Até lá não há card para proteger.

#### 4.7 Persistência

- `apps/api/(shared)/repositories/board.repository.ts`: `BoardRepository extends BaseRepository<BoardDTO>`,
  `super(db, "board", boardMapper)`, com `ownedBy(userId)`, `findOwnedBy(id, userId)`,
  `listByOwner(userId)`, `createForRepository(id, data)` (`doc(id).create`, estampa as datas como o
  `create` base) e `existingIds(ids)` (`getAll`).
- `apps/api/(shared)/mappers/board.mapper.ts`: `toDTO` normaliza `createdAt/updatedAt/deletedAt` e
  `configSource.readAt` com `normalizeFirestoreInstant`; `toPersistence` com whitelist.
- `apps/api/(shared)/validation/board.schema.ts`: `repositoryFullNameSchema`, `parseCreateBoard`,
  `parseBoardPreviewQuery`.

#### 4.8 Erros novos

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `BOARD_NOT_FOUND` | 404 | id inexistente, apagado ou de outra pessoa |
| `BOARD_ALREADY_EXISTS` | 409 | o repositório já tem board |
| `BOARD_CONFIG_NOT_FOUND` | 422 | `.kanban/board.yml` ausente na branch padrão |
| `BOARD_CONFIG_INVALID` | 422 | YAML ou schema inválido no `POST /boards` |
| `BOARD_IMPORT_FORBIDDEN` | 403 | papel no GitHub abaixo de `admin` |
| `BOARD_GITHUB_ACCOUNT_REQUIRED` | 403 | perfil sem `github` (conta de senha) |

Reaproveitados: `GITHUB_APP_NOT_CONFIGURED` (503), `GITHUB_REPOSITORY_NOT_ACCESSIBLE` (404),
`GITHUB_RATE_LIMITED` (503), `GITHUB_UNAVAILABLE` (502), `VALIDATION_FAILED` (400),
`AUTH_REQUEST_IMPERSONATION_READ_ONLY` (403). Os seis novos entram em `apiErrors`
(`packages/internationalization/translations/packages/shared/utils.ts`); o
`apiErrorCodesTranslated.test.ts` cobra.

### 4.9 `@repo/kanban-contract`

A spec diz "Nenhum" impacto no contrato. Três peças pedem o contrato pela regra 12, e por isso o plano
diverge (registrado nas perguntas):

1. **`parseBoardConfigYaml(text)`** em `src/boardConfigYaml.ts`, exportado pelo subpath
   `@repo/kanban-contract/board-config-yaml` (não pelo barril `src/index.ts`, para o `yaml` não entrar no
   bundle do app, que importa tipos do contrato via SDK). Usa `parseDocument` do `yaml@2.9.1` com
   `{ prettyErrors: false, uniqueKeys: true }`; erro de sintaxe vira issue `yaml_syntax` com linha e coluna
   (`linePos`); raiz que não é objeto vira `root_not_mapping`. O `maxAliasCount` padrão do `yaml` (100)
   barra a expansão de aliases em cascata. Devolve `{ ok: true, config } | { ok: false, issues }`.
2. **`toBoardConfigIssues(zodError, input)`**: cada issue do Zod vira `{ path: "stages[2].onRework",
   rule, params }` com `rule` estável para a tradução:

   | `rule` | Origem |
   |--------|--------|
   | `required` | `invalid_type` com valor ausente |
   | `wrong_type` | `invalid_type` com valor presente |
   | `too_small` / `too_big` | idem do Zod (`params.minimum`/`maximum`) |
   | `bad_format` | `invalid_format` (regex de key/comando; `branchPattern` sem `{slug}`) |
   | `not_allowed` | `invalid_value` (enum, `version: 1`; `params.allowed`) |
   | `stage_key_duplicated` | `superRefine`, `params.key` |
   | `rework_target_invalid` | `superRefine`, `params.stageColumn`, `params.target`, `params.suggestion` (key da etapa anterior, se houver) |
   | `base_branch_unprotected` | `superRefine`, `params.baseBranch` |
   | `yaml_syntax` / `root_not_mapping` | parse do YAML, `params.line`/`column` |
   | `other` | qualquer código que o Zod acrescente no futuro |

   Para os três `custom`, o `superRefine` de `boardConfig.ts:80-115` passa a anexar `params: { rule }` no
   `ctx.addIssue`. A mensagem em inglês continua igual; os testes existentes não mudam.
3. **`diffBoardStages(before, after)`** em `src/boardConfigDiff.ts`, por `key`: `added`, `removed`,
   `changed` (com a lista de campos: `column`, `command`, `model`, `effort`, `runners`, `approval`,
   `onRework`, `onPrComment`, `agent`) e `moved` quando só a posição mudou. Vai para o contrato porque a
   `card-backlog` precisa dele para recusar a remoção de coluna com cards.

Mais `boardIdForRepository(fullName)` no mesmo arquivo dos helpers de board da API (não é regra do
domínio, é detalhe de persistência).

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

Todas em `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/`:

| URL | Arquivo | Tela de referência |
|-----|---------|--------------------|
| `/boards` | `(pages)/(home)/page.tsx` (RSC, prefetch) + `BoardsListClient.tsx` + `loading.tsx` | `Boards.png` / `MBoards.png`; vazio: `BoardsEmpty.png` |
| `/boards/new` | `(pages)/new/page.tsx` + `NewBoardClient.tsx` | `NewBoard.png` (passos 1 e 2) |
| `/boards/[id]` | `(pages)/[id]/page.tsx` | redireciona para `/boards/[id]/settings` até a `card-backlog` trazer o quadro |
| `/boards/[id]/settings` | `(pages)/[id]/settings/page.tsx` (RSC, prefetch) + `BoardSettingsClient.tsx` + `loading.tsx` | `Settings.png`, aba Etapas |

Entradas em `(common)/paths.ts` (`boards.list`, `boards.create`, `boards.detail(id)`, `boards.settings(id)`)
e item "Boards" no topo do `(common)/routes.tsx`, com ícone `KanbanSquareIcon` do `lucide-react`. A home
`/` continua como está (pergunta em aberto).

Prefetch RSC com `if (!(await isImpersonating()))`, como `(common)/(pages)/page.tsx:17`.

#### 5.2 Dados

`apps/app/shared/lib/queryKeys.ts` ganha:

```ts
boards: {
    all: ["boards"] as const,
    list: () => [...queryKeys.boards.all, "list"] as const,
    detail: (id: string) => [...queryKeys.boards.all, "detail", id] as const,
    repositories: () => [...queryKeys.boards.all, "repositories"] as const,
    preview: (repository: string) =>
        [...queryKeys.boards.all, "preview", repository] as const,
},
```

Hooks em `boards/(hooks)/`:

| Arquivo | Conteúdo |
|---------|----------|
| `useListBoards.tsx` | `fetchBoardsList` + `useListBoards` (`useAuthorizedQuery`, sem infinite: a API não pagina) |
| `useFindBoardById.tsx` | `findBoardById(id)` devolvendo `undefined` sem id + `useFindBoardById`, `enabled: Boolean(id)` |
| `useListImportableRepositories.tsx` | `fetchImportableRepositories` + hook |
| `usePreviewBoardImport.tsx` | `fetchBoardImportPreview(repository)` + hook com `enabled: Boolean(repository)`, `staleTime: 0`; "Ler de novo" chama `refetch` |
| `useBoardCrud.tsx` | `create` (invalida `boards.list` e `boards.repositories`, navega para `/boards/[id]/settings`) e `reload` (grava o board atualizado com `setQueryData` em `detail` quando `updated`, invalida `list`, devolve o resultado para a tela) |

Erro sempre por `handleClientError(new FormattedError(error, locale))` + `errorAlert`
(`useEntityCrud.tsx:42-43`). Em `BOARD_CONFIG_INVALID`/`BOARD_CONFIG_NOT_FOUND` no create, o hook também
chama `refetch` do preview para a tela mostrar o estado novo do arquivo.

#### 5.3 Telas, componentes e estados

Componentes em `boards/(components)/`. Primitivos do `@repo/design-system` conforme a tabela de
equivalência de `docs/design/README.md`.

**`BoardsListClient` (Boards.png, MBoards.png)**

- Cabeçalho: título "Meus boards", subtítulo "Um board por repositório. Seu papel em cada um nunca passa da
  sua permissão no GitHub.", botão "Novo board" (`button.tsx`, ícone `+`; no celular só o ícone, com
  `aria-label`).
- Grade de `BoardCard` (`card.tsx`): nome, selo "Dono" (`badge.tsx` `secondary`), `owner/name` em texto
  secundário, linha "N etapas · lido de `main` em `3f2a9c1`" (sha em mono, 7 caracteres). O card inteiro é
  link para `/boards/[id]` (que redireciona para settings). Três colunas no desktop, uma no celular.
- Vazio: `BoardsFirstAccess` (BoardsEmpty.png) com `empty.tsx` e três passos: (1) "Instale o GitHub App do
  board", só com o texto, sem o botão "Instalar no GitHub" (não há URL de instalação configurada); (2) "Aplique o kit no repositório" com
  o comando `node kit/apply.mjs ../meu-repositorio` em mono e botão "Copiar"; (3) "Crie o board" com botão
  "Novo board" sempre habilitado (o estado "Libera depois do passo 1" depende de saber se o App está
  instalado, e isso custa uma listagem; ver perguntas). A faixa "Foi convidado para um board?" fica fora
  (convites são `board-members`).
- Carregando: `loading.tsx` com skeleton de três cards. Erro: `Container` com `loadError`.

**`NewBoardClient` (NewBoard.png)**

Layout de duas colunas no desktop (passos à esquerda, conteúdo à direita); no celular os passos viram uma
linha "Passo 1 de 2" acima do conteúdo. Estado local `selectedRepository` (string `owner/name`), refletido em
`?repository=` na URL para o "voltar" do navegador funcionar e para o `/test` abrir direto um estado.

- **Passo 1, Repositório** (sem tela no canvas; segue o card de repositório do passo 2): `RepositoryPicker`
  lista `ImportableRepositoryDTO` como linhas `item.tsx` com ícone do GitHub, `owner/name`, selo "Privado"
  quando `private`, e ação: "Escolher" (`boardId === null`), "Abrir board" (link, seu board) ou selo "Já tem
  board" desabilitado (`taken`). Texto lateral: "O repositório precisa ter o kit aplicado:
  `.kanban/board.yml` na branch base." Estados: carregando (skeleton de linhas), lista vazia ("Nenhum
  repositório em que você é admin tem o GitHub App instalado."), erro traduzido por `error.code` num
  `alert.tsx` (inclui `GITHUB_APP_NOT_CONFIGURED` e `BOARD_GITHUB_ACCOUNT_REQUIRED`). Não é formulário RHF:
  não há campo de texto, só a escolha de uma linha.
- **Passo 2, Ler o board.yml**: título e subtítulo da tela. `RepositorySummary` (card com `owner/name`,
  "GitHub App instalado · você é admin no repositório · vira dono do board" e "Trocar repositório", que limpa
  a seleção). `BoardConfigFileCard`: `.kanban/board.yml`, "em `main` · commit `3f2a9c1`", selo "N erro(s)"
  (`badge` `destructive`) quando inválido, a lista `BoardConfigIssues` e os botões "Ler de novo" (refetch,
  com spinner) e "Abrir o arquivo no GitHub" (link `https://github.com/<owner>/<name>/blob/<ref>/.kanban/board.yml`,
  montado no app a partir de dados do DTO).
  - `BoardConfigIssues`: um bloco por issue com ícone de alerta, o caminho em mono e a frase traduzida por
    `rule` com os `params` (ex.: "A etapa **Testando** devolve o card para `deploy`, que não existe antes
    dela. Aponte para uma etapa anterior, como `develop`.").
  - `missing`: no lugar da lista, "Este repositório ainda não tem `.kanban/board.yml` na branch `main`.
    Aplique o kit e leia de novo." com os mesmos botões.
  - `BoardColumnsPreview` ("Colunas que o board vai montar"): "Tarefas" (Specs `readyStatus` de
    `backlog.index`), uma por etapa (`column`, `command · model · esforço`, "Aprovação do plano: opcional"
    quando `approval !== "none"`, "Retrabalho volta para <coluna>", "Cada comentário roda `/mediate`" quando
    `onPrComment`) e "Concluído" ("Quando a PR é mergeada"). Com o arquivo inválido, a prévia usa o objeto
    cru quando o YAML for legível: a etapa com issue fica com borda `destructive`, ícone e o texto curto do
    erro; quando nem o YAML é legível, a seção some. O preview devolve `rawStages` para isso (seção 10.1).
  - `BoardRulesSummary` ("Regras do repositório"): branch base, branch de cada card, voltas de retrabalho
    ("até 2, depois para e pergunta"), turnos por etapa, branches protegidas, preparo do ambiente
    (`environment.setupScript` ou "—"). Só com `status: "valid"`.
  - Rodapé: "Cancelar" (volta para `/boards`), texto "Corrija o erro para continuar" quando inválido ou
    ausente, botão "Criar board" desabilitado fora de `valid` e durante `isPending` (sem duplo envio). O
    texto do canvas é "Continuar para executores"; muda porque os passos 3 e 4 estão fora.

**`BoardSettingsClient` (Settings.png, aba Etapas)**

- Título "Configuração" e subtítulo "Colunas, comandos e modelos vêm do board.yml do repositório."; sem as
  outras abas (o `tabs.tsx` entra quando a segunda aba existir).
- Card do arquivo: "`.kanban/board.yml`", "Lido de `main` em `55be30c`, 25/11 às 14:02." e o botão
  "Recarregar configuração" (`isPending` bloqueia).
- `BoardStagesTable`: `Table` do design system com as colunas Coluna, Comando e agente, Modelo, Onde roda
  ("local, nuvem", "só local"), Retrabalho volta para (nome da coluna ou "—") e Aprovação ("Opcional",
  "Sempre", "Não exige"). Sem `searchFields` (poucas linhas); `onRefresh` não se aplica porque o recarregar
  é outra ação.
- `BoardReloadResult` (`alert.tsx` acima da tabela, até a próxima ação): `unchanged` → "Nada mudou desde a
  última leitura (`55be30c`)."; `updated` → "Configuração atualizada para `a1b2c3d`." e a lista de mudanças
  ("Coluna nova: Deploy", "Coluna removida: Testando", "Revisando: modelo, retrabalho", "Ordem das colunas
  mudou"); `invalid` → "O arquivo tem erros; o board segue com a configuração anterior." + `BoardConfigIssues`;
  `missing` → frase equivalente.

#### 5.4 i18n e a11y

Toda string acima vem do dicionário (árvore na seção 10.6). `aria-label` no botão "+" do celular, no
"Copiar" e no ícone de alerta; os blocos de issue usam `role="alert"` só no primeiro render do resultado
(evita leitura repetida a cada refetch).

### 6. Autorização e segurança

| Regra | Onde |
|-------|------|
| Sessão | `proxy.ts` do app + `requireCommonPanelApi` |
| Board é da pessoa | `findOwnedBy` em `GET /boards/[id]` e `reload`; 404 para board alheio |
| Importar/recarregar exige `admin` no GitHub | `resolveImportTarget` com `getCollaboratorRole` pelo `github.login` do perfil |
| Lista de repositórios não vaza repositório alheio | filtro por papel `admin` na 4.3 |
| `installationId` não vem do cliente | resolvido pela listagem da instalação |
| Personificação | leituras abertas; `POST` recusado pelo guard |

**Fronteira com `board-members`:** esta spec não cria `members` nem um guard de board. Leitura de board
continua por dono (`ownerUserId`), como o DECISIONS:133 prevê até lá, e a permissão no GitHub só é consultada
nas ações que precisam de `admin` (importar e recarregar). A `board-members` troca o `findOwnedBy` por um
guard que resolve `resolveEffectiveRole` em toda rota de board, cria o membro `owner` de cada board existente
a partir de `ownerUserId`/`ownerGithubId` e passa a revalidar a permissão ao abrir o board. Abrir um board
aqui não consulta o GitHub: quem perdeu o acesso ao repositório ainda vê o snapshot até a `board-members`.

**Conteúdo do arquivo é dado:** o `board.yml` só passa por `parseDocument` + Zod; nada dele é executado nem
interpolado em HTML (o React escapa). O link "Abrir no GitHub" é montado com `encodeURIComponent` em cada
parte. O `board.yml` lido não vai para log.

**Rate limit:** as rotas novas ficam no limite padrão de 60/min por endereço (`apps/api/proxy.ts`). O custo
real é no GitHub: a listagem faz uma chamada por página de repositórios mais uma por repositório (papel, com
cache de 5 min). Ver riscos.

### 7. Testes

Todos unitários (Vitest), na pasta plana de cada workspace. Nenhum exige emulador.

| Teste | Nível | Prova |
|-------|-------|-------|
| `packages/kanban-contract/__tests__/boardConfigYaml.test.ts` | unit | YAML do kit (com comentários) vira objeto válido; sintaxe quebrada → `yaml_syntax` com linha; raiz lista → `root_not_mapping`; chave duplicada → `yaml_syntax`; alias em cascata acima do limite é recusado |
| `packages/kanban-contract/__tests__/boardConfigIssues.test.ts` | unit | Cada `rule` da tabela, com o `path` no formato `stages[2].onRework`; `rework_target_invalid` traz `stageColumn`, `target` e `suggestion` |
| `packages/kanban-contract/__tests__/boardConfigDiff.test.ts` | unit | added, removed, changed (por campo), moved, e nada quando iguais |
| `apps/api/__tests__/githubFakeClient.test.ts` (acréscimo) | unit | `parseBoardConfigYaml(yml)` dos exemplos é deep-equal a `SAMPLE_BOARD_CONFIGS.valid` depois do schema, e o inválido falha só em `stages[2].onRework` (o teste que a `github-app-integration` deixou para cá) |
| `apps/api/__tests__/boardMapper.test.ts` | unit | `Timestamp` → ISO em `createdAt` e `configSource.readAt`; whitelist do `toPersistence` |
| `apps/api/__tests__/boardsRepositoriesRoute.test.ts` | rota com `vi.mock` do guard, do repositório e de `getGithubClient` | só repositórios `admin`; `boardId`/`taken`; 503 sem App; 403 sem `github` |
| `apps/api/__tests__/boardsPreviewRoute.test.ts` | idem | `valid`/`invalid`/`missing`; query inválida → 400; `none` → 404; `write` → 403; `GithubApiError` → código do GitHub |
| `apps/api/__tests__/boardsCreateRoute.test.ts` | idem | 201 com dono e sha; 409 em `ALREADY_EXISTS`; 422 inválido e ausente; o `installationId` gravado vem da listagem, não do body; personificação → 403 |
| `apps/api/__tests__/boardsReloadRoute.test.ts` | idem | `unchanged` não grava; `updated` grava e devolve `changes`; `invalid` não grava; board alheio → 404 |
| `apps/api/__tests__/boardsListRoute.test.ts` | idem | só os da pessoa, ordenados por `createdAt` desc; `GET /boards/[id]` alheio → 404 |
| `apps/app/__tests__/boardConfigIssueMessage.test.ts` | unit | Cada `rule` vira a frase do dicionário com os `params` (e `other` cai na frase genérica) |
| `apps/app/__tests__/useBoardCrud.test.tsx` | hook | create invalida lista e repositórios; reload `updated` faz `setQueryData` no detalhe; erro chama `errorAlert` |
| `apps/api/__tests__/apiErrorCodesTranslated.test.ts` | existente | cobra os seis códigos novos em `apiErrors` |

Nenhum teste com emulador: a consulta da lista só usa igualdades (sem índice composto) e o `create` com id
fixo já tem precedente coberto em `notification.repository`.

### 8. O que o `/test` vai percorrer

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`. Sem variáveis do App, a API entra no modo `fake`
(`github-app-config.ts:37-44`) e lista `agent-board-demo/{sample-app,invalid-config,no-kanban}`. Entrar com
**GitHub pelo popup do emulador** (screen name no formato de login; roteiro em `docs/SETUP.md:402`): o
cliente falso responde `admin` para qualquer login (`github-fake-client.ts:80-90`).

| # | Fluxo | Resultado esperado |
|---|-------|--------------------|
| F1 | `/boards` sem board | Tela de primeiro acesso com os três passos; "Novo board" leva a `/boards/new` |
| F2 | Novo board → `sample-app` | Passo 2 sem erros, prévia com Tarefas, Análise, Executando, Revisando, Testando, Concluído; regras do repositório; "Criar board" → `/boards/agent-board-demo--sample-app/settings` |
| F3 | Novo board → `invalid-config` | Selo "1 erro", issue `stages[2].onRework` com "A etapa Revisando devolve o card para deploy…", coluna Revisando com borda de erro, "Criar board" desabilitado |
| F4 | Novo board → `no-kanban` | Mensagem de arquivo ausente, "Criar board" desabilitado |
| F5 | `/boards` com o board | Card "sample-app", selo Dono, `agent-board-demo/sample-app`, "4 etapas · lido de main em <sha7>" |
| F6 | Picker depois de importar | `sample-app` com "Abrir board"; tentar `/boards/new?repository=agent-board-demo/sample-app` mostra o aviso de que já tem board e não cria outro |
| F7 | Configuração → "Recarregar configuração" | "Nada mudou desde a última leitura" (o falso é estático) |
| F8 | Recarga com mudança | No emulador, editar o documento `board/agent-board-demo--sample-app`: remover a etapa `test` de `config.stages` e trocar `configSource.sha`. Recarregar → "Coluna nova: Testando" e o sha volta ao do arquivo |
| F9 | Conta de senha do seed (`user@example.com`) em `/boards/new` | Alerta traduzido de `BOARD_GITHUB_ACCOUNT_REQUIRED`, sem 500 |
| F10 | Board de outra pessoa | Com a segunda conta GitHub, abrir `/boards/agent-board-demo--sample-app/settings` → tela de não encontrado (`BOARD_NOT_FOUND`); no picker, `sample-app` aparece como "Já tem board" |
| F11 | Admin personificando a conta GitHub | `/boards` e settings abrem; "Criar board"/"Recarregar" mostram o erro de somente leitura |

Temas e tamanhos: F1, F2, F3 e F5 em claro, escuro e 390 px. Comparar com `Boards.png`, `MBoards.png`,
`BoardsEmpty.png`, `NewBoard.png` e `Settings.png` (aba Etapas), anotando as diferenças previstas (cards sem
distribuição, assistente com 2 passos, sem abas).

**Sem App fora do emulador** (modo `off`): não dá para subir a API fora do emulador sem projeto real, então
o 503 `GITHUB_APP_NOT_CONFIGURED` → estado traduzido no picker fica provado no teste de rota e no hook. 🔒
em runtime.

**Não observável sem infra:** repositório real, permissão real abaixo de `admin` (o falso sempre responde
`admin`; coberto por teste de rota) e cota do GitHub. 🔒, item 5 do `docs/PRE-PRODUCTION.md`.

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Primeiro acesso mostra os três passos e o caminho para "Novo board".
2. A lista de repositórios só traz os da instalação em que a pessoa é `admin`, com o estado de board de
   cada um.
3. Arquivo válido mostra a prévia das colunas e as regras; "Criar board" cria e leva à configuração.
4. Arquivo inválido mostra cada erro com o caminho e a frase do campo; criar fica bloqueado na tela e na API
   (422 `BOARD_CONFIG_INVALID`).
5. Arquivo ausente mostra o que fazer; a API responde 422 `BOARD_CONFIG_NOT_FOUND`.
6. Um repositório tem um board só: duplo clique e segunda tentativa → 409 `BOARD_ALREADY_EXISTS`, sem
   segundo documento.
7. O board guarda repositório, snapshot com defaults, sha e quem criou; o `installationId` vem da API.
8. Recarregar mostra "nada mudou", as mudanças por coluna, ou os erros mantendo a configuração anterior.
9. A lista mostra só os boards da pessoa; board alheio responde 404.
10. Conta sem GitHub, App ausente, repositório inacessível e papel insuficiente respondem com `error.code`
    traduzido, nunca 500.
11. Personificação lê e não escreve.
12. Claro, escuro e 390 px sem rolagem horizontal.

## Etapa 2: blueprint técnico

### 10.1 Contrato (SDK)

`packages/sdk/src/types/board/board.ts`:

```ts
import type {
    BoardConfig,
    BoardConfigIssue,
    BoardStagesDiff,
    GithubRepoRole,
    StageConfig,
} from "@repo/kanban-contract";

export type BoardRepositoryDTO = {
    installationId: number;
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
};

export type BoardConfigSourceDTO = {
    path: string;
    ref: string;
    sha: string;
    readAt: string;
};

export type BoardDTO = {
    id: string;
    ownerUserId: string;
    ownerGithubId: string;
    name: string;
    repository: BoardRepositoryDTO;
    config: BoardConfig;
    configSource: BoardConfigSourceDTO;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

/** `taken`: the repository already has a board that belongs to someone else. */
export type RepositoryBoardLink = { boardId: string } | "taken" | null;

export type ImportableRepositoryDTO = BoardRepositoryDTO & {
    board: RepositoryBoardLink;
};

export type BoardConfigFileStatus = "valid" | "invalid" | "missing";

export type BoardImportPreviewDTO = {
    repository: BoardRepositoryDTO;
    githubRole: GithubRepoRole;
    board: RepositoryBoardLink;
    status: BoardConfigFileStatus;
    file: { path: string; ref: string; sha: string } | null;
    config: BoardConfig | null;
    /** Stages as written in the file, for the column preview when the schema fails. */
    rawStages: Partial<StageConfig>[] | null;
    issues: BoardConfigIssue[];
};

export type CreateBoardRequest = { repository: string };

export type BoardReloadOutcome = "unchanged" | "updated" | "invalid" | "missing";

export type BoardReloadResultDTO = {
    outcome: BoardReloadOutcome;
    board: BoardDTO;
    changes: BoardStagesDiff | null;
    issues: BoardConfigIssue[];
};
```

`packages/sdk/src/actions/board/action.ts` (`BoardActions`, mesmo molde de `EntityActions`):

```ts
list(): Promise<BoardDTO[]>                                   // GET  /boards
findById(id: string): Promise<BoardDTO>                       // GET  /boards/:id
listRepositories(): Promise<ImportableRepositoryDTO[]>        // GET  /boards/repositories
preview(repository: string): Promise<BoardImportPreviewDTO>   // GET  /boards/preview?repository=
create(body: CreateBoardRequest): Promise<BoardDTO>           // POST /boards
reload(id: string): Promise<BoardReloadResultDTO>             // POST /boards/:id/reload
```

Registrar `board!: BoardActions` em `Client` e exportar os tipos em `packages/sdk/src/types/index.ts`.

### 10.2 Contrato do domínio (`@repo/kanban-contract`)

```ts
// src/boardConfigIssues.ts
export const BOARD_CONFIG_ISSUE_RULES = [
    "required", "wrong_type", "too_small", "too_big", "bad_format", "not_allowed",
    "stage_key_duplicated", "rework_target_invalid", "base_branch_unprotected",
    "yaml_syntax", "root_not_mapping", "other",
] as const;
export type BoardConfigIssueRule = (typeof BOARD_CONFIG_ISSUE_RULES)[number];
export type BoardConfigIssue = {
    path: string;                       // "stages[2].onRework", "" for the whole file
    rule: BoardConfigIssueRule;
    params: Record<string, string | number | string[]>;
};
export function formatIssuePath(path: PropertyKey[]): string;
export function toBoardConfigIssues(error: z.ZodError, input: unknown): BoardConfigIssue[];

// src/boardConfigDiff.ts
export type StageField = "column" | "command" | "agent" | "model" | "effort"
    | "runners" | "approval" | "onRework" | "onPrComment";
export type BoardStagesDiff = {
    added: { key: string; column: string }[];
    removed: { key: string; column: string }[];
    changed: { key: string; column: string; fields: StageField[] }[];
    moved: boolean;
};
export function diffBoardStages(before: StageConfig[], after: StageConfig[]): BoardStagesDiff;

// src/boardConfigYaml.ts (subpath export "./board-config-yaml")
export type BoardConfigYamlResult =
    | { ok: true; config: BoardConfig }
    | { ok: false; issues: BoardConfigIssue[]; raw: unknown | null };
export function parseBoardConfigYaml(text: string): BoardConfigYamlResult;
```

`package.json` do contrato: `"yaml": "2.9.1"` em `dependencies` e
`"exports": { ".": "./src/index.ts", "./board-config-yaml": "./src/boardConfigYaml.ts" }`. A `apps/api` já
depende do contrato (`apps/api/package.json:18`). `boardConfigIssues.ts` e `boardConfigDiff.ts` entram no
barril `src/index.ts` (só Zod, sem `yaml`).

Pseudo-diff de `boardConfig.ts` (só os três `addIssue`):

```diff
 ctx.addIssue({
     code: "custom",
     message: `Duplicated stage key "${key}"`,
     path: ["stages", index, "key"],
+    params: { rule: "stage_key_duplicated" },
 });
```

(idem com `rework_target_invalid` e `base_branch_unprotected`).

### 10.3 Rotas (esqueletos)

`apps/api/app/(routes)/boards/preview/route.ts`:

```ts
export const GET = requireCommonPanelApi(async (req, ctx) => {
    const query = parseBoardPreviewQuery(req);
    if (!query.ok) return query.response;

    const target = await resolveImportTarget(ctx.subjectProfile, query.value.repository);
    if (!target.ok) return target.response;

    const board = await boardRepository.linkFor(target.repository.fullName, ctx.subjectProfile.id);
    return Response.json({ data: toPreviewDTO(target, board) });
});
```

`apps/api/(shared)/lib/board-import.ts`:

```ts
type ImportTarget =
    | { ok: false; response: Response }
    | {
          ok: true;
          client: GithubClient;
          repository: GithubRepository;
          githubRole: GithubRepoRole;
          file: GithubFile | null;
          parsed: BoardConfigYamlResult | null; // null when the file is missing
      };

export async function resolveImportTarget(profile: UserDTO, fullName: string): Promise<ImportTarget>;
export function boardIdForRepository(fullName: string): string;
export async function listImportableRepositories(profile: UserDTO): Promise<...>;
```

O `try/catch` de `GithubApiError` fica dentro de `resolveImportTarget` e de
`listImportableRepositories`, com `githubErrorResponse(error) ?? rethrow`.

`apps/api/app/(routes)/boards/route.ts`: `GET` (lista) e `POST` (create).
`apps/api/app/(routes)/boards/repositories/route.ts`: `GET`.
`apps/api/app/(routes)/boards/[id]/route.ts`: `GET` com `requireCommonPanelApi<RouteIdParamsContext>` +
`resolveIdFromContext`.
`apps/api/app/(routes)/boards/[id]/reload/route.ts`: `POST`.

### 10.4 Payloads de exemplo

`GET /boards/preview?repository=agent-board-demo/invalid-config` → 200:

```json
{
  "data": {
    "repository": { "installationId": 1, "owner": "agent-board-demo", "name": "invalid-config", "fullName": "agent-board-demo/invalid-config", "defaultBranch": "main", "private": true },
    "githubRole": "admin",
    "board": null,
    "status": "invalid",
    "file": { "path": ".kanban/board.yml", "ref": "main", "sha": "<blob sha>" },
    "config": null,
    "rawStages": [
      { "key": "analyze", "column": "Análise", "command": "/analyze" },
      { "key": "develop", "column": "Executando", "command": "/develop" },
      { "key": "review", "column": "Revisando", "command": "/review", "onRework": "deploy" }
    ],
    "issues": [
      { "path": "stages[2].onRework", "rule": "rework_target_invalid", "params": { "stageColumn": "Revisando", "target": "deploy", "suggestion": "develop" } }
    ]
  }
}
```

`POST /boards` `{ "repository": "agent-board-demo/sample-app" }` → 201 `{ "data": BoardDTO }` com
`id: "agent-board-demo--sample-app"`.

`POST /boards/agent-board-demo--sample-app/reload` → 200:

```json
{ "data": { "outcome": "updated", "board": { "...": "..." }, "changes": { "added": [{ "key": "test", "column": "Testando" }], "removed": [], "changed": [], "moved": false }, "issues": [] } }
```

### 10.5 Tabela `error.code` → status

| Código | Status |
|--------|--------|
| `VALIDATION_FAILED` | 400 |
| `BOARD_GITHUB_ACCOUNT_REQUIRED` | 403 |
| `BOARD_IMPORT_FORBIDDEN` | 403 |
| `AUTH_REQUEST_IMPERSONATION_READ_ONLY` | 403 |
| `BOARD_NOT_FOUND` | 404 |
| `GITHUB_REPOSITORY_NOT_ACCESSIBLE` | 404 |
| `BOARD_ALREADY_EXISTS` | 409 |
| `BOARD_CONFIG_NOT_FOUND` | 422 |
| `BOARD_CONFIG_INVALID` | 422 |
| `GITHUB_UNAVAILABLE` | 502 |
| `GITHUB_APP_NOT_CONFIGURED` | 503 |
| `GITHUB_RATE_LIMITED` | 503 |

### 10.6 Documento no Firestore

```
board/agent-board-demo--sample-app
{
  ownerUserId: "<profile id>",
  ownerGithubId: "8576793069196242191482356285384711342080",
  name: "sample-app",
  repository: { installationId: 1, owner: "agent-board-demo", name: "sample-app",
                fullName: "agent-board-demo/sample-app", defaultBranch: "main", private: false },
  config: { version: 1, name: "sample-app", baseBranch: "main", ..., stages: [...], limits: {...}, environment: {} },
  configSource: { path: ".kanban/board.yml", ref: "main", sha: "<blob sha>", readAt: Timestamp },
  createdAt: Timestamp, updatedAt: Timestamp, deletedAt: null
}
```

O `config` gravado é a saída do `parseBoardConfig` (com defaults). As chaves opcionais ausentes (`agent`,
`onRework`, `onPrComment`, `environment.install`) chegam como `undefined`, e o Firestore recusa `undefined`
num `create`. Nenhum ponto do repo liga `ignoreUndefinedProperties` (`grep` em `apps/api/(shared)/infra` e
`packages/auth` sem resultado), então o `toPersistence` do mapper remove essas chaves em profundidade antes
de gravar. O teste do mapper cobre.

### 10.7 Árvore de arquivos

```
packages/kanban-contract/
  package.json                                   (yaml 2.9.1, subpath export)
  src/boardConfig.ts                             (params.rule nos 3 addIssue)
  src/boardConfigIssues.ts                       novo
  src/boardConfigDiff.ts                         novo
  src/boardConfigYaml.ts                         novo
  src/index.ts                                   (+ issues, diff)
  __tests__/boardConfigYaml.test.ts              novo
  __tests__/boardConfigIssues.test.ts            novo
  __tests__/boardConfigDiff.test.ts              novo
packages/sdk/src/
  types/board/{board.ts,index.ts}                novo
  types/index.ts                                 (+ board)
  actions/board/action.ts                        novo
  client/index.ts                                (+ board)
apps/api/
  (shared)/lib/board-import.ts                   novo
  (shared)/repositories/board.repository.ts      novo
  (shared)/mappers/board.mapper.ts               novo
  (shared)/validation/board.schema.ts            novo
  app/(routes)/boards/route.ts                   novo (GET, POST)
  app/(routes)/boards/repositories/route.ts      novo
  app/(routes)/boards/preview/route.ts           novo
  app/(routes)/boards/[id]/route.ts              novo
  app/(routes)/boards/[id]/reload/route.ts       novo
  __tests__/board*.test.ts, boards*Route.test.ts novos; githubFakeClient.test.ts (+1 caso)
apps/app/
  shared/lib/queryKeys.ts                        (+ boards)
  app/[locale]/(authenticated)/(common)/paths.ts  (+ boards)
  app/[locale]/(authenticated)/(common)/routes.tsx (+ item Boards)
  app/[locale]/(authenticated)/(common)/(pages)/boards/
    (components)/BoardCard.tsx
    (components)/BoardsFirstAccess.tsx
    (components)/RepositoryPicker.tsx
    (components)/RepositorySummary.tsx
    (components)/BoardConfigFileCard.tsx
    (components)/BoardConfigIssues.tsx
    (components)/BoardColumnsPreview.tsx
    (components)/BoardRulesSummary.tsx
    (components)/BoardStagesTable.tsx
    (components)/BoardReloadResult.tsx
    (components)/boardConfigIssueMessage.ts      (rule + params → texto do dicionário)
    (hooks)/useListBoards.tsx
    (hooks)/useFindBoardById.tsx
    (hooks)/useListImportableRepositories.tsx
    (hooks)/usePreviewBoardImport.tsx
    (hooks)/useBoardCrud.tsx
    (pages)/(home)/{page.tsx,BoardsListClient.tsx,loading.tsx}
    (pages)/new/{page.tsx,NewBoardClient.tsx}
    (pages)/[id]/page.tsx                        (redirect)
    (pages)/[id]/settings/{page.tsx,BoardSettingsClient.tsx,loading.tsx}
  __tests__/boardConfigIssueMessage.test.ts, useBoardCrud.test.tsx
packages/internationalization/translations/
  apps/app/pages/common/boards.ts                novo
  apps/app/pages/common/index.ts                 (+ boards)
  apps/app/pages/common/routes/index.ts          (+ platform.boards)
  packages/shared/utils.ts                       (+ 6 apiErrors)
```

### 10.8 Chaves de i18n (pt-br)

```
apps.app.pages.common.routes.platform.boards: { list: "Boards", create: "Novo board", settings: "Configuração" }

apps.app.pages.common.boards:
  list:
    title: "Meus boards"
    subtitle: "Um board por repositório. Seu papel em cada um nunca passa da sua permissão no GitHub."
    newBoard: "Novo board"
    newBoardAria: "Criar um board"
    ownerBadge: "Dono"
    stagesCount: "{count} etapas"
    readFrom: "lido de {ref} em {sha}"
  firstAccess:
    title: "Comece pelo seu primeiro board"
    subtitle: "Cada board aponta para um repositório do GitHub. São três passos: os dois primeiros acontecem no GitHub e no repositório, o último aqui."
    installApp: { title: "Instale o GitHub App do board", body: "Ele deixa o board ler o board.yml e as specs, conferir a permissão de cada membro e abrir as PRs. Instale na sua conta ou na organização, escolhendo os repositórios." }
    applyKit: { title: "Aplique o kit no repositório", body: "O kit cria o .kanban/board.yml e a regra do modo board. Rode numa branch de feature, revise e abra a PR.", command: "node kit/apply.mjs ../meu-repositorio", copy: "Copiar", copied: "Copiado" }
    createBoard: { title: "Crie o board", body: "Escolha o repositório. O board lê o board.yml na branch base, mostra o que estiver errado e monta as colunas.", action: "Novo board" }
  wizard:
    steps: { repository: "Repositório", readConfig: "Ler o board.yml", progress: "Passo {current} de {total}" }
    kitHint: "O repositório precisa ter o kit aplicado: .kanban/board.yml na branch base."
    repository:
      title: "Escolha o repositório"
      subtitle: "Aparecem os repositórios com o GitHub App instalado em que você é admin."
      choose: "Escolher"
      openBoard: "Abrir board"
      taken: "Já tem board"
      private: "Privado"
      empty: "Nenhum repositório em que você é admin tem o GitHub App instalado."
    readConfig:
      title: "Ler o board.yml"
      subtitle: "As colunas do board saem deste arquivo. Corrija o que estiver errado no repositório e leia de novo."
      repositoryLine: "GitHub App instalado · você é admin no repositório · vira dono do board"
      changeRepository: "Trocar repositório"
      fileAt: "em {ref} · commit {sha}"
      errorCount: { one: "1 erro", other: "{count} erros" }
      readAgain: "Ler de novo"
      openOnGithub: "Abrir o arquivo no GitHub"
      missing: "Este repositório ainda não tem .kanban/board.yml na branch {ref}. Aplique o kit e leia de novo."
      alreadyHasBoard: "Este repositório já tem um board."
    columns:
      title: "Colunas que o board vai montar"
      backlog: { title: "Tarefas", body: "Specs {status} de {index}" }
      done: { title: "Concluído", body: "Quando a PR é mergeada" }
      approvalOptional: "Aprovação do plano: opcional"
      approvalRequired: "Aprovação do plano: sempre"
      reworkTo: "Retrabalho volta para {column}"
      prComment: "Cada comentário roda {command}"
      stageError: "Esta etapa tem um erro"
    rules:
      title: "Regras do repositório"
      baseBranch: "Branch base"
      branchPattern: "Branch de cada card"
      reworkLoops: "Voltas de retrabalho"
      reworkLoopsValue: "até {count}, depois para e pergunta"
      turns: "Turnos por etapa"
      turnsValue: "até {count}"
      protectedBranches: "Branches protegidas"
      setup: "Preparo do ambiente"
      none: "—"
    footer: { cancel: "Cancelar", fixToContinue: "Corrija o erro para continuar", create: "Criar board" }
  effort: { low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" }
  runners: { local: "local", cloud: "nuvem", "github-actions": "GitHub Actions", onlyLocal: "só local" }
  approval: { none: "Não exige", optional: "Opcional", required: "Sempre" }
  issues:
    required: "O campo é obrigatório."
    wrong_type: "O valor tem o tipo errado."
    too_small: "O valor é menor que o mínimo ({minimum})."
    too_big: "O valor é maior que o máximo ({maximum})."
    bad_format: "O valor não está no formato esperado."
    not_allowed: "Valor não permitido. Use um destes: {allowed}."
    stage_key_duplicated: "A chave {key} aparece em mais de uma etapa."
    rework_target_invalid: "A etapa {stageColumn} devolve o card para {target}, que não existe antes dela. Aponte para uma etapa anterior, como {suggestion}."
    rework_target_invalid_no_suggestion: "A etapa {stageColumn} devolve o card para {target}, que não existe antes dela."
    base_branch_unprotected: "A branch base {baseBranch} precisa estar em protectedBranches."
    yaml_syntax: "O arquivo não é um YAML válido (linha {line}, coluna {column})."
    root_not_mapping: "O arquivo precisa começar com as chaves do board (version, name, stages)."
    other: "O valor deste campo é inválido."
  settings:
    title: "Configuração"
    subtitle: "Colunas, comandos e modelos vêm do board.yml do repositório."
    readAt: "Lido de {ref} em {sha}, {date}."
    reload: "Recarregar configuração"
    table: { column: "Coluna", commandAndAgent: "Comando e agente", model: "Modelo", runners: "Onde roda", reworkTo: "Retrabalho volta para", approval: "Aprovação" }
    reloadResult:
      unchanged: "Nada mudou desde a última leitura ({sha})."
      updated: "Configuração atualizada para {sha}."
      invalid: "O arquivo tem erros; o board segue com a configuração anterior."
      missing: "O arquivo .kanban/board.yml sumiu da branch {ref}; o board segue com a configuração anterior."
      added: "Coluna nova: {column}"
      removed: "Coluna removida: {column}"
      changed: "{column}: {fields}"
      moved: "A ordem das colunas mudou"
      fields: { column: "título", command: "comando", agent: "agente", model: "modelo", effort: "esforço", runners: "onde roda", approval: "aprovação", onRework: "retrabalho", onPrComment: "comentário de PR" }

packages.shared.utils.apiErrors (+):
  BOARD_NOT_FOUND: "Board não encontrado."
  BOARD_ALREADY_EXISTS: "Este repositório já tem um board."
  BOARD_CONFIG_NOT_FOUND: "O repositório não tem .kanban/board.yml na branch padrão."
  BOARD_CONFIG_INVALID: "O .kanban/board.yml tem erros. Corrija no repositório e leia de novo."
  BOARD_IMPORT_FORBIDDEN: "Só quem é admin no repositório do GitHub pode criar ou recarregar o board."
  BOARD_GITHUB_ACCOUNT_REQUIRED: "Entre com a sua conta do GitHub para criar um board."
```

Formato exato da pluralização e da interpolação: seguir o que `entities.ts` já usa (o `/develop` confere
antes de criar a forma `{ one, other }`; se o dicionário não tiver plural, usa duas chaves).

### 10.9 Ordem de implementação e commits

1. `packages/kanban-contract`: `yaml`, issues, diff, `params.rule` e testes →
   `feat(kanban-contract): parse board.yml text and map validation issues`.
2. `packages/sdk`: tipos e `BoardActions` → `feat(sdk): add boards resource`.
3. `apps/api`, em dois commits: (a) repositório, mapper, schema, `board-import.ts` e o teste do falso;
   (b) rotas e testes de rota → `feat(api): ...`.
4. `apps/app`, em dois commits: (a) `queryKeys`, hooks e `boardConfigIssueMessage`; (b) páginas,
   componentes, rotas e sidebar.
5. `packages/internationalization`: dicionário e `apiErrors` → `feat(internationalization): ...`.
6. `docs(features): board-import`.

O `pnpm install` depois do passo 1 só liga `yaml@2.9.1` como dependência direta do contrato; o lockfile
ganha a linha do importer e nenhum pacote novo.

### 10.10 Env e configuração

Nenhuma variável nova. Nenhum índice composto. Nenhuma mudança em `firestore.rules`.

## Pré-requisitos manuais de infra

Nada novo além do que as duas specs anteriores já registraram em `docs/PRE-PRODUCTION.md`:

- **Item 5 (GitHub App do board):** criar o App, instalar nos repositórios e preencher `GITHUB_APP_ID` e
  `GITHUB_APP_PRIVATE_KEY`. Sem isso, a tela "Novo board" mostra o estado traduzido de
  `GITHUB_APP_NOT_CONFIGURED` fora do emulador.
- **Item 4 (login com GitHub):** sem ele ninguém tem `github.login` em produção e a importação responde
  `BOARD_GITHUB_ACCOUNT_REQUIRED`.
- **Item 2 (rules e índices):** nada a publicar por esta spec. Se a lista de boards passar a paginar, o índice
  `board: ownerUserId ASC, deletedAt ASC, createdAt DESC` entra no `firestore.indexes.json` e neste item.
- **Kit aplicado no repositório alvo** (`node kit/apply.mjs`), para o sinal de pronto "o next-boilerplate
  vira um board". Fora do emulador e depende do App.

O `/develop` acrescenta ao `docs/PRE-PRODUCTION.md`, na seção "Pendências registradas pelo pipeline", uma
linha dizendo que o sinal de pronto com repositório real fica 🔒 até os itens 4 e 5.

## Riscos

| # | Risco | Mitigação |
|---|-------|-----------|
| R1 | Listagem de repositórios custa 1 chamada por página + 1 por repositório no GitHub (papel). Com dezenas de repositórios, a primeira abertura do picker fica lenta e consome cota | Cache de papel de 5 min, concorrência de 8, e o picker só carrega em `/boards/new`. Se medir lento, cachear a listagem da instalação por alguns minutos (fora deste corte) |
| R2 | Ler na branch padrão quando o `board.yml` declara outro `baseBranch` | Decisão registrada; a tela mostra de onde leu ("em `main`") |
| R3 | Snapshot divergindo do arquivo sem ninguém recarregar | Fora do corte; o webhook `push` não está entre os eventos do App (ACCESS.md). O sha na tela deixa a defasagem visível |
| R4 | Quem perdeu o acesso no GitHub ainda vê o board | Fronteira com `board-members` (seção 6) |
| R5 | `config` com `undefined` nas chaves opcionais quebra o `create` do Firestore | Mapper remove as chaves (10.6), com teste |
| R6 | Repositório renomeado: o id determinístico fica com o nome antigo; a recarga resolve pelo `fullName` guardado e falha com 404 | A recarga devolve `GITHUB_REPOSITORY_NOT_ACCESSIBLE` traduzido; resolver por id numérico do repositório fica para quando o cliente expuser o id |
| R7 | O cliente falso sempre responde `admin`: o 403 de papel insuficiente não aparece no `/test` | Coberto por teste de rota; 🔒 em runtime |

## Perguntas em aberto

Cada item traz a opção adotada pelo `/cycle` e o porquê.

1. **Onde mora o parse do YAML.** Opções: (a) `@repo/kanban-contract`, subpath `board-config-yaml`; (b)
   `apps/api/(shared)/lib`. **Adotada: (a).** Regra 12 (o `board.yml` é validado pelo contrato) e
   `cycle-policy.md` §2 permite pacote de contrato; o subpath mantém o `yaml` fora do bundle do app. Isso
   contraria o "Nenhum" da spec para o contrato.
2. **Parser: `yaml@2.9.1` ou `js-yaml`.** Ambos estão no lockfile como transitivos (`js-yaml@4.1.0` e
   `4.3.2`, `yaml@2.9.1`). **Adotada: `yaml@2.9.1`**, decisão do orquestrador: tipos próprios (o `js-yaml`
   precisa de `@types/js-yaml`, pacote novo), erro com linha/coluna e `uniqueKeys` para chave duplicada, e
   o handoff da `github-app-integration` já conferiu que ele produz `SAMPLE_BOARD_CONFIGS`.
3. **Mudanças no contrato além do parse** (`params.rule` no `superRefine`, `toBoardConfigIssues`,
   `diffBoardStages`). Alternativa: deduzir a regra pelo caminho na API e calcular o diff na API.
   **Adotada: no contrato**, porque a `card-backlog` reusa o diff e a regra por caminho quebraria quando o
   schema mudar.
4. **Branch lida:** padrão do repositório × `baseBranch` do snapshot na recarga. **Adotada: sempre a
   padrão**, que é a única conhecida antes de ler o arquivo e mantém criar e recarregar iguais.
5. **Recarga aplica direto ou mostra prévia e pede confirmação?** **Adotada: aplica e mostra o que mudou**
   quando o arquivo é válido; com erro, mantém a anterior. Sem cards, nada se perde. A `card-backlog`
   acrescenta a recusa para coluna removida com cards.
6. **Id do board determinístico pelo repositório** (`owner--name`) × id aleatório + consulta antes de
   criar. **Adotada: determinístico**: garante um board por repositório sem corrida, sem índice, e tem
   precedente em `notification.repository.ts:121`.
7. **Home `/` passa a ser "Meus boards"?** O canvas trata "Meus boards" como a entrada. **Adotada: não
   mexer na home**; `/boards` entra no topo da sidebar. Trocar a home mexe no resumo de `entity` herdado do
   core e é decisão de produto. Recomendação para você: trocar na próxima spec de tela.
8. **Faixa "O GitHub App está instalado em N repositórios; M sem board" e o passo 1 "Ainda não instalado"
   do primeiro acesso.** **Adotada: fora**, porque cada abertura de `/boards` custaria a listagem da
   instalação mais uma consulta de papel por repositório. Botão "Instalar no GitHub" também fora (não há URL
   de instalação na env).
9. **Rodapé do assistente "Criar board" no lugar de "Continuar para executores".** **Adotada**, porque os
   passos 3 e 4 são de `local-runner` e `card-backlog`.
10. **Mais de um board por repositório.** Pergunta da spec. **Adotada a recomendação dela: não.**
