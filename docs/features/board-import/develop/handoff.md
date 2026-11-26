# Handoff do develop: criar board importando um repositório

Plano: [`analyze/plan.md`](../analyze/plan.md). Nada foi commitado. O working tree também carrega as tarefas
`github-app-integration` e `github-sign-in`, sem commit; a seção "Separar os commits" diz o que é desta tarefa
nos arquivos que as três tocam.

## Desvios do plano (leia primeiro)

1. **A premissa da 10.6 estava errada.** O plano diz que o `parseBoardConfig` devolve as chaves opcionais
   ausentes (`agent`, `onRework`, `onPrComment`, `environment.install`) como `undefined`. Com o Zod 4 do repo,
   não devolve: a chave ausente fica ausente (medido no `boardMapper.test.ts`, a primeira versão do teste
   falhou nessa asserção). Mantive a remoção de `undefined` em profundidade no `toPersistence` porque o
   Firestore recusa `undefined` e o custo é nulo, mas o teste agora monta o objeto com `undefined` explícito.
   O risco R5 do plano praticamente não existe.
2. **Sem a página `/boards/[id]` de redirecionamento.** O `panelTitles.test.ts` exige um título próprio e
   distinto para toda tela com `page.tsx`, e um redirecionamento não tem título que faça sentido. Os links
   (card da lista, "Abrir board" do picker, pós-criação) apontam direto para `/boards/[id]/settings`. A
   `card-backlog` cria `/boards/[id]` com o quadro. Também saiu `boards.detail(id)` do `paths.ts`.
3. **`params` dos `superRefine` carregam os valores, não só a regra.** O plano pedia `params: { rule }` e a
   reconstrução dos valores a partir do objeto cru. Os três `addIssue` de `boardConfig.ts` passam também
   `key`, `stageColumn`/`target`/`suggestion` e `baseBranch`, lidos da config já com defaults. Assim o
   `base_branch_unprotected` traz `main` mesmo quando o arquivo não declara `baseBranch`. A mensagem em
   inglês e os testes antigos não mudaram.
4. **`rawStages` tem tipo próprio, `BoardRawStageDTO`**, com `key`, `column`, `command`, `model` e `onRework`
   como `string | null`. O `Partial<StageConfig>[]` do plano prometia enums que um arquivo inválido não
   garante; a API só copia o que for string.
5. **Alias no `apps/api/vitest.config.mts`.** O alias `@repo` do Vitest aponta para pastas, então o subpath
   `@repo/kanban-contract/board-config-yaml` caía no Node cru (`Unknown file extension ".ts"`). Acrescentei
   um alias explícito para `src/boardConfigYaml.ts`. O `next build` da API resolve pelo `exports` do pacote e
   não precisa disso.
6. **Alias de `yaml` em cascata vira `yaml_syntax` sem posição.** O `toJS()` do `yaml` lança quando passa do
   limite de aliases, sem linha. O dicionário tem uma frase própria para esse caso (`yamlSyntaxNoPosition`).
7. **Chaves de i18n em camelCase** (`wrongType`, `reworkTargetInvalid`...), não as `rule` em snake_case da
   10.8, e plural em duas chaves (`errorCountOne`/`errorCountOther`), porque o dicionário não tem forma
   `{ one, other }`. O mapa `rule` → chave fica em `boardConfigIssueMessage.ts`. Chaves a mais:
   `loadError` (lista, picker, preview, settings), `copyAria`, `alertAria`, `wholeFile`, `untitledStage`,
   `steps.label` e `settings.table.empty`.
8. **Personificação na tela Novo board e Configuração:** "Criar board" e "Recarregar configuração" ficam
   desabilitados e a tela mostra o `ImpersonationReadOnlyNotice`, como na lista de entidades. O F11 do plano
   esperava ver o erro de somente leitura; quem garante a recusa continua sendo a API (teste de rota).
9. **Testes de rota num arquivo só**, `boardsRoutes.test.ts`, com um `describe` por rota, no lugar dos
   cinco arquivos do plano. Os mocks (guard, repositório, `getGithubClient`) são os mesmos para todas.
10. **`docs/PRE-PRODUCTION.md` não foi alterado.** O plano pedia uma linha dizendo que o sinal de pronto com
    repositório real fica bloqueado pelos itens 4 e 5, mas não há infra nova nesta tarefa e esses itens já
    descrevem o bloqueio. Conferido: nenhuma env, índice ou rule nova.

