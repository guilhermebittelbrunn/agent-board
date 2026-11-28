# Revisão: runner local confiável e multi-runner

Revisão por leitura do diff completo (23 arquivos alterados e 17 novos) contra `docs/review-checklist.md`, com os
gates estáticos rodados no fim. Não subi app, não rodei a suíte de testes e não abri o browser.

## Branch

- Nome final: `fix/runner-reliability`, renomeada de `guilhermebittelbrunn/api-fix-spec-development` com
  `git branch -m`.
- A branch antiga não tinha remoto (`@{u}` sem upstream, `git ls-remote` vazio) nem commit próprio: o `HEAD` é
  igual a `origin/main` (`5b411cf`). O `main` local estava defasado, e por isso `git log main..HEAD` listava 200
  commits que já estão no remoto.
- O diff toca `apps/runner`, `apps/api`, `apps/app` e dois pacotes. Com mais de um app, o padrão omite o
  `project`. O tipo é `fix` porque a tarefa nasceu de duas etapas que falharam em produção.
- Regex de `.claude/rules/git-commits.md`: `branch OK: fix/runner-reliability`.

## Achados

### 🔴 Bloqueante

Nenhum.

### 🟡 Atenção

- `apps/runner/src/session.ts:39`: a regra `Bash(git push)` libera o push sem argumentos. Com o
  `push.default` padrão (`simple`), ele só envia a branch atual para o upstream de mesmo nome, que é a branch do
  card. Se o git da pessoa tiver `push.default=matching`, o mesmo comando envia toda branch local do clone
  compartilhado que exista no remoto, inclusive as de outros cards (só avanço rápido, nunca forçado). As outras
  duas formas (`git push origin <branch>` e `git push -u origin <branch>`) são exatas e seguras. Não corrigi:
  virou a decisão D1.
- `apps/runner/src/lock.ts`: `acquireRunnerLock` lia o dono e depois escrevia o arquivo. Dois `start`
  disparados no mesmo instante escolhiam o mesmo runner livre, os dois passavam pela checagem e os dois rodavam
  com a mesma credencial, que é o cenário que a trava existe para impedir. **Corrigido.**
- `apps/runner/src/run-job.ts:222`: a limpeza fechava a etapa citando o runner que limpou, e não o que morreu.
  Com vários runners na mesma pasta, quem limpa pode ser outro, e a frase "a limpeza feita quando ele voltou"
  ficava errada. **Corrigido.**
- `apps/runner/src/config.ts:41`: o comentário que justifica a cópia de `shortRunnerId` dava um motivo errado
  ("Node does not strip types from a workspace package"). Medi com
  `node --experimental-strip-types -e 'import("@repo/kanban-contract")'` dentro de `apps/runner`: o erro é
  `ERR_MODULE_NOT_FOUND` em `packages/kanban-contract/src/agentContract`, porque os módulos do pacote se
  importam sem a extensão `.ts`. Além disso, a cópia instalada pelo `install-bin` não leva `node_modules`. A
  cópia é necessária, mas o comentário precisava do motivo real. **Corrigido.** Isso derruba a afirmação do
  handoff sobre o motivo, não a decisão.

### 🟢 Sugestão / nit

- `apps/runner/bin/agent-board-runner:2`: o comentário dizia que o CLI roda "from this checkout", mas o
  `install-bin` instala uma cópia. **Corrigido** para descrever os dois casos.
- `docs/SETUP.md:567`: o exemplo de nome numerado usava o hostname da máquina do autor, com nome de pessoa.
  **Corrigido** para `macbook-2`.
- `apps/runner/src/repo-lock.ts:37-56`: o `pid` é gravado depois do `mkdir`. Se o processo morrer entre os dois,
  sobra uma trava sem `pid`, que `holderIsGone` trata como viva, e o próximo runner espera os 5 minutos do
  tempo limite antes de falhar a etapa. Também há corrida na retomada de trava abandonada: dois runners que veem o
  mesmo dono morto podem apagar a trava que o outro acabou de criar. Os dois casos exigem morte no meio do passo
  e são raros. Sugestão: considerar abandonada a trava sem `pid` mais velha que alguns segundos.
- `apps/runner/src/lock.ts:72`: mesmo depois da correção, a retomada de uma trava de processo morto ainda tem a
  corrida descrita acima (dois processos veem o mesmo dono morto ao mesmo tempo). Bem mais estreita que a
  corrida corrigida.
