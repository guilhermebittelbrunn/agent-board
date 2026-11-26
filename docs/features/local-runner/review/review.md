# Revisão: runner local

Revisão da tarefa 10 do `/cycle` noturno, sem perguntas ao usuário. O working tree tem as tarefas 1 a 9 já revisadas;
esta passada lê só o diff do `local-runner` e entrega o plano de commits das dez.

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada: o orquestrador mandou não criar nem trocar. O regex de
`.claude/rules/git-commits.md` reprova o nome (`BRANCH INVALIDA`): `guilhermebittelbrunn/` não é projeto e
`chore-cycle-three-tasks` não separa tipo e título. A branch não tem upstream. É o mesmo veredito das nove revisões
anteriores, e a decisão continua com o `/review`: antes do primeiro commit, criar a partir desta uma branch válida, por
exemplo `feat/board-cards-and-runs` (vários apps, então sem projeto). Nada foi renomeado. `git diff --cached --stat`
saiu vazio.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🔴 | `apps/runner/src/session.ts` (`readAllowList`, `buildAgentArgs`) | `--allowedTools` vai por último e consome todo argumento depois dele. Uma regra da lista `allow` do repositório alvo que comece com `-` (por exemplo `"--dangerously-skip-permissions"`) chegava ao `claude` como flag. Era um caminho para desligar as permissões sem a flag do runner e sem o aviso no terminal. | Corrigido: regras que começam com `-` são descartadas na leitura. |
| 🟡 | `apps/runner/src/job.ts:7` | `REPO_PART` aceitava `.` e `..` em `owner` e `name`, que viram pastas em `<home>/repos/<owner>/<name>`. Com `..` nos dois, o clone mirava a pasta acima do home do runner. | Corrigido: `isRepoPart` recusa `.` e `..`. Nomes que começam com ponto, como `.github`, continuam aceitos. |
| 🟡 | `apps/runner/src/cli.ts` (`parseStart`) | `--permission-mode=bypassPermissions` (com `=`) passava calado: o leitor de flags guardava a chave inteira e só `--permission-mode` era recusado. Não ligava o bypass, mas o erro de uso prometido no desvio 1 não aparecia. | Corrigido: qualquer flag que comece com `--permission-mode` dá erro de uso (conferido: saída 2 com a mensagem). |
| 🟡 | `apps/runner/src/cli.ts:258` | A guarda de entrada comparava `import.meta.url` com `` `file://${argv[1]}` ``. Num caminho com espaço ou acento, a URL vem codificada, a comparação falha e o CLI sai com código 0 sem fazer nada. | Corrigido: `pathToFileURL(process.argv[1]).href`. |
| 🟢 | `CLAUDE.md:15` | A linha de stack dizia "Claude Agent SDK (runner)"; o runner usa `claude -p`. | Corrigido: "Claude Code CLI (`claude -p`, no runner)". |
| 🟢 | `docs/PRE-PRODUCTION.md` (custo do polling) | A cota gratuita estava sem fonte ("não foi conferido"). | Atualizado com o número, a fonte e a data passados pelo orquestrador, mais o gatilho para reavaliar o intervalo. |
| 👁 | `apps/runner/src/run-job.ts` (`runShell`) | `environment.install` do `board.yml` roda com `sh -c` fora da lista `allow`, mesmo no modo `acceptEdits`. É shell por desenho (o comando vem do próprio repositório) e confia no mesmo nível que os hooks dele. | Registrado como risco; sem mudança. |
| 👁 | `apps/runner/src/session.ts` | O `claude` já aplica a lista `allow` do `.claude/settings.json` do worktree por conta própria; o `--allowedTools` do runner repete a mesma lista. Um repositório alvo pode se dar `Bash(*)` com ou sem o runner. O risco é inerente: o repositório é da própria pessoa. | Registrado. |
| 👁 | `apps/runner/src/run-job.ts` | O `mcp.json` com o token do `run` é apagado no fim, inclusive em falha e no primeiro Ctrl+C. No segundo Ctrl+C (`process.exit(130)`) ou se o processo morrer, o arquivo fica em `<home>/runs/<runId>/`, modo `0600`, até alguém apagar. O token vale até o prazo da etapa. | Registrado; risco baixo. |
| 👁 | `apps/runner/src/supervisor.ts` | O log `<home>/logs/<runId>.jsonl` (modo `0600`) guarda o `stream-json` inteiro e nunca é apagado. Se o agente imprimir `KANBAN_RUN_TOKEN`, o token fica nele. | Registrado. |
| 👁 | `--dangerously-skip-permissions` | Com o bypass, o agente consegue ler `<home>/config.json` e pegar o token `kbl_`. O env já vai sem ele (`buildAgentEnv` tira `AGENT_BOARD_RUNNER_TOKEN` e qualquer valor `kbl_`). | Registrado; é parte do aviso do modo. |
| ✅ | `apps/runner/src/git.ts`, `run-job.ts`, `job.ts` | `git`, `claude` e o agente de teste sobem por `spawn` com array; nenhum shell fora do `install`. `isSafeJob` valida slug, ids, comando, modelo, esforço e branch (sem `-` inicial, sem `..`, sem `.lock`, sem `@{`) antes de qualquer processo. `runId` não tem `.` nem `/`, então `worktrees/<runId>` e `runs/<runId>` não escapam do home. | |
| ✅ | API, regra 15 | Código de registro: só o hash como id do documento; uso único e expiração conferidos dentro da transação (`registerWithCode`). Token `kbl_`: só o hash, comparação em tempo constante, o mapper não expõe o hash. `config.json` `0600` com `chmod` explícito, pasta `0700`. Nenhum `logEvent` leva token. | |
| ✅ | `runner.repository.ts` (`claimNext`) | Claim transacional: relê o runner, recusa se o `run` atual ainda está ativo e só pega `run` `local` disparado pelo dono do runner. `findUnclaimed` encerra com `no_runner`. O `tick` só entrega `run` `fake` ao `collect` do executor falso. | |
| ✅ | `--agent-command`, `stub-agent.mjs` | `--agent-command` só com `--repo-base file://`; o agente de teste recusa push para remoto que não é `file://`. | |
| ✅ | `.claude/rules/board-mode.md`, `kit/.claude/rules/board-mode.md` | Iguais entre si. O fato é correto: o worktree sai em `-B <branch>` e, quando a branch não existe no remoto, sem upstream, então `git pull --ff-only` falharia e o primeiro push precisa de `-u`. | |

