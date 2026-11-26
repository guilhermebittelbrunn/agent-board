# Relatório de QA: orquestrador de etapas (estados, fila e transições)

Tarefa 8 do `/cycle` noturno, sem perguntas ao usuário. O working tree traz também as tarefas 1 a 7, sem commit.
Branch `guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). Nada foi commitado nem criado.

Resultado: suíte da raiz (com o `test:emulator`) e `pnpm e2e` verdes. Os dez fluxos do plano funcionaram no
browser contra o executor de teste, e as duas correções da revisão (pergunta sem recarregar, disparo novo fechando
perguntas antigas) se confirmaram. Um defeito ficou aberto: ao fechar o diálogo de disparo, de "Rodar de novo" ou
de "Parar", o foco cai no `body`. Ele derruba o item 5 da lista da revisão, então o `test` fecha como `blocked`.
Os três itens herdados da `card-timeline` passaram.

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter api exec vitest run __tests__/orchestratorDecide.test.ts` | 20 de 20 (um caso novo) |
| `pnpm test` (raiz, com cache, JDK 21) | 13 de 13 tasks, 10 do cache, 1m07s |
| ↳ `api` | 1.153 testes, 96 arquivos, incluindo `apiErrorCodesTranslated` |
| ↳ `api` `test:emulator` | 148 testes, 5 arquivos; `orchestratorRuns.emulator.test.ts` 6 de 6 (22,9 s) |
| ↳ `app` | 865 testes, 113 arquivos |
| ↳ `@repo/kanban-contract` | 119 testes, 13 arquivos |
| ↳ demais pacotes | design system 150, auth 211, security 65, shared 51, analytics 41, i18n 35, next-config 34, sdk 9, e2e (vitest) 2 arquivos |
| `pnpm e2e` (Playwright, completo) | 31 de 31, 1,5 min |

`pnpm check` e os typechecks não foram refeitos: o único arquivo alterado é de teste e roda no Vitest. A revisão
mediu `pnpm check` (887 arquivos) e o typecheck de API e app depois das correções.

### Teste criado

Em `apps/api/__tests__/orchestratorDecide.test.ts`, o caso "closes the questions of an earlier run when a new run
starts": um card em `waiting_input` com `pendingAsk` aberto, disparado para outra etapa, sai do `planTrigger` com
`pendingAsk: null` e `state: "queued"`. Conferi que o teste prova o que diz: tirando a linha `pendingAsk: null` do
`decide.ts`, ele falha; com a linha de volta, passa.

## Critérios de aceite

