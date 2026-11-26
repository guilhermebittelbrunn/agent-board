---
id: agent-contract
title: Contrato dos agentes (HTTP + servidor MCP)
status: in-progress
value: alto
effort: M
audience: confianca
phase: 1
area: [apps/api, packages/kanban-contract]
depends_on: [orchestrator]
contends_on: []
feature: agent-contract
updated: 2026-11-26
---

# Contrato dos agentes (HTTP + servidor MCP)

> **Resumo**
> - **O quê:** as ferramentas que os agentes chamam para ler e escrever no card, com token por execução.
> - **Por quê:** é a única ponte entre a sessão do Claude Code e o board, local ou na nuvem.
> - **Status:** `in-progress` · valor alto · esforço M · confianca
> - **Próximo passo:** `/develop` (plano em `docs/features/agent-contract/analyze/plan.md`)

## Problema

Os agentes precisam ler o card, escrever no card, perguntar e encerrar a etapa. Isso tem de funcionar igual
para o runner local (HTTP) e para sessões na nuvem (MCP como connector), com um token que só vale para aquela
execução.

## O que já existe no repo

- `packages/kanban-contract/src/agentContract.ts` — `AGENT_CONTRACT_TOOLS` com os schemas de entrada.
- Regra do lado do agente: `.claude/rules/board-mode.md`.
- **Lacuna:** rotas HTTP, servidor MCP, token de execução.

## Referências

- Telas: relatório da etapa no [Card aguardando PR](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/CONTRACT.md`](../../docs/board/CONTRACT.md).
- [Scheduled tasks — connectors](https://code.claude.com/docs/en/routines) (connectors passam pelos servidores
  da Anthropic, sem liberar domínio no ambiente).

## Proposta — corte de MVP

- [ ] Token de execução emitido pelo orquestrador por `run`, curto e revogado no `complete_stage`.
- [ ] Rotas HTTP para as seis ferramentas, validando com os schemas do contrato.
- [ ] Servidor MCP `kanban` (HTTP remoto) expondo as mesmas ferramentas.
- [ ] `get_card` devolve spec, slug, branch, etapa, respostas pendentes e artefatos.
- [ ] `complete_stage` idempotente por `run`.
- [ ] Testes de contrato: payload inválido é recusado com código; token de outro card é recusado.

### Fora do corte

- `create_card` com quebra de épico automática (a ferramenta existe; o uso pelo planejador vem depois).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Nenhum (usa os schemas existentes) |
| `apps/api` | Rotas do contrato, servidor MCP, emissão e verificação de token |
| Infra/env | URL pública da API para o connector MCP |

## Riscos e trade-offs

- Markdown e perguntas vindos do agente são dados não confiáveis: limite de tamanho (já no schema) e
  renderização sem HTML.

## Sinais de pronto

- `claude -p "/develop <slug> --board <card>"` com o MCP configurado escreve no card e o move ao terminar.

## Perguntas em aberto

- Autenticação do MCP remoto: token no header ou OAuth? — **recomendação:** token de execução no header no
  MVP.
