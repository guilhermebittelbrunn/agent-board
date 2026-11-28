# Relatório de QA: runner local confiável e multi-runner

Etapa `/test` de 2026-11-27, na branch `fix/runner-reliability` (worktree limpo no início, `HEAD` em `886ea7a`).
Rodei a suíte, criei os testes que faltavam, percorri a tela "Minhas credenciais" com o `agent-browser` e rodei o
runner de ponta a ponta com o agente de teste, tudo contra um emulador e uma API locais em portas próprias. Nada
tocou produção.

Resultado: todos os testes passam e todos os itens da lista "Verificar no `/test`" foram medidos. Achei um defeito
visual (a numeração dos passos do guia não aparece) e medi no git o `cannot lock ref` que a revisão suspeitava.
Nenhum dos dois bloqueia a entrega; os dois viram follow-up.

## Cobertura

| Comando | Testes | Resultado |
|---------|--------|-----------|
| `pnpm --filter runner test` (antes dos testes novos) | 72 | passou |
| `pnpm --filter runner test` (com os testes novos) | 82 | passou |
| `pnpm --filter api test` | 1195 | passou |
| `pnpm --filter app test` | 759 | passou |
| `pnpm --filter @repo/kanban-contract test` | 241 | passou |
| `pnpm --filter @repo/internationalization test` | 33 | passou |
| `pnpm --filter runner typecheck` · `api` · `app` | n/a | ok nos três, também depois dos testes novos |
| `pnpm check` | 933 arquivos | nenhum problema |
| `pnpm test` (root, com `JAVA_HOME=/opt/homebrew/opt/openjdk@21`) | 14 tarefas, 10 do cache | passou; inclui `api:test:emulator` com 139 testes |
| `pnpm --filter api test apiErrorCodes` | n/a | não rodado: o diff não cria `error.code` |

O `pnpm test` do root rodou sem `--force`. O `test:emulator` subiu o emulador próprio nas portas padrão (8080, 9199,
9150), que estavam livres naquele momento; ver "Ambiente do e2e".

### Testes criados

| Arquivo | O que prova |
|---------|-------------|
| `apps/runner/__tests__/leftovers.test.ts` (2 casos) | A limpeza cita o runner gravado no `run.json` (`mac`, id `aaaaaa`) mesmo quando quem limpa é outro runner (`mac-2`); um `run.json` com `runner` incompleto cai no runner que limpou. |
| `apps/runner/__tests__/lock.test.ts` (1 caso) | Seis processos Node disputam `acquireRunnerLock` no mesmo `home` e `runnerId`, liberados juntos por uma barreira em stdin: só um recebe `ok: true`, os outros cinco recebem o pid do vencedor, e `runnerHolder` aponta para ele. Rodei o mesmo teste contra uma cópia da versão antiga (checa e depois escreve): falhou em 4 de 5 execuções. A versão atual passou em 5 de 5. |
| `apps/runner/__tests__/shortRunnerId.test.ts` (5 casos) | A cópia de `shortRunnerId` em `apps/runner/src/config.ts` devolve o mesmo valor que a de `@repo/kanban-contract`, inclusive para id curto e vazio. |
| `apps/runner/__tests__/cli.test.ts` (2 casos) | O CLI real, contra um servidor HTTP do próprio teste que responde `401` ao `claim`: com `RUNNER_REVOKED`, apaga só a credencial do runner escolhido (sobra `runnerB.json`) e sai com 1; com `RUNNER_TOKEN_INVALID`, mantém as duas credenciais e sai com 1. |

## Decisões de custo de teste

Nenhum teste novo usa emulador nem app de pé. O servidor HTTP do teste de revogação roda dentro do próprio Vitest,
em porta efêmera, e os processos da disputa da trava são Node puro: os dois casos ficam na faixa barata.