## Desvio 5: `strip-types` ou `tsc`

Fica o `node --experimental-strip-types`. Tudo que o runner importa de `@repo/kanban-contract` é `import type`, que
o Node apaga antes de rodar, e o `tsconfig` tem `erasableSyntaxOnly` e `verbatimModuleSyntax`, que fazem o `tsc`
recusar sintaxe que o Node não consegue apagar. O `tsc` para `dist` pediria `.js` em todos os imports relativos e
deixaria uma pasta que pode ficar velha em relação ao fonte. O risco que sobra: um import de valor do contrato
passaria no `tsc` e quebraria em tempo de execução, porque o barril do contrato reexporta sem extensão. Nenhum teste
roda o CLI pelo `node`; o item 3 de "Verificar no `/test`" cobre isso.

## Correções aplicadas

- `apps/runner/src/session.ts`: `readAllowList` descarta regras que começam com `-`, com um comentário do porquê.
- `apps/runner/src/job.ts`: `isRepoPart` recusa `.` e `..` em `owner` e `name`.
- `apps/runner/src/cli.ts`: `Flags.hasPrefix`; erro de uso para qualquer `--permission-mode…`; entrada por
  `pathToFileURL`.
- `CLAUDE.md`: linha de stack.
- `docs/PRE-PRODUCTION.md`: cota do Firestore com fonte e gatilho de reavaliação.

