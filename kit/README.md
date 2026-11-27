# kit — preparar um repositório para o agent-board

Tudo o que um repositório precisa para ser importado num board. Aplique com:

```bash
node kit/apply.mjs ../caminho/do/repositorio
```

O script é idempotente: só cria o que falta e só insere a seção nos comandos que ainda não a têm. Revise o
diff no repositório alvo antes de commitar (numa branch de feature, nunca em `main`).

| Arquivo no repositório alvo | Origem | O que faz |
|-----------------------------|--------|-----------|
| `.kanban/board.yml` | `kit/.kanban/board.yml` | Contrato com o board: etapas → comandos, modelos, branch base, backlog, limites. O `name` vira o nome da pasta |
| `.kanban/setup.sh` | `kit/.kanban/setup.sh` | Prepara o ambiente de nuvem (deps, agent-browser, firebase-tools) |
| `.claude/rules/board-mode.md` | `kit/.claude/rules/board-mode.md` | O que muda quando um comando recebe `--board <card-id>`: sem perguntas interativas, commit e push por etapa, relatório no card |
| Seção "Modo board" em `.claude/commands/{spec,analyze,develop,review,test,observe,mediate}.md` | `kit/commands/*.md` | Resumo, por etapa, de como aplicar a regra; inserida antes do primeiro `##`. O de `spec` é a escrita de specs na coluna Rascunhos |

## Depois de aplicar

1. Ajuste o `.kanban/board.yml`: colunas, modelos, `approval` da análise, `limits`.
2. Ajuste o `.kanban/setup.sh` ao que o repositório precisa na nuvem.
3. Cite a regra no `CLAUDE.md` do repositório, na lista de regras sempre em contexto.
4. Valide sem o board, com o modo local da regra:
   `claude -p "/analyze <spec> --board local"`, depois `/develop`, `/review` e `/test` com o mesmo slug.
   Perguntas e relatórios aparecem em `docs/features/<slug>/board/outbox.md`; respostas vão em `inbox.md`.
5. Instale o GitHub App do board no repositório e crie o board ([`docs/board/IMPORT.md`](../docs/board/IMPORT.md)).

## Escrita de specs no board

A coluna Rascunhos roda o comando do bloco `specAuthoring` do `board.yml` (padrão `/spec`). O
repositório precisa de um `/spec` com a seção "Modo board" deste kit, ou de outro comando que siga o mesmo
contrato: ler o pedido no `get_card`, os anexos com `get_attachment`, perguntar com `ask` e gravar a spec
em `specAuthoring.path` na branch do card. Sem `.claude/commands/spec.md`, o `apply.mjs` pula a seção e
avisa.

## Repositórios com outro pipeline

O board só conhece o `board.yml` e o contrato das ferramentas (`get_card`, `ask`, `complete_stage`…). Um
repositório com outros comandos funciona se cada comando listado em `stages` respeitar a regra do modo board.
