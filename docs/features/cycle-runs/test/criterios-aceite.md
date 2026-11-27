# Critérios de Aceite (Checklist)

Feature `cycle-runs`, fatia 1. Status de cada critério e o meio que o mediu ficam em `report.md`.

- [ ] **Lista de ciclos acessível pela navegação do board**
  A seção "Ciclos" aparece na navegação das páginas do board e lista os ciclos com o status de cada um
  (`running`, `queued`, `finished`, `stopped`). Qualquer pessoa com `view` no board lê a lista; o botão
  "Novo ciclo" só aparece para quem tem `trigger` (operator ou acima). Board sem ciclo mostra o estado vazio,
  sem erro.

- [ ] **Novo ciclo: escolher de 1 a 10 specs de Tarefas, na ordem**
  O formulário lista só cards prontos em Tarefas, sem execução viva, fora de outro ciclo e não órfãos. A ordem
  de escolha aparece numerada e é a ordem enviada à API. Sem spec escolhida, o formulário não envia e mostra a
  mensagem do dicionário. A API recusa lista vazia, 11 slugs, slug duplicado ou fora do formato com
  `422 CYCLE_SPECS_INVALID` (ou erro de validação do body), e card que não está pronto em Tarefas com
  `422 CYCLE_SPECS_INVALID`.

- [ ] **Opções `until`, `concurrency` e `onFailure` com padrão e validação**
  O padrão é `until: pull_request`, `concurrency: 1` e `onFailure: skip`. Valor fora das listas é recusado na
  borda. Com `concurrency: 2` e menos de dois runners online, a tela avisa; fora do emulador a API recusa com
  `409 CYCLE_RUNNERS_UNAVAILABLE`, e no emulador o executor de teste dispensa a checagem.

- [ ] **Criar leva ao detalhe do ciclo; duplo clique não cria dois ciclos**
  Depois de criar, a tela navega para o ciclo novo. O botão fica desabilitado enquanto a requisição corre, e
  um segundo envio com os mesmos cards recebe `409 CYCLE_SPEC_BUSY` em vez de criar um ciclo duplicado.

- [ ] **Fila de ciclos**
  Com um ciclo `running` no board, o Novo ciclo avisa que o novo entra na fila; o ciclo é criado `queued`, o
  detalhe mostra "Ciclo na fila desde …" sem contadores nem andamento, e ele começa sozinho quando o atual
  termina ou é parado. Dois `createCycle` simultâneos deixam um `running` e um `queued`. Card de um ciclo na
  fila some da lista de candidatos.

- [ ] **Aprovação do plano pulada dentro do ciclo**
  Mesmo com `approvalGate` ligado na etapa `analyze` (`optional` ou `required`), o card de ciclo passa da
  Análise para a etapa seguinte sem parar para aprovação. Fora do ciclo, o mesmo board continua parando para
  aprovar.

- [ ] **Parada conforme `until`**
  Com `until: pull_request`, cada card termina na etapa de PR, `idle`, com a PR aberta pelo GitHub falso, sem
  merge. Com `until: testing`, o card termina em Testando, `idle`, sem PR. Ao terminar, o card perde o
  `cycleId` e o selo. O ciclo fecha `finished` e o `runningCycleId` do board volta a `null`.

- [ ] **Concorrência respeitada**
  Com `concurrency: 1`, a segunda spec só começa depois de a primeira terminar o seu percurso. Com
  `concurrency: 2`, no máximo duas specs rodam ao mesmo tempo.

- [ ] **Falha com `onFailure: skip`**
  Se uma etapa falha (`failed`), o item vira "falhou", o card fica onde parou e a próxima spec pendente
  começa. O ciclo termina `finished` depois das demais.

- [ ] **Falha com `onFailure: stop`**
  Se uma etapa falha, o ciclo fecha `stopped`, as pendentes ficam "pulada" e nada novo começa. Com
  `concurrency: 2`, a outra spec termina a etapa atual e para ali; o item dela fecha `stopped`. O próximo
  ciclo da fila começa quando a primeira falha (decisão Q6).

- [ ] **Parar o ciclo**
  O botão "Parar o ciclo" abre um diálogo de confirmação. Ao confirmar, a execução viva é parada, o card fica
  na etapa onde estava, sem `cycleId` e sem selo, o item vira `stopped`, os pendentes viram `skipped`
  ("pulada") e o próximo ciclo da fila começa. Parar um ciclo `finished` ou `stopped` responde
  `409 CYCLE_NOT_ACTIVE`, e a tela não oferece o botão nesses estados.

- [ ] **Detalhe do ciclo: andamento, decisões e "Para revisar"**
  O detalhe mostra a matriz spec × etapa com o estado de cada item, a lista "Decisões tomadas sem você" com o
  texto e a regra (`policy`, `spec`, `repo_pattern`, `least_impact`) e, separadas, as decisões de produto em
  "Para revisar". O conteúdo das decisões e da atividade aparece como texto, sem markdown nem HTML
  interpretados. Ciclo sem decisões mostra o estado vazio.

- [ ] **Selo "Ciclo" no card do quadro**
  Enquanto o card está sob um ciclo, o quadro mostra o selo "Ciclo". Quando o card termina, é parado ou sai do
  ciclo por ação de pessoa, o selo some.

- [ ] **Autorização e ownership**
  Viewer lê a lista e o detalhe, mas não vê "Novo ciclo" nem "Parar o ciclo"; chamar `POST /cycles` ou
  `POST /cycles/<id>/stop` como viewer responde 403. Abrir `/cycles/new` direto pela URL como viewer não
  mostra o formulário. Sem sessão, as rotas respondem 401. Ciclo de outro board responde
  `404 CYCLE_NOT_FOUND`, e id inexistente na URL também.

- [ ] **Agente não pergunta dentro do ciclo**
  `ask` num `run` com `cycleId` responde `409 AGENT_ASK_IN_CYCLE`. `complete_stage` aceita `decisions` (até
  20, texto de 1 a 500 caracteres, regra da lista fechada, `product` booleano) e grava no evento `report`. O
  runner passa `--cycle <id>` ao prompt só quando o job tem ciclo.

- [ ] **Recuperação depois de queda (reconciliação)**
  Ao abrir o detalhe de um ciclo `running`, a API fecha o item cujo card terminou fora do ciclo e inicia os
  itens `pending` quando há vaga, inclusive num ciclo que nunca avançou. Item cujo disparo nunca ligou o card
  só é fechado depois de 10 minutos de carência.

- [ ] **Mensagens de erro traduzidas**
  Os seis códigos novos (`CYCLE_NOT_FOUND`, `CYCLE_SPECS_INVALID`, `CYCLE_SPEC_BUSY`,
  `CYCLE_RUNNERS_UNAVAILABLE`, `CYCLE_NOT_ACTIVE`, `AGENT_ASK_IN_CYCLE`) têm copy em `apiErrors`, e a tela
  mostra o texto traduzido, nunca o código cru.

- [ ] **Tema e viewport**
  Lista, Novo ciclo e detalhe funcionam em light e dark com contraste legível no selo e nos badges de status.
  A 390 px a página não rola de lado: a tabela de andamento rola dentro do próprio contêiner
  (`document.documentElement.scrollWidth` igual a `innerWidth`).