## Raio de impacto

- `@repo/kanban-contract`: `STAGE_EXECUTOR_KINDS` ganhou `local` e `RUN_END_REASONS` ganhou `no_runner`. Leitores:
  `TriggerStageDialog`, `BoardClient`, `cardRunReason.ts`, `run.mapper.ts`.
- `BoardViewDTO.executor` depende de quem lê; todas as rotas de board resolvem por `resolveExecutorFor`.
- `getStageExecutor(kind)`, `resolveStageExecutorMode({ hasOnlineRunner })`, `runRepository.promote({ executorFor })`:
  chamadores só dentro da API, todos atualizados.
- Workspace novo `apps/runner`: entra em `lint` (Biome da raiz), `typecheck` e `test` do turbo, a mesma linha do CI.
  Não tem `build`; o `cli` não é task do turbo. Os testes usam `git` com identidade própria por `-c user.*`, então não
  dependem da configuração do CI.

## Verificar no `/test`

1. **Lista `allow` com regra começando por `-`** (afirmação de maior risco, porque sustenta o padrão seguro do desvio
   1). No repositório de teste, `.claude/settings.json` com `{"permissions":{"allow":["--dangerously-skip-permissions","Bash(git status)"]}}`;
   rodar uma etapa com o agente de teste e conferir no argv registrado que só `Bash(git status)` vem depois de
   `--allowedTools`. Um caso novo de `readAllowList` em `session.test.ts` mede o mesmo sem subir nada.
2. **`owner` ou `name` igual a `..`**: `isSafeJob` com `repository: { owner: "..", name: ".." }` devolve `false`; com
   `name: ".github"`, `true`.
3. **CLI pelo `node` do `.nvmrc` (22.12)**: `pnpm --filter runner cli start --permission-mode=bypassPermissions`
   sai com 2 e a mensagem; `pnpm --filter runner cli register X --api http://127.0.0.1:1` sai com 1 e "registro
   recusado"; rodar o CLI de um checkout cujo caminho tem espaço.
4. **Ctrl+C duas vezes** durante um `run`: conferir o que sobra em `<home>/runs/` e se o card fica em "Falhou" no
   prazo da etapa.
5. Os itens da lista "A verificar no `/test`" do handoff continuam valendo (tela "Minhas credenciais" em claro, escuro
   e 390 px; fluxos 1 a 9 da seção 10.2 do plano com a API de pé; "Parar" em até 15 s; Ctrl+C com o relatório
   "interrompida no runner"; diálogo de disparo; aviso sem executor; `next build` da API e do app).
6. **Herdados do `orchestrator`** ("Depois do /test, rodada 2", corrigidos sem browser): "⋯" → "Mover para Análise"
   → Cancelar e depois Escape devolvem o foco ao botão "⋯" do card, nunca ao `body`; o título de uma coluna com um
   card lê "1 card" no leitor de tela (texto `sr-only`), e com dois lê "2 cards".

## Lacunas de teste

- Teste de regressão para as três correções do runner (regra `-` na lista `allow`, `..` em `owner`/`name`,
  `--permission-mode=`): aberta, nova. Cabe em `session.test.ts`.
- Componentes `RunnerList`, `RunnerRegistrationPanel`, `BoardCredentialsClient` sem teste: continua aberta.
- `finishRun` concorrente com `revokeOwned` sem teste de emulador: continua aberta.
- `pollForWork` com um job de verdade só no smoke manual: continua aberta.
- Consulta do `claim` sem índice composto não provada (desvio 4): continua aberta, só se mede em produção.
- CLI rodado pelo `node` em teste: aberta, nova (ver desvio 5).

## Decisões em aberto

1. **Nome da branch** (acima).
2. **Permissões** (desvio 1 do handoff): o padrão `acceptEdits` mais a lista `allow`, com bypass só pela flag. A
   revisão concorda com a escolha do `/develop`; a correção da regra com `-` fecha o único caminho de bypass sem
   aviso que a leitura achou.