| Módulo tocado | Decisão |
|---------------|---------|
| `apps/runner/src/lock.ts` | Unitário com processos filhos. A disputa entre processos é o objeto do teste, e um teste num processo só nunca mostra a corrida. |
| `apps/runner/src/leftovers.ts`, `run-job.ts` (`reportLeftovers`) | Unitário com `fakeApi`, como os casos que já existiam. |
| `apps/runner/src/cli.ts` (`start` e revogação) | CLI de verdade contra servidor local, no mesmo molde do caso "exits with 1 when the API refuses" que já existia. |
| `apps/runner/src/config.ts` × `@repo/kanban-contract` | Unitário que importa os dois. |
| `apps/runner/src/session.ts`, `interrupt.ts`, `activity.ts`, `credentials.ts`, `repo-lock.ts`, `poll.ts`, `install-bin.mjs` | Os testes do develop e da revisão já cobriam; não acrescentei caso. |
| `apps/api/(shared)/lib/runner/runner-finish.ts` | `runnerToken.test.ts` já cobre a nota com o id curto. |
| `apps/app/.../RunnerList.tsx`, `RunnerRegistrationPanel.tsx` | `runnerList.test.tsx` e `runnerRegistrationPanel.test.tsx` já cobrem copy e estados. O que eles não pegam (numeração visual, rolagem) foi medido no browser. |

## Critérios de aceite

Checklist completo em [`criterios-aceite.md`](criterios-aceite.md).

| Critério | Status | Meio |
|----------|--------|------|
| Sessão recebe as ferramentas do board e o git da branch do card | PASS | `session.test.ts` + e2e: o argv do agente de teste trazia `--allowedTools mcp__kanban Bash(git add:*) Bash(git commit:*) Bash(git push) Bash(git push origin feat/dark-theme) Bash(git push -u origin feat/dark-theme)` |
| Push sem argumentos só envia a branch atual | PASS | `session.test.ts`; a medição no git com `push.default=matching` é da revisão e não repeti |
| Um Ctrl+C no `pnpm ... cli start` fecha a etapa | PASS | e2e (abaixo) |
| Segundo Ctrl+C de verdade sai na hora | PASS | `interrupt.test.ts`; não medi no terminal |
| Limpeza fecha a etapa de um runner que morreu | PASS | e2e com dois runners + `leftovers.test.ts` (casos novos) |
| Vários runners numa pasta | PASS | e2e (`register` sem `--api` e sem `--name`, `list`, três `start` para dois runners) + `credentials.test.ts` |
| Dois processos nunca rodam o mesmo runner | PASS | e2e + `lock.test.ts` (caso novo) |
| Runner revogado perde a credencial | PASS | `cli.test.ts` (casos novos); não revoguei pela tela |
| Clone compartilhado preparado um runner por vez | PASS | `repoLock.test.ts` + `git.test.ts` (`fetchOrigin`); a ressalva do push fora da trava foi tratada em "Correções depois do QA" |
| `install-bin` instala cópia fora do checkout | PASS | e2e |
| Terminal mostra o que a sessão faz | PASS | e2e com o agente de teste + `claude -p` real para a negação |
| Id curto igual em todo lugar | PASS | e2e (terminal, `list`, notas, badge) + `shortRunnerId.test.ts` |
| Guia para quem não tem runner | FALHOU em parte na passada; corrigido depois, sem nova medição no browser | e2e: seis passos, código, API e copiar OK; a numeração 1 a 5 não aparecia (ver "Correções depois do QA") |
| Guia para quem já tem runner | PASS | e2e, teclado |
| Badge do id e rótulo do revogar | PASS | e2e |
| Tema claro, escuro e 390 px | PASS | e2e |

## Verificar no `/test` (lista da revisão e do handoff)

