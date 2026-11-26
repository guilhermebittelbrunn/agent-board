# Relatório de QA: runner local

Passada do `/test` dentro do `/cycle` noturno, sem perguntas. Branch `guilhermebittelbrunn/chore-cycle-three-tasks`
(não protegida), com as tarefas 1 a 10 no working tree e nenhum commit delas. O runner rodou de verdade contra a API e
o app de pé no emulador, com o agente de teste (`stub-agent.mjs`) atrás de um wrapper que grava o próprio argv, e um
repositório bare `file://` num diretório temporário fora do repositório. O `claude` real não rodou.

Resultado da rodada 1: 13 dos 15 critérios passaram. O critério do Ctrl+C e o do worktree falharam no caminho do
segundo Ctrl+C (defeito 1), e o `test` ficou `blocked`. A revisão corrigiu o defeito e seis observações; a rodada 2
(no fim deste relatório) remediu os nove itens e todos passam. Os 15 critérios passam e o `test` fecha como `done`.
O item herdado do `orchestrator` (foco do "⋯" e "1 card") passou na rodada 1.

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter runner exec vitest run` (depois dos testes novos) | 8 arquivos, 39 testes (eram 6 e 30) |
| `pnpm --filter runner typecheck`; `biome check apps/runner` | sem erro |
| `pnpm test` (raiz, JDK 21, cache do turbo, 1ª vez) | 13 de 14 tasks: `test:emulator` com 2 testes em timeout de 30 s (`orchestratorRuns` "applies a repeated stage result once…" em 172 s e `runnerClaim` "gives a local run to one of two runners…" em 49 s) com load average 41 na máquina |
| `pnpm --filter api test:emulator` (isolado, load 7) | 7 arquivos, 156 de 156; os dois casos em 3,8 s e 2,7 s |
| `pnpm test` (raiz, de novo) | 14 de 14 tasks, 11 do cache: `api` 107 arquivos e 1273 testes; `app` 114 e 882; `test:emulator` 7 e 156; `runner` 8 e 39; `kanban-contract` 128; `internationalization` 35 |
| `apiErrors` | `apiErrorCodesTranslated.test.ts` passa dentro dos 1273 da `api`; nenhum código novo nesta passada |
| `next build` da `apps/api` | passa; `/runner/claim`, `/runner/register`, `/runner/runs/[runId]/finish`, `/runner/runs/[runId]/heartbeat`, `/runners`, `/runners/[id]` e `/runners/registrations` como `ƒ` |
| `next build` da `apps/app` | passa; `/[locale]/boards/[id]/credentials` como `ƒ` |
| `pnpm e2e` (Playwright, completo, uma vez) | 31 de 31 em 4,2 min |

Uma execução intermediária do `pnpm test`, logo depois de derrubar os servidores de dev, mostrou `api` com 103
arquivos e 11 de 13 tasks; a seguinte, sem mudança de código, deu os números da tabela. Não investiguei a causa
(suspeito de entrada do turbo alterada pelo `AGENTS.md` que o `next dev` gera). Nenhum `--force`.

Os builds usaram variáveis descartáveis: emulador nos hosts padrão, `FIREBASE_ADMIN_PROJECT_ID=demo-next-boilerplate`,
e-mail de conta de serviço fictício e chave `descartavel` na API; `FIREBASE_ADMIN_PROJECT_ID=""` no app.

### Testes criados

Todos na faixa barata, em `apps/runner/__tests__/`:

- `session.test.ts`, "drops allow rules that would reach claude as a flag": lista `allow` com
  `--dangerously-skip-permissions`, `--permission-mode=bypassPermissions`, `-p` e `Bash(git status)`; só a última
  sobra, e o argv termina em `--allowedTools`, `Bash(git status)`.
- `job.test.ts` (novo): `isSafeJob` recusa `.` e `..` em `owner` e `name` (cinco combinações) e aceita `.github`.
- `cli.test.ts` (novo): `parseArgs` recusa `--permission-mode`, `--permission-mode=bypassPermissions` e
  `--permission-mode=acceptEdits`; e o CLI rodado pelo `node --experimental-strip-types` a partir de uma cópia de
  `src/` numa pasta com espaço e acento sai com 2 para `--permission-mode=`, 1 com "registro recusado" para uma API
  inalcançável e 2 com o uso para comando desconhecido. Fecha a lacuna "CLI rodado pelo `node` em teste".

O `cli.test.ts` copia o fonte para `realpath(os.tmpdir())`. Sem o `realpath`, o teste falha: no macOS o `tmpdir` é
um link simbólico, e a guarda de entrada não roda (observação 4).

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito | O que foi medido |
|---|------|----------|------------------|
| 1 | Regra `-` na lista `allow` | ✅ confirmado | Branch `feat/search-cards` no bare com `.claude/settings.json` `{"permissions":{"allow":["--dangerously-skip-permissions","Bash(git status)"]}}`. O argv real das quatro etapas (gravado pelo wrapper) termina em `"--permission-mode","acceptEdits","--allowedTools","Bash(git status)"`; `--dangerously-skip-permissions` não aparece. Com a flag do runner, o argv termina em `--dangerously-skip-permissions` e o terminal mostra o aviso "ATENÇÃO" |
| 2 | `..` em `owner`/`name` | ✅ confirmado | `job.test.ts` |
| 3 | CLI pelo Node 22.12 | ✅ confirmado | `pnpm --filter runner cli start --permission-mode=bypassPermissions`: código 2 e "--permission-mode não existe…". `register X --api http://127.0.0.1:1`: código 1 e "registro recusado: fetch failed". Pasta com espaço e acento: funciona (`cli.test.ts` e à mão). Pasta acessada por link simbólico: sai 0 sem fazer nada (observação 4) |
| 4 | Ctrl+C duas vezes | ❌ derrubado em parte | Com um agente que ignora `SIGTERM`, o segundo Ctrl+C fecha o runner na hora e deixa o agente órfão rodando (PPID 1, grupo próprio), `runs/<runId>/mcp.json` (`0600`) e `worktrees/<runId>`. O card fica "Rodando" e vira "Falhou" quando o prazo vence (simulado com `fake-executor expire`). O worktree que sobra quebra o `run` seguinte: defeito 1 |
| 5 | Itens do handoff | ✅ exceto o 4 | Tabela de fluxos abaixo |
| 6 | Herdados do `orchestrator` | ✅ confirmado | Menu "⋯" → "Mover para Análise" → "Cancelar e voltar o card": foco em `BUTTON` "Ações de Atalhos de teclado no quadro". Escape: idem. Os dois com mouse e só com teclado. Títulos das colunas com `.sr-only` "0 cards", "1 card" (Análise com um card) e "2 cards" (Concluído com dois); o nome acessível da região lê "Análise 1 card" |

