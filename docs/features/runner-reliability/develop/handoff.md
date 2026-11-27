# Handoff do develop: runner local confiável e multi-runner

Sem `analyze/plan.md`: a tarefa nasceu de dois cards que falharam em produção em 2026-11-27 e foi implementada na
mesma conversa da investigação. Este handoff faz o papel do plano para o `/review` e o `/test`.

## O que falhou em produção

Dados lidos no Firestore de produção (`run`, `runner`) e nos logs locais do runner
(`~/.agent-board-runner/logs/<runId>.jsonl`).

1. **`/spec melhorar-a-organizacao-de-status` falhou em 7 turnos.** O `claude -p` negou `mcp__kanban__get_card` e
   depois `mcp__kanban__complete_stage`. O runner passa a lista `permissions.allow` do repositório em
   `--allowedTools`, e essa lista não tem nenhuma regra `mcp__kanban__*`. Também não tem `git commit` nem
   `git push`, que o modo board exige em toda etapa. O agente atribuiu a falha ao aviso "workspace not trusted",
   mas esse aviso só afeta o `.claude/settings.json` do projeto, não as regras passadas na linha de comando.
2. **`/analyze backlog-approval` ficou em `running` até o tempo limite.** A sessão teve o mesmo problema de
   permissão e seguiu sem o card. Ao apertar Ctrl+C no `pnpm --filter runner cli start`, o processo recebe o
   SIGINT duas vezes com cerca de 1 ms de intervalo: uma pelo grupo do terminal e outra repassada pelo pnpm
   (medido com um script de teste). O runner tratava o segundo como "Ctrl+C de novo", matava o agente e saía com
   130 sem chamar `complete_stage` nem `finish`. A pasta `runs/<runId>` ficou para trás, e a run fechou pelo
   `timeout` do board às 21:19 UTC.
3. **Dois terminais, uma credencial.** Os dois terminais usavam `~/.agent-board-runner`. O `register` do segundo
   sobrescreveu o `config.json`. Ao reiniciar, o primeiro subiu com a credencial do segundo, e o runner original
   ficou órfão com o `currentRunId` da run presa.
4. **O primeiro `/spec` terminou com `no_runner`** porque o único runner estava ocupado. Não foi alterado (ver
   "Decisões em aberto").

## Mudanças → arquivos

| Mudança | Arquivos |
|---------|----------|
| O runner sempre soma `mcp__kanban`, `git add:*`, `git commit:*` e o push da branch do card (`git push`, `git push origin <branch>`, `git push -u origin <branch>`) ao `--allowedTools` | `apps/runner/src/session.ts` (`boardModeTools`), `apps/runner/src/run-job.ts` (texto do aviso) |
| SIGINT repetido em menos de 1 s é ignorado | `apps/runner/src/interrupt.ts` (novo), `apps/runner/src/cli.ts` |
| A limpeza de execução interrompida fecha a etapa no board com o token da run | `apps/runner/src/leftovers.ts` (`run.json`, `Leftover`), `apps/runner/src/run-job.ts` (`reportLeftovers`, `writeRunFile`) |
| Vários runners numa pasta: uma credencial por runner em `runners/`, `start` pega o mais antigo livre, `--runner`, `--api`, `list`, `version`, nome numerado (`-2`), migração do `config.json` antigo, credencial apagada quando o board responde `RUNNER_REVOKED` | `apps/runner/src/credentials.ts` (novo), `apps/runner/src/config.ts`, `apps/runner/src/cli.ts` |
| Trava por runner (um processo por credencial) | `apps/runner/src/lock.ts` (novo) |
| Trava por repositório no clone, no `fetch` e no `worktree add`, porque os runners dividem o clone | `apps/runner/src/repo-lock.ts` (novo), `apps/runner/src/run-job.ts` (`prepareWorktree`/`addWorktree`) |
| Comando global: `install-bin` copia o runner para `~/.agent-board-runner/app` (com `VERSION`) e cria o link `agent-board-runner` no `PATH` | `apps/runner/bin/agent-board-runner` (novo), `apps/runner/scripts/install-bin.mjs` (novo), `apps/runner/package.json` |
| Trilha no terminal: prefixo `[runner <id> HH:MM:SS]`, cabeçalho ao pegar a tarefa, ferramenta com alvo, subagente recuado, texto do agente, negação de permissão e erro de ferramenta com `✗`, stderr do `claude`, progresso por minuto | `apps/runner/src/activity.ts` (novo), `apps/runner/src/supervisor.ts` (`onLine`, `onStderr`), `apps/runner/src/run-job.ts`, `apps/runner/src/poll.ts`, `apps/runner/src/cli.ts` |
| Id curto do runner (6 caracteres) no painel, no terminal e nas notas do card | `packages/kanban-contract/src/runner.ts` (`shortRunnerId`), `apps/runner/src/config.ts` (cópia local), `apps/runner/src/report.ts`, `apps/api/(shared)/lib/runner/runner-finish.ts`, `apps/app/.../boards/(components)/RunnerList.tsx` |
| Guia passo a passo em "Minhas credenciais", com o porquê de cada passo; os passos de primeira vez ficam recolhidos para quem já tem runner | `apps/app/.../boards/(components)/RunnerRegistrationPanel.tsx`, `RunnerCommandLine.tsx` (novo, extraído do painel), `runnerCommands.ts`, `.../credentials/BoardCredentialsClient.tsx` (`hasRunners`) |
| Copy | `packages/internationalization/translations/apps/app/pages/common/boards.ts` (`credentials.runners.idTag`, `idTitle`, `revokeAria` com id; `credentials.register` reestruturado: saem `step1`/`step2`, entram `titleAnother`, `intro`, `firstTime`, `prerequisites`, `install`, `registerStep`, `startStep`, `parallel`, `update`) |
| Documentação | `docs/board/CONTRACT.md` (permissões da sessão, limpeza, onde fica o token), `docs/SETUP.md` (instalação, vários runners, trilha do terminal) |

