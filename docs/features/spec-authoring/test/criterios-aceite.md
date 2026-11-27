# Critérios de Aceite (Checklist)

Feature: escrever spec com um agente, a partir de texto e anexos (coluna Rascunhos). O status de cada item, com o meio de verificação, está em [`report.md`](report.md).

- [ ] **Coluna Rascunhos aparece antes de Tarefas**
  O quadro mostra a coluna Rascunhos como a primeira, com o subtítulo "Specs sendo escritas com você" e a contagem de cards. Vazia, ela mostra "Nenhum rascunho. Use Nova spec para descrever o que quer construir.". O botão `+` do cabeçalho e o "Nova spec" do topo do quadro só aparecem para quem tem papel `operator` ou acima e não está personificando.

- [ ] **Nova spec só com texto cria o rascunho e dispara a escrita**
  Com o pedido preenchido, "Começar a spec" cria o card em Rascunhos, enfileira a etapa `spec` e navega para a página do card. O slug nasce do texto do pedido (`quero-ser-avisado-no-slack`) e a branch segue o `branchPattern` (`feat/<slug>`). Com o executor de teste, o selo passa de "Escrevendo" para "Spec pronta" em poucos segundos.

- [ ] **Pedido vazio ou só com espaços é recusado**
  O formulário mostra "Descreva o que você quer construir." e não chama a API. Chamado direto, `POST /boards/<id>/drafts` com texto em branco responde `400 VALIDATION_FAILED` e não cria card.

- [ ] **Anexos aceitos: imagem, PDF e texto, até 5 de 3 MB**
  PNG, JPEG, WebP, PDF, `.txt` e `.md` sobem um a um antes da criação do rascunho e aparecem no diálogo com nome, ícone por tipo e tamanho. Um `.md` cujo tipo o navegador deixou vazio também é aceito, pela extensão. No card, a linha de origem diz "Escrita a partir de texto e N anexos" e a página lista os anexos em "Seu pedido". O caminho do objeto no bucket nunca sai no `CardDTO`.

- [ ] **Anexo recusado no diálogo antes de enviar**
  Arquivo acima de 3 MB mostra "<nome> passa de 3 MB.", tipo fora da lista mostra "<nome> não é imagem (PNG, JPEG, WebP), PDF nem texto (.txt, .md).", e um sexto anexo mostra "No máximo 5 anexos por spec.". Com cinco anexos, o botão "Anexar print, PDF ou texto" fica desabilitado. Nenhum desses casos chama a API. O `input type="file"` escondido tem `aria-hidden` e não aparece na árvore de acessibilidade; o leitor de tela encontra só o botão "Anexar print, PDF ou texto".

- [ ] **Anexo recusado pela API com a mensagem certa**
  A API decide pelo conteúdo: `.txt` com byte nulo responde `415 SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED`, arquivo acima do limite responde `413 SPEC_DRAFT_ATTACHMENT_TOO_LARGE`, e mais de cinco anexos no `POST /drafts` respondem `400 VALIDATION_FAILED`. O item recusado fica marcado no diálogo com a copy das regras de anexo de spec ("Formato não aceito. Anexe imagem (PNG, JPEG, WebP), PDF ou texto (.txt, .md)." e "O anexo passa do tamanho máximo de 3 MB."), o texto continua preenchido e nenhum card é criado.

- [ ] **Anexo de outra pessoa ou caminho malformado é recusado**
  O `POST /drafts` só aceita caminhos `uploads/<id de quem pede>/<uuid>.<ext>` que existam no bucket. Caminho enviado por outro usuário, com `..` ou fora do formato responde `422 SPEC_DRAFT_ATTACHMENT_INVALID` sem criar card. Tipo e tamanho gravados vêm dos metadados do objeto, não do corpo.

- [ ] **Sem Storage configurado, só texto**
  Quando o armazenamento não está configurado, o diálogo esconde a área de anexos e mostra "Anexos estão desligados neste ambiente: o armazenamento de arquivos não está configurado.". `POST /boards/<id>/attachments` responde `503 STORAGE_NOT_CONFIGURED`, e o pedido só com texto continua criando o card.

- [ ] **Sem executor, nada é criado**
  Sem runner online e fora do emulador, "Começar a spec" fica desabilitado com o aviso de executor ausente do quadro. Chamado direto, `POST /drafts` responde `503 RUN_EXECUTOR_UNAVAILABLE` e não cria card. Se a criação falhar no diálogo, o texto fica preenchido para tentar de novo.