- `apps/runner/src/cli.ts:308`: quando dois `start` sem `--runner` disputam o mesmo runner, o que perde a trava
  sai com "já está rodando em outro terminal" em vez de tentar o próximo livre. É seguro, mas um laço que tenta
  o próximo deixaria o fluxo de "um start por terminal" mais previsível.
- `apps/runner/src/job.ts:44`: `isSafeJob` não recusa `branch` igual a `baseBranch`. Com as regras novas, um
  trabalho assim liberaria `git push origin main`. O board monta a branch com o `branchPattern` e o slug, então o
  caso é improvável, mas a recusa no runner custa uma linha.
- `apps/runner/src/session.ts:62`: o runner passa `--mcp-config` sem `--strict-mcp-config`. Se o repositório
  alvo tiver um servidor chamado `kanban` no `.mcp.json`, os nomes colidem, e agora `mcp__kanban` é liberado
  sem perguntar. O comportamento sem o `strict` já existia. Vale avaliar se o runner deve carregar só o
  próprio servidor.
- `apps/runner/src/credentials.ts:9`: `MAX_NAME_LENGTH = 40` repete a constante de `config.ts:7`.
- `apps/runner/scripts/install-bin.mjs:75-76`: a troca usa dois `rename`, e entre eles a pasta `app` não existe.
  Um `agent-board-runner` chamado nessa janela falha. Os terminais já abertos não são afetados, porque os
  módulos já foram carregados. Aceitável.
- `apps/runner/src/leftovers.ts`: dois runners que limpam a mesma sobra ao mesmo tempo chamam `complete_stage`
  duas vezes. A segunda é recusada e só gera o log "o board não recebeu o aviso".

### ✅ OK

- `boardModeTools` (`session.ts:34-43`): as regras de push são exatas, sem `:*`. Push forçado (`--force`,
  `--force-with-lease`, `+<branch>`) e push para outra branch não casam com nenhuma delas. A branch entra na
  regra só depois de `isGitRef` (`job.ts:12-21`), que aceita apenas `[A-Za-z0-9._/-]` e recusa `..` e `-` no
  início, então não dá para alargar a regra com espaço, `:` ou `*`. O modo `skip` não mudou.
- `run.json`: gravado com `0600` dentro de `runs/<runId>`, criado com `0700`. Guarda o token da run, não o do
  runner. É apagado no fim de `runJob` (junto com a pasta da run) e pela limpeza.
- Credenciais: `0600`, com `chmod` explícito. O `runnerId` passa por `RUNNER_ID` antes de virar nome de arquivo,
  o que impede sair da pasta. A migração do `config.json` antigo apaga o arquivo depois de copiar.
- SIGINT (`interrupt.ts`, `cli.ts:337-351`): o segundo sinal em menos de 1 s é ignorado, e um Ctrl+C real depois
  disso mata os agentes e sai com 130. A trava do runner é liberada no evento `exit` nos dois caminhos.
- A decisão de não chamar `finish` na limpeza se confirma no código: `claimNext` libera o `currentRunId` quando a
  run atual não está mais ativa (`apps/api/(shared)/repositories/runner.repository.ts:241-270`).
- O runner só importa tipos de `@repo/kanban-contract` (`import type`), que o `--experimental-strip-types`
  remove. A cópia instalada roda só com módulos do Node.
- `@repo/kanban-contract`: mudança aditiva (`shortRunnerId`). O app importa o pacote num client component,
  como `BoardCardItem.tsx` já faz.
- i18n: nenhum texto de UI solto. Os comandos de terminal em `runnerCommands.ts` não são copy. As chaves
  removidas (`step1`, `step2`) não têm outro uso no repositório.
- Comentários: nenhum cita artefato do fluxo. Os novos explicam restrições externas (o SIGINT duplicado do pnpm,
  as travas do git, a cópia fora do checkout).
- Docs: `CONTRACT.md` e `SETUP.md` batem com o código (caminhos de credencial, trava, regras somadas).

### 👁 Verificar no `/test`

Herdados do handoff:

- Guia em "Minhas credenciais" sem runner: seis passos abertos; o comando de registro aparece com o código e a
  API depois de "Gerar código"; os botões de copiar funcionam. Repro: conta sem runner,
  `/boards/<id>/credentials`, claro, escuro e 390 px (comando longo rola na horizontal sem estourar a página).
- Com runner: título "Registrar outro runner", passos 1 e 2 recolhidos em "Primeira vez nesta máquina?", que
  abre pelo teclado.
