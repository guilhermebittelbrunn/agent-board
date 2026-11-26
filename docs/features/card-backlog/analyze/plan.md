# Plano: cards a partir do backlog de specs e board com colunas

Spec de origem: [`specs/features/card-backlog.md`](../../../../specs/features/card-backlog.md) (status `proposed`
quando o `/cycle` a executou, a pedido do usuário). Depende de `board-import` e `board-members`, que estão no
working tree sem commit, junto com `github-app-integration` e `github-sign-in`. Este plano parte do código como
está no working tree em 2026-11-26.

## Etapa 1: análise

### 1. Contexto

O repositório importado já guarda o backlog em `specs/`, com a ordem em `specs/BACKLOG.md`. Hoje o board existe
(lista, importação, configuração, membros), mas não tem quadro: `/boards/[id]` nem existe, e todos os links
levam para `/boards/[id]/settings` (`BoardsListClient.tsx:83`, `NewBoardClient.tsx:105` e `:236`). Esta spec
cria o quadro, a coleção de cards e a sincronização com o backlog do repositório.

**Valor para o usuário:** o time vê o backlog como cards, decide a ordem de Tarefas e acompanha em que coluna
cada spec está. É a tela principal do produto (`Main.png`) e a base de `card-timeline`, `orchestrator` e
`theme-toggle`.

**Corte de MVP** (o da spec, sem mudança):

1. "Sincronizar backlog" lê `backlog.index`, cria um card por spec; as que têm status `readyStatus` vão para
   Tarefas, as demais ficam "não prontas", visíveis, fora de Tarefas.
2. O card guarda slug (id da spec), título, caminho e sha da spec, ordem e posição.
3. Quadro com uma coluna por etapa do `board.yml`, mais Tarefas e Concluído. Card com título, estado (selo) e
   branch.
4. Reordenar Tarefas; a ordem do board passa a valer sobre a do `BACKLOG.md`.
5. Mover um card para outra coluna só muda a posição. Nada é disparado.
6. Abrir o card mostra a spec renderizada.

**Fora de escopo** (spec, telas e dependências):

- Disparo de etapa, fila, `runs`, selos de execução reais, "Rodar de novo", "Aprovar e seguir", diálogo
  "Disparar etapa" (`TriggerStage.png`) e a folha "Mover card" com credencial (`MMove.png`): spec
  `orchestrator`.
- Linha do tempo, perguntas, abas Artefatos/Execuções do detalhe (`CardDetail.png`): spec `card-timeline`.
- Coluna Rascunhos, "Nova spec", "Descobrir specs": `spec-authoring` e `spec-discovery`. Coluna Aguardando PR:
  `pr-flow`. "Rodar ciclo" e selo de ciclo: `cycle-runs`.
- Cabeçalho próprio do board (logo, menu Quadro · Ciclos · …, botão de tema, estado do runner): `theme-toggle`,
  `local-runner` e as specs de cada item. O quadro entra no layout atual do painel, como `board-import` decidiu.
- Busca e filtros do quadro (`Main.png`: "Buscar card…", "Aguardando você · 2"): sem spec hoje; ficam fora.
- Painel "Ninguém pode rodar etapas ainda" de `BoardEmpty.png`: `local-runner`.
- Criar card sem spec (`backlog.source: manual`).
- Escrever a ordem do board de volta no `BACKLOG.md` (pergunta da spec; recomendação "não no MVP", adotada).

**Fronteira com o `orchestrator` (regra de ouro 14).** Aqui o card só muda de lugar por ação de uma pessoa, numa
rota própria (`POST /boards/[id]/cards/[slug]/move`) que grava `lane` e `stageKey` e não toca em `state` nem em
`reworkLoops`. Nenhuma rota desta spec chama `resolveTransition`, cria `run` ou escreve `state`; todo card nasce
`idle` e continua `idle`. Quando o `orchestrator` chegar, ele troca o "mover" para uma coluna de etapa por
"disparar" (com papel `operator` checado de novo, fila e recusa durante execução) e passa a ser o único a mudar
`state`. A rota `move` continua servindo Tarefas e Concluído, ou é substituída; a decisão é dele.

### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/card-backlog.md` | Corte, riscos (biblioteca de drag-and-drop acessível; spec removida vira órfã), sinais de pronto |
| `.claude/cycle-policy.md` | Sem dependência nova sem relatório; modo degradado com `error.code`; corte da spec manda |
| `docs/board/ARCHITECTURE.md:36-74` | Ciclo do card, colunas, campos de `cards` |
| `docs/board/ACCESS.md` | `operator` prioriza e arrasta; `viewer` só vê |
| `docs/design/README.md` + `Main.png`, `BoardEmpty.png`, `MBoard.png` | Layout, textos, estados, colunas, celular em lista vertical, mover pelo menu "⋯" no celular |
| `packages/kanban-contract/src/cardState.ts:3-24` | `CARD_STATES`, `CardPosition` (`stageKey`, `state`, `reworkLoops`) |
| `packages/kanban-contract/src/boardConfig.ts:49-55` | `backlog.source`, `backlog.index`, `backlog.readyStatus` |
| `packages/kanban-contract/src/roles.ts:43-57` | Predicados de papel; não há um para "priorizar" |
| `apps/api/app/(guards)/board.ts` + `(shared)/lib/board-access.ts:27-41` | `requireBoardApi(capability)` e o mapa capacidade → predicado |
| `apps/api/(shared)/lib/github/github-client.ts:24-35` | `GithubClient.readFile(repo, path, ref)`; não lista diretório |
| `apps/api/(shared)/lib/github/github-fake-client.ts:71-80` | O falso só responde `readFile` na branch padrão |
| `apps/api/(shared)/lib/github/github-sample-repositories.ts:176-195` | `sample-app` tem só `.kanban/board.yml` |
| `apps/api/app/(routes)/boards/[id]/reload/route.ts:42-63` | Recarga aplica sem olhar cards |
| `docs/features/board-import/analyze/plan.md:26-27, 230-231, 308` | Deixou para cá a recusa de recarga com coluna removida que tem cards e a página `/boards/[id]` |
| `docs/features/board-import/develop/handoff.md` (desvio 2) | `/boards/[id]` não foi criada porque o `panelTitles.test.ts` exige título próprio por página |
| `docs/features/board-members/develop/handoff.md` | `BoardViewDTO`, `access.effectiveRole`, contas `qa-*` do cliente falso, `ActionsMenu.triggerLabel` |
| `specs/README.md:23-45` | Frontmatter das specs (`id`, `title`, `status`) |
| `specs/BACKLOG.md` | Formato real do índice: links markdown `features/<id>.md` em tabelas, mais links para docs e para specs entregues em `docs/features/<slug>/spec.md` |
| `pnpm-lock.yaml` | Nenhuma lib de drag-and-drop nem de markdown direta; `marked@13.0.3` já resolvido (transitivo de `firebase-tools`) |

Referências não lidas: o canvas do Claude Design (`claude.ai/artifact/…`) é privado. Usei as cópias em
`docs/design/screens/` e `docs/design/screenshots/`, que o próprio README da pasta declara equivalentes.

### 2. Dados (Firestore)

#### 2.1 Coleção `card` (nova)

Nome no singular, como `board` e `boardMember`. Id determinístico `<boardId>__<slug>` (precedente:
`memberIdFor` em `board-member.mapper.ts`). O slug segue `isValidSlug` (só `[a-z0-9-]`), então `__` separa sem
ambiguidade, e duas sincronizações ao mesmo tempo não criam card duplicado.