## Fluxos com a API de pé (seção 10.2 do plano)

| # | Fluxo | Veredito | Observado |
|---|-------|----------|-----------|
| 1 | Etapas pelo runner | ✅ | Diálogo "Roda no seu runner local."; "Busca por texto nos cards" foi de Análise a Concluído em cerca de 15 s. Por etapa: "Runner qa-runner começou /analyze search-cards na branch feat/search-cards.", "Agente de teste rodando…", relatório e "Runner qa-runner: /analyze terminou em 1 s · 3 turnos." O bare tem quatro commits em `feat/search-cards`, um por etapa. `worktrees/` e `runs/` vazios no fim; o clone sem worktree extra |
| 2 | Pergunta | ✅ | Card em "Aguardando você" com "A etapa Análise parou com 1 pergunta"; "Responder e retomar a etapa Análise" redisparou e o runner pegou o `run` de novo |
| 3 | Ctrl+C | ✅ | "Falhou", relatório "/analyze — falhou no runner qa-runner" com "A execução foi interrompida no runner (Ctrl+C).", evento "Interrompida no runner (Ctrl+C).", worktree e `runs/` apagados, runner saiu |
| 4 | Limite de turnos | ✅ com ressalva | `STUB_TURNS=300`: "Encerrada pelo limite de turnos da etapa.", card "Falhou". O tempo informado diz 289 turnos, não 201 (observação 1) |
| 5 | Parar no board | ✅ | Processo do agente morto 11,8 s depois de confirmar "Parar" (medido por PID); na primeira tentativa, a linha final do runner saiu 17 s depois do clique. "Parada no board." na linha do tempo, sem relatório de falha |
| 6 | Sem `complete_stage` | ✅ | "Falhou" com "O agente terminou sem chamar complete_stage." |
| 7 | Uso próprio | ✅ | `qa-other` sem runner: diálogo "Executor de teste: o resultado é simulado.", card até Concluído pelo executor falso; o runner de `qa-owner` ligado não pegou nada (contagem de "pegou" parada em 3). `qa-other` com runner registrado e desligado: o `run` saiu `local` e o runner de `qa-owner` também não pegou |
| 8 | Runner offline | ✅ | Com o runner de `qa-owner` revogado, o diálogo mostra "Executor de teste". `no_runner`: disparo de `qa-other` às 09:17:50 com o runner dele online só pelo registro; às 09:20:46 o card estava "Falhou" com "Nenhum runner seu pegou esta etapa. Inicie o runner e rode de novo." no quadro e no detalhe |
| 9 | Revogar | ✅ | Diálogo "Revogar qa-runner?" com "Uma etapa rodando nessa máquina para em até 15 segundos."; o CLI ocioso saiu em menos de 15 s com "runner revogado no board; registre de novo"; lista "Nenhum runner registrado." e `GET /runners` `{"data":[]}`. `start` de novo com o mesmo token: código 1 e a mesma mensagem |
| 10 | Tela | ✅ | Ver "Evidências" e "Cross-check" |

