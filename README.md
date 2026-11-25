# agent-board

Board Kanban pessoal que orquestra o desenvolvimento por specs com agentes do Claude Code. Cada board aponta
para um repositório do GitHub; cada card é uma spec do backlog daquele repositório; cada coluna é uma etapa
do pipeline; arrastar um card dispara a etapa, e o agente registra no card o que fez.

```
Tarefas → Análise → Executando → Revisando → Testando → Aguardando PR → Concluído
          /analyze   /develop     /review     /test      /observe, /mediate
```

Fork enxuto do [next-boilerplate](https://github.com/guilhermebittelbrunn/next-boilerplate): mesma stack,
mesmos padrões e o mesmo pipeline de agentes, com o core como remoto `upstream`. É ferramenta de uso próprio,
não produto: não tem landing, cobrança, e-mail transacional, organizações nem fluxos de conta de usuário
final. O que saiu do core, e por quê, está na [spec `fork-cleanup`](docs/features/fork-cleanup/spec.md).

## Onde estamos

A fase 0 está entregue: modo `--board` nos comandos, contrato do board em `packages/kanban-contract`, `kit/`
para importar repositórios e o repo enxuto. O próximo passo é provar o **G1** (uma feature inteira via
`claude -p` com `--board local`, sem intervenção) e começar a fase 1 por `github-sign-in`.

| Fase | Gate |
|------|------|
| 0 — Preparar o repo | G1: uma feature inteira sem intervenção |
| 1 — MVP local | G2: três features no board, custo medido |
| 2 — Nuvem + GitHub | G3: uma feature concluída com o notebook fechado |
| 3 — Automação | G4: uma semana de backlog sem intervenção |

Fases, specs e estimativas: [`docs/board/ROADMAP.md`](docs/board/ROADMAP.md). Custos, executores e riscos:
[`docs/board/DECISIONS.md`](docs/board/DECISIONS.md). A fila: [`specs/BACKLOG.md`](specs/BACKLOG.md).

## O que vem do core

| Onde | O quê |
|------|-------|
| `apps/app` (3000) | UI: login por e-mail/senha e Google, conta (perfil, senha, tema), notificações, admin de usuários com impersonação, o CRUD de referência `entity` com upload |
| `apps/api` (3002) | API HTTP: guards → repositórios Firestore → DTOs; vai receber o orquestrador, o contrato dos agentes e os webhooks do GitHub |
| `apps/e2e` | Playwright contra `api` + `app` com os emuladores |
| `packages/kanban-contract` | Domínio do board: `board.yml`, papéis, estados e transições, payloads dos agentes |
| `packages/*` | `auth` (Firebase), `sdk`, `design-system`, `internationalization` (pt-br), `shared`, `security`, `analytics`, `seo`, configs |
| `kit/` | O que copiar para um repositório antes de importá-lo num board |
| `.claude/` · `specs/` | O pipeline de agentes e o backlog do próprio agent-board |

## Rodar local

Pré-requisitos: Node `22.12.0` (`nvm use`), pnpm `10.19.0` e JDK 21+ para os emuladores do Firebase.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env

pnpm emulators   # terminal 1: Auth + Firestore + Storage emulados (deixe rodando)
pnpm seed        # terminal 2: contas admin@example.com e user@example.com, senha demo1234
pnpm dev         # terminal 2: app em http://localhost:3000, api em :3002
```

Gates, os mesmos do CI:

```bash
pnpm check                                    # Biome/Ultracite
pnpm turbo run typecheck test                 # sem Java
pnpm turbo run test:emulator                  # api contra os emuladores (JDK 21)
pnpm e2e                                      # sobe tudo, roda o seed e a suíte Playwright
```

Variáveis, portas, CI e emulador em detalhe: [`docs/SETUP.md`](docs/SETUP.md). Antes de publicar:
[`docs/PRE-PRODUCTION.md`](docs/PRE-PRODUCTION.md).

## Trabalhando com os agentes

O ciclo é `/spec → /analyze <id> → /develop → /review → /test`, com `/cycle` para uma rodada sem
acompanhamento. Os mesmos comandos rodam sem ninguém no terminal com `--board <card-id>` (ou `--board local`
para testar sem o board). Comece por [`CLAUDE.md`](CLAUDE.md) e
[`docs/TASK-PIPELINE.md`](docs/TASK-PIPELINE.md).

## Documentação

| Documento | Responde |
|-----------|----------|
| [`docs/board/`](docs/board/README.md) | O board por dentro: arquitetura, acesso, contrato dos agentes, importação, roadmap e decisões |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Topologia do monorepo, fluxo de dados, escopo e auth |
| [`docs/SETUP.md`](docs/SETUP.md) | Ambiente local, variáveis, emulador, CI e E2E |
| [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/AUTH-PANEL.md`](docs/AUTH-PANEL.md) | Guards, rotas e sessão |
| [`docs/TASK-PIPELINE.md`](docs/TASK-PIPELINE.md) · [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) | Comandos, agentes e skills |
| [`docs/review-checklist.md`](docs/review-checklist.md) | Invariantes que a revisão confere |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Termos do repo e do board |

## Trazer melhorias do next-boilerplate

```bash
git fetch upstream
git switch -c chore/sync-upstream
git merge upstream/main
```

Conflito "modificado no upstream / removido aqui" se resolve mantendo a remoção; a lista do que saiu está
na [spec `fork-cleanup`](docs/features/fork-cleanup/spec.md).

## Importar um repositório

O primeiro é o próprio next-boilerplate. Passo a passo em [`docs/board/IMPORT.md`](docs/board/IMPORT.md);
kit em [`kit/README.md`](kit/README.md).
