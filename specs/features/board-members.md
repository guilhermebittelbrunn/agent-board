---
id: board-members
title: Membros, convites e papéis do board
status: proposed
value: alto
effort: M
audience: confianca
phase: 1
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [board-import]
contends_on: []
feature: -
updated: 2026-11-25
---

# Membros, convites e papéis do board

> **Resumo**
> - **O quê:** convidar pessoas por login do GitHub, com papéis limitados pela permissão no repositório.
> - **Por quê:** o board é colaborativo, mas ninguém pode ver ou disparar mais do que pode no GitHub.
> - **Status:** `proposed` · valor alto · esforço M · confianca
> - **Próximo passo:** aguardando triagem

## Problema

O board é colaborativo: o dono quer chamar outra pessoa para acompanhar as tarefas e, mais adiante, para
arrastar cards e disparar etapas. Sem papéis, qualquer convidado poderia disparar execuções pagas por
outra pessoa ou ver repositórios a que não tem acesso no GitHub.

## O que já existe no repo

- `packages/kanban-contract/src/roles.ts` — `BOARD_ROLES`, `GITHUB_REPO_ROLES`, `resolveEffectiveRole`,
  `canViewBoard`, `canTriggerStages`, `canManageMembers`, `canConfigureBoard`, com testes.
- `apps/api/app/(guards)/common-panel.ts:30` — padrão de guard por rota.
- Consulta de permissão no GitHub — spec `github-app-integration`.
- `apps/api/(shared)/repositories/entity.repository.ts` — escopo por dono no repositório (`ownedBy`,
  `findOwnedBy`), o padrão que o escopo por board vai seguir. As organizações do core, que tinham membros e
  convites, saíram no `fork-cleanup`.
- **Lacuna:** coleção `members`, convites e guard por papel efetivo.

## Referências

- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md) — papéis, regra do papel efetivo e quando checar.

## Proposta — corte de MVP

- [ ] Guard de board: toda rota de board resolve o papel efetivo (papel no board limitado pela permissão
      no GitHub) e responde `403` com código quando não basta.
- [ ] Convite por login do GitHub, com papel; pendente até a pessoa entrar pela primeira vez.
- [ ] Só `maintainer`/`owner` convidam; ninguém convida acima do próprio papel.
- [ ] Lista de membros com papel no board, papel efetivo e data da última checagem.
- [ ] Remover membro e mudar papel.
- [ ] Webhook `member` do repositório invalida o cache de permissão.

### Fora do corte

- Disparo de etapa pelo `operator` com a própria credencial — spec `execution-credentials`. No MVP, o
  papel existe e aparece, mas só o dono dispara.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Nenhum (usa `roles.ts`) |
| `packages/sdk` | Recurso `members` |
| `apps/api` | Coleção `members`, guard de board, rotas de convite |
| `apps/app` | Tela de membros do board |
| Infra/env | Regras do Firestore negam acesso direto (tudo via API) |

## Riscos e trade-offs

- Cache de permissão longo deixa ex-colaborador ver o board: expiração curta e checagem obrigatória antes
  de cada disparo.

## Sinais de pronto

- Um `viewer` vê o board e não vê ações de disparo; a API recusa o disparo dele mesmo chamada direto.
- Alguém com `operator` no board e só `read` no GitHub aparece como `viewer` efetivo.

## Perguntas em aberto

- Convidar por e-mail também? — **recomendação:** não; só login do GitHub.