## Blueprint → arquivos

| Item | Arquivos |
|------|----------|
| 10.2 contrato do domínio | `packages/kanban-contract/package.json` (`yaml@2.9.1`, subpath `./board-config-yaml`), `src/boardConfig.ts` (`params` nos 3 `addIssue`), `src/boardConfigIssues.ts`, `src/boardConfigDiff.ts` (+ `isEmptyStagesDiff`), `src/boardConfigYaml.ts`, `src/index.ts` |
| 10.1 SDK | `packages/sdk/src/types/board/{board.ts,index.ts}`, `src/types/index.ts`, `src/actions/board/action.ts`, `src/client/index.ts` |
| 4.7 persistência | `apps/api/(shared)/validation/board.schema.ts`, `(shared)/mappers/board.mapper.ts`, `(shared)/repositories/board.repository.ts` (`findOwnedBy`, `listByOwner`, `createForRepository`, `applyReload`, `linksFor`) |
| 4.2 fluxo comum | `apps/api/(shared)/lib/board-import.ts` (`resolveImportTarget`, `listAdminRepositories`, `boardIdForRepository`, `toImportPreview`, `rawStagesFrom`) |
| 10.3 rotas | `apps/api/app/(routes)/boards/route.ts` (GET, POST), `boards/repositories/route.ts`, `boards/preview/route.ts`, `boards/[id]/route.ts`, `boards/[id]/reload/route.ts` |
| 5.1/5.2 app, dados | `apps/app/shared/lib/queryKeys.ts`, `(common)/paths.ts`, `(common)/routes.tsx` (item Boards no topo), `shared/lib/panelTitles.ts`, `boards/(hooks)/{useListBoards,useFindBoardById,useListImportableRepositories,usePreviewBoardImport,useBoardCrud}.tsx` |
| 5.3 telas | `boards/(pages)/(home)/{page,BoardsListClient,loading}.tsx`, `boards/(pages)/new/{page,NewBoardClient}.tsx`, `boards/(pages)/[id]/settings/{page,BoardSettingsClient,loading}.tsx` |
| 5.3 componentes | `boards/(components)/{BoardCard,BoardsFirstAccess,RepositoryPicker,RepositorySummary,BoardConfigFileCard,BoardConfigIssues,BoardColumnsPreview,BoardRulesSummary,BoardStagesTable,BoardReloadResult}.tsx`, `boardConfigIssueMessage.ts`, `githubFileUrl.ts`, `shortSha.ts` |
| 10.8 i18n | `packages/internationalization/translations/apps/app/pages/common/boards.ts` (novo), `common/index.ts`, `common/routes/index.ts`, `packages/shared/utils.ts` (6 `apiErrors`) |
| 7 testes | `packages/kanban-contract/__tests__/{boardConfigYaml,boardConfigIssues,boardConfigDiff}.test.ts`; `apps/api/__tests__/{boardMapper,boardsRoutes}.test.ts`, `githubFakeClient.test.ts` (+1 `describe`); `apps/app/__tests__/{boardConfigIssueMessage.test.ts,useBoardCrud.test.tsx}` |
| ajustes de apoio | `apps/api/vitest.config.mts` (alias, desvio 5), `apps/api/(shared)/lib/github/github-sample-repositories.ts` (o comentário de `SAMPLE_BOARD_CONFIGS` dizia que a API não tinha parser de YAML) |

## Contrato

- **SDK novo:** `apiClient.board.{list, findById, listRepositories, preview, create, reload}` e os tipos
  `BoardDTO`, `BoardRepositoryDTO`, `BoardConfigSourceDTO`, `ImportableRepositoryDTO`, `RepositoryBoardLink`,
  `BoardImportPreviewDTO`, `BoardRawStageDTO`, `CreateBoardRequest`, `BoardReloadOutcome`,
  `BoardReloadResultDTO`. Só a tela de boards consome; nenhum consumidor existente muda.
- **Contrato do domínio:** `BOARD_CONFIG_ISSUE_RULES`, `BoardConfigIssue`, `formatIssuePath`,
  `toBoardConfigIssues`, `STAGE_FIELDS`, `BoardStagesDiff`, `diffBoardStages`, `isEmptyStagesDiff` no barril;
  `parseBoardConfigYaml` só no subpath `@repo/kanban-contract/board-config-yaml` (o app não importa o `yaml`).
  O `boardConfig.ts` mudou só os `params` dos três `addIssue`.
