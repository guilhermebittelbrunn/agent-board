# Critérios de Aceite (Checklist)

Feature: membros, convites e papéis do board (`board-members`). O status medido de cada item e o meio de
verificação estão em [`report.md`](report.md). `[x]` foi confirmado nesta passada; `[ ]` falhou ou ficou
sem medição em runtime, com o motivo no relatório. As contas citadas são as do cliente falso do GitHub no
emulador (`qa-owner`, `qa-maintainer`, `qa-writer`, `qa-reader`, `qa-outsider`) e o board é
`agent-board-demo--sample-app`.

- [x] **Toda rota de board resolve o papel efetivo e esconde o board de quem não é membro**
  `GET /boards/[id]`, `POST /boards/[id]/reload` e as quatro rotas de membros passam pelo guard de board.
  Quem não é membro recebe 404 `BOARD_NOT_FOUND`, mesmo sendo `admin` do repositório no GitHub e mesmo
  em chamada de escrita, para não revelar que o board existe. Sem token, a resposta é 401
  `AUTH_INVALID_TOKEN`. Uma conta de senha do seed que abre `/boards/<id>/members` vê "Board não
  encontrado." e nunca um erro 500.

- [x] **O dono importa o board e aparece como o primeiro membro**
  Criar o board grava, no mesmo batch, o documento do board e o membro dono. A tela Membros do dono mostra
  uma linha com "Dono", permissão `admin`, papel que vale "Dono", a data da última conferência, o rótulo
  "você" e "—" na coluna Ações. Abaixo da tabela, "O que cada papel pode fazer" traz quatro cartões
  (Leitor, Operador, Mantenedor, Dono), cada um com a permissão exigida no GitHub.

- [x] **Convite por login cria uma linha pendente que vira ativa quando a pessoa entra**
  Convidar `qa-reader` como Operador cria a linha com "confere ao entrar" na permissão, o selo "Convite
  pendente", "convidado em <data>" e só a ação "Cancelar convite". O campo de login fica vazio depois do
  sucesso. Quando a pessoa abre `/boards` ou o próprio board, o convite é reivindicado: a linha passa a
  mostrar a permissão no GitHub e o papel que vale, e o board aparece na lista dela com o selo do papel no
  board ("Operador").

- [x] **Convite repetido e login inválido não criam linha**
  Convidar de novo um login que já é membro ou já tem convite responde 409 `BOARD_MEMBER_ALREADY_EXISTS`,
  com a frase "Esta pessoa já é membro ou já tem convite neste board." num alerta, e a tabela não muda.
  Um login fora do formato do GitHub (`-bad`) mostra o erro no próprio campo e não chama a API; chamado
  direto, o servidor responde 400 `VALIDATION_FAILED`.

- [x] **O papel que vale nunca passa da permissão no GitHub**
  `qa-reader` convidado como Operador tem `read` no repositório, então o papel que vale é Leitor, com a
  nota "limitado pelo GitHub", tanto na tabela quanto no `access` de `GET /boards/[id]`
  (`effectiveRole: viewer`). Um Mantenedor com `write` no GitHub vale como Operador e perde as ações de
  membros.

- [x] **Quem perdeu o repositório recebe "Sem acesso" e aparece assim na tabela**
  `qa-outsider` (permissão `none`) convidado e reivindicado recebe 403 `BOARD_REPOSITORY_ACCESS_LOST` ao
  abrir o board, com a frase "Você não tem mais acesso a este repositório no GitHub, então não pode abrir
  o board." A linha dele na tela de quem gerencia mostra `none`, o selo "Sem acesso" e "saiu do
  repositório", porque o guard grava a conferência antes de recusar.

- [x] **Só Mantenedor e Dono efetivos gerenciam membros, e ninguém passa do próprio papel**
  Leitor e Operador efetivos recebem 403 `BOARD_ROLE_INSUFFICIENT` em convite, mudança de papel e remoção
  chamados direto, e não veem o card de convite nem o menu de ações. Um Mantenedor vê as opções Leitor,
  Operador e Mantenedor. Convite ou mudança para `owner` respondem 400 `VALIDATION_FAILED`. Mexer no dono
  ou em si mesmo responde 403 `BOARD_MEMBER_CHANGE_FORBIDDEN`, e essas linhas mostram "—" em Ações.

- [x] **Membro de outro board não é alcançável pelo `memberId`**
  `PATCH` ou `DELETE /boards/<A>/members/<id de um membro do board B>` responde 404
  `BOARD_MEMBER_NOT_FOUND` e não altera o documento do outro board. Um id inexistente ou com `/` também
  responde 404.

- [x] **"Mudar papel" salva o papel escolhido e mantém a escolha durante o salvamento**
  O diálogo "Mudar o papel de <login>" abre com o papel atual. Depois de trocar o select, a escolha
  permanece enquanto a tela renderiza de novo (salvamento pendente, nova busca da lista), e "Salvar" grava
  o papel escolhido, fecha o diálogo e atualiza a linha. Convite pendente não tem "Mudar papel" no menu.

- [x] **Remover e cancelar convite apagam o membro e confirmam antes**
  "Remover" pede confirmação com "Remover <login> do board?" e "A pessoa deixa de ver o board. O que ela
  fez continua no histórico."; "Cancelar convite" pede "Cancelar o convite de <login>?". Confirmar
  responde 204 e tira a linha. A pessoa removida passa a receber 404 `BOARD_NOT_FOUND` ao abrir o board
  ("Board não encontrado.") e deixa de ver o board na lista.

- [x] **Leitor efetivo não vê "Recarregar" e a API recusa o reload**
  Em Configuração, quem não é dono efetivo não vê "Recarregar configuração". `POST /boards/[id]/reload`
  de um Leitor ou Mantenedor responde 403 `BOARD_ROLE_INSUFFICIENT`.

- [x] **Personificação lê e não escreve**
  O admin personificando `qa-owner` vê a lista de boards e a tela Membros sem o card de convite e sem
  ações, com o aviso "Modo somente leitura" e "Atuando como: qa-owner". Convite, mudança de papel, remoção
  e reload chamados direto respondem 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY`. Personificando um
  convidado pendente, `GET /boards` não reivindica o convite: a linha continua "Convite pendente".

- [x] **O webhook `member` faz a próxima conferência perguntar ao GitHub**
  Depois de um evento `member` válido, o guard consulta o cliente do GitHub de novo em vez de responder do
  cache. Só se prova por teste (`boardAccess.test.ts`), porque o cliente falso não emite webhook.

- [x] **Erros chegam traduzidos e sem 500**
  Os seis códigos novos têm frase em `apiErrors`. Nenhuma chamada desta passada, válida ou abusiva,
  respondeu 5xx.

- [ ] **A tela Membros funciona em claro, escuro e 390 px, com a seção ativa destacada**
  Em claro e escuro a tabela segue o tema. A 390 px a página não rola na horizontal e a tabela rola dentro
  do próprio contêiner. A seção ativa ("Membros" ou "Configuração") deveria aparecer destacada como na
  referência, mas o fundo do link ativo sai transparente nas duas telas e nos dois temas (defeito 🟡 no
  relatório).

- [x] **Pendências da `board-import` medidas nesta passada**
  A 768 px com o menu lateral aberto, o passo 2 do Novo board fica numa coluna só e o link "Abrir o
  arquivo no GitHub" cabe inteiro. A prévia das colunas tem 2 colunas de 768 a 1279 px e 4 a partir de
  1280 px, sem título cortado. O "Copiar" do primeiro acesso anuncia "Copiado" ou "Não foi possível
  copiar" numa região `aria-live="polite"`.
