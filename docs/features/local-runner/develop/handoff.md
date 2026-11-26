# Handoff do /develop: local-runner

Implementação do plano `analyze/plan.md`, feita no `/cycle` noturno sem perguntas. Nada foi commitado. A branch
continua `guilhermebittelbrunn/chore-cycle-three-tasks`, com as tarefas 1 a 9 no mesmo working tree, também sem
commit. Onde o código da `agent-contract` tem outro nome ou outra forma, segui o código e listei abaixo.

## Ler primeiro: desvios e correções ao plano

1. **Permissões da sessão (decisão do orquestrador, vai como pergunta ao usuário).** O plano propunha
   `--permission-mode bypassPermissions` como padrão do runner. Ficou o contrário: o padrão é
   `--permission-mode acceptEdits` mais a lista `permissions.allow` do `.claude/settings.json` do repositório alvo,
   lida do worktree e passada em `--allowedTools`. Pular as checagens só acontece com a flag
   `--dangerously-skip-permissions` do runner, que imprime um aviso no terminal ao iniciar. A opção
   `--permission-mode` não existe no runner; passar ela dá erro de uso, para ninguém escrever
   `--permission-mode bypassPermissions` achando que é um ajuste comum. Sem lista `allow` no repositório, o runner
   avisa no terminal que comandos fora de edição vão ser recusados.
   Alternativa descartada: `bypassPermissions` como padrão. Deixa a sessão rodar qualquer comando na máquina da
   pessoa sem ninguém olhando, tendo só os hooks e o ruleset do GitHub como rede. O custo da escolha feita: num
   repositório sem lista `allow` ampla, a etapa tende a falhar quando o agente tenta `pnpm` ou `git push`.