| # | Critério | Status | Meio e o que se viu |
|---|----------|--------|---------------------|
| 1 | Soltar abre a confirmação | ✅ | e2e. Arrastando "Busca por texto nos cards" para Análise: "Disparar a Análise?", `/analyze search-cards`, "opus · alto", `feat/search-cards`, "200 turnos", "Executor de teste: o resultado é simulado.". Pelo menu "⋯" → "Mover para Análise", o mesmo diálogo. |
| 2 | Cancelar devolve o card e o foco | ❌ | e2e. O card fica em Tarefas, sem chamada à API. O foco vai para o `body` em todos os caminhos medidos (defeito 1). |
| 3 | Percurso sozinho | ✅ | e2e. Leituras a cada 2,5 s: Análise (2 s), Executando (7 s), Revisando (12 s), Testando (17 s), Concluído (22 s). Linha do tempo com quatro relatórios "Concluída" e quatro atualizações "iniciado na branch", uma de cada por etapa. |
| 4 | Polling só com card ativo | ✅ | log da API. 20 s com o quadro aberto e nada rodando: 0 `GET …/cards`. Durante os ~22 s do percurso: 5. Nos 20 s depois de Concluído: 0. |
| 5 | Retrabalho e "Volta n de 2" | ✅ | e2e. Executando "Volta 1 de 2" (15 s), Revisando "Volta 1 de 2", Executando "Volta 2 de 2" (25 s), Revisando "Volta 2 de 2", e aos 35 s parado em Revisando com "Aguardando você", "Volta 2 de 2" e "Rodar de novo". |
| 6 | Pergunta sem recarregar | ✅ | e2e. Item 1 da lista da revisão. |
| 7 | Responder redispara | ✅ | e2e. Toast "Resposta enviada. Análise roda de novo com ela."; o card passou a "Rodando" em Análise e depois andou até Concluído. |
| 8 | Disparo novo fecha perguntas antigas | ✅ | e2e + curl. Item 2 da lista da revisão. |
| 9 | Falhou e "Rodar de novo" | ✅ | e2e. Selo "Falhou", borda `border-destructive`, "Rodar de novo" no quadro e no detalhe. O diálogo "Rodar Análise de novo?" criou o `run` e o card passou a Executando. Falha relatada pelo agente não mostra motivo no card; só o relatório na linha do tempo diz "falhou". |
| 10 | Prazo vencido | ✅ | e2e. Com `silent`, o card continuou "Rodando". Depois do `expire`, sem recarregar, a leitura seguinte mostrou "Falhou", "O agente não respondeu em 45 min." e "Rodar de novo". |
| 11 | Parar | ✅ | e2e. "Parar Análise?" com "Continuar rodando" e "Parar"; depois, "Parado", "Parado por qa-owner." e "Rodar de novo". O 409 `CARD_RUN_NOT_ACTIVE` vem do teste de rota. |
| 12 | Aprovação do plano | ✅ | e2e. Gate ligado como dono, toast "Limites e aprovação salvos.". O card terminou a Análise e parou em Executando com "Parado", "Plano pronto · aguarda sua aprovação" e "Aprovar e seguir"; confirmar pôs o card "Rodando" em Executando. |
| 13 | Fila no WIP | ✅ | e2e. Limite 1 em Análise e um card rodando: o diálogo do segundo disse "A coluna Análise está no limite de 1 cards. O card entra na fila e começa quando uma vaga abrir."; o card apareceu "Na fila" e o cabeçalho, "1 rodando · 1 na fila". Parando o primeiro, o segundo passou a "Rodando" na leitura seguinte. |
| 14 | Card ativo travado | ✅ | e2e + curl. Card rodando com `draggable="false"` e sem menu; os parados com `draggable="true"` e menu. `move` e `runs` no card rodando: 409 `CARD_RUN_ACTIVE`. |
| 15 | Só `operator`+ age | ✅ | e2e + curl. `qa-reader` (convidado como Leitor): 0 botões, 0 menus, nenhum card arrastável no quadro; no detalhe, só abas e "Comentar". `runs` e `stop`: 403 `BOARD_ROLE_INSUFFICIENT`. `qa-writer` (Operador): vê "Parar" e "Aprovar e seguir". |
| 16 | Só o dono muda limites | ✅ | e2e + curl. `qa-writer`: os cinco controles com `disabled`, frase "Só o dono do board muda limites e aprovação."; `PATCH stage-settings`: 403 `BOARD_ROLE_INSUFFICIENT`. Os 400 de valor inválido vêm do teste de rota. |
| 17 | Sem executor | 🔒 | O ambiente de QA é o emulador, onde o executor existe. O 503 `RUN_EXECUTOR_UNAVAILABLE` está em `cardRunsRoutes.test.ts`; coluna sem drop e menu sem etapa, em `boardColumnsMove.test.tsx`; o modo `null` fora do emulador, em `stageExecutorMode.test.ts`. |
| 18 | Claro, escuro e 390 px | ✅ | e2e. `scrollWidth` 390 no quadro e no detalhe, nos dois temas. Diálogo em 390 px de 16 a 374 px, botões empilhados de 41 a 349 px. Borda de "Falhou": `lab(48.4 77.4 61.5)` no claro e `lab(63.7 60.7 31.3)` no escuro; de "Aguardando você", `lab(7.8)` no claro e `lab(98.3)` no escuro. Diálogo no claro: fundo `lab(100)`, texto `lab(2.8)`. "Responder" fixo: ver item 7 da lista. |