## Contrato

- `@repo/kanban-contract` ganhou `shortRunnerId`. Nenhum DTO, rota ou action mudou.
- A nota de fim de etapa da API (`finishMarkdown`) passou a citar o id curto: ``Runner `nome` (id `abc123`): ...``.
  As notas do runner (`startNote`, `failureSummary`) seguem o mesmo formato.
- O runner não importa o contrato em tempo de execução (o Node não remove tipos de pacote do workspace), então
  `shortRunnerId` tem uma cópia em `apps/runner/src/config.ts`, com um comentário explicando.
- `JobContext.runnerName` virou `JobContext.runner: { name, id }`.
- O layout da pasta do runner mudou: `config.json` → `runners/<runnerId>.json` (migrado na primeira leitura),
  `runners/<runnerId>.lock`, `repos/<dono>/<repo>.lock/` durante clone e fetch, `runs/<runId>/run.json`.

## Códigos de erro novos

Nenhum.

## Decisões tomadas sem perguntar

- O push fica liberado só para a branch do card, nas três formas exatas. Push forçado continua fora da lista.
- Clones, worktrees e logs são compartilhados entre os runners da máquina, com trava por repositório, em vez de
  uma pasta inteira por runner. O `sweepLeftoverRuns` já tratava vários runners na mesma pasta.
- A limpeza não chama `finish`, só `complete_stage`: o `claimNext` já libera o `currentRunId` quando a run fica
  inativa, e um `finish` com duração zero escreveria uma nota enganosa.
- A credencial só é apagada em `RUNNER_REVOKED`. `RUNNER_TOKEN_INVALID` pode ser API errada e só gera aviso.
- `install-bin` instala uma cópia, não um link para o checkout, para o runner não mudar quando a pessoa troca de
  branch no clone.

## Decisões em aberto

- Uma run local espera no máximo 2 minutos por um runner (`RUNNER_CLAIM_GRACE_MS`), mesmo quando há um runner da
  pessoa online e ocupado. Foi isso que levou ao primeiro `no_runner`. Não alterado; precisa de decisão de produto.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 932 arquivos, nenhum problema |
| Typecheck e testes | `pnpm turbo run typecheck test --filter=runner --filter=api --filter=app --filter=@repo/kanban-contract --filter=@repo/internationalization` | runner 71, api 1195, app 759, kanban-contract 241, internationalization 33; todas as tarefas ok |
| `apiErrors` | não se aplica | nenhum `error.code` novo |

Medido fora dos testes:

- `claude -p` real (modelo haiku) numa pasta não confiável com um servidor MCP `kanban` falso: sem `mcp__kanban`
  em `--allowedTools`, o `get_card` é negado como no log de produção; com a regra, a ferramenta responde. Com
  `Bash(git add:*)` e `Bash(git commit:*)`, um commit passou sem negação.
- `pnpm` com um script de teste: um SIGINT no grupo chega duas vezes ao processo filho, com 1 ms de diferença.
- Comando instalado numa pasta temporária e chamado de `/tmp`: migração do `config.json`, dois `start` pegando
  runners diferentes, o terceiro recusado, `list` mostrando os pids, Ctrl+C encerrando os dois com saída 0 e sem
  trava sobrando.

Não subi o app nem abri o browser.

## A verificar no `/test`

- Guia em "Minhas credenciais" sem nenhum runner: seis passos abertos, o comando de registro aparece com o código e
  a API do ambiente depois de "Gerar código", e os botões de copiar funcionam. Repro: conta sem runner, abrir
  `/boards/<id>/credentials`. Claro, escuro e 390 px (os comandos longos rolam na horizontal sem estourar a página).
- Com runner: título "Registrar outro runner", passos 1 e 2 recolhidos em "Primeira vez nesta máquina?", abrindo
  pelo teclado.
- Badge `id <6 caracteres>` ao lado do nome na lista de runners, com o mesmo id que o terminal mostra; o leitor de
  tela anuncia "Revogar o runner <nome> (id <id>)".
- Ponta a ponta com o agente de teste (`docs/SETUP.md`, "Runner local com o agente de teste"): o terminal mostra a
  trilha nova e o card recebe as notas com o id. Repro: `--agent-command` com `stub-agent.mjs` e
  `--repo-base file://`.
- Ctrl+C único durante uma etapa do agente de teste, rodando por `pnpm --filter runner cli start`: o card recebe
  "falhou no runner ... interrompida" e a run termina com `finish`.
- Runner morto com `kill -9` no meio de uma etapa do agente de teste: o próximo `start` imprime "avisou o board" e
  o card fecha como falha.

## Lacunas de teste conhecidas

- Nenhum teste automatizado sobe um `claude` real; a liberação de `mcp__kanban` só foi provada à mão (acima).
- O teste da trava por repositório usa trabalho falso; dois runners de verdade clonando o mesmo repositório ao
  mesmo tempo não foram exercitados.

## Separar os commits

Todos os arquivos do `git status` são desta tarefa. Ordem sugerida: `kanban-contract` → `runner` (permissões,
interrupção e limpeza, multi-runner, comando global, trilha) → `api` → `app` → `internationalization` → docs →
`docs(features): runner-reliability`. O app e o i18n quebram o typecheck um sem o outro (chaves novas do
dicionário); se o revisor mantiver separados, o commit do app fica vermelho até o de i18n.