| Item | Veredito | O que medi |
|------|----------|------------|
| Guia sem runner: seis passos, comando com código e API depois de "Gerar código", copiar, claro/escuro/390 px | Confirmado, com um defeito | Seis passos visíveis. Depois de "Gerar código", o passo mostrou `agent-board-runner register S8WM-QATS --api http://localhost:3012` (a API local desta passada), "Vale até 27 de nov. de 2026, 19:35." e "Aguardando o runner se apresentar…". O "Copiar" acionado pelo teclado virou "Copiado"; acionado por script, sem gesto do usuário, virou "Não foi possível copiar. Selecione o comando e copie à mão.". Defeito: as `li` têm `display: flex`, então o `list-decimal` não desenha marcador e os passos aparecem sem número. |
| Com runner: "Registrar outro runner", passos 1 e 2 recolhidos, abrindo pelo teclado | Confirmado | Título "Registrar outro runner". Botão "Primeira vez nesta máquina? Pré-requisitos e instalação" com `aria-expanded="false"`; Enter abriu (`true`, apareceram "Antes de começar" e "Instalar o comando (uma vez por máquina)"), Espaço fechou. O status virou "Runner qa-runner-a registrado." sem recarregar a página. |
| Badge `id <6>` igual ao do terminal; aria do revogar | Confirmado | Linha "qa-runner-a · id 4LTylR · Online"; o terminal registrou `id 4LTylR`. Badge com título "O terminal do runner mostra este mesmo id em cada linha.". Botão com nome "Revogar o runner qa-runner-a (id 4LTylR)". |
| Ponta a ponta com o agente de teste: trilha e notas com o id | Confirmado | Terminal: `[runner 4LTylR 19:29:08] pegou /analyze search-cards · etapa analyze · branch feat/search-cards · opus/high · até 200 turnos · run YMvK…`, depois `· mcp__kanban__get_card`, `· Bash`, custo e resultado. O card passou por análise, develop, review, test e pr, com as notas "Runner qa-runner-a (id 4LTylR) começou /analyze search-cards na branch feat/search-cards." e "Runner qa-runner-a (id 4LTylR): /analyze terminou em 1 s · 3 turnos.". |
| Ctrl+C único via `pnpm --filter runner cli start` | Confirmado | SIGINT para o grupo inteiro do pnpm (perl, dois `pnpm`, o `node` do CLI) com o agente parado (`STUB_HANG=1`). O terminal registrou "encerrando; uma etapa em andamento…" e "/analyze keyboard-shortcuts: interrupted · 3 turnos · 11 s". O processo saiu com código 0 (medido no pai do pnpm), sem agente vivo, sem `runs/<runId>` e sem trava sobrando. O card recebeu o relatório "/analyze — falhou no runner qa-runner-a (id 4LTylR)" com "A execução foi interrompida no runner (Ctrl+C)." e a nota de `finish` "Runner qa-runner-a (id 4LTylR): /analyze terminou em 11 s · 3 turnos. Interrompida no runner (Ctrl+C).". |
| `kill -9` no meio de uma etapa, depois `start` | Confirmado | Runner A preso no agente de teste, `kill -9` no CLI. O agente seguiu vivo. O `start` seguinte imprimiu "limpou o resto da execução interrompida oO2s…" e "avisou o board: /analyze dark-theme ficou como falha (interrompida)"; o agente morreu e a pasta da run sumiu. |
| Limpeza feita por outro runner cita o runner que morreu | Confirmado | Quem limpou foi o runner B (`--runner NaqyUP`); o relatório do card diz "/analyze — falhou no runner qa-runner-a (id 4LTylR)" e "O runner foi encerrado antes de avisar o board, e a limpeza feita depois nesta máquina fechou a etapa.". O `list` depois mostrou A "parado" (trava de pid morto) e B "rodando". |
| Disputa da trava: dois `start` ao mesmo tempo | Confirmado | Dois `start` para o mesmo runner livre: um seguiu, o outro saiu com "qa-runner-a (…) já está rodando em outro terminal (pid 87858)". Três `start` simultâneos com dois runners livres: dois pegaram runners diferentes, o terceiro saiu com "todos os runners desta máquina já estão rodando". O `list` nunca mostrou o mesmo id duas vezes. Também coberto pelo teste novo com seis processos. |
| Reinstalação com um `start` aberto | Confirmado | `install-bin --dir <tmp>/bin --home <tmp>/home`, `start` pelo comando instalado chamado de outra pasta (mostrou "versão 886ea7a+local (fix/runner-reliability) · instalado em …"), `install-bin` de novo com ele aberto. O `VERSION` trocou, o processo seguiu vivo e rodou develop, review, test e pr de um card disparado depois. |
| `system/permission_denied` no stream do `claude -p` (`activity.ts`) | Confirmado | `claude -p` real com `--model haiku`, numa pasta temporária, `--allowedTools Read` e um pedido de `ls /` pelo Bash. O stream trouxe `{"type":"system","subtype":"permission_denied","tool_name":"Bash","tool_use_id":…}`, seguido do `tool_result` com `is_error: true`. Passando o stream por `createActivityLog`, saíram `sessão … · modelo claude-haiku-5-5 · permissão acceptEdits`, `· Bash  List root directory contents` e `✗ permissão negada: Bash`, sem a linha "falhou" duplicada. O `result` também traz `permission_denials`. |
| `cannot lock ref` no clone compartilhado com dois runners | Confirmado no git, não pelo runner | Não consegui duas etapas simultâneas pelo board: o agente de teste fecha cada etapa em menos de 1 s, e o browser travou na tentativa (ver "Ambiente do e2e"). Reproduzi o mecanismo direto no git, num clone igual ao do runner: dois worktrees fazendo commit e `git push -u` (60 vezes cada) enquanto o clone rodava `git fetch origin --prune` (150 vezes). Resultado: 21 dos 150 fetches saíram com erro, com 34 linhas `error: cannot lock ref 'refs/remotes/origin/qa/race-a': is at … but expected …`. Os pushes passaram todos, mas 21 e 19 deles imprimiram `error: could not lock config file …/.git/config: File exists` ao gravar o upstream. |

