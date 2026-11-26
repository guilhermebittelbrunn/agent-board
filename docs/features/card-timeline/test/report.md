# Relatório de QA: linha do tempo do card, perguntas e respostas

Tarefa 7 do `/cycle` noturno, sem perguntas ao usuário. O working tree traz também as tarefas 1 a 6, sem commit.
Branch `guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida; nada foi commitado nem criado).

Resultado: suíte e `pnpm e2e` verdes, a transação de resposta aguenta concorrência no emulador, e a segurança
(IDOR, autoria, conteúdo hostil, papéis, personificação) bate com o que a revisão leu. Três defeitos de tela
ficaram abertos, um deles contra o critério de 390 px: o botão "Responder" não fica fixo no rodapé. Por isso o
`test` fecha como `blocked`.

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter @repo/kanban-contract exec vitest run __tests__/agentContract.test.ts` | 7 de 7 (arquivo novo) |
| `pnpm test` (raiz, com cache, JDK 21) | 13 de 13 tasks, 7 do cache, 53 s |
| ↳ `@repo/kanban-contract` | 109 testes, 12 arquivos (102 do handoff + 7 novos) |
| ↳ `api` | 1.100 testes, 91 arquivos, incluindo `apiErrorCodesTranslated` (2 de 2) |
| ↳ `api` `test:emulator` | 142 testes, 4 arquivos |
| ↳ `app` | 835 testes, 109 arquivos |
| ↳ demais pacotes | design system 148, auth 211, security 65, shared 51, analytics 41, i18n 35, next-config 34, sdk 9, e2e (vitest) 16 |
| `pnpm e2e` (Playwright, completo) | 31 de 31, 1,7 min |
| `pnpm exec biome check` no arquivo novo | sem erro |

`pnpm check` e os typechecks não foram refeitos: o único arquivo novo é de teste, passou no Biome isolado e roda
no Vitest. A revisão mediu `pnpm check` (849 arquivos) e o typecheck de API, app e contrato.

### Teste criado

`packages/kanban-contract/__tests__/agentContract.test.ts`: os limites novos de `questionSchema` (`question` 1.000,
rótulo 120, descrição 500, campos vazios) e de `attachArtifactInputSchema.path` (1.024, vazio), cada um no limite e
um caractere acima, mais um `ask` com quatro perguntas no limite de tudo.

## Critérios de aceite

