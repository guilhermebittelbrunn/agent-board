---
slug: runner-reliability
title: Runner local confiável, vários runners por máquina e guia de configuração
task: -
spec: -
branch: fix/runner-reliability
epic: -
updated: 2026-11-27 19:42
---

# Pipeline: runner local confiável e multi-runner

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | skipped | -                | -               | Trabalho pedido direto na conversa (dois cards falhando em produção); o diagnóstico está no handoff |
| develop | done    | 2026-11-27 18:49 | develop/handoff.md | Runner libera `mcp__kanban` e o git do card, ignora o Ctrl+C duplicado do pnpm, a limpeza fecha a etapa no board, vários runners numa pasta com o comando global `agent-board-runner`, trilha no terminal e guia passo a passo em "Minhas credenciais" |
| review  | done    | 2026-11-27 19:12 | review/review.md | Nenhum bloqueante; trava do runner atômica, limpeza cita o runner da run, `push.default=simple` fixado na sessão do agente (D1), app e i18n num commit só; 10 commits em `fix/runner-reliability`, enviados ao remoto |
| test    | done    | 2026-11-27 19:42 | test/report.md  | Suíte verde (runner 85, api 1195 + 139 no emulador, app 759), 13 testes novos no runner; e2e no emulador confirmou toda a lista da revisão; os dois 🟡 (numeração do guia e `git fetch` com push simultâneo) foram corrigidos depois, a pedido do usuário |
| observe | pending | -                | -               | - (opcional) |

## Notas

- O analyze não rodou: a tarefa nasceu da investigação de dois cards que falharam em produção em 2026-11-27, e o
  develop foi feito na mesma conversa. O `/review` foi liberado criando esta pasta, por escolha do usuário.
