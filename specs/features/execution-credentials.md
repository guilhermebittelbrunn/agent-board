---
id: execution-credentials
title: Credenciais de execução por membro
status: proposed
value: alto
effort: M
audience: confianca
phase: 2
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [board-members, local-runner]
contends_on: []
feature: -
updated: 2026-11-25
---

# Credenciais de execução por membro

> **Resumo**
> - **O quê:** cada membro dispara etapas com a própria credencial do Claude.
> - **Por quê:** sem isso o papel de operador não serve e o custo fica todo com uma pessoa.
> - **Status:** `proposed` · valor alto · esforço M · confianca
> - **Próximo passo:** aguardando triagem

## Problema

Para que outro membro arraste um card e dispare a etapa, a execução tem de rodar com a credencial **dele**,
não com a do dono do board. Sem isso, o papel `operator` não serve para nada e o custo fica todo com uma
pessoa.

## O que já existe no repo

- `packages/kanban-contract/src/roles.ts` — `canTriggerStages`.
- Runner local registrado por usuário — spec `local-runner`.
- **Lacuna:** coleção `credentials`, escolha da credencial no disparo, cifragem.

## Referências

- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#quem-paga-a-execução) — ordem de escolha da credencial.

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
