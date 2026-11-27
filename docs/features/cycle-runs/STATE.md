---
slug: cycle-runs
title: Ciclo, levar uma ou várias specs de ponta a ponta
task: -
spec: cycle-runs
branch: -
epic: -
updated: 2026-11-27 08:16
---

# Pipeline — Ciclo, levar uma ou várias specs de ponta a ponta

| etapa   | status  | quando           | artefato        | resumo (1 linha) |
|---------|---------|------------------|-----------------|------------------|
| analyze | done    | 2026-11-27 06:10 | analyze/plan.md | Fatia 1 de 2: coleção `cycle` com fila por board, avanço no `completeRun`, transição sem aprovação e com parada em Testando ou na PR, `decisions` no `complete_stage`, recusa de `ask` no ciclo, `--cycle` no runner, telas Ciclos/Novo ciclo/Ciclo em leitura e botão Parar |
| develop | done    | 2026-11-27 06:47 | develop/handoff.md | Fatia 1 implementada: contrato, SDK, coleção `cycle` com fila por `runningCycleId`, avanço em `completeRun`/`stopRun`, recusa de `ask`, `--cycle` no runner, telas Ciclos/Novo ciclo/Ciclo e selo; gates verdes e dois casos novos no emulador |
| review  | done    | 2026-11-27 07:45 | review/review.md | Sem bloqueante; ciclo `running` que nunca avançou ficava preso, agora a leitura do detalhe inicia os pendentes; fluxo de fim de run, avanço e parada conferidos; 15 commits propostos |
| test    | done    | 2026-11-27 08:16 | test/report.md  | 17 de 18 critérios PASS; selo ausente no card pendente do ciclo (🟡); dois casos novos no emulador (`stopCycle`, `onFailure: stop`); `pnpm test` 14/14, `pnpm e2e` 20/20; mensagens dos commits da feature deslocadas em um, para o `/review` refazer antes do push |
| observe | pending | -                | -               | - (opcional)     |

## Notas

- A spec está `proposed`. O usuário pediu para executar nesta noite, pelo `/cycle`, o máximo de specs possível;
  esta entrou na rodada sem aprovação formal e o status do arquivo não muda (aprovar é decisão dele).
- Rodada autônoma do `/cycle`: as 12 decisões adotadas sem pergunta estão em "Perguntas em aberto" do plano.
- Esforço G em duas entregas. Ficam para a fatia 2: pausar e retomar, "Mudar" e "Concordo" nas decisões,
  pendências de infra na tela do ciclo e o aviso de spec dependente.
- Sem pré-requisito manual de infra que bloqueie a entrega. O repositório importado precisa da seção nova do
  kit (§2.1 da regra do modo board); sem ela, a API recusa o `ask` e a spec sai do ciclo.