- Badge `id <6 caracteres>` ao lado do nome, igual ao id do terminal; o leitor de tela anuncia
  "Revogar o runner <nome> (id <id>)".
- Ponta a ponta com o agente de teste (`docs/SETUP.md`, "Runner local com o agente de teste"): trilha nova no
  terminal e notas do card com o id. Repro: `--agent-command` com `stub-agent.mjs` e `--repo-base file://`.
- Ctrl+C único durante uma etapa, rodando por `pnpm --filter runner cli start`: o card recebe "falhou no runner
  ... interrompida" e a run termina com `finish`.
- Runner morto com `kill -9` no meio de uma etapa: o próximo `start` imprime "avisou o board" e o card fecha
  como falha.

Acrescentados nesta revisão:

- `activity.ts:146` trata um evento `system` com `subtype: "permission_denied"`. Não achei no código nada que
  prove que o `claude -p` emite esse evento no stream-json. Repro: sessão real com uma ferramenta fora da lista;
  conferir se aparece `✗ permissão negada: <ferramenta>` ou só `✗ <ferramenta> falhou: ...` (o segundo caminho
  também mostra a negação, com outro texto).
- Limpeza feita por outro runner: com dois runners registrados, `kill -9` no runner A no meio de uma etapa e
  depois um `start` que pegue o runner B. A nota do card deve citar o runner A, que é o comportamento corrigido
  nesta revisão.
- Trava sob disputa: dois runners registrados e `agent-board-runner start & agent-board-runner start &` no
  mesmo instante. Um roda, e o outro sai com "já está rodando em outro terminal"; nunca os dois com o mesmo id
  em `list`.
- Reinstalação com um `start` aberto: rodar `pnpm --filter runner install-bin` enquanto um terminal está
  buscando trabalho. O terminal aberto segue rodando e pega a etapa seguinte sem erro.
- Clone compartilhado: duas etapas de cards diferentes no mesmo repositório, em dois runners, com push perto do
  `git fetch --prune` do outro. Procurar `cannot lock ref` no log da sessão. O commit e o push do agente não
  passam pela trava do repositório.

## Correções aplicadas

| Arquivo | O que mudou |
|---------|-------------|
| `apps/runner/src/lock.ts` | A trava nasce com `link` atômico a partir de um rascunho que já contém o `pid`. Se o arquivo existe e o dono está vivo, recusa; se o dono morreu, apaga e tenta de novo. |
| `apps/runner/src/leftovers.ts` | `LeftoverRun` ganhou `runner?: RunnerIdentity`. `readRunFile` aceita o campo quando ele tem `name` e `id` em texto e o descarta caso contrário. |
| `apps/runner/src/run-job.ts` | `writeRunFile` grava o runner da run. `reportLeftovers` usa `run.runner ?? ctx.runner`, e a frase passou a ser "a limpeza feita depois nesta máquina fechou a etapa". |
| `apps/runner/src/config.ts` | Comentário de `shortRunnerId` com o motivo real da cópia. |
| `apps/runner/bin/agent-board-runner` | Comentário da linha 2 vale para o checkout e para a cópia instalada. O modo `0755` foi mantido. |
| `docs/SETUP.md` | Exemplo de nome numerado neutro (`macbook-2`). |

Antes e depois da trava, que é a única correção que muda comportamento observável:

```ts
// antes: checa e depois escreve; dois processos podem passar pela checagem juntos
const holder = runnerHolder(home, runnerId);
if (holder !== null) return { ok: false, pid: holder };
writeFileSync(file, String(process.pid), { mode: PRIVATE_FILE_MODE });

// depois: só um processo cria o arquivo
while (!createLockFile(file)) {
    const holder = runnerHolder(home, runnerId);
    if (holder !== null) return { ok: false, pid: holder };
    rmSync(file, { force: true });
}
```

## Raio de impacto

- `@repo/kanban-contract` (`shortRunnerId`): usado por `apps/api` (`runner-finish.ts`) e `apps/app`
  (`RunnerList.tsx`). Nenhum tipo existente mudou.
- `finishMarkdown` passou a exigir `id` no runner. O único chamador passa o `RunnerRecord` inteiro, e o
  typecheck da API passa.
- A nota de fim de etapa, a nota de início e o relatório de falha mudaram de texto (agora com o id curto). Nada
  no repositório faz parse dessas notas.
