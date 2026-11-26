# Critérios de Aceite (Checklist)

Runner local: registro por código, polling, worktree por `run`, `claude -p` (ou o agente de teste) e o executor
escolhido por quem dispara. O status de cada critério está em [`report.md`](report.md): na rodada 1, o Ctrl+C e o
worktree falharam no segundo Ctrl+C; na rodada 2, depois da correção, todos passam.

- [ ] **Registro por código de uso único**
  Em "Minhas credenciais", "Gerar código" mostra o comando `pnpm --filter runner cli register <código> --api <url>`
  com validade de 10 minutos e "Aguardando o runner se apresentar…". O CLI grava `config.json` em modo `0600`, numa
  pasta `0700`, e a tela troca para "Runner <nome> registrado.". O mesmo código usado de novo é recusado com
  `RUNNER_CODE_INVALID` e o CLI sai com código 1 sem gravar nada. O banco guarda só o hash do token e o hash do
  código; `GET /runners` não devolve `tokenHash` nem `userId`.

- [ ] **Etapa rodando no runner, de ponta a ponta**
  Com o runner ligado, arrastar um card de Tarefas para Análise abre o diálogo com "Roda no seu runner local.". O
  runner pega o `run` em até um intervalo de polling, cria o worktree na branch do card, posta "Runner <nome>
  começou…", e o agente chama `get_card`, `post_update` e `complete_stage` com o token `kbr_` do `run`. O card segue
  sozinho até Concluído, cada etapa grava "terminou em … · N turnos" e o commit do agente chega à branch no
  repositório remoto.

- [ ] **Permissões da sessão**
  Sem `--dangerously-skip-permissions`, o processo do agente recebe `--permission-mode acceptEdits` e, por último,
  `--allowedTools` seguido só das regras da lista `allow` do repositório. Uma regra que começa com `-` (por exemplo
  `"--dangerously-skip-permissions"`) é descartada e nunca vira flag. Sem lista `allow`, o runner avisa no terminal.
  Com `--dangerously-skip-permissions`, o runner imprime o aviso ao iniciar e o argv termina com essa flag.
  `--permission-mode` e `--permission-mode=<valor>` dão erro de uso (código 2).

- [ ] **Um `run` por vez e só de quem registrou**
  O runner só pega `run` `local` disparado pelo dono dele. Um `run` disparado por outra pessoa vai para o executor de
  teste (no emulador) ou para o runner dessa pessoa, e o runner do dono nunca o pega, nem quando está ocioso. Enquanto
  roda, a tela mostra "Ocupado com …".

- [ ] **Parar no board**
  O botão "Parar" encerra o processo do agente no próximo heartbeat, em até 15 segundos. O card fica parado por quem
  clicou, a linha do tempo recebe "Parada no board." e o runner não grava relatório de falha.

- [ ] **Ctrl+C no runner**
  Um Ctrl+C durante um `run` encerra o agente, fecha a etapa com "falhou no runner" e "Interrompida no runner
  (Ctrl+C).", manda o tempo, apaga worktree e `runs/<runId>` e sai. Sem `run` em andamento, sai direto. Um segundo
  Ctrl+C mata o grupo do agente e sai na hora; o card fica "Rodando" até o prazo da etapa e então vira "Falhou". O
  que sobra em `runs/` é limpo no próximo `start` ("limpou o resto da execução interrompida <runId>"), e o próximo
  `run` do mesmo card roda. Depois de um `kill -9` no runner vale o mesmo, e religar o runner mata o agente órfão. Um
  segundo runner no mesmo home não apaga o `run` de outro runner vivo. Com o runner ocioso, o Ctrl+C sai direto.

- [ ] **Limite de turnos e agente que não fecha a etapa**
  Passou de `maxTurnsPerStage`, o runner encerra o processo com `turn_limit` e o card mostra "Encerrada pelo limite de
  turnos da etapa." e o tempo informa o limite mais um (201 num limite de 200). Saída do agente sem `complete_stage` vira "Falhou" com "O agente terminou sem chamar
  complete_stage.". Pergunta do agente deixa o card em "Aguardando você"; responder redispara e o runner pega de novo.

- [ ] **Sem runner online**
  No emulador, quem não tem runner online vê "Executor de teste: o resultado é simulado." no diálogo e o `run` é do
  executor falso. Fora do emulador o disparo é recusado com `RUN_EXECUTOR_UNAVAILABLE` (503). Um `run` `local` que
  ninguém pega em 2 minutos termina com `no_runner`, e o card mostra "Nenhum runner seu pegou esta etapa. Inicie o
  runner e rode de novo.".

- [ ] **Revogar**
  "Revogar" pede confirmação ("Uma etapa rodando nessa máquina para em até 15 segundos."), tira o runner da lista e o
  CLI sai com "runner revogado no board; registre de novo" (código 1). Iniciar o CLI de novo com o token revogado
  também sai com essa mensagem.

- [ ] **Tokens fora do alcance do agente**
  O processo do agente recebe `KANBAN_RUN_TOKEN`, nunca o token `kbl_` do runner (nem por `AGENT_BOARD_RUNNER_TOKEN`,
  nem por qualquer variável com valor `kbl_`). Nenhum token aparece em resposta, log da API ou `RunnerDTO`. O
  `mcp.json` do `run` fica fora do worktree, em modo `0600`, e é apagado no fim.

- [ ] **Worktree apagado no fim de cada `run`**
  Sucesso, falha, parada, limite de turnos e Ctrl+C terminam com `worktrees/` e `runs/` vazios, salvo
  `--keep-worktrees`. Um worktree antigo da mesma branch, deixado por `--keep-worktrees` ou por um runner que morreu,
  é removido antes do `git worktree add`. O detalhe de erro que vai ao card troca a pasta do usuário por `~`.

- [ ] **CLI pelo Node do `.nvmrc`**
  `pnpm --filter runner cli` roda com o Node 22.12 por `--experimental-strip-types`, inclusive de uma pasta com
  espaço ou acento no caminho ou chamada por um link simbólico, e os códigos de saída são 0 (ok), 1 (recusado pela API ou revogado) e 2 (uso).

- [ ] **Tela "Minhas credenciais" em claro, escuro e 390 px**
  Lista de runners com selo Online/Offline legível nos dois temas, "Ocupado com <slug> · <coluna>" durante um `run`
  deste board, "Sem contato desde …" num runner offline, linha "Registrado em … · último contato em … ·
  token terminando em …", painel de registro com os dois comandos em fonte mono e botão Copiar, e o quadro "Com que
  credencial cada disparo roda". Em 390 px nada passa da largura da tela; o comando longo rola dentro da própria
  caixa, que recebe foco pelo Tab e rola com as setas.

- [ ] **Foco e leitor de tela no quadro (herdado do `orchestrator`)**
  Abrir "Mover para Análise" pelo menu "⋯" e fechar por "Cancelar e voltar o card" ou Escape devolve o foco ao botão
  "Ações de <card>", com mouse ou só com teclado, nunca ao `body`. O título da coluna lê "1 card" com um card e
  "2 cards" com dois.

- [ ] **Build de produção**
  `next build` da API lista `/runner/*` e `/runners*` como rotas dinâmicas, e o do app lista
  `/[locale]/boards/[id]/credentials`.
