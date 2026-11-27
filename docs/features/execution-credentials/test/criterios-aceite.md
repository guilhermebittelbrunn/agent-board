# Critérios de Aceite (Checklist)

Feature: credenciais de execução por membro (tarefas agendadas da nuvem por etapa e escolha do executor
pelos `runners` de cada etapa). O status de cada item, com o meio que o provou, está em
[`report.md`](report.md). Na rodada 2, o critério do motivo do run na fila passou depois da correção da
corrida em `pumpBoard`; os demais seguem com o status da rodada 1.

- [ ] **A seção da nuvem lista uma linha por etapa do `board.yml`**
  Em Minhas credenciais, abaixo dos runners locais, a seção "Nuvem: tarefas agendadas por etapa" mostra uma
  linha para cada item de `config.stages`, na ordem do arquivo. Uma etapa sem cadastro mostra "Não
  cadastrada" e "—" na URL e no token. Uma etapa cujo `runners` não inclui `cloud` mostra "Só no runner local",
  o texto "o board.yml não permite nuvem" e nenhuma ação. A etapa `spec` (Rascunhos) não aparece: o cadastro
  dela ficou para a `cloud-routines-runner`.

- [ ] **Cadastrar guarda a URL e o token e devolve só os finais**
  Com papel efetivo `operator` ou acima, "Cadastrar" abre o diálogo "Tarefa agendada de <etapa>" com Fire URL e
  token. Salvar com URL no formato `https://api.anthropic.com/v1/claude_code/routines/trig_<id>/fire` e token de
  20 caracteres ou mais responde 200; a linha passa a "Cadastrada" com `…/routines/••••<4 finais do id>` e
  `terminando em <4 finais do token>`, o toast "Tarefa agendada de <etapa> salva." aparece e o diálogo fecha.
  Reabrir o diálogo mostra os dois campos vazios. Enquanto salva, o botão fica em "Salvando…" e um segundo
  clique não dispara outra requisição.

- [ ] **Trocar substitui a credencial da etapa**
  "Trocar" na linha cadastrada abre o mesmo diálogo vazio. Salvar outro token troca os 4 finais exibidos, sem
  criar segunda linha para a mesma etapa. O documento no Firestore continua um só por pessoa, board e etapa.

- [ ] **Remover pede confirmação e apaga o segredo**
  "Remover" abre "Remover a tarefa agendada de <etapa>?". Cancelar fecha sem chamar a API. Confirmar chama o
  `DELETE`, que responde 204; a linha volta a "Não cadastrada" e o toast "Tarefa agendada de <etapa>
  removida." aparece. No banco, o documento fica com `sealed: null` e `deletedAt` preenchido.

- [ ] **URL ou token fora do formato são recusados no formulário e na API**
  No diálogo, `https://example.com/fire` mostra "Use a Fire URL do gatilho de API da tarefa agendada." e um
  token com menos de 20 caracteres mostra "Cole o token inteiro, com pelo menos 20 caracteres."; nenhuma
  requisição sai. Chamada direta ao `PUT` com a URL fora do formato responde 422
  `CREDENTIAL_FIRE_URL_INVALID`. Corpo que não é JSON ou sem os campos responde 400 `VALIDATION_FAILED`. Host
  diferente, `http`, porta, userinfo, query, `..` e quebra de linha são recusados pela regex ancorada.

- [ ] **Etapa inexistente ou que não aceita nuvem**
  `PUT` numa `stageKey` que não está no `board.yml` responde 404 `CREDENTIAL_STAGE_NOT_FOUND`. `PUT` numa etapa
  com `runners: [local]` responde 409 `CREDENTIAL_STAGE_NOT_CLOUD`.

- [ ] **Nenhum segredo sai da API**
  As respostas do `GET` e do `PUT` trazem só `stageKey`, `triggerIdLast4`, `tokenLast4`, `lastCheckedAt`,
  `lastCheckStatus` e `updatedAt`. Nem a Fire URL, nem o id `trig_…` inteiro, nem o token, nem o campo `sealed`
  aparecem. O log de servidor registra `credential saved/removed` só com `boardId` e `stageKey`.

