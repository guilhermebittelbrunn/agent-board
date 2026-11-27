<!-- board-mode:start -->
## Modo board (`--board <card-id>`)

Se `$ARGUMENTS` contiver `--board <card-id>`, esta execução foi disparada pelo agent-board e **não há
ninguém no teclado**. Siga [`.claude/rules/board-mode.md`](../rules/board-mode.md): onde ela conflitar com
os passos abaixo, ela vence. Nesta etapa, em resumo:

- Revise o diff da branch contra a base (`git diff origin/<baseBranch>...HEAD`) e o working tree.
- O gate de commit e a pergunta de push são automáticos: aplique o plano de commits sem pedir aprovação,
  só com commits novos (nunca reescreva histórico, nunca `--force`) e faça push ao final.
- Achado bloqueante que exige reimplementar → `complete_stage(needs_rework)` com os achados no `summary`.
- Com `--cycle <ciclo-id>`, siga a §2.1 da regra: sem `ask`, decisões em `complete_stage.decisions`.
<!-- board-mode:end -->

