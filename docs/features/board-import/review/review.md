# Revisão: criar board importando um repositório

Revisão do diff da tarefa 3 do `/cycle` (`board-import`). O working tree também carrega as tarefas
`github-app-integration` e `github-sign-in`, revisadas antes; o plano de commits abaixo cobre as três e
substitui o de [`github-sign-in/review/review.md`](../../github-sign-in/review/review.md).

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada a pedido do usuário. O regex do padrão
`<project>/<type>/<title>` reprova o nome (`BRANCH INVALIDA`): o prefixo `guilhermebittelbrunn` não é
projeto e o título vem colado ao tipo (`chore-cycle-...`). A revisão não renomeou nem criou branch porque o
usuário pediu para ficar nela; a pendência já está registrada nas revisões anteriores. Nome que passa no
regex, se o usuário quiser trocar antes do push: `feat/github-board-import` (as três tarefas tocam vários
apps, então sem prefixo de projeto).

## Achados

| Severidade | Onde | Problema | Ação |
|---|---|---|---|
| 🟡 | `apps/app/.../boards/(components)/githubFileUrl.ts:8` | `encodeURIComponent(ref)` troca a `/` de uma branch padrão como `release/v1` por `%2F`, e o link "Abrir no GitHub" passa a depender de o GitHub aceitar a barra codificada. | Corrigido: `ref` e `path` codificados por segmento. |
| 🟢 | `apps/api/(shared)/mappers/board.mapper.ts:34` | O comentário de `withoutUndefined` afirmava que o parse do `board.yml` deixa as chaves opcionais como `undefined`. O desvio 1 do handoff mediu que o Zod 4 omite a chave. | Corrigido: o comentário diz que a chave pode chegar como `undefined`, sem atribuir isso ao parse. |
| 🟢 | `apps/app/.../boards/(components)/BoardConfigFileCard.tsx:14` | `.kanban/board.yml` repetido no app; a API lê de `github-sample-repositories.ts:3`. É constante, não tipo, então a regra 12 não se aplica à letra. Só aparece quando o arquivo falta (com arquivo, a tela usa `file.path`). | Mantido. Mover para o `@repo/kanban-contract` toca arquivo da tarefa 1; fica como sugestão. |
| 🟢 | `apps/api/app/(routes)/boards/[id]/reload/route.ts:69` | Se o repositório for renomeado, a recarga grava o `fullName` novo, mas o id continua o antigo. Uma importação depois disso com o nome novo cria um segundo board para o mesmo repositório. | Mantido. Fora do corte da spec; anotar no backlog se o caso aparecer. |
| 🟢 | `apps/app/.../BoardsFirstAccess.tsx:39` | O `setTimeout` do "Copiado" não é limpo no unmount. Inofensivo no React 18+ (setState em componente desmontado não avisa). | Mantido. |

Nenhum achado 🔴. Itens conferidos sem problema:

- Posse em toda rota `[id]`: `GET /boards/[id]` e `POST /boards/[id]/reload` passam por
  `boardRepository.findOwnedBy(id, ctx.subjectProfile.id)` e respondem 404 `BOARD_NOT_FOUND` para board de
  outra pessoa (`board.repository.ts:26`). `GET /boards` filtra por `ownerUserId`.
- `installationId` nunca vem do cliente: `resolveImportTarget` acha o repositório na listagem da
  instalação (`board-import.ts:146`), e o schema do POST só aceita `repository` (`board.schema.ts:24`).
- O filtro por `admin` em `listAdminRepositories` (`board-import.ts:205`) consulta o papel de cada
  repositório antes de devolver a lista, e a recarga consulta o papel de novo (`reload/route.ts:33`).
  Papel `none` responde `GITHUB_REPOSITORY_NOT_ACCESSIBLE`, igual a repositório fora da instalação, então a
  resposta não revela se o repositório privado existe.
- Personificação: as escritas passam pelo `assertReadOnlyWhileImpersonating` do guard
  (`common-panel.ts:63`), e há teste de rota para isso.
- Validação Zod na borda (`parseCreateBoard`, `parseBoardPreviewQuery`), repositório estendendo
  `BaseRepository` com o mapper no `super`, `Timestamp` normalizado no mapper (`normalizeFirestoreInstant`).
