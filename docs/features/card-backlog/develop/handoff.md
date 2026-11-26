# Handoff do /develop: card-backlog

Implementação do plano `analyze/plan.md`, feita no `/cycle` noturno sem perguntas. Nada foi commitado. A branch
de trabalho continua `guilhermebittelbrunn/chore-cycle-three-tasks`, com as tarefas 1 a 4 (`github-app-integration`,
`github-sign-in`, `board-import`, `board-members`) também no working tree sem commit.

## Blueprint → arquivos

### Contrato (`packages/kanban-contract`)

| Item | Arquivos |
|------|----------|
| Faixas e colunas do quadro | `src/boardLanes.ts` (novo): `CARD_LANES`, `CardLane`, `BoardColumn`, `BoardStageColumn`, `stageColumnId`, `boardColumns`, `isCardReady` |
| Capacidade de priorizar | `src/roles.ts`: `canPrioritizeCards` (`operator`+) |
| Links do índice | `src/specBacklog.ts` (novo): `extractBacklogLinks`, `resolveRepoPath`, `folderOf` |
| Frontmatter da spec | `src/specFrontmatter.ts` (novo, subpath `./spec-frontmatter`): `parseSpecFrontmatter`, `firstHeading` |
| Exportação | `src/index.ts` (barril ganha `boardLanes` e `specBacklog`), `package.json` (export `./spec-frontmatter`) |
| Testes | `__tests__/boardLanes.test.ts`, `specBacklog.test.ts`, `specFrontmatter.test.ts` (novos), `roles.test.ts` (caso de `canPrioritizeCards`) |

### SDK (`packages/sdk`)

| Item | Arquivos |
|------|----------|
| Tipos | `src/types/board/card.ts` (novo): `CardDTO`, `CardSpecDTO`, `CardSyncSkipReason`, `CardSyncSkipDTO`, `BoardBacklogSyncDTO`, `CardSyncResultDTO`, `ReorderCardsRequest`, `MoveCardRequest`, `CardSpecContentDTO`; `types/board/index.ts` reexporta |
| `BoardDTO.backlogSync` | `src/types/board/board.ts` |
| Action | `src/actions/boardCard/action.ts` (novo): `list`, `findBySlug`, `findSpec`, `sync`, `reorder`, `move` |
| Registro | `src/client/index.ts`: campo `boardCard` |

### API (`apps/api`)

| Item | Arquivos |
|------|----------|
| Helper de concorrência extraído | `(shared)/lib/map-with-concurrency.ts` (novo); `(shared)/lib/board-import.ts` importa dele |
| Capacidade `prioritize` | `(shared)/lib/board-access.ts` |
| Mapper e id | `(shared)/mappers/card.mapper.ts` (novo): `CARD_TABLE = "card"`, `cardIdFor`, `cardMapper`, `CardRecord`, `toCardDTO` |
| `backlogSync` no board | `(shared)/mappers/board.mapper.ts` (lê; `toPersistence` não escreve o campo), `(shared)/repositories/board.repository.ts` (`recordBacklogSync`) |
| Repositório | `(shared)/repositories/card.repository.ts` (novo): `listByBoard`, `findBySlug`, `applySync`, `reorder`, `move` |
| Sincronização | `(shared)/lib/card-sync.ts` (novo): `readBacklog`, `planBacklogSync`, `branchFor`, `BACKLOG_SYNC_MAX_FILES` |
| Mover | `(shared)/lib/card-move.ts` (novo): `decideCardMove` |
| Ordenação | `(shared)/lib/card-order.ts` (novo): `compareCards`, `sortCards`, `nextTasksOrder` |
| Validação | `(shared)/validation/card.schema.ts` (novo): `parseMoveCard`, `parseReorderCards` |
| Rotas | `app/(routes)/boards/[id]/cards/route.ts` (GET), `cards/sync/route.ts` (POST), `cards/order/route.ts` (PUT), `cards/[slug]/route.ts` (GET), `cards/[slug]/move/route.ts` (POST), `cards/[slug]/spec/route.ts` (GET) |
| Recusa de recarga | `app/(routes)/boards/[id]/reload/route.ts` |
| Backlog do cliente falso | `(shared)/lib/github/github-sample-repositories.ts`: `SAMPLE_BACKLOG_INDEX_PATH`, `SAMPLE_BACKLOG_FILES`, arquivos no `sample-app` |
| Alias do subpath | `vitest.config.mts` |
| Testes | `__tests__/cardSync.test.ts`, `cardMove.test.ts`, `cardMapper.test.ts`, `boardCardsRoutes.test.ts`, `fakeCardRepository.ts` (novos); `boardsRoutes.test.ts`, `boardMapper.test.ts`, `githubFakeClient.test.ts` (acréscimos) |

