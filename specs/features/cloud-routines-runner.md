---
id: cloud-routines-runner
title: Executor na nuvem com tarefas agendadas do Claude Code
status: proposed
value: médio
effort: M
audience: time
phase: 2
area: [apps/api, apps/app, packages/kanban-contract]
depends_on: [agent-contract, execution-credentials]
contends_on: []
feature: -
updated: 2026-11-25
---

# Executor na nuvem com tarefas agendadas do Claude Code

> **Resumo**
> - **O quê:** etapas rodando na nuvem da Anthropic por tarefas agendadas com gatilho de API.
> - **Por quê:** o board não pode parar quando o notebook dorme.
> - **Status:** `proposed` · valor médio · esforço M · time
> - **Próximo passo:** aguardando triagem

## Problema

Com só o runner local, o board para quando o notebook dorme. As tarefas agendadas do Claude Code (antigas
routines) rodam sessões completas na nuvem da Anthropic e aceitam disparo por API, usando a assinatura de
quem as criou.

## O que já existe no repo

- Interface de executor — spec `orchestrator`. Contrato MCP — spec `agent-contract`.
- `.kanban/setup.sh` gerado pelo kit para preparar o ambiente de nuvem.
- **Lacuna:** adapter de disparo, cadastro das tarefas por etapa.

## Referências

- Telas: tarefas agendadas em [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines) — `POST …/routines/{id}/fire`
  com `Authorization: Bearer`, header beta `experimental-cc-routine-2026-04-01`, campo `text`, resposta
  com a URL da sessão; 30 disparos/h por tarefa e 100/h por conta; o texto chega marcado como não confiável.

## Proposta — corte de MVP

- [ ] Guia no board para o membro criar uma tarefa por etapa (prompt padrão que lê os parâmetros do bloco de
      disparo e roda `/<comando> <slug> --board <card>`), com o connector MCP `kanban` incluído.
- [ ] Cadastro da URL e do token de disparo como credencial do tipo `tarefa agendada`.
- [ ] Adapter que dispara com `text` contendo só campos esperados (card, slug, etapa, branch, modelo) e
      guarda a URL da sessão no `run`.
- [ ] Erros de limite (429) e de autenticação (401) viram mensagem clara no card.

### Fora do corte

- Criar as tarefas automaticamente (não há API para isso; só para disparar).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Formato do texto de disparo |
| `apps/api` | Adapter de nuvem |
| `apps/app` | Guia e cadastro das tarefas por etapa |

## Riscos e trade-offs

- Recurso em research preview: o header beta pode mudar; isolar no adapter.
- O modelo da sessão é o da tarefa; o modelo da etapa vai para o subagente pelo prompt.

## Sinais de pronto

- Com o notebook fechado, uma etapa disparada pelo board roda na nuvem, commita na branch do card e o move.

## Perguntas em aberto

- Uma tarefa por etapa ou uma tarefa única que recebe a etapa no texto? — **recomendação:** uma única por
  repositório no MVP (menos cadastro), com o modelo fixo em Sonnet.
