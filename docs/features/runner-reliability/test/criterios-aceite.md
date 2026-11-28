# Critérios de Aceite (Checklist)

Escopo: runner local confiável, vários runners por máquina e o guia de configuração em "Minhas credenciais".
O status de cada item, com o meio de verificação, está em [`report.md`](report.md).

- [ ] **A sessão do agente recebe as ferramentas do board e o git da branch do card**
  No modo `acceptEdits`, o runner soma ao `--allowedTools` a regra `mcp__kanban`, `Bash(git add:*)`,
  `Bash(git commit:*)` e três formas exatas de push: `Bash(git push)`, `Bash(git push origin <branch>)` e
  `Bash(git push -u origin <branch>)`, sempre com a branch do card. Isso vale mesmo quando o repositório não tem
  `permissions.allow`. Push forçado (`--force`, `--force-with-lease`, `+<branch>`) e push para outra branch não casam
  com nenhuma regra. A branch só entra na regra depois de passar por `isGitRef`, que recusa espaço, `:`, `*`, `..` e
  `-` no início. No modo `--dangerously-skip-permissions`, nada muda.

- [ ] **O push sem argumentos só envia a branch atual**
  O ambiente do agente leva `push.default=simple` por `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`,
  somando às entradas que já existam no ambiente sem sobrescrevê-las. Com `push.default=matching` no git da pessoa,
  `git config push.default` dentro da sessão responde `simple`, e o `git push` sem argumentos não empurra branches de
  outros cards do clone compartilhado.

- [ ] **Um Ctrl+C no `pnpm --filter runner cli start` fecha a etapa no board**
  O terminal manda SIGINT ao grupo e o pnpm repassa o mesmo sinal, então o runner recebe dois SIGINT em cerca de
  1 ms. O segundo sinal, a menos de 1 s do primeiro, é ignorado. O runner encerra o agente, chama `complete_stage`
  com `outcome: failed` e o texto "falhou no runner `<nome>` (id `<id>`) ... interrompida", chama `finish` com
  `exit: interrupted`, libera a trava do runner, apaga `runs/<runId>` e o worktree e sai com código 0. Sem etapa em
  andamento, o mesmo Ctrl+C só para o polling e sai com 0.

- [ ] **Um segundo Ctrl+C de verdade sai na hora**
  Um SIGINT que chega 1 s ou mais depois do primeiro mata o grupo do agente e sai com 130, sem esperar o
  `complete_stage`. A etapa fica para a limpeza do próximo `start`, descrita no critério seguinte.

- [ ] **A limpeza fecha no board a etapa de um runner que morreu**
  Se o runner morre no meio de uma etapa (`kill -9`, segundo Ctrl+C, máquina desligada), o próximo `start` de
  qualquer runner da mesma pasta mata o grupo do agente que sobrou, apaga o `mcp.json` e o worktree, imprime
  "limpou o resto da execução interrompida <runId>" e chama `complete_stage` com o token da própria run, lido de
  `runs/<runId>/run.json` (`0600`). Ao conseguir, imprime "avisou o board: <comando> <slug> ficou como falha
  (interrompida)". A nota do card cita o runner que pegou a run, gravado no `run.json`, e não o runner que limpou.
  Um `run.json` sem `runner` válido cai no runner que limpou. Token vencido ou recusa do board só geram o log "o
  board não recebeu o aviso", e o prazo da etapa resolve. A limpeza não chama `finish`.

- [ ] **Vários runners numa pasta, um por terminal**
  Cada `register` grava uma credencial em `<home>/runners/<runnerId>.json` (`0600`). Sem `--name`, o nome é o host
  e ganha `-2`, `-3` quando já existe, dentro do limite de 40 caracteres. Sem `--api`, o registro usa a API do último
  runner registrado na pasta. O `start` sem `--runner` pega o runner mais antigo que nenhum outro processo está
  rodando; com todos ocupados, recusa com "todos os runners desta máquina já estão rodando" e sai com 1.
  `--runner <id, prefixo ou nome>` escolhe um runner; prefixo ambíguo e nome inexistente recusam com mensagem própria.
  `--api` filtra os runners pela API. O `list` mostra cada runner com id curto, final do token, API e "parado" ou
  "rodando (pid N)". Uma pasta antiga com `config.json` é convertida na primeira leitura, e o arquivo antigo some.

- [ ] **Dois processos nunca rodam o mesmo runner**
  A trava `runners/<runnerId>.lock` nasce com `link` atômico a partir de um rascunho que já tem o pid. Dois ou mais
  `start` disparados no mesmo instante para o mesmo runner terminam com um só processo rodando; os outros saem com
  "já está rodando em outro terminal (pid N)", e o `list` nunca mostra o mesmo id duas vezes. Trava de processo morto
  é retomada. A trava é liberada no `exit` do processo, inclusive no caminho do Ctrl+C.

