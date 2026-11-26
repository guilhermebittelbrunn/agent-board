# Critérios de Aceite (Checklist)

Linha do tempo do card, perguntas e respostas. O status de cada item, com o meio que o provou, está em
[`report.md`](report.md#critérios-de-aceite).

- [ ] **A linha do tempo agrupa os eventos por etapa, com o mais recente em cima**
  O detalhe do card lista os eventos em grupos com o nome da coluna do `board.yml` (Análise, Executando). Uma
  etapa que saiu do `board.yml` aparece como "Etapa removida (<chave>)", sem quebrar a tela. Dentro do grupo e
  entre grupos, o evento mais novo fica no topo. Card sem eventos mostra só o campo de comentário.

- [ ] **O relatório da etapa aparece legível e com o selo do resultado**
  Um evento `report` no molde do `CONTRACT.md` aparece com o selo do `outcome` ("Pediu retrabalho" para
  `needs_rework`), título, negrito, código inline e tabela desenhada como `<table>`. Link relativo do relatório
  aponta para o arquivo no GitHub, na branch do card (ou na `baseBranch` quando o card não tem branch).

- [ ] **Conteúdo de agente ou de pessoa nunca vira HTML nem link perigoso**
  `<script>`, `<img onerror>` e `<b>` em atualização, relatório, comentário ou resposta livre aparecem como
  texto. Link `javascript:` vira texto sem `href`. Nenhum `<script>` nem `<img>` é criado no `main`, e links
  externos abrem com `target="_blank"` e `rel="noreferrer noopener"`.

- [ ] **Perguntas pendentes aparecem no topo, com a recomendada marcada**
  Com `pendingAsk` aberto, o bloco "A <etapa> parou com N perguntas" fica acima das abas, com borda
  `border-warning` no claro e no escuro. Cada pergunta mostra o `header`, o texto, as opções com descrição e
  o selo "Recomendado", mais a opção "Escrever outra resposta". A opção `recommended` vem marcada; pergunta
  sem `recommended` vem sem marcação.

- [ ] **Enviar sem escolher bloqueia no campo**
  Clicar em "Responder" com uma pergunta sem escolha mostra "Escolha uma opção ou escreva uma resposta." no
  campo e não dispara requisição. "Escrever outra resposta" abre um campo de texto obrigatório (1 a 2.000
  caracteres depois de `trim`).

- [ ] **Responder grava a resposta e tira o selo "Aguardando você"**
  Responder fecha `pendingAsk`, grava um evento `answer` com o rótulo da opção (ou o texto livre) e marca
  `answeredByEventId` na pergunta. O toast "Respostas enviadas." aparece, o bloco de perguntas some, o estado
  vira "Parado" no detalhe e o selo some do card no quadro ao voltar para ele. A pergunta na linha do tempo
  mostra o link "Respondida", que rola até a resposta.

- [ ] **Duas respostas ao mesmo tempo: uma passa, a outra recebe 409**
  A resposta roda numa transação do Firestore que relê card e pergunta. Com respostas concorrentes, só uma
  recebe 200; as outras recebem 409 `CARD_QUESTIONS_NOT_PENDING` e a pergunta guarda um único
  `answeredByEventId`. Na tela, a aba desatualizada mostra o toast traduzido ("Estas perguntas já foram
  respondidas ou foram substituídas. A tela foi atualizada.") e recarrega o card.

- [ ] **Resposta que não bate com as perguntas é recusada**
  Número de respostas diferente do número de perguntas, ou índice de opção que não existe, devolve 422
  `CARD_ANSWERS_MISMATCH` e a pendência continua aberta. Responder um evento que não é a pergunta pendente,
  ou a pergunta de outro card, devolve 409 `CARD_QUESTIONS_NOT_PENDING`.

- [ ] **Pergunta substituída aparece como "Sem resposta"**
  Quando um `ask` novo substitui as perguntas abertas, as antigas mostram "Sem resposta" na linha do tempo e
  responder a elas devolve 409. A pergunta ainda pendente mostra "Aguardando resposta".

- [ ] **Artefatos linkam o arquivo no GitHub no sha informado**
  O evento `artifact` mostra o caminho em fonte mono e o sha curto, com link
  `https://github.com/<owner>/<repo>/blob/<sha>/<path>`. A aba Artefatos lista o último artefato de cada
  caminho com nome do arquivo, caminho, sha curto e etapa. `path` absoluto, com `\`, `.` ou `..` é recusado
  (`CARD_ARTIFACT_PATH_INVALID`), e o `path` tem até 1.024 caracteres.

- [ ] **Leitor comenta e não responde**
  Quem tem papel efetivo `viewer` (por exemplo, `operator` no board com `read` no GitHub) vê as perguntas sem
  radios, com o aviso "Só quem pode disparar etapas responde às perguntas.", e consegue comentar. A API
  devolve 403 `BOARD_ROLE_INSUFFICIENT` ao responder.

- [ ] **Só o autor edita ou apaga o próprio comentário**
  O menu "Ações do comentário" (Editar, Apagar) aparece só no comentário de quem lê. Editar mostra
  "(editado)"; apagar pede confirmação ("Apagar comentário?") e o comentário some depois de recarregar. Na
  API, comentário de outra pessoa ou evento de agente devolve 403 `CARD_EVENT_NOT_EDITABLE`; evento de outro
  card ou board, apagado ou inexistente devolve 404 `CARD_EVENT_NOT_FOUND`.

- [ ] **Comentário respeita os limites de tamanho**
  Comentário vazio ou só com espaços, ou acima de 20.000 caracteres, devolve 400 `VALIDATION_FAILED`. Sem
  sessão, as rotas devolvem 401 `AUTH_INVALID_TOKEN`; board inexistente ou sem acesso, 404
  `BOARD_NOT_FOUND`.

- [ ] **Admin personificando só lê**
  Personificando um membro, o admin vê perguntas e linha do tempo, mas sem radios, sem "Responder", sem campo
  de comentário e sem menu nos comentários. A API devolve 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY` nas
  escritas.

- [ ] **Nenhuma rota desta spec move o card**
  Comentar, editar, apagar e responder mudam só `pendingAsk` e `updatedAt` do card. `lane`, `stageKey` e
  `state` ficam como estavam.

- [ ] **Limites das ferramentas dos agentes**
  `question` tem até 1.000 caracteres, rótulo de opção até 120, descrição até 500 e `header` até 24; cada
  `ask` tem até 4 perguntas de 2 a 4 opções. Um valor no limite passa e um caractere a mais é recusado.

- [ ] **Detalhe legível no claro, no escuro e em 390 px**
  Nos dois temas o texto, os selos e a borda das perguntas têm contraste. Em 390 px a página não rola na
  horizontal, e abaixo de `md` o botão "Responder" fica fixo no rodapé da tela enquanto o bloco de perguntas
  está visível. As abas mostram os rótulos inteiros dentro do fundo da aba.

- [ ] **Radio com descrição e selo sem mudar as outras telas**
  Na opção com descrição, o radio fica alinhado com a primeira linha do rótulo. Opções sem descrição nem selo
  (Preferências da Conta, formulário de entidade) renderizam o mesmo `label` com `items-center` e o mesmo
  `<span className="text-sm">` de antes.