2. **Bug do `collect` do executor falso, corrigido com teste de regressão.** O `tick` entregava ao `collect` do
   executor falso todo `run` rodando, e ele respondia por um `run` local depois de 3 s. Agora só `run` com
   `executor === "fake"` chega lá (`orchestrator.ts`, `tick`). O teste `orchestratorTick.test.ts` ("never hands a
   local run to the fake executor's collect") falha sem a correção: tirei a linha do filtro, rodei, deu `×`, e
   restaurei.
3. **O custo de Firestore do polling era o dobro do que o plano dizia.** O plano contava duas leituras por polling.
   São três: o guard lê o runner, e a transação do `claim` relê o runner e faz a consulta de `run`s (consulta vazia
   também conta uma leitura). Um runner ocioso a cada 10 s faz cerca de 25.920 leituras por dia. A conta e o que
   fazer estão em `docs/PRE-PRODUCTION.md`. Não consegui conferir a cota gratuita na página do Firebase nesta etapa
   (sem acesso à web); o documento diz isso e aponta onde conferir.
4. **O teste de emulador não prova que a consulta do `claim` dispensa índice composto.** O plano esperava isso dele,
   mas o emulador do Firestore não exige índice nenhum. O teste prova a corrida entre dois runners e o token. A
   ausência de índice composto em produção continua sendo uma afirmação do plano (só igualdades), não medida.
5. **O CLI roda o TypeScript direto com `node --experimental-strip-types`, sem `tsc` para `dist/`.** O plano (D3)
   pedia `tsc` com saída em `dist/`. Medi esse caminho com um `tsconfig` temporário (`rootDir: src`, `outDir` fora do
   repositório) e ele compila sem erro, então o plano não estava errado. Preferi rodar o fonte porque não deixa uma
   pasta `dist` que pode ficar velha e o script `cli` vira uma linha. O custo: a flag é experimental no Node 22.12 do
   `.nvmrc` (o aviso fica suprimido com `--disable-warning=ExperimentalWarning`). Trocar para `tsc` é mudar o script
   `cli` e acrescentar `.js` nos imports relativos.
6. **O guard do runner mora em `(shared)/lib/runner/runner-guard.ts`, não em `app/(guards)/runner.ts`.** Mesmo motivo
   da `agent-contract`: o teste `impersonationReadOnly.test.ts` exige que todo `require*Api` em `app/(guards)` chame
   `assertReadOnlyWhileImpersonating`, e o runner não tem sessão.
7. **O hash do token do runner fica fora de `RunnerRecord`.** Segui a correção 3 da `agent-contract`:
   `runnerRepository.findWithToken` devolve `{ runner, tokenHash }`, e o `RunnerRecord` circula sem o hash.
8. **O token do `run` vai literal no arquivo do `--mcp-config`.** A expansão de `${VAR}` é documentada para o
   `.mcp.json`, e não achei confirmação para `--mcp-config`. Usei a saída prevista no plano: o arquivo fica em
   `~/.agent-board-runner/runs/<runId>/mcp.json`, modo `0600`, fora do worktree, e é apagado no fim de cada `run`. O
   token também vai em `KANBAN_RUN_TOKEN`.
9. **`--max-turns` existe no CLI 2.1.321, só não aparece no `--help`.** Conferi com
   `grep -a 'max-turns <turns>'` no binário do `claude`, que traz "Maximum number of agentic turns in
   non-interactive mode". O runner passa a flag e conta os turnos por conta própria. Um `result` com
   `subtype: "error_max_turns"` vira `exit: "turn_limit"`.
10. **Contagem de turnos por id de mensagem.** O `stream-json` pode emitir uma mensagem `assistant` em várias linhas
    com o mesmo `message.id`; contar linhas inflaria os turnos. O contador usa o id (`turns.ts`).
11. **`/runner/register` entrou no orçamento estrito do rate limit (20 por minuto por endereço), não no padrão.** É a
    única rota sem guard cuja credencial é um código de 40 bits; o orçamento estrito deixa a adivinhação mais lenta.
    Teste em `corsOrigin.test.ts`.
12. **Onde ficaram as peças.** `findUnclaimed` está em `(shared)/lib/runner/runner-claim.ts` (o plano dizia
    `decide.ts`), junto de `pickClaimable` e `isRunnerOnline`. A escolha do executor por pessoa ficou em
    `orchestrator/executor-choice.ts` (o plano dizia `executor.ts`), para as rotas de leitura do board não
    importarem o executor falso. O registro e o `claim` ficaram num repositório só, `runner.repository.ts`, sem
    `runner-registration.repository.ts`, porque consumir o código e criar o runner é uma transação.
13. **Hash e comparação do token.** Reusei `hashRunSecret` e `matchesRunToken` da `agent-contract` sem renomear: são
    genéricos (SHA-256 + `timingSafeEqual`), e renomear mexeria nos arquivos da tarefa 9.
14. **Lockfile.** O `pnpm install` acrescentou o workspace `apps/runner` e, junto, entradas que as tarefas anteriores
    tinham posto nos `package.json` sem atualizar o `pnpm-lock.yaml` (`@repo/kanban-contract` em `apps/app` e
    `apps/api`, `marked` em `apps/app`). Sem isso, um `pnpm install --frozen-lockfile` no CI falharia.

## Blueprint → arquivos

### Contrato (`packages/kanban-contract`)

| Item | Arquivos |
|------|----------|
| `STAGE_EXECUTOR_KINDS` com `local`; `RUN_END_REASONS` com `no_runner` | `src/run.ts` (trecho desta tarefa: as duas listas) |
| Constantes de tempo, alfabeto e tamanho do código, `normalizeRunnerCode`, `formatRunnerCode`, schemas de registro, heartbeat e fim, `RUNNER_EXITS`, `RunnerJob` e os tipos de resposta | `src/runner.ts` (novo), `src/index.ts` (uma linha de export) |
| Testes | `__tests__/runner.test.ts` (novo) |

### SDK (`packages/sdk`)

| Item | Arquivos |
|------|----------|
| `RunnerDTO`, `RunnerCurrentRunDTO`, `RunnerRegistrationDTO` | `src/types/board/runner.ts` (novo), `src/types/board/index.ts` (uma linha) |
| `runner.list()`, `createRegistration()`, `revoke(id)` | `src/actions/runner/action.ts` (novo), `src/client/index.ts` (campo `runner` + construtor) |
| Comentário de `BoardViewDTO.executor` (agora depende de quem lê) | `src/types/board/member.ts` |

### `packages/shared`

`utils/helpers/log.ts`: escopo de log `runner`.

### API (`apps/api`)

| Item | Arquivos |
|------|----------|
| `parseRunnerToken` (sem `node:crypto`) | `(shared)/lib/runner/runner-token-format.ts` (novo) |
| `mintRunnerToken` | `(shared)/lib/runner/runner-token.ts` (novo) |
| `mintRunnerCode`, `hashRunnerCode` | `(shared)/lib/runner/runner-code.ts` (novo) |
| `isRunnerOnline`, `pickClaimable`, `findUnclaimed` | `(shared)/lib/runner/runner-claim.ts` (novo) |
| `toRunnerJob` | `(shared)/lib/runner/runner-job.ts` (novo) |
| `finishMarkdown`, `formatDuration` | `(shared)/lib/runner/runner-finish.ts` (novo) |
| `requireRunnerApi` | `(shared)/lib/runner/runner-guard.ts` (novo) |
| `RunnerRecord`, `toRunnerDTO`, `toRunnerTokenHash`, tabelas `runner` e `runnerRegistration` | `(shared)/mappers/runner.mapper.ts` (novo) |
| `listByUser`, `findWithToken`, `touch`, `createRegistration`, `registerWithCode`, `revokeOwned`, `findRunsByIds`, `claimNext`, `recordTurns`, `finishRun` | `(shared)/repositories/runner.repository.ts` (novo) |
| `parseRunnerRegister`, `parseRunnerHeartbeat`, `parseRunnerFinish` | `(shared)/validation/runner.schema.ts` (novo) |
| `GET /runners`, `DELETE /runners/[id]`, `POST /runners/registrations` | `app/(routes)/runners/route.ts`, `runners/[id]/route.ts`, `runners/registrations/route.ts` (novos) |
| `POST /runner/register`, `/runner/claim`, `/runner/runs/[runId]/heartbeat`, `/runner/runs/[runId]/finish` | `app/(routes)/runner/**/route.ts` (novos) |
| `run` com `runnerId`, `claimedAt`, `runnerFinishedAt` (nulos no `run` novo, ausente lido como nulo) | `(shared)/mappers/run.mapper.ts` (trecho desta tarefa: os três campos em `RunRecord`, `newRunDocument` e `toDTO`) |
| `promote` recebe `executorFor(run)` no lugar de um `executor` único | `(shared)/repositories/run.repository.ts` (trecho desta tarefa: a assinatura e o corpo de `promote`) |
| `resolveStageExecutorMode({ hasOnlineRunner })` | `(shared)/lib/orchestrator/executor-mode.ts` (trecho desta tarefa: a função inteira) |
| `getStageExecutor(kind)` e executor local | `(shared)/lib/orchestrator/executor.ts` (trecho: assinatura e o ramo `local`), `local-executor.ts` (novo) |
| `resolveExecutorFor`, `executorsForUsers` | `(shared)/lib/orchestrator/executor-choice.ts` (novo) |
| Executor por `run`, `no_runner`, `collect` só do falso, `stopRun` e `resumeAfterAnswer` por pessoa | `(shared)/lib/orchestrator/orchestrator.ts` (trechos desta tarefa: imports, `stopRun` lê o `run` e cancela pelo tipo, `resumeAfterAnswer` usa `resolveExecutorFor`, `pumpBoard` reescrito, bloco de `findUnclaimed` e filtro do `collect` no `tick`) |
| `toBoardView(board, access, executor)` com o executor de quem lê | `(shared)/lib/board-view.ts`, `(shared)/lib/board-list.ts`, `app/(routes)/boards/route.ts`, `boards/[id]/route.ts`, `boards/[id]/reload/route.ts`, `boards/[id]/stage-settings/route.ts` (trecho: só a chamada de `toBoardView` e o import) |
| Disparo recusado sem runner de quem dispara | `app/(routes)/boards/[id]/cards/[slug]/runs/route.ts` (trecho: a checagem antes de `triggerStage`) |
| Balde de rate limit por runner | `(shared)/lib/rate-limit-subject.ts` (trecho: `machineSubject` e o comentário) |
| `/runner/register` no orçamento estrito | `proxy.ts` (trecho: a entrada na lista e duas linhas do comentário) |

### Runner (`apps/runner`, workspace novo)

| Item | Arquivos |
|------|----------|
| Pacote, `tsconfig`, Vitest | `package.json` (`cli`, `test`, `typecheck`, `clean`), `tsconfig.json`, `vitest.config.mts` |
| CLI `register` e `start` | `src/cli.ts` |
| Config em `~/.agent-board-runner/config.json` (`0600`, pasta `0700`) | `src/config.ts` |
| Cliente HTTP | `src/api.ts` |
| Polling com espera crescente e saída em 401 | `src/poll.ts` |
| Plano de worktree e git por `spawn` | `src/git.ts` |
| Validação do job antes de git ou processo | `src/job.ts` |
| Prompt, argv do `claude`, env sem token do runner, MCP, lista `allow` | `src/session.ts` |
| Contagem de turnos | `src/turns.ts` |
| Supervisor (limite de turnos, heartbeat, prazo, Ctrl+C, grupo de processo) | `src/supervisor.ts` |
| Relatório de falha no molde do CONTRACT.md | `src/report.ts` |
| Um `run` de ponta a ponta | `src/run-job.ts` |
| Agente de teste e repositório bare | `scripts/stub-agent.mjs`, `scripts/fixture-repo.mjs` |

Onde o runner guarda o próprio token: `~/.agent-board-runner/config.json` (ou `<--home>/config.json`, ou
`$AGENT_BOARD_RUNNER_HOME/config.json`), modo `0600`, fora de qualquer worktree.

### App (`apps/app`)

| Item | Arquivos |
|------|----------|
| Página "Minhas credenciais" | `boards/(pages)/[id]/credentials/page.tsx` (prefetch de board e runners, `isImpersonating()`), `loading.tsx`, `BoardCredentialsClient.tsx` (novos) |
| Lista, registro, revogação, comandos | `boards/(components)/RunnerList.tsx`, `RunnerRegistrationPanel.tsx`, `RevokeRunnerDialog.tsx`, `runnerCommands.ts` (novos) |
| Hooks | `boards/(hooks)/useListRunners.tsx` (`fetchRunnerList`, `refetchInterval` de 5 s só com código aberto ou runner ocupado), `useRunnerCrud.tsx` (revogar tira da lista com `setQueryData`) (novos) |
| Aba "Minhas credenciais" | `boards/(components)/BoardSectionNav.tsx`; uma linha `credentials:` nos `links` de `BoardClient.tsx`, `members/BoardMembersClient.tsx`, `settings/BoardSettingsClient.tsx` |
| Aviso sem executor com link | `boards/(pages)/[id]/BoardClient.tsx` (trecho: prop `credentialsHref`, o `Link` e o import) |
| "Roda no seu runner local." | `boards/(components)/TriggerStageDialog.tsx` (bloco `executor === "local"`) |
| Motivo `no_runner` | `boards/(components)/cardRunReason.ts` |
| Rota, chave de query, título da aba | `(common)/paths.ts` (`boards.credentials`), `shared/lib/queryKeys.ts` (`runners`), `shared/lib/panelTitles.ts` |

O app lê a URL da API para montar o comando de registro em `env.NEXT_PUBLIC_API_URL` (`@/env`, o env tipado).

### i18n (`packages/internationalization`)

- `translations/apps/app/pages/common/boards.ts`: `nav.credentials`, `board.noExecutor` (texto novo),
  `board.noExecutorLink`, `board.card.runReason.noRunner`, `trigger.localExecutor` e o bloco `credentials` inteiro.
- `translations/apps/app/pages/common/routes/index.ts`: `platform.boards.credentials`.
- `translations/packages/shared/utils.ts`: copy nova de `RUN_EXECUTOR_UNAVAILABLE` e os cinco códigos abaixo.

As mensagens do CLI no terminal ficam em pt-br no código do runner, como o plano decidiu (D12).

### Docs

- `docs/board/ARCHITECTURE.md`: runner em `apps/runner` com `claude -p`, coleções `runner` e `runnerRegistration`,
  campos novos do `run`, executor `local` e motivo `no_runner`.
- `docs/board/CONTRACT.md`: quem emite o token para o runner e a seção "Protocolo do runner local".
- `docs/SETUP.md`: "Runner local com o agente de teste".
- `docs/PRE-PRODUCTION.md`: executor em produção atualizado, custo de Firestore do polling e o roteiro com o
  `claude` real.
- `.claude/rules/board-mode.md` e `kit/.claude/rules/board-mode.md` (iguais): no runner local o worktree já está na
  branch do card.
- `CLAUDE.md` (raiz): linha `runner` no mapa de apps.

## Contrato mexido e quem consome

- `StageExecutorKind` ganhou `local`: lido em `TriggerStageDialog`, `BoardClient` e `run.mapper.ts`.
- `RunEndReason` ganhou `no_runner`: lido em `cardRunReason.ts` e no mapper.
- `BoardViewDTO.executor` passou a depender de quem lê. Todas as rotas que devolvem board resolvem por
  `resolveExecutorFor(subjectProfile.id)`; sob personificação, vale o executor da pessoa personificada.
- `RunRecord` ganhou três campos; `RunDTO` não mudou.
- `getStageExecutor()` virou `getStageExecutor(kind)`; `resolveStageExecutorMode()` virou
  `resolveStageExecutorMode({ hasOnlineRunner })`; `runRepository.promote` recebe `executorFor`.
- Testes de tarefas anteriores que mudaram só de arranjo: `cardRunsRoutes.test.ts` (mock de `executor-choice` e três
  campos no fixture), `boardsRoutes.test.ts` (mock de `executor-choice` devolvendo `null`, o mesmo que a asserção
  `executor: null` já esperava), `orchestratorDecide.test.ts` e `runMapper.test.ts` (três campos no fixture),
  `stageExecutorMode.test.ts` (nova assinatura, com um caso novo). Nenhuma asserção foi afrouxada.

## Códigos de erro novos

| Código | Status | Onde |
|--------|--------|------|
| `RUNNER_TOKEN_INVALID` | 401 | guard do runner |
| `RUNNER_REVOKED` | 401 | guard do runner |
| `RUNNER_CODE_INVALID` | 400 | `POST /runner/register` |
| `RUNNER_NOT_FOUND` | 404 | `DELETE /runners/[id]` |
| `RUNNER_RUN_MISMATCH` | 403 | heartbeat e finish |

Os cinco estão em `apiErrors`; `apiErrorCodesTranslated.test.ts` passa.

## Decisões em aberto

1. **Permissões (desvio 1).** O padrão ficou `acceptEdits` com a lista `allow` do repositório; `bypassPermissions`
   só com `--dangerously-skip-permissions`. Precisa da sua confirmação, porque define se uma etapa real anda sozinha
   num repositório sem lista `allow` ampla.
2. **`claude -p` ou Agent SDK** (pergunta 2 do plano): segue `claude -p`, sem dependência nova.
3. **`apps/runner`** (pergunta 3 do plano): aplicado, com o `ARCHITECTURE.md` corrigido.
4. **Tela mínima** (pergunta 4 do plano): aplicada, só a seção "Runners locais".
5. **`strip-types` ou `tsc`** (desvio 5): os dois funcionam; ficou o que não tem passo de build.

## Riscos conhecidos

- Runner que morre no meio de um `run` (sem Ctrl+C) não é detectado: o `run` fica com `currentRunId` no runner e só
  termina no prazo da etapa, como `timeout`. Até lá, o mesmo runner religado recebe `{ job: null }`.
- O runner chama `complete_stage(failed)` sempre que a sessão sai sozinha, mesmo depois de o agente ter fechado a
  etapa. A API responde `{ ignored: true }`, mas é uma chamada a mais por etapa.
- Cada leitura do quadro agora faz uma consulta a mais (os runners de quem lê).

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 972 arquivos, sem erro |
| Lint, typecheck e testes (linha do CI sem emulador) | `pnpm turbo run lint typecheck test` | 27 de 27 tasks |
| Testes por workspace | `pnpm turbo run test --filter=api --filter=runner --filter=@repo/kanban-contract --filter=app` | `api` 107 arquivos / 1273 testes; `runner` 6 / 30; `kanban-contract` 14 / 128; `app` 114 / 882 |
| Emulador | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator` | 7 arquivos verdes, incluindo `runnerClaim.emulator.test.ts` (4 testes). Portas 8080 e 9199 livres antes e depois (`lsof`); o script subiu e derrubou os próprios emuladores |
| `apiErrors` | `apiErrorCodesTranslated.test.ts`, dentro da suíte da API | passa |

Medido no emulador (`runnerClaim.emulator.test.ts`), com `triggerStage`, `tick` e a rota de ferramenta do agente
reais: dois `claimNext` simultâneos de runners da mesma pessoa entregam o `run` a um só; o `run` disparado por quem
tem runner online sai com `executor: "local"`; `tokenExpiresAt` fica gravado como `Timestamp` e o documento não
contém o segredo; `get_card` com o token devolvido responde 200; o runner ocupado recebe `null`; o runner de outra
pessoa não pega o `run`; runner sem contato há 5 minutos faz o `run` sair com `executor: "fake"`; `tick` depois de
3 minutos encerra o `run` local não pego com `endReason: "no_runner"`.

Medido nos testes do runner (`runJob.test.ts`), com git real, `fixture-repo.mjs`, `stub-agent.mjs` e um servidor
`node:http` no lugar da API: clone, worktree em `feat/search-cards`, push para o bare (o `git log` da branch no bare
tem o commit do agente), `post_update` com a frase de início, chamadas de agente com `Bearer kbr_…` e `finish` com
`Bearer kbl_…`, `exit: "exited"` com 3 turnos, worktree e pasta do `run` apagados. Com `STUB_OUTCOME=none`, o runner
manda `complete_stage` com `failed` e "O agente terminou sem chamar complete_stage.". O agente de teste sai com
código 1 e "não é file://" diante de um remoto `https://`. `supervisor.test.ts` mede os seis motivos de saída com um
processo filho real.

Smoke do CLI (não persistido): `pnpm --filter runner cli register` e `start` contra um servidor falso no scratchpad,
com o agente de teste e um repositório bare. O registro gravou `config.json` com modo `600` (`stat -f %Lp`), o
`start` pegou o job, rodou o agente, mandou `finish` com `exit: "exited"` e 3 turnos, e saiu com código 1 e "runner
revogado no board" quando o servidor respondeu `401 RUNNER_REVOKED`. A pasta do smoke foi apagada.

## A verificar no `/test`

Repro do plano, seção 10.1: `pnpm emulators`, `pnpm seed`, `pnpm dev`, importar `sample-app`, sincronizar o backlog,
`node apps/runner/scripts/fixture-repo.mjs "$TMP/repos"`, gerar o código na tela e seguir `docs/SETUP.md`. Nada
abaixo foi medido nesta etapa, porque não subi API nem app:

- A tela "Minhas credenciais": geração do código, os dois comandos com Copiar, "Aguardando o runner se apresentar…"
  trocando por "Runner <nome> registrado." quando o CLI registra, selo Online/Offline, "Ocupado com …" durante um
  `run`, revogar e o CLI saindo com "runner revogado". Claro, escuro e 390 px.
- Fluxos 1 a 9 da seção 10.2 do plano com o runner de verdade contra a API de pé (o percurso só foi medido contra um
  servidor falso e no emulador por chamada direta ao repositório).
- "Parar" no board encerrando o processo do agente em até 15 s (o supervisor foi medido com heartbeat simulado, não
  com a API).
- Ctrl+C no runner deixando o card em "Falhou" com o relatório "interrompida no runner".
- O diálogo de disparo mostrando "Roda no seu runner local." e, sem runner, "Executor de teste" no emulador.
- O aviso sem executor com o link para "Minhas credenciais" fora do emulador.
- `next build` da API e do app com as rotas novas (o `tsc` passa; o build não foi rodado).
- O caminho com o `claude` real (roteiro em `docs/PRE-PRODUCTION.md`) fica **não verificado**: gasta a assinatura.

## Lacunas de teste conhecidas

- Nenhum teste de componente para `RunnerList`, `RunnerRegistrationPanel` e `BoardCredentialsClient`.
- `finishRun` concorrente com `revokeOwned` não tem teste de emulador.
- `pollForWork` com um job de verdade só é coberto pelo smoke manual, não por teste.
- A consulta do `claim` sem índice composto não é provada (desvio 4).

## Separar os commits

Ordem sugerida, um commit por pacote ou app e por assunto. Os arquivos compartilhados com as tarefas 1 a 9 precisam
de `git add -p`, pelos trechos listados em "Blueprint → arquivos".

1. `feat(kanban-contract): runner protocol, local executor and no_runner reason`: `src/runner.ts`, `src/index.ts`
   (linha do export), `src/run.ts` (as duas listas), `__tests__/runner.test.ts`.
2. `feat(sdk): runner resource`: `src/types/board/runner.ts`, `src/types/board/index.ts`, `src/types/board/member.ts`
   (comentário), `src/actions/runner/action.ts`, `src/client/index.ts`.
3. `feat(shared): runner log scope`: `utils/helpers/log.ts` (a linha `runner`).
4. `feat(api): runner registration and token`: `(shared)/lib/runner/runner-token-format.ts`, `runner-token.ts`,
   `runner-code.ts`, `runner-guard.ts`, `(shared)/mappers/runner.mapper.ts`, `(shared)/repositories/runner.repository.ts`,
   `(shared)/validation/runner.schema.ts`, `app/(routes)/runners/**`, `app/(routes)/runner/register/route.ts`,
   `__tests__/runnerToken.test.ts`, `__tests__/runnersRoutes.test.ts`, `__tests__/runnerFixtures.ts`.
5. `feat(api): runner claim, heartbeat and finish`: `runner-claim.ts`, `runner-job.ts`, `runner-finish.ts`, rotas
   `runner/claim` e `runner/runs/**`, `run.mapper.ts` (três campos), `__tests__/runnerRoutes.test.ts`,
   `__tests__/runnerClaim.test.ts`, `__tests__/runnerClaim.emulator.test.ts`, fixtures `runMapper.test.ts` e
   `orchestratorDecide.test.ts` (três campos).
6. `feat(api): pick the stage executor per run`: `executor-mode.ts`, `executor.ts`, `executor-choice.ts`,
   `local-executor.ts`, `orchestrator.ts`, `run.repository.ts` (`promote`), `board-view.ts`, `board-list.ts`, as
   rotas de board e a de `runs`, `__tests__/orchestratorTick.test.ts`, `stageExecutorMode.test.ts`,
   `cardRunsRoutes.test.ts`, `boardsRoutes.test.ts` (arranjos).
7. `feat(api): rate limit runners per runner`: `rate-limit-subject.ts`, `proxy.ts`, `__tests__/rateLimitSubject.test.ts`
   e `__tests__/corsOrigin.test.ts` (os trechos novos).
8. `feat(runner): local runner CLI`: `apps/runner/package.json`, `tsconfig.json`, `vitest.config.mts`, `src/**`,
   `__tests__/fixtures.ts`, `turns.test.ts`, `git.test.ts`, `session.test.ts`, `supervisor.test.ts`, `poll.test.ts`,
   e `pnpm-lock.yaml` (ver desvio 14: o lockfile leva também entradas das tarefas anteriores; se elas forem
   commitadas antes, este commit só leva o bloco `apps/runner`).
9. `test(runner): stub agent and fixture repository for local runs`: `scripts/stub-agent.mjs`,
   `scripts/fixture-repo.mjs`, `__tests__/runJob.test.ts`.
10. `feat(internationalization): runner copy and error codes`: os trechos de `boards.ts`, `routes/index.ts` e
    `utils.ts`.
11. `feat(app): local runners page`: `credentials/**`, `RunnerList.tsx`, `RunnerRegistrationPanel.tsx`,
    `RevokeRunnerDialog.tsx`, `runnerCommands.ts`, `useListRunners.tsx`, `useRunnerCrud.tsx`, `BoardSectionNav.tsx`,
    a linha `credentials:` dos três clientes, `paths.ts`, `queryKeys.ts`, `panelTitles.ts`.
12. `feat(app): local executor in the trigger dialog and no_runner reason`: `TriggerStageDialog.tsx`,
    `cardRunReason.ts`, o aviso com link em `BoardClient.tsx`.
13. `docs(board): local runner protocol and setup`: `docs/board/ARCHITECTURE.md`, `docs/board/CONTRACT.md`,
    `docs/SETUP.md`, `docs/PRE-PRODUCTION.md` (as três seções desta tarefa).
14. `docs(claude): runner worktree in board mode`: `.claude/rules/board-mode.md`, `kit/.claude/rules/board-mode.md`,
    `CLAUDE.md` (linha `runner`).
15. `docs(features): local-runner`: `docs/features/local-runner/`.

Nenhum segredo nos artefatos: os tokens aparecem só como formato (`kbl_<runnerId>_***`, `kbr_<runId>_***`), e o
smoke rodou com um segredo fixo de teste (`"S"` repetido) num diretório apagado depois.
