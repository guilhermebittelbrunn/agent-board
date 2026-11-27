<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- Slug explícito; as decisões em aberto seguem a mesma política do `/analyze` (pergunta só de produto).
- Trabalhe na branch do card. Termine com os commits da implementação (um por aplicação, pulverizados por
  funcionalidade) e push — a próxima etapa pode rodar num clone novo.
- Com `--cycle <ciclo-id>`, siga a §2.1 da regra: sem `ask`, decisões em `complete_stage.decisions`.
<!-- board-mode:end -->