## Defeitos

### 1. 🟡 O foco cai no `body` quando os diálogos de etapa fecham

Repro: no quadro, abra o diálogo de três jeitos (arrastar um card para Análise; "⋯" → "Mover para Análise";
"Rodar de novo" num card com "Falhou") e feche com "Cancelar", `Escape` ou confirmando. Em seguida,
`document.activeElement` é o `BODY` nos três. No caso do "Rodar de novo", o botão que abriu o diálogo continua na
tela e não recebe o foco de volta. Com "Parar", o resultado é o mesmo, mas ali o botão some quando o card para.

Causa provável: `TriggerStageDialog` e `StopRunDialog` são `Dialog` controlados (`open={request !== null}`), sem
`DialogTrigger`, então o Radix não tem para onde devolver o foco. Correção sugerida: guardar o
`document.activeElement` ao abrir e devolver o foco no `onCloseAutoFocus` do `DialogContent`. Quando o elemento
já não existe (menu fechado, botão "Parar" sumido), o foco pode ir para o link do card.

### Observações (sem defeito de comportamento)

- Concordância nos textos que interpolam o nome da coluna: "Disparar a Executando?", "A Executando parou com 1
  pergunta", "Responder e retomar a Executando". A frase só fica certa com coluna feminina.
- "A coluna Análise está no limite de 1 cards": plural fixo.
- O diálogo aberto pelo menu diz "Você soltou “…” em Análise", embora nada tenha sido arrastado.
- "Aprovar e seguir para Executando?" usa o corpo do "Rodar de novo": "O agente roda Executando de novo", mas é a
  primeira vez que a etapa roda.
- Cards em Concluído e em Tarefas mostram o selo "Parado"; em `Main.png`, Concluído não tem selo.
- Em 390 px, a coluna vazia de etapa diz "Arraste um card de Tarefas para cá.", e no celular o caminho é o menu.
- Em 1440 px, o placeholder do limite na Configuração aparece cortado ("Vazio para não lim").
- Um card que volta de Revisando para Análise leva o chip "Volta 2 de 2" para a fila, porque `reworkLoops` só
  zera vindo de fora das etapas, como o plano decidiu.

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|------|----------|
| 1 | Pergunta aparece no detalhe sem recarregar | **Confirmado.** Roteiro `needs_input` em `dark-theme`, disparado pelo menu, e o detalhe aberto logo depois, com a etapa rodando. Sem tocar na página, a leitura seguinte (até 3 s) já mostrava "Estado: Aguardando você", o bloco "A Análise parou com 1 pergunta", o relatório "Precisa de resposta" e o botão "Responder e retomar a Análise". |
| 2 | Disparo novo fecha perguntas antigas | **Confirmado.** Roteiro `needs_input, needs_input` em `keyboard-shortcuts`. Com a pergunta da Análise aberta, arrastei o card para Executando sem responder: 0,8 s depois o selo dizia "Rodando". Na linha do tempo, a pergunta da Análise ficou com "Sem resposta" e sem formulário; o único formulário era o da pergunta nova de Executando. Responder à pergunta antiga por curl: 409 `CARD_QUESTIONS_NOT_PENDING`. |
| 3 | Fluxos 1 a 10 em claro, escuro e 390 px | **Confirmado, com o defeito 1.** Fluxos 1 a 9 no escuro em 1440 px (critérios 1 a 16). No claro em 1440 px: quadro com "Falhou", "Aguardando você" e "Plano pronto" e o diálogo "Rodar Revisando de novo?". Em 390 px: fluxo 10 pelo menu, nos dois temas, quadro e detalhe. |
| 4 | Polling a cada 5 s só com card ativo | **Confirmado** (critério 4). |
| 5 | Cancelar deixa o card e o foco volta a algo útil | **Derrubado em parte.** O card fica onde estava; o foco vai para o `body` (defeito 1). |
| 6 | Aba Etapas: `operator` desabilitado, `octo` salva | **Confirmado** (critérios 12 e 16). A seção se chama "Limites e aprovação" e fica na página de Configuração, sem aba própria. O dono foi `qa-owner`, não `octo`. |
| 7 | Herdados da `card-timeline` | **Confirmado.** Em 390×844, o "Responder e retomar a Análise" ficou com `top` 796 com `scrollY` 0, 300, 900 e 4.291 (fim da página), dentro de uma barra `position: fixed` de 783 a 844; o último evento da linha do tempo termina em 724, acima da barra. Na edição de comentário, o campo tem `id="card-comment-edit-<eventId>"` e nome acessível "Editar comentário *", e clicar no rótulo foca esse campo; o campo de comentar continua `id="markdown"` com nome "Comentar no card". As abas cabem na lista: lista de 32 a 291 px, abas de 35 a 288, cada uma com `scrollWidth` igual ao `clientWidth`. Registrado também em `card-timeline/test/report.md`. |

