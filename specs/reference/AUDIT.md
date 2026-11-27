# Registro de auditoria do backlog

O `/spec --sync` registra aqui achados, gates, deriva e decisões estacionadas, no mesmo formato do core. A
fila, para decidir, fica no [`BACKLOG.md`](../BACKLOG.md).

## Última rodada

**2026-11-27**, na branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, sobre `main` em `dac8f60` (merge
da PR #11). Desde a auditoria anterior (2026-11-25, sobre `53fea15`) mergearam a PR #8 (`a19ece1`, as dez specs
da fase 1), a #9 (deploy em produção registrado no `PRE-PRODUCTION.md`), a #10 (Vercel sem build de preview) e a
#11 (`pr-flow` aprovada).

Verificadas 19 specs: 10 `in-progress`, 1 `approved`, 5 `proposed`, 2 `deferred`, 1 `superseded`. Transições
aplicadas: 10 `in-progress` → `done`, todas arquivadas; `spec-authoring` `proposed` → `approved` por pedido
direto do usuário. Spec nova: `app-cleanup`, `approved` por pedido direto do usuário. Links corrigidos:
`docs/board/ROADMAP.md` (10).

## Entregas conferidas

Cada item do corte de MVP das dez specs foi procurado no código. Nenhum item está ausente. Os itens que
ficaram diferentes do texto estão em "Deriva"; nenhum deles deixa de entregar o que o item pedia.

| spec | itens do corte | evidência principal |
|------|----------------|---------------------|
| `github-app-integration` | 6 de 6 | `apps/api/(shared)/lib/github/github-rest-client.ts:242-319`, `github-installation-tokens.ts:13-39`, `apps/api/app/(routes)/github/webhook/route.ts:44-78` |
| `github-sign-in` | 5 de 5 | `apps/api/app/(routes)/auth/sign-in/github/route.ts:63-77`, `apps/api/(shared)/lib/user-merge.ts:111-134`, `packages/auth/sign-in-method.ts:7-20`, `SignInForm.tsx:99-109` |
| `board-import` | 5 de 5 | `apps/api/(shared)/lib/board-import.ts:136-212`, `packages/kanban-contract/src/boardConfigIssues.ts:27-94`, `apps/api/app/(routes)/boards/[id]/reload/route.ts:36-116` |
| `board-members` | 6 de 6 | `apps/api/app/(guards)/board.ts:25-55`, `apps/api/(shared)/lib/board-access.ts:139-214`, `packages/kanban-contract/src/roles.ts:65-106`, `boards/[id]/members/**` |
| `card-backlog` | 7 de 7 | `apps/api/(shared)/lib/card-sync.ts:97-337`, `boards/[id]/cards/order/route.ts:13-40`, `boards/[id]/cards/[slug]/spec/route.ts:38-47`, `BoardColumns.tsx:250-324` |
| `theme-toggle` | 3 de 3 | `packages/design-system/components/ui/mode-toggle.tsx:23-34`, `apps/app/shared/components/ui/Navbar.tsx:29`, `apps/app/__tests__/boardThemeTokens.test.ts:31` |
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

Gates locais não rodados nesta rodada; a medição vem do CI.

| Gate | Resultado |
|------|-----------|
| CI da PR #8 | `verify`, `e2e`, `coverage`, `audit`, `secrets` e `changes` verdes. |
| CI de `main` no push do merge `a19ece1` (run 45865765915) | Vermelho: `e2e` falhou em `apps/e2e/tests/focusNotObscured.spec.ts:188` (timeout de 120 s no `locator.click`). Os outros cinco jobs verdes. |
| CI de `main` em `a80dd70` (run 45888331957) | Vermelho no mesmo teste. |
| CI de `main` em `dac8f60` (run 45892697078) | Os seis jobs verdes. |

O teste que oscila mede o formulário de edição de `entity`, que a `app-cleanup` remove (achado A6).

## Lotes paralelos

Elegíveis: `approved`/`proposed` com `depends_on` entregue. Passam quatro specs: `spec-authoring`, `app-cleanup`,
`pr-flow` e `execution-credentials`. As outras quatro dependem de spec ainda não entregue (`cycle-runs` de
`pr-flow`; `cloud-routines-runner` de `execution-credentials`; `spec-discovery` de `spec-authoring`;
`cycle-schedule` de `cycle-runs` e `execution-credentials`).

| Lote | Specs | O que cada uma toca (`contends_on`) | Por que não colidem |
|------|-------|-------------------------------------|---------------------|
| 1 | `spec-authoring`, `app-cleanup`, `pr-flow` | `boardConfig.ts` · layout comum do app, `common-panel.ts` e `Navbar.tsx` · nenhum | Conjuntos disjuntos |
| 2 | `execution-credentials` | nenhum | Sozinha |

`execution-credentials` ficou fora do lote 1 só pelo teto de 3, sem colisão.

Ressalva forte para esta rodada: a `app-cleanup` declara três arquivos, mas tira o `isImpersonating` de 12
arquivos de `boards/` no app e de 6 da API, e mexe nos códigos de erro de
`packages/internationalization/translations/packages/shared/utils.ts`, que a `spec-authoring` e a `pr-flow`
também vão alterar. O lote disjunto em `contends_on` não reflete o risco real. O usuário definiu execução em
sequência (1º `spec-authoring`, 2º `app-cleanup`, 3º `pr-flow`), e é o que se recomenda: a `app-cleanup` roda
sozinha.

