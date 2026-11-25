# Importar um repositório

Importar um repositório = aplicar o [kit](../../kit/README.md) nele, instalar o GitHub App do board e criar o board apontando para ele. O board lê o `.kanban/board.yml` versionado e monta as colunas a partir dele. O primeiro repositório é o next-boilerplate.

## Passo a passo

1. **Aplicar o kit** numa branch de feature do repositório alvo: `node kit/apply.mjs <repo>`. Revisar e ajustar `board.yml` e `setup.sh`, citar a regra no `CLAUDE.md`, abrir PR.
2. **Validar sem o board:** rodar uma spec inteira com `--board local` (`/analyze`, `/develop`, `/review`, `/test`). É o gate da fase 0: nenhuma etapa pode parar esperando alguém.
3. **Instalar o GitHub App** do board no repositório.
4. **Criar o board** no agent-board: escolher o repositório; o board busca `.kanban/board.yml` na branch base, valida com `parseBoardConfig` e mostra os erros, se houver.
5. **Configurar executores:** registrar o runner local (token emitido pelo board) e, para a nuvem, uma tarefa agendada por etapa com gatilho de API (URL + token de disparo) — ver [ARCHITECTURE.md](ARCHITECTURE.md#executores).
6. **Puxar o backlog:** as specs com status `readyStatus` (padrão `approved`) do `backlog.index` viram cards em Tarefas, na ordem do `BACKLOG.md`.

## `.kanban/board.yml`

Schema: `packages/kanban-contract/src/boardConfig.ts`. Modelo comentado: [`kit/.kanban/board.yml`](../../kit/.kanban/board.yml).

| Campo | Padrão | Regra |
|-------|--------|-------|
| `version` | — | Sempre `1` |
| `name` | — | Nome do board |
| `baseBranch` | `main` | Precisa estar em `protectedBranches` (agentes nunca commitam nela) |
| `protectedBranches` | `main, master, production, production-backup` | — |
| `branchPattern` | `feat/{slug}` | Precisa conter `{slug}`; o resultado não pode ser uma branch protegida |
| `backlog.source` | `specs` | `specs` ou `manual` |
| `backlog.index` | `specs/BACKLOG.md` | Fonte da ordem |
| `backlog.readyStatus` | `approved` | Status da spec que vira card pronto |
| `featuresDir` | `docs/features` | Onde ficam os artefatos de cada feature |
| `stages[].key` | — | Único, kebab-case |
| `stages[].column` | — | Título da coluna |
| `stages[].command` | — | Slash command do repositório (`/develop`) |
| `stages[].agent` | — | Opcional; só informativo no card |
| `stages[].model` | `sonnet` | `opus`, `sonnet` ou `haiku` |
| `stages[].effort` | `medium` | `low`, `medium`, `high`, `xhigh`, `max` |
| `stages[].runners` | `local, cloud` | Executores permitidos para a etapa |
| `stages[].approval` | `none` | `none`, `optional` (o dono liga/desliga) ou `required` |
| `stages[].onRework` | — | Etapa **anterior** para onde o card volta em `needs_rework` |
| `stages[].onPrComment` | — | Comando disparado a cada comentário novo na PR |
| `limits.maxReworkLoops` | `2` | 0–5; depois disso o card fica *aguardando você* |
| `limits.maxTurnsPerStage` | `200` | Limite de turnos por execução |
| `environment.install` | — | Comando de instalação |
| `environment.setupScript` | — | Script de preparo do ambiente de nuvem |