| # | Critério | Status | Meio e o que se viu |
|---|----------|--------|---------------------|
| 1 | Grupos por etapa, mais recente em cima | ✅ | e2e. Grupos "Análise · volta 1" (respostas e comentário), "Etapa removida (legacy)", "Executando", "Análise", cada um com o evento mais novo no topo. |
| 2 | Relatório legível com selo | ✅ | e2e. Selo "Pediu retrabalho", título "Develop — o teste da busca falhou", uma `<table>` (Gate/Resultado), link "o plano" para `…/sample-app/blob/feat/search-cards/docs/features/search-cards/analyze/plan.md`. |
| 3 | Conteúdo hostil como texto | ✅ | e2e. `<script>alert('fixture')</script>` do relatório, comentário com `<script>`, `<img onerror>` e `[clique](javascript:…)`, e resposta livre com `<b>` e `javascript:` apareceram como texto. No `main`: 0 `<script>`, 0 `<img>`, 0 `<b>`, 0 `a[href^=javascript]`; o `**negrito**` do comentário virou `<strong>`. |
| 4 | Perguntas no topo, recomendada marcada | ✅ | e2e. "A Análise parou com 2 perguntas"; radios `[true,false,false]` na 1ª e `[false,false,false,false]` na 2ª. Borda `border-warning`: `lab(47.27 42.91 69.30)` no claro, `lab(80.16 16.60 99.21)` no escuro, iguais ao `--warning` de cada tema. |
| 5 | Enviar sem escolher | ✅ | e2e. "Escolha uma opção ou escreva uma resposta." no campo; nenhum `POST answers` no log da API. |
| 6 | Responder tira o selo | ✅ | e2e. Toast "Respostas enviadas.", bloco sumiu, estado "Parado"; voltando ao quadro pelo breadcrumb, o card sem "Aguardando você". "Respondida" leva a `#card-event-<id>` e o evento fica a 176 px do topo (96 px de `scroll-mt-24` mais 80 px do `scroll-pt-20` do navbar). |
| 7 | Concorrência: 200 + 409 | ✅ | curl contra o emulador + e2e. Ver item 1 da lista da revisão. Na tela, a segunda aba recebeu 409 com o toast "Estas perguntas já foram respondidas ou foram substituídas. A tela foi atualizada. (Código do erro: <uuid>)" e o bloco sumiu. |
| 8 | Resposta que não bate | ✅ | curl. Opção 3 numa pergunta de 2: 422 `CARD_ANSWERS_MISMATCH`; uma resposta para duas perguntas: 422; `questionEventId` de um `update`: 409; pergunta deste card respondida pela URL de outro card: 409. `pendingAsk` continuou aberto. |
| 9 | Pergunta substituída "Sem resposta" | 🔒 | A fixture não tem segundo `ask` e o `agent-contract` não existe; o 409 de pergunta substituída está só no teste de rota (`cardEventsRoutes.test.ts`). "Aguardando resposta" foi visto na tela. |
| 10 | Artefatos | ✅ | e2e. Chip `docs/features/search-cards/analyze/plan.md` + `3f2a9c1`, link `https://github.com/agent-board-demo/sample-app/blob/3f2a9c1e…8d9e/docs/features/search-cards/analyze/plan.md`; aba Artefatos com "plan.md", o caminho, `3f2a9c1` e "Etapa: Análise". Recusa de caminho: unit (`cardEvents.test.ts`). |
| 11 | Leitor comenta e não responde | ✅ | e2e + curl. `qa-reader` (papel `operator`, GitHub `read`, efetivo `viewer`): 0 radios, 0 "Responder", aviso "Só quem pode disparar etapas responde às perguntas."; comentou (toast "Comentário publicado.", menu só no próprio). `POST answers`: 403 `BOARD_ROLE_INSUFFICIENT`. |
| 12 | Só o autor edita ou apaga | ✅ | e2e + curl. Ver itens 4 e 5 da lista. "(editado)" depois de salvar; "Apagar comentário?" / "O comentário some da linha do tempo para todos."; some depois de recarregar. Comentário de `qa-maintainer` sem menu. |
| 13 | Limites do comentário | ✅ | curl. Só espaços: 400 `VALIDATION_FAILED`; sem sessão: 401 `AUTH_INVALID_TOKEN`; board inexistente: 404 `BOARD_NOT_FOUND`. Acima de 20.000: unit. |
| 14 | Personificação só lê | ✅ | e2e + unit. Admin atuando como QA Owner: 0 radios, 0 "Responder", sem `<textarea>`, 0 menus. O 403 nas escritas vem do teste de rota. |
| 15 | Nenhuma rota move o card | ✅ | curl. Depois de comentar, editar, apagar, das respostas e das recusas, o card seguia `stage`/`analyze`/`idle`. |
| 16 | Limites das ferramentas dos agentes | ✅ | unit (teste novo). |
| 17 | Claro, escuro e 390 px | ❌ | e2e. Sem rolagem horizontal (`scrollWidth` 390 nos dois temas), contraste ok. Falhou: o "Responder" não fica fixo no rodapé (defeito 1) e o rótulo "Linha do tempo" vaza da aba (defeito 3). |
| 18 | Radio com descrição sem mudar outras telas | ✅ | e2e + diff. Radio e primeira linha do rótulo com centros a 0 px (−1 px na opção com selo). Preferências da Conta ("Claro", "Escuro") e entidade ("Não informar", …) com `label` `flex cursor-pointer gap-2 items-center` e `span.text-sm`, o mesmo markup do `main`. |

O fluxo de editar do critério 12 funciona, mas o campo de edição tem o defeito 2 de acessibilidade.

## Defeitos

### 1. 🟡 "Responder" não fica fixo no rodapé abaixo de `md`

