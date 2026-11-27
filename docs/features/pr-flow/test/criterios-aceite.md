# Critérios de Aceite (Checklist)

Feature `pr-flow`: coluna Aguardando PR (abrir, acompanhar e concluir). O status de cada item, com o meio que
o verificou, está em `report.md`.

- [ ] **Card que termina Testando com sucesso entra em Aguardando PR com a PR aberta**
  O board abre a PR `feat/<slug> → base` pelo GitHub App antes de o `/observe` rodar, como rascunho quando o
  `board.yml` pede `draft`. O bloco "Pull request" mostra `#n título`, os selos Rascunho e Aberta, a linha
  `feat/<slug> → main · N commits · aberta pelo board em <data>` e as listas vazias "Nenhum check concluído
  ainda" e "Nenhuma review ainda". A linha do tempo ganha "PR #n aberta como rascunho." com o autor
  `agent-board`.

- [ ] **Sucesso do comando da etapa de PR segura o card na coluna**
  Quando o `/observe` termina com `success`, o card fica em Aguardando PR, estado Parado, com o motivo
  "Aguardando o merge". Ele não vai para Concluído. Board sem `pullRequest` em nenhuma etapa continua levando o
  último `success` para Concluído.

- [ ] **Arrastar o card direto para a etapa de PR também abre a PR**
  O disparo manual da etapa de PR (menu "Mover para Aguardando PR" ou arrastar) chama a mesma abertura do caminho
  automático. Um disparo para outra etapa não tenta abrir PR, e o run do `/mediate` disparado por comentário também
  não.

- [ ] **Corpo da PR traz os relatórios das etapas e o link do card**
  O corpo junta o último relatório de cada etapa anterior à de PR, na ordem do board, com o nome da coluna como
  título de seção. Com `NEXT_PUBLIC_APP_URL` preenchido, termina com `Card: <app>/boards/<id>/cards/<slug>`; sem a
  variável, não há rodapé. O corpo fica abaixo de 60.000 caracteres e termina em "…" quando corta.

- [ ] **Comentário ou pedido de mudança na PR dispara o `/mediate`**
  `issue_comment.created` numa PR e `pull_request_review.submitted` com `changes_requested` (ou com texto) criam um
  run com o comando `onPrComment` do `board.yml`, em nome de quem levou o card à etapa. Aprovação sem texto só
  atualiza a lista de reviews. Comentário em issue (sem `pull_request`) é ignorado.

- [ ] **Limite de `/mediate` por hora**
  Com o limite `maxPrCommentRunsPerHour` (3 no `sample-app`) atingido, o comentário seguinte não cria run, grava
  "Limite de 3 /mediate por hora atingido; o comentário novo fica esperando." na linha do tempo uma única vez e
  deixa o aviso "Comentário novo esperando o /mediate" no bloco. Comentários seguintes dentro da mesma hora não
  repetem a linha. Limite 0 desliga o gatilho.

- [ ] **Comentário durante um run vivo fica esperando e roda depois**
  Se a PR recebe comentário enquanto o `/observe` (ou outro run) está vivo, o bloco mostra "Comentário novo
  esperando o /mediate". Quando o run termina `idle` ou `failed`, o `/mediate` começa sozinho e o aviso some. Com
  `needs_input` o `/mediate` não começa.

- [ ] **Checks e reviews aparecem no detalhe e no quadro**
  `check_suite.completed` grava a suíte do app com a conclusão traduzida (Passou, Falhou) e o resumo "Checks
  passando", "Checks falhando" ou nenhum resumo enquanto pendente. Uma suíte que falha mantém o resumo em falha
  mesmo com outra passando. Reviews aparecem por pessoa (`@login` e Aprovou, Pediu mudanças). No card do quadro, a
  linha `PR #n` tem um ponto colorido `aria-hidden` e o resumo em texto `sr-only`.

- [ ] **Merge leva o card para Concluído, uma vez**
  `pull_request.closed` com `merged: true` move o card para Concluído, mostra o selo Mergeada e "Mergeada por
  @login", e grava "PR #n mergeada por @login." na linha do tempo. A reentrega do mesmo evento não grava a linha de
  novo e continua respondendo `200 { handled: true }`. Merge durante um run vivo só move o card quando o run termina.

- [ ] **PR fechada sem merge devolve o card ao fim de Tarefas**
  `pull_request.closed` sem merge move o card para a última posição de Tarefas, com o selo "Fechada sem merge",
  "Fechada sem merge por @login" no bloco, "PR #n fechada sem merge" no card do quadro e "PR #n fechada sem merge
  por @login." na linha do tempo.