- **Coleção nova** `board`, id `owner--name` em minúsculas.

## Dependência e lockfile

`yaml@2.9.1` direto em `@repo/kanban-contract`, já resolvido no lockfile como transitivo. `pnpm install
--prefer-offline`: `downloaded 0, added 0`. Diff do lockfile desta tarefa (contra uma cópia feita antes do
install), só o importer:

```
512a513,515
>       yaml:
>         specifier: 2.9.1
>         version: 2.9.1
```

## Códigos de erro novos

`BOARD_NOT_FOUND` (404), `BOARD_ALREADY_EXISTS` (409), `BOARD_CONFIG_NOT_FOUND` (422),
`BOARD_CONFIG_INVALID` (422), `BOARD_IMPORT_FORBIDDEN` (403), `BOARD_GITHUB_ACCOUNT_REQUIRED` (403). Os seis
estão em `apiErrors` com o texto da 10.8. `npx vitest run apiErrorCodes` em `apps/api`: 2/2.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | `Checked 730 files`, sem erro |
| Typecheck e testes | `pnpm turbo run typecheck test --filter=@repo/kanban-contract --filter=@repo/sdk --filter=@repo/internationalization --filter=api --filter=app` | `16 successful, 16 total` |
| Contrato | idem | 7 arquivos, 61 testes (21 novos) |
| API | idem | 80 arquivos, 937 testes (40 em `boardsRoutes`, 4 em `boardMapper`, 1 novo em `githubFakeClient`) |
| App | idem | 95 arquivos, 686 testes (8 em `boardConfigIssueMessage`, 6 em `useBoardCrud`; `panelTitles` passa com as três telas novas) |
| SDK / i18n | idem | 9 e 35 testes |
| Build da API sem o GitHub App | `env -u GITHUB_APP_ID -u GITHUB_APP_PRIVATE_KEY -u GITHUB_WEBHOOK_SECRET` + service account com chave RSA gerada só no shell, `npx next build` | exit 0, `✓ Compiled successfully`, rotas `ƒ /boards`, `/boards/[id]`, `/boards/[id]/reload`, `/boards/preview`, `/boards/repositories` |
| Build do app | `npx next build` | exit 0, rotas `ƒ /[locale]/boards`, `/[locale]/boards/new`, `/[locale]/boards/[id]/settings` |

O teste deep-equal que ficou da `github-app-integration` está em `githubFakeClient.test.ts`: o YAML de
`sample-app` passado por `parseBoardConfigYaml` é igual a `parseBoardConfig(SAMPLE_BOARD_CONFIGS.valid)`, e o
de `invalid-config` devolve `raw` igual a `SAMPLE_BOARD_CONFIGS.invalid` com uma única issue em
`stages[2].onRework`.

O caminho degradado está provado em teste, não em processo de pé: sem App, `GET /boards/repositories`
responde 503 `GITHUB_APP_NOT_CONFIGURED`; conta sem `github` responde 403 `BOARD_GITHUB_ACCOUNT_REQUIRED`;
`GithubApiError` vira o código do GitHub; erro que não é do GitHub é relançado (nenhum desses vira 500
silencioso). No app, o picker mostra o erro pelo `handleClientError` dentro de `LoadErrorState`.

Não subi emulador, API nem app. Nada desta tarefa foi visto rodando.

## A verificar no `/test`

Todas as afirmações de tela abaixo saem de leitura de código, sem medição:

- **F1 a F11 do plano**, com o emulador (`pnpm emulators` + `pnpm seed` + `pnpm dev`) e login pelo popup do
  GitHub. Em especial: a prévia de `invalid-config` com borda de erro na coluna Revisando e o selo "1 erro";
  `no-kanban` com a frase de arquivo ausente e "Criar board" desabilitado; `/boards/new?repository=agent-board-demo/sample-app`
  depois de importar mostra "Este repositório já tem um board." e o botão desabilitado.
- **F8 (recarga com mudança):** o diff só aparece quando o sha gravado difere do arquivo; ao editar o
  documento no emulador, troque `configSource.sha` também.
- **Conta de senha do seed em `/boards/new`:** deve aparecer a frase de `BOARD_GITHUB_ACCOUNT_REQUIRED` no
  lugar da lista.