Repro: viewport 390×844, abrir o detalhe com perguntas abertas, rolar. Medido: com `scrollY` 0 o botão está em
`top` 1212; com `scrollY` 300, em 912; com 900, em 312. Ele anda com a página, e a tela inicial não mostra o botão
(`MCard.png` mostra "Responder e retomar a Análise" preso ao rodapé).

Causa: o rodapé tem `sticky bottom-0`, mas o ancestral rolável mais próximo é o `div` do `Container`
(`apps/app/shared/components/ui/Container.tsx:68`, `overflow-auto`). Esse `div` não rola (`scrollHeight` igual a
`clientHeight`, 4.771 px); quem rola é a janela. O `sticky` passa a valer contra o `div`, cujo fundo está fora da
tela. Correção sugerida: usar o `stickyBar` que o `Container` já oferece para barras fixas, ou `position: fixed`
abaixo de `md` com espaço reservado no fim do bloco.

### 2. 🟡 Campo de edição do comentário sem nome acessível e com `id` repetido

Repro: menu "Ações do comentário" → Editar. As duas `<textarea>` passam a ter `id="markdown"`. O rótulo "Editar
comentário" aponta para a primeira (o campo "Comentar no card", que fica com o nome "Comentar no card Editar
comentário *"), e o campo de edição fica sem nome. Clicar no rótulo "Editar comentário" foca o campo errado.

Causa: `HookFormTextarea` usa `id={field.name}`, e `CardTimeline.tsx` e `CardEventItem.tsx` usam o mesmo `name`
(`markdown`) em dois formulários na mesma página. Correção sugerida: `id` distinto no campo de edição (por
exemplo, com o id do evento) ou outro `name`.

### 3. 🟢 "Linha do tempo" vaza da aba

Nos dois temas e em 390 px, as três abas têm a mesma largura (82 px por dentro), e o texto "Linha do tempo" ocupa
92 px. O rótulo passa da borda esquerda da lista de abas e o fundo da aba ativa fica atrás de parte do texto.
Causa: `TabsTrigger` com `flex-1` dentro de `TabsList` `w-fit`. Correção sugerida: `flex-none` (ou `px` maior)
nas abas desta tela, ou `w-full` na lista.

### Observações (sem defeito)

- O leitor vê "Aguardando você" no estado do card e a frase "O agente recebe as suas respostas na próxima
  execução desta etapa. A opção recomendada já vem marcada.", embora não possa responder. O selo segue
  `displayCardState`, que não olha quem lê.
- No escuro, o link "Respondida" (`text-primary`) tem a mesma cor do texto ao lado e só sublinha no hover.
- No claro, o radio desmarcado tem borda `lab(90.95)` sobre fundo `lab(100)`. É o estilo do design system, igual
  nas outras telas.
- A linha do tempo do card de teste acumulou várias respostas a uma só pergunta, porque o script reabre a mesma
  pergunta a cada execução. Elas aparecem empilhadas no grupo "Análise · volta 1" sem quebrar a tela.

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|------|----------|
| 1 | Transação de resposta concorrente | **Confirmado.** Cinco rodadas de duas requisições simultâneas (curl, conta `qa-owner`, depois de reabrir as perguntas com o script): em todas, uma 200 e uma 409 `CARD_QUESTIONS_NOT_PENDING`, a contagem de eventos `answer` subiu um por rodada e o `answeredByEventId` da pergunta era o id devolvido pela 200. Uma rodada com quatro simultâneas: uma 200 e três 409 (2,1 s a 3,1 s cada; o Firestore refez as perdedoras). |
| 2 | `GET events` sem índice composto | **Confirmado.** 200 no emulador com os nove eventos; nenhum pedido de índice no log. |
| 3 | O script grava nove eventos e abre `pendingAsk` | **Confirmado.** "Wrote 9 events on agent-board-demo--sample-app__search-cards and opened 2 questions."; o `GET` do card devolveu `pendingAsk` `{ eventId: fixture_…_04, stageKey: analyze, count: 2 }`. |
| 4 | IDOR e autoria | **Confirmado.** `PATCH` e `DELETE` de um comentário de `search-cards` pela URL de `dark-theme`: 404 `CARD_EVENT_NOT_FOUND`. `DELETE` e `PATCH` do comentário de `qa-maintainer`: 403 `CARD_EVENT_NOT_EDITABLE`; `PATCH` de evento de agente: 403; id inexistente: 404. |
| 5 | Comentário apagado | **Confirmado.** `DELETE` 204; o id não volta no `GET`; `PATCH` e `DELETE` nele: 404. Na tela, some depois de recarregar. |
| 6 | Markdown hostil e `path` de URL | **Confirmado em parte.** Hostil como texto (critério 3). O `path` de URL não foi exercitado no browser (nenhuma rota grava artefato); a normalização está coberta em `cardEvents.test.ts`. |
| 7 | T1 a T11 e a lista do handoff | **Confirmado, com defeitos.** T1 a T10 passaram (critérios 1 a 14); T11 falhou no botão fixo (defeito 1). `border-warning` nos dois temas, "Respondida" rolando, selo sumindo no quadro. |
| 8 | Radio com descrição e selo | **Confirmado** (critério 18). |

