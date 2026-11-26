# Critérios de Aceite (Checklist)

Feature: criar board importando um repositório (`board-import`). O status medido de cada item e o meio
de verificação estão em [`report.md`](report.md). Itens marcados `[x]` foram confirmados nesta rodada;
`[ ]` falharam ou ficaram sem medição em runtime (o motivo está no relatório). Os seis critérios entre
"O resumo do repositório" e "Copiar avisa" foram medidos na rodada 2, depois das correções da revisão.

- [x] **Primeiro acesso mostra os três passos e o caminho para "Novo board"**
  Sem nenhum board, `/pt-br/boards` mostra "Comece pelo seu primeiro board" e três cartões numerados:
  instalar o GitHub App (só texto, sem botão de instalação, porque não há URL de instalação
  configurada), aplicar o kit (com o comando `node kit/apply.mjs ../meu-repositorio` e o botão
  "Copiar") e criar o board (link "Novo board" para `/pt-br/boards/new`). O botão "Copiar" grava
  exatamente o comando na área de transferência e troca o rótulo para "Copiado" por alguns segundos;
  se a área de transferência recusar a escrita, o rótulo continua "Copiar" sem mensagem de erro.

- [x] **A lista de repositórios só traz os da instalação em que a pessoa é `admin`**
  `GET /boards/repositories` consulta o papel de cada repositório da instalação e devolve só os que
  respondem `admin`. Uma pessoa com papel `write` em todos recebe lista vazia, sem erro. Cada linha
  indica se o repositório já tem board: "Abrir board" quando o board é da pessoa, "Já tem board"
  quando é de outra pessoa, e "Escolher" quando ainda não existe. Repositório privado mostra o selo
  "Privado".

- [x] **Arquivo válido mostra a prévia e "Criar board" cria e leva à configuração**
  Para `agent-board-demo/sample-app`, o passo 2 mostra `.kanban/board.yml em main · commit <sha7>`,
  as colunas Tarefas, Análise, Executando, Revisando, Testando e Concluído com comando, modelo e
  esforço, e as regras do repositório (branch base, padrão de branch, voltas de retrabalho, turnos,
  branches protegidas e preparo do ambiente, com "—" quando ausente). "Criar board" grava o documento
  e navega para `/pt-br/boards/agent-board-demo--sample-app/settings`.

- [x] **Arquivo inválido mostra cada erro com o caminho e a frase do campo, e criar fica bloqueado**
  Para `invalid-config`, a tela mostra o selo "1 erro", o caminho `stages[2].onRework` e a frase "A
  etapa Revisando devolve o card para deploy, que não existe antes dela. Aponte para uma etapa
  anterior, como develop." A coluna Revisando ganha borda de erro e as linhas "Retrabalho volta para
  deploy" e "Esta etapa tem um erro". "Criar board" fica desabilitado com "Corrija o erro para
  continuar". Na API, `POST /boards` com esse repositório responde 422 `BOARD_CONFIG_INVALID` sem
  gravar nada.

- [x] **Arquivo ausente explica o que fazer, e a API recusa criar**
  Para `no-kanban`, a tela diz "Este repositório ainda não tem .kanban/board.yml na branch main.
  Aplique o kit e leia de novo." e "Criar board" fica desabilitado. `POST /boards` responde 422
  `BOARD_CONFIG_NOT_FOUND` sem gravar.

- [x] **Um repositório tem um board só**
  Cliques repetidos em "Criar board" geram no máximo um documento: a primeira requisição responde 201
  e as seguintes 409 `BOARD_ALREADY_EXISTS`. Abrir `/boards/new?repository=<repo já importado>`
  mostra "Este repositório já tem um board." com "Criar board" desabilitado, tanto para o dono quanto
  para outra pessoa.

- [x] **O board guarda repositório, snapshot com defaults, sha e quem criou**
  O documento `board/<owner>--<name>` tem `ownerUserId`, `ownerGithubId`, `name`, `repository`
  (com `installationId` vindo da listagem da instalação, nunca do corpo da requisição), `config` com
  os defaults aplicados (por exemplo, `protectedBranches` com `main`, `master`, `production` e
  `production-backup`), `configSource` com caminho, ref, sha de 40 caracteres e `readAt`, além de
  `createdAt` e `updatedAt`.

- [x] **Recarregar mostra "nada mudou", as mudanças por coluna ou os erros, sem perder a configuração**
  Com o sha igual ao do arquivo, "Recarregar configuração" mostra "Nada mudou desde a última leitura
  (<sha7>)" e não grava. Com o sha gravado diferente e a etapa `test` ausente do snapshot, a recarga
  mostra "Configuração atualizada para <sha7>." e "Coluna nova: Testando", atualiza a linha "Lido de
  main em …" e a tabela ganha a linha Testando. Arquivo que ficou inválido ou sumiu mantém o snapshot
  anterior.

- [x] **A lista mostra só os boards da pessoa, e board alheio responde não encontrado**
  `/pt-br/boards` lista só os boards cujo `ownerUserId` é a pessoa, com nome, selo "Dono",
  `<owner>/<name>` e "<N> etapas · lido de <ref> em <sha7>". Outra pessoa que abre
  `/boards/<id>/settings` de um board que não é dela vê "Board não encontrado." (404
  `BOARD_NOT_FOUND`) e não vê o botão "Recarregar configuração".