## Decisões de custo de teste

- `decide.ts` (`planTrigger`): um caso unitário novo. Função pura, sem motivo para outra camada.
- `run.repository.ts` (`finishOnCard` zerando `pendingAsk` no `run` criado pela transição): sem teste novo. A
  revisão sugeriu um caso no `orchestratorRuns.emulator.test.ts`; o comportamento pedido (disparo novo fecha a
  pergunta) foi medido no browser pelo caminho do `planTrigger`, que é o que o usuário aciona. O zeramento dentro
  da transação de conclusão segue sem asserção automatizada.
- Refetch de eventos no detalhe (`useRefetchEventsWhenCardChanges`): sem teste de componente. O hook é privado do
  `CardDetailClient`, que não tem teste nenhum; testá-lo exigiria exportar o hook (mudança de produção, fora do meu
  papel) ou montar a página inteira com uma dúzia de mocks. O item 1 da lista mediu o comportamento.
- Rotas `runs`, `stop`, `stage-settings`: `cardRunsRoutes.test.ts` já cobre papéis, 503, 409 e 400. Nada novo.
- Concorrência de fila, WIP e idempotência: `orchestratorRuns.emulator.test.ts` (6 de 6 nesta rodada) já é o teste
  da faixa cara, porque a trava é a transação do Firestore.

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Teste de componente de `BoardStageSettingsForm`, `StopRunDialog`, `useStageRunDialogs` e de "soltar em etapa abre o diálogo" no `BoardClient` | Continua aberta. Medido no browser (critérios 1, 11, 16). Um teste de `useStageRunDialogs` caberia junto da correção do defeito 1. |
| `stopRun` concorrente com `completeRun` no emulador | Continua aberta. Parar com fila e WIP funcionou no browser, mas a corrida exata não foi reproduzida. |
| `resumeAfterAnswer` contra o emulador | Fechada como medição manual: três respostas redispararam a etapa contra o Firestore do emulador. Continua aberta como teste automatizado. |
| `planTrigger` zerando `pendingAsk` sem asserção | Fechada (caso novo em `orchestratorDecide.test.ts`). |
| `finishOnCard` zerando `pendingAsk` sem asserção | Continua aberta (ver decisões de custo). |
| Refetch de eventos sem teste | Fechada como medição (item 1); continua aberta como teste automatizado. |
| Critério 9 da `card-timeline` ("Sem resposta" em pergunta substituída) | Fechado: o item 2 mostrou "Sem resposta" na pergunta antiga. |

## Cross-check

Dono (`qa-owner`) × operador (`qa-writer`) × leitor efetivo (`qa-reader`); desktop 1440×900 × 390×844; claro ×
escuro. Personificação não foi percorrida nesta passada; o 403 do admin personificando está em
`cardRunsRoutes.test.ts`.

Comparação com os PNGs de `docs/design/screenshots/`:

- `TriggerStage.png`: o diálogo tem título, frase, comando, modelo, branch e limite iguais. Faltam a escolha "Onde
  roda" (Runner local × Nuvem), o bloco da credencial do runner e o interruptor "Não pedir confirmação ao arrastar
  neste board"; no lugar, aparece a linha do executor de teste. O aviso de fila aparece como frase solta, sem a
  caixa do runner.
