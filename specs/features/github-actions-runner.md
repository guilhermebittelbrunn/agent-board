---
id: github-actions-runner
title: Executor no GitHub Actions
status: deferred
value: baixo
effort: M
audience: time
phase: 4
area: [apps/api, kit]
depends_on: [orchestrator, agent-contract]
contends_on: []
feature: -
updated: 2026-11-25
---

# Executor no GitHub Actions

> **Resumo**
> - **O quê:** rodar etapas no GitHub Actions.
> - **Por quê:** adiada: runner local e nuvem cobrem o MVP.
> - **Status:** `deferred` · valor baixo · esforço M · time
> - **Próximo passo:** adiada

**Adiada:** runner local e tarefas agendadas cobrem o MVP. Este adapter (`workflow_dispatch` +
`anthropics/claude-code-action`) vale se o time preferir rodar etapas no CI com segredos do repositório.
Referência: [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions).
