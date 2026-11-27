# Registro de auditoria do backlog

O `/spec --sync` registra aqui achados, gates, deriva e decisões estacionadas, no mesmo formato do core. A
fila, para decidir, fica no [`BACKLOG.md`](../BACKLOG.md).

## Última rodada

**2026-11-27, fim da rodada noturna**, na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` em `f60277a`,
81 commits à frente de `main` (`dac8f60`, merge da PR #11). Nada mergeou em `main` desde a auditoria anterior,
feita no começo da mesma noite. A branch não tem PR, push nem CI.

Verificadas 11 specs: 3 `approved`, 5 `proposed`, 2 `deferred`, 1 `superseded`. Transições aplicadas:
`spec-authoring`, `app-cleanup` e `pr-flow` `approved` → `in-progress`; `execution-credentials` e `cycle-runs`
`proposed` → `in-progress`. Nenhuma foi arquivada: o critério de entregue pede PR mergeada e CI verde, e as cinco
só existem na branch. Cada uma ganhou `feature: <slug>` e uma "Nota de andamento". `execution-credentials` e
`cycle-runs` rodaram sem aprovação formal, porque o usuário pediu para executar o máximo possível naquela noite;
aprovar as duas continua com ele.

Outras mudanças: `cloud-routines-runner` passou a registrar que o cadastro de URL e token por etapa já existe
(entregue pela `execution-credentials`) e ganhou `contends_on`; a `app-cleanup` trocou no `contends_on` o
`common-panel.ts`, que não existe mais, pelo `session.ts`; o próximo passo de `spec-discovery` e `cycle-schedule`
agora diz o que as bloqueia.

## Rodada noturna: implementadas, aguardando PR

Cada item do corte de MVP foi procurado no código da branch. Nenhum dos itens do corte das quatro specs completas
está ausente; a `cycle-runs` tem quatro itens deixados de propósito para a fatia 2.

| spec | itens do corte | evidência principal | `/test` |
|------|----------------|---------------------|---------|
| `spec-authoring` | 8 de 8 | `packages/kanban-contract/src/specAuthoring.ts`, `agentContract.ts:101` (`get_attachment`), `apps/api/app/(routes)/boards/[id]/drafts/route.ts`, `boards/[id]/attachments/route.ts`, `cards/[slug]/spec/approve/route.ts`, `cards/[slug]/spec/discard/route.ts`, `SpecDraftDetail.tsx`, `kit/commands/spec.md` | 18 ✅, 1 🔒 (PDF via MCP) |
| `app-cleanup` | 8 de 8 | `apps/app/app/[locale]/(authenticated)/(common)/(pages)/` só com `account` e `boards`; `apps/app/app/[locale]/(landing)/`; `apps/app/public/landing/`; `apps/api/app/(guards)/` só com `session.ts` e `board.ts`; nenhum `isImpersonating`, `requireAdminApi` ou `requireCommonPanelApi` em `apps/` e `packages/` | 20 ✅ |
| `pr-flow` | 4 de 4 | `apps/api/(shared)/lib/pull-request/pull-request-open.ts`, `pull-request-webhook.ts:74-77`, `:258`, `orchestrator.ts:235` (`onPrComment`), `CardPullRequest.tsx` | aprovado na rodada 2; GitHub real 🔒 |
| `execution-credentials` | 5 de 5 | `apps/api/(shared)/lib/credentials/secret-box.ts`, `credentials-key.ts`, `boards/[id]/credentials/route.ts`, `credentials/scheduled-tasks/[stageKey]/route.ts`, `packages/kanban-contract/src/run.ts:21` (`no_credential`), `roles.ts:48` | 17 ✅ |
| `cycle-runs` (fatia 1) | 5 de 9 | `packages/kanban-contract/src/cycle.ts`, `agentContract.ts:80` (`decisions`), `AGENT_ASK_IN_CYCLE` em `agent-tools.ts`, `apps/runner/src/session.ts:24`, `boards/[id]/cycles/**`, `CycleProgressTable.tsx`, `CycleDecisions.tsx`, `StopCycleDialog.tsx` | 17 ✅, 1 🟡 |

Itens da `cycle-runs` que faltam (fatia 2): pausar depois da etapa atual (só parar existe), "Mudar" uma decisão,
pendências de infraestrutura na tela do ciclo e o aviso de spec dependente. `cycle.ts` não tem estado de pausa.

Cruzamento com o pipeline: os cinco `docs/features/<slug>/STATE.md` trazem `spec: <id>` e `analyze`, `develop`,
`review` e `test` em `done`. O campo `branch` está `-` em quatro deles e com a branch da noite na
`spec-authoring`. O `/test` da `cycle-runs` apontou mensagens de commit deslocadas em um; a branch atual já tem os
commits refeitos (`aef2c4e` leva o domínio do ciclo no contrato, `eb1b3e8` é o `docs(board)`).

## Entregas conferidas da fase 1

Cada item do corte de MVP das dez specs foi procurado no código. Nenhum item está ausente. Os itens que
ficaram diferentes do texto estão em "Deriva"; nenhum deles deixa de entregar o que o item pedia.

| spec | itens do corte | evidência principal |
|------|----------------|---------------------|
| `github-app-integration` | 6 de 6 | `apps/api/(shared)/lib/github/github-rest-client.ts:242-319`, `github-installation-tokens.ts:13-39`, `apps/api/app/(routes)/github/webhook/route.ts:44-78` |
| `github-sign-in` | 5 de 5 | `apps/api/app/(routes)/auth/sign-in/github/route.ts:63-77`, `apps/api/(shared)/lib/user-merge.ts:111-134`, `packages/auth/sign-in-method.ts:7-20`, `SignInForm.tsx:99-109` |
| `board-import` | 5 de 5 | `apps/api/(shared)/lib/board-import.ts:136-212`, `packages/kanban-contract/src/boardConfigIssues.ts:27-94`, `apps/api/app/(routes)/boards/[id]/reload/route.ts:36-116` |
| `board-members` | 6 de 6 | `apps/api/app/(guards)/board.ts:25-55`, `apps/api/(shared)/lib/board-access.ts:139-214`, `packages/kanban-contract/src/roles.ts:65-106`, `boards/[id]/members/**` |
| `card-backlog` | 7 de 7 | `apps/api/(shared)/lib/card-sync.ts:97-337`, `boards/[id]/cards/order/route.ts:13-40`, `boards/[id]/cards/[slug]/spec/route.ts:38-47`, `BoardColumns.tsx:250-324` |
| `theme-toggle` | 3 de 3 | `packages/design-system/components/ui/mode-toggle.tsx:23-34`, `apps/app/shared/components/ui/Navbar.tsx:43`, `apps/app/__tests__/boardThemeTokens.test.ts:31` |
| `card-timeline` | 6 de 6 | `packages/kanban-contract/src/cardEvent.ts:5-116`, `boards/[id]/cards/[slug]/answers/route.ts:26-50`, `CardQuestions.tsx:74-135`, `CardArtifacts.tsx:52-83` |
| `orchestrator` | 8 de 8 | `apps/api/(shared)/lib/orchestrator/decide.ts:44-310`, `orchestrator.ts:86-332`, `run.repository.ts:145-225`, `CardRunControls.tsx:35-64` |
| `agent-contract` | 6 de 6 | `apps/api/app/(routes)/agent/tools/[tool]/route.ts:9`, `apps/api/app/(routes)/mcp/route.ts:11`, `agent-card-view.ts:83-128`, `agent-tools.ts:99-136`, `apps/api/__tests__/agentToolsRoutes.test.ts:280-304` |
| `local-runner` | 5 de 5 | `apps/runner/src/cli.ts:141-254`, `poll.ts:23-59`, `run-job.ts:92-348`, `supervisor.ts:116-140`, `apps/api/(shared)/repositories/runner.repository.ts:255-278` |

Cruzamento com o pipeline: os dez `docs/features/<slug>/STATE.md` trazem `spec: <id>` e `test: done`; todos
ainda mostram `review: in-progress` porque o `/cycle` não commita, e os commits só entraram depois, na PR #8
(96 commits, um `docs(features): <slug>` por feature). Ver A12.

As 2 `deferred` (`clickup-import`, `github-actions-runner`) não foram entregues por tabela. A `superseded`
(`schedules-and-budgets`) aponta para `cycle-schedule`, que existe e está `proposed`. `fork-cleanup`
(arquivada) sem regressão.


## Gates

Gates locais não rodados nesta auditoria. Os números da rodada noturna vêm do `/test` de cada feature, no working
tree da branch, e não do CI.

| Gate | Resultado |
|------|-----------|
| CI da branch da noite | Nunca rodou: sem push nem PR. |
| `/test` da `cycle-runs` (último da noite) | `pnpm test` 14/14 tarefas, `pnpm e2e` 20/20. |
| `/test` da `execution-credentials` | `pnpm test` duas vezes verde (api 1150, app 701, emulador 135), `pnpm e2e` 20/20. |
| `/test` da `app-cleanup` | `pnpm test` 14/14, `pnpm e2e` 20/20, `next build` de app e api verdes. |
| CI de `main` em `dac8f60` (run 45892697078) | Os seis jobs verdes. |
| CI de `main` em `a19ece1` e `a80dd70` | Vermelho em `apps/e2e/tests/focusNotObscured.spec.ts:188`. O arquivo saiu na `app-cleanup` (A6). |

## Lotes paralelos

**Nenhuma spec é elegível hoje.** As três `proposed` dependem de spec que só existe na branch da noite, e spec
implementada mas não mergeada conta como `in-progress`: quem depender dela ramificaria de uma base sem o código.

| spec | `depends_on` não satisfeito |
|------|-----------------------------|
| `cloud-routines-runner` | `execution-credentials` |
| `spec-discovery` | `spec-authoring` |
| `cycle-schedule` | `cycle-runs` (fatia 2 pendente) e `execution-credentials` |

Projeção para depois do merge da PR da noite, pela ordem recomendada e lendo o `contends_on` do disco:

| Lote | Specs | O que cada uma toca (`contends_on`) | Por que não colidem |
|------|-------|-------------------------------------|---------------------|
| 1 | `cloud-routines-runner`, `spec-discovery` | `boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts` · `packages/kanban-contract/src/agentContract.ts` | Conjuntos disjuntos |

`cycle-schedule` fica fora do lote 1 por dependência, não por colisão: precisa da `cycle-runs` inteira. A fatia 2
da `cycle-runs` é continuação de spec `in-progress` e não entra no cálculo; se rodar em paralelo, colide com a
`spec-discovery` em `packages/kanban-contract/src/agentContract.ts`, que as duas declaram. Rodar a fatia 2 junto com
a `cloud-routines-runner` não colide no `contends_on`.

Nota de processo: só um workspace roda a auditoria (`--audit-only`); os demais usam `--no-audit`. Sem isso, o
`BACKLOG.md` é reescrito por mais de um agente ao mesmo tempo.

Ressalva: `contends_on` disjunto reduz conflito, não elimina. Na noite, as cinco specs mexeram em
`packages/internationalization/translations/packages/shared/utils.ts` (os `apiErrors`), arquivo que nenhuma
declarou. Rodaram em sequência, então não houve conflito.

## Pré-condições depois do merge

- **Infra em produção.** Publicar `firestore.indexes.json` (item 10 do `docs/PRE-PRODUCTION.md`, da
  `app-cleanup`); definir `CREDENTIALS_ENCRYPTION_KEY` na API (sem ela o cadastro da nuvem fica desligado e o resto
  funciona); conferir `Pull requests: Read and write` no GitHub App e assinar os eventos `Pull request`,
  `Pull request review`, `Issue comment` e `Check suite` (item 5). Os três já estão no `PRE-PRODUCTION.md`.
- **Repositórios importados.** Precisam da seção nova do kit (§2.1 da regra do modo board, decisões dentro do
  ciclo). Sem ela, a API recusa o `ask` e a spec sai do ciclo.
- **`cloud-routines-runner`.** O cadastro por etapa já existe; o corte que resta é o adapter de disparo, o guia de
  criação da tarefa e a linha para a etapa `spec`.

## Dependências

| spec | `depends_on` | situação |
|------|--------------|----------|
| `spec-authoring` | `orchestrator`, `agent-contract`, `card-timeline` | satisfeito; spec `in-progress` |
| `app-cleanup` | — | satisfeito; spec `in-progress` |
| `pr-flow` | `github-app-integration`, `orchestrator` | satisfeito; spec `in-progress` |
| `execution-credentials` | `board-members`, `local-runner` | satisfeito; spec `in-progress` |
| `cycle-runs` | `orchestrator`, `agent-contract`, `pr-flow` | `pr-flow` só na branch; spec `in-progress` |
| `cloud-routines-runner` | `agent-contract`, `execution-credentials` | espera o merge da `execution-credentials` |
| `spec-discovery` | `spec-authoring` | espera o merge da `spec-authoring` |
| `cycle-schedule` | `cycle-runs`, `execution-credentials` | espera as duas |

## Deriva

### Rodada noturna

Detalhe na "Nota de andamento" de cada spec e nas "Perguntas em aberto" de cada `analyze/plan.md`.

| spec | especificado | implementado | leitura |
|------|--------------|--------------|---------|
| `spec-authoring` | Anexos como dados do card | Ferramenta `get_attachment`; imagem, PDF ou texto até 3 MB; slug gerado pela API | Spec imprecisa |
| `spec-authoring` | Perguntas da escrita no bloco do card | `needs_rework` na etapa `spec` deixa o card `failed` | Decisão de implementação, coerente com "Rodar de novo" |
| `app-cleanup` | Guard de sessão deixa de ler `x-role` | Guard novo `session.ts` (`requireSessionApi`); `common-panel.ts` saiu | Spec imprecisa; `contends_on` corrigido |
| `pr-flow` | `/mediate` a cada comentário | Com limite por hora | Implementação acrescentou limite; aceitável |
| `pr-flow` | Linha do tempo traduzida | Textos em pt-br gravados pela API (decisão 5 do plano) | Implementação desviou, com motivo registrado no `review.md` |
| `execution-credentials` | `run` registra a credencial usada | Registra `triggeredBy`, tipo de executor e `runnerId`; o id da credencial da nuvem fica para o adapter | Spec imprecisa |
| `execution-credentials` | Sem nenhuma credencial, recusa | `no_runner` quando a etapa aceita runner local, `no_credential` quando não aceita | Implementação refinou o texto; melhor que o especificado |
| `cloud-routines-runner` | Pergunta aberta recomendava uma tarefa única por repositório | `execution-credentials` gravou uma credencial por etapa | Recomendação da spec atualizada para "por etapa" |
| `cycle-runs` | Selo do ciclo nos cards do ciclo | Selo só aparece quando a etapa do card dispara | Implementação desviou (A16) |
| `cycle-runs` | Ciclo para na falha | Com duas specs, o próximo ciclo da fila começa antes de a spec viva terminar | Decisão Q6 do plano; com o usuário |

### Fase 1

Cada spec arquivada ganhou uma seção "Nota de entrega" com o detalhe. Resumo:

| spec | especificado | implementado | leitura |
|------|--------------|--------------|---------|
| `github-app-integration` | Webhook registra o evento e invalida o cache | Só log; cache de permissão em memória do processo | Implementação desviou (A7) |
| `github-sign-in` | Provedor em `packages/auth` | Em `apps/app/shared/lib/githubSignInApi.ts`; contrato ganhou `identity.ts` | Spec imprecisa |
| `board-import` | Lê o `board.yml` da branch base; contrato sem impacto | Lê do branch padrão; parse, issues e diff no contrato; um board por repositório | Spec imprecisa |
| `board-members` | Só o dono dispara no MVP | `operator` já dispara (`roles.ts:47`) | Implementação desviou (A8) |
| `card-backlog` | Mover sem disparo; card com selo e branch | Soltar numa etapa dispara; Tarefas sem selo nem branch | O primeiro é esperado com o orquestrador; o segundo é corte silencioso (A9) |
| `theme-toggle` | Botão no cabeçalho do board | Na Navbar do painel | Spec imprecisa; a `app-cleanup` cria o cabeçalho |
| `card-timeline` | Coleção `events` | Coleção de topo `cardEvent`, `pendingAsk` no card, edição de comentário | Spec imprecisa |
| `orchestrator` | WIP no `board.yml`; fila com cron ou Cloud Functions | `board.stageSettings`; `tick` nas leituras | Pergunta em aberto resolvida no `/analyze` |
| `agent-contract` | Token do orquestrador, revogado no fim | Token do claim do runner; aceito até o prazo, só repete `complete_stage` | Mesmo efeito; código morto (A10) |
| `local-runner` | `packages/runner` com Agent SDK | `apps/runner` com `claude -p` | Implementação desviou; docs ainda dizem Agent SDK (A11) |

## Achados e pendências

- **A1 — resolvido.** O login por e-mail e senha ficou só no emulador; seed, E2E e `/test` seguem funcionando.
- **A2 — CI vermelho nos PRs do Dependabot.** #3, #4 (TypeScript 7.0.2), #6 e #7 continuam abertos. Causa não
  medida. Sem dono. A `app-cleanup` tirou dependências (`zustand`), então os PRs podem precisar de rebase.
- **A3 — `fork-cleanup` não tem `STATE.md`.** Entregue fora do pipeline, por decisão registrada na spec.
- **A4 — Credenciais de produção.** GitHub App e OAuth App no Firebase seguem no `docs/PRE-PRODUCTION.md`; os
  sinais de pronto contra repositório real continuam sem medida.
- **A5 — resolvido.** O parser `yaml` entrou como dependência de `@repo/kanban-contract`.
- **A6 — resolvido na branch, aguardando merge.** O `focusNotObscured.spec.ts`, que oscilava em `main`, saiu com a
  `app-cleanup`.
- **A7 — Cache de permissão em memória.** `github-permission-cache.ts:54`. Em serverless, o webhook `member` só
  invalida a instância que o recebeu; as outras esperam o TTL de 5 minutos. Aceitável no MVP.
- **A8 — absorvido pela `execution-credentials`.** O corte dela diz "`operator` passa a disparar", o que já era o
  código (`roles.ts:48`). Aprovar a spec fecha a decisão; o roadmap coloca `operator` na fase 2, como a spec.
- **A9 — Cards de Tarefas sem selo nem branch.** `BoardCardItem.tsx`. Pequeno; sem dono. Ver também A16.
- **A10 — Código morto.** `issueRunToken` (`apps/api/(shared)/lib/agent-contract/run-token.ts:51`) e
  `runRepository.setToken` (`run.repository.ts:173`) só aparecem em testes; `isEmptyStagesDiff`
  (`packages/kanban-contract/src/boardConfigDiff.ts:43`) também. Herdados do core: `reloadCurrentUser`
  (`packages/auth/client.ts:208`) e `apps/app/shared/hooks/useHealthCheck.ts`, sem chamador. Somam-se as props
  `canRevoke` e `canGenerate` de `RunnerList` e `RunnerRegistrationPanel`, que a `app-cleanup` deixou sem função.
- **A11 — Doc diverge do código.** `docs/board/DECISIONS.md:139`, `docs/board/README.md:37` e a tabela da fase 1
  do `ROADMAP.md` ainda dizem que o runner usa o Agent SDK; o código chama `claude -p` (`apps/runner/src/session.ts`).
- **A12 — `STATE.md` desatualizados.** As dez features da fase 1 mostram `review: in-progress`, mas os commits
  estão em `main` desde a PR #8. O ajuste da etapa é do pipeline.
- **A13 — G2 não medido.** As dez specs da fase 1 e as cinco da noite entraram pelo `/cycle` no terminal, não por
  cards do board. O G2 pede três features de Análise a Concluído no board. Com `pr-flow` e `cycle-runs` mergeadas,
  o board passa a ter o que falta para medir.
- **A14 — Branch da noite sem PR e fora do padrão.** `guilhermebittelbrunn/chore-overnight-cycle-specs`, 81
  commits, não bate com `<project>/<type>/<title>`; o usuário pediu para manter tudo nela durante a noite. O CI
  nunca rodou sobre esses commits. Os cinco `review.md` recomendam abrir a PR a partir de uma branch no padrão.
- **A15 — Infra pendente das specs da noite.** `firestore.indexes.json` a publicar (`app-cleanup`), permissão
  `Pull requests: Read and write` e quatro eventos no GitHub App (`pr-flow`), `CREDENTIALS_ENCRYPTION_KEY`
  (`execution-credentials`). Tudo registrado no `docs/PRE-PRODUCTION.md`, itens 5 e 10 e "Chave das credenciais da
  nuvem".
- **A16 — Card pendente de ciclo sem selo.** `BoardCardItem.tsx:88` só mostra o selo quando `card.cycleId` existe,
  e o `cycleId` entra no card quando a etapa dispara. Com `concurrency: 1`, a segunda spec fica em Tarefas sem
  indicação, e ninguém mediu o que o ciclo faz se a pessoa arrastar esse card para fora. 🟡 do `/test` da
  `cycle-runs`.
- **A17 — Contraste do ponto de checks no escuro.** O ponto verde de CI passando mede 2,82:1 no tema escuro. 🟢
  aceito no `/test` da `pr-flow`, sem correção.
- **A18 — `DELETE` de credencial exige `trigger`.** `credentials/scheduled-tasks/[stageKey]/route.ts:68`. Quem
  cadastrou como `operator` e virou `viewer` vê a própria linha e não consegue apagar o segredo. Decisão de produto,
  com o usuário.
- **A19 — Ajustes de produto da `spec-authoring` não feitos.** O assistente de criação do quadro não mostra
  Rascunhos, clicar fora do diálogo Nova spec descarta o texto e arquivos pequenos aparecem como "1 kB". O
  `review.md` deixou para decisão de produto.
- **A20 — Pendências 🔒 que só um ambiente real mede.** PDF lido pelo modelo via MCP (`spec-authoring`); PR real
  com autor `[bot]`, 403 e 422 do GitHub e entrega real dos eventos (`pr-flow`); oferta do Chrome para salvar o
  token (`execution-credentials`); tick no `deadline` com runner real (`cycle-runs`).
- **A21 — Atividade do ciclo com crases literais.** `CycleActivity` mostra a primeira linha do markdown como texto
  ("Executor de teste: \`/develop dark-theme\` iniciado…"). 🟢 do `/test` da `cycle-runs`.

## Entregues

### Fase 1 — 2026-11-27

`github-app-integration`, `github-sign-in`, `board-import`, `board-members`, `card-backlog`, `theme-toggle`,
`card-timeline`, `orchestrator`, `agent-contract` e `local-runner`.

- **Como:** `/cycle` noturno em 2026-11-25 e 2026-11-26, com `analyze`, `develop`, `review` e `test` em
  `docs/features/<slug>/`; commits na PR #8 (`guilhermebittelbrunn/chore-cycle-three-tasks`, merge `a19ece1` em
  2026-11-26). Specs arquivadas em `docs/features/<slug>/spec.md`.
- **Conferido:** corte de MVP item a item (tabela de "Entregas conferidas"); CI da PR #8 verde; `test` de cada
  feature com `pnpm e2e` 31/31 na última passada.
- **Deriva:** tabela "Deriva" acima e a "Nota de entrega" de cada spec.

### `fork-cleanup` — 2026-11-25

- **Como:** direto na PR #1 (`chore/bootstrap-agent-board`), sem as etapas do pipeline; spec arquivada em
  [`docs/features/fork-cleanup/spec.md`](../../docs/features/fork-cleanup/spec.md).
- **Conferido:** typecheck dos 12 workspaces, `pnpm check` e Vitest de todos os workspaces, verdes.
- **Deriva:** organizações e trilha de auditoria saíram, embora a spec as deixasse fora do corte; `entity` e
  upload passaram a ser escopados por pessoa (`userId`). O resto do boilerplate (admin, notificações, `entity`)
  sai na `app-cleanup`.

## Feito na criação do repositório (fora do backlog)

- `packages/kanban-contract`: schema do `board.yml`, papéis × permissão do GitHub, estados e transições do
  card, payloads das ferramentas dos agentes, com testes.
- `kit/` e a regra `.claude/rules/board-mode.md`, aplicados neste repositório e prontos para o
  next-boilerplate.
- Resíduos de CLI do core (`package.json`, `tsup.config.ts`, `.autorc`, `CHANGELOG.md`, `.firebaserc`) e
  remoto `upstream` apontando para o next-boilerplate.