- `Main.png`: os selos, "Volta 1 de 2", "Rodar de novo", "Aprovar e seguir" e "O agente não respondeu em 45 min."
  batem. Diferenças: "Plano pronto" aparece como texto ao lado do selo "Parado", não como selo próprio; não há "Ver
  plano" nem "Ver log"; o card "Aguardando você" no quadro não tem o botão "Responder"; a borda de "Aguardando
  você" usa `primary` (preta no claro, branca no escuro), não o laranja do PNG; Concluído mostra o selo "Parado".
  O resumo "1 rodando · 1 na fila" aparece no cabeçalho como no PNG. Colunas Rascunhos e Aguardando PR, filtros,
  ciclo e runner são de outras specs.
- `MMove.png`: no celular, o PNG usa uma folha inferior "Mover card" com a lista de destinos e "Mover e disparar
  Análise". O app usa o menu "⋯" e depois o mesmo diálogo centralizado do desktop, legível em 390 px.
- `MCard.png`: o "Responder e retomar a Análise" fixo no rodapé agora bate.

## Ambiente do e2e

- No início, as portas padrão (3000, 3002, 4001, 4400, 4500, 8080, 9099, 9199) e as próprias estavam livres; o
  `quahog` não estava de pé.
- `pnpm test` (`test:emulator`) e `pnpm e2e` subiram e derrubaram os próprios emuladores e servidores nas portas
  padrão, que voltaram vazias depois de cada um.
- Para o browser, subi o emulador com uma config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI) com o JDK 21, rodei o seed contra ele e subi `api`
  em 3012 e `app` em 3010 com o ambiente do `.env.example`, trocando portas e hosts. O GitHub rodou no cliente
  falso. O board foi importado pela tela e o backlog sincronizado.
- O `api` caiu no primeiro boot porque eu não tinha passado `FIREBASE_ADMIN_PROJECT_ID=""`, que o `.env.example`
  traz vazio. Sem ele, o `NEXT_PUBLIC_FIREBASE_PROJECT_ID` preenche o projeto e a validação exige o resto da conta
  de serviço. Foi erro do meu ambiente, não do produto.
- No fim, fechei as três sessões do `agent-browser`, matei `api` e `app` por PID (com os filhos) e mandei SIGINT ao
  `firebase-tools`. As portas 3010, 3012, 8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias. Apaguei
  `apps/api/AGENTS.md`, `apps/app/AGENTS.md` e os dois `firestore-debug.log`.

## Evidências

Prints em `docs/features/orchestrator/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-dialogo-disparo-escuro.png`, `02-pergunta-sem-recarregar-escuro.png`, `03-retrabalho-terceira-volta-escuro.png`,
`04-parado-escuro-desktop.png`, `05-limites-escuro.png`, `06-quadro-estados-escuro.png`, `07-aviso-wip-escuro.png`,
`08-quadro-claro-desktop.png`, `09-rodar-de-novo-claro.png`, `10-quadro-claro-390.png`,
`11-dialogo-390-claro.png`, `12-detalhe-390-claro-fim.png`, `13-detalhe-escuro-390.png`,
`14-quadro-escuro-390.png`.

Artefatos da ferramenta, não do produto: o `drag` e o `find role … click` do `agent-browser` falham em silêncio
quando o alvo está fora da área visível (a coluna Concluído, à direita, e o botão "Criar board", abaixo da dobra).
Com `scrollIntoView` antes, funcionaram.

## Dados de QA

Tudo no emulador local, já descartado: as contas GitHub `qa-owner`, `qa-writer` e `qa-reader` (e-mails
`qa-orchestrator-owner@example.com`, `qa-orchestrator-writer@example.com` e
`qa-orchestrator-reader@example.com`), criadas pelo popup do emulador; o board `agent-board-demo--sample-app`, os
três cards prontos, os convites de `qa-writer` (Operador) e `qa-reader` (Leitor), limites e aprovação, um
comentário e os `run`s. Nenhuma conta em projeto Firebase real.

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das oito tarefas existe: o gate do `/review` segue aberto à
espera do plano de commits. O `test` fica `blocked` pelo defeito 1, que volta ao `/develop`.