### App (`apps/app`)

Prefixo: `app/[locale]/(authenticated)/(common)/(pages)/boards/`.

| Item | Arquivos |
|------|----------|
| Dependência | `apps/app/package.json` (`marked: 13.0.3`), `pnpm-lock.yaml` (3 linhas no importer do app) |
| Chaves de cache, rotas, títulos | `shared/lib/queryKeys.ts` (`boards.cards`, `boards.card`, `boards.cardSpec`), `(common)/paths.ts` (`boards.detail`, `boards.card`), `shared/lib/panelTitles.ts` (`/boards/[id]`, `/boards/[id]/cards/[slug]`) |
| Hooks | `(hooks)/useListBoardCards.tsx`, `useFindBoardCardBySlug.tsx`, `useFindCardSpecBySlug.tsx`, `useBoardCardCrud.tsx` (novos) |
| Componentes | `(components)/BoardColumns.tsx`, `BoardColumn.tsx`, `BoardCardItem.tsx`, `CardMoveMenu.tsx`, `CardStateBadge.tsx`, `BoardBacklogEmpty.tsx`, `NotReadyCards.tsx`, `BoardSyncSkipped.tsx`, `BoardSyncButton.tsx`, `BoardSummaryLine.tsx`, `SpecMarkdown.tsx`, `groupCardsByColumn.ts`, `boardColumnTitle.ts` (novos) |
| Nav do board | `(components)/BoardSectionNav.tsx` (seção `board`, ordem Quadro · Membros · Configuração), `(pages)/[id]/settings/BoardSettingsClient.tsx` e `(pages)/[id]/members/BoardMembersClient.tsx` (link `board`) |
| Quadro | `(pages)/[id]/page.tsx`, `BoardClient.tsx`, `loading.tsx` (novos) |
| Detalhe do card | `(pages)/[id]/cards/[slug]/page.tsx`, `CardDetailClient.tsx`, `loading.tsx` (novos) |
| Links para o quadro | `(pages)/(home)/BoardsListClient.tsx` (card da lista), `(pages)/new/NewBoardClient.tsx` (depois de criar e "Abrir board") |
| Testes | `apps/app/__tests__/specMarkdown.test.tsx`, `useBoardCardCrud.test.tsx`, `groupCardsByColumn.test.ts` (novos) |

### i18n (`packages/internationalization`)

- `translations/apps/app/pages/common/boards.ts`: `nav.board`, bloco `board` (cabeçalho, sincronização, aviso de
  arquivos pulados, colunas, estado vazio, "Não prontas", card) e bloco `cardDetail`.
- `translations/apps/app/pages/common/routes/index.ts`: `boards.board` e `boards.card`.
- `translations/packages/shared/utils.ts`: os 7 códigos novos de `apiErrors`.

### Docs

- `docs/board/ARCHITECTURE.md`: a tabela de dados usa os nomes reais (`board`, `boardMember`, `card`), com os
  campos que existem hoje, e diz que as outras coleções ainda não foram criadas.
