---
slug: local-runner
title: Runner local
task: -
spec: local-runner
branch: -
epic: -
updated: 2026-11-26 10:00
---

# Pipeline — Runner local

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 07:06 | analyze/plan.md | CLI `apps/runner` com `claude -p`, registro por código, polling, worktree por `run`, executor escolhido por pessoa e modo de teste com agente stub |
| develop | done    | 2026-11-26 08:23 | develop/handoff.md | Workspace `apps/runner` (`register`/`start`, worktree por `run`, `claude -p` com `acceptEdits` + lista `allow`, bypass só com `--dangerously-skip-permissions`), rotas `/runners*` e `/runner/*` com token `kbl_` só em hash, executor escolhido por pessoa com `no_runner`, `collect` do falso restrito a `run` `fake`, tela "Minhas credenciais"; 27/27 tasks do CI, emulador 7/7 |
| review  | in-progress | 2026-11-26 09:50 | review/review.md | Uma regra `-…` na lista `allow` do repositório virava flag do `claude` (corrigido), `..` em owner/name e `--permission-mode=` recusados, entrada do CLI por `pathToFileURL`; branch fora do padrão, decisão no `/review`; plano de 95 commits das dez tarefas; rodada 1 pós-/test: limpeza de restos após kill/2º Ctrl+C, caminho sem home no card, turnos, copy da tela |
| test    | done    | 2026-11-26 10:00 | test/report.md | Rodada 1: raiz 14/14 (emulador 156), `pnpm e2e` 31/31, `next build` de API e app, runner real com agente de teste no emulador; bloqueou no segundo Ctrl+C. Rodada 2: os 9 itens remedidos passam (segundo Ctrl+C e `kill -9` sem agente órfão nem worktree preso, dois runners no mesmo home, `~` no relatório, 201 turnos, frase do Ctrl+C ocioso, CLI por link simbólico, tela, fluxo 2); `runner` 46/46, `app` 882/882. `review` segue `in-progress` (sem commits) |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Planejado no `/cycle` noturno com a spec em `proposed`, a pedido do usuário. Quatro perguntas em aberto no fim do
  plano, todas com recomendação aplicada.
- Depende da `agent-contract`, implementada na mesma rodada; nomes do token (`mintRunToken`, `tokenHash`,
  `tokenExpiresAt`) seguem o código dela.
- `/develop` inverteu o padrão de permissões do plano por decisão do orquestrador (vai como pergunta ao usuário); detalhes no handoff, desvio 1.