Também medido: `config.json` em `600`, pasta em `700`, conteúdo `kbl_<runnerId>_***`; o mesmo código usado duas
vezes deu `RUNNER_CODE_INVALID` e código 1. No Firestore do emulador, o documento `runner` tem `tokenHash` (64
caracteres) e `tokenLast4`, sem o token; o `runnerRegistration` tem o hash do código como id (64 caracteres).
`GET /runners` devolve `id`, `name`, `online`, `lastSeenAt`, `createdAt`, `tokenLast4` e `currentRun`, sem
`tokenHash` nem `userId`. Os logs `logs/<runId>.jsonl` não contêm `kbr_` nem `kbl_` com o agente de teste.
`~/.agent-board-runner` do usuário não existia antes e não existe depois: todo o runner rodou com `HOME` temporário.
A tela mostrou "Ocupado com keyboard-shortcuts · analyze" durante um `run` e "Online" em seguida.

## Defeitos

### 1. 🟡 Depois do segundo Ctrl+C, o worktree que sobra quebra o próximo `run` do mesmo card

Repro:

1. Runner com um agente que demora a sair no `SIGTERM` (no teste, um wrapper com `process.on("SIGTERM", () => {})`).
2. Disparar uma etapa; quando o agente estiver rodando, Ctrl+C e, antes de 10 s, Ctrl+C de novo.
3. O runner sai com 130. O agente continua vivo, órfão, com o token do `run`; sobram `<home>/runs/<runId>/mcp.json`
   e `<home>/worktrees/<runId>`, este com a branch do card.
4. Subir o runner de novo e rodar a mesma etapa: o `run` termina na hora com `error · 0 turnos` e o card mostra
   "git worktree: fatal: 'feat/keyboard-shortcuts' is already used by worktree at '<caminho absoluto>'".

Isso se repete em todo disparo daquele card naquele runner até alguém rodar `git worktree remove` à mão. Um runner que
morre sem Ctrl+C (`kill -9`, máquina desligada) deixa o mesmo resto. Causas: o segundo `SIGINT` chama
`process.exit(130)` sem mandar `SIGKILL` ao grupo do agente; e `prepareWorktree` não trata um worktree antigo da
mesma branch. Correções possíveis para o `/develop`: no segundo Ctrl+C, `SIGKILL` no grupo do processo antes de sair;
e, antes do `git worktree add`, remover os worktrees em `<home>/worktrees/` que já estejam na branch do job.

### Observações (sem bloquear)

1. 🟢 Contagem de turnos depois do limite: com 300 linhas `assistant` de uma vez, o runner encerra o processo mas
   segue contando o que já estava no buffer e informa 289 turnos no `finish` e no card. Com o `claude` real os turnos
   chegam devagar e a diferença deve ser pequena. `supervisor.test.ts` só confere `turns > maxTurns`.
2. 🟢 O relatório de falha do defeito 1 leva o caminho absoluto da máquina (com o nome de usuário do sistema) para
   a linha do tempo do card, que todo membro do board lê.