- [ ] **O documento guardado está cifrado**
  O campo `sealed` do documento `credential/<boardId>__<userId>__<stageKey>` começa com `v1.` e não contém o
  token, a URL nem o id do gatilho em claro. A cifra é AES-256-GCM com IV novo a cada gravação e o id do
  documento como AAD; trocar AAD, tag, corpo, chave ou versão faz a abertura devolver `null`.

- [ ] **Viewer vê a tabela sem ações e a API recusa a escrita**
  Membro com papel efetivo `viewer` (inclusive quem é `operator` no board com permissão `read` no GitHub) vê a
  seção com as próprias linhas e nenhum botão. `PUT` e `DELETE` diretos com a sessão dele respondem 403
  `BOARD_ROLE_INSUFFICIENT`. O `GET` responde 200 só com as credenciais dele.

- [ ] **Cada pessoa só vê e só apaga o que é dela**
  O `GET` lista só as credenciais de `ctx.profile.id`; a de outro membro do mesmo board não aparece. `DELETE`
  de outro membro na mesma etapa responde 404 `CREDENTIAL_NOT_FOUND`, e a credencial do primeiro continua
  cadastrada. Um `userId` enviado no corpo do `PUT` é ignorado.

- [ ] **Sem chave válida, o cadastro fica desligado sem quebrar o board**
  Com `CREDENTIALS_ENCRYPTION_KEY` inválida, a API sobe e escreve no boot "[credentials] … is not 32 bytes in
  base64: saving scheduled tasks is switched off." sem ecoar o valor. A tela mostra "O cadastro na nuvem está
  desligado neste ambiente." e desabilita Cadastrar e Trocar (Remover continua disponível, porque apagar não
  precisa da chave). `PUT` direto responde 503 `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED` e o `GET` devolve
  `cloudCredentialsEnabled: false`.

- [ ] **A chave de desenvolvimento só vale com o Firestore emulado**
  Com `FIRESTORE_EMULATOR_HOST` preenchido e a chave vazia, o boot diz "sealing scheduled tasks with the
  emulator-only key" e o cadastro funciona. Com só o host do emulador de Auth e a chave vazia, o boot diz
  "saving scheduled tasks is switched off".

- [ ] **A escolha do executor respeita os `runners` da etapa**
  Arrastar um card para uma etapa com `runners: [cloud]` é recusado com 409 `RUN_NO_CREDENTIAL_FOR_STAGE`, mesmo
  com runner local online. A rota de rascunhos faz o mesmo para a etapa `spec` lida de `specAuthoring.runners`.
  Etapa que aceita `local` sem runner online continua com `RUN_EXECUTOR_UNAVAILABLE`.

- [ ] **Run na fila sem executor termina com o motivo certo**
  No `pumpBoard`, um `run` cuja etapa a pessoa não serve termina `failed` com `no_credential`, e o card mostra
  "Você não tem credencial que sirva a <etapa>. Veja Minhas credenciais.". Um `run` cuja etapa aceita o runner
  local e cuja pessoa só está sem runner online termina com `no_runner`. Dois disparos simultâneos da mesma
  pessoa em cards diferentes nunca terminam um deles com `no_runner` quando o executor existe.

- [ ] **Responder pergunta não redispara etapa que a pessoa não serve**
  `resumeAfterAnswer` lê o card, escolhe o executor pelos `runners` da etapa do card (ou do `specAuthoring` num
  rascunho) e só reenfileira quando a escolha dá certo. Card que não está em `waiting_input` não é tocado.

- [ ] **Erros de lista e de gravação aparecem traduzidos**
  Falha ao listar mostra a mensagem de `apiErrors` em `role="alert"` no lugar da seção. Falha ao salvar mostra
  o toast traduzido e mantém o diálogo aberto com os valores digitados; o cache da lista não muda. Nenhum
  `error.code` cru aparece na tela.

- [ ] **Tema e responsivo**
  Em `lg`, o quadro "Segredos" fica na coluna lateral, abaixo de "Com que credencial cada disparo roda". Em
  390 px, as linhas empilham com rótulos (Situação, URL de disparo, Token), o quadro "Segredos" vem depois da
  seção da nuvem e a página não rola na horizontal. Claro e escuro mantêm contraste no badge "Cadastrada" e
  nos botões; o diálogo cabe na largura do celular.
