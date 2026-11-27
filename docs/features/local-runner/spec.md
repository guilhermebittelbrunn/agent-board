---
id: local-runner
title: Runner local com o Claude Agent SDK
status: done
value: alto
effort: G
audience: time
phase: 1
area: [packages/runner, apps/api, packages/kanban-contract]
depends_on: [agent-contract]
contends_on: []
feature: local-runner
updated: 2026-11-27
---

# Runner local com o Claude Agent SDK

> **Resumo**
> - **O quê:** um CLI na máquina-alvo que roda as etapas com o Claude Agent SDK.
> - **Por quê:** o pipeline depende do ambiente local (emulador, browser, credenciais de dev).
> - **Status:** `done` · valor alto · esforço G · time
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

## Problema

O pipeline hoje só funciona bem na máquina de quem desenvolve: emulador do Firebase, browser para validação
visual, credenciais de dev. O board precisa disparar etapas nessa máquina, sem abrir porta nela, usando o
login do Claude de quem registrou o runner.

## O que já existe no repo

- Contrato HTTP — spec `agent-contract`.
- `.claude/rules/board-mode.md` nos repositórios importados.
- **Lacuna:** pacote do runner.

## Referências

- Telas: [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — carrega `.claude/` do projeto,
  hooks, permissões, sessões.
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).
- [`docs/board/ACCESS.md`](../../board/ACCESS.md#com-que-credencial-a-execução-roda).

## Proposta — corte de MVP

- [ ] Pacote `packages/runner` com um CLI: `register` (troca um código do board por um token do runner) e
      `start` (busca trabalho no board por polling, só conexões de saída).
- [ ] Para cada `run`: clona ou atualiza o repositório numa pasta do runner, cria um worktree na branch do
      card e roda `/<comando> <slug> --board <card>` com o modelo e o esforço da coluna.
- [ ] Transmite progresso para o card (`post_update`) e o tempo da execução ao final.
- [ ] Respeita `limits.maxTurnsPerStage`; Ctrl+C encerra a execução atual como `failed`.
- [ ] Um runner atende um usuário (quem registrou) e um `run` por vez no MVP.

### Fora do corte

- Várias execuções em paralelo no mesmo runner.
- Rodar como serviço do sistema.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipos do protocolo runner ↔ board |
| `packages/runner` | Pacote novo (CLI Node com o Agent SDK) |
| `apps/api` | Registro de runner, endpoint de polling, credencial `runner local` |

## Riscos e trade-offs

- Login da assinatura no runner é uso próprio: o runner nunca executa `run` disparado por outra pessoa com
  a credencial de quem o registrou.
- Worktrees acumulam disco: limpar ao concluir o card.

## Sinais de pronto

- Com o runner rodando, arrastar um card do next-boilerplate para Análise produz o plano commitado na branch
  do card e o relatório no card, sem nenhuma interação.

## Perguntas em aberto

- Agent SDK em TypeScript ou `claude -p` como subprocesso? — **recomendação:** Agent SDK (stream tipado,
  controle de turnos por execução).

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- O CLI ficou em `apps/runner`, não em `packages/runner`, e chama o `claude -p` como subprocesso em vez do Agent SDK. `docs/board/DECISIONS.md` e `docs/board/README.md` ainda dizem Agent SDK (achado A11).
- O runner grava uma nota de início e o tempo no fim; o progresso no meio da etapa depende do agente chamar `post_update`, como manda a regra do modo board.
- Além do corte: `--dangerously-skip-permissions`, `--keep-worktrees`, lista `permissions.allow` do repositório com `acceptEdits`, limpeza de execuções interrompidas, heartbeat e revogação do runner.