3. 🟢 Ctrl+C com o runner ocioso imprime "encerrando: a execução atual vai ser reportada como interrompida", sem
   execução nenhuma.
4. 🟢 A guarda de entrada compara `import.meta.url` (caminho real) com `pathToFileURL(argv[1])`. Rodando o `cli.ts`
   por um caminho que passa por link simbólico (no macOS, `/tmp` ou `/var/folders`), o CLI sai 0 sem fazer nada. Pelo
   `pnpm --filter runner cli` não acontece, porque o `cwd` já é o caminho real.
5. 🟢 Copy fora do plano e do desenho: "Ocupado com keyboard-shortcuts · analyze" mostra o slug e a chave da etapa
   (o plano pedia a coluna; o desenho mostra o título do card); um runner Offline mostra "Sem etapa em andamento" no
   lugar de "Sem contato desde …".
6. 🟢 Em 390 px, os comandos ficam numa caixa com `overflow-x: auto` (620 px de conteúdo em 175 px) que não recebe
   foco pelo teclado. O botão Copiar cobre o uso; não consegui ler a área de transferência no browser headless.
7. 🟢 Ferramenta de teste: o `stub-agent.mjs` falha com "nothing to commit" quando roda de novo a mesma etapa numa
   branch que já tem o arquivo de prova dele. O fluxo 2 do plano ("responder redispara") esbarra nisso; para medir,
   apaguei a branch do card no bare antes do disparo.
8. Fora do escopo desta tarefa: na página do quadro a 1440 px, `document.documentElement.scrollWidth` é 1857, com
   barra de rolagem horizontal na página além da do contêiner das colunas. Os elementos que passam da borda são as
   `section` das colunas. Não conferi se já acontecia antes desta tarefa.

## Decisões de custo de teste

| Módulo | Decisão |
|--------|---------|
| `session.ts` (`readAllowList`, `buildAgentArgs`) | Caso novo na faixa barata; o argv real foi medido uma vez no e2e, não vira teste |
| `job.ts` (`isSafeJob`) | `job.test.ts` na faixa barata |
| `cli.ts` (`parseArgs`, entrada) | `cli.test.ts`: `parseArgs` puro e três `spawnSync` do `node` (cerca de 200 ms cada), sem rede nem servidor |
| Rotas `/runner/*` e `/runners*`, `runner.repository` | Nada novo: `runnerRoutes`, `runnersRoutes`, `runnerClaim` e `runnerClaim.emulator.test.ts` já cobrem códigos de erro, `claim` transacional e token; a passada e2e confirmou o resto com a API de pé |
| `supervisor.ts` no segundo Ctrl+C | Sem teste novo: é defeito de produção, volta ao `/develop` com o repro |

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Regressão das três correções do runner | Fechada: testes novos |
| CLI rodado pelo `node` em teste | Fechada: `cli.test.ts` |
| `pollForWork` com um job de verdade | Fechada por medição: runner real contra a API em 15 disparos; continua sem teste automatizado |
| Componentes `RunnerList`, `RunnerRegistrationPanel`, `BoardCredentialsClient` sem teste | Continua aberta; o comportamento foi percorrido no browser |
| `finishRun` concorrente com `revokeOwned` | Continua aberta; revoguei com o runner ocioso, não no meio de um `run` |
| Consulta do `claim` sem índice composto | Continua aberta; só se mede em produção |
| Caminho com o `claude` real | 🔒 não verificado: gasta a assinatura. Roteiro em `docs/PRE-PRODUCTION.md` |
| Aviso sem executor fora do emulador (503 e link para "Minhas credenciais") | 🔒 no browser: o ambiente é sempre emulador. Coberto por `cardRunsRoutes.test.ts` e `stageExecutorMode.test.ts` |

## Cross-check

- Papéis: `qa-owner` (dono do board) e `qa-other` (convidado como Operador). Personificação não percorrida; a
  recusa de escrita sob personificação está no teste de rota `runnersRoutes.test.ts`.
- Claro e escuro: "Minhas credenciais" vazia, com código, ocupada e com runner Offline nos dois temas; selo Offline no
  claro com texto `lab(2.75)` e borda `lab(90.95)`, no escuro texto `lab(98.26)` sobre fundo `lab(2.75)`.
- Mobile e desktop: 1440 px e 390 px. Em 390 px, `scrollWidth` 375 (com a barra vertical) na página de credenciais;
  o quadro lateral desce para baixo da lista.