Nota de processo: só um workspace roda a auditoria (`--audit-only`); os demais usam `--no-audit`. Sem isso, o
`BACKLOG.md` é reescrito por mais de um agente ao mesmo tempo.

Ressalva geral: `contends_on` disjunto reduz conflito, não elimina.

## Pré-condições das specs aprovadas

- **`spec-authoring`.** Dependências (`orchestrator`, `agent-contract`, `card-timeline`) entregues em `main`.
  Roda contra o emulador sem infra externa. O upload existente (`apps/api/app/(routes)/files/route.ts`) aceita só
  imagem JPEG, PNG ou WebP até 4 MiB, então PDF e texto pedem ampliar a validação. Em produção, anexos exigem o
  Cloud Storage no plano Blaze (item 12 do `docs/PRE-PRODUCTION.md`); sem ele, a rota responde
  `503 STORAGE_NOT_CONFIGURED`, e o pedido em texto precisa funcionar sozinho. O `kit/commands/` não tem
  `spec.md` e o `/spec` deste repo não tem modo board: os dois estão dentro do corte.
- **`app-cleanup`.** Sem dependência. Roda inteira no emulador. Mantém upload e Storage por causa da
  `spec-authoring`.
- **`pr-flow`.** Dependências (`github-app-integration`, `orchestrator`) entregues. Abrir PR de verdade exige o
  GitHub App criado com permissão de escrita em pull requests; no emulador vale o cliente GitHub falso.

## Dependências

| spec | `depends_on` | situação |
|------|--------------|----------|
| `spec-authoring` | `orchestrator`, `agent-contract`, `card-timeline` | satisfeito |
| `app-cleanup` | — | satisfeito |
| `pr-flow` | `github-app-integration`, `orchestrator` | satisfeito |
| `execution-credentials` | `board-members`, `local-runner` | satisfeito |
| `cycle-runs` | `orchestrator`, `agent-contract`, `pr-flow` | espera `pr-flow` |
| `cloud-routines-runner` | `agent-contract`, `execution-credentials` | espera `execution-credentials` |
| `spec-discovery` | `spec-authoring` | espera `spec-authoring` |
| `cycle-schedule` | `cycle-runs`, `execution-credentials` | espera as duas |

## Deriva

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
- **A2 — CI vermelho nos PRs do Dependabot.** #3 (`verify`, `e2e`), #4 (`verify`, TypeScript 7.0.2), #6
  (`verify`, `coverage`) e #7 (`verify`) continuam abertos e vermelhos. Causa não medida. Sem dono.
- **A3 — `fork-cleanup` não tem `STATE.md`.** Entregue fora do pipeline, por decisão registrada na spec.
- **A4 — Credenciais de produção.** GitHub App e OAuth App no Firebase seguem no `docs/PRE-PRODUCTION.md`; os
  sinais de pronto contra repositório real continuam sem medida.
- **A5 — resolvido.** O parser `yaml` entrou como dependência de `@repo/kanban-contract`.
- **A6 — E2E intermitente em `main`.** `focusNotObscured.spec.ts:188` falhou nos pushes de `a19ece1` e `a80dd70`
  e passou em `dac8f60`. Mede o formulário de `entity`; sai com a `app-cleanup`.
- **A7 — Cache de permissão em memória.** `github-permission-cache.ts:54`. Em serverless, o webhook `member` só
  invalida a instância que o recebeu; as outras esperam o TTL de 5 minutos. Aceitável no MVP; vira risco com
  mais de uma pessoa no board.
- **A8 — `operator` dispara antes da fase 2.** `roles.ts:47-49` e o guard `"trigger"` liberam disparo a partir de
  `operator`; o `ROADMAP.md` diz que, antes da fase 2, só o dono dispara. Decisão do usuário.
- **A9 — Cards de Tarefas sem selo nem branch.** `BoardCardItem.tsx:81`, `:97`. Pequeno; sem dono.
- **A10 — Código morto.** `issueRunToken` (`apps/api/(shared)/lib/agent-contract/run-token.ts:51`) e
  `runRepository.setToken` (`run.repository.ts:101`) só aparecem em testes; `isEmptyStagesDiff`
  (`packages/kanban-contract/src/boardConfigDiff.ts:32`) também. Herdados do core: `reloadCurrentUser`
  (`packages/auth/client.ts:208`) e `apps/app/shared/hooks/useHealthCheck.ts`, sem chamador.
- **A11 — Doc diverge do código.** `docs/board/DECISIONS.md:139`, `docs/board/README.md:37` e a tabela da fase 1
  do `ROADMAP.md` dizem que o runner usa o Agent SDK; o código chama `claude -p` (`apps/runner/src/session.ts`).
- **A12 — `STATE.md` desatualizados.** As dez features da fase 1 mostram `review: in-progress`, mas os commits
  estão em `main` desde a PR #8. A auditoria só acrescentaria `spec:`, que já existe; o ajuste da etapa é do
  pipeline.
- **A13 — G2 não medido.** As dez specs entraram pelo `/cycle` no terminal, não por cards do board. O G2 pede
  três features de Análise a Concluído **no board**. Continua aberto.

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
