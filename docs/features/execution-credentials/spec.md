---
id: execution-credentials
title: Credenciais de execução por membro
status: done
value: alto
effort: M
audience: confianca
phase: 2
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [board-members, local-runner]
contends_on: []
feature: execution-credentials
updated: 2026-11-27
---

# Credenciais de execução por membro

> **Resumo**
> - **O quê:** cada membro dispara etapas com a própria credencial do Claude.
> - **Por quê:** sem isso o papel de operador não serve e tudo roda na conta de uma pessoa só.
> - **Status:** `done` · valor alto · esforço M · confianca · aprovada pelo usuário em 2026-11-27, depois de rodar
> - **Próximo passo:** nenhum. Entregue na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (PR #12); spec arquivada em 2026-11-27. Depois do merge, definir `CREDENTIALS_ENCRYPTION_KEY` no env de produção da API.

## Problema

Para que outro membro arraste um card e dispare a etapa, a execução tem de rodar com a credencial **dele**,
não com a do dono do board. Sem isso, o papel `operator` não serve para nada e tudo roda na conta
de uma pessoa só.

## O que já existe no repo

- `packages/kanban-contract/src/roles.ts` — `canTriggerStages`.
- Runner local registrado por usuário — spec `local-runner`.
- **Lacuna:** coleção `credentials`, escolha da credencial no disparo, cifragem.

## Referências

- Telas: [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials) · [Operador sem credencial](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CredentialsEmpty) · [Disparar etapa](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-TriggerStage). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../board/ACCESS.md#com-que-credencial-a-execução-roda) — ordem de escolha da credencial.

## Proposta — corte de MVP

- [ ] Coleção `credentials` com dono (membro), tipo (`runner local`, `tarefa agendada` por etapa) e
      referência cifrada; segredos nunca voltam para o app.
- [ ] Tela "Minhas credenciais" no board: runners registrados e tarefas agendadas cadastradas por etapa.
- [ ] No disparo, o orquestrador escolhe a credencial de quem disparou que sirva ao executor da etapa; sem
      nenhuma, recusa com o motivo no card.
- [ ] `operator` passa a disparar.
- [ ] `runs` registram quem disparou e qual credencial foi usada.

### Fora do corte

- API key do board como fallback (fase 4).

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Tipos de credencial e regra de escolha |
| `packages/sdk` | Recurso `credentials` (sem segredos) |
| `apps/api` | Coleção `credentials`, cifragem, escolha no disparo |
| `apps/app` | Tela de credenciais |
| Infra/env | Chave de cifragem da API |

## Riscos e trade-offs

- Vazamento de tokens de disparo permite rodar tarefas na conta de alguém: cifrar em repouso, mostrar só
  os últimos caracteres, permitir revogar.

## Sinais de pronto

- Um `operator` com runner próprio arrasta um card e os commits saem no nome dele.
- Um `operator` sem credencial recebe a recusa com o motivo no card.

## Perguntas em aberto

- Cifragem com chave própria no env ou KMS do Google Cloud? — **recomendação:** chave no env no MVP.

## Nota de entrega

Conferida no código da branch `guilhermebittelbrunn/chore-overnight-cycle-specs` em 2026-11-27, no fechamento (`/spec --sync execution-credentials`), depois do `/test`. Os cinco itens do corte estão implementados:

- Coleção de credenciais cifrada: tipos `local_runner` e `scheduled_task` (`packages/kanban-contract/src/credential.ts:10`), AES-256-GCM em `apps/api/(shared)/lib/credentials/secret-box.ts:3` e a chave `CREDENTIALS_ENCRYPTION_KEY` em `credentials-key.ts:40`. O app só recebe os últimos caracteres do token (`tokenLast4`, `apps/api/(shared)/mappers/credential.mapper.ts:27`).
- Tela Minhas credenciais: `boards/(pages)/[id]/credentials/BoardCredentialsClient.tsx`, servida por `GET boards/[id]/credentials` (`credentials/route.ts:9`) e por `PUT`/`DELETE credentials/scheduled-tasks/[stageKey]` (`route.ts:18`, `:68`).
- Escolha no disparo: `chooseStageExecutor` (`credential.ts:66`) segue `stage.runners`; sem credencial, a API recusa com `RUN_NO_CREDENTIAL_FOR_STAGE` (`boards/[id]/cards/[slug]/runs/route.ts:36`) e o card mostra o motivo `no_credential` (`packages/kanban-contract/src/run.ts:21`).
- `operator` dispara: `roles.ts:48`. Já era assim antes desta feature.
- O `run` registra quem disparou (`triggeredBy`, `run.ts:71`).

O `/test` fechou 17 de 17 critérios, com `pnpm test` duas vezes verde e `pnpm e2e` 20/20. Fica 🔒 a oferta do Chrome para salvar o token, que só se mede à mão.

O que saiu diferente do texto acima:

- O `run` grava `triggeredBy`, o tipo de executor e o `runnerId` do claim, mas não o id da credencial da nuvem, que só passa a ser usada com o adapter da `cloud-routines-runner`. A spec estava imprecisa.
- Sem credencial, a recusa é `no_runner` quando a etapa aceita runner local e `no_credential` quando não aceita.
- O cadastro da etapa `spec` foi para o corte da `cloud-routines-runner`.

Em aberto com o usuário (achado A18 do `specs/reference/AUDIT.md`): o `DELETE` da própria credencial exige `trigger`, então quem virou `viewer` não consegue apagar o segredo que cadastrou.