## Defeitos e observações

### 🟡 Numeração dos passos do guia não aparece

Repro: abrir `/boards/<id>/credentials`. As duas `ol` têm `list-decimal` e a segunda tem `start={3}`, mas cada
`SetupStep` renderiza `<li className="flex flex-col …">`. Com `display: flex`, o `li` deixa de ser `list-item` e o
navegador não desenha o marcador (medido: `getComputedStyle(li).display === "flex"` nas cinco). Os passos aparecem
como títulos soltos, e o `marker:` das classes não tem efeito. Correção sugerida: trocar o `flex flex-col gap-2` do
`li` por `space-y-2` (ou envolver o conteúdo num `div` flex dentro do `li`). Arquivo:
`apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerRegistrationPanel.tsx`
(`SetupStep`). Não corrigi: é código de produção, fora do que o `/test` edita.

### 🟡 `git fetch --prune` falha quando outro runner faz push no mesmo clone

O `fetch` de `addWorktree` roda sob a trava do repositório, mas o push do agente roda no worktree, fora dela, e
atualiza `refs/remotes/origin/<branch>` no mesmo `.git`. Quando os dois coincidem, o `fetch` sai com código diferente
de zero e o runner fecha a etapa como falha ("git fetch: error: cannot lock ref …"). Na reprodução, com laços
apertados, isso aconteceu em 14% dos fetches; com etapas reais, a coincidência é bem mais rara. Sugestões: repetir o
`fetch` uma ou duas vezes quando o erro for `cannot lock ref`, ou dar `fetch` sem `--prune` e podar à parte. O
`could not lock config file` do `push -u` simultâneo não falha o push, mas deixa a branch sem upstream gravado.

### 🟢 Observações menores

- Com o agente de teste, o cabeçalho sai como `sessão … · modelo  · permissão ` (campos vazios), porque o `init` do
  stub não traz `model` nem `permissionMode`. Com o `claude` real os campos vêm preenchidos.
- A saída de progresso do `git push` do agente de teste aparece com `!`, como se fosse erro (`! To file://…`,
  `! * [new branch] …`). É stderr de um filho do stub; dentro do `claude` real o git roda capturado pela ferramenta
  Bash.
