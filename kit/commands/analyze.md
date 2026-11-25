<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- O foco é o slug do card (`get_card`), nunca descrição livre nem a feature mais recente.
- Perguntas em aberto de produto ou escopo vão numa única chamada `ask`, seguida de
  `complete_stage(needs_input)`. As de detalhe técnico seguem a recomendação default e entram em
  "Decisões tomadas sem você".
- Crie a branch do card a partir da base e termine com commit de `docs/features/<slug>/` e push.
<!-- board-mode:end -->