- [ ] **Rodada de perguntas no rascunho**
  Quando a etapa `spec` termina com `needs_input`, o card mostra "Aguardando você", a página conta "1ª rodada de perguntas" e o bloco de perguntas aparece com a opção recomendada marcada. No quadro, o card oferece "Responder", que leva à página. Responder retoma a etapa e o selo volta a "Escrevendo".

- [ ] **Aprovar só libera depois de uma rodada com sucesso e sem pergunta**
  O botão "Aprovar spec e mandar para Tarefas" fica desabilitado com o motivo: "Libera quando não houver perguntas abertas", "Libera quando a rodada atual terminar", "A última rodada falhou. Rode de novo antes de aprovar." ou "A escrita ainda não terminou uma rodada. Rode de novo para começar.". `POST .../spec/approve` nesses estados responde `409 CARD_SPEC_NOT_READY`, e a transação relê run vivo, pergunta aberta e `state` antes de gravar.

- [ ] **Aprovar leva o card ao fim de Tarefas**
  Aprovado pelo card do quadro ou pela página, o rascunho vai para a última posição de Tarefas com `ready: true`, o título do frontmatter do rascunho, `spec.ref` na branch do card e `specApproval` com o login de quem aprovou. A partir daí ele se comporta como qualquer card de Tarefas: tem menu de ações, pode ir para Análise e a sincronização do backlog não o torna órfão.

- [ ] **Rascunho não sai de Rascunhos sem aprovar**
  O card de rascunho não arrasta e não tem menu "Mover", no desktop e em 390 px. Chamadas diretas a `POST .../move` (`tasks` ou `done`) e a `POST .../runs` com `stageKey: analyze` respondem `409 CARD_DRAFT_NOT_APPROVED`.

- [ ] **Descartar rascunho**
  "Descartar rascunho" abre uma confirmação que cita a branch ("O card sai do quadro. A branch feat/<slug> continua no GitHub com o que o agente já gravou."). Confirmar devolve ao quadro sem o card; o botão fica desabilitado enquanto há run vivo, e uma falha mantém a confirmação aberta. Um novo pedido com o mesmo começo de texto recebe o sufixo `-2`, porque o id descartado continua ocupado.

- [ ] **Saída `needs_rework` na etapa `spec`**
  Se o agente termina a escrita com `needs_rework`, o card fica em `state: failed` com o selo "Falhou", sem `pendingAsk`. O quadro não oferece "Responder", e a dica do aprovar diz "A última rodada falhou. Rode de novo antes de aprovar.". "Rodar de novo" fica disponível e, com uma rodada de sucesso, o card volta a "Spec pronta". Um `waiting_input` sem pergunta gravado antes da correção também aparece como "Falhou", nunca como "Aguardando você".

- [ ] **Papéis: viewer, operator e impersonação**
  O viewer vê a coluna Rascunhos, abre o card e lê o pedido e o rascunho, mas não vê "Nova spec", `+`, "Aprovar spec" nem "Descartar rascunho"; a API responde `403 BOARD_ROLE_INSUFFICIENT` para upload, criação, aprovação e descarte. O admin personificando também não vê essas ações. Um operator convidado cria rascunho e envia anexo.

- [ ] **Concorrência na criação e na aprovação**
  Dois pedidos simultâneos que geram o mesmo id criam um único card; o outro recebe o próximo sufixo ou `409 SPEC_DRAFT_SLUG_UNAVAILABLE`. Aprovar um rascunho cuja rodada começou ou falhou entre a checagem da rota e a transação é recusado com `CARD_SPEC_NOT_READY`, e descartar com run vivo responde `CARD_RUN_ACTIVE`.

- [ ] **Página do rascunho: layout, tema e responsivo**
  A página mostra um único selo de estado (o do rascunho, sem o "Parado" do estado do card), "em Rascunhos" com a rodada, a branch, "pedida por <login> em <data>", "Descartar rascunho", "Seu pedido" com anexos e, ao lado, "Rascunho da spec" com o caminho e o markdown lido na branch do card. Sem arquivo na branch, aparece "O agente ainda não gravou o rascunho na branch <branch>.". São duas colunas a partir de `lg` e uma no celular, sem rolagem horizontal, em light e dark.

- [ ] **Agente lê os anexos pelo MCP**
  Na rodada real, o `/spec` em modo board lê o pedido pelo `get_card` e cada anexo por `get_attachment`: imagem como `image`, texto como `text` e PDF como `resource` com `blob`. A spec escrita cita o conteúdo dos anexos, inclusive o texto de um PDF.