- `docs/SETUP.md`: tabela do backlog do `sample-app` e o que cada arquivo exercita.
- `docs/PRE-PRODUCTION.md`: sem mudança (nenhuma infra nova).

## Separar os commits

Vários arquivos já tinham diff das tarefas 1 a 4. Abaixo, o trecho que é desta tarefa em cada um, para o `/review`
montar os commits desta spec depois dos delas.

| Arquivo compartilhado | Trecho desta tarefa |
|-----------------------|---------------------|
| `packages/kanban-contract/src/roles.ts` | A função `canPrioritizeCards` e o comentário dela |
| `packages/kanban-contract/src/index.ts` | As linhas `export * from "./boardLanes"` e `export * from "./specBacklog"` |
| `packages/kanban-contract/package.json` | A entrada `"./spec-frontmatter"` em `exports` |
| `packages/kanban-contract/__tests__/roles.test.ts` | O import de `canPrioritizeCards` e o teste "lets only operators and above prioritize cards" |
| `packages/sdk/src/types/board/board.ts` | O import de `BoardBacklogSyncDTO` e o campo `backlogSync` de `BoardDTO` |
| `packages/sdk/src/types/board/index.ts` | `export * from "./card"` |
| `packages/sdk/src/client/index.ts` | Import, campo e `new BoardCardActions(this)` |
| `apps/api/(shared)/lib/board-access.ts` | Import de `canPrioritizeCards`, `"prioritize"` em `BoardCapability` e no `CAPABILITY_CHECK` |
| `apps/api/(shared)/lib/board-import.ts` | Remoção da função local `mapWithConcurrency` e o import do módulo novo |
| `apps/api/(shared)/mappers/board.mapper.ts` | Import de `BoardBacklogSyncDTO`, `"backlogSync"` no `Omit` de `BoardRecordInput`, o tipo `BoardBacklogSyncInput`, a função `toBacklogSync` e a linha `backlogSync:` em `toDTO` |
| `apps/api/(shared)/repositories/board.repository.ts` | Imports de `BoardBacklogSyncDTO`/`BoardBacklogSyncInput` e o método `recordBacklogSync` |
| `apps/api/(shared)/lib/github/github-sample-repositories.ts` | Do `SAMPLE_BACKLOG_INDEX_PATH` até o fim de `SAMPLE_BACKLOG_FILES`, e o `...SAMPLE_BACKLOG_FILES` no `sample-app` |
| `apps/api/app/(routes)/boards/[id]/reload/route.ts` | Imports de `HTTP_STATUS` e `cardRepository`, a função `removesColumnWithCards`, o bloco `changes`/recusa antes do `readAt` e `changes` reaproveitado na resposta |
| `apps/api/vitest.config.mts` | O alias `@repo/kanban-contract/spec-frontmatter` |
| `apps/api/__tests__/boardsRoutes.test.ts` | `listCardsMock` (hoisted, reset e `mockResolvedValue([])`), o `vi.mock` de `card.repository` e o `describe("when the new file removes a column")` |
| `apps/api/__tests__/boardMapper.test.ts` | `backlogSync: null` no `toEqual` e o `describe("boardMapper.toDTO backlogSync")` |
| `apps/api/__tests__/githubFakeClient.test.ts` | Imports de `parseSpecFrontmatter`/`SAMPLE_BACKLOG_INDEX_PATH` e o teste "serves the sample-app backlog…" |
| `apps/app/package.json`, `pnpm-lock.yaml` | A linha `"marked": "13.0.3"` e as 3 linhas `marked` no importer `apps/app` do lockfile |
| `apps/app/shared/lib/queryKeys.ts` | `cards`, `card`, `cardSpec` em `boards` |
| `apps/app/shared/lib/panelTitles.ts` | As entradas `/boards/[id]` e `/boards/[id]/cards/[slug]` |
| `apps/app/app/[locale]/(authenticated)/(common)/paths.ts` | `boards.detail` e `boards.card` |
| `.../boards/(components)/BoardSectionNav.tsx` | `"board"` em `BoardSection` e `SECTIONS` reordenado |
| `.../boards/(pages)/[id]/settings/BoardSettingsClient.tsx`, `.../members/BoardMembersClient.tsx` | A linha `board: routes.boards.detail(id).url` nos `links` da nav |
| `.../boards/(pages)/(home)/BoardsListClient.tsx` | `settings(board.id)` → `detail(board.id)` |
| `.../boards/(pages)/new/NewBoardClient.tsx` | As duas trocas `settings(...)` → `detail(...)` |
| `translations/apps/app/pages/common/boards.ts` | `nav.board`, os blocos `board` e `cardDetail` |
| `translations/apps/app/pages/common/routes/index.ts` | `board` e `card` em `boards` |
| `translations/packages/shared/utils.ts` | De `BOARD_BACKLOG_SOURCE_MANUAL` até `CARD_ORDER_STALE` |
| `docs/board/ARCHITECTURE.md`, `docs/SETUP.md` | O parágrafo e as três linhas da tabela de dados; a seção do backlog do `sample-app` |

