---
slug: agent-contract
title: Contrato dos agentes (HTTP + servidor MCP)
task: -
spec: agent-contract
branch: -
epic: -
updated: 2026-11-26 10:00
---

# Pipeline: contrato dos agentes (HTTP + servidor MCP)

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-26 05:51 | analyze/plan.md | Token `kbr_<runId>_<segredo>` com só o hash no `run`, expira no `deadlineAt` e morre com o `run`; guard próprio sem sessão; `POST /agent/tools/[tool]` e `POST /mcp` (JSON-RPC sem sessão, escrito à mão) sobre um núcleo único que valida pelo contrato, confere card e etapa, grava pela `card-timeline` e encerra só via `completeRun`; `create_card` responde 501; script `agent-token` para o `/test` por curl no emulador |
| develop | done    | 2026-11-26 07:14 | develop/handoff.md | Token por `run` só com hash, guard sem sessão em `(shared)/lib/agent-contract`, `POST /agent/tools/[tool]` e `POST /mcp` sobre `callAgentTool`; MCP atende `2026-07-28` (`server/discover`) e as versões com `initialize`; `complete_stage` só via `completeRun`; script `agent-token`; 1223 testes da API e 151 no emulador verdes |
| review  | in-progress | 2026-11-26 07:22 | review/review.md | Sem defeito de segurança bloqueante: hash e `timingSafeEqual` certos, escopo por card e etapa, `/mcp` atrás do `proxy`; guard fora de `(guards)` mantido; doc do rate limit corrigida; `ask` de `run` que o card já não roda vira 409 na transação, `id` JSON-RPC inválido vira `-32600`, casos fixos no parse do token (152 testes no emulador); 🟡 balde por `runId` não verificado custa uma leitura por token forjado (fica para a `cloud-routines-runner`); plano de commits das nove tarefas em 86 commits |
| test    | done    | 2026-11-26 10:00 | test/report.md | Contrato inteiro verde: percurso 1 a 13 por `curl` com o `proxy` real (403 de `Origin`, 401, 409, 501, MCP nas duas eras) e cliente MCP oficial (SDK 1.30, era `2025-11-25`); raiz 13/13 (`api` 1232, emulador 152), `pnpm e2e` 31/31, `next build` da API passa; 3 testes novos do `proxy`; o bloqueio era só o herdado do `orchestrator` (foco no `body` ao fechar por Cancelar/Escape o diálogo aberto pelo menu "⋯"); remedido em 2026-11-26 09:37 na passada do `local-runner`, o foco volta ao botão "⋯", então o `test` fecha sem defeito próprio aberto. Claude Code como cliente 🔒. `review` segue `in-progress` (sem commits) |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- Executado pelo `/cycle` noturno sem perguntas, com a spec ainda `proposed`. Depende do `orchestrator`, que estava
  em implementação ao mesmo tempo: nomes de `runRepository`, `RunRecord` e `completeRun` seguem o código real.