## Ambiente do e2e

- Portas padrão e alternativas livres no início; o `quahog` não estava de pé.
- `pnpm test`, `test:emulator` e `pnpm e2e` subiram e derrubaram os próprios emuladores e servidores nas portas
  padrão.
- Passada manual: emulador com config temporária no scratchpad (auth 9098, Firestore 8085, Storage 9198, hub 4401,
  logging 4501, websocket 9151, sem UI), JDK 21, seed contra ele; `api` em 3012 e `app` em 3010 por `next dev`, com
  `FIREBASE_ADMIN_PROJECT_ID=""` (sem isso o `keys()` do `@repo/auth` herda o `NEXT_PUBLIC_FIREBASE_PROJECT_ID` e o
  boot falha pedindo a conta de serviço).
- No fim: fechei as duas sessões do `agent-browser`, parei cada runner por PID (SIGINT), matei o agente órfão do
  defeito 1 por PID, `api` e `app` por PID com os filhos e mandei SIGINT ao `firebase-tools`. As portas 3010, 3012,
  8085, 9098, 9198, 4401, 4501, 9151 e as padrão ficaram vazias. Apaguei `apps/api/AGENTS.md`, `apps/app/AGENTS.md`,
  os dois `firestore-debug.log`, `apps/e2e/playwright-report` e `apps/e2e/test-results`. O `HOME` temporário, os
  repositórios bare e o clone de trabalho ficavam no scratchpad da sessão e foram apagados.

## Evidências

Prints em `docs/features/local-runner/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-credenciais-vazio-escuro-1440.png`, `02-codigo-escuro-1440.png`, `03-dialogo-local-escuro-1440.png`,
`04-ocupado-escuro-1440.png`, `05-credenciais-claro-1440.png`, `06-credenciais-claro-390.png`,
`07-codigo-claro-390.png`, `08-codigo-escuro-390.png`, `09-no-runner-quadro-1440.png`,
`10-no-runner-claro-390.png`, `11-offline-claro-1440.png`, `12-offline-escuro-1440.png`.

Artefatos da ferramenta: o `drag` do `agent-browser` não abre o diálogo; o arrasto foi feito com `DragEvent`s
espaçados por 150 ms (o quadro guarda o card arrastado em estado do React e só aceita o `dragover` depois de
renderizar). O clique no botão "⋯" às vezes não abre o menu do antd; foco e Enter abrem sempre.

## Dados de QA

Tudo no emulador local, já descartado: contas GitHub `qa-owner` (`qa-local-runner-owner@example.com`) e `qa-other`
(`qa-local-runner-other@example.com`) criadas pelo popup do emulador; o board `agent-board-demo--sample-app`, os
três cards, os `run`s, os runners `qa-runner` e `qa-runner-b` e os eventos. Nenhuma conta em projeto Firebase real.
Nenhum token em arquivo versionado: tokens citados só como `kbl_***` e `kbr_***`.

## Rodada 2

Remedição dos nove itens de "Depois do /test, rodada 1" em `review/review.md`, com as mesmas regras: emulador, `api`
e `app` em portas próprias (8085/9098/9198, 3012, 3010), conta `qa-owner` no emulador, `HOME` temporário, repositório
bare `file://` e só o agente de teste. O `pnpm e2e` completo não foi refeito; vale o 31 de 31 da rodada 1.

| Comando | Resultado |
|---------|-----------|
| `pnpm turbo run test typecheck --filter=runner --filter=app` | 13 de 13 tasks: `runner` 9 arquivos e 46 testes; `app` 114 arquivos e 882 testes; typecheck sem erro |
| `biome check apps/runner` e os componentes do board | 77 arquivos, sem erro |

