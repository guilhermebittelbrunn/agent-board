# Critérios de Aceite (Checklist)

Orquestrador de etapas: estados, fila e transições. O status de cada item e o meio que o provou estão em
[`report.md`](report.md#critérios-de-aceite).

- [ ] **Soltar um card numa etapa abre a confirmação antes de disparar**
  Arrastar um card pronto de Tarefas para uma etapa, ou escolher "Mover para <etapa>" no menu "⋯", abre o diálogo
  "Disparar a <etapa>?" com o comando e o slug (`/analyze <slug>`), modelo e esforço do `board.yml`, a branch do
  card (`feat/<slug>`), o limite de turnos e a linha "Executor de teste: o resultado é simulado." quando a API
  roda contra o emulador. Só depois de "Disparar <etapa>" a API cria o `run`, com etapa, modelo, esforço, branch
  e quem disparou.

- [ ] **Cancelar o diálogo deixa o card onde estava e devolve o foco**
  "Cancelar e voltar o card", o "X" e o `Escape` fecham o diálogo sem chamar a API: o card continua na coluna de
  origem, com o mesmo estado. Ao fechar, o foco volta ao card ou ao controle que abriu o diálogo, e não ao
  `body`, para quem navega por teclado continuar de onde estava.

- [ ] **O card percorre as etapas sozinho com o executor de teste**
  Sem roteiro, cada `run` termina com `success` cerca de 3 segundos depois de começar e o card passa de Análise
  para Executando, Revisando, Testando e Concluído sem ninguém tocar na tela. O quadro se atualiza pelo polling.
  A linha do tempo do detalhe ganha, por etapa, uma atualização "iniciado na branch" e um relatório "Concluída".

- [ ] **O polling só roda enquanto há card na fila ou rodando**
  O quadro e o detalhe consultam a API a cada 5 segundos enquanto algum card está `queued` ou `running`. Quando
  nada roda, as consultas param. Com o quadro parado, nenhum `GET …/cards` sai sozinho.

- [ ] **Retrabalho volta para Executando e mostra a volta**
  Com o roteiro `success, success, needs_rework, success, needs_rework, success, needs_rework`, o primeiro
  `needs_rework` de Revisando devolve o card para Executando com o chip "Volta 1 de 2" e o segundo com "Volta 2
  de 2". O terceiro para o card em Revisando com "Aguardando você", "Volta 2 de 2" e "Rodar de novo"
  (`limits.maxReworkLoops: 2`).

- [ ] **Pergunta do agente aparece no detalhe sem recarregar**
  Com o detalhe aberto enquanto a etapa roda e o roteiro `needs_input`, o bloco "A <etapa> parou com 1 pergunta",
  o relatório "Precisa de resposta" e o botão "Responder e retomar a <etapa>" aparecem sozinhos em até 5
  segundos, sem recarregar nem trocar de aba.

- [ ] **Responder redispara a mesma etapa**
  Responder mostra o toast "Resposta enviada. <etapa> roda de novo com ela." e o card volta a "Rodando" na mesma
  coluna. Depois segue o percurso normal.

- [ ] **Disparo novo fecha as perguntas antigas**
  Disparar outra etapa num card com pergunta aberta grava `pendingAsk: null`. Enquanto a etapa nova roda, o selo
  diz "Rodando", não "Aguardando você". A pergunta antiga fica na linha do tempo com "Sem resposta" e sem
  formulário, e uma resposta atrasada a ela pela API recebe 409 `CARD_QUESTIONS_NOT_PENDING`.

- [ ] **Falha do agente vira "Falhou" com "Rodar de novo"**
  Com o roteiro `failed`, o card fica na coluna com o selo "Falhou", borda `border-destructive` e o botão "Rodar
  de novo". O botão abre "Rodar <etapa> de novo?" com o mesmo resumo do disparo; confirmar cria um `run` novo da
  mesma etapa.

- [ ] **Run sem resposta até o prazo vira "Falhou" com o motivo**
  Com o roteiro `silent`, o card continua "Rodando". Quando o prazo vence (`fake-executor expire`), a próxima
  leitura do quadro marca "Falhou" com "O agente não respondeu em 45 min." (`limits.stageTimeoutMinutes`), sem
  precisar recarregar a página.

- [ ] **Parar exige confirmação e registra quem parou**
  "Parar" num card rodando abre "Parar <etapa>?", com "Continuar rodando" e "Parar". Confirmar deixa o card na
  coluna com "Parado", "Parado por <login>." e "Rodar de novo". `stop` num card sem `run` ativo responde 409
  `CARD_RUN_NOT_ACTIVE`.

- [ ] **Aprovação do plano segura o card antes da etapa seguinte**
  Com "Pedir aprovação antes da etapa seguinte a Análise" ligado, o card que termina a Análise vai para
  Executando parado, com "Plano pronto · aguarda sua aprovação" e "Aprovar e seguir". O botão abre a confirmação
  e só então a etapa roda. Com o gate desligado, o card segue sem parar.

- [ ] **Limite WIP põe o excedente na fila**
  Com limite 1 em Análise e um card rodando nela, o diálogo de disparo do segundo card avisa que a coluna está no
  limite e que o card entra na fila. Confirmado, o segundo card aparece "Na fila" e o cabeçalho diz "1 rodando ·
  1 na fila". Quando o primeiro sai da coluna (por parada ou conclusão), o da fila passa a "Rodando".

- [ ] **Card com run ativo não é disparado nem movido de novo**
  No quadro, card `queued` ou `running` não é arrastável e não tem o menu "⋯"; o único controle é "Parar". Pela
  API, `runs` e `move` nesse card respondem 409 `CARD_RUN_ACTIVE`.

- [ ] **Só operador para cima dispara, para e aprova**
  Quem tem papel efetivo `viewer` (por exemplo, convidado como Operador mas com permissão `read` no GitHub) vê os
  selos e motivos, mas nenhum botão de etapa, nenhum menu e nenhum card arrastável. Pela API, `runs` e `stop`
  respondem 403 `BOARD_ROLE_INSUFFICIENT`. Um `operator` vê "Parar", "Rodar de novo" e "Aprovar e seguir".

- [ ] **Só o dono muda limites e aprovação**
  Na Configuração, o dono edita "Limites e aprovação" e salva com o toast "Limites e aprovação salvos.". Um
  `operator` vê os campos desabilitados e a frase "Só o dono do board muda limites e aprovação."; `PATCH
  stage-settings` com a sessão dele responde 403 `BOARD_ROLE_INSUFFICIENT`. Limite 0, acima de 20 ou
  fracionário, e etapa fora do `board.yml`, dão 400 `VALIDATION_FAILED`.

- [ ] **Sem executor, nada dispara**
  Fora do emulador não há executor: o quadro avisa que as etapas não podem ser disparadas, as colunas de etapa
  não aceitam card e o menu não oferece etapa. `runs` responde 503 `RUN_EXECUTOR_UNAVAILABLE`, nunca 500.

- [ ] **Claro, escuro e 390 px**
  Quadro, diálogos e detalhe ficam legíveis nos dois temas, com borda `border-destructive` em "Falhou" e
  `border-primary` em "Aguardando você". Em 390 px não há rolagem horizontal, o diálogo cabe na tela com os botões
  empilhados, e no detalhe o botão "Responder e retomar a <etapa>" fica fixo no rodapé sem cobrir o fim da linha
  do tempo.