- [ ] **Card que já teve PR fechada ou mergeada volta a andar normalmente**
  Depois de voltar a Tarefas com a PR fechada (ou de sair de Concluído com a PR mergeada), o card pode ser
  disparado de novo em qualquer etapa. Um run que termina sem próximo run (`failed`, `needs_input`, `idle`) deixa o
  card naquela etapa com o estado do resultado (Falhou, Aguardando você); a PR antiga é histórico e não move o
  card. Levado de novo à etapa de PR, o board tenta abrir uma PR nova. Se a abertura falha, o bloco mostra só o
  `Alert` com "Tentar de novo", sem a PR antiga, e o fim do `/observe` não tira o card da coluna.

- [ ] **PR mergeada com o card fora da etapa de PR não move o card**
  Se a PR é mergeada enquanto o card está em outra etapa (um retrabalho, por exemplo), o card fica onde está e o
  bloco mostra a PR como Mergeada. Ao voltar à etapa de PR, o board tenta abrir uma PR nova da mesma branch. Esse
  limite foi aceito na revisão: no GitHub real a branch já mergeada tende a ser recusada, e a pessoa move o card
  para Concluído à mão.

- [ ] **Falha de permissão do App aparece no card com nova tentativa**
  Com o App sem `Pull requests: write` (`feat/qa-pr-permission` no emulador), o card entra na etapa, o `/observe`
  roda, e o bloco mostra o `Alert` "Não foi possível abrir a PR" com o texto de `GITHUB_APP_PERMISSION_MISSING`.
  "Tentar de novo" chama `POST .../pull-request`, que responde `503 GITHUB_APP_PERMISSION_MISSING` (nunca 500),
  desabilita o botão com "Abrindo…" durante a chamada e grava uma nova linha na linha do tempo. Quando a abertura
  passa, o `Alert` some e o bloco mostra a PR.

- [ ] **Recusa do GitHub aparece com o texto próprio**
  Branch sem diferença para a base (`feat/qa-pr-rejected` no emulador) mostra o texto de
  `GITHUB_PULL_REQUEST_REJECTED`. O 422 de rascunho em repositório privado Free abre a PR como pronta para review, e
  o 422 de PR já aberta da mesma branch adota a existente.

- [ ] **Erro de abertura some quando o card sai da etapa de PR**
  Com `pullRequestError` gravado e o card movido para Tarefas ou Concluído, o bloco não renderiza (sem PR) e o
  `Alert` não aparece.

- [ ] **Leitor vê o bloco e não vê "Tentar de novo"**
  O `viewer` vê a PR, os checks, as reviews e o erro de abertura, sem o botão de nova tentativa. A rota
  `POST .../pull-request` exige a capacidade `trigger` e responde 403 para quem só lê, 404 para card de outro board.

- [ ] **Webhook só alcança o board da instalação certa**
  A API confere `x-hub-signature-256` antes do parse (`401 GITHUB_WEBHOOK_SIGNATURE_INVALID`), responde
  `503 GITHUB_APP_NOT_CONFIGURED` sem `GITHUB_WEBHOOK_SECRET`, `400 GITHUB_WEBHOOK_PAYLOAD_INVALID` para payload fora
  do formato e `503 GITHUB_WEBHOOK_PROCESSING_FAILED` quando não consegue gravar. Evento de outra instalação, de
  repositório sem board ou de PR sem card volta `handled: false`.

- [ ] **Regras do `board.yml` para a etapa de PR**
  `pullRequest` em duas etapas gera `pull_request_stage_duplicated`; fora da última etapa gera
  `pull_request_stage_not_last`. As duas aparecem traduzidas na tela Configuração, e o diff de recarga chama o
  campo de "abertura da PR".

- [ ] **Tema e responsivo**
  O bloco da PR (aberta, com erro, fechada, mergeada) e a linha do card no quadro funcionam em light, dark e 390 px
  sem rolagem horizontal da página, inclusive com o card numa coluna fora da tela em 1280 px. A linha
  `branch → base · N commits · aberta pelo board em …` quebra entre palavras, nunca no meio delas. A nota "O merge é
  sempre seu…" aparece só com a PR aberta.

- [ ] **Contraste dos pontos de checks**
  Os pontos de checks do card no quadro têm contraste de pelo menos 3:1 contra o card nos dois temas. O ponto
  verde no dark mede 2,82:1; a revisão registrou e não corrigiu, porque o tema tem um `--success` só para os dois
  modos.