3. **`strip-types`** (desvio 5): mantido, motivo acima.
4. **Apagar `runs/` velhos ao iniciar o runner**: deixaria de sobrar `mcp.json` depois de um segundo Ctrl+C, mas
   apagaria o de outro runner que use o mesmo home. Recomendação: não fazer agora; o token expira no prazo da etapa.

## Gates

| Gate | Resultado |
|------|-----------|
| `pnpm --filter runner typecheck` | sem erro, depois das correções |
| `pnpm check` | 972 arquivos, sem erro |
| typecheck de `api`, `app`, `kanban-contract`, `sdk` | não refeito: as correções não tocam esses workspaces. Número do handoff: 27 de 27 tasks em `pnpm turbo run lint typecheck test` |
| `apiErrors` | não refeito: nenhuma chave de i18n mudou nesta revisão. Handoff: os cinco `RUNNER_*` passam em `apiErrorCodesTranslated.test.ts` |
| Smoke das correções do CLI | `--permission-mode=bypassPermissions` sai com 2 e a mensagem; comando desconhecido sai com 2 e o uso |

## Depois do /test, rodada 1

O `/test` (relatório em `test/report.md`) derrubou a limpeza depois do segundo Ctrl+C e listou seis observações. As
correções abaixo ficaram no working tree, sem commit.

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | `apps/runner/src/cli.ts`, `supervisor.ts` | O segundo Ctrl+C chamava `process.exit(130)` sem matar o grupo do agente. O agente ficava órfão com o token do `run`, e sobravam `runs/<id>/mcp.json` e `worktrees/<id>`. | `supervisor.ts` guarda os grupos vivos; `killAgentsNow()` manda `SIGKILL` em cada um antes do `exit(130)`. |
| 🟡 | `apps/runner/src/leftovers.ts` (novo), `run-job.ts` | Um `kill -9` no runner não tem handler, e o worktree que sobrava fazia todo `run` seguinte do card falhar com `'feat/<slug>' is already used by worktree`. O mesmo acontecia depois de `--keep-worktrees`. | Cada `run` grava `runs/<id>/runner.pid` e `agent.pid` (modo `0600`). `sweepLeftoverRuns` roda ao iniciar o `start` e no começo de cada `run`: para cada pasta de `runs/` cujo runner não está vivo (ou é o próprio processo), mata o grupo do agente, apaga o `mcp.json` e o worktree. Antes do `git worktree add`, `releaseBranchWorktrees` remove (`git worktree remove --force` + `prune`) os worktrees da pasta `worktrees/` deste home que estão na branch do card. Pasta de `run` de outro runner vivo no mesmo home fica intacta; pasta sem `runner.pid` com menos de 60 s também, para não pegar um runner no meio da escrita. |
| 🟢 | `apps/runner/src/report.ts`, `run-job.ts` | O relatório de falha levava ao card o caminho absoluto com o nome de usuário. | `redactHome` troca a pasta do usuário por `~` no detalhe antes do `complete_stage`. O log local continua com o caminho inteiro. |
| 🟢 | `apps/runner/src/supervisor.ts` | Depois do corte, as linhas que ainda estavam no buffer continuavam contando: 289 turnos num limite de 200. | Depois que o supervisor decide parar, as linhas vão para o log sem contar. O `finish` informa o limite mais um (o turno que passou). `supervisor.test.ts` agora exige `MAX_TURNS + 1`. |
| 🟢 | `apps/runner/src/cli.ts` | O Ctrl+C com o runner ocioso dizia "a execução atual vai ser reportada". | "encerrando; uma etapa em andamento vai ser reportada como interrompida (Ctrl+C de novo sai na hora)". |
| 🟢 | `apps/runner/src/cli.ts` | Chamado por um caminho com link simbólico, o CLI saía 0 sem fazer nada. | `isEntryPoint` compara com `realpathSync(argv[1])`. |
| 🟢 | `RunnerList.tsx`, `BoardCredentialsClient.tsx` | "Ocupado com … · analyze" mostrava a chave da etapa. | Mostra o nome da coluna quando o `run` é deste board; de outro board, a chave (a página não conhece as colunas dele). |
| 🟢 | `RunnerList.tsx`, `boards.ts` | Runner offline mostrava "Sem etapa em andamento". | Chave nova `credentials.runners.offlineSince`: "Sem contato desde {date}". |
| 🟢 | `RunnerRegistrationPanel.tsx` | A caixa do comando rola na horizontal em 390 px e não recebia foco. | `tabIndex={0}` no `<code>`, com `biome-ignore` de `noNoninteractiveTabindex` explicando o motivo. |
| 🟢 | `scripts/stub-agent.mjs` | Rodar de novo a mesma etapa falhava com "nothing to commit". | `git commit --allow-empty`. |

