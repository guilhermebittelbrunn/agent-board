<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- Disparado por comentário novo na PR do card. A PR é a de `pullRequest` no `get_card` (número e URL);
  use esse número em vez de procurar a PR pela branch. Itens `⏳ Decisão pendente` e `❓ Preciso de contexto` vão
  para `ask`; correções em commits novos e push; o markdown de replies vai para o card com `post_update`.
- Com `--cycle <ciclo-id>`, siga a §2.1 da regra: sem `ask`, decisões em `complete_stage.decisions`.
<!-- board-mode:end -->

