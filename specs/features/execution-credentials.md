---
id: execution-credentials
title: Credenciais de execução por membro
status: in-progress
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
> - **Status:** `in-progress` · valor alto · esforço M · confianca · implementada na branch, na PR #12; aprovada pelo usuário em 2026-11-27, depois de rodar
> - **Próximo passo:** mergear a PR #12 (CI verde em `26eaf1f`) e arquivar no próximo `/spec --sync`

## Problema

Para que outro membro arraste um card e dispare a etapa, a execução tem de rodar com a credencial **dele**,
não com a do dono do board. Sem isso, o papel `operator` não serve para nada e tudo roda na conta
de uma pessoa só.

## O que já existe no repo

- `packages/kanban-contract/src/roles.ts` — `canTriggerStages`.
- Runner local registrado por usuário — spec `local-runner`.
- **Lacuna:** coleção `credentials`, escolha da credencial no disparo, cifragem.

## Referências

- Telas: [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials) · [Operador sem credencial](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CredentialsEmpty) · [Disparar etapa](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-TriggerStage). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#com-que-credencial-a-execução-roda) — ordem de escolha da credencial.

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

## Nota de andamento (2026-11-27)

Implementada em 2026-11-27 na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (rodada autônoma do `/cycle`), com analyze, develop, review e test em `docs/features/execution-credentials/`. A spec estava `proposed` e entrou na rodada sem aprovação formal, porque o usuário pediu para executar o máximo de specs possível naquela noite. Aprovar continua sendo decisão dele. A branch não tem PR, push nem CI; por isso a spec está `in-progress` e não foi arquivada.

Conferido no código: coleção `credential` cifrada com AES-256-GCM (`apps/api/(shared)/lib/credentials/secret-box.ts`, chave em `credentials-key.ts`), rotas `boards/[id]/credentials` e `credentials/scheduled-tasks/[stageKey]`, seção da nuvem em Minhas credenciais, escolha do executor por `stage.runners` e o motivo `no_credential` no contrato (`packages/kanban-contract/src/run.ts:21`). `operator` já disparava antes (`roles.ts:48`). O `/test` fechou 17 de 17 critérios.

Diferenças em relação ao texto acima: o `run` grava quem disparou (`triggeredBy`), o tipo de executor e o `runnerId` do claim, mas não o id da credencial da nuvem, que só passa a ser usada com o adapter da `cloud-routines-runner`. O cadastro da etapa `spec` foi para o corte da `cloud-routines-runner`. Em aberto com o usuário: o `DELETE` da própria credencial exige `trigger`, então quem virou `viewer` não consegue apagar o segredo que cadastrou. Infra: `CREDENTIALS_ENCRYPTION_KEY` no env de produção da API (`docs/PRE-PRODUCTION.md`).