- O relatório da limpeza depois de `kill -9` diz "A execução foi interrompida no runner (Ctrl+C)." antes da frase da
  limpeza. Para um `kill -9` o "(Ctrl+C)" engana um pouco.
- O Ctrl+C com o runner parado imprime "uma etapa em andamento vai ser reportada como interrompida", mesmo sem
  etapa em andamento.
- A 390 px, a caixa de cada comando fica com cerca de 151 px úteis, porque o botão "Copiar" divide a linha com ela. A
  rolagem funciona (as setas moveram o comando de registro em 80 px), mas cabem uns 15 caracteres por vez.
- Sem `--name`, o `register` usa o hostname, que em muitas máquinas tem o nome da pessoa. O nome aparece no board
  para os membros. Não é defeito, mas vale lembrar no guia.

## Correções depois do QA

O usuário pediu para corrigir os dois defeitos 🟡 antes de commitar. As correções foram feitas pelo orquestrador
depois da passada do QA:

- **Numeração dos passos do guia.** Em `SetupStep` (`RunnerRegistrationPanel.tsx`), o `li` ficou só com
  `pl-1` e as classes `marker:`, e o `flex flex-col gap-2` passou para um `div` dentro dele. O `li` volta a ser
  `list-item`, então o `list-decimal` desenha 1, 2 e, na segunda lista, 3 a 5. Não remedi no browser: a sessão do
  `agent-browser` foi encerrada, e o CSS em jogo (um `li` com `display: flex` perde o marcador, um `div` flex
  dentro de um `li` comum não tira) é comportamento padrão do navegador. `runnerRegistrationPanel.test.tsx` segue
  passando.
- **`git fetch --prune` com push simultâneo.** Novo `fetchOrigin` em `apps/runner/src/git.ts`, usado por
  `addWorktree`: quando o `fetch` sai com `cannot lock ref`, tenta de novo até três vezes, com 500 ms de intervalo;
  qualquer outro erro volta na primeira tentativa e a etapa falha como antes. Três casos novos em
  `apps/runner/__tests__/git.test.ts` cobrem a segunda tentativa que passa, a desistência depois de três travas e o
  erro que não é de trava. O `could not lock config file` do `push -u` simultâneo continua: ele não falha o push, só
  deixa de gravar o upstream, e o runner não depende disso.

Gates depois das correções: runner com 85 testes, app com 759 (93 arquivos), typecheck do app ok e `pnpm check`
limpo. Na primeira rodada do app, seis testes de telas fora deste diff falharam por tempo esgotado e, na segunda,
dois arquivos não chegaram a iniciar ("Timeout starting forks runner"). A máquina estava sobrecarregada, e um Chrome
do `agent-browser` da passada do QA ainda estava aberto. Depois de fechá-lo com `agent-browser close`, a suíte passou
inteira.

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Nenhum teste sobe um `claude` real; `mcp__kanban` só foi provado à mão (handoff) | Continua aberta como teste automatizado, de propósito: custo e conta paga. Medi à mão a parte do stream (`permission_denied`); a liberação de `mcp__kanban` segue com a medição do develop. |
| Trava por repositório testada com trabalho falso (handoff) | Continua aberta para dois runners clonando ao mesmo tempo. Medi o caso vizinho (push × fetch) e ele virou o follow-up acima. |
| `reportLeftovers` com `runner` do `run.json` (revisão) | Fechada: dois casos em `leftovers.test.ts`, mais o e2e com dois runners. |
| Disputa da trava do runner entre processos (revisão) | Fechada: caso com seis processos em `lock.test.ts`, que reprova a versão antiga. |
| `shortRunnerId` do runner × contrato (revisão) | Fechada: `shortRunnerId.test.ts`. |
| `start` apagando a credencial em `RUNNER_REVOKED` (revisão) | Fechada: dois casos em `cli.test.ts`. |
| D2, espera de 2 minutos por runner (`RUNNER_CLAIM_GRACE_MS`) | Fora de escopo: decisão de produto. |