- `JobContext.runnerName` virou `runner: { name, id }`, interno ao runner.
- Layout da pasta do runner: `config.json` → `runners/<id>.json`, com migração na primeira leitura. Um runner
  antigo (sem esta versão) apontando para a mesma pasta não enxerga as credenciais novas. Isso só importa se a
  pessoa rodar duas versões ao mesmo tempo.
- Copy: `credentials.register` reestruturado. Os únicos consumidores são o painel e o teste novo.

## Lacunas de teste

| Lacuna | Veredito |
|--------|----------|
| Nenhum teste sobe um `claude` real; a liberação de `mcp__kanban` só foi provada à mão (handoff) | Continua aberta. O custo de um teste com `claude` real não compensa; a medição manual vai para a lista acima. |
| Trava por repositório testada com trabalho falso, sem dois runners clonando de verdade (handoff) | Continua aberta. |
| `reportLeftovers` com `runner` gravado no `run.json` (correção desta revisão) | Aberta, nova. Caso em `leftovers.test.ts`: `run.json` com `runner: { name: "a", id: "aaaaaa11" }` e `ctx.runner` diferente; o resumo deve citar `` `aaaaaa` ``. |
| Disputa da trava do runner entre processos | Aberta, nova. Dois processos filhos chamando `acquireRunnerLock` no mesmo `home` e `runnerId`; só um recebe `ok: true`. |
| `shortRunnerId` do runner e do contrato podem divergir | Aberta, nova. Um teste no runner que importa os dois (o Vitest resolve o pacote) e compara o resultado. |
| `start` apagando a credencial em `RUNNER_REVOKED` | Aberta, nova. `credentials.test.ts` cobre a escolha, mas não a remoção no fluxo do `start`. |

## Decisões em aberto

- **D1. `Bash(git push)` sem argumentos.** Opções: (a) fixar `push.default=simple` só para a sessão do agente,
  com `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` e `GIT_CONFIG_VALUE_0` em `buildAgentEnv`, somando a entradas que
  já existam no ambiente; (b) tirar `Bash(git push)` e deixar só as formas com `origin <branch>`, o que nega o
  push sem argumentos que os agentes costumam usar e faz a etapa falhar; (c) manter e documentar a dependência do
  `push.default`. Recomendação: (a). Fecha o caso do `matching` sem mudar nada para quem usa o padrão.
  **Decidido pelo usuário: (a).** Aplicado em `apps/runner/src/session.ts` (`withGitConfig`, chamado por
  `buildAgentEnv`), com um caso novo em `session.test.ts` que cobre o ambiente vazio e o ambiente que já tem
  `GIT_CONFIG_COUNT`. Conferido no git: num repositório com `push.default=matching`, `git config push.default`
  responde `simple` com essas variáveis no ambiente. Runner com 72 testes e `pnpm check` limpo depois da mudança.
- **D2. Espera máxima de 2 minutos por runner (`RUNNER_CLAIM_GRACE_MS`)**, herdada do handoff. É decisão de
  produto e está fora do escopo desta revisão.

## Gates estáticos

| Gate | Resultado |
|------|-----------|
| `pnpm check` | 932 arquivos, nenhum problema |
| `pnpm --filter runner typecheck` | ok |
| `pnpm --filter api typecheck` | ok |
| `pnpm --filter app typecheck` | ok |
| `pnpm --filter @repo/kanban-contract typecheck` | ok |
| `pnpm --filter @repo/internationalization typecheck` | ok |
| `pnpm --filter api test apiErrorCodes` | não rodado: nenhum `error.code` novo, e as chaves alteradas são copy da tela, não `apiErrors` |

Todos rodaram depois das correções e sem `--force`.

## Plano de commits

Ordem: contrato → runner → api → app → internationalization → docs → artefatos da feature.

1. `feat(kanban-contract): add the short runner id`
   - `packages/kanban-contract/src/runner.ts`
2. `fix(runner): allow the kanban tools and the card branch's commit and push in board mode`
   - `apps/runner/src/session.ts`
   - `apps/runner/__tests__/session.test.ts`
3. `feat(runner): treat the Ctrl+C pnpm forwards as the same key press`
   - `apps/runner/src/interrupt.ts`
   - `apps/runner/__tests__/interrupt.test.ts`
4. `feat(runner): describe the agent session in readable terminal lines`
   - `apps/runner/src/activity.ts`
   - `apps/runner/__tests__/activity.test.ts`
