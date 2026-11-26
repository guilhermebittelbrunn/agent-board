# Registro de auditoria do backlog

O `/spec --sync` registra aqui achados, gates, deriva e decisões estacionadas, no mesmo formato do core. A
fila, para decidir, fica no [`BACKLOG.md`](../BACKLOG.md).

## Última rodada

**2026-11-25**, na branch `guilhermebittelbrunn/chore-cycle-three-tasks`, sobre `main` em `53fea15` (merge da
PR #1). Nenhuma PR de feature mergeou depois da semeadura; as PRs abertas são todas do Dependabot.

Verificadas 20 specs (17 `proposed`, 2 `deferred`, 1 `superseded`) e a arquivada `fork-cleanup`. Transições
aplicadas: nenhuma. Correções de referência: 2 specs. Recomendação de ordem: 1 troca.

## Entregas conferidas

Nenhum item do corte de MVP das 17 specs `proposed` existe no código. Conferido por camada:

| Onde se procurou | Resultado |
|------------------|-----------|
| `apps/api/app/(routes)/` | `account`, `auth`, `entities`, `files`, `health`, `notifications`, `users`. Nenhuma rota de board, card, membro, execução ou webhook. |
| `apps/app/app/[locale]/(authenticated)/(common)/(pages)/` | `account`, `entities`, `playground`. Nenhuma tela de board. |
| `packages/` | Não há `packages/runner`. `packages/kanban-contract` tem só o contrato (`agentContract.ts`, `boardConfig.ts`, `cardState.ts`, `roles.ts`), com 3 arquivos de teste. |
| `git grep` por `GithubAuthProvider`, `githubId`, `octokit`, `GITHUB_APP`, `x-hub-signature` em `apps/` e `packages/` | Zero ocorrências. |
| `docs/features/*/STATE.md` | Nenhum. A única pasta, `fork-cleanup`, tem só a spec (entregue fora do pipeline). |

As 2 `deferred` (`clickup-import`, `github-actions-runner`) também não foram entregues por tabela. A
`superseded` (`schedules-and-budgets`) aponta para `cycle-schedule`, que existe e está `proposed`.

`fork-cleanup` (arquivada) sem regressão: nenhum arquivo rastreado de organização, cobrança ou trilha de
auditoria, e nenhuma dependência `resend` ou `stripe` em `package.json`.

## Gates

Medidos nesta rodada com `--force` (sem cache do turbo), Node 22.13.0, pnpm 10.19.0.

| Gate | Resultado |
|------|-----------|
| `pnpm turbo run lint --force` | Biome: 651 arquivos, nenhuma correção. |
| `pnpm turbo run typecheck --force` | 12 de 12 workspaces verdes. |
| `pnpm turbo run test --force` | 211 arquivos e 2.077 testes verdes: `api` 811, `app` 662, `@repo/auth` 192, `@repo/design-system` 140, `@repo/security` 65, `@repo/shared` 51, `@repo/analytics` 41, `@repo/internationalization` 35, `@repo/next-config` 34, `@repo/kanban-contract` 21, `e2e` (Vitest) 16, `@repo/sdk` 9. |
| `test:emulator` | Não medido aqui: a máquina tem JDK 17 e os emuladores exigem 21. |
| CI em `main` no SHA do merge (`53fea15`) | Run 45697478049 (`push`) verde. Na PR #1, os jobs `verify`, `e2e`, `coverage`, `audit`, `secrets` e `changes` passaram. |

## Lotes paralelos

Elegíveis: `proposed`/`approved` com `depends_on` entregue. Só duas specs passam o filtro: as outras 15
dependem de alguma spec não entregue.

| Lote | Specs | O que cada uma toca | Por que não colidem |
|------|-------|---------------------|---------------------|
| 1 | `github-app-integration`, `github-sign-in` | App: cliente GitHub, webhook e env na `apps/api`. Login: `packages/auth`, perfil do usuário na API, tela de login | `contends_on` vazio nas duas |

Nenhuma ficou de fora do lote 1 por colisão nem pelo teto de 3; o lote tem só duas porque não há uma terceira
elegível. `board-import` precisa das duas entregues e mergeadas antes.

Nota de processo: só um workspace roda a auditoria (`--audit-only`); os demais usam `--no-audit`. Sem isso, o
`BACKLOG.md` é reescrito por mais de um agente ao mesmo tempo.

Ressalva: `contends_on` disjunto reduz conflito, não elimina. As duas specs do lote 1 provavelmente acrescentam
códigos de erro em `packages/internationalization/translations/packages/shared/utils.ts` (`apiErrors`) e podem
mexer no env da API. Nenhuma das duas declara esses arquivos.

Nesta rodada as três specs pedidas vão rodar em sequência, na mesma branch; o lote não se aplica.

## Dependências

| spec | `depends_on` |
|------|--------------|
| `github-sign-in` · `github-app-integration` | — |
| `board-import` | `github-app-integration`, `github-sign-in` |
| `board-members` | `board-import` |
| `card-backlog` | `board-import`, `board-members` |
| `theme-toggle` | `card-backlog` |
| `card-timeline` | `card-backlog` |
| `orchestrator` | `card-timeline` |
| `agent-contract` | `orchestrator` |
| `local-runner` | `agent-contract` |
| `execution-credentials` | `board-members`, `local-runner` |
| `pr-flow` | `github-app-integration`, `orchestrator` |
| `spec-authoring` | `orchestrator`, `agent-contract`, `card-timeline` |
| `cycle-runs` | `orchestrator`, `agent-contract`, `pr-flow` |
| `cloud-routines-runner` | `agent-contract`, `execution-credentials` |
| `spec-discovery` | `spec-authoring` |
| `cycle-schedule` | `cycle-runs`, `execution-credentials` |

## Deriva e referências corrigidas

Nenhuma deriva de implementação: nada do backlog foi implementado. A rodada conferiu toda referência a
caminho e a `arquivo:linha` nas specs. As quatro âncoras com linha batem (`base.repository.ts:59`,
`common-panel.ts:30` duas vezes, `packages/auth/client.ts:152`), e os símbolos citados de
`@repo/kanban-contract` existem. Duas specs estavam erradas:

| spec | estava | ficou | leitura |
|------|--------|-------|---------|
| `spec-discovery` | Citava `.claude/skills/market-research/` e dizia que o `/spec` aciona essa skill | A skill saiu no `fork-cleanup`; a pesquisa está nas instruções do `estrategista-produto` | A spec estava errada |
| `github-sign-in` | Apontava `signInWithGoogle` de `packages/auth/client.ts:152` como o padrão do login Google | O login da tela passa por `apps/app/shared/lib/googleSignInApi.ts:32` → `POST /auth/sign-in/google` (`route.ts:17`) → `identitySignInWithGoogleIdToken` (`firebase-identity-toolkit.ts:204`). O `signInWithGoogle` do pacote só é usado por `packages/auth/provider.tsx:396` | A spec estava incompleta; ganhou também os riscos do E2E e do emulador |

Caminhos citados que ainda não existem e não são erro: `packages/runner` (`local-runner` vai criar) e
`anthropics/claude-code-action` (repositório no GitHub).

## Achados e pendências

- **A1 — `github-sign-in` remove a entrada de que o pipeline depende.** O corte tira e-mail e senha, mas
  `apps/e2e/support/seedAccounts.ts` e `apps/e2e/tests/signIn.spec.ts` entram assim, e o `/test` usa as
  contas do seed. Registrado como risco e pergunta na spec. Dono: o usuário, na triagem.
- **A2 — CI vermelho nos PRs do Dependabot.** #3, #4, #6 e #7 falham em `verify`; a #6 também em
  `coverage` e a #3 também em `e2e`. O log do run 45698052887 não veio pelo `gh run view --log-failed`; a causa não foi medida. A
  #4 sobe o TypeScript para 7.0.2, uma major. Sem dono.
- **A3 — `fork-cleanup` não tem `STATE.md`.** Entregue fora do pipeline, por decisão registrada na própria
  spec. A auditoria não cria a pasta nem o arquivo.
- **A4 — Modo degradado das três primeiras specs.** `github-app-integration` testa assinatura e JWT com
  segredo de teste, mas não prova os sinais de pronto sem o App criado. `github-sign-in` funciona no
  emulador pelo popup; a troca do token do GitHub na API, no molde do Google, provavelmente não
  ([docs do emulador](https://firebase.google.com/docs/emulator-suite/connect_auth), coletado em
  2026-11-25). `board-import` só é percorrida no `/test` sem credencial se existir um cliente GitHub falso
  em dev. As credenciais de produção (GitHub App e OAuth App no Firebase) vão para
  `docs/PRE-PRODUCTION.md`, no item 4 (Login) e num item novo para o App.
- **A5 — Parser de YAML.** `board-import` precisa de um como dependência direta da API; hoje `yaml` e
  `js-yaml` só aparecem como transitivas no lockfile. Dependência nova passa pelo relatório
  (`.claude/cycle-policy.md`).

## Entregues

### `fork-cleanup` — 2026-11-25

- **Como:** direto na PR #1 (`chore/bootstrap-agent-board`), sem as etapas do pipeline; spec arquivada em
  [`docs/features/fork-cleanup/spec.md`](../../docs/features/fork-cleanup/spec.md).
- **Conferido:** typecheck dos 12 workspaces, `pnpm check` e Vitest de todos os workspaces, verdes.
  `pnpm e2e` e `test:emulator` ficam com o CI da PR.
- **Deriva:** organizações e trilha de auditoria saíram, embora a spec as deixasse fora do corte; `entity` e
  upload passaram a ser escopados por pessoa (`userId`). O login ficou com e-mail/senha e Google até
  `github-sign-in`.

## Feito na criação do repositório (fora do backlog)

- `packages/kanban-contract`: schema do `board.yml`, papéis × permissão do GitHub, estados e transições do
  card, payloads das ferramentas dos agentes, com testes.
- `kit/` e a regra `.claude/rules/board-mode.md`, aplicados neste repositório e prontos para o
  next-boilerplate.
- Resíduos de CLI do core (`package.json`, `tsup.config.ts`, `.autorc`, `CHANGELOG.md`, `.firebaserc`) e
  remoto `upstream` apontando para o next-boilerplate.