- [ ] **Runner revogado perde a credencial na máquina**
  Quando o board responde `401 RUNNER_REVOKED` ao `claim` ou ao heartbeat, o `start` apaga só a credencial daquele
  runner, mantém as outras, avisa que é preciso rodar `start` de novo e sai com 1. `RUNNER_TOKEN_INVALID` não apaga
  nada: pode ser a API errada, e o runner só avisa e sai com 1.

- [ ] **O clone compartilhado é preparado por um runner de cada vez**
  Clone, `git fetch origin --prune` e `git worktree add` de um mesmo repositório rodam sob a trava
  `repos/<dono>/<repo>.lock/`. Um segundo runner espera a trava em vez de falhar, e uma trava de dono morto é
  retomada. O commit e o push do agente ficam fora dessa trava, então um `git fetch` recusado com `cannot lock ref`
  (push de outro runner no mesmo clone) é repetido até três vezes, com meio segundo de intervalo, antes de a etapa
  falhar. Qualquer outro erro do `fetch` falha na hora.

- [ ] **`install-bin` instala uma cópia fora do checkout**
  `pnpm --filter runner install-bin` copia `src`, `bin` e um `VERSION` com commit, branch e data para
  `<home>/app` e cria o link `agent-board-runner` em `--dir` ou na primeira pasta conhecida do `PATH`. O comando
  roda de qualquer pasta, e `agent-board-runner version` mostra o `VERSION`. Instalar de novo com um `start` aberto
  não derruba o terminal aberto: ele segue pegando etapas na versão já carregada.

- [ ] **O terminal mostra o que a sessão está fazendo**
  Toda linha começa com `[runner <id curto> HH:MM:SS]`. Ao pegar uma etapa, o runner imprime comando, slug, etapa,
  branch, modelo, esforço, limite de turnos e id da run. Durante a sessão aparecem o cabeçalho da sessão (id, modelo,
  modo de permissão), cada ferramenta com o alvo, subagentes recuados com `↳`, o texto do agente com `»`, a negação
  de permissão como `✗ permissão negada: <ferramenta>` (sem repetir como "falhou"), erros de ferramenta com `✗`, o
  stderr do agente com `!` e uma linha de progresso por minuto.

- [ ] **O id curto é o mesmo em todo lugar**
  O id curto tem os 6 primeiros caracteres do id do runner. O runner tem uma cópia de `shortRunnerId` porque não
  importa o contrato em tempo de execução; as duas devolvem o mesmo valor. O mesmo id aparece no prefixo do
  terminal, no `list`, nas notas do card (início, fim da etapa e relatório de falha, no formato
  ``Runner `nome` (id `abc123`)``) e no badge da lista de runners.

- [ ] **Guia de configuração para quem não tem runner**
  Em `/boards/<id>/credentials`, sem runner registrado, a seção "Ligar um runner nesta máquina" mostra seis passos
  abertos: "Antes de começar", "Instalar o comando (uma vez por máquina)", "Registrar o runner", "Deixar buscando
  trabalho", "Mais de uma etapa ao mesmo tempo" e "Atualizar o runner". Os cinco primeiros são uma lista numerada
  (o terceiro começa em 3). Antes de gerar código, o passo de registro mostra só a dica; depois de "Gerar código",
  mostra `agent-board-runner register <código> --api <API do ambiente>`, a validade e "Aguardando o runner se
  apresentar…". Cada comando tem um botão "Copiar" cujo `aria-label` é "Copiar o comando: <comando>"; o rótulo vira
  "Copiado" e, se o navegador recusar a área de transferência, "Não foi possível copiar. Selecione o comando e copie à
  mão.". Quando o runner se registra, o status muda para "Runner <nome> registrado." sem recarregar a página.

- [ ] **Guia para quem já tem runner**
  Com pelo menos um runner, o título vira "Registrar outro runner" e os dois primeiros passos ficam recolhidos sob
  o botão "Primeira vez nesta máquina? Pré-requisitos e instalação", com `aria-expanded` correto. Enter e Espaço
  abrem e fecham o grupo pelo teclado.

- [ ] **Badge do id e rótulo do revogar**
  Na lista de runners, o nome vem seguido do badge `id <6 caracteres>`, com o título "O terminal do runner mostra
  este mesmo id em cada linha.". O botão de revogar tem o nome acessível "Revogar o runner <nome> (id <id>)", para que
  dois runners com nomes parecidos se distingam no leitor de tela.

- [ ] **Tema claro, escuro e tela estreita**
  O guia e a lista ficam legíveis nos dois temas. A 390 px, a página não rola na horizontal (`scrollWidth` igual a
  `clientWidth`); os comandos longos rolam dentro da própria caixa, que recebe foco pelo teclado e rola com as setas.
