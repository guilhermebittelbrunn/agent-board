# Roadmap do agent-board

O primeiro passo não é o board: é deixar o pipeline rodar inteiro sem ninguém respondendo perguntas. Com
isso pronto, o board é um app Next.js comum sobre o que este repositório já tem.

As durações são estimativas para uma pessoa com os agentes do próprio repo ajudando. Somando as fases 0 a 3,
são **7 a 8 semanas até o backlog rodar sozinho**. A ordem de execução das specs, com dependências, fica em
[`specs/BACKLOG.md`](../../specs/BACKLOG.md); que tela cada spec constrói, em [`SCREENS.md`](SCREENS.md). Este
arquivo diz **por que** a ordem é essa e **quando** cada fase acaba.

## Fases e gates

Cada fase termina num gate observável. Fase sem gate cumprido não acaba, por mais specs que tenha fechado.

| Fase | Duração | Entrega | Gate de saída |
|------|---------|---------|---------------|
| **0 — Preparar o repo** | ~1 semana | Modo `--board`, commit por etapa, slug explícito, repo enxuto, setup do ambiente de nuvem | **G1** — uma feature inteira via `claude -p` com `--board local`, sem intervenção |
| **1 — MVP local** | 2–3 semanas | Login GitHub, GitHub App, import do repo, membros e papel `viewer`, cards, tema claro e escuro, linha do tempo, orquestrador, contrato MCP, runner local | **G2** — três features no board, ponta a ponta |
| **2 — Nuvem + GitHub** | ~2 semanas | Etapas na nuvem, fluxo de PR, convites e papel `operator`, disparo com a credencial de cada membro, spec escrita no board, ciclo com várias specs | **G3** — uma feature concluída com o notebook fechado |
| **3 — Automação** | ~2 semanas | Agenda de ciclos, descoberta de specs | **G4** — uma semana de backlog sem intervenção |
| **4 — Escala** *(opcional)* | — | API key do board como fallback, Managed Agents, mais repositórios, auditoria | — |

### Por que o runner local vem antes da nuvem

É onde o fluxo já funciona hoje: emulador do Firebase, `agent-browser` e credenciais estão na sua máquina.
A nuvem precisa de um script de setup (pnpm, emulador com Java, Chromium) e de domínios liberados; isso é
trabalho da fase 2 e não deve segurar o MVP.

### Por que login e papel `viewer` já entram no MVP

Para alguém acompanhar o board com você desde o começo. Convite com papel `operator` só entra na fase 2,
junto com o disparo pela credencial de cada membro: antes disso, só o dono dispara e só a credencial dele
paga.

## Fase a fase, com as specs

### Fase 0 — Preparar o repo

| Item | Onde está |
|------|-----------|
| Modo `--board <card-id>` nos comandos, commit e push por etapa, foco sempre pelo slug | [`.claude/rules/board-mode.md`](../../.claude/rules/board-mode.md) e `kit/` — feitos na criação do repositório |
| Contrato do `board.yml`, papéis, estados e payloads | `packages/kanban-contract` — feito na criação, com testes |
| Repo enxuto | Spec `fork-cleanup` — entregue na PR #1 ([spec arquivada](../features/fork-cleanup/spec.md)) |
| Setup do ambiente de nuvem | Vai junto com [`cloud-routines-runner`](../../specs/features/cloud-routines-runner.md) (fase 2); o G1 roda local |

**Estado (2026-11-25):** tudo acima feito, menos o setup da nuvem e o próprio G1, que ainda não rodou.

**G1** se prova com o modo local da regra: `claude -p "/analyze <id> --board local"` e as etapas seguintes,
lendo respostas de `docs/features/<slug>/board/inbox.md` e escrevendo em `outbox.md`. Nenhuma etapa pode
parar esperando alguém. Roteiro em [`IMPORT.md`](IMPORT.md).

### Fase 1 — MVP local