## Ambiente do e2e

As portas padrão (3000, 3002, 9099, 8080, 9199, 4001) estavam ocupadas por outro workspace no início. Não reutilizei
nem sinalizei nenhum desses processos. Subi tudo em portas próprias, com configuração fora do repositório
(`firebase.json` temporário e variáveis de ambiente na linha de comando, sem `.env`):

| Serviço | Porta | Como |
|---------|-------|------|
| Emulador Auth / Firestore / Storage | 9098 / 8085 / 9198 (hub 4412, logging 4512, websocket 9161, UI desligada) | `firebase emulators:start --config <tmp>/firebase.json --project demo-next-boilerplate` |
| API | 3012 | `next dev -p 3012` em `apps/api` |
| App | 3010 | `next dev -p 3010` em `apps/app` |
| Runners | sem porta | CLI do checkout e comando instalado em pasta temporária, `--home` e `--repo-base file://` temporários |

No fim, matei por PID só o que subi (app, API, emulador e os filhos de cada um, além de todos os runners, cada um no
próprio grupo de processos) e conferi que 9098, 8085, 9161, 9198, 4412, 4512, 3010 e 3012 ficaram livres. Nenhum
processo de runner ou de agente de teste ficou vivo. Nessa hora, as portas padrão também estavam livres e os PIDs do
outro workspace não existiam mais; não mandei sinal a nenhum deles. Com elas livres, o `test:emulator` do
`pnpm test` subiu e derrubou o emulador próprio nas portas padrão, e elas voltaram a ficar livres depois.

O `next dev` gerou `apps/api/AGENTS.md` e `apps/app/AGENTS.md`; apaguei os dois.

O `agent-browser` deste ambiente clicava fora do alvo (o clique caía cerca de 60 px abaixo do elemento), então
acionei botões por teclado (`focus` + Enter/Espaço) e, quando não havia gesto envolvido, por `element.click()`. No
fim, o renderer do Chrome travou a 100% de CPU num `snapshot` da página do quadro e precisei fechar a sessão do
browser. Não investiguei se é a página do quadro em `next dev` ou o próprio `agent-browser`; a página do quadro não
faz parte deste diff.

## Evidências

O `.gitignore` descarta `test/e2e/`; o texto acima é a prova. Prints de apoio, só nesta máquina:
`01-guia-sem-runner-escuro.png`, `02-codigo-gerado-escuro.png`, `03-codigo-gerado-claro.png`,
`04-guia-390-claro.png`, `05-comandos-390-claro.png`, `06-comandos-390-escuro.png`, `07-com-runner-escuro.png`,
`08-primeira-vez-aberto-escuro.png`, `09-com-runner-claro.png`.

Medidas a 390 px: `document.documentElement.scrollWidth` 375 e `clientWidth` 375 (a página não rola na horizontal).
As caixas de comando têm `overflow-x: auto` e `tabIndex` 0; o comando de registro tem 570 px de conteúdo numa caixa de
151 px. No escuro, a caixa de comando fica com fundo `lab(15.2 0 0)` e texto `lab(98.26 0 0)`.

## Dados de QA

Tudo no emulador desta passada, que morreu com o processo: uma conta de teste do domínio `example.com`, criada pelo
popup do GitHub do emulador; o board `agent-board-demo--sample-app`; os runners `qa-runner-a` (`kbl_4LTylR…_***`) e um
segundo com o nome do host (`kbl_NaqyUP…_***`), com credenciais numa pasta temporária fora do repositório. Nenhuma
conta em projeto real, nada a acrescentar no `docs/PRE-PRODUCTION.md`, e nenhum estado de dev alterado.

## Estado do pipeline

`review` estava `done` no `STATE.md`, com os commits na branch e enviados. Os testes novos ficam no working tree
para o orquestrador commitar: `apps/runner/__tests__/cli.test.ts`, `leftovers.test.ts`, `lock.test.ts` e
`shortRunnerId.test.ts`.