- [x] **Conta sem GitHub, App ausente, repositório inacessível e papel insuficiente respondem com `error.code` traduzido**
  Conta de senha em `/boards/new` vê "Entre com a sua conta do GitHub para criar um board."
  (403 `BOARD_GITHUB_ACCOUNT_REQUIRED`). Repositório fora da instalação ou com papel `none` responde
  404 `GITHUB_REPOSITORY_NOT_ACCESSIBLE` ("O GitHub App do board não tem acesso a este
  repositório."), sem revelar se o repositório existe. Papel `read`, `triage`, `write` ou `maintain`
  responde 403 `BOARD_IMPORT_FORBIDDEN` na prévia, na criação e na recarga. Sem o App, 503
  `GITHUB_APP_NOT_CONFIGURED`. Nenhum desses casos vira 500.

- [x] **Personificação lê e não escreve**
  O admin personificando o dono abre `/boards` e a configuração do board. A tela mostra o aviso
  "Modo somente leitura", com "Atuando como: <nome>", e "Recarregar configuração" e "Criar board"
  ficam desabilitados. A API recusa a escrita com 403 `AUTH_REQUEST_IMPERSONATION_READ_ONLY`.

- [x] **O erro da prévia aparece depois de uma repetição, não três**
  Num 404 da prévia, o React Query faz uma repetição (`retry: 1`) e mostra o erro cerca de 2 s depois
  da navegação. O estado de erro mostra a frase traduzida com o código de rastreio.

- [x] **"Abrir o arquivo no GitHub" aponta para o arquivo na branch base**
  O link é `https://github.com/<owner>/<name>/blob/<branch>/.kanban/board.yml`, abre em nova aba com
  `rel="noopener noreferrer"`. Uma branch com barra, como `release/v1`, mantém a barra no caminho, e
  caracteres reservados são codificados dentro de cada segmento.

- [x] **Claro, escuro e 390 px sem rolagem horizontal**
  As três telas (Meus boards, Novo board nos dois passos e Configuração) abrem em claro e escuro sem
  texto ilegível e, a 390 px, sem rolagem horizontal da página. A tabela de etapas rola dentro do
  próprio contêiner no celular. O assistente mostra "Passo 1 de 2" e "Passo 2 de 2" no celular e a
  lista de passos na coluna da esquerda a partir de `md`.

- [x] **O resumo do repositório só afirma acesso quando a prévia confirmou**
  No passo 2, a linha "GitHub App instalado · você é admin no repositório · vira dono do board" aparece
  só para um repositório que a prévia leu e que ainda não tem board. Com a prévia em erro (404
  `GITHUB_REPOSITORY_NOT_ACCESSIBLE`, 403 `BOARD_IMPORT_FORBIDDEN`) ou com o repositório já importado,
  o resumo mostra só o nome e "Trocar repositório".

- [x] **O rodapé do passo 2 diz o que falta**
  Com o arquivo ausente, o texto ao lado de "Criar board" é "Aplique o kit para continuar"; com o
  arquivo inválido, "Corrija o erro para continuar".

- [x] **Ações descem para a linha de baixo no celular e o nome do repositório não quebra no meio da palavra**
  A 390 px, "Recarregar configuração", o "Novo board" do passo 3 do primeiro acesso e "Trocar
  repositório" ficam abaixo do texto, sem rolagem horizontal. O nome `agent-board-demo/sample-app`
  quebra só depois de `/` ou `-`, nunca no meio de um trecho.

- [ ] **Em `md` com o menu lateral aberto, o passo 2 cabe na coluna**
  A 768 px com o menu lateral aberto, a coluna da direita do assistente fica com cerca de 200 px. O
  resumo do repositório cabe nela, mas o card do arquivo não: o link "Abrir o arquivo no GitHub" vai
  além da borda da tela e fica cortado, sem rolagem para alcançá-lo, e os títulos das colunas da prévia
  passam da borda dos cards. Com o menu fechado ou a partir de 1024 px, tudo cabe.

- [x] **O nome acessível do "Novo board" é o texto visível**
  O botão da lista chama "Novo board" para leitor de tela e comando de voz, tanto no desktop (com
  texto) quanto a 390 px (só o ícone "+").

- [x] **"Copiar" avisa quando a área de transferência recusa a escrita**
  Se a escrita é recusada, o botão mostra "Não foi possível copiar" e volta para "Copiar" em cerca de
  2 s. Se a escrita funciona, mostra "Copiado" e grava `node kit/apply.mjs ../meu-repositorio`. O nome
  acessível continua "Copiar o comando do kit" nos dois casos, então leitor de tela não ouve a falha.

- [ ] **Permissão real abaixo de `admin` num repositório do GitHub**
  Com o GitHub App real, uma pessoa `write` não vê o repositório na lista e a prévia responde 403
  `BOARD_IMPORT_FORBIDDEN`. O cliente falso do emulador sempre responde `admin`, então em runtime isso
  depende do App instalado (item 5 do `docs/PRE-PRODUCTION.md`); a regra está provada em teste de
  rota.