| Campo | Tipo | Default | `null`? | Por quê |
|-------|------|---------|---------|---------|
| `boardId` | string | | não | Escopo do card; consulta por igualdade |
| `slug` | string | | não | Id da spec; vai na URL do card |
| `title` | string | | não | `title` do frontmatter, senão o primeiro `# ` do arquivo, senão o slug |
| `spec` | `{ path, sha, status }` | | não | Caminho no repositório, sha do blob e status do frontmatter na última sincronização |
| `ready` | boolean | | não | `status === readyStatus` e não órfão. Gravado para a tela não recalcular com uma config diferente |
| `orphan` | boolean | `false` | não | A spec saiu do índice ou o arquivo sumiu. O card fica |
| `lane` | `"tasks" \| "stage" \| "done"` | `"tasks"` | não | Em que faixa do quadro o card está |
| `stageKey` | string | `null` | sim | Só com `lane === "stage"`; é a `key` da etapa, que sobrevive à recarga (o título da coluna pode mudar) |
| `state` | `CardState` | `"idle"` | não | Do contrato. Nesta spec nunca muda |
| `reworkLoops` | number | `0` | não | Do contrato. Nesta spec nunca muda |
| `order` | number | | não | Posição em Tarefas (inteiro, 0 = topo). Nas outras faixas não é usada |
| `branch` | string | | sim | `resolveBranchName(config, slug)`; `null` se o slug ou o padrão não permitirem |
| `movedAt` | Timestamp | `null` | sim | Última mudança de faixa; ordena as colunas de etapa e Concluído (mais antigo em cima) |
| `movedByUserId` | string | `null` | sim | Quem moveu por último (perfil `user`) |
| `syncedAt` | Timestamp | | não | Última sincronização que viu ou marcou o card |
| `createdAt`, `updatedAt`, `deletedAt` | Timestamp | | `deletedAt` sim | Padrão do `BaseRepository` |

Invariante: `lane === "stage"` se e somente se `stageKey !== null`. O mapper normaliza `Timestamp` → ISO.

#### 2.2 Board: metadado da última sincronização

`board` ganha `backlogSync: { indexPath, indexSha, ref, syncedAt, specCount } | null`, `null` em boards
antigos (o mapper põe `null` quando o campo falta). Serve para distinguir "nunca sincronizado" de "sincronizado
e nenhuma spec pronta" no estado vazio (`BoardEmpty.png` mostra "Encontrou 14 specs, nenhuma aprovada").
`BoardDTO` muda de forma aditiva.

#### 2.3 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| Cards do board | `where("boardId","==",id).where("deletedAt","==",null)` | Nenhum: igualdade em dois campos usa os índices de campo único |
| Card por slug | `doc(<boardId>__<slug>)` | Nenhum |
| Cards em colunas removidas (recarga) | a mesma lista, filtrada em memória | Nenhum |

Sem `orderBy`: a ordenação é em memória, como em `boardRepository.listByOwner`. O `BaseRepository` não pagina;
um board tem dezenas de specs, e o quadro precisa de todas de uma vez. O risco é Concluído crescer sem limite
ao longo de meses; fica registrado em Riscos, sem paginação agora.

#### 2.4 Dados existentes

Nenhuma migração. Boards criados antes desta spec têm `backlogSync` ausente (vira `null`) e nenhum card.

### 3. Contrato

**`@repo/kanban-contract`** (regra 12: o domínio do board fica lá):

- `src/boardLanes.ts` (novo): `CARD_LANES`, `CardLane`, `BoardColumn` (`tasks`, uma por etapa, `done`),
  `boardColumns(config)` e `isCardReady(status, readyStatus, orphan)`.
- `src/roles.ts`: `canPrioritizeCards(role)`, `operator` para cima. Mesmo limiar de `canTriggerStages`, mas outro
  nome: arrastar aqui não dispara, e o `orchestrator` pode mudar um sem mexer no outro.
- `src/specBacklog.ts` (novo, sem `yaml`): `extractBacklogLinks(markdown, indexPath)` devolve os caminhos `.md`
  relativos citados no índice, normalizados a partir da pasta do índice, na ordem da primeira aparição, sem
  duplicata, sem âncora e sem os que saem da raiz do repositório.
- `src/specFrontmatter.ts` (novo, subpath `./spec-frontmatter`, porque usa `yaml` e o app não deve empacotá-lo):
  `parseSpecFrontmatter(text)` devolve `null` quando o arquivo não abre com `---` (não é spec), `{ ok: false }`
  quando o bloco existe mas falta `id` ou `status`, e `{ ok: true, id, title, status }` no caso válido.

**`@repo/sdk`**: recurso `boardCard` (`list`, `findBySlug`, `findSpec`, `sync`, `reorder`, `move`) e tipos em
`types/board/card.ts`. `BoardDTO` ganha `backlogSync`. Quem lê `BoardDTO` hoje (três hooks de board,
`BoardCard`, `BoardSettingsClient`, `NewBoardClient`) não quebra, porque o campo é novo e ninguém o
desestrutura.

### 4. API (`apps/api`)

#### 4.1 Capacidade nova no guard

`BoardCapability` ganha `"prioritize"` → `canPrioritizeCards` (`board-access.ts:27-41`). Todas as rotas abaixo
passam por `requireBoardApi`, que resolve o papel efetivo (regra 13). Sob personificação, `POST`/`PUT` já são
recusados pelo `requireCommonPanelApi` (`assertReadOnlyWhileImpersonating`), sem código novo.

#### 4.2 Rotas

| Método e rota | Capacidade | O que faz |
|---------------|------------|-----------|
| `GET /boards/[id]/cards` | `view` | Todos os cards não apagados, ordenados (Tarefas por `order`; demais por `movedAt`) |
| `POST /boards/[id]/cards/sync` | `prioritize` | Lê o índice e as specs no GitHub e aplica a sincronização |
| `PUT /boards/[id]/cards/order` | `prioritize` | Reescreve a ordem de Tarefas a partir da lista completa de slugs |
| `GET /boards/[id]/cards/[slug]` | `view` | Um card |
| `POST /boards/[id]/cards/[slug]/move` | `prioritize` | Muda a faixa (e a etapa); não toca em `state` |
| `GET /boards/[id]/cards/[slug]/spec` | `view` | Conteúdo atual da spec na `baseBranch` |
| `POST /boards/[id]/reload` (existente) | `configure` | Passa a recusar quando uma etapa removida tem cards |

#### 4.3 Sincronização

Em `apps/api/(shared)/lib/card-sync.ts`. Dividido em leitura (GitHub) e plano (função pura, testável sem
Firestore nem rede):

1. `config.backlog.source === "manual"` → 409 `BOARD_BACKLOG_SOURCE_MANUAL`.
2. `readFile(repo, config.backlog.index, config.baseBranch)`; `null` → 422 `BOARD_BACKLOG_INDEX_NOT_FOUND`.
   Erros do GitHub passam por `githubErrorResponse` como nas rotas de board; sem App, 503
   `GITHUB_APP_NOT_CONFIGURED` (modo degradado já existente).
3. `extractBacklogLinks(index.content, index.path)`, cortado em `BACKLOG_SYNC_MAX_FILES = 200` (o resto vira
   `skipped` com `reason: "limit"`).
4. Lê cada caminho com concorrência 8. Reaproveita `mapWithConcurrency` de `board-import.ts:182`, que passa a
   ser exportado de um módulo próprio (`(shared)/lib/map-with-concurrency.ts`) em vez de ser copiado.
5. Para cada arquivo: `null` → `skipped: not_found`; sem frontmatter → ignorado em silêncio (README, docs);
   frontmatter sem `id`/`status` → `skipped: frontmatter_invalid`; `id` que não passa em `isValidSlug` →
   `skipped: slug_invalid`; `id` repetido → `skipped: slug_duplicated` (vale o primeiro).