Testes novos ou mudados: `leftovers.test.ts` (novo: agente de runner morto é morto e a pasta some; `run` de outro
runner vivo fica; `run` do próprio processo é resto; pasta sem pid recente fica e antiga sai; `redactHome`),
`runJob.test.ts` (um `run` deixa o worktree com `--keep-worktrees` e o seguinte, na mesma branch, roda; falha sem a
chamada a `releaseBranchWorktrees`, conferido desligando a linha), `cli.test.ts` (CLI por link simbólico sai com o
código de uso), `supervisor.test.ts` (`MAX_TURNS + 1`).

O `SIGKILL` do segundo Ctrl+C não tem teste automatizado: exige mandar dois `SIGINT` ao processo do CLI com um agente
que ignora `SIGTERM`. Fica no remedir do `/test`.

Gates: `pnpm check` 976 arquivos, sem erro; `pnpm turbo run typecheck --filter=app --filter=runner
--filter=@repo/internationalization` 3 de 3; `pnpm --filter runner test` 9 arquivos, 46 testes. Nenhum teste do app
cobre `RunnerList` nem `RunnerRegistrationPanel` (lacuna aberta desde o handoff).

### Remedir no `/test`

1. Segundo Ctrl+C com um agente que ignora `SIGTERM`: nenhum processo do agente sobra (`ps -o pid,pgid,command`), e o
   próximo `start` imprime "limpou o resto da execução interrompida <runId>" se `runs/<runId>` tiver ficado.
2. `kill -9` no runner no meio de um `run`: religar o runner apaga `runs/<runId>/mcp.json` e `worktrees/<runId>`, mata
   o agente órfão, e o próximo disparo do mesmo card roda sem `already used by worktree`.
3. Dois runners no mesmo `--home`, um rodando: religar o outro não apaga o `run` em andamento.
4. O relatório de falha no card mostra `~/…` no lugar de `/Users/<nome>/…`.
5. `STUB_TURNS=300` com limite 200: `finish` e card informam 201.
6. Ctrl+C com o runner ocioso mostra a frase nova.
7. CLI chamado por um caminho com link simbólico (`/tmp` no macOS) roda.
8. Tela "Minhas credenciais": "Ocupado com <slug> · <coluna>" durante um `run` deste board; runner offline com "Sem
   contato desde …"; em 390 px, Tab chega à caixa do comando e as setas rolam o texto. Claro e escuro.
9. Fluxo 2 do plano ("responder redispara") com o agente de teste, sem "nothing to commit".

## Plano de commits (tarefas 1 a 10)

