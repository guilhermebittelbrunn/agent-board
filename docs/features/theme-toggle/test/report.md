# Relatório de QA: tema claro e escuro no board

Passada única do `/test` da tarefa 6 do `/cycle` (`theme-toggle`), em 2026-11-26, na branch
`guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). O working tree carrega também as tarefas 1 a 5.
Nada foi commitado.

Resultado: 11 de 11 critérios confirmados no navegador e na suíte. Os 10 itens do "Verificar no `/test`"
passaram, incluindo os três herdados da `card-backlog`. Nenhum defeito de produção. Suíte Vitest e E2E verdes.

## Cobertura

| Comando | Resultado |
|---|---|
| `pnpm test` (raiz, com cache, JDK 21 no `PATH`) | 13/13 tasks, 9 do cache, 1 min 8 s. `@repo/design-system` 148, `@repo/internationalization` 35, `@repo/kanban-contract` 89, `app` 810 (105 arquivos), `api` 1055 (87 arquivos), `api` `test:emulator` 142, `@repo/auth` 211, `@repo/shared` 51, `@repo/security` 65, `@repo/next-config` 34, `@repo/analytics` 41, `@repo/sdk` 9, `e2e` (Vitest) 16. |
| `pnpm turbo run typecheck --filter=@repo/design-system --filter=@repo/internationalization --filter=app` | 3/3, do cache |
| `pnpm e2e` (Playwright, suíte inteira, portas padrão livres) | 31/31 em 5,1 min. Nenhuma falha, então não houve rodada isolada. |

O `pnpm test` da raiz cobre os workspaces afetados (`design-system`, i18n, `app`) e os do herdado (`api`,
`kanban-contract`), então não rodei cada um à parte. A cobertura do `apiErrors` roda dentro do `api` 1055; a
tarefa 6 não criou `error.code`. Não rodei `pnpm check`: o `/review` mediu 816 arquivos sem problema e esta
passada não alterou código. O typecheck veio inteiro do cache, o que confirma que nada mudou desde a revisão.

### Testes criados

Nenhum. O que faltava provar (qual dos dois textos entra na árvore de acessibilidade) depende de CSS aplicado,
que o jsdom não faz. A passada no navegador mediu isso nos dois temas; um teste Playwright novo exigiria
servidores e browser de pé para repetir a mesma medida, e o objeto do teste não é infra.

## Decisões de custo de teste

| Módulo tocado | Decisão |
|---|---|
| `mode-toggle.tsx` | `modeToggle.test.tsx` e `componentCopy.test.tsx` (dentro dos 148 do design-system) já provam o clique, o `setTheme` e os dois textos. A troca do nome por tema foi medida no navegador; nenhum teste da faixa cara criado. |
| `mode-toggle.ts` (i18n) | Coberto pelo teste de cópia e pelos 35 do pacote. |
| `boardThemeTokens.test.ts` | Roda dentro do `app` 810 e passou. A varredura de fundo claro no escuro, feita no navegador, bate com o que ele garante. |

## Critérios de aceite

| # | Critério | Status | Meio |
|---|---|---|---|
| 1 | Um clique no navbar troca o tema, sem menu e sem recarregar | ✅ | e2e. No quadro, um marcador gravado em `window` sobreviveu ao clique; `role="menu"` = 0; fundo do `body` foi de `lab(100)` a `lab(2.75)`. |
| 2 | O nome acessível diz a ação, um por tema | ✅ | e2e (snapshot de acessibilidade). Detalhe no item 1 da lista abaixo. |
| 3 | O ícone diz a ação e fica centrado | ✅ | e2e (medida). Item 4 abaixo. |
| 4 | Quem nunca escolheu vê o tema do sistema | ✅ | e2e. Sem `localStorage.theme` e sem cookie `x-theme`: escuro com o sistema em escuro, claro com o sistema em claro. |
| 5 | A escolha persiste, sem piscar | ✅ | e2e. Item 3 abaixo. |
| 6 | Diálogos, menus, toasts e tabela antd seguem o tema | ✅ | e2e. Item 5 abaixo. |
| 7 | Botão ao lado do avatar, desktop e celular | ✅ | e2e. Item 5 abaixo. |
| 8 | Nenhuma tela do board deixa trecho claro no escuro | ✅ | e2e (varredura) + `boardThemeTokens.test.ts`. |
| 9 | "Sistema" continua na tela da conta | ✅ | e2e. Item 6 abaixo. |
| 10 | A tela de entrar alterna direto | ✅ | e2e. Item 7 abaixo. |
| 11 | Sem regressão nos fluxos críticos | ✅ | `pnpm test` e `pnpm e2e`. |

A varredura do critério 8 percorreu `/boards/<id>`, o detalhe do card, Membros, Configuração e `/boards/new` no
escuro, procurando elementos do `main` com fundo de luminosidade acima de 60. Só apareceram o selo de
notificação, o botão primário ("Convidar", "Escolher") e o checkbox marcado da spec, todos com o token
`lab(98.26)` do primário no escuro.

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|---|---|
| 1 | Nome acessível por tema | **Confirmado.** O snapshot de acessibilidade do `agent-browser` nomeia o botão `button "Usar tema escuro"` no claro e `button "Usar tema claro"` no escuro, no navbar (1440 px e 390 px) e na tela de entrar. Nenhum snapshot trouxe os dois textos. No escuro, o `span` "Usar tema escuro" está com `display: none` e o outro com `display: block` (o `sr-only` absoluto transforma `inline` em bloco, sem efeito na leitura). No claro, o inverso. |
| 2 | Sem aviso de hidratação | **Confirmado.** Console e erros de página limpos ao recarregar `/boards/<id>` com `x-theme=dark` e depois sem cookie e sem `localStorage` (sistema em escuro e em claro). O HTML do servidor traz os dois textos no botão, como esperado. A navegação seguinte por seis telas do board também não deixou aviso. |
| 3 | Troca sem recarregar e persistência | **Confirmado.** Depois do clique, `localStorage.theme` = `dark` e cookie `x-theme=dark`; no clique seguinte, `light` nos dois. Com o sistema em escuro e `light` escolhido, o recarregamento mantém o claro, e o `<html>` que o servidor devolve (buscado pelo próprio browser com os cookies) já vem sem a classe `dark`. Com `x-theme=dark`, ele vem com `dark`. A primeira pintura já sai no tema certo. |
| 4 | Ícone | **Confirmado.** No claro, lua com `scale: 1` e sol com `scale: 0`, `rotate: 90deg`; no escuro, sol com `scale: 1` e lua com `scale: 0`, `rotate: -90deg`. O ícone visível tem 16 px e o centro dele fica a 0,0 px do centro do botão de 36 × 36 px nos dois temas. Um print tirado durante a transição mostra os dois ícones meio sobrepostos; é a animação, que termina centrada. |
| 5 | Diálogos, menus, toasts, tabela antd, 390 px | **Confirmado.** No escuro: menu "⋯" do card e menu de ações do membro com fundo `lab(2.75)` e texto `lab(98.26)`; diálogo "Mudar o papel de qa-writer" com fundo `lab(2.75)` e texto `lab(98.26)`; toast "Backlog sincronizado: 5 criados, 0 atualizados, 0 órfãos." escuro; cabeçalho da tabela antd `lab(15.2)` com texto `lab(98.26)`. No claro, cabeçalho `lab(96.52)` e texto `lab(2.75)`. A 390 px, botão em x 298 e avatar em x 342 (36 px cada, 8 px de vão), `scrollWidth` 390, no quadro e no detalhe do card, e o clique alterna nos dois. |
| 6 | "Sistema" pela conta | **Confirmado.** Com o tema escolhido em escuro e o sistema em claro: Conta, Preferências, "Sistema", "Salvar preferências" (`PUT /account` 200). A tela foi para o claro, `localStorage.theme` = `system`. Ao trocar o sistema para escuro, a tela foi junto sem recarregar e o botão passou a "Usar tema claro". Antes de salvar, o rádio já marcava "Sistema" com a tela no escuro, como a revisão descreveu (o 🟢 dela). |
| 7 | Tela de entrar ≥ `lg` | **Confirmado.** A 1440 px, o clique trocou para o escuro, gravou `x-theme=dark`, não abriu menu e não mudou a URL. O sol aparece no painel lateral. |
| 8 | Detalhe do card sem frontmatter (`card-backlog`) | **Confirmado.** Em `/boards/agent-board-demo--sample-app/cards/search-cards`, nenhum `<hr>` no `main`, nenhum texto "id: search-cards" e os títulos são "Busca por texto nos cards" (h1 e h2) e "Corte" (h3). |
| 9 | Foco depois de mover e reordenar por teclado (`card-backlog`) | **Confirmado.** Foco no gatilho "Ações de Busca por texto nos cards", Enter, setas, Enter em "Descer": anúncio "Busca por texto nos cards agora está na posição 2." e `document.activeElement` é o mesmo gatilho, com `:focus-visible`. Depois, "Mover para Análise": anúncio "Busca por texto nos cards movido para Análise." e o foco está no gatilho do card dentro da seção "Análise". |
| 10 | Card órfão só com "Spec removida" (`card-backlog`) | **Confirmado.** Gravei dois cards cujas specs não estão no backlog (um copiado de uma spec `proposed`, outro de uma `approved`) e sincronizei. Em "Não prontas", os dois mostram só o selo "Spec removida", enquanto as outras mostram `proposed` e `done`. No detalhe do card órfão, a linha Spec traz o caminho e não traz status; abaixo, "A spec não está mais no repositório." |

## Defeitos e observações

Nenhum defeito de produção.

Observações sem impacto no aceite:

- 🟢 O rádio de tema da conta mostra a preferência salva, não o tema da tela (já registrado na revisão).
- Artefatos da ferramenta, não do produto: depois do popup do GitHub, a aba do `agent-browser` ficou com
  `visibilityState = hidden`. Nesse estado, a animação de saída do dropdown antd não terminou e o menu "Mudar
  papel / Remover" continuou desenhado sobre o diálogo; ao trazer a aba para a frente, o menu e o diálogo
  fechado sumiram. O mesmo estado explica dois cliques em "Criar board" sem efeito, resolvidos com um clique
  pelo DOM (`POST /boards` 201).

### Comparação com as referências escuras

`DarkMain.png` (1440 px): o quadro escuro bate em estrutura (colunas com contagem, subtítulo
`/<command> · <model> · <effort>` em mono, cards numerados em Tarefas, menu "⋯"). Diferenças: o fundo é cinza
neutro do design system (`lab(2.75)` na página, cartões um pouco mais claros) e a referência é quase preta com
um toque azulado; não há roxo nos botões e selos (o primário no escuro é branco, como "Novo board" e
"Convidar"); o botão de tema é redondo de 36 px com fundo `bg-sidebar-border`, no navbar do painel, e não o de
40 px com borda da barra superior do desenho (decisão 4 do plano). Faltam a barra superior do board, busca,
filtros e as colunas de outras specs, como a `card-backlog` já registrou.

`DarkMBoard.png` (390 px): as colunas empilham como na referência e o botão de tema fica no topo à direita.
Diferenças: no lugar do botão "+" ficam o sino de notificações e o avatar; sem pílulas de atalho, sem barra
inferior; Tarefas vem primeiro.

## Lacunas

| Lacuna (do handoff e da revisão) | Veredito |
|---|---|
| Troca do nome acessível pela classe `dark` sem teste automatizado | Fechada nesta passada pela medição no navegador; continua sem teste automatizado (decisão de custo acima). |
| Cor fixa em CSS-in-JS por nome e em `.css` dentro de `boards/**` | Continua aberta no teste. A varredura no navegador não achou fundo claro fora de token nas telas do board no escuro. |
| `ring-offset-<cor>` no teste de tokens | Já fechada no `/review`; o teste passou aqui. |
| T1 com conta de preferência "Sistema" | Fechada: a conta nova nasceu com "Sistema" e a tela seguiu o sistema nos dois sentidos. |

## Ambiente do e2e

- No início, 3000, 3002, 4001, 4400, 4500, 8080, 9099, 9199 e as portas próprias estavam livres; o `quahog`
  não estava de pé.
- O `pnpm test` (`test:emulator`) e o `pnpm e2e` subiram e derrubaram os próprios servidores e emuladores nas
  portas padrão; elas voltaram vazias depois de cada um.
- Para o browser subi o emulador com config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI), rodei o seed contra ele e subi `api` em 3012 e
  `app` em 3010 com o ambiente do `.env.example` e os mesmos blocos que o Playwright força, trocando portas e
  hosts. O cliente do GitHub rodou no modo falso.
- No fim fechei as duas sessões do `agent-browser`, matei `api` e `app` por PID com os filhos e mandei SIGINT
  ao `firebase-tools`. As portas 3010, 3012, 8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias.
  Apaguei `apps/api/AGENTS.md`, `apps/app/AGENTS.md` e os dois `firestore-debug.log` que as suítes deixaram.

## Evidências

Prints em `docs/features/theme-toggle/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-entrar-claro-desktop.png`, `02-entrar-escuro-desktop.png`, `03-novo-board-escuro.png`,
`04-toast-sync-escuro.png`, `05-nao-prontas-orfaos-escuro.png`, `06-menu-card-escuro.png`,
`07-detalhe-escuro-desktop.png`, `08-detalhe-orfao-escuro.png`, `09-quadro-claro-desktop.png`,
`10-membros-claro.png`, `11-membros-escuro.png`, `12-menu-membro-escuro.png`, `13-configuracao-escuro.png`,
`14-dialogo-papel-escuro.png`, `15-quadro-escuro-390.png`, `16-quadro-claro-390.png` (tirado no meio da
transição do ícone), `17-detalhe-claro-390.png`, `18-detalhe-escuro-390.png`, `19-boards-escuro.png`.

## Dados de QA

Tudo no emulador local, já descartado: as contas GitHub `qa-owner` e `qa-writer` (e-mails
`qa-theme-toggle-owner@example.com` e `qa-theme-toggle-writer@example.com`), criadas pelo popup do emulador,
e as contas do seed. Também o board `agent-board-demo--sample-app`, os cinco cards da sincronização, os cards
`removed-spec` e `removed-ready` gravados pela API REST do emulador, o convite de `qa-writer` como Leitor
(ativado quando ele abriu o board) e a preferência "Sistema" do `qa-owner`. Nenhuma conta em projeto Firebase
real. Nenhuma senha foi digitada: as contas entraram pelo popup do emulador.

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das seis tarefas existe: o gate do `/review` segue aberto à
espera do plano de commits. O `test` fica `done` porque a passada cumpriu o critério de saída; quem fecha o
`review` é o orquestrador do `/review`.