6. `planBacklogSync({ existing, specs, config, now })`, pura:
   - spec sem card → cria em `lane: "tasks"`, `order` = maior `order` atual + 1, na ordem do índice. Na primeira
     sincronização isso dá exatamente a ordem do `BACKLOG.md`;
   - spec com card → atualiza `title`, `spec`, `orphan: false`; recalcula `ready`; recalcula `branch` só se o
     card ainda está em Tarefas (a branch de um card já iniciado não muda debaixo dele). `order` não muda: a
     ordem do board vence a do `BACKLOG.md`;
   - card cuja spec não apareceu → `orphan: true`, `ready: false`. Nunca apaga.
   - devolve as escritas e o resumo `{ created, updated, orphaned, unchanged, skipped }`.
7. `cardRepository.applySync(writes)` em batches de até 500, e `boardRepository.recordBacklogSync(id, meta)`.

Resposta: `CardSyncResultDTO` com o resumo, `skipped`, os cards já atualizados e o `backlogSync`.

`ready` só tem efeito em Tarefas: um card já numa coluna de etapa continua lá mesmo se o status da spec virar
`in-progress` (que é o que o pipeline faz no repositório depois da Análise).

Specs entregues são movidas pelo `/spec --sync` para `docs/features/<slug>/spec.md`, e o `BACKLOG.md` passa a
linkar esse caminho na seção Entregues. Como a extração segue qualquer link `.md`, o card de uma spec entregue
continua encontrado (com `status: done`) e não vira órfão.

#### 4.4 Reordenar

Body `{ slugs: string[] }` (1 a 500, sem repetição). A lista tem de ser igual, como conjunto, aos cards prontos
em Tarefas; se não for, 409 `CARD_ORDER_STALE` (alguém sincronizou ou moveu no meio). Grava `order = índice`
num batch. Cards não prontos guardam o `order` antigo e não entram na lista.

#### 4.5 Mover

Body `{ lane: "tasks" } | { lane: "done" } | { lane: "stage", stageKey }`. Regras em
`(shared)/lib/card-move.ts`, pura:

- card não encontrado → 404 `CARD_NOT_FOUND`;
- `stageKey` que não está em `config.stages` → 422 `CARD_STAGE_NOT_FOUND`;
- card em Tarefas e não pronto (inclui órfão) saindo de Tarefas → 409 `CARD_NOT_READY`;
- mesma faixa e mesma etapa → 200 sem escrita;
- voltando para Tarefas → `order` = maior + 1 (fim da fila);
- grava `lane`, `stageKey`, `movedAt`, `movedByUserId`, `updatedAt`. Não grava `state` nem `reworkLoops`.

#### 4.6 Spec do card

`readFile(repo, card.spec.path, config.baseBranch)`. Devolve `{ path, ref, sha, content }`, com `content: null`
quando o arquivo sumiu. Não atualiza o card: quem atualiza é a sincronização. A tela mostra o sha lido.

#### 4.7 Recarga com coluna removida

No `reload/route.ts`, depois de validar e antes de `applyReload`: se `diffBoardStages(...).removed` não estiver
vazio, lista os cards do board e, se algum tiver `lane: "stage"` com `stageKey` removido, responde 409
`BOARD_RELOAD_STAGE_HAS_CARDS` sem gravar. A tela de Configuração já mostra o erro pelo `handleClientError`.
Fecha o risco que a spec `board-import` deixou para cá.

#### 4.8 Cliente falso do GitHub

`sample-app` ganha o backlog que o `/test` percorre (só arquivos, nenhum repositório novo, para não mexer nos
testes do picker que contam três repositórios):

| Arquivo | Status | Papel no teste |
|---------|--------|----------------|
| `specs/BACKLOG.md` | | Tabela com os links na ordem abaixo, um link para `README.md` e um para `../docs/features/fork-cleanup/spec.md` |
| `specs/features/search-cards.md` | `approved` | Tarefas, posição 1. Corpo com tabela, código, link relativo, link `javascript:`, uma linha `<script>` e uma imagem |
| `specs/features/slack-alerts.md` | `proposed` | Não pronta |
| `specs/features/keyboard-shortcuts.md` | `approved` | Tarefas, posição 2 |
| `specs/features/legacy-export.md` | (não existe) | `skipped: not_found` |
| `specs/features/broken-frontmatter.md` | sem `status` | `skipped: frontmatter_invalid` |
| `specs/features/dark-theme.md` | `approved` | Tarefas, posição 3 |
| `specs/README.md` | sem frontmatter | Ignorado |
| `docs/features/fork-cleanup/spec.md` | `done` | Não pronta, mostra que spec entregue não vira órfã |

Os textos das specs falsas são curtos e inventados para o exemplo; nenhum dado pessoal.

#### 4.9 Erros novos

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `BOARD_BACKLOG_SOURCE_MANUAL` | 409 | `backlog.source: manual` |
| `BOARD_BACKLOG_INDEX_NOT_FOUND` | 422 | Índice não existe na `baseBranch` |
| `BOARD_RELOAD_STAGE_HAS_CARDS` | 409 | Recarga removeria uma coluna com cards |
| `CARD_NOT_FOUND` | 404 | Slug sem card no board |
| `CARD_NOT_READY` | 409 | Card não pronto saindo de Tarefas |
| `CARD_STAGE_NOT_FOUND` | 422 | Etapa que não existe no `board.yml` |
| `CARD_ORDER_STALE` | 409 | Lista de reordenação diferente dos cards de Tarefas |

Os sete entram em `apiErrors` (`translations/packages/shared/utils.ts`); o `apiErrorCodesTranslated.test.ts`
cobra.

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

| Rota | Arquivo | Notas |
|------|---------|-------|
| `/boards/[id]` | `boards/(pages)/[id]/page.tsx` + `BoardClient.tsx` + `loading.tsx` | O quadro. Prefetch RSC de `board.findById` e `boardCard.list` (padrão de `members/page.tsx`) |
| `/boards/[id]/cards/[slug]` | `boards/(pages)/[id]/cards/[slug]/page.tsx` + `CardDetailClient.tsx` + `loading.tsx` | Detalhe. Prefetch do card; a spec carrega no cliente (chama o GitHub) |

Links que passam a apontar para o quadro: `BoardsListClient.tsx:83`, `NewBoardClient.tsx:105` (após criar) e
`:236` ("Abrir board" do picker). `paths.ts` ganha `boards.detail(id)` e `boards.card(id, slug)`.
`panelTitles.ts` ganha `"/boards/[id]"` e `"/boards/[id]/cards/[slug]"` com títulos próprios ("Quadro" e
"Card"), o que resolve o motivo do desvio 2 da `board-import`. `BoardSectionNav` ganha a seção `board`,
primeira, e a ordem passa a Quadro · Membros · Configuração, como no cabeçalho do desenho.

#### 5.2 Dados

- `queryKeys.boards.cards(id)`, `queryKeys.boards.card(id, slug)`, `queryKeys.boards.cardSpec(id, slug)`.
- `useListBoardCards(boardId)` + `fetchBoardCards`; `useFindBoardCard(boardId, slug)` + `findBoardCard`;
  `useFindCardSpec(boardId, slug)`. `enabled` só com ids não vazios.
- `useBoardCardCrud(boardId)`: `syncMutation` (invalida cards e `boards.detail`), `reorderMutation` e
  `moveMutation` com atualização otimista via `setQueryData` e volta ao estado anterior no erro, seguida de
  `invalidateQueries` dos cards (a lista pode ter mudado no servidor, como no `CARD_ORDER_STALE`).

#### 5.3 Telas e estados

**Quadro (`Main.png`, `BoardEmpty.png`, `MBoard.png`)**