- Regra 12: o SDK usa `BoardConfig`, `BoardConfigIssue`, `BoardStagesDiff` e `GithubRepoRole` do contrato.
  Os DTOs novos são de transporte e não redefinem tipo do domínio.
- O `yaml` não chega ao bundle do app: só `apps/api/(shared)/lib/board-import.ts`, o teste da API e o
  alias do Vitest importam o subpath `@repo/kanban-contract/board-config-yaml`, e o barril não o exporta.
- SDK como única porta, sem string solta nas telas (todas as frases vêm de `common.boards`), `Table` do
  design system na tabela de etapas, hooks `useListBoards`/`useFindBoardById` com a função imperativa no
  mesmo arquivo e `enabled` coerente, `"use client"` só nos componentes com estado ou hook.

## Desvios do handoff conferidos

| # | Veredito |
|---|---|
| 1 (Zod 4 omite a chave ausente) | Plausível; o teste do mapper usa `undefined` explícito. O comentário do mapper contradizia o desvio e foi ajustado. |
| 2 (sem página `/boards/[id]`) | Correto: `panelTitles.ts` só registra as três telas, e os links vão para `settings(id)`. |
| 3 (`params` com valores) | Correto: os três `addIssue` passam `rule` e valores; `refinementIssue` filtra o que não é string, número ou lista de strings, e `suggestion: null` cai na frase sem sugestão. |
| 4 (`BoardRawStageDTO`) | Correto: `rawStagesFrom` só copia string. |
| 5 (alias do Vitest) | Correto e restrito à `apps/api`. |
| 6 (alias em cascata sem posição) | Correto: `toJS()` dentro de `try`, issue `yaml_syntax` sem `line` e frase `yamlSyntaxNoPosition`. |
| 7 (chaves camelCase e plural em duas) | Correto: `templateFor` cobre todas as `rule`. |
| 8 (personificação desabilita botões) | Correto na leitura; a recusa real está no guard. |
| 9 e 10 | Sem impacto de código. |

## Correções aplicadas

- `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/githubFileUrl.ts`: helper
  `encodeSegments` aplicado a `ref` e `path`. Antes, `ref` inteiro passava por `encodeURIComponent`.
- `apps/api/(shared)/mappers/board.mapper.ts`: texto do comentário de `withoutUndefined`.

### Depois do `/test`, rodada 1

O [`test/report.md`](../test/report.md) achou um defeito 🟡 e cinco observações 🟢. Corrigidos todos, com
mudança só nos arquivos da tarefa:

- 🟡 **Frase de acesso no resumo do repositório.** "GitHub App instalado · você é admin no repositório ·
  vira dono do board" era fixa e aparecia também quando a prévia falhava (`someone/else`). A frase só é
  verdadeira quando a prévia respondeu, porque `resolveImportTarget` só responde com o App instalado e a
  pessoa admin, e o "vira dono" só vale se o repositório ainda não tem board. Então ela depende de
  `preview.board === null`, não só de a prévia existir: num repositório que já tem board, próprio ou de
  outra pessoa, o "vira dono do board" também era falso. Novo `boards/(components)/newBoardWizardCopy.ts` (`repositoryAccessLine`); o
  `RepositorySummary` recebe `accessLine` e não renderiza a linha quando é `null`.
- 🟢 **Rótulo do "Novo board".** Saiu o `aria-label` "Criar um board" (e a chave `list.newBoardAria`). O
  texto visível vira `sr-only sm:not-sr-only`, então no celular o nome acessível é o mesmo "Novo board" que
  aparece a partir de `sm`.
- 🟢 **Dica do rodapé com arquivo ausente.** `blockedCreateHint` devolve "Corrija o erro para continuar"
  para `invalid` e a chave nova `wizard.footer.addFileToContinue` ("Aplique o kit para continuar") para
  `missing`.
- 🟢 **Botão espremendo o texto a 390 px.** O bloco de texto ganhou largura mínima e o card já tinha
  `flex-wrap`, então o botão desce de linha quando não cabe: `min-w-56` em Configuração
  (`BoardSettingsClient.tsx:73`), `min-w-48` no passo 3 do primeiro acesso, `min-w-40` no resumo do
  repositório (menor porque, a partir de `md`, ele divide a largura com a coluna de passos).
- 🟢 **`break-all` → `break-words`** no nome do repositório (`RepositorySummary`, `RepositoryPicker`) e no
  card da lista (`BoardCard`, nome e repositório).
