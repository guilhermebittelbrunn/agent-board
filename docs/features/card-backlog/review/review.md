# Revisão: cards a partir do backlog de specs e board com colunas

Revisão do diff da tarefa 5 do `/cycle` (`card-backlog`). O working tree carrega também as tarefas
`github-app-integration`, `github-sign-in`, `board-import` e `board-members`, já revisadas e testadas. O plano
de commits no fim deste arquivo cobre as cinco e substitui o de
[`board-members/review/review.md`](../../board-members/review/review.md#plano-de-commits-tarefas-1-a-4).

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada porque o usuário pediu para ficar nela. O regex do
padrão `<project>/<type>/<title>` reprova o nome (`BRANCH INVALIDA`), como já registrado na `board-members`. A
revisão não renomeou nem criou branch. Nome que passa no regex, se o usuário quiser trocar antes do push:
`feat/github-board-import-members-and-cards` (as cinco tarefas tocam vários apps, então vai sem prefixo de
projeto).

## Achados

| Severidade | Onde | Problema | Ação |
|---|---|---|---|
| 🟡 | `apps/api/(shared)/lib/card-sync.ts:209` | Uma spec com `id: sync` ou `id: order` virava card, mas `GET cards/sync` e `cards/order` caem nas rotas estáticas vizinhas de `cards/[slug]`, e o detalhe desse card nunca abre. Era a decisão em aberto do `/develop`. | Corrigido: `RESERVED_CARD_SLUGS` (`:27`) recusa os dois slugs com `skipped: slug_invalid`. Teste novo em `cardSync.test.ts`. |
| 🟢 | `apps/api/(shared)/repositories/card.repository.ts:62` | A criação usa `batch.set`. Se duas sincronizações rodam juntas e alguém move o card recém-criado entre as duas, a segunda devolve o card a Tarefas. A janela é de milissegundos e as duas gravam o mesmo documento (id `<boardId>__<slug>`), então não nasce card duplicado. | Mantido. `batch.create` faria a segunda sincronização falhar inteira, o que é pior para quem clicou. |
| 🟢 | `apps/api/(shared)/lib/card-sync.ts:22` | Cada sincronização faz até 201 leituras no GitHub (índice + 200 arquivos, 8 em paralelo). Há teto por sincronização, mas não há intervalo mínimo entre sincronizações na API; o botão só fica desabilitado enquanto a anterior roda. O limite da instalação é 5000 requisições por hora. | Mantido. Ver decisões em aberto. |
| 🟢 | `apps/api/app/(routes)/boards/[id]/reload/route.ts:72` | A recusa de recarga lê os cards antes do `applyReload`, fora de transação. Um card movido para a etapa removida nesse intervalo fica na coluna "Etapa removida", que a tela já trata (desvio 7). | Mantido. |
| 🟢 | `apps/app/.../boards/(hooks)/useBoardCardCrud.tsx:100` | Depois de sincronizar, o hook grava o `backlogSync` no cache do board e ainda invalida a mesma query, o que gera um `GET /boards/[id]` a mais. | Mantido, sem efeito visível. |
| 🟢 | `apps/app/.../boards/(components)/BoardCardItem.tsx:65` | O link do título troca o contorno de foco por sublinhado (`focus-visible:outline-none`). Atende a 2.4.7 se o sublinhado ficar visível nos dois temas. | Mantido; vai para o `/test` (item 6). |

Nenhum achado 🔴.

### Segurança, item a item

- **`SpecMarkdown` sem HTML cru.** Só o `marked.lexer` roda; cada token vira elemento React e o HTML de bloco e
  de linha sai como texto (`token.raw`). Não há `dangerouslySetInnerHTML` nem `<img>`; a imagem vira link com o
  texto alternativo.
- **Esquemas de URL.** `resolveSpecHref` só devolve sem prefixo o que casa com `^https?://`. Qualquer outro
  esquema (`javascript:`, `data:`, `vbscript:`, autolink `<javascript:...>`, e-mail) e o `//host` viram texto.
  Entidade (`&#106;avascript:`) e percent-encoding (`%6Aavascript:`) não casam com o regex de esquema, então
  caem no caminho relativo e saem como `https://github.com/<owner>/<name>/blob/<ref>/<caminho codificado>`. O
  `href` vai para o DOM por propriedade do React, sem decodificação de entidade pelo parser de HTML. Teste novo
  em `specMarkdown.test.tsx` cobre esses cinco casos: todo `<a>` desenhado tem `href` começando com `https://`.
- **Links relativos.** A base é `owner`/`name` do board, a `ref` é a `baseBranch` e o caminho vem do
  `card.spec.path`, que a própria sincronização resolveu. `resolveRepoPath` devolve `null` para caminho que sobe
  acima da raiz, e `githubFileUrl` codifica cada segmento. A âncora passa por `encodeURIComponent`.
- **Decodificação de entidades.** `decodeMarkedText` desfaz as cinco entidades do `marked` com `&amp;` por
  último, e o resultado só vai para nó de texto do React, que escapa de novo. O bloco `code` vem cru do lexer e
  não é decodificado.
- **Regra 13.** As seis rotas passam por `requireBoardApi`: `GET cards`, `GET cards/[slug]` e
  `GET cards/[slug]/spec` com `view`; `POST cards/sync`, `PUT cards/order` e `POST cards/[slug]/move` com
  `prioritize` (`operator`+, `canPrioritizeCards`). O guard resolve o papel efetivo antes do handler, e as
  escritas em personificação param no `assertReadOnlyWhileImpersonating` do `requireCommonPanelApi`.
- **IDOR de slug entre boards.** `findBySlug` monta o id a partir do `boardId` da rota e devolve `null` se o
  documento lido tiver outro `boardId` (`card.repository.ts:52-53`). O slug da URL não passa por `isValidSlug`,
  mas essa conferência fecha o caso de um slug com `__` que caísse no documento de outro board. O `reorder`
  só aceita a fila exata de Tarefas do próprio board (senão `CARD_ORDER_STALE`).
- **Regra 14.** `cardRepository.move` grava só `lane`, `stageKey`, `order` (na volta para Tarefas),
  `movedAt`, `movedByUserId` e `updatedAt`. A sincronização não grava `state`, `lane` nem `stageKey` de card
  existente (teste "never writes state, lane or stage key of an existing card"); card novo nasce `idle`.
- **Regra 16.** O conteúdo da spec sai da API como dado (`CardSpecContentDTO`) e o app o desenha como texto.
  O frontmatter é lido com `uniqueKeys` e recusa qualquer aviso do `yaml` (desvio 6).
- **Regra 15.** Nenhum token nem chave sai nas respostas novas.
- **`marked` no bundle.** Declarado só no `apps/app`, importado só por `SpecMarkdown.tsx`, que só o
  `CardDetailClient.tsx` usa. A API não importa `marked`. O `yaml` fica fora do barril do contrato
  (subpaths `./board-config-yaml` e `./spec-frontmatter`), então o app não o carrega.
- **Tokens de tema.** Varredura em `apps/app/.../(pages)/boards` por hex, `rgb(`/`hsl(`/`oklch(` e classes de
  paleta do Tailwind: zero ocorrências.

### `planBacklogSync`

- Ordem: specs novas entram no fim de Tarefas na ordem do índice, a partir de `nextTasksOrder`; a ordem dos
  cards existentes não é tocada.
- Órfãos: card cuja spec saiu do índice recebe `orphan: true` e `ready: false` e fica onde está; se a spec
  volta, a próxima sincronização o atualiza.
- Concorrência de duas sincronizações: as duas calculam o mesmo id e a mesma ordem a partir da mesma leitura;
  empate de `order` vindo de corridas diferentes é desempatado pelo slug (`compareCards`). Ver o 🟢 do
  `batch.set` acima.
- Limite: `links.slice(0, 200)`; o excedente vai em `skipped` com `reason: "limit"`.

## Desvios do handoff conferidos

| # | Veredito |
|---|---|
| 1 (nomes dos hooks) | Confere: `useFindBoardCardBySlug`/`findBoardCardBySlug` e `useFindCardSpecBySlug`/`findCardSpecBySlug`, no mesmo arquivo. |
| 2 (`VALIDATION_FAILED`) | Confere em `card.schema.ts` e no `parseRequestJson`. |
| 3 (sem escrita para card sem mudança) | Confere: `sameFields` conta como `unchanged` e não gera escrita. |
| 4 (data absoluta) | Confere: `BoardSummaryLine.tsx` usa `useFormatDisplayDateTime`. |
| 5 (escape do `marked` 13.0.3) | Confere por leitura e pelo teste "shows & < and quotes...". |
| 6 (tag YAML desconhecida) | Confere: `parseSpecFrontmatter` devolve `{ ok: false }` com qualquer erro ou aviso. |
| 7 (coluna "Etapa removida") | Confere: `groupCardsByColumn` cria a coluna antes de Concluído e `moveTargetOf` devolve `null` para ela, o que a tira do arrastar e do menu. |
| 8 a 11 | Sem impacto de segurança nem de contrato. |

## Correções aplicadas

- `apps/api/(shared)/lib/card-sync.ts`: `RESERVED_CARD_SLUGS` com `sync` e `order`, recusados em `acceptSpecs`
  como `slug_invalid`.
- `apps/api/__tests__/cardSync.test.ts`: teste "skips the slugs taken by the sync and order routes".
- `apps/app/__tests__/specMarkdown.test.tsx`: teste "keeps every link on http(s) for encoded, mixed-case and
  autolinked schemes" e a constante `HTTPS_URL` no topo do módulo (o Biome pede regex fora da função).

## Raio de impacto

- `@repo/kanban-contract`: módulos novos (`boardLanes`, `specBacklog`, `specFrontmatter`), `canPrioritizeCards`
  e o subpath `./spec-frontmatter`. Nada existente muda.
- `@repo/sdk`: `BoardDTO.backlogSync` obrigatório no tipo; a API sempre o preenche. Recurso novo `boardCard`.
  Os consumidores de `BoardDTO`/`BoardViewDTO` no app compilam (typecheck abaixo).
- `apps/api`: coleção nova `card`; `BoardCapability` ganha `prioritize`; a recarga passa a responder 409
  `BOARD_RELOAD_STAGE_HAS_CARDS`.
- `apps/app`: a lista de boards e o assistente de criação passam a levar ao quadro (`/boards/[id]`), não mais à
  Configuração; a navegação do board ganha a seção Quadro.

## Verificar no `/test`

Repro base: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*` de `docs/SETUP.md`, importar
`agent-board-demo/sample-app`.

1. **Arrastar nativo** (afirmação de maior risco do handoff, nunca exercitada em navegador): arrastar com o
   mouse dentro de Tarefas, recarregar a página e conferir a ordem; sincronizar de novo e conferir que a ordem
   não muda. Arrastar de Tarefas para Análise e de volta. A coluna sob arraste usa `bg-accent` + `ring-primary`
   em claro e escuro.
2. **Menu "⋯" por teclado**: Tab até o gatilho, Enter, setas, "Mover para Análise". A região `aria-live`
   anuncia "<título> movido para Análise." e o nome acessível do gatilho é "Ações de <título>".
3. **Sincronização**: Q1 e Q2 do handoff (painel "Backlog ainda não sincronizado", Tarefas com Busca, Atalhos e
   Tema escuro, aviso com `legacy-export.md` e `broken-frontmatter.md`, toast "5 criados", "Não prontas" com
   Slack e fork-cleanup).
4. **Detalhe do card com a spec `search-cards`**: `<script>` e link `javascript:` como texto; imagem como link
   "Imagem: Esboço da busca"; tabela e checkboxes desenhados; links relativos abrem o arquivo no GitHub.
5. **Regra 13 pela API**: `qa-reader` (viewer) recebe 403 em `POST cards/sync`, `PUT cards/order` e
   `POST cards/<slug>/move`, e 200 nos três `GET`; a tela não mostra menu nem arrastar para ele.
   `GET /boards/<boardA>/cards/<slug de card do boardB>` devolve 404 `CARD_NOT_FOUND`. Admin personificando
   recebe a recusa de escrita da personificação.
6. **Foco do título do card**: com Tab, o sublinhado do link aparece em claro e escuro.
7. **Recarga recusada**: com um card em Análise, editar o `board.yml` do falso para remover a etapa e recarregar
   → 409 `BOARD_RELOAD_STAGE_HAS_CARDS` com a copy do `apiErrors`.
8. **Consultas no emulador**: `listByBoard` (`boardId` + `deletedAt == null`) sem pedir índice composto; lote do
   `applySync` com `set` e `update`.
9. **Q5 a Q11 do plano** e 390 px sem rolagem horizontal da página (só dentro da faixa de colunas).
10. **Herdados da `board-members` (rodada 1)**: link ativo da navegação "Seções do board" com fundo
    `secondary` calculado em claro e escuro; os outros links com `buttonVariants` (`Sidebar.tsx`,
    `NotFoundPage.tsx`, `PanelNavbarControls.tsx`, `ProfileDropdown.tsx`, `NotificationsBell.tsx`,
    `BoardsFirstAccess.tsx`, `BoardConfigFileCard.tsx`, `RepositoryPicker.tsx`) sem mudança indesejada; tabela,
    menu de ações, `Popconfirm` e paginação do antd com a mesma aparência depois do `@layer antd`; itens do
    `ActionsMenu` nomeados só "Editar"/"Excluir" (sem "delete"/"edit"), o que agora inclui os itens do menu do
    card.

## Lacunas de teste

| Lacuna | Veredito |
|---|---|
| Sem teste de componente para `BoardColumns` (eventos de drag) e `CardMoveMenu` (itens por posição) | Continua aberta. A lógica que eles chamam tem teste puro; o drag fica para o item 1 acima. |
| `card.repository.ts` sem teste contra o emulador | Continua aberta (item 8). |
| Sem E2E do quadro | Continua aberta; fora do escopo desta spec. |
| Slugs reservados | Fechada aqui. |
| Esquemas codificados no `SpecMarkdown` | Fechada aqui. |

## Decisões em aberto

- **Slug `sync`/`order`**: decidido pela recomendação do `/develop`, reservar na sincronização. Mudar o
  caminho das rotas (`cards/-/sync`) mudaria o SDK e não ganha nada sobre recusar dois nomes.
- **Intervalo entre sincronizações**: hoje não há. Recomendação: manter assim nesta ferramenta pessoal e só
  adicionar um intervalo mínimo por board se o `GITHUB_RATE_LIMITED` aparecer na prática. Pular a leitura
  quando o sha do índice não mudou não resolve, porque uma spec muda sem o índice mudar.
- **Nome da branch**: igual à `board-members`. Recomendação: trocar antes do push; a revisão não trocou.

## Gates

| Gate | Resultado |
|---|---|
| `pnpm check` | `Checked 813 files`, sem erro |
| `pnpm turbo run typecheck` em `api`, `app`, `@repo/sdk`, `@repo/kanban-contract`, `@repo/internationalization` | `5 successful, 5 total` (3 do cache) |
| `apiErrorCodesTranslated` + `cardSync` em `apps/api` | 12/12 |
| `specMarkdown` em `apps/app` | 11/11 |

A suíte inteira não rodou aqui. Os números do handoff (API 1053, app 727, contrato 87) são do `/develop`; as
correções somam dois testes e não mudam comportamento coberto por teste existente.

Varredura de segredo em `docs/features/card-backlog/`, `card-timeline/` e `theme-toggle/`: nenhuma senha,
token, chave ou e-mail real.

## Depois do `/test`, rodada 1

O [`test/report.md`](../test/report.md) achou dois defeitos e três observações 🟢.

- 🟡 **Frontmatter no detalhe do card.** O `GET cards/<slug>/spec` devolvia o arquivo inteiro e o lexer lia o
  bloco `---` como `<hr>` seguido de um título setext ("id: … title: … status: …"). O corte ficou no servidor,
  não no `SpecMarkdown`: o plano da `card-timeline` usa o mesmo componente para o markdown dos eventos, que não
  tem frontmatter, e um corpo de evento começando com `---` perderia texto se o componente cortasse.
  - `packages/kanban-contract/src/specFrontmatter.ts`: `specBody(text)` devolve o que vem depois do bloco,
    pelo mesmo `splitFrontmatter` que a sincronização usa, ou o texto inteiro quando não há bloco.
  - `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/route.ts`: `content` passa por `specBody`.
  - `packages/sdk/src/types/board/card.ts`: o `content` do `CardSpecContentDTO` documenta que vem sem
    frontmatter.
  - Testes: dois casos de `specBody` em `specFrontmatter.test.ts` e "leaves the frontmatter out of the
    content" em `boardCardsRoutes.test.ts`. O teste da rota falhou com a rota antiga e passa com a nova.
- 🟡 **Foco perdido depois de mover pelo menu.** O card é desmontado e montado de novo na lista nova, e o foco
  caía no `body`. `BoardColumns.tsx` guarda o destino (card, coluna e, no reordenar, a posição) quando a ação
  vem do menu, espera o quadro mostrar o card lá e devolve o foco ao gatilho do menu desse card, achado pelo
  `data-card-menu` do invólucro. Começar a arrastar descarta o destino pendente. Se a API recusar, o card não
  chega ao destino e o foco não é movido. Teste novo em `boardColumnsMove.test.tsx` ("puts the keyboard focus
  back on the card's menu after it moves"), conferido falhando sem o `focus()`.
- 🟢 **Selo "approved" em card órfão.** Corrigido: `CardDetailClient.tsx` e `NotReadyCards.tsx` não mostram o
  status da última sincronização quando o card é órfão; o selo "Spec removida" já diz o estado.
- 🟢 **Aviso de arquivos pulados some ao navegar** e **ligadura do `=>` na fonte mono**: ficam como achado, sem
  correção.

O `boardColumnsMove.test.tsx`, criado no `/test`, entra no commit 34. Os demais arquivos tocados continuam nos
commits em que já estavam (5, 8, 25, 34 e 35).

A remedição no browser (detalhe sem frontmatter, foco no gatilho depois de mover por teclado e por reordenar,
card órfão sem o status) fica para a passada de QA da `theme-toggle`.

Gates desta rodada: `pnpm check` com `Checked 814 files`, sem erro; `pnpm turbo run typecheck` em `api`, `app`,
`@repo/sdk` e `@repo/kanban-contract` com `4 successful`; `@repo/kanban-contract` 89/89; na API,
`apiErrorCodesTranslated`, `cardSync` e `boardCardsRoutes` 37/37; no app, `specMarkdown`, `boardColumnsMove` e
`groupCardsByColumn` 25/25.

## Plano de commits (tarefas 1 a 5)

> A tarefa 6 (`theme-toggle`) acrescentou três commits e renumerou esta lista. O plano final das seis tarefas
> está em [`theme-toggle/review/review.md`](../../theme-toggle/review/review.md#plano-de-commits-tarefas-1-a-6);
> mensagens, arquivos e comandos de blob abaixo continuam valendo.

Ordem: pacotes → `apps/api` → `apps/app` → `apps/e2e` → i18n → docs → instruções de agente → specs →
artefatos. Antes do commit 1, `git diff --cached --stat` precisa sair vazio (conferido nesta revisão: vazio).
Depois de cada commit, `git show --stat --oneline HEAD` contra a lista.

### Arquivos mistos

A estratégia é a da `board-members`: arquivo misto entra inteiro no primeiro commit que precisa dele, e a
mensagem diz o que ele já traz. A tarefa 5 acrescenta estes casos:

- `packages/kanban-contract/src/index.ts`: agora com quatro tarefas. Os blobs dos commits 2 e 3 precisam
  excluir também `boardLanes` e `specBacklog`, senão o barril exporta módulo que ainda não existe:
  - commit 2: `grep -vE '\./(boardConfigDiff|boardConfigIssues|boardLanes|specBacklog)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
  - commit 3: `grep -vE '\./(boardLanes|specBacklog)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
  - em cada um, `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/src/index.ts`. O commit 5
    leva o arquivo inteiro com `git add`.
  - Estes comandos substituem o do commit 2 em
    [`board-import/review/review.md`](../../board-import/review/review.md#plano-de-commits-tarefas-1-2-e-3).
- `packages/kanban-contract/package.json`: no commit 3, sem a entrada `./spec-frontmatter`:
  `sed -e '/"\.\/spec-frontmatter"/d' -e 's|"\./src/boardConfigYaml\.ts",|"./src/boardConfigYaml.ts"|' packages/kanban-contract/package.json | git hash-object -w --stdin`
  e `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/package.json`. O commit 5 leva o
  arquivo inteiro.
- `pnpm-lock.yaml`: o blob do commit 3 (só o `yaml`) continua valendo. O arquivo inteiro no commit 11 já traz o
  `marked` do importer `apps/app`, e o commit 12 o declara no `package.json` logo em seguida.
- Os demais mistos da tarefa 5 entram inteiros: `roles.ts`/`roles.test.ts` (commit 4), tipos e client do SDK
  com `card.ts` e `boardCard/action.ts` (commit 8), `github-sample-repositories.ts` (14), `board.mapper.ts`,
  `board.repository.ts`, `board-import.ts` com `map-with-concurrency.ts`, `vitest.config.mts`,
  `boardMapper.test.ts`, `githubFakeClient.test.ts` (19), `board-access.ts` (20), `reload/route.ts` e
  `boardsRoutes.test.ts` (22), `queryKeys.ts` (29), `paths.ts`, `panelTitles.ts`, `BoardSectionNav.tsx`,
  `BoardSettingsClient.tsx`, `BoardsListClient.tsx`, `NewBoardClient.tsx` (30), `BoardMembersClient.tsx` (31),
  i18n (37 e 39), `docs/SETUP.md` (40).
- A coleção `card` (commit 21) precisa vir antes das rotas de board (22), porque a recarga já consulta os cards.

Os commits do app só passam no typecheck com o 39 aplicado (dicionário), e os da API só passam no
`apiErrorCodes` com o 37. O PR fica verde no último commit.

`apps/app/__tests__/boardMembersChangeRole.test.tsx` (criado no `/test` da `board-members`) não estava no plano
anterior; entra no commit 31.

### Lista

1. `feat(shared): add github log scope and BAD_GATEWAY status`
   - `packages/shared/utils/helpers/log.ts`, `packages/shared/utils/helpers/httpStatus.ts`
2. `feat(kanban-contract): add the GitHub identity schema` (`index.ts` por blob)
   - `packages/kanban-contract/src/identity.ts`, `packages/kanban-contract/src/index.ts`,
     `packages/kanban-contract/__tests__/identity.test.ts`
3. `feat(kanban-contract): parse board.yml text and map validation issues` (`index.ts`, `package.json` e
   lockfile por blob)
   - `packages/kanban-contract/package.json`
   - `packages/kanban-contract/src/boardConfig.ts`, `boardConfigIssues.ts`, `boardConfigDiff.ts`,
     `boardConfigYaml.ts`, `index.ts`
   - `packages/kanban-contract/__tests__/boardConfigYaml.test.ts`, `boardConfigIssues.test.ts`,
     `boardConfigDiff.test.ts`
   - `pnpm-lock.yaml`
4. `feat(kanban-contract): add rules for granting and changing board roles`
   - corpo: `Also adds canPrioritizeCards, the operator capability to sync, reorder and move cards.`
   - `packages/kanban-contract/src/roles.ts`, `packages/kanban-contract/__tests__/roles.test.ts`
5. `feat(kanban-contract): add board lanes, backlog index links and spec frontmatter`
   - `packages/kanban-contract/src/boardLanes.ts`, `specBacklog.ts`, `specFrontmatter.ts`, `index.ts`,
     `packages/kanban-contract/package.json`
   - `packages/kanban-contract/__tests__/boardLanes.test.ts`, `specBacklog.test.ts`, `specFrontmatter.test.ts`
6. `feat(design-system): name the ActionsMenu trigger and keep icon names out of its items`
   - `packages/design-system/components/ui/action-menu.tsx`
   - `packages/design-system/__tests__/actionMenu.test.tsx`
7. `feat(sdk): replace Google sign-in with GitHub sign-in`
   - `packages/sdk/package.json`, `packages/sdk/src/types/user/user.ts`,
     `packages/sdk/src/actions/auth/action.ts`
8. `feat(sdk): add boards, board members and board cards resources`
   - corpo: `The board types and client were written together with the members and cards resources, so they ship in one commit.`
   - `packages/sdk/src/types/board/board.ts`, `index.ts`, `member.ts`, `card.ts`,
     `packages/sdk/src/types/index.ts`
   - `packages/sdk/src/actions/board/action.ts`, `packages/sdk/src/actions/boardMember/action.ts`,
     `packages/sdk/src/actions/boardCard/action.ts`
   - `packages/sdk/src/client/index.ts`
9. `refactor(auth): remove Google sign-in and clear a cookie written after sign-out`
   - `packages/auth/client.ts`, `packages/auth/provider.tsx`
10. `feat(auth): refuse sign-in methods other than GitHub outside the emulator`
    - `packages/auth/sign-in-method.ts`, `packages/auth/package.json`, `packages/auth/session.ts`,
      `packages/auth/session-routes.ts`, `packages/auth/server.ts`
    - `packages/auth/__tests__/signInMethod.test.ts`, `serverSessionRevocation.test.ts`,
      `sessionAbsoluteCap.test.ts`, `sessionOrigin.test.ts`, `sessionRefreshRoute.test.ts`,
      `sessionRoutesAuthority.test.ts`
11. `chore(api): declare GitHub App environment variables`
    - `apps/api/env.ts`, `apps/api/.env.example`, `apps/api/package.json`
    - `pnpm-lock.yaml` (inteiro)
12. `chore(app): depend on @repo/kanban-contract and marked`
    - `apps/app/package.json`
13. `fix(design-system): put antd styles in a cascade layer below Tailwind utilities`
    - `packages/design-system/package.json`, `packages/design-system/providers/antd-app.tsx`
    - `packages/design-system/__tests__/antdTheme.test.tsx`
14. `feat(api): add GitHub App client with a sample client for the emulator`
    - corpo: `The sample client answers a fixed repository permission for the QA logins and serves a spec backlog for sample-app.`
    - `apps/api/(shared)/lib/github/github-app-config.ts`, `github-app-jwt.ts`, `github-client.ts`,
      `github-errors.ts`, `github-installation-tokens.ts`, `github-permission-cache.ts`,
      `github-rest-client.ts`, `github-fake-client.ts`, `github-sample-repositories.ts`
    - `apps/api/__tests__/githubAppJwt.test.ts`, `githubRestClient.test.ts`,
      `githubPermissionCache.test.ts`, `githubErrorResponse.test.ts`, `githubClientMode.test.ts`
15. `feat(api): add signed GitHub webhook endpoint`
    - `apps/api/(shared)/lib/github/github-webhook-signature.ts`, `github-webhook-events.ts`
    - `apps/api/(shared)/validation/github-webhook.schema.ts`
    - `apps/api/app/(routes)/github/webhook/route.ts`
    - `apps/api/__tests__/githubWebhookSignature.test.ts`, `githubWebhookRoute.test.ts`
16. `feat(api): warn at boot when the GitHub App is not configured`
    - `apps/api/instrumentation.ts`
    - `apps/api/__tests__/githubBootNotice.test.ts`, `corsOriginBoot.test.ts`
17. `feat(api): replace Google sign-in with GitHub sign-in`
    - `apps/api/(shared)/lib/firebase-identity-toolkit.ts`, `github-identity.ts`, `user-merge.ts`
    - `apps/api/(shared)/validation/auth.schema.ts`
    - `apps/api/app/(routes)/auth/sign-in/github/route.ts`
    - `apps/api/app/(routes)/auth/sign-in/google/route.ts` (removido)
    - `apps/api/proxy.ts`
    - `apps/api/__tests__/authSignInGithubRoute.test.ts`, `firebaseIdentityLookup.test.ts`,
      `corsOrigin.test.ts`
    - `apps/api/__tests__/authSignInGoogleRoute.test.ts`, `authSignInGoogleToolkit.test.ts`,
      `googleSignInProfile.test.ts` (removidos)
18. `feat(api): refuse password sign-in outside the emulator`
    - `apps/api/(shared)/lib/resolve-api-actor.ts`
    - `apps/api/app/(routes)/auth/sign-in/route.ts`
    - `apps/api/__tests__/authSignInRoute.test.ts`, `resolveApiActorSession.test.ts`
19. `feat(api): store boards imported from a repository with their owner member`
    - corpo: `The board repository writes the owner's member document in the same batch, so the member mapper ships here. The board mapper already reads the last backlog sync.`
    - `apps/api/(shared)/validation/board.schema.ts`
    - `apps/api/(shared)/mappers/board.mapper.ts`, `apps/api/(shared)/mappers/board-member.mapper.ts`
    - `apps/api/(shared)/repositories/board.repository.ts`
    - `apps/api/(shared)/lib/board-import.ts`, `apps/api/(shared)/lib/map-with-concurrency.ts`
    - `apps/api/vitest.config.mts`
    - `apps/api/__tests__/boardMapper.test.ts`, `boardMemberMapper.test.ts`, `githubFakeClient.test.ts`
20. `feat(api): resolve the effective board role in a board guard`
    - `apps/api/(shared)/repositories/board-member.repository.ts`
    - `apps/api/(shared)/lib/board-access.ts`, `apps/api/(shared)/lib/board-list.ts`
    - `apps/api/app/(guards)/board.ts`
    - `apps/api/__tests__/boardAccess.test.ts`, `apps/api/__tests__/fakeBoardMemberRepository.ts`
21. `feat(api): add the card collection`
    - `apps/api/(shared)/mappers/card.mapper.ts`, `apps/api/(shared)/repositories/card.repository.ts`
    - `apps/api/__tests__/cardMapper.test.ts`
22. `feat(api): add board routes behind the board role guard`
    - corpo: `Board routes were written against the role guard, so they ship already guarded. Reload refuses a board.yml that removes a stage still holding cards.`
    - `apps/api/app/(routes)/boards/route.ts`, `boards/repositories/route.ts`, `boards/preview/route.ts`,
      `boards/[id]/route.ts`, `boards/[id]/reload/route.ts`
    - `apps/api/__tests__/boardsRoutes.test.ts`
23. `feat(api): add board member routes`
    - `apps/api/(shared)/validation/board-member.schema.ts`
    - `apps/api/app/(routes)/boards/[id]/members/route.ts`,
      `apps/api/app/(routes)/boards/[id]/members/[memberId]/route.ts`
    - `apps/api/__tests__/boardMembersRoutes.test.ts`
24. `feat(api): sync board cards from the spec backlog`
    - `apps/api/(shared)/lib/card-sync.ts`, `apps/api/(shared)/lib/card-order.ts`
    - `apps/api/app/(routes)/boards/[id]/cards/route.ts`, `boards/[id]/cards/sync/route.ts`
    - `apps/api/__tests__/cardSync.test.ts`
25. `feat(api): reorder and move cards and serve their spec`
    - `apps/api/(shared)/lib/card-move.ts`, `apps/api/(shared)/validation/card.schema.ts`
    - `apps/api/app/(routes)/boards/[id]/cards/order/route.ts`, `cards/[slug]/route.ts`,
      `cards/[slug]/move/route.ts`, `cards/[slug]/spec/route.ts`
    - `apps/api/__tests__/cardMove.test.ts`, `boardCardsRoutes.test.ts`, `fakeCardRepository.ts`
26. `feat(app): sign in with GitHub on the sign-in screen`
    - `apps/app/shared/lib/githubSignInApi.ts`, `emulatorSignIn.ts`
    - `apps/app/shared/lib/googleSignInApi.ts` (removido)
    - `apps/app/app/[locale]/(unauthenticated)/sign-in/components/SignInForm.tsx`
    - `apps/app/__tests__/githubSignInApi.test.ts`, `signInForm.test.tsx`,
      `authFormsPersistedSessionRedirect.test.tsx`, `authProviderSessionNotEstablished.test.tsx`,
      `postLoginFullPageNavigation.test.tsx`, `sessionExpiredSignOut.test.tsx`,
      `signInEnterResubmit.test.tsx`
    - `apps/app/__tests__/googleSignInApi.test.ts` (removido)
27. `feat(app): show the GitHub login in the profile menu and allow GitHub avatars`
    - `apps/app/shared/components/ui/ProfileDropdown.tsx`, `apps/app/proxy.ts`
    - `apps/app/__tests__/profileDropdownAccount.test.tsx`, `securityHeaders.test.ts`
28. `test(app): cover a sign-out while the session cookie is being written`
    - `apps/app/__tests__/authProviderSignOutDuringSessionWrite.test.tsx`
29. `feat(app): add board data hooks`
    - corpo: `The board hooks already read the caller's role on each board, and the query keys include the card keys.`
    - `apps/app/shared/lib/queryKeys.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoards.tsx`,
      `useFindBoardById.tsx`, `useBoardCrud.tsx`, `useListImportableRepositories.tsx`,
      `usePreviewBoardImport.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardConfigIssueMessage.ts`
    - `apps/app/__tests__/useBoardCrud.test.tsx`, `boardConfigIssueMessage.test.ts`
30. `feat(app): add boards, new board and board settings screens`
    - corpo: `The list shows the caller's role on each board and opens the board screen; settings links to the board and members sections.`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/`: `BoardCard.tsx`,
      `BoardColumnsPreview.tsx`, `BoardConfigFileCard.tsx`, `BoardConfigIssues.tsx`,
      `BoardReloadResult.tsx`, `BoardRulesSummary.tsx`, `BoardSectionNav.tsx`, `BoardStagesTable.tsx`,
      `BoardsFirstAccess.tsx`, `RepositoryPicker.tsx`, `RepositorySummary.tsx`, `githubFileUrl.ts`,
      `newBoardWizardCopy.ts`, `shortSha.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/(home)/` (3 arquivos),
      `(pages)/[id]/settings/` (3 arquivos), `(pages)/new/` (2 arquivos)
    - `apps/app/__tests__/newBoardWizardCopy.test.tsx`, `githubFileUrl.test.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/paths.ts`,
      `apps/app/app/[locale]/(authenticated)/(common)/routes.tsx`, `apps/app/shared/lib/panelTitles.ts`
31. `feat(app): add the board members screen`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardMembers.tsx`,
      `useBoardMemberCrud.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/inviteMemberSchema.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/InviteMemberForm.tsx`,
      `BoardMembersTable.tsx`, `ChangeMemberRoleDialog.tsx`, `BoardRolesGuide.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/members/` (3 arquivos)
    - `apps/app/__tests__/useBoardMemberCrud.test.tsx`, `boardMembersChangeRole.test.tsx`
32. `fix(app): order the antd layer between Tailwind's preflight and utilities`
    - `apps/app/app/styles.css`, `apps/app/__tests__/stylesLayerOrder.test.ts`
33. `feat(app): add board card data hooks`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardCards.tsx`,
      `useFindBoardCardBySlug.tsx`, `useFindCardSpecBySlug.tsx`, `useBoardCardCrud.tsx`
    - `apps/app/__tests__/useBoardCardCrud.test.tsx`
34. `feat(app): add the board screen with columns, drag and drop and a move menu`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/`: `BoardBacklogEmpty.tsx`,
      `BoardCardItem.tsx`, `BoardColumn.tsx`, `BoardColumns.tsx`, `BoardSummaryLine.tsx`,
      `BoardSyncButton.tsx`, `BoardSyncSkipped.tsx`, `CardMoveMenu.tsx`, `CardStateBadge.tsx`,
      `NotReadyCards.tsx`, `boardColumnTitle.ts`, `groupCardsByColumn.ts`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/page.tsx`, `BoardClient.tsx`,
      `loading.tsx`
    - `apps/app/__tests__/groupCardsByColumn.test.ts`, `boardColumnsMove.test.tsx`
35. `feat(app): add the card detail screen with the spec drawn from markdown`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecMarkdown.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/cards/[slug]/page.tsx`,
      `CardDetailClient.tsx`, `loading.tsx`
    - `apps/app/__tests__/specMarkdown.test.tsx`
36. `test(e2e): cover GitHub sign-in through the emulator popup`
    - `apps/e2e/tests/githubSignIn.spec.ts`
37. `feat(internationalization): add copy for GitHub, sign-in, board, board member and card error codes`
    - `packages/internationalization/translations/packages/shared/utils.ts`
38. `feat(internationalization): replace Google sign-in copy with GitHub`
    - `packages/internationalization/translations/apps/app/pages/signIn/index.ts`
    - `packages/internationalization/translations/packages/auth/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/account.ts`
39. `feat(internationalization): add boards, board members and board cards copy`
    - `packages/internationalization/translations/apps/app/pages/common/boards.ts`
    - `packages/internationalization/translations/apps/app/pages/common/index.ts`
    - `packages/internationalization/translations/apps/app/pages/common/routes/index.ts`
40. `docs: document GitHub App, GitHub sign-in and the sample client used in QA`
    - corpo: `Covers the QA logins and the spec backlog of sample-app.`
    - `docs/SETUP.md`, `docs/PRE-PRODUCTION.md`
41. `docs: describe GitHub as the only sign-in method`
    - `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/AUTH-PANEL.md`, `docs/board/ACCESS.md`,
      `docs/board/README.md`, `docs/board/DECISIONS.md`, `docs/board/ROADMAP.md`
42. `docs(board): name the board, member and card collections`
    - `docs/board/ARCHITECTURE.md`
43. `chore(claude): state GitHub as the sign-in method in agent instructions`
    - `CLAUDE.md`, `AGENTS.md`, `apps/app/CLAUDE.md`
44. `docs(specs): reconcile backlog with the code`
    - `specs/BACKLOG.md`, `specs/reference/AUDIT.md`, `specs/features/board-import.md`,
      `specs/features/board-members.md`, `specs/features/github-app-integration.md`,
      `specs/features/github-sign-in.md`, `specs/features/spec-discovery.md`,
      `specs/features/card-backlog.md`, `specs/features/card-timeline.md`, `specs/features/theme-toggle.md`
45. `docs(features): github-app-integration` · `docs/features/github-app-integration/`
46. `docs(features): github-sign-in` · `docs/features/github-sign-in/`
47. `docs(features): board-import` · `docs/features/board-import/`
48. `docs(features): board-members` · `docs/features/board-members/`
49. `docs(features): card-backlog` · `docs/features/card-backlog/`
50. `docs(features): card-timeline` · `docs/features/card-timeline/` (só o plano; a spec ainda não foi
    implementada)
51. `docs(features): theme-toggle` · `docs/features/theme-toggle/` (só o plano)

Os arquivos removidos entram com `git add` explícito do caminho (ou `git rm`) no commit correspondente. Toda
mensagem termina com a linha de coautoria definida na sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members and cards`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