| # | Spec | Entrega |
|---|------|---------|
| 1 | [`github-sign-in`](../../specs/features/github-sign-in.md) | Login GitHub. E-mail/senha só no emulador; o Google saiu |
| 2 | [`github-app-integration`](../../specs/features/github-app-integration.md) | Ler repositórios, receber webhooks, consultar permissão de cada pessoa |
| 3 | [`board-import`](../../specs/features/board-import.md) | O repositório vira um board com as colunas do `board.yml` |
| 4 | [`board-members`](../../specs/features/board-members.md) | Guard por papel efetivo antes de existir ação que gaste dinheiro |
| 5 | [`card-backlog`](../../specs/features/card-backlog.md) | Specs viram cards; priorizar e arrastar |
| 6 | [`theme-toggle`](../../specs/features/theme-toggle.md) | Botão de tema no cabeçalho do board, antes de as telas crescerem |
| 7 | [`card-timeline`](../../specs/features/card-timeline.md) | Onde os agentes escrevem; perguntas e respostas |
| 8 | [`orchestrator`](../../specs/features/orchestrator.md) | Arrastar dispara; transições, fila, WIP e o limite de duas voltas |
| 9 | [`agent-contract`](../../specs/features/agent-contract.md) | Ferramentas MCP/HTTP com token por execução |
| 10 | [`local-runner`](../../specs/features/local-runner.md) | Etapas reais na sua máquina com o Agent SDK |

**G2:** três features passam por Análise → Concluído no board, sem ninguém destravar etapa. O board não
mostra custo; o consumo dessas três, medido no uso da conta do Claude, é o que decide o plano (ver
[quanto custa rodar](DECISIONS.md#quanto-custa-rodar)).

### Fase 2 — Nuvem + GitHub

| Spec | Entrega |
|------|---------|
| [`execution-credentials`](../../specs/features/execution-credentials.md) | Cada membro dispara com a própria credencial |
| [`pr-flow`](../../specs/features/pr-flow.md) | Aguardando PR: abrir, `/observe`, `/mediate` a cada comentário, merge move para Concluído |
| [`spec-authoring`](../../specs/features/spec-authoring.md) | Texto ou anexo vira spec no board, escrita por um agente, com as perguntas no card |
| [`cycle-runs`](../../specs/features/cycle-runs.md) | Várias specs da Análise à PR sem parar, com as decisões registradas para revisar depois |
| [`cloud-routines-runner`](../../specs/features/cloud-routines-runner.md) | Etapas em tarefas agendadas do Claude Code, com gatilho por API |

**G3:** uma feature sai de Tarefas e chega em Aguardando PR com o notebook fechado.

### Fase 3 — Automação

| Spec | Entrega |
|------|---------|
| [`spec-discovery`](../../specs/features/spec-discovery.md) | Propostas de spec com evidência, triadas no board |
| [`cycle-schedule`](../../specs/features/cycle-schedule.md) | O ciclo começa sozinho em horário definido (substitui `schedules-and-budgets`, que saiu com custos e orçamento) |
| [`clickup-import`](../../specs/features/clickup-import.md) *(adiada)* | Tarefas do ClickUp como cards; reavaliar depois da fase 2 |

**G4:** uma semana em que o backlog anda sem você arrastar card. Perguntas no card continuam valendo: o
gate mede se nada **travou**, não se nada foi perguntado.

### Fase 4 — Escala (opcional)

Só se o uso pedir: API key do board como fallback de credencial, Managed Agents, mais de um repositório por
pessoa e auditoria com tela própria. [`github-actions-runner`](../../specs/features/github-actions-runner.md)
está adiada até aqui.

## Quando revisar este arquivo

- Ao cumprir um gate: registre a data e o número que o provou (features, dias sem intervenção).
- Quando uma spec mudar de fase no `specs/BACKLOG.md`.
- Quando o consumo medido no G2 contrariar a estimativa de [`DECISIONS.md`](DECISIONS.md#quanto-custa-rodar).