Este plano substitui o de
[`agent-contract/review/review.md`](../../agent-contract/review/review.md#plano-de-commits-tarefas-1-a-9). Mensagens,
arquivos e comandos de blob de lá (e dos planos que ele cita) continuam valendo com as mudanças abaixo. A estratégia é
a mesma: arquivo misto entra inteiro no primeiro commit que já o leva, e a mensagem ganha uma linha de corpo. Os
commits intermediários ficam vermelhos no typecheck até os commits novos entrarem; o PR fica verde no último.

### Numeração

| Novo | No plano de 86 | Commit |
|------|----------------|--------|
| 1 a 8 | 1 a 8 | sem mudança (1 com mensagem nova; 2, 3, 5, 6, 7 e 8 com os blobs abaixo; 7 com corpo novo) |
| **9** | novo | `feat(kanban-contract): describe the local runner protocol` |
| 10 a 14 | 9 a 13 | sem mudança |
| **15** | novo | `feat(sdk): add the runner resource` |
| 16 a 47 | 14 a 45 | sem mudança |
| **48** | novo | `feat(api): register local runners with a one-time code` |
| **49** | novo | `feat(api): let a runner claim, report and finish runs` |
| **50** | novo | `feat(api): pick the stage executor of whoever triggers it` |
| **51** | novo | `feat(runner): add the local runner CLI` |
| **52** | novo | `test(runner): add a stub agent and a fixture repository for local runs` |
| 53 a 70 | 46 a 63 | sem mudança |
| **71** | novo | `feat(app): add the local runners page to the board` |
| 72 a 91 | 64 a 83 | sem mudança (78 e 79 com mensagem nova) |
| **92** | novo | `docs(claude): describe the runner worktree in board mode` |
| 93 a 95 | 84 a 86 | `docs(features): orchestrator`, `agent-contract`, `local-runner` (agora a pasta inteira) |

O antigo 9 a 13 soma 1, o 14 a 45 soma 2, o 46 a 63 soma 7, o 64 a 83 soma 8 e o 84 a 86 soma 9. O 15 entra logo
depois do último commit `(sdk)` do plano de 86 (o 13, agora 14).

### Onde a tarefa 10 entra em commits existentes (numeração nova)

| Arquivo | Commit | Corpo acrescentado |
|---------|--------|--------------------|
| `packages/shared/utils/helpers/log.ts` | 1 | Mensagem passa a `feat(shared): add the github, orchestrator, agent and runner log scopes and the 202, 501 and 502 statuses` |
| `packages/kanban-contract/src/run.ts` | 7 | `Also adds the local executor kind and the no_runner end reason.` |
| `packages/sdk/src/types/board/index.ts`, `member.ts`, `packages/sdk/src/client/index.ts` | o commit que já leva cada um (o de `member.ts`/`index.ts` é o 14) | `The client also exposes runners.` onde couber |
| `apps/api/(shared)/lib/board-list.ts` | 28 | |
| `apps/api/app/(routes)/boards/route.ts`, `boards/[id]/route.ts`, `reload/route.ts`, `__tests__/boardsRoutes.test.ts` | 30 | `The executor depends on who reads the board.` |
| `apps/api/(shared)/mappers/run.mapper.ts`, `repositories/run.repository.ts`, `__tests__/runMapper.test.ts`, `orchestratorDecide.test.ts` | 37 | `A run also records the runner that claimed it.` |
| `executor-mode.ts`, `executor.ts`, `board-view.ts`, `__tests__/stageExecutorMode.test.ts` | 38 | |
| `orchestrator.ts`, `cards/[slug]/runs/route.ts`, `stage-settings/route.ts`, `__tests__/cardRunsRoutes.test.ts` | 39 | `Only test-executor runs are collected by the test executor.` |
| `apps/api/proxy.ts`, `__tests__/corsOrigin.test.ts` | o commit que já leva o `proxy.ts` da API | `/runner/register` uses the strict rate limit. |
| `apps/api/(shared)/lib/rate-limit-subject.ts`, `__tests__/rateLimitSubject.test.ts` | 45 | Mensagem passa a `feat(api): rate limit agent calls per run and runner calls per runner` |
| `paths.ts`, `panelTitles.ts`, `BoardSectionNav.tsx`, `queryKeys.ts`, `BoardMembersClient.tsx` | o commit que já leva cada um | |
| `BoardSettingsClient.tsx` | 57 | |
| `(pages)/[id]/BoardClient.tsx` | 61 | |
| `TriggerStageDialog.tsx`, `cardRunReason.ts` | 67 | |
| `translations/packages/shared/utils.ts` | 72 | Os cinco códigos `RUNNER_*` |
| `translations/apps/app/pages/common/boards.ts` | 74 | |
| `translations/.../routes/index.ts` | o commit que já o leva | |
| `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` | 76 | |
| `docs/board/ARCHITECTURE.md` | 78 | Mensagem passa a `docs(board): name the collections and the run token and runner fields` |
| `docs/board/CONTRACT.md` | 79 | Mensagem passa a `docs(board): document agent authentication, endpoints, payload limits, the stage timeout and the local runner protocol` |
| `specs/features/local-runner.md` | 84 | |

O round 2 do `orchestrator` está coberto: `runDialogFocus.ts` e `runDialogFocus.test.tsx` vão inteiros no 67 (antigo
60 do plano de 86, 53 do plano de 77); `BoardColumn.tsx` é arquivo novo e vai inteiro no commit do app que o cria
(plano da `card-backlog`); `boards.ts` vai inteiro no 74 com `countOne` e `countOther`.

### Blobs

`packages/kanban-contract/src/index.ts` agora exporta `./runner`, que só existe a partir do commit 9. Em cada commit
abaixo, acrescente `runner` à lista do `grep -vE` do plano de 86:

- 2: `grep -vE '\./(boardConfigDiff|boardConfigIssues|boardLanes|specBacklog|cardEvent|run|agentResults|runner)"' …`
- 3: `grep -vE '\./(boardLanes|specBacklog|cardEvent|run|agentResults|runner)"' …`
- 5: `grep -vE '\./(cardEvent|run|agentResults|runner)"' …`
- 6: `grep -vE '\./(run|agentResults|runner)"' …`
- 7: `grep -vE '\./(agentResults|runner)"' …`
- 8 (antes ia inteiro): `grep -vE '\./runner"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- o 9 leva o arquivo inteiro com `git add`.

`pnpm-lock.yaml`: o blob do commit 3 (só o `yaml`) continua valendo. O commit que no plano de 86 levava o arquivo
inteiro passa a levar o arquivo sem o importer `apps/runner`:
`awk '/^  apps\/runner:$/ {skip=1; next} skip && /^  [^ ]/ {skip=0} !skip' pnpm-lock.yaml | git hash-object -w --stdin`.
Conferido: o resultado difere do `HEAD` só pelas 18 linhas das tarefas anteriores (`@repo/kanban-contract` em
`apps/app`, `apps/api` e num pacote, `marked`, `@ant-design/cssinjs`, `yaml`) e não cita `apps/runner`. O 51 leva o
arquivo inteiro.

`CLAUDE.md`: vai no commit da `github-sign-in` que já o leva, sem a linha do runner e com a stack antiga:
`grep -v '^| \`runner\` |' CLAUDE.md | sed 's/Claude Code CLI (`claude -p`, no runner)/Claude Agent SDK (runner)/' | git hash-object -w --stdin`.
O 92 leva o arquivo inteiro.

Em cada blob, `git update-index --cacheinfo 100644,<sha>,<caminho>`.

### Commits novos

9. `feat(kanban-contract): describe the local runner protocol`
   - `packages/kanban-contract/src/runner.ts`, `index.ts` (inteiro), `__tests__/runner.test.ts`
15. `feat(sdk): add the runner resource`
   - `packages/sdk/src/types/board/runner.ts`, `packages/sdk/src/actions/runner/action.ts`
48. `feat(api): register local runners with a one-time code`
   - corpo: `The code and the runner token are stored only as hashes; a code is spent in the same transaction that creates the runner.`
   - `apps/api/(shared)/lib/runner/runner-token-format.ts`, `runner-token.ts`, `runner-code.ts`, `runner-guard.ts`
   - `apps/api/(shared)/mappers/runner.mapper.ts`, `repositories/runner.repository.ts`, `validation/runner.schema.ts`
   - `apps/api/app/(routes)/runners/route.ts`, `runners/[id]/route.ts`, `runners/registrations/route.ts`,
     `runner/register/route.ts`
   - `apps/api/__tests__/runnerToken.test.ts`, `runnersRoutes.test.ts`, `runnerFixtures.ts`
49. `feat(api): let a runner claim, report and finish runs`
   - corpo: `A runner takes one run at a time, only from its owner, with a run token that expires at the stage deadline.`
   - `apps/api/(shared)/lib/runner/runner-claim.ts`, `runner-job.ts`, `runner-finish.ts`
   - `apps/api/app/(routes)/runner/claim/route.ts`, `runner/runs/[runId]/heartbeat/route.ts`,
     `runner/runs/[runId]/finish/route.ts`
   - `apps/api/__tests__/runnerRoutes.test.ts`, `runnerClaim.test.ts`, `runnerClaim.emulator.test.ts`
50. `feat(api): pick the stage executor of whoever triggers it`
   - corpo: `A run whose person has no executor ends with no_runner, and so does a local run nobody claims in time.`
   - `apps/api/(shared)/lib/orchestrator/executor-choice.ts`, `local-executor.ts`
   - `apps/api/__tests__/orchestratorTick.test.ts`
51. `feat(runner): add the local runner CLI`
   - corpo: `Runs each stage with claude -p in a worktree, in acceptEdits mode with the repository's allow list unless --dangerously-skip-permissions is given.`
   - `apps/runner/package.json`, `tsconfig.json`, `vitest.config.mts`, `src/*.ts` (13 arquivos, com `leftovers.ts`)
   - `apps/runner/__tests__/fixtures.ts`, `turns.test.ts`, `git.test.ts`, `session.test.ts`, `supervisor.test.ts`,
     `poll.test.ts`, `cli.test.ts`, `job.test.ts`, `leftovers.test.ts`
   - `pnpm-lock.yaml` (inteiro)
52. `test(runner): add a stub agent and a fixture repository for local runs`
   - `apps/runner/scripts/stub-agent.mjs`, `fixture-repo.mjs`, `apps/runner/__tests__/runJob.test.ts`
71. `feat(app): add the local runners page to the board`
   - `.../boards/(pages)/[id]/credentials/page.tsx`, `loading.tsx`, `BoardCredentialsClient.tsx`
   - `.../boards/(components)/RunnerList.tsx`, `RunnerRegistrationPanel.tsx`, `RevokeRunnerDialog.tsx`,
     `runnerCommands.ts`
   - `.../boards/(hooks)/useListRunners.tsx`, `useRunnerCrud.tsx`
92. `docs(claude): describe the runner worktree in board mode`
   - `.claude/rules/board-mode.md`, `kit/.claude/rules/board-mode.md`, `CLAUDE.md` (inteiro)
95. `docs(features): local-runner`
   - `docs/features/local-runner/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md` e, depois
     do `/test`, `test/`)

O prefixo `.../boards/` é `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/`. Os blocos 3, 7, 10, 12 e
13 do "Separar os commits" do handoff não viram commit próprio: os arquivos deles já estão em commits existentes
(tabela acima). A pasta `docs/features/local-runner/` foi varrida atrás de senha, token e e-mail: os tokens aparecem
só como formato (`kbl_<runnerId>_***`, `kbr_<runId>_***`).

Antes do commit 1, `git diff --cached --stat` vazio (conferido nesta revisão); depois de cada commit,
`git show --stat --oneline HEAD` conferido contra a lista. Toda mensagem termina com a linha de coautoria da sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members, cards, card timeline, stage runs, agent contract, local runner and theme toggle`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