## Decisões de custo de teste

- Contrato (`agentContract.ts`): teste unitário novo; schemas puros não precisam de outra camada.
- `card-event.repository.ts` (transações): nenhum teste da faixa cara criado. A concorrência foi medida contra o
  emulador por curl nesta passada. Um teste automatizado contra o emulador é o único que provaria a transação
  real em cada PR e continua como lacuna, para quando o `agent-contract` também escrever eventos.
- Rotas `events`, `comments`, `events/[eventId]`, `answers`: `cardEventsRoutes.test.ts` (repositório em memória,
  guard real) já cobre validação, papéis, autoria, IDOR e 409/422. Nada novo.
- Componentes (`CardTimeline`, `CardEventItem`, `CardArtifacts`): sem teste novo. Os defeitos 1 e 3 são de layout
  e só aparecem no browser; o defeito 2 caberia num teste de componente depois da correção.

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Teste de componente de `CardTimeline`, `CardEventItem`, `CardArtifacts` | Continua aberta. Medido no browser. |
| `card-event.repository.ts` contra o emulador | Fechada como medição manual (item 1); continua aberta como teste automatizado. |
| E2E da linha do tempo | Continua aberta. O `pnpm e2e` não tem fluxo desta tela. |
| Limites de `questionSchema` e do `path` sem teste | Fechada (`agentContract.test.ts`). |

## Cross-check

Dono (`qa-owner`) × leitor efetivo (`qa-reader`) × admin personificando QA Owner; desktop 1440×900 × 390×844;
claro × escuro. Comparação com `CardDetail.png` e `MCard.png`: ficaram fora a coluna lateral (Detalhes, Pipeline,
Depende de), a aba Execuções, o cabeçalho do grupo com quem disparou, runner, modelo, turnos e duração, e o texto
"Responder e retomar a Análise" com a linha do runner. As opções aparecem como lista de radios, sem a caixa com
borda de cada opção, e as abas são do tipo pílula, não sublinhadas. Esses cortes vêm do escopo da spec (sem
`orchestrator`, `agent-contract` nem execuções), exceto o botão fixo (defeito 1).

## Ambiente do e2e

- No início, as portas padrão (3000, 3002, 4001, 4400, 4500, 8080, 9099, 9199) e as próprias estavam livres; o
  `quahog` não estava de pé.
- `pnpm test` (`test:emulator`) e `pnpm e2e` subiram e derrubaram os próprios emuladores e servidores nas portas
  padrão; elas voltaram vazias.
- Para o browser e o curl subi o emulador com config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI), rodei o `pnpm seed` contra ele e subi `api` em
  3012 e `app` em 3010 com o ambiente do `.env.example`, trocando portas e hosts. O cliente do GitHub rodou no
  modo falso. O board foi importado, sincronizado e o card movido para Análise pela API.