Ordem sugerida, ajustada ao plano (10.9): contrato; SDK; `refactor(api)` só com `map-with-concurrency.ts` e
`board-import.ts`; backlog do cliente falso com o teste do falso; cards e sincronização (mapper, repositório,
`card-sync`, `card-order`, rotas GET/sync, `backlogSync`, `prioritize`, testes); mover e reordenar (`card-move`,
schema, rotas order/move/spec, testes); recusa da recarga; i18n; hooks do app; quadro; detalhe com `marked` e
`SpecMarkdown`; docs; `docs(features): card-backlog`. Os testes de rota (`boardCardsRoutes.test.ts`) cobrem sync,
order, move e spec juntos: o arquivo entra no commit de mover e reordenar, que é o primeiro em que todas as rotas
existem.

## Contrato mexido e quem consome

- `BoardDTO` ganhou `backlogSync: BoardBacklogSyncDTO | null`, obrigatório no tipo. A API sempre preenche (o mapper
  devolve `null` quando o campo falta). `BoardRecordInput` exclui o campo, então `createForRepository` e
  `applyReload` não mudaram de assinatura. Consumidores de `BoardDTO`/`BoardViewDTO` no app compilam sem ajuste
  (`pnpm --filter app typecheck` verde).
- `@repo/kanban-contract` ganhou o subpath `./spec-frontmatter`; só a API importa dele. O barril principal ganhou
  `boardLanes` e `specBacklog`, que não dependem de `yaml`.
- `Client.boardCard` (nova action). Consumida pelos hooks novos e pelos `page.tsx` do quadro e do detalhe.
- `BoardCapability` ganhou `"prioritize"`.

## Códigos de erro novos

`BOARD_BACKLOG_SOURCE_MANUAL` (409), `BOARD_BACKLOG_INDEX_NOT_FOUND` (422), `BOARD_RELOAD_STAGE_HAS_CARDS` (409),
`CARD_NOT_FOUND` (404), `CARD_NOT_READY` (409), `CARD_STAGE_NOT_FOUND` (422), `CARD_ORDER_STALE` (409). Os sete
estão em `apiErrors`; `apiErrorCodesTranslated.test.ts` passou na suíte da API (falhou antes de adicioná-los e
passou depois).

## Desvios em relação ao plano

1. **Nomes dos hooks por id.** O plano chamava `useFindBoardCard` e `useFindCardSpec`. A regra de nomes do app
   (`useFind` + recurso + `By` + parâmetro) manda `useFindBoardCardBySlug` + `findBoardCardBySlug` e
   `useFindCardSpecBySlug` + `findCardSpecBySlug`. Segui a regra. **O plano da `card-timeline` cita
   `useFindBoardCard`**: quem implementar aquela spec usa os nomes novos.
