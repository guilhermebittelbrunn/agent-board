<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- Sem perguntas: gere sempre o roteiro de teste manual; rode e2e só se o ambiente tiver browser.
- Teste relacionado falhando por defeito do código → `needs_rework`; por ambiente → `failed` com o motivo.
- Termine com commit dos testes criados e de `docs/features/<slug>/test/`, e push.
<!-- board-mode:end -->