- No fim fechei as três sessões do `agent-browser`, matei `api` e `app` por PID com os filhos e mandei SIGINT ao
  `firebase-tools`. As portas 3010, 3012, 8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias. Apaguei
  `apps/api/AGENTS.md`, `apps/app/AGENTS.md` e os dois `firestore-debug.log`.

## Evidências

Prints em `docs/features/card-timeline/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-quadro-escuro.png`, `02-detalhe-escuro-desktop.png`, `03-abas-escuro.png`, `04-escrever-outra-escuro.png`,
`05-apos-respondida.png`, `06-toast-409-escuro.png` (a resposta saiu, o toast já tinha sumido),
`07-confirmar-apagar-escuro.png`, `08-artefatos-escuro.png`, `09-detalhe-claro-desktop.png`,
`10-toast-409-claro.png`, `11-quadro-claro-sem-selo.png`, `12-detalhe-claro-390.png`,
`13-detalhe-claro-390-rolado.png`, `14-detalhe-escuro-390.png`, `15-leitor-escuro.png`,
`16-personificando-escuro.png`, `17-conta-preferencias-escuro.png`, `18-entidade-escuro.png`.

Artefatos da ferramenta, não do produto: o `find role … click` do `agent-browser` não rola até um botão fora da
área visível e não clica (aconteceu com "Responder" e "Comentar"; com `scrollIntoView` antes, funcionou); o
primeiro clique em "Respondida" caiu durante a rolagem suave e não navegou, e o segundo navegou.

## Dados de QA

Tudo no emulador local, já descartado: as contas GitHub `qa-owner` e `qa-reader` (e-mails
`qa-card-timeline-owner@example.com` e `qa-card-timeline-reader@example.com`), criadas pelo popup do emulador; o
`admin@example.com` do seed, que entrou com a senha do seed (não registrada aqui); o board
`agent-board-demo--sample-app`, os cinco cards, o convite de `qa-reader` como Operador, comentários e respostas.
Durante a personificação desativei sem querer o QA Owner na lista de usuários (o clique pegou o switch "Usuário
ativo") e reativei em seguida; a sessão dele foi revogada e ele entrou de novo pelo popup. Nenhuma conta em
projeto Firebase real.

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das sete tarefas existe: o gate do `/review` segue aberto à
espera do plano de commits. O `test` fica `blocked` pelos defeitos 1 e 2, que voltam ao `/develop`.

## Remedição na passada do orchestrator

Os três defeitos acima foram corrigidos na revisão sem browser e entraram como item 7 da lista "Verificar no
`/test`" do `orchestrator`. Medi no `/test` dele, em 2026-11-26, no emulador local com `qa-owner`, num card com
pergunta aberta (`keyboard-shortcuts`). Detalhe em
[`orchestrator/test/report.md`](../../orchestrator/test/report.md#verificar-no-test-lista-da-revisão).

| Defeito | Veredito |
|---------|----------|
| 1. "Responder" fixo abaixo de `md` | **Fechado.** Em 390×844, claro e escuro, o botão "Responder e retomar a Análise" ficou com `top` 796 com `scrollY` 0, 300, 900 e 4.291 (fim da página), numa barra `position: fixed` de 783 a 844. O último evento da linha do tempo termina em 724, acima da barra; nada fica coberto. |
| 2. Campo de edição sem nome e com `id` repetido | **Fechado.** O campo de edição tem `id="card-comment-edit-<eventId>"` e nome acessível "Editar comentário *"; clicar no rótulo foca esse campo. O campo de comentar continua com nome "Comentar no card". |
| 3. "Linha do tempo" vazando da aba | **Fechado.** Em 390 px, lista de abas de 32 a 291 px e abas de 35 a 288 ("Linha do tempo" 35 a 155, "Spec" 155 a 207, "Artefatos" 207 a 288), cada uma com `scrollWidth` igual ao `clientWidth`. |

O critério 17 passa a ✅ e o critério 9 ("Sem resposta" em pergunta substituída), antes 🔒, foi visto na tela: um
disparo novo fechou a pergunta da Análise, que ficou com "Sem resposta" e sem formulário. O `test` desta feature
fecha como `done`.
