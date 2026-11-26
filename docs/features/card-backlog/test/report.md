# Relatório de QA: cards a partir do backlog de specs e board com colunas

Passada única do `/test` da tarefa 5 do `/cycle` (`card-backlog`), em 2026-11-26, na branch
`guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). O working tree carrega também as tarefas 1 a 4,
já testadas. Nada foi commitado.

Resultado: 16 de 17 critérios confirmados. Um defeito 🟡: o detalhe do card mostra o frontmatter YAML da spec
como um título no topo do corpo. Uma observação 🟡 de acessibilidade: depois de mover pelo menu "⋯", o foco
de teclado cai no `body`. Suíte Vitest e E2E verdes. O item 10 herdado da `board-members` passou.

## Cobertura

| Comando | Resultado |
|---|---|
| `pnpm test` (raiz, com cache, JDK 21 no `PATH`) | 13/13 tasks, 10 do cache. `@repo/kanban-contract` 87, `@repo/sdk` 9, `@repo/design-system` 142, `@repo/internationalization` 35, `@repo/auth` 211, `@repo/shared` 51, `@repo/security` 65, `@repo/next-config` 34, `@repo/analytics` 41, `e2e` (Vitest) 16, `api` 1054 (87 arquivos), `api` `test:emulator` 142, `app` 728 (103 arquivos). 54 s. |
| `pnpm --filter app exec vitest run __tests__/boardColumnsMove.test.tsx` | 7/7 |
| `pnpm exec biome check` no teste novo | sem erro (depois de subir três regex para o topo do módulo) |
| `pnpm --filter app typecheck` | sem erro |
| `pnpm test` de novo, depois do teste novo | 13/13 tasks, 11 do cache; `app` 735 (104 arquivos) |
| `pnpm e2e` (Playwright, suíte inteira, portas padrão livres) | 31/31 em 3,4 min. Nenhuma falha, então não houve rodada isolada. |

A cobertura do `apiErrors` (`apiErrorCodesTranslated`) roda dentro do `api` 1054, verde: os sete códigos novos
têm copy. O `/review` já mediu `pnpm check` (813 arquivos) e o typecheck dos cinco workspaces; depois disso só
entrou o arquivo de teste novo, que passou no Biome e no typecheck do app.

### Teste criado

`apps/app/__tests__/boardColumnsMove.test.tsx` fecha a lacuna "sem teste de componente para `BoardColumns` e
`CardMoveMenu`". Monta o `BoardColumns` real com `groupCardsByColumn` e o dicionário pt-br, e dispara os
eventos de arrastar com um `dataTransfer` falso. Prova que:

- soltar um card de Tarefas sobre outro chama `onReorder` com a fila nova e a posição;
- soltar numa etapa chama `onMove` com `{ lane: "stage", stageKey }` e acende a coluna (`bg-accent`,
  `ring-primary`) só durante o arraste;
- soltar na própria coluna não chama nada, e a coluna não acende;
- um card de etapa solto sobre um card de Tarefas volta para Tarefas (`{ lane: "tasks" }`);
- sem permissão de priorizar, os cards saem com `draggable="false"` e sem menu;
- o menu oferece só o que muda a posição (primeiro da fila sem "Subir" e "Mover para o topo"; card numa etapa
  com "Mover para Tarefas" e sem a própria coluna), e cada item chama o callback certo.

## Decisões de custo de teste

| Módulo tocado | Decisão |
|---|---|
| `BoardColumns`, `CardMoveMenu`, `BoardCardItem`, `BoardColumn` | Teste de componente novo (faixa barata). A lógica pura já tinha teste; faltava provar que os eventos chegam a ela. |
| `card.repository.ts` | Sem teste da faixa cara. As consultas são igualdades (`boardId` + `deletedAt == null`) e rodaram no Firestore do emulador nesta passada, sem pedido de índice. Um teste de emulador repetiria isso. |
| Rotas de cards (`cards`, `sync`, `order`, `[slug]`, `move`, `spec`) e `reload` | Já cobertas por `boardCardsRoutes.test.ts` e `boardsRoutes.test.ts` com o cliente falso do GitHub. A passada pela API repetiu os códigos de erro contra o emulador. |
| `SpecMarkdown` | Já coberto por `specMarkdown.test.tsx` (11 testes). Nenhum deles passa um arquivo com frontmatter, e é aí que mora o defeito abaixo. Não acrescentei teste: o comportamento esperado depende da correção, que é do `/develop`. |
| Contrato (`boardLanes`, `specBacklog`, `specFrontmatter`, `roles`) | Já coberto no `@repo/kanban-contract` (87). |

## Critérios de aceite

Texto completo em [`criterios-aceite.md`](criterios-aceite.md).

| # | Critério | Status | Meio |
|---|---|---|---|
| 1 | Criar o board leva ao quadro, ainda sem sincronizar | ✅ | e2e. "Criar board" levou a `/pt-br/boards/agent-board-demo--sample-app` com o painel "Backlog ainda não sincronizado" e as seis colunas vazias com as três dicas. A lista de boards aponta para o quadro. |
| 2 | Sincronizar cria um card por spec, na ordem do índice | ✅ | e2e + rota. Tarefas: 1 "Busca por texto nos cards", 2 "Atalhos de teclado no quadro", 3 "Tema escuro". A segunda sincronização anunciou "Backlog sincronizado: 0 criados, 0 atualizados, 0 órfãos.". O toast da primeira sumiu antes da captura; a contagem de 5 criados fica com `boardCardsRoutes.test.ts`. O botão desabilitado durante a requisição foi conferido no código (`disabled={isPending}`), não no browser. |
| 3 | Specs que não estão prontas ficam fora de Tarefas | ✅ | e2e + API. "Não prontas 2 specs" com "Avisos no Slack…" (`proposed`) e "Enxugar o fork do boilerplate" (`done`). Mover `slack-alerts` para Análise: 409 `CARD_NOT_READY`. |
| 4 | Arquivos que não viraram card aparecem no aviso | ✅ | e2e. "Alguns arquivos do backlog não viraram card" com `specs/features/legacy-export.md · arquivo não encontrado` e `specs/features/broken-frontmatter.md · frontmatter sem id ou status`, com botão "Fechar". |
| 5 | Reordenar Tarefas persiste e sobrevive à sincronização | ✅ (arraste com mouse real 🔒) | e2e + componente. Eventos de arrastar despachados no browser real levaram "Tema escuro" ao topo; `PUT cards/order` 200; a ordem sobreviveu ao reload e à nova sincronização. "Descer" pelo menu em 390 px também gravou. `CARD_ORDER_STALE` pela API: 409. |
| 6 | Mover entre colunas muda só a posição | ✅ | e2e + API. Busca foi para Análise com "Parado" e `feat/search-cards`; a API devolveu `state: "idle"`, e as coleções do emulador não têm `run`. Análise → Concluído pelo arraste e Concluído → Tarefas pelo menu: voltou em 3º, no fim da fila. Etapa `nope`: 422 `CARD_STAGE_NOT_FOUND`; `lane: "bogus"`: 400 `VALIDATION_FAILED`. |
| 7 | A coluna sob arraste fica destacada nos dois temas | ✅ | e2e + componente. Escuro: fundo `lab(15.2)` sobre fundo de página `lab(2.75)`, anel de 2 px `lab(98.26)`. Claro: fundo `lab(96.52)` sobre `lab(100)`, anel `lab(7.78)`. A classe saiu no `dragend`. |
| 8 | O menu "⋯" funciona por teclado e anuncia o resultado | ✅ | e2e. Tab do título levou ao botão "Ações de Busca por texto nos cards"; Enter abriu com foco em "Mover para o topo"; três setas para baixo chegaram a "Mover para Análise"; Enter moveu. O `<p aria-live="polite">` ficou "Busca por texto nos cards movido para Análise.". Ver a observação de foco abaixo. |
| 9 | O título do card mostra foco visível | ✅ | e2e. Com `:focus-visible`, `text-decoration-line: underline` em escuro e em claro. |
| 10 | Quem não prioriza não arrasta nem vê o menu | ✅ | e2e + API. `qa-reader`: zero botões de sincronizar, zero menus, três cards com `draggable="false"`, dica "Nenhum card" na primeira etapa. API: 403 `BOARD_ROLE_INSUFFICIENT` em sync, order e move; 200 em lista, card e spec. |
| 11 | Admin personificando fica só na leitura | ✅ | e2e + API. "Modo somente leitura", sem sincronizar, sem menu, quatro cards não arrastáveis. Escritas: 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY`; `GET cards` 200. |
| 12 | Card de outro board não vaza | ✅ | API. Documento `agent-board-demo--sample-app__foreign` com `boardId` de outro board: 404 `CARD_NOT_FOUND` e fora da lista. Slug inexistente: 404 `CARD_NOT_FOUND`. Board alheio: 404 `BOARD_NOT_FOUND`. Documento apagado depois. |
| 13 | Spec removida deixa o card órfão, nunca o apaga | ✅ | e2e + API. Card `removed-spec` em Análise, sincronizado: `orphan: true`, `ready: false`, `deletedAt: null`; no quadro, "Spec removida" na própria coluna; no detalhe, "A spec não está mais no repositório." e "O arquivo specs/features/removed-spec.md não existe mais em main. O card continua no board.". |
| 14 | O detalhe mostra a spec como texto seguro e legível | ❌ | e2e. A parte de segurança passou: `<script>alert("spec")</script>` aparece como texto, zero `<script>` e zero `<img>` no `main`, "um link que não deve virar link" sem `href`, "Imagem: Esboço da busca" aponta para `…/blob/main/specs/features/assets/search.png`, "os atalhos" resolve para `…/blob/main/specs/features/keyboard-shortcuts.md`, links externos com `target="_blank"` e `rel="noreferrer noopener"`, tabela e dois checkboxes desabilitados ("Concluído" marcado, "Pendente" não). Falhou na legibilidade: o frontmatter aparece no topo. Ver defeito. |
| 15 | Recarga que remove coluna com cards é recusada | ✅ | e2e + API. Com a etapa `extra` e um card nela, "Recarregar configuração" mostrou "A nova configuração remove uma coluna que ainda tem cards. Mova os cards antes de recarregar."; a API devolveu 409 `BOARD_RELOAD_STAGE_HAS_CARDS`, e o board seguiu com 5 etapas e o sha antigo. Com a etapa vazia, a recarga aplicou e devolveu `removed: [{ key: "extra" }]`. |
| 16 | O quadro é legível em claro, escuro e 390 px | ✅ | e2e. Em 1440 px, a faixa de colunas rola dentro dela (`scrollWidth` 1848 em 1119). Em 390 px, claro e escuro: `scrollWidth` igual a `clientWidth` (390), seis colunas empilhadas com 326 px. No detalhe em 390 px, só o `<code>` passa da tela, dentro de um `pre` com `overflow-x: auto`. O menu aberto ficou entre x=123 e x=341. |
| 17 | O antd segue igual depois do `@layer antd` | ✅ (paginação 🔒) | e2e. Ver o item 10 da lista abaixo. |

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|---|---|
| 1 | Arrastar nativo | **Confirmado pela lógica, 🔒 para o mouse real.** O `agent-browser drag` move o mouse pelo CDP e não gera eventos de arrastar do HTML5: a ordem não mudou e nenhum `PUT` chegou à API. Despachei então `dragstart`, `dragenter`, `dragover`, `drop` e `dragend` com um `DataTransfer` real, no Chrome, sobre os elementos do quadro. Os handlers do React responderam: `setData("text/plain", "dark-theme")`, `dragover` com `preventDefault`, coluna com `bg-accent ring-2 ring-primary`, `PUT cards/order` 200, ordem mantida no reload e na sincronização seguinte. Análise → Concluído pelo mesmo caminho: `POST move` 200. O teste de componente novo cobre os mesmos caminhos. O gesto com mouse de verdade (o navegador iniciar o arraste) continua 🔒: precisa de uma pessoa ou do Playwright com `dragTo`. |
| 2 | Menu "⋯" por teclado | **Confirmado.** Nome "Ações de Busca por texto nos cards", Tab, Enter, setas e Enter; anúncio "Busca por texto nos cards movido para Análise.". Observação: depois do movimento o foco foi para o `body` (abaixo). |
| 3 | Sincronização (Q1 e Q2) | **Confirmado**, com uma ressalva: o toast da primeira sincronização sumiu antes da captura. O formato foi medido na segunda ("0 criados, 0 atualizados, 0 órfãos."). |
| 4 | Detalhe com `search-cards` | **Confirmado na segurança, derrubado na legibilidade.** Tudo o que o item pede aparece como descrito. O que o item não pedia e apareceu: o frontmatter vira `<hr>` seguido de `<h3>` "id: search-cards title: Busca por texto nos cards status: approved". |
| 5 | Regra 13 pela API | **Confirmado.** `qa-reader`: 403 `BOARD_ROLE_INSUFFICIENT` nas três escritas, 200 nos três `GET`; a tela sem menu nem arrastar. Cross-board: 404 `CARD_NOT_FOUND`. Personificação: 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY`. |
| 6 | Foco do título | **Confirmado** em claro e escuro (`underline` com `:focus-visible`). |
| 7 | Recarga recusada | **Confirmado**, com a copy do `apiErrors`. |
| 8 | Consultas no emulador | **Confirmado.** `listByBoard` rodou em todas as cargas do quadro e o `applySync` (`set` na criação, `update` no órfão) em três sincronizações, sem 5xx no log da API e sem menção a índice no log do emulador. Ressalva igual à da `board-members`: o emulador nunca exige índice composto, então a prova vale para o emulador; as duas consultas são igualdades, que o Firestore real resolve com índices de campo único. |
| 9 | Q5 a Q11 e 390 px | **Confirmado** (critérios 6, 10, 11, 13, 14, 15 e 16). |
| 10 | Herdados da `board-members` | **Confirmado.** Em Membros (tabela antd): link ativo com fundo `lab(96.52)` em claro e `lab(15.2)` em escuro; os inativos transparentes. Em Configuração (55 elementos antd), escuro: "Configuração" com `lab(15.2)`, os outros transparentes. Cabeçalho da tabela com `lab(96.52)`/`lab(15.2)`, peso 600; linhas transparentes com borda `lab(90.95)`/`lab(15.2)`. Menu de ações: fundo `lab(100)`/`lab(2.75)`, raio 12 px, item destrutivo vermelho (`lab(48.4 77.4 61.5)` em claro, `lab(63.7 60.7 31.3)` em escuro). `Popconfirm`: fundo `lab(100)`/`lab(2.75)`, raio 12 px, "Não" com contorno e "Sim" preenchido, invertidos no escuro. Links com `buttonVariants` em telas sem antd (passo 2 do novo board, 404) e com antd ("Minha conta" no menu do perfil) com fundo e cor esperados; a sidebar ativa com `lab(96.52)`/`lab(15.2)`. Nomes acessíveis: "Cancelar convite" e "Mover para …", sem "delete" nem "edit". A paginação ficou 🔒: nenhuma tela do ambiente tinha mais de uma página (a lista de usuários do admin tem 5). |

## Defeitos e observações

### 🟡 O detalhe do card mostra o frontmatter da spec como título

Repro: entrar como dono, sincronizar o backlog do `sample-app` e abrir
`/pt-br/boards/agent-board-demo--sample-app/cards/search-cards`, em qualquer tema ou largura. O corpo da spec
começa com uma linha horizontal e o título "id: search-cards title: Busca por texto nos cards status:
approved", acima do título real "Busca por texto nos cards". Toda spec do board tem frontmatter (é o que a
sincronização exige), então isso acontece em todo detalhe de card.

Causa: `GET cards/<slug>/spec` devolve o arquivo inteiro, frontmatter incluído, e o `SpecMarkdown` passa o
texto direto ao `marked.lexer`. O lexer lê o `---` de abertura como `hr` e as três linhas seguidas do `---` de
fechamento como um título setext de nível 2, que o componente rebaixa para `h3`. Correção sugerida: retirar o
bloco de frontmatter antes do lexer, no `SpecMarkdown` (o app não empacota o `yaml`, mas basta cortar do
primeiro `---` ao segundo quando o arquivo começa com `---`) ou na rota da spec. Um teste em
`specMarkdown.test.tsx` com um arquivo que começa com frontmatter reprova hoje. Arquivo:
`apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecMarkdown.tsx`.

### 🟡 O foco de teclado se perde depois de mover pelo menu

Repro: Tab até "Ações de <título>", Enter, setas até "Mover para Análise" e Enter. O card muda de coluna e o
anúncio sai, mas `document.activeElement` passa a ser o `body`: o próximo Tab recomeça do topo da página. O
card que tinha o gatilho foi desmontado e remontado em outra lista. Não reprova o critério (mover por teclado
funciona), mas quem usa teclado perde o lugar a cada movimento. Sugestão: depois do `move` ou do `reorder`,
devolver o foco ao gatilho do card na posição nova.

### 🟢 Observações sem impacto no aceite

- O aviso de arquivos pulados vive em estado local do `BoardClient`: depois de navegar para outra página e
  voltar, ele some até a próxima sincronização. O `board.backlogSync` não guarda a lista.
- O detalhe de um card órfão continua mostrando o status da última sincronização ("approved") abaixo do caminho
  da spec.
- No bloco de código, a fonte mono desenha `=>` como ligadura (`⇒`).
- Artefatos da ferramenta, não do produto: um clique do `agent-browser` num gatilho fora da área visível da
  faixa de colunas (ela tinha rolado na horizontal) não abriu o menu, e abriu depois de `scrollintoview`; com a
  aba em segundo plano depois do popup do GitHub, a animação de saída do dropdown não terminou até a aba voltar
  a ficar visível; o primeiro clique em "Criar board" durante a recompilação do `next dev` não disparou nada.

### Comparação com as referências

`BoardEmpty.png`: batem o painel com ícone, título e texto, o botão "Sincronizar backlog", as colunas com
contagem e as dicas de Tarefas e da primeira etapa ("Arraste um card de Tarefas para cá.", sem o "e o agente
começa a planejar"). Ficam fora por escopo: o painel de runner, a coluna Rascunhos, "Escrever uma spec" e
"Descobrir specs", a coluna Aguardando PR e a barra superior do board. O estado "Nenhuma spec pronta ainda"
(sincronizado, sem nenhuma aprovada) não foi visto: o cliente falso não tem repositório nessa situação.

`Main.png` e `DarkMain.png`: batem a posição numerada e o título nos cards de Tarefas, o subtítulo
`/<command> · <model> · <effort>` em mono e o selo de estado com a branch nos cards de etapa. Diferenças: sem
busca, filtros, "Rodar ciclo", "Nova spec" e Rascunhos (outras specs); colunas de 288 px (`w-72`) contra cerca
de 220 px na referência, então em 1440 px com o menu lateral aparecem quatro colunas e o resto rola; o menu "⋯"
fica em todos os cards de Tarefas, e a referência o mostra só nos de etapa; selos e botões seguem o tema do
design system, sem o roxo.

`MBoard.png`: as colunas empilham como na referência, mas na ordem do quadro (Tarefas primeiro), sem as
pílulas de atalho do topo, sem a barra inferior e sem "Ver as N tarefas". Previsto no plano.

## Remedição na passada da theme-toggle

Em 2026-11-26, a passada do `/test` da `theme-toggle` mediu no navegador as três correções que a revisão da
`card-backlog` fez depois da rodada 1 (emulador próprio, `sample-app` sincronizado, conta `qa-owner`). Detalhe
em [`theme-toggle/test/report.md`](../../theme-toggle/test/report.md#verificar-no-test-lista-da-revisão).

| Item | Veredito |
|---|---|
| Detalhe do card sem frontmatter | **Confirmado.** Em `/boards/agent-board-demo--sample-app/cards/search-cards`, nenhum `<hr>` no `main`, nenhum texto "id: search-cards"; os títulos são "Busca por texto nos cards" (h1 e h2) e "Corte" (h3). O defeito 🟡 da rodada 1 está fechado. |
| Foco depois de mover e reordenar por teclado | **Confirmado.** Depois de "Descer" pelo menu, o foco fica no gatilho "Ações de Busca por texto nos cards" (com `:focus-visible`) e o anúncio diz "agora está na posição 2.". Depois de "Mover para Análise", o foco fica no gatilho do card dentro da seção "Análise" e o anúncio diz "movido para Análise.". A observação 🟡 está fechada. |
| Card órfão só com "Spec removida" | **Confirmado.** Dois cards gravados fora do backlog (um de spec `proposed`, outro de `approved`) e sincronizados: em "Não prontas", só o selo "Spec removida"; no detalhe, a linha Spec sem status. |

Suíte na mesma passada: `pnpm test` da raiz 13/13 (`api` 1055, `kanban-contract` 89, `app` 810) e `pnpm e2e`
31/31. Com isso o `test` desta spec passa a `done`.

## Lacunas

| Lacuna (do handoff e da revisão) | Veredito |
|---|---|
| Sem teste de componente para `BoardColumns` e `CardMoveMenu` | Fechada: `boardColumnsMove.test.tsx`, 7 testes. |
| `card.repository.ts` sem teste contra o emulador | Continua aberta no Vitest; as consultas e os lotes rodaram no emulador nesta passada (item 8). |
| Sem E2E do quadro | Continua aberta, fora do escopo desta spec. O arraste com mouse real seria o primeiro candidato (`locator.dragTo` do Playwright gera os eventos do HTML5). |
| Slugs reservados; esquemas codificados no `SpecMarkdown` | Já fechadas no `/review`; a suíte que as cobre passou aqui. |
| Arrastar nativo nunca exercitado em navegador | Fechada em parte: handlers e persistência provados no Chrome com eventos despachados; o gesto do mouse fica 🔒. |
| Toast "5 criados" | Continua só no teste de rota; o formato do toast foi visto no browser. |
| Estado "Nenhuma spec pronta ainda" | Aberta: sem repositório de exemplo que o produza. |
| Paginação do antd depois do `@layer antd` | 🔒: nenhuma tela com mais de uma página no emulador. |

## Ambiente do e2e

- No início, 3000, 3002, 4001, 4400, 8080, 9099, 9199 e as portas próprias estavam livres; o `quahog` não
  estava de pé.
- O `pnpm test` e o `pnpm e2e` subiram e derrubaram os próprios servidores e emuladores nas portas padrão; elas
  voltaram vazias depois de cada um.
- Para o browser subi o emulador com config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI), rodei o seed contra ele e subi `api` em 3012 e
  `app` em 3010 com o mesmo ambiente que o Playwright monta, trocando só portas e hosts. O cliente do GitHub
  rodou no modo falso.
- No fim fechei as três sessões do `agent-browser`, matei `api` e `app` por PID com os filhos (os dois
  `next-server` precisaram de um segundo `kill` por PID) e mandei SIGINT ao `firebase-tools`. As portas 3010,
  3012, 8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias. Apaguei `apps/api/AGENTS.md`,
  `apps/app/AGENTS.md` e os dois `firestore-debug.log` que a suíte do emulador deixou.

## Evidências

Prints em `docs/features/card-backlog/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-quadro-nao-sincronizado-claro.png` (o tema do browser era escuro nessa hora, apesar do nome),
`02-quadro-escuro-desktop.png`, `03-quadro-claro-desktop.png`, `04-detalhe-claro.png`,
`05-detalhe-escuro-390.png`, `06-quadro-escuro-390.png`, `07-menu-escuro-390.png`, `08-quadro-claro-390.png`,
`09-membros-popconfirm-claro.png`, `10-membros-popconfirm-escuro.png`.

## Dados de QA

Tudo no emulador local, já descartado: as contas GitHub `qa-owner` e `qa-reader` (e-mails
`qa-card-backlog-owner@example.com` e `qa-card-backlog-reader@example.com`), criadas pelo popup do emulador, e
`admin@example.com` do seed. Também o board `agent-board-demo--sample-app`, os cinco cards da sincronização, o
card `removed-spec` e o documento `foreign` gravados pela API REST do emulador (o segundo apagado no fim do
teste), o convite de `qa-reader` como Operador e a etapa `extra`, removida pela recarga. Nenhuma conta em
projeto Firebase real. A senha do seed é a do `docs/SETUP.md`, só de emulador, e não está escrita aqui.

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das tarefas existe: o gate do `/review` segue aberto à
espera do plano de commits. O `test` ficou `blocked` pelo defeito do frontmatter na rodada 1 e passou a `done`
depois da remedição acima.