| # | Item | Veredito | O que foi medido |
|---|------|----------|------------------|
| 1 | Segundo Ctrl+C com agente que ignora `SIGTERM` | ✅ | Dois `SIGINT` com 1 s de intervalo: o runner saiu e nenhum processo do agente sobrou (`pgrep` vazio). Ficou `runs/<runId>`; o `start` seguinte imprimiu "limpou o resto da execução interrompida <runId>" e esvaziou `runs/` e `worktrees/`. Depois do prazo vencido, "Rodar de novo" no mesmo card rodou as quatro etapas até Concluído |
| 2 | `kill -9` no runner no meio de um `run` | ✅ | O agente ficou órfão (PPID 1) com `runner.pid`, `agent.pid`, `mcp.json` e o worktree. Religar o runner matou o agente, imprimiu "limpou o resto…" e esvaziou `runs/` e `worktrees/`. O disparo seguinte do mesmo card foi de Análise a Concluído, sem `already used by worktree` |
| 3 | Dois runners no mesmo `--home` | ✅ | Com o runner A rodando uma etapa travada, subir o B no mesmo home não apagou `runs/<runId>` nem `worktrees/<runId>` de A, e o agente de A seguiu vivo |
| 4 | `~` no relatório de falha | ✅ | Com uma pasta não vazia no lugar do clone, o card mostrou "git clone: fatal: destination path '~/.agent-board-runner/repos/agent-board-demo/sample-app' already exists and is not an empty directory." |
| 5 | Limite de turnos | ✅ | `STUB_TURNS=300`, limite 200: runner "turn_limit · 201 turnos" e card "terminou em 0 s · 201 turnos." com "Encerrada pelo limite de turnos da etapa." |
| 6 | Ctrl+C com o runner ocioso | ✅ | "encerrando; uma etapa em andamento vai ser reportada como interrompida (Ctrl+C de novo sai na hora)", e o processo sai |
| 7 | CLI por link simbólico | ✅ | `cli.ts deploy` por um link no scratchpad e por um link em `/tmp`: código 2 com o uso (antes saía 0 calado) |
| 8 | Tela "Minhas credenciais" | ✅ | Durante um `run`: "Ocupado com dark-theme · Análise" (conferido no escuro). Runner parado há mais de 60 s: selo Offline e "Sem contato desde 26 de nov. de 2026, 09:54", no escuro e no claro (texto `lab(2.75)`, borda `lab(90.95)`). Em 390 px, Tab vai de "Gerar código" para a caixa do comando de registro, Copiar, a caixa do `start` e Copiar; a caixa focada mostra o contorno de foco e seis setas para a direita rolam 200 dos 445 px. `scrollWidth` 375 |
| 9 | Fluxo 2 com o agente de teste | ✅ | Pergunta, "Responder e retomar a etapa Análise", o runner pegou de novo, o agente rodou sem "nothing to commit" (nenhuma ocorrência nos logs) e perguntou de novo, como manda `STUB_OUTCOME_ANALYZE=needs_input` |

Sobra da rodada 1 sem mudança: a observação 8 (barra horizontal na página do quadro a 1440 px) é de fora desta
tarefa e não foi remedida. Lacunas que continuam abertas: testes de componente de `RunnerList` e
`RunnerRegistrationPanel`, `finishRun` concorrente com `revokeOwned`, índice do `claim` em produção e o `claude` real
(🔒). O `SIGKILL` do segundo Ctrl+C segue sem teste automatizado; a prova é a medição acima.

Prints da rodada 2, descartados pelo `.gitignore`: `r2-01-ocupado-escuro-1440.png`,
`r2-02-codigo-foco-escuro-390.png`, `r2-03-offline-escuro-390.png`, `r2-04-offline-claro-390.png`,
`r2-05-offline-claro-1440.png`.

Ambiente da rodada 2: fechei o `agent-browser`, parei cada runner por PID (SIGINT; o do item 2 com `kill -9` de
propósito), matei `api` e `app` por PID com os filhos e mandei SIGINT ao `firebase-tools`. As portas próprias ficaram
vazias e nenhum processo apontava para o diretório temporário. Apaguei o `HOME` temporário, o bare, os links
simbólicos, `apps/api/AGENTS.md` e `apps/app/AGENTS.md`. `~/.agent-board-runner` não existe. Dados de QA: a mesma
conta `qa-owner` (`qa-local-runner-owner@example.com`), só no emulador, já descartada.

## Estado do pipeline

O `review` desta tarefa continua `in-progress` e nenhum commit das dez tarefas existe; o gate do `/review` segue
aberto à espera do plano de commits. Depois da rodada 2, o `test` fecha como `done`, sem defeito aberto desta tarefa.
O herdado do `orchestrator` passou e está registrado em `docs/features/orchestrator/test/report.md`; com ele, o
`test` da `agent-contract` também saiu de `blocked`.
