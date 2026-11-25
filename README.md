# agent-board

Board Kanban pessoal que orquestra o desenvolvimento por specs com agentes do Claude Code. Cada board aponta para um repositório do GitHub; cada card é uma spec do backlog daquele repositório; cada coluna é uma etapa do pipeline (`/analyze`, `/develop`, `/review`, `/test`); arrastar um card dispara a etapa e o agente registra no card o que fez.

```
Tarefas → Análise → Executando → Revisando → Testando → Aguardando PR → Concluído
          /analyze   /develop     /review     /test      /observe, /mediate
```

Fork do [next-boilerplate](https://github.com/guilhermebittelbrunn/next-boilerplate): mesma stack, mesmos padrões e o mesmo pipeline de agentes, com o core como remoto `upstream`. Ferramenta de uso próprio, não MVP: o que é de produto para cliente final sai na spec [`fork-cleanup`](specs/features/fork-cleanup.md).

## Como está organizado

| Onde | O quê |
|------|-------|
| `apps/app` | UI do board |
| `apps/api` | API, orquestrador, contrato dos agentes e webhooks do GitHub |
| `packages/kanban-contract` | Domínio do board: `board.yml`, papéis, estados, payloads dos agentes |
| `kit/` | O que copiar para um repositório antes de importá-lo num board |
| `docs/board/` | Visão, arquitetura, acesso, contrato e importação |
| `specs/` | Backlog do próprio agent-board |

## Primeiros passos

```bash
nvm use && pnpm install
pnpm turbo run lint typecheck test      # gates sem Java
pnpm turbo run test:emulator            # suíte da api contra os emuladores (JDK 21)
```

Ambiente local, emuladores e variáveis: [`docs/SETUP.md`](docs/SETUP.md). Um projeto Firebase próprio para o board entra quando ele for publicado.

Depois, o backlog: `/analyze fork-cleanup` no Claude Code (ou `/cycle` para uma rodada sem acompanhamento).

## Trazer melhorias do next-boilerplate

```bash
git fetch upstream
git switch -c chore/sync-upstream
git merge upstream/main
```

Conflitos em pastas que o board removeu se resolvem mantendo a remoção.

## Importar um repositório

Primeiro repositório: o next-boilerplate. Passo a passo em [`docs/board/IMPORT.md`](docs/board/IMPORT.md); kit em [`kit/README.md`](kit/README.md).