5. `feat(runner): run several runners per machine and close interrupted runs on the board`
   - `apps/runner/src/config.ts`
   - `apps/runner/src/credentials.ts`
   - `apps/runner/src/lock.ts`
   - `apps/runner/src/repo-lock.ts`
   - `apps/runner/src/leftovers.ts`
   - `apps/runner/src/report.ts`
   - `apps/runner/src/supervisor.ts`
   - `apps/runner/src/poll.ts`
   - `apps/runner/src/run-job.ts`
   - `apps/runner/src/cli.ts`
   - `apps/runner/__tests__/credentials.test.ts`
   - `apps/runner/__tests__/lock.test.ts`
   - `apps/runner/__tests__/repoLock.test.ts`
   - `apps/runner/__tests__/leftovers.test.ts`
   - `apps/runner/__tests__/poll.test.ts`
   - `apps/runner/__tests__/runJob.test.ts`
6. `feat(runner): install the agent-board-runner command outside the checkout`
   - `apps/runner/bin/agent-board-runner`
   - `apps/runner/scripts/install-bin.mjs`
   - `apps/runner/package.json`
   - `apps/runner/__tests__/installBin.test.ts`
7. `feat(api): name the runner's short id in the stage finish note`
   - `apps/api/(shared)/lib/runner/runner-finish.ts`
   - `apps/api/__tests__/runnerToken.test.ts`
8. `feat: show the runner's short id and walk through the local runner setup`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerList.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerRegistrationPanel.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerCommandLine.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/runnerCommands.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/credentials/BoardCredentialsClient.tsx`
   - `apps/app/__tests__/runnerList.test.tsx`
   - `apps/app/__tests__/runnerRegistrationPanel.test.tsx`
   - `packages/internationalization/translations/apps/app/pages/common/boards.ts`
9. `docs: describe several runners per machine, the installed command and board mode permissions`
    - `docs/SETUP.md`
    - `docs/board/CONTRACT.md`
10. `docs(features): runner-reliability`
    - `docs/features/runner-reliability/STATE.md`
    - `docs/features/runner-reliability/develop/handoff.md`
    - `docs/features/runner-reliability/review/review.md`

Commits que ficam vermelhos isolados:

- O commit 5 junta interrupção, limpeza, multi-runner e trilha porque `run-job.ts` e `cli.ts` ligam as quatro
  coisas, `config.ts` remove `readConfig`/`writeConfig`, que o `cli.ts` antigo usa, e `supervisor.ts` troca o
  `onTool` que o `run-job.ts` antigo chama. Separar exigiria preparar só parte de um arquivo (`git add -p`,
  interativo, indisponível aqui) ou aceitar commits intermediários que não compilam. Com os módulos
  independentes antes (3 e 4, ainda sem uso) e o comando global depois (6, cujo teste chama `version` e `list`),
  todos os commits do runner compilam e passam isolados.
- O app e o dicionário entram juntos no commit 8, por escolha do usuário. Separados, o app não passava no
  typecheck sem as chaves novas (`idTag`, `idTitle`, `titleAnother` e as do guia), e o dicionário sozinho
  removia `step1`/`step2`, que o painel antigo usa. Assim todo commit compila, ao custo de misturar app e pacote
  num commit só, e por isso a mensagem vai sem `project`.

Varredura de segredo em `docs/features/runner-reliability/`: nenhum token, senha ou e-mail.

Título de PR sugerido: `fix: make the local runner reliable and run several runners per machine` (vários apps, então sem `project`).

### Commits realizados

Commitados em 2026-11-27 19:12 na branch `fix/runner-reliability`, depois da aprovação do plano, em sequência e conferidos
um a um contra a lista de arquivos (`git show --name-only`):

- `dae2f0d` feat(kanban-contract): add the short runner id
- `e316ac2` fix(runner): allow the kanban tools and the card branch's commit and push in board mode
- `653653f` feat(runner): treat the Ctrl+C pnpm forwards as the same key press
- `c5e34ab` feat(runner): describe the agent session in readable terminal lines
- `5fdc802` feat(runner): run several runners per machine and close interrupted runs on the board
- `f45ca02` feat(runner): install the agent-board-runner command outside the checkout
- `ccdb77e` feat(api): name the runner's short id in the stage finish note
- `1641d0c` feat: show the runner's short id and walk through the local runner setup
- `ffc2729` docs: describe several runners per machine, the installed command and board mode permissions
- `docs(features): runner-reliability` (este commit, com `STATE.md`, `develop/handoff.md` e esta revisão)

Envio ao remoto: aprovado pelo usuário; `git push -u origin fix/runner-reliability` logo depois deste commit. A PR
não foi aberta.