- 🟢 **"Copiar" sem aviso de falha.** O estado passou a `idle | copied | failed`; na falha o botão mostra a
  chave nova `firstAccess.applyKit.copyFailed` ("Não foi possível copiar") por 2 s, no mesmo
  `aria-live`.

Teste novo: `apps/app/__tests__/newBoardWizardCopy.test.tsx` (5 casos: a frase com e sem prévia, com board
`taken` e próprio, a dica por `status` e o `RepositorySummary` sem a linha).

## Raio de impacto

- `@repo/kanban-contract`: o barril ganha `boardConfigDiff` e `boardConfigIssues`; o `boardConfig.ts` só
  acrescenta `params` aos três `addIssue`, sem mudar mensagem nem caminho. Consumidores existentes
  (`parseBoardConfig` na API e no teste do fake client) não mudam de comportamento.
- `@repo/sdk`: recurso `board` novo no `Client`; nenhum consumidor existente muda.
- `apps/app`: item "Boards" no topo do menu lateral (`routes.tsx`) e chaves novas em `queryKeys` e
  `PANEL_PAGE_TITLES`.
- Firestore: coleção nova `board`. Nenhum índice composto (as duas cláusulas de `listByOwner` são de
  igualdade).

## Verificar no `/test`

1. **Filtro por admin com conta real de outro papel.** Com o fake client, logar como pessoa `write` num
   repositório e conferir que ele não aparece em `/boards/new` e que `GET /boards/preview?repository=<ele>`
   responde 403 `BOARD_IMPORT_FORBIDDEN`. É a afirmação que sustenta o corte de segurança da feature.
2. **IDOR na tela.** Com dois usuários do seed, criar um board com o primeiro e abrir
   `/boards/<id>/settings` com o segundo: a tela tem de mostrar o erro de board não encontrado, e o
   "Recarregar" não pode aparecer.