## Remedição na passada da agent-contract

Em 2026-11-26, durante o `/test` da `agent-contract`, remedi no browser as correções que a revisão aplicou depois
da rodada 1 (emulador e servidores próprios em portas alternativas, conta `qa-owner` no emulador).

Foco ao fechar os diálogos, nove combinações mais "Aprovar e seguir":

| Aberto por | Cancelar | Escape | Confirmar |
|------------|----------|--------|-----------|
| Menu "⋯" → "Mover para Análise" | ❌ `BODY` | ❌ `BODY` (também só com teclado) | ✅ "Parar: <card>" |
| Arrasto para Análise | ✅ link do card | ✅ link do card | ✅ "Parar: <card>" |
| "Rodar de novo" | ✅ "Rodar de novo: <card>" | ✅ "Rodar de novo: <card>" | ✅ "Parar: <card>" |
| "Parar" (`StopRunDialog`) | ✅ "Parar: <card>" | ✅ "Parar: <card>" | ✅ "Ações de <card>" |

"Aprovar e seguir" com Escape devolve o foco ao botão. A falha do menu tem causa medida: o antd mantém o dropdown
no DOM depois de fechar, oculto em `.ant-dropdown-hidden`. O item "Mover para Análise", guardado como `opener`,
continua `isConnected`, então `restoreRunDialogFocus` chama `focus()` num elemento invisível e não cai no fallback.
Correção sugerida: só usar o `opener` se ele puder receber foco (`checkVisibility()`, ou conferir
`document.activeElement` depois do `focus()`).

Copy e layout, todos ✅: "Disparar a etapa Análise?"; "A etapa Análise parou com 1 pergunta"; "Responder e retomar a
etapa Análise"; aviso de WIP com "(1)" e sem "1 cards"; descrição do disparo sem "Você soltou"; "Aprovar e seguir
para Executando?" com corpo sem "de novo"; card parado e movido para Concluído sem o selo "Parado"; placeholder "Sem
limite" inteiro a 1440 px (68,3 px de texto em 134 px). Claro e escuro conferidos; em 390 px no claro o diálogo vai
de 16 a 374 px e o `scrollWidth` é 390.

Veredito: o defeito 1 continua aberto no caminho do menu, então o `test` deste slice segue `blocked`. Detalhes em
`docs/features/agent-contract/test/report.md`.

## Remedição na passada do local-runner

Em 2026-11-26, durante o `/test` do `local-runner`, remedi no browser o defeito 1 e a observação do `sr-only`
(emulador e servidores próprios em portas alternativas, conta `qa-owner` no emulador, 1440 px no escuro).

| Aberto por | Fechado por | Foco depois de fechar |
|------------|-------------|-----------------------|
| Clique em "⋯" → clique em "Mover para Análise" | "Cancelar e voltar o card" | ✅ `BUTTON` "Ações de Atalhos de teclado no quadro" |
| Clique em "⋯" → clique em "Mover para Análise" | Escape | ✅ o mesmo botão |
| Enter em "⋯" → setas → Enter em "Mover para Análise" | Enter em "Cancelar e voltar o card" | ✅ o mesmo botão |
| Enter em "⋯" → setas → Enter em "Mover para Executando" | Escape | ✅ o mesmo botão |

Títulos das colunas: o texto `.sr-only` lê "0 cards" nas vazias, "1 card" em Análise com um card e "2 cards" em
Concluído com dois; o nome acessível da região é "Análise 1 card".

Veredito: o defeito 1 está fechado e a observação do "1 cards" também. Os demais caminhos de foco (arrasto, "Rodar de
novo", "Parar") já passavam na remedição anterior e não foram refeitos. Detalhes em
`docs/features/local-runner/test/report.md`.
