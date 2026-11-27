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
contends_on: ["apps/api/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts"]
feature: null
updated: 2026-11-27
---

# Executor na nuvem com tarefas agendadas do Claude Code

> **Resumo**
> - **O quê:** etapas rodando na nuvem da Anthropic por tarefas agendadas com gatilho de API.
> - **Por quê:** o board não pode parar quando o notebook dorme.
> - **Status:** `proposed` · valor médio · esforço M · time
> - **Próximo passo:** aprovar; só pode começar depois do merge da `execution-credentials`, que está na branch da noite sem PR

## Problema

Com só o runner local, o board para quando o notebook dorme. As tarefas agendadas do Claude Code (antigas
routines) rodam sessões completas na nuvem da Anthropic e aceitam disparo por API, usando a assinatura de
quem as criou.

## O que já existe no repo

- Interface de executor — spec `orchestrator`. Contrato MCP — spec `agent-contract`.
- `.kanban/setup.sh` gerado pelo kit para preparar o ambiente de nuvem.
- Cadastro da URL e do token de disparo por etapa, entregue pela `execution-credentials` na branch
  `guilhermebittelbrunn/chore-overnight-cycle-specs` (ainda fora de `main`): coleção `credential` cifrada com
  AES-256-GCM, rotas `boards/[id]/credentials/scheduled-tasks/[stageKey]`, seção da nuvem em Minhas credenciais e
  escolha do executor por `stage.runners`, com o motivo `no_credential` no card.
- **Lacuna:** adapter de disparo, guia de criação da tarefa e cadastro para a etapa `spec`.

## Referências

- Telas: tarefas agendadas em [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines) — `POST …/routines/{id}/fire`
  com `Authorization: Bearer`, header beta `experimental-cc-routine-2026-04-01`, campo `text`, resposta
  com a URL da sessão; 30 disparos/h por tarefa e 100/h por conta; o texto chega marcado como não confiável.

## Proposta — corte de MVP

- [ ] Guia no board para o membro criar uma tarefa por etapa (prompt padrão que lê os parâmetros do bloco de
      disparo e roda `/<comando> <slug> --board <card>`), com o connector MCP `kanban` incluído.
- [x] Cadastro da URL e do token de disparo como credencial do tipo `tarefa agendada`. Entregue pela
      `execution-credentials` (2026-11-27, aguardando PR), uma credencial por etapa.
- [ ] Cadastro também para a etapa `spec`: hoje a rota `PUT …/credentials/scheduled-tasks/<etapa>` só aceita
      etapas de `config.stages` e a tabela de Minhas credenciais não tem linha para ela, enquanto a escolha do
      executor já lê `specAuthoring.runners`. Um board com `specAuthoring.runners: [cloud]` recusa o rascunho
      com `RUN_NO_CREDENTIAL_FOR_STAGE` sem lugar para cadastrar. Resolver a etapa por `stageRunnersOf` na rota e
      acrescentar a linha.
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

- Uma tarefa por etapa ou uma tarefa única que recebe a etapa no texto? A recomendação original era uma única
  por repositório no MVP (menos cadastro), com o modelo fixo em Sonnet. A `execution-credentials` já gravou o
  cadastro por etapa. **Recomendação agora:** manter por etapa e deixar o membro repetir a mesma URL nas
  etapas que quiser; voltar à tarefa única exigiria mudar o modelo de dados recém-feito.
