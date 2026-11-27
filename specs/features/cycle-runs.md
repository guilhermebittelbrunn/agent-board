---
id: cycle-runs
title: Ciclo — levar uma ou várias specs de ponta a ponta
status: in-progress
value: alto
effort: G
audience: time
phase: 2
area: [packages/kanban-contract, packages/sdk, apps/api, apps/app, kit]
depends_on: [orchestrator, agent-contract, pr-flow]
contends_on: [packages/kanban-contract/src/cardState.ts, packages/kanban-contract/src/agentContract.ts]
feature: cycle-runs
updated: 2026-11-27
---

# Ciclo — levar uma ou várias specs de ponta a ponta

> **Resumo**
> - **O quê:** escolher uma ou mais specs em Tarefas, e o board leva cada uma da Análise até a PR sem parar para perguntar, decidindo pela política do repositório e registrando cada decisão.
> - **Por quê:** é o `/cycle` dentro do board, para várias specs: dá para deixar o backlog andando e revisar as decisões depois.
> - **Status:** `in-progress` · valor alto · esforço G · time · implementada na branch, aguardando PR (fatia 1 de 2)
> - **Próximo passo:** decidir a aprovação (a fatia 1 rodou sem ela, a pedido do usuário); mergear a fatia 1 e depois `/analyze cycle-runs` para a fatia 2

## Problema

No board, uma etapa para quando o agente tem uma pergunta ou quando a aprovação do plano está ligada. Isso é
o certo quando alguém acompanha, mas impede deixar o backlog andando sem ninguém olhando. O `/cycle`
resolve isso no terminal, uma spec por vez e sem commit. O board precisa do mesmo comportamento para várias
specs, com commit na branch de cada card e um relatório do que foi decidido sem você.

## O que já existe no repo

- `.claude/commands/cycle.md` — ciclo no terminal: decide pela escada spec → padrão do repositório → menor
  impacto e junta as perguntas para o fim.
- `.claude/cycle-policy.md` — decisões que o usuário já tomou; vence a escada.
- `.claude/rules/board-mode.md` §2 — no modo board, decisão técnica com recomendação clara é aplicada e
  registrada; pergunta de produto vira `ask`.
- `packages/kanban-contract/src/cardState.ts` — `resolveTransition`, com aprovação opcional e limite de
  retrabalho.
- **Lacuna:** o ciclo em si (specs em ordem, opções, estado), o modo de etapa que nunca pergunta e as
  decisões estruturadas no fim de cada etapa.

## Referências

- Telas: [Novo ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleStart) ·
  [Ciclo em andamento](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleRun) · selo de ciclo
  no [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main) · aba Ciclo e agenda da
  [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings). Mapa completo em
  [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`.claude/commands/cycle.md`](../../.claude/commands/cycle.md) e
  [`.claude/cycle-policy.md`](../../.claude/cycle-policy.md).

## Proposta — corte de MVP

- [ ] Novo ciclo: escolher specs de Tarefas, na ordem em que vão rodar. Opções: até onde vai (Testando ou
      abrir a PR), quantas ao mesmo tempo (uma, ou até duas com dois runners livres) e o que fazer se uma
      falhar (pular para a próxima ou parar).
- [ ] Um ciclo novo, com outro rodando, entra na fila.
- [ ] Dentro do ciclo, as etapas rodam com `--board <card> --cycle <ciclo>`: o agente nunca chama `ask`,
      decide pela política e registra cada decisão.
- [ ] `complete_stage` aceita uma lista de decisões: o que foi decidido, a regra usada (política,
      recomendação da spec, padrão do repositório ou menor impacto) e se a decisão é de produto. Decisão de
      produto fica marcada para revisão.
- [ ] Dentro do ciclo a aprovação do plano é pulada. Aprovação de spec não, porque só entra no ciclo spec
      que já está em Tarefas.
- [ ] Tela do ciclo: andamento por spec e etapa, decisões tomadas sem você, decisões marcadas para revisão,
      atividade recente e pendências de infraestrutura anotadas pelos agentes.
- [ ] "Mudar" uma decisão devolve aquela spec à etapa da decisão, com a nova resposta, quando o ciclo
      terminar.
- [ ] Pausar depois da etapa atual e parar o ciclo.
- [ ] O ciclo nunca faz merge. As PRs abrem como rascunho, como na spec `pr-flow`.

### Fora do corte

- Agenda: spec `cycle-schedule`.
- Mais de duas specs ao mesmo tempo.
- Ciclo que começa em Rascunhos.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipo do ciclo e das opções; decisões em `complete_stage`; transição que pula a aprovação do plano dentro do ciclo |
| `kit/` | Variante de ciclo no `board-mode.md` e nos comandos do pipeline |
| `packages/sdk` | Recurso `cycles` |
| `apps/api` | Coleção `cycles`; o orquestrador avança a fila do ciclo, pausa e para |
| `apps/app` | Telas Novo ciclo e Ciclo; selo de ciclo no card |

## Riscos e trade-offs

- Uma decisão errada no começo contamina as etapas seguintes. A tela mostra a regra usada em cada decisão
  para a revisão ser rápida.
- Specs dependentes no mesmo ciclo: a segunda sai da base sem o código da primeira. No MVP, o ciclo avisa na
  escolha quando uma spec depende de outra que ainda não foi mergeada.
- O retrabalho conta no limite de voltas como fora do ciclo. No limite, a spec sai do ciclo como
  "aguardando você" e o ciclo segue com as outras.

## Sinais de pronto

- Um ciclo com três specs do agent-board termina com três PRs em rascunho e um relatório com todas as
  decisões.
- Uma decisão mudada na tela do ciclo faz a spec voltar à etapa certa quando o ciclo termina.

## Perguntas em aberto

- Specs dependentes no mesmo ciclo: avisar, bloquear ou empilhar as branches? — **recomendação:** avisar no
  MVP.
- O que conta como decisão de produto marcada para revisão? — **recomendação:** o que o modo board hoje
  mandaria como `ask`.

## Nota de andamento (2026-11-27)

A fatia 1 de 2 foi implementada em 2026-11-27 na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (rodada autônoma do `/cycle`), com analyze, develop, review e test em `docs/features/cycle-runs/`. A spec estava `proposed` e entrou na rodada sem aprovação formal, porque o usuário pediu para executar o máximo de specs possível naquela noite. Aprovar continua sendo decisão dele. A branch não tem PR, push nem CI.

Fatia 1, conferida no código: domínio do ciclo no contrato (`packages/kanban-contract/src/cycle.ts`), `decisions` no `complete_stage` (`agentContract.ts:80`), recusa de `ask` dentro do ciclo (`AGENT_ASK_IN_CYCLE`), `--cycle` no prompt do runner (`apps/runner/src/session.ts:24`), rotas `boards/[id]/cycles`, `cycles/[cycleId]` e `cycles/[cycleId]/stop`, telas Ciclos, Novo ciclo e Ciclo, e o selo no quadro. O `/test` fechou 17 de 18 critérios.

Fatia 2, ainda não feita: pausar e retomar, "Mudar" e "Concordo" nas decisões, pendências de infraestrutura na tela do ciclo e o aviso de spec dependente (`depends_on`). Pendências da fatia 1: o card pendente de um ciclo `running` fica em Tarefas sem o selo "Ciclo" até a etapa dele disparar, e ninguém mediu o que o ciclo faz se a pessoa arrastar esse card para fora; com `onFailure: stop` e duas specs ao mesmo tempo, o próximo ciclo da fila começa antes de a spec viva terminar a etapa (decisão Q6 do plano).
