<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- Sem rodada de aprovação: confira você mesmo o texto contra o padrão (2–3 parágrafos, ~150 palavras,
  sem termo técnico) e publique com `post_update`, depois `complete_stage(success)`.
<!-- board-mode:end -->