2. **Código de validação.** O plano (10.5) cita `VALIDATION_ERROR`; o código que a API já usa é
   `VALIDATION_FAILED`, e foi o que as rotas novas usam.
3. **Sincronização sem escrita para card sem mudança.** O plano descreve `syncedAt` como "última sincronização que
   viu ou marcou o card". Para não gastar uma escrita por card a cada clique, só cards criados, alterados ou que
   viraram órfãos recebem `syncedAt`. O instante da última sincronização do board fica em `board.backlogSync`.
4. **`syncedAt` do cabeçalho em data absoluta.** O plano pedia "Sincronizado há …"; usei "Backlog sincronizado em
   {data}" com o `useFormatDisplayDateTime`, que já resolve o fuso no servidor. Tempo relativo renderizado no
   servidor e no cliente dá diferença de hidratação.
5. **Escape do `marked` 13.0.3 confirmado.** O lexer entrega `text`, `codespan` e o texto de imagem já escapados
   (`a &amp; b`); `code` em bloco vem cru. `SpecMarkdown` decodifica as cinco entidades que o `marked` produz antes
   de desenhar (`decodeMarkedText`). O teste "shows & < and quotes in text and inline code as written" cobra.
6. **Tag YAML desconhecida.** O pacote `yaml` trata `!!js/function` como aviso e devolve a string. O
   `parseSpecFrontmatter` recusa frontmatter com qualquer aviso (`{ ok: false }`), além dos erros.
7. **Coluna "Etapa removida".** O plano só cita o caso no teste de agrupamento. Um card com `stageKey` que saiu do
   `board.yml` ganha uma coluna própria antes de Concluído, sem destino de soltar e fora do menu "Mover para".
8. **Painel vazio e "Não prontas".** O painel do `BoardEmpty.png` aparece quando nenhuma coluna tem card; a seção
   recolhível "Não prontas" aparece só quando há card no quadro, para a mesma lista não sair duas vezes.
9. **Títulos das specs com cabeçalho rebaixado.** `SpecMarkdown` desenha `#` como `h2` (e assim por diante, até
   `h6`), porque a página já tem o `h1` do título do card.
10. **`SpecMarkdown` com a base dos links por prop** (`links: { owner, name, ref, documentPath }`), como o plano da
    `card-timeline` pede. `documentPath: ""` resolve a partir da raiz.
11. **`decideCardMove` recebe só `lane`, `stageKey` e `ready`**, e o "fim da fila" ao voltar para Tarefas usa o
    maior `order` entre todos os cards do board, não só os de Tarefas. Isso mantém o número crescente e simples;
    a tela ordena só os prontos de Tarefas.

Nenhuma decisão consolidada do plano foi reaberta.

## Pontos de encaixe para as próximas specs

- `card-timeline`: `cardIdFor` em `(shared)/mappers/card.mapper.ts`; `SpecMarkdown` com `links`; `BoardCardItem`
  usa `<CardStateBadge state={card.state} />` (trocar por `displayCardState(card)` é uma linha);
  `CardDetailClient` tem `CardSummary` e `SpecSection` como componentes separados, prontos para virar abas; o
  falso de cards é `apps/api/__tests__/fakeCardRepository.ts` (`createFakeCardRepository`, com `seed`). Diferença:
  os hooks se chamam `useFindBoardCardBySlug`/`useFindCardSpecBySlug` (desvio 1).
- `theme-toggle`: `boards/**` usa só tokens do tema. Varredura com o mesmo padrão do teste planejado
  (`grep -rnE` de hex, `rgb(`/`hsl(`/`oklch(` e classes de paleta do Tailwind) em
  `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards`: zero ocorrências.

## Decisões em aberto e pendências

- **Slug `sync` ou `order`.** As rotas estáticas `cards/sync` e `cards/order` ficam ao lado de `cards/[slug]`. Uma
  spec com `id: sync` ou `id: order` vira card, mas `GET cards/sync` cai na rota estática (só `POST`) e o detalhe
  desse card não abre. Não tratei: precisa de decisão (reservar os dois slugs na sincronização, com `skipped:
  slug_invalid`, ou mudar o caminho das rotas). Recomendação: reservar na sincronização.