3. **F1 a F11 do plano** pelo emulador, em especial a prévia de `invalid-config` (borda de erro na coluna
   Revisando, selo "1 erro"), `no-kanban` com "Criar board" desabilitado e
   `/boards/new?repository=agent-board-demo/sample-app` depois de importar ("Este repositório já tem um
   board.").
4. **F8, recarga com mudança:** editar o documento no emulador trocando também `configSource.sha`, e
   conferir a lista de mudanças e o sha novo.
5. **Conta de senha do seed em `/boards/new`:** frase de `BOARD_GITHUB_ACCOUNT_REQUIRED` no lugar da lista.
6. **Personificação:** botões de criar e recarregar desabilitados com o aviso de somente leitura.
7. **Retry em 4xx:** o `QueryProvider` usa `retry: 1` sem distinguir status. Medir quanto o estado de erro
   da prévia demora a aparecer num 403/404 (deve ser uma repetição, não três).
8. **"Abrir no GitHub"** aponta para `https://github.com/<owner>/<name>/blob/<branch>/.kanban/board.yml`.
9. **Layout** claro, escuro e 390 px nas três telas, contra `NewBoard.png`, `Boards.png`, `MBoards.png`,
   `BoardsEmpty.png` e `Settings.png`; botão "Copiar" do primeiro acesso em `http://localhost`.

## Lacunas de teste

| Lacuna (do handoff) | Veredito |
|---|---|
| Sem teste de componente das telas | Continua aberta. O `/test` decide se cobre `BoardColumnsPreview` (marcação de erro por índice) no Vitest. |
| `board.repository.ts` sem teste | Continua aberta. `linksFor` com board apagado e `createForRepository` com `ALREADY_EXISTS` real só se provam com emulador. |
| Hooks de leitura sem teste próprio | Continua aberta, baixa prioridade (são uma chamada de SDK cada). |
| Limite de 8 consultas simultâneas | Continua aberta. |
| `githubFileUrl` | Nova, aberta: um caso com `ref` contendo `/`. |
| Frase de acesso e dica do rodapé | Fechada aqui (`newBoardWizardCopy.test.tsx`). |

## Decisões em aberto

- Nome da branch (acima). Recomendação: trocar para `feat/github-board-import` antes do push, se o
  usuário aceitar; a revisão não trocou.
- Perguntas 7 e 8 do plano (home `/` e faixa "App instalado em N repositórios") continuam com o usuário.

### Depois do `/test`, rodada 2

- 🟡 **Coluna da direita estreita a 768 px com o menu aberto.** O menu lateral ocupa parte dos 768 px, e a
  grade `md:grid-cols-[14rem_minmax(0,1fr)]` deixava cerca de 200 px para a prévia. A grade e a troca entre
  "Passo 1 de 2" e a lista de passos subiram de `md` para `lg` (`NewBoardClient.tsx:47`, `:53`, `:82` e
  `:209`). Isso sozinho não bastava: em `lg` com a coluna de passos, a direita fica com algo perto de
  490 px, e a prévia em `lg:grid-cols-4` daria cerca de 110 px por coluna, o mesmo estouro dos títulos.
  A prévia passou a quatro colunas só em `xl` (`BoardColumnsPreview.tsx:143`), e o título da coluna ganhou
  `min-w-0 break-words` para um nome longo quebrar dentro do card.
- 🟢 **"Copiar" sem anúncio.** O retorno da rodada 1 dizia que o aviso de falha ia "no mesmo
  `aria-live`". Estava errado: o `aria-live` ficava num `span` dentro do botão, e o nome do botão vem do
  `aria-label`, então o leitor de tela não lia esse conteúdo. O `span` saiu do botão; uma `<output
  aria-live="polite" className="sr-only">` ao lado do botão anuncia "Copiado" ou "Não foi possível
  copiar". O nome do botão continua "Copiar o comando do kit".

O `/test` chegou ao teto de rodadas. A remedição destes dois itens fica para a passada de browser do
`/test` da próxima feature (`board-members`): a 768 px com o menu aberto, nada da prévia sai da borda e o
link "Abrir o arquivo no GitHub" aparece inteiro; em `lg` e `xl`, a prévia fica em duas e quatro colunas
sem título cortado; o "Copiar" anuncia o resultado num leitor de tela.

Gates desta rodada: `pnpm check` com `Checked 733 files`, sem erro; typecheck do `app` 1/1; testes
`newBoardWizardCopy` e `panelTitles` 25/25. Os arquivos continuam no commit 20.

## Remedir no `/test` (rodada 2)

1. `/pt-br/boards/new?repository=someone/else` logado com GitHub: o resumo mostra só o nome, sem a frase de
   acesso. Repetir com `sample-app` já importado (sem a frase) e com um repositório novo válido (com a
   frase).
2. `no-kanban`: rodapé diz "Aplique o kit para continuar"; `invalid-config` continua com "Corrija o erro
   para continuar".
3. A 390 px: "Recarregar configuração", o "Novo board" do passo 3 e o "Trocar repositório" descem para a
   linha de baixo, sem rolagem horizontal. Em `md` com o menu lateral aberto, o resumo do repositório não
   pode estourar a coluna.
4. Nome `agent-board-demo/sample-app` não quebra no meio de palavra.
5. Nome acessível do "Novo board" no celular igual ao texto ("Novo board").
6. "Copiar" com a escrita recusada (contexto sem permissão de área de transferência) mostra "Não foi
   possível copiar" e volta para "Copiar".

## Gates

| Gate | Resultado |
|---|---|
| `pnpm check` | `Checked 730 files`, sem erro |
| `pnpm turbo run typecheck` em `@repo/kanban-contract`, `@repo/sdk`, `@repo/internationalization`, `api`, `app` | `5 successful, 5 total` (3 do cache) |
| `npx vitest run apiErrorCodes` em `apps/api` | 2/2 |

Depois das correções da rodada 1 do `/test`: `pnpm check` com `Checked 733 files`, sem erro;
`pnpm turbo run typecheck --filter=app --filter=@repo/internationalization` com `2 successful`; testes do
app `newBoardWizardCopy`, `boardConfigIssueMessage`, `useBoardCrud` e `panelTitles` com 39/39; teste do
`@repo/internationalization` com 35/35; `apiErrorCodes` 2/2 (as chaves novas não são `apiErrors`).

A suíte Vitest inteira não foi rodada aqui; os números do handoff (937 testes na API, 686 no app, 61 no contrato)
são do `/develop`. As duas correções não mudam comportamento coberto por teste existente.

Varredura de segredo em `docs/features/board-import/`: nenhuma senha, token, chave ou e-mail real. As
menções a `GITHUB_APP_PRIVATE_KEY` e "chave RSA gerada só no shell" são nomes de variável e descrição, sem
valor.

## Plano de commits (tarefas 1, 2 e 3)

> Substituído pelo plano das quatro tarefas em
> [`board-members/review/review.md`](../../board-members/review/review.md#plano-de-commits-tarefas-1-a-4).
> Use aquele; este fica como histórico.

Ordem: pacotes (`shared`, `kanban-contract`, `sdk`, `auth`) → `apps/api` → `apps/app` → `apps/e2e` →
i18n → docs → instruções de agente → specs → artefatos. Antes do commit 1, `git diff --cached --stat`
precisa sair vazio. Depois de cada commit, `git show --stat --oneline HEAD` contra a lista.

Arquivos com trechos de mais de uma tarefa:

- `packages/kanban-contract/src/index.ts` (tarefas 2 e 3). Como as linhas são vizinhas, o `git add -p` não
  separa sem modo de edição. No commit 2, preparar só a linha do `identity`:
  `grep -vE 'boardConfig(Diff|Issues)' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
  e `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/src/index.ts`. O commit 3 leva o
  arquivo inteiro com `git add`.
- `pnpm-lock.yaml` (três tarefas). No commit 3, só o `yaml` do importer `packages/kanban-contract`:
  `git show HEAD:pnpm-lock.yaml | awk '{print} /^  packages\/kanban-contract:$/ {sec=1; next} sec && /^    dependencies:$/ {print "      yaml:"; print "        specifier: 2.9.1"; print "        version: 2.9.1"; sec=0}' | git hash-object -w --stdin`
  e `git update-index --cacheinfo 100644,<sha>,pnpm-lock.yaml`. O commit 8 leva o arquivo inteiro (os
  dois links `@repo/kanban-contract` da API e do SDK). Conferido: o blob difere do working tree só nesses
  dois links.
- `apps/api/__tests__/githubFakeClient.test.ts` (arquivo novo da tarefa 1 com um `describe` da tarefa 3
  que importa o subpath do YAML). Sai do commit 9 e entra no 14, para nenhum commit ter teste que importa
  arquivo ainda inexistente.
- `apps/api/(shared)/lib/github/github-sample-repositories.ts`: a tarefa 3 só mudou um comentário. Fica
  inteiro no commit 9.
- `packages/internationalization/translations/packages/shared/utils.ts`: commit 22, misto das três
  tarefas (copy dos códigos de erro). Separar exigiria preparo por blob em três passos sem ganho de leitura.
- `apps/api/.env.example`, `docs/SETUP.md`, `docs/PRE-PRODUCTION.md`, `packages/auth/provider.tsx`: como no
  plano anterior (commits 8, 25 e 6).

Os commits 19 e 20 só passam no typecheck com o 24 aplicado (o app lê o dicionário novo), e os commits de
`apps/api` só passam no `apiErrorCodes` com o 22. É o mesmo arranjo do plano anterior, que mantém a ordem
de dependência do repositório; o PR fica verde no último commit.

1. `feat(shared): add github log scope and BAD_GATEWAY status`
   - `packages/shared/utils/helpers/log.ts`
   - `packages/shared/utils/helpers/httpStatus.ts`
2. `feat(kanban-contract): add the GitHub identity schema` (`index.ts` parcial, ver acima)
   - `packages/kanban-contract/src/identity.ts`
   - `packages/kanban-contract/src/index.ts` (só `./identity`)
   - `packages/kanban-contract/__tests__/identity.test.ts`
3. `feat(kanban-contract): parse board.yml text and map validation issues` (lockfile parcial)
   - `packages/kanban-contract/package.json`
   - `packages/kanban-contract/src/boardConfig.ts`
   - `packages/kanban-contract/src/boardConfigIssues.ts`
   - `packages/kanban-contract/src/boardConfigDiff.ts`
   - `packages/kanban-contract/src/boardConfigYaml.ts`
   - `packages/kanban-contract/src/index.ts` (resto)
   - `packages/kanban-contract/__tests__/boardConfigYaml.test.ts`
   - `packages/kanban-contract/__tests__/boardConfigIssues.test.ts`
   - `packages/kanban-contract/__tests__/boardConfigDiff.test.ts`
   - `pnpm-lock.yaml` (só o `yaml`)
4. `feat(sdk): replace Google sign-in with GitHub sign-in`
   - `packages/sdk/package.json`
   - `packages/sdk/src/types/user/user.ts`
   - `packages/sdk/src/actions/auth/action.ts`
5. `feat(sdk): add boards resource`
   - `packages/sdk/src/types/board/board.ts`
   - `packages/sdk/src/types/board/index.ts`
   - `packages/sdk/src/types/index.ts`
   - `packages/sdk/src/actions/board/action.ts`
   - `packages/sdk/src/client/index.ts`
6. `refactor(auth): remove Google sign-in and clear a cookie written after sign-out`
   - `packages/auth/client.ts`
   - `packages/auth/provider.tsx`
7. `feat(auth): refuse sign-in methods other than GitHub outside the emulator`
   - `packages/auth/sign-in-method.ts`, `packages/auth/package.json`, `packages/auth/session.ts`,
     `packages/auth/session-routes.ts`, `packages/auth/server.ts`
   - `packages/auth/__tests__/signInMethod.test.ts`, `serverSessionRevocation.test.ts`,
     `sessionAbsoluteCap.test.ts`, `sessionOrigin.test.ts`, `sessionRefreshRoute.test.ts`,
     `sessionRoutesAuthority.test.ts`
8. `chore(api): declare GitHub App environment variables`
   - `apps/api/env.ts`
   - `apps/api/.env.example`
   - `apps/api/package.json`
   - `pnpm-lock.yaml` (inteiro)
9. `feat(api): add GitHub App client with a sample client for the emulator`
   - `apps/api/(shared)/lib/github/github-app-config.ts`, `github-app-jwt.ts`, `github-client.ts`,
     `github-errors.ts`, `github-installation-tokens.ts`, `github-permission-cache.ts`,
     `github-rest-client.ts`, `github-fake-client.ts`, `github-sample-repositories.ts`
   - `apps/api/__tests__/githubAppJwt.test.ts`, `githubRestClient.test.ts`,
     `githubPermissionCache.test.ts`, `githubErrorResponse.test.ts`, `githubClientMode.test.ts`
10. `feat(api): add signed GitHub webhook endpoint`
    - `apps/api/(shared)/lib/github/github-webhook-signature.ts`, `github-webhook-events.ts`
    - `apps/api/(shared)/validation/github-webhook.schema.ts`
    - `apps/api/app/(routes)/github/webhook/route.ts`
    - `apps/api/__tests__/githubWebhookSignature.test.ts`, `githubWebhookRoute.test.ts`
11. `feat(api): warn at boot when the GitHub App is not configured`
    - `apps/api/instrumentation.ts`
    - `apps/api/__tests__/githubBootNotice.test.ts`, `corsOriginBoot.test.ts`
12. `feat(api): replace Google sign-in with GitHub sign-in`
    - `apps/api/(shared)/lib/firebase-identity-toolkit.ts`, `github-identity.ts`, `user-merge.ts`
    - `apps/api/(shared)/validation/auth.schema.ts`
    - `apps/api/app/(routes)/auth/sign-in/github/route.ts`
    - `apps/api/app/(routes)/auth/sign-in/google/route.ts` (removido)
    - `apps/api/proxy.ts`
    - `apps/api/__tests__/authSignInGithubRoute.test.ts`, `firebaseIdentityLookup.test.ts`,
      `corsOrigin.test.ts`
    - `apps/api/__tests__/authSignInGoogleRoute.test.ts`, `authSignInGoogleToolkit.test.ts`,
      `googleSignInProfile.test.ts` (removidos)
13. `feat(api): refuse password sign-in outside the emulator`
    - `apps/api/(shared)/lib/resolve-api-actor.ts`
    - `apps/api/app/(routes)/auth/sign-in/route.ts`
    - `apps/api/__tests__/authSignInRoute.test.ts`, `resolveApiActorSession.test.ts`
14. `feat(api): store boards imported from a repository`
    - `apps/api/(shared)/validation/board.schema.ts`
    - `apps/api/(shared)/mappers/board.mapper.ts`
    - `apps/api/(shared)/repositories/board.repository.ts`
    - `apps/api/(shared)/lib/board-import.ts`
    - `apps/api/vitest.config.mts`
    - `apps/api/__tests__/boardMapper.test.ts`
    - `apps/api/__tests__/githubFakeClient.test.ts`
15. `feat(api): add board import routes`
    - `apps/api/app/(routes)/boards/route.ts`
    - `apps/api/app/(routes)/boards/repositories/route.ts`
    - `apps/api/app/(routes)/boards/preview/route.ts`
    - `apps/api/app/(routes)/boards/[id]/route.ts`
    - `apps/api/app/(routes)/boards/[id]/reload/route.ts`
    - `apps/api/__tests__/boardsRoutes.test.ts`
16. `feat(app): sign in with GitHub on the sign-in screen`
    - `apps/app/shared/lib/githubSignInApi.ts`, `emulatorSignIn.ts`
    - `apps/app/shared/lib/googleSignInApi.ts` (removido)
    - `apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx`
    - `apps/app/__tests__/githubSignInApi.test.ts`, `signInForm.test.tsx`,
      `authFormsPersistedSessionRedirect.test.tsx`, `authProviderSessionNotEstablished.test.tsx`,
      `postLoginFullPageNavigation.test.tsx`, `sessionExpiredSignOut.test.tsx`,
      `signInEnterResubmit.test.tsx`
    - `apps/app/__tests__/googleSignInApi.test.ts` (removido)
17. `feat(app): show the GitHub login in the profile menu and allow GitHub avatars`
    - `apps/app/shared/components/ui/ProfileDropdown.tsx`
    - `apps/app/proxy.ts`
    - `apps/app/__tests__/profileDropdownAccount.test.tsx`, `securityHeaders.test.ts`
18. `test(app): cover a sign-out while the session cookie is being written`
    - `apps/app/__tests__/authProviderSignOutDuringSessionWrite.test.tsx`
19. `feat(app): add board data hooks`
    - `apps/app/shared/lib/queryKeys.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/` (5 arquivos)
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardConfigIssueMessage.ts`
    - `apps/app/__tests__/useBoardCrud.test.tsx`, `boardConfigIssueMessage.test.ts`
20. `feat(app): add boards, new board and board settings screens`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/` (o resto, inclui
      `newBoardWizardCopy.ts`)
    - `apps/app/__tests__/newBoardWizardCopy.test.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/`
    - `apps/app/app/[locale]/(authenticated)/(common)/paths.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/routes.tsx`
    - `apps/app/shared/lib/panelTitles.ts`
21. `test(e2e): cover GitHub sign-in through the emulator popup`
    - `apps/e2e/tests/githubSignIn.spec.ts`
22. `feat(internationalization): add copy for GitHub, sign-in and board error codes` (misto)
    - `packages/internationalization/translations/packages/shared/utils.ts`
23. `feat(internationalization): replace Google sign-in copy with GitHub`
    - `packages/internationalization/translations/apps/app/pages/signIn/index.ts`
    - `packages/internationalization/translations/packages/auth/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/account.ts`
24. `feat(internationalization): add boards copy`
    - `packages/internationalization/translations/apps/app/pages/common/boards.ts`
    - `packages/internationalization/translations/apps/app/pages/common/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/routes/index.ts`
25. `docs: document GitHub App and GitHub sign-in setup` (misto)
    - `docs/SETUP.md`, `docs/PRE-PRODUCTION.md`
26. `docs: describe GitHub as the only sign-in method`
    - `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/AUTH-PANEL.md`, `docs/board/ACCESS.md`,
      `docs/board/README.md`, `docs/board/DECISIONS.md`, `docs/board/ROADMAP.md`
27. `chore(claude): state GitHub as the sign-in method in agent instructions`
    - `CLAUDE.md`, `AGENTS.md`, `apps/app/CLAUDE.md`
28. `docs(specs): reconcile backlog with the code`
    - `specs/BACKLOG.md`, `specs/reference/AUDIT.md`, `specs/features/board-import.md`,
      `specs/features/github-app-integration.md`, `specs/features/github-sign-in.md`,
      `specs/features/spec-discovery.md`
29. `docs(features): github-app-integration`
    - `docs/features/github-app-integration/`
30. `docs(features): github-sign-in`
    - `docs/features/github-sign-in/` (inclui `test/criterios-aceite.md` e `test/report.md`; `test/e2e/`
      é ignorado pelo `.gitignore`)
31. `docs(features): board-import`
    - `docs/features/board-import/`

Os arquivos removidos entram com `git add` explícito do caminho (ou `git rm`) no commit correspondente.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in and board import`.

Commits realizados: _(preenchido pelo orquestrador)_