- Cabeçalho da página: nome do board, `owner/name`, "base `main`" em mono, "Sincronizado há …" (ou "Backlog
  ainda não sincronizado") e o botão "Sincronizar backlog" para quem pode priorizar. `BoardSectionNav` abaixo.
- Colunas, da esquerda para a direita: Tarefas (subtítulo "Specs aprovadas, na ordem do board"), uma por etapa
  (título = `column`, subtítulo `/<command> · <model> · <effort>` em mono, como em `Main.png`), Concluído. Cada
  cabeçalho mostra a contagem.
- Card em Tarefas: número da posição e título (como em `Main.png`), menu "⋯".
- Card em etapa ou Concluído: título, selo de estado, branch em mono; selo "Spec removida" quando órfão.
- Coluna vazia: caixa tracejada com a dica do `BoardEmpty.png` ("As specs aprovadas aparecem aqui, na ordem do
  backlog." em Tarefas; "Arraste um card de Tarefas para cá." na primeira etapa; "Nenhum card" nas demais).
- Estado sem nenhum card pronto (`BoardEmpty.png`, painel da esquerda): "Nenhuma spec pronta ainda", "O board lê
  `<index>` e cria um card para cada spec `<readyStatus>`. Encontrou N specs, nenhuma aprovada.", as três
  primeiras não prontas com o status num selo, "e mais N", e o botão "Sincronizar backlog". Antes da primeira
  sincronização, o mesmo painel com "Backlog ainda não sincronizado". "Escrever uma spec" e "Descobrir specs"
  ficam fora (outras specs).
- Seção "Não prontas" abaixo do quadro quando existem: lista recolhível (`collapsible.tsx`) com título, status
  e, nos órfãos, "Spec removida". Cada item abre o detalhe.
- Resultado da sincronização: toast com o resumo ("2 cards criados, 1 atualizado, 1 órfão"). Se houver
  `skipped`, um `alert.tsx` acima do quadro lista caminho e motivo, com botão para fechar.
- Erro de carga: `Container` com `loadError` (padrão das outras telas de board). Carregando: `loading.tsx` com
  skeleton de três colunas.
- Sob personificação: `ImpersonationReadOnlyNotice`, sem botão de sincronizar, sem arrastar, sem menu.

**Mover e reordenar (drag-and-drop)**

Não há biblioteca de drag-and-drop no repo nem no design system (busca em todos os `package.json` e no
lockfile). Sem dependência nova, o quadro usa a API nativa do HTML5 (`draggable`, `onDragStart`, `onDragOver`,
`onDrop`) para o mouse, e o menu "⋯" de cada card (`ActionsMenu`, que já abre por teclado e tem `triggerLabel`)
como caminho de teclado e de toque:

- Tarefas: "Mover para o topo", "Subir", "Descer". Arrastar dentro de Tarefas reordena (posição pelo card sob o
  cursor). Cada ação chama `reorder` com a lista inteira.
- Todas as faixas: "Mover para <coluna>" para cada outra coluna. Soltar numa coluna chama `move`. Soltar em
  Tarefas vindo de fora põe no fim da fila.
- Card não pronto não aparece em Tarefas e não tem ação de mover para etapa.
- `viewer` (ou personificação): cards sem `draggable` e sem menu de mover. A API recusa igual (403
  `BOARD_ROLE_INSUFFICIENT`).
- Uma região `aria-live="polite"` anuncia o resultado ("<título> movido para Análise").

No celular o arrastar nativo não funciona por toque; o menu cobre, e é o que o `MMove.png` prevê ("no celular,
mover pelo menu substitui arrastar"). A folha com destino e credencial do `MMove.png` é do `orchestrator`.

**Layout responsivo.** A partir de `md`, colunas lado a lado com largura fixa (`w-72`) e rolagem horizontal só
dentro da área do quadro (`overflow-x-auto`), nunca da página. Abaixo de `md`, as colunas viram seções
empilhadas (título + lista), como em `MBoard.png`. Os atalhos em pílula do topo do `MBoard.png` e a barra
inferior ficam fora (dependem do cabeçalho do board).

**Detalhe do card**

- Breadcrumb: Boards › <board> › <título>.
- Título, selo da coluna atual, selo de estado, selo "Spec removida" quando órfão, branch em mono, caminho da
  spec em mono com link para o GitHub (`githubFileUrl`, já existe) e o sha curto (`shortSha`, já existe).
- A spec renderizada (ver 5.5). Carregando: skeleton de texto. `content: null`: `empty.tsx` com "A spec não
  está mais no repositório." Erro: `loadError`.

#### 5.4 i18n e a11y

Árvore em 10.8. `aria-label` do menu de cada card: "Ações de <título>". Colunas são `section` com
`aria-labelledby` no título; a lista de cards é `ol` em Tarefas (a ordem tem sentido) e `ul` nas demais.

#### 5.5 Renderizar a spec com segurança

O conteúdo da spec é dado de terceiros (regra 16). Nada de `dangerouslySetInnerHTML`. Proposta:
`SpecMarkdown.tsx` usa só o **lexer** do `marked` (`marked.lexer(text, { gfm: true })`) e desenha cada token
como elemento React, de modo que o React escapa todo texto:

- `heading`, `paragraph`, `list` (com item de tarefa como checkbox desabilitado), `code`, `codespan`,
  `blockquote`, `table`, `hr`, `strong`, `em`, `del`, `br`, `text`, `escape`;
- `html` (bloco ou inline) vira texto literal;
- `link`: `http(s)` abre em nova aba com `rel="noreferrer noopener"`; caminho relativo vira URL do GitHub na
  `baseBranch`, resolvido a partir da pasta da spec; qualquer outro esquema (`javascript:`, `data:`) vira texto;
- `image`: link com o texto alternativo (a CSP do app bloqueia imagem externa, e não há proxy).

`marked@13.0.3` já está no lockfile (transitivo de `firebase-tools`), então declará-lo em `apps/app` não baixa
nada. É o mesmo caminho que a `board-import` usou com `yaml@2.9.1`. A alternativa com `react-markdown` (pacote
novo) fica como pergunta.

### 6. Autorização e segurança

| Ação | Quem | Onde é checado |
|------|------|----------------|
| Ver quadro, card e spec | qualquer papel efetivo (`viewer`+) | `requireBoardApi("view")` |
| Sincronizar, reordenar, mover | `operator`+ efetivo | `requireBoardApi("prioritize")`; a UI esconde com `canPrioritizeCards(access.effectiveRole)` |
| Recarregar configuração | `owner` efetivo | já existente |

- Não membro: 404 (`board-access.ts`), o board não vaza.
- Papel no board `operator` com `read` no GitHub (`qa-reader` do cliente falso) vira `viewer` e não arrasta.
  É o sinal de pronto "um viewer não consegue arrastar".
- Personificação: só leitura, pela recusa global de métodos não seguros.
- Conteúdo da spec, título e status vêm do repositório e são tratados como texto. O título vai para o card como
  string; o status só é comparado com `readyStatus`.
- Caminhos vindos do índice são normalizados e recusados se saírem da raiz (`..` além do topo). O `readFile` só
  lê o repositório do próprio board, com o token de instalação, no servidor.
- Custo por sincronização: no máximo 1 + 200 leituras no GitHub. Só `operator`+ dispara; a API já tem rate
  limit por sujeito (Arcjet, quando configurado).

### 7. Testes

Todos unitários ou de rota com mocks; nenhum precisa de emulador. As consultas são de igualdade sem índice
composto, e o `/test` exercita o Firestore emulado ao percorrer o quadro.

| Nível | Arquivo | Prova |
|-------|---------|-------|
| contrato | `packages/kanban-contract/__tests__/boardLanes.test.ts` | `boardColumns` na ordem Tarefas, etapas, Concluído; `isCardReady` com órfão |
| contrato | `__tests__/roles.test.ts` (acréscimo) | `canPrioritizeCards` por papel |
| contrato | `__tests__/specBacklog.test.ts` | Links relativos à pasta do índice, `../`, âncora, externos ignorados, duplicata, fuga da raiz, ordem |
| contrato | `__tests__/specFrontmatter.test.ts` | Sem frontmatter → `null`; sem `status` → inválido; título com fallback para o `# `; YAML com tag ou alias explosivo recusado |
| API, puro | `apps/api/__tests__/cardSync.test.ts` | `planBacklogSync`: primeira sincronização na ordem do índice; nova spec no fim; ordem existente preservada; status muda `ready`; órfão e volta; branch só recalculada em Tarefas; spec entregue achada pelo novo caminho |
| API, puro | `__tests__/cardMove.test.ts` | Regras de 4.5 |
| API | `__tests__/cardMapper.test.ts` | `Timestamp` → ISO, defaults, invariante `lane`/`stageKey` |
| API, rota | `__tests__/boardCardsRoutes.test.ts` | Com `fakeBoardMemberRepository`, repositório de cards em memória e o **cliente falso real** (`createGithubFakeClient`): sincronizar `sample-app` dá 3 cards prontos na ordem certa, 2 não prontos e 2 `skipped`; `qa-reader` recebe 403 em sync/order/move e 200 no GET; `CARD_ORDER_STALE`; `CARD_NOT_READY`; `CARD_STAGE_NOT_FOUND`; `source: manual`; índice ausente; spec ausente → `content: null`; `move` não altera `state` |
| API, rota | `__tests__/boardsRoutes.test.ts` (acréscimo no `reload`) | Recusa 409 com card na etapa removida e nada gravado; aplica quando a etapa removida está vazia |
| API | `__tests__/githubFakeClient.test.ts` (acréscimo) | Os arquivos novos de `sample-app` existem e o frontmatter de cada um é o esperado |
| app | `apps/app/__tests__/specMarkdown.test.tsx` | `<script>` vira texto; `javascript:` não vira `href`; link relativo vira URL do GitHub; tabela e checkbox renderizam; `&` em `codespan` aparece como `&` |
| app | `__tests__/useBoardCardCrud.test.tsx` | Reordenação otimista; volta ao anterior quando a API responde 409; invalidação depois do sync |
| app | `__tests__/groupCardsByColumn.test.ts` | Agrupamento por coluna, não prontos separados, card com `stageKey` desconhecido não some (cai numa coluna "Etapa removida") |

### 8. O que o `/test` vai percorrer

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, login pelo popup do emulador com as contas `qa-*`
(`docs/SETUP.md`). Um login fora da tabela do cliente falso é `admin`. Fluxos, em claro, escuro e 390 px:

| # | Fluxo | Esperado |
|---|-------|----------|
| Q1 | `qa-owner` importa `sample-app` | Vai para `/boards/[id]` (não mais Configuração); painel "Backlog ainda não sincronizado" |
| Q2 | "Sincronizar backlog" | Tarefas: 1 Busca…, 2 Atalhos…, 3 Tema escuro; "Não prontas" com 2; alerta com `legacy-export.md` (não encontrado) e `broken-frontmatter.md` (frontmatter inválido); toast com o resumo |
| Q3 | Arrastar "Tema escuro" para o topo de Tarefas; recarregar a página | Ordem persiste (1 Tema escuro); "Sincronizar" de novo não desfaz |
| Q4 | Menu "⋯" por teclado (Tab, Enter): "Mover para Análise" | Card na coluna Análise com branch `feat/<slug>` em mono e selo de estado; nenhuma execução criada (coleção `run` não existe) |
| Q5 | Arrastar de Análise para Concluído; depois mover de volta para Tarefas | Concluído conta 1; de volta, entra no fim da fila |
| Q6 | Abrir o card "Busca…" | Spec renderizada; tabela; link relativo aponta para o GitHub; `javascript:` aparece como texto; a linha `<script>` aparece como texto; caminho e sha curto em mono |
| Q7 | Convidar `qa-reader` como `operator`; entrar como ele | Selo "Leitor" efetivo; quadro sem botão de sincronizar, sem menu "⋯" e cards não arrastáveis |
| Q8 | Card órfão: no emulador, criar o documento `card` `<boardId>__removed-spec` (cópia de um existente com outro slug e `lane: "stage"`), sincronizar | Card fica, com "Spec removida"; detalhe mostra "A spec não está mais no repositório." |
| Q9 | Recarga com coluna removida: com um card em Análise, editar o `config` do board no emulador para ter uma etapa a mais (`extra`), pôr um card nela (`stageKey: "extra"`), trocar `configSource.sha` e clicar "Recarregar" | Erro "A nova configuração remove uma coluna que ainda tem cards…"; nada muda |
| Q10 | Personificar `qa-owner` a partir de um admin | Aviso de somente leitura; sem sincronizar, arrastar ou menu |
| Q11 | 390 px | Colunas empilhadas; mover pelo menu funciona; nenhuma rolagem horizontal da página |

Comparar com `Main.png`, `BoardEmpty.png` e `MBoard.png`, anotando o que ficou fora por escopo (seção 1).

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Sincronizar cria um card por spec do índice; os prontos aparecem em Tarefas na ordem do `BACKLOG.md`.
2. Specs não prontas aparecem na seção "Não prontas" e não em Tarefas.
3. Arquivos ausentes ou com frontmatter inválido aparecem no alerta, com caminho e motivo.
4. Reordenar Tarefas persiste e sobrevive a uma nova sincronização.
5. Mover entre colunas muda só a posição; `state` continua `idle`.
6. Card não pronto não sai de Tarefas (API 409 `CARD_NOT_READY`).
7. `viewer` efetivo não arrasta nem vê o menu; a API responde 403.
8. Spec removida deixa o card órfão, nunca o apaga.
9. O detalhe mostra a spec renderizada sem executar HTML nem link `javascript:`.
10. Recarga que remove coluna com cards é recusada com `BOARD_RELOAD_STAGE_HAS_CARDS`.
11. Quadro legível em claro, escuro e 390 px, sem rolagem horizontal da página.

## Etapa 2: blueprint técnico

### 10.1 Contrato do domínio (`@repo/kanban-contract`)

```ts
// src/boardLanes.ts
import type { BoardConfig } from "./boardConfig";

export const CARD_LANES = ["tasks", "stage", "done"] as const;
export type CardLane = (typeof CARD_LANES)[number];

export type BoardColumn =
    | { id: "tasks"; lane: "tasks" }
    | { id: `stage:${string}`; lane: "stage"; stageKey: string; title: string; command: string; model: string; effort: string }
    | { id: "done"; lane: "done" };

export function boardColumns(config: BoardConfig): BoardColumn[];
export function isCardReady(specStatus: string, readyStatus: string, orphan: boolean): boolean;
```

```ts
// src/roles.ts (acréscimo)
export function canPrioritizeCards(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("operator");
}
```

```ts
// src/specBacklog.ts
/** Relative `.md` links of the index, resolved from its folder, in first-appearance order. */
export function extractBacklogLinks(markdown: string, indexPath: string): string[];
```

```ts
// src/specFrontmatter.ts (subpath "./spec-frontmatter")
export type SpecFrontmatter = { id: string; title: string | null; status: string };
export type SpecFrontmatterResult =
    | null                                   // the file does not open with a frontmatter block
    | { ok: false }
    | { ok: true; spec: SpecFrontmatter };
export function parseSpecFrontmatter(text: string): SpecFrontmatterResult;
export function firstHeading(text: string): string | null;
```

`package.json` exports: `"./spec-frontmatter": "./src/specFrontmatter.ts"`. Alias igual no
`apps/api/vitest.config.mts` (mesmo motivo do desvio 5 da `board-import`). O parse usa as mesmas opções de
`parseBoardConfigYaml` (`uniqueKeys`, sem tags customizadas, limite de aliases padrão).

### 10.2 SDK

```ts
// packages/sdk/src/types/board/card.ts
import type { CardLane, CardState } from "@repo/kanban-contract";

export type CardSpecDTO = { path: string; sha: string; status: string };

export type CardDTO = {
    id: string;
    boardId: string;
    slug: string;
    title: string;
    spec: CardSpecDTO;
    ready: boolean;
    orphan: boolean;
    lane: CardLane;
    stageKey: string | null;
    state: CardState;
    reworkLoops: number;
    order: number;
    branch: string | null;
    movedAt: string | null;
    syncedAt: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type CardSyncSkipReason =
    | "not_found" | "frontmatter_invalid" | "slug_invalid" | "slug_duplicated" | "limit";
export type CardSyncSkipDTO = { path: string; reason: CardSyncSkipReason };

export type BoardBacklogSyncDTO = {
    indexPath: string; indexSha: string; ref: string; syncedAt: string; specCount: number;
};

export type CardSyncResultDTO = {
    created: number; updated: number; orphaned: number; unchanged: number;
    skipped: CardSyncSkipDTO[];
    cards: CardDTO[];
    backlogSync: BoardBacklogSyncDTO;
};

export type ReorderCardsRequest = { slugs: string[] };
export type MoveCardRequest =
    | { lane: "tasks" } | { lane: "done" } | { lane: "stage"; stageKey: string };

export type CardSpecContentDTO = { path: string; ref: string; sha: string | null; content: string | null };
```

`BoardDTO` (em `types/board/board.ts`): `backlogSync: BoardBacklogSyncDTO | null`.

```ts
// packages/sdk/src/actions/boardCard/action.ts
const cardsPath = (boardId: string) => `/boards/${encodeURIComponent(boardId)}/cards`;
const cardPath = (boardId: string, slug: string) => `${cardsPath(boardId)}/${encodeURIComponent(slug)}`;

export default class BoardCardActions {
    list(boardId: string): Promise<CardDTO[]>;                                   // GET  cards
    findBySlug(boardId: string, slug: string): Promise<CardDTO>;                 // GET  cards/[slug]
    findSpec(boardId: string, slug: string): Promise<CardSpecContentDTO>;        // GET  cards/[slug]/spec
    sync(boardId: string): Promise<CardSyncResultDTO>;                           // POST cards/sync
    reorder(boardId: string, body: ReorderCardsRequest): Promise<CardDTO[]>;     // PUT  cards/order
    move(boardId: string, slug: string, body: MoveCardRequest): Promise<CardDTO>; // POST cards/[slug]/move
}
```

`client/index.ts`: campo `boardCard`.

### 10.3 Rotas (esqueletos)

```ts
// apps/api/app/(routes)/boards/[id]/cards/sync/route.ts
export const POST = requireBoardApi("prioritize", async (_req, ctx) => {
    const client = getGithubClient();
    if (!client) return githubAppNotConfiguredResponse();
    const read = await readBacklog(client, ctx.board);          // lib/card-sync.ts
    if (!read.ok) return read.response;                         // 409 manual, 422 index, erros do GitHub
    const existing = await cardRepository.listByBoard(ctx.board.id);
    const plan = planBacklogSync({ existing, specs: read.specs, config: ctx.board.config, now: new Date() });
    await cardRepository.applySync(ctx.board.id, plan.writes);
    const backlogSync = await boardRepository.recordBacklogSync(ctx.board.id, read.meta);
    const cards = await cardRepository.listByBoard(ctx.board.id);
    return Response.json({ data: { ...plan.summary, skipped: [...read.skipped, ...plan.skipped], cards: sortCards(cards), backlogSync } });
});
```

```ts
// apps/api/app/(routes)/boards/[id]/cards/[slug]/move/route.ts
export const POST = requireBoardApi<{ id: string; slug: string }>("prioritize", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const parsed = parseMoveCard(body.value);                   // validation/card.schema.ts
    if (!parsed.ok) return parsed.response;
    const card = await cardRepository.findBySlug(ctx.board.id, ctx.params.slug);
    if (!card) return errorResponse("CARD_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    const decision = decideCardMove(card, parsed.value, ctx.board.config);   // lib/card-move.ts
    if (!decision.ok) return errorResponse(decision.code, decision.status);
    if (decision.unchanged) return Response.json({ data: card });
    const tasksTail = parsed.value.lane === "tasks" ? await cardRepository.maxTasksOrder(ctx.board.id) + 1 : undefined;
    const moved = await cardRepository.move(card.id, {
        lane: parsed.value.lane,
        stageKey: parsed.value.lane === "stage" ? parsed.value.stageKey : null,
        order: tasksTail,
        movedByUserId: ctx.subjectProfile.id,
    });
    return Response.json({ data: moved });
});
```

```ts
// apps/api/app/(routes)/boards/[id]/cards/order/route.ts
export const PUT = requireBoardApi("prioritize", async (req, ctx) => {
    // parse { slugs } → cards prontos em Tarefas → mesmo conjunto? senão 409 CARD_ORDER_STALE
    // cardRepository.reorder(boardId, slugs) → batch order = índice
});
```

`GET cards`, `GET cards/[slug]` e `GET cards/[slug]/spec` seguem o formato de `members/route.ts:12-17`.

```ts
// reload/route.ts, entre a linha 49 (sha igual) e o applyReload
const changes = diffBoardStages(board.config.stages, parsed.config.stages);
if (changes.removed.length > 0) {
    const removedKeys = new Set(changes.removed.map((stage) => stage.key));
    const cards = await cardRepository.listByBoard(id);
    if (cards.some((card) => card.lane === "stage" && card.stageKey !== null && removedKeys.has(card.stageKey))) {
        return Response.json({ error: { code: "BOARD_RELOAD_STAGE_HAS_CARDS" } }, { status: HTTP_STATUS.CONFLICT });
    }
}
```

`(shared)/validation/card.schema.ts`: `parseMoveCard` (união discriminada por `lane`, `stageKey` com o regex de
etapa) e `parseReorderCards` (`slugs` 1..500, cada um `isValidSlug`, sem repetição). Mesmo formato de
`board-member.schema.ts`.

### 10.4 Payloads de exemplo

```http
POST /boards/agent-board-demo--sample-app/cards/sync
200
{
  "data": {
    "created": 5, "updated": 0, "orphaned": 0, "unchanged": 0,
    "skipped": [
      { "path": "specs/features/legacy-export.md", "reason": "not_found" },
      { "path": "specs/features/broken-frontmatter.md", "reason": "frontmatter_invalid" }
    ],
    "cards": [
      { "id": "agent-board-demo--sample-app__search-cards", "slug": "search-cards", "title": "Busca por texto nos cards",
        "spec": { "path": "specs/features/search-cards.md", "sha": "…", "status": "approved" },
        "ready": true, "orphan": false, "lane": "tasks", "stageKey": null, "state": "idle", "reworkLoops": 0,
        "order": 0, "branch": "feat/search-cards", "movedAt": null, "…": "…" }
    ],
    "backlogSync": { "indexPath": "specs/BACKLOG.md", "indexSha": "…", "ref": "main", "syncedAt": "2026-11-26T…", "specCount": 5 }
  }
}
```

```http
POST /boards/agent-board-demo--sample-app/cards/slack-alerts/move
{ "lane": "stage", "stageKey": "analyze" }
409 { "error": { "code": "CARD_NOT_READY" } }
```

```http
PUT /boards/agent-board-demo--sample-app/cards/order
{ "slugs": ["dark-theme", "search-cards", "keyboard-shortcuts"] }
200 { "data": [ …cards… ] }
```

### 10.5 Tabela `error.code` → status

| Código | Status | Rota |
|--------|--------|------|
| `BOARD_BACKLOG_SOURCE_MANUAL` | 409 | sync |
| `BOARD_BACKLOG_INDEX_NOT_FOUND` | 422 | sync |
| `GITHUB_APP_NOT_CONFIGURED` (existente) | 503 | sync, spec |
| `GITHUB_*` (existentes, via `githubErrorResponse`) | conforme o erro | sync, spec |
| `CARD_NOT_FOUND` | 404 | card, spec, move |
| `CARD_NOT_READY` | 409 | move |
| `CARD_STAGE_NOT_FOUND` | 422 | move |
| `CARD_ORDER_STALE` | 409 | order |
| `BOARD_RELOAD_STAGE_HAS_CARDS` | 409 | reload |
| `BOARD_ROLE_INSUFFICIENT` (existente) | 403 | sync, order, move |
| `VALIDATION_ERROR` (existente) | 400 | order, move |

### 10.6 Documento no Firestore

```txt
card/agent-board-demo--sample-app__search-cards
{
  boardId: "agent-board-demo--sample-app",
  slug: "search-cards",
  title: "Busca por texto nos cards",
  spec: { path: "specs/features/search-cards.md", sha: "3f2a…", status: "approved" },
  ready: true,
  orphan: false,
  lane: "tasks",
  stageKey: null,
  state: "idle",
  reworkLoops: 0,
  order: 0,
  branch: "feat/search-cards",
  movedAt: null,
  movedByUserId: null,
  syncedAt: Timestamp,
  createdAt: Timestamp, updatedAt: Timestamp, deletedAt: null
}

board/<id>.backlogSync = { indexPath, indexSha, ref, syncedAt: Timestamp, specCount }
```

### 10.7 Árvore de arquivos

```txt
packages/kanban-contract/
  package.json                         (export ./spec-frontmatter)
  src/boardLanes.ts                    (novo)
  src/specBacklog.ts                   (novo)
  src/specFrontmatter.ts               (novo, subpath)
  src/roles.ts                         (canPrioritizeCards)
  src/index.ts                         (boardLanes, specBacklog)
  __tests__/boardLanes.test.ts, specBacklog.test.ts, specFrontmatter.test.ts (novos), roles.test.ts

packages/sdk/src/
  types/board/card.ts (novo), types/board/board.ts (backlogSync), types/board/index.ts
  actions/boardCard/action.ts (novo), client/index.ts

apps/api/
  vitest.config.mts                    (alias do subpath)
  (shared)/lib/map-with-concurrency.ts (extraído de board-import.ts)
  (shared)/lib/board-import.ts         (passa a importar o helper)
  (shared)/lib/board-access.ts         (capacidade "prioritize")
  (shared)/lib/card-sync.ts            (readBacklog, planBacklogSync)
  (shared)/lib/card-move.ts            (decideCardMove)
  (shared)/lib/card-order.ts           (sortCards)
  (shared)/lib/github/github-sample-repositories.ts (arquivos de backlog do sample-app)
  (shared)/mappers/card.mapper.ts      (novo)
  (shared)/mappers/board.mapper.ts     (backlogSync)
  (shared)/repositories/card.repository.ts (listByBoard, findBySlug, applySync, reorder, move, maxTasksOrder)
  (shared)/repositories/board.repository.ts (recordBacklogSync)
  (shared)/validation/card.schema.ts   (novo)
  app/(routes)/boards/[id]/cards/route.ts
  app/(routes)/boards/[id]/cards/sync/route.ts
  app/(routes)/boards/[id]/cards/order/route.ts
  app/(routes)/boards/[id]/cards/[slug]/route.ts
  app/(routes)/boards/[id]/cards/[slug]/move/route.ts
  app/(routes)/boards/[id]/cards/[slug]/spec/route.ts
  app/(routes)/boards/[id]/reload/route.ts (recusa)
  __tests__/cardSync.test.ts, cardMove.test.ts, cardMapper.test.ts, boardCardsRoutes.test.ts,
            fakeCardRepository.ts (novos); boardsRoutes.test.ts, githubFakeClient.test.ts (acréscimos)

apps/app/
  package.json                         (marked 13.0.3, já no lockfile)
  shared/lib/queryKeys.ts, shared/lib/panelTitles.ts
  app/[locale]/(authenticated)/(common)/paths.ts
  .../boards/(hooks)/useListBoardCards.tsx, useFindBoardCard.tsx, useFindCardSpec.tsx, useBoardCardCrud.tsx
  .../boards/(components)/BoardColumns.tsx, BoardColumn.tsx, BoardCardItem.tsx, CardMoveMenu.tsx,
      BoardBacklogEmpty.tsx, NotReadyCards.tsx, BoardSyncSkipped.tsx, BoardSyncButton.tsx,
      SpecMarkdown.tsx, groupCardsByColumn.ts, useCardDrag.ts (novos)
  .../boards/(components)/BoardSectionNav.tsx (seção board)
  .../boards/(pages)/[id]/page.tsx, BoardClient.tsx, loading.tsx (novos)
  .../boards/(pages)/[id]/cards/[slug]/page.tsx, CardDetailClient.tsx, loading.tsx (novos)
  .../boards/(pages)/(home)/BoardsListClient.tsx, (pages)/new/NewBoardClient.tsx (links)
  .../boards/(pages)/[id]/settings/BoardSettingsClient.tsx, members/BoardMembersClient.tsx (links da nav)
  __tests__/specMarkdown.test.tsx, useBoardCardCrud.test.tsx, groupCardsByColumn.test.ts (novos)

packages/internationalization/translations/
  apps/app/pages/common/boards.ts (board, card, nav.board), apps/app/pages/common/routes/index.ts,
  packages/shared/utils.ts (7 apiErrors)

docs/board/ARCHITECTURE.md             (tabela de dados com os nomes reais: board, boardMember, card)
docs/SETUP.md                          (o backlog do sample-app e o que cada spec falsa exercita)
```

### 10.8 Chaves de i18n (pt-br)

```ts
// boards.ts
nav: { board: "Quadro", /* settings, members já existem */ },
board: {
  base: "base",
  syncedAgo: "Sincronizado {when}",
  neverSynced: "Backlog ainda não sincronizado",
  sync: "Sincronizar backlog",
  syncing: "Sincronizando…",
  syncSummary: "{created} criados, {updated} atualizados, {orphaned} órfãos",
  skipped: { title: "Alguns arquivos do backlog não viraram card", dismiss: "Fechar",
             reasons: { notFound: "arquivo não encontrado", frontmatterInvalid: "frontmatter sem id ou status",
                        slugInvalid: "id inválido", slugDuplicated: "id repetido", limit: "acima do limite de arquivos" } },
  columns: {
    tasks: "Tarefas", tasksHint: "Specs aprovadas, na ordem do board",
    done: "Concluído", doneHint: "Terminados",
    removedStage: "Etapa removida",
    empty: { tasks: "As specs aprovadas aparecem aqui, na ordem do backlog.",
             firstStage: "Arraste um card de Tarefas para cá.", other: "Nenhum card" },
  },
  emptyBacklog: {
    title: "Nenhuma spec pronta ainda",
    body: "O board lê {index} e cria um card para cada spec {readyStatus}.",
    foundOne: "Encontrou 1 spec, nenhuma pronta.", foundOther: "Encontrou {count} specs, nenhuma pronta.",
    more: "e mais {count}",
    neverSyncedBody: "Sincronize para trazer as specs de {index}.",
  },
  notReady: { title: "Não prontas", count: "{count} specs" },
  card: {
    actions: "Ações de {title}",
    moveTo: "Mover para {column}", moveTop: "Mover para o topo", moveUp: "Subir", moveDown: "Descer",
    moved: "{title} movido para {column}",
    orphan: "Spec removida",
    states: { idle: "Parado", queued: "Na fila", running: "Rodando", waiting_input: "Aguardando você", failed: "Falhou" },
  },
},
cardDetail: {
  spec: "Spec", branch: "Branch", column: "Coluna",
  openOnGithub: "Abrir no GitHub",
  specMissing: "A spec não está mais no repositório.",
  imageLink: "Imagem: {alt}",
},
```

```ts
// routes/index.ts
boards: { …, board: "Quadro", card: "Card" }
```

```ts
// packages/shared/utils.ts (apiErrors)
BOARD_BACKLOG_SOURCE_MANUAL: "Este board usa backlog manual; não há specs para sincronizar.",
BOARD_BACKLOG_INDEX_NOT_FOUND: "O índice do backlog não foi encontrado no repositório.",
BOARD_RELOAD_STAGE_HAS_CARDS: "A nova configuração remove uma coluna que ainda tem cards. Mova os cards antes de recarregar.",
CARD_NOT_FOUND: "Card não encontrado neste board.",
CARD_NOT_READY: "Este card ainda não está pronto para sair de Tarefas.",
CARD_STAGE_NOT_FOUND: "Esta coluna não existe mais no board.",
CARD_ORDER_STALE: "O quadro mudou enquanto você reordenava. Ele foi atualizado; tente de novo.",
```

### 10.9 Ordem de implementação e commits

1. `feat(kanban-contract): add board lanes, backlog links and spec frontmatter` (com os testes e a linha de
   `canPrioritizeCards`).
2. `feat(sdk): add board cards resource`.
3. `refactor(api): share the concurrency helper` (só a extração de `mapWithConcurrency`).
4. `feat(api): sample backlog in the fake GitHub repository` (arquivos do `sample-app` + teste).
5. `feat(api): store cards and sync them from the backlog` (mapper, repositório, `card-sync`, rota sync, GET,
   `backlogSync` no board, capacidade `prioritize`, testes).
6. `feat(api): reorder and move cards` (`card-move`, `card-order`, rotas order e move, spec, testes).
7. `feat(api): refuse a reload that removes a column with cards`.
8. `feat(internationalization): add board and card copy and error codes` (antes do app, para cada commit do app
   passar no typecheck; mesma observação do handoff da `board-import`).
9. `feat(app): add board cards data hooks` (hooks, `queryKeys`, teste do hook).
10. `feat(app): add the board screen with columns and card moves` (quadro, colunas, menu, drag, estados vazios,
    links, nav, `panelTitles`, `paths`).
11. `feat(app): render the card spec` (`marked`, `SpecMarkdown`, detalhe, teste).
12. `docs: card collection and sample backlog` (`ARCHITECTURE.md`, `SETUP.md`).
13. `docs(features): card-backlog`.

### 10.10 Env e configuração

Nenhuma env nova. Nenhuma rule nem índice novo.

## Pré-requisitos manuais de infra

Nenhum novo. O sinal de pronto "o backlog do next-boilerplate aparece como cards" precisa do GitHub App real
instalado no repositório (`Contents: read`), que já está no item 5 de `docs/PRE-PRODUCTION.md`, e do login
GitHub real (item 4). Localmente o mesmo fluxo é provado com o `sample-app` do cliente falso. O `/develop` não
acrescenta linha ao `PRE-PRODUCTION.md`.

## Riscos

- **Concluído cresce sem limite.** `GET cards` devolve tudo, sem paginação. Para dezenas de specs não pesa; se
  um board passar de algumas centenas de cards, cortar Concluído (últimos N) vira tarefa própria.
- **Escape do `marked` no lexer.** Em algumas versões o tokenizer de `codespan` já entrega o texto escapado
  (`&amp;`). Se o 13.0.3 fizer isso, o React escaparia de novo e o usuário veria `&amp;`. O teste de
  `SpecMarkdown` cobra o caso; se falhar, o componente decodifica as cinco entidades do `escape` do `marked`
  antes de desenhar.
- **Drag nativo.** Comportamento varia entre navegadores (imagem fantasma, `dragover` precisa de
  `preventDefault`). O menu é o caminho garantido; o `/test` mede o arrastar no Chromium do `agent-browser`.
- **Sincronização concorrente.** Duas sincronizações ao mesmo tempo podem dar o mesmo `order` a dois cards
  novos. O desempate por `slug` em `sortCards` mantém a tela estável, e a próxima reordenação corrige.
- **Custo no GitHub.** Até 201 leituras por clique. Dentro das 5.000 por hora da instalação, mas um
  `BACKLOG.md` com muitos links para docs gasta leituras à toa (arquivos sem frontmatter). Se medir problema,
  ler a árvore (`git/trees`) e pular arquivos com o mesmo sha.
- **Arquivos compartilhados com tarefas sem commit.** `board-access.ts`, `board-import.ts`, `reload/route.ts`,
  `boardsRoutes.test.ts`, `BoardSectionNav.tsx`, `BoardsListClient.tsx`, `NewBoardClient.tsx`, `boards.ts`,
  `utils.ts`, `queryKeys.ts`, `paths.ts`, `panelTitles.ts`, `client/index.ts` e `board.ts` do SDK já têm diff
  de `board-import` e `board-members`. O handoff do `/develop` precisa listar o trecho desta tarefa em cada um,
  como os handoffs anteriores fizeram.

## Perguntas em aberto

Decisões tomadas pelo `/cycle` sem perguntar. Cada uma pode ser revertida.

1. **Drag-and-drop: API nativa + menu × `@dnd-kit` (dependência nova).** A spec pede uma solução acessível por
   teclado. **Adotada: nativa para mouse, menu "⋯" para teclado e toque**, porque a política proíbe dependência
   nova sem relatório e o menu é o que o `MMove.png` já prevê no celular. Alternativa: `@dnd-kit/core` +
   `@dnd-kit/sortable`, com arrastar por teclado e toque prontos. Recomendação para você: aprovar o `@dnd-kit` se
   o arrastar nativo incomodar no `/test`.
2. **Markdown: lexer do `marked` (já no lockfile) × `react-markdown` (novo).** **Adotada: `marked@13.0.3`
   declarado no app, só o lexer, desenhado como React.** Zero download e nenhum HTML cru. Alternativa:
   `react-markdown` + `remark-gfm`, mais idiomático, com sanitização pronta, mas pacotes novos.
3. **Capacidade para sincronizar, reordenar e mover.** **Adotada: `operator`+ (`canPrioritizeCards`)**, como
   diz o `ACCESS.md` ("priorizar e arrastar cards"). Alternativa: só `maintainer` sincroniza. A spec não separa.
4. **Spec removida com card ainda em Tarefas.** A spec só fala de card "em andamento". **Adotada: fica, órfã,
   fora de Tarefas** (vai para "Não prontas"). Nada é apagado. Alternativa: apagar cards órfãos que nunca saíram
   de Tarefas.
5. **Specs não prontas: onde aparecem.** **Adotada: seção recolhível "Não prontas" abaixo do quadro**, mais o
   painel do `BoardEmpty.png` quando nenhuma está pronta. Inclui `proposed`, `deferred`, `done` etc., com o
   status num selo. Alternativa: mostrar só `proposed` e esconder `done`/`rejected`/`superseded`.
6. **Sincronizar ao criar o board.** **Adotada: não**; o quadro abre com o painel "Backlog ainda não
   sincronizado" e o botão. Mantém `POST /boards` como está. Alternativa: sincronizar logo após criar.
7. **Branch no card.** **Adotada: `resolveBranchName` gravado na sincronização**, recalculado só enquanto o card
   está em Tarefas, e mostrado nos cards fora de Tarefas (como no `Main.png`). O `orchestrator` assume o campo.
8. **Selo de estado "Parado" para `idle` fora de Tarefas.** Copy visível. **Adotada: "Parado"**, com as
   variantes atuais do `badge.tsx` (tons `ok`/`warn`/`info` ficam para quando houver estado real, no
   `orchestrator`). Alternativa: não mostrar selo para `idle`.
9. **Recusa de recarga com coluna removida que tem cards.** Não está no corte da spec; a `board-import` deixou
   para cá. **Adotada: incluir** (409, sem pedir destino). Sem ela, um card pode ficar numa etapa que não existe.
   Alternativa: pedir o destino dos cards antes de aplicar.
10. **Home `/` continua o resumo de `entity`.** Herdada da `board-import` (pergunta 7 de lá). Não muda aqui.
11. **Nome da coleção `card` (singular)** × `cards` do `ARCHITECTURE.md`. **Adotada: singular**, como `board` e
    `boardMember` já gravados; o `/develop` corrige a tabela do `ARCHITECTURE.md` para os nomes reais.