- O plano lista `@dnd-kit` e `react-markdown` como alternativas; nenhuma foi adotada (perguntas 1 e 2 do plano).
- Sem smoke local: o ambiente não subiu emulador, API nem app nesta etapa. Tudo que depende de UI está em "A
  verificar no `/test`".

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 813 arquivos, sem erro |
| Gates do CI sem emulador | `pnpm turbo run lint typecheck test` | 25 de 25 tasks com sucesso (9 do cache) |
| Contrato | (incluído acima) | 10 arquivos, 87 testes |
| API | (incluído acima) | 87 arquivos, 1053 testes |
| App | (incluído acima) | 103 arquivos, 727 testes |
| `apiErrors` | `apiErrorCodesTranslated.test.ts` na suíte da API | passa |
| i18n | `pnpm --filter @repo/internationalization typecheck` | verde |
| Dependência | `pnpm install --prefer-offline` depois de declarar `marked` | `downloaded 0, added 0`; lockfile com 3 linhas novas (`marked` 13.0.3 no importer do app) |

`test:emulator` não rodou: nenhuma rule nem índice mudou, e as consultas novas são de igualdade sem índice composto.

O `pnpm install --offline` puro falhou (`ERR_PNPM_NO_OFFLINE_META`: o cache local não tinha os metadados do
`marked`). O `--prefer-offline` leu os metadados e não baixou nenhum pacote.

## A verificar no `/test`

Nada abaixo foi medido nesta etapa. Repro sugerido: `pnpm emulators` + `pnpm seed` + `pnpm dev`, login com as
contas `qa-*` (ver `docs/SETUP.md`), importar `agent-board-demo/sample-app`.

- Q1: criar o board leva a `/boards/[id]` com o painel "Backlog ainda não sincronizado".
- Q2: "Sincronizar backlog" mostra Tarefas com Busca, Atalhos e Tema escuro nessa ordem; o aviso com
  `legacy-export.md` e `broken-frontmatter.md`; o toast "Backlog sincronizado: 5 criados, 0 atualizados, 0
  órfãos."; "Não prontas" com Slack e fork-cleanup.
- Q3: arrastar com o mouse dentro de Tarefas e recarregar mantém a ordem; sincronizar de novo não desfaz. O drag
  nativo nunca foi exercitado em navegador.
- Q4: menu "⋯" por teclado (Tab, Enter, setas) move para Análise; o card mostra `feat/<slug>` em mono e o selo
  "Parado"; a região `aria-live` anuncia "<título> movido para Análise.".
- Q5 a Q11 do plano (Concluído e volta para Tarefas, detalhe com a spec, `qa-reader` sem menu nem arrastar, órfão,
  recarga recusada com `BOARD_RELOAD_STAGE_HAS_CARDS`, personificação, 390 px sem rolagem horizontal da página).
- Detalhe do card: o `<script>` e o link `javascript:` da spec `search-cards` aparecem como texto; a imagem vira
  o link "Imagem: Esboço da busca"; tabela e checkboxes de tarefa renderizam. Coberto por teste em jsdom, não
  visto em navegador.
- Tema claro e escuro: a coluna sob arraste usa `bg-accent` + `ring-primary`; os selos usam as variantes atuais
  do `badge.tsx`.

## Lacunas de teste conhecidas

- Nenhum teste de componente para `BoardColumns` (eventos de drag) nem para `CardMoveMenu` (itens por posição).
  A lógica que eles chamam (`reorderedSlugs`, `moveTargetOf`, `isCardInColumn`) tem teste puro.
- `card.repository.ts` não tem teste contra o emulador (lotes de 500, `set` na criação). As rotas usam o
  repositório falso.
- Sem E2E para o quadro.