- **Personificação:** botões de criar e recarregar desabilitados com o aviso de somente leitura (desvio 8).
- **Layout:** claro, escuro e 390 px nas três telas; o assistente mostra "Passo 1 de 2" no celular e os
  passos na coluna da esquerda a partir de `md`. Comparar com `NewBoard.png`, `Boards.png`, `MBoards.png`,
  `BoardsEmpty.png` e `Settings.png`.
- **Botão "Copiar"** do primeiro acesso: depende de `navigator.clipboard` (contexto seguro); em `http://localhost`
  deve funcionar.
- **Retry do React Query em 4xx:** não conferi se o `QueryClient` do app repete o preview em 404/403 antes de
  mostrar o erro. Se repetir, o estado de erro demora a aparecer.

## Lacunas de teste conhecidas

- Nenhum teste de componente das telas (`NewBoardClient`, `BoardColumnsPreview`, `BoardSettingsClient`).
- `board.repository.ts` não tem teste: `listByOwner` (ordenação em memória), `linksFor` (`getAll`, board
  apagado como `null`) e `createForRepository` com `ALREADY_EXISTS` real só se provam com emulador ou mock
  do Firestore.
- `useListBoards`, `useFindBoardById`, `useListImportableRepositories` e `usePreviewBoardImport` não têm
  teste próprio.
- O limite de 8 consultas de papel simultâneas em `listAdminRepositories` não tem teste.

## Decisões em aberto

As perguntas 1 a 10 do plano seguem como o `/cycle` adotou. Nada novo bloqueou a implementação. Ficam para o
usuário as mesmas de produto: home `/` continuar sendo o resumo de entidades (pergunta 7) e a faixa "App
instalado em N repositórios" fora (pergunta 8).

## Separar os commits

Ordem e conteúdo desta tarefa, sem misturar com as outras duas:

1. `feat(kanban-contract): parse board.yml text and map validation issues`: `packages/kanban-contract/package.json`,
   `src/boardConfig.ts`, `src/boardConfigIssues.ts`, `src/boardConfigDiff.ts`, `src/boardConfigYaml.ts`, os três
   testes novos, e as 3 linhas de `yaml` no `pnpm-lock.yaml`. Atenção: `src/index.ts` também exporta
   `./identity` (tarefa 2); só as linhas `boardConfigDiff` e `boardConfigIssues` são desta. O lockfile já tem
   6 linhas das tarefas anteriores; use `git add -p`.
2. `feat(sdk): add boards resource`: `packages/sdk/src/types/board/`, `src/actions/board/`, as linhas de board em
   `src/types/index.ts` e `src/client/index.ts`.
3. `feat(api): store boards imported from a repository`: `board.schema.ts`, `board.mapper.ts`,
   `board.repository.ts`, `board-import.ts`, `boardMapper.test.ts`, o alias do `vitest.config.mts`, o
   comentário de `github-sample-repositories.ts` e o `describe("sample board.yml text")` de
   `githubFakeClient.test.ts`. Os dois últimos arquivos são novos da tarefa 1 e ainda não têm commit: se o
   commit da tarefa 1 entrar antes, estes trechos entram aqui com `git add -p`; se não, vão junto com a
   tarefa 1 e o handoff dela precisa citar.
4. `feat(api): add board import routes`: `apps/api/app/(routes)/boards/` e `boardsRoutes.test.ts`.
5. `feat(app): add board data hooks`: `queryKeys.ts` (bloco `boards`), `boards/(hooks)/`,
   `boards/(components)/boardConfigIssueMessage.ts`, `useBoardCrud.test.tsx`, `boardConfigIssueMessage.test.ts`.
6. `feat(app): add boards, new board and board settings screens`: o resto de `boards/`, `paths.ts`,
   `routes.tsx`, `panelTitles.ts`.
7. `feat(internationalization): add boards copy and error codes`: `common/boards.ts`, `common/index.ts`,
   `common/routes/index.ts` e as 6 chaves `BOARD_*` em `packages/shared/utils.ts` (o mesmo arquivo tem as
   chaves `GITHUB_*` e `AUTH_GITHUB_*` das tarefas 1 e 2; `git add -p`).
8. `docs(features): board-import`.

Os commits 5 e 6 só passam no typecheck com o 7 aplicado (o app lê as chaves novas do dicionário). Se cada
commit precisar ficar verde sozinho, mova o 7 para antes do 5.
