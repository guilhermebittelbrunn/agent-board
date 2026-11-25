---
id: local-runner
title: Runner local com o Claude Agent SDK
status: proposed
value: alto
effort: G
audience: time
phase: 1
area: [packages/runner, apps/api, packages/kanban-contract]
depends_on: [agent-contract]
contends_on: []
feature: -
updated: 2026-11-25
---

# Runner local com o Claude Agent SDK

> **Resumo**
> - **O quê:** um CLI na máquina-alvo que roda as etapas com o Claude Agent SDK.
> - **Por quê:** o pipeline depende do ambiente local (emulador, browser, credenciais de dev).
> - **Status:** `proposed` · valor alto · esforço G · time
> - **Próximo passo:** aguardando triagem

## Problema

O pipeline hoje só funciona bem na máquina de quem desenvolve: emulador do Firebase, browser para validação
visual, credenciais de dev. O board precisa disparar etapas nessa máquina, sem abrir porta nela, usando o
login do Claude de quem registrou o runner.

## O que já existe no repo

- Contrato HTTP — spec `agent-contract`.
- `.claude/rules/board-mode.md` nos repositórios importados.
- **Lacuna:** pacote do runner.

## Referências

- Telas: [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — carrega `.claude/` do projeto,
  hooks, permissões, sessões.
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).
- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#com-que-credencial-a-execução-roda).

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
