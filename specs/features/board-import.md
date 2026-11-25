---
id: board-import
title: Criar board importando um repositório
status: proposed
value: alto
effort: M
audience: time
phase: 1
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [github-app-integration, github-sign-in]
contends_on: []
feature: -
updated: 2026-11-25
---

# Criar board importando um repositório

> **Resumo**
> - **O quê:** criar um board escolhendo um repositório e lendo o `.kanban/board.yml` dele.
> - **Por quê:** é o primeiro valor visível: o repositório vira colunas, com erro claro quando o arquivo está errado.
> - **Status:** `proposed` · valor alto · esforço M · time
> - **Próximo passo:** aguardando triagem

## Problema

O board só existe a partir de um repositório preparado com o kit. Criar um board é escolher o repositório,
ler o `.kanban/board.yml` dele e montar as colunas; se o arquivo estiver errado, quem importa precisa ver
exatamente o que corrigir.

## O que já existe no repo

- `packages/kanban-contract/src/boardConfig.ts` — `parseBoardConfig` e `boardConfigSchema` com as regras
  (chaves únicas, `onRework` para trás, base protegida).
- `apps/api/(shared)/repositories/base.repository.ts:59` — `BaseRepository` para a coleção `boards`.
- Slice `entity` como referência de CRUD.
- **Lacuna:** coleção `boards`, rotas e telas.

## Referências

- [`docs/board/IMPORT.md`](../../docs/board/IMPORT.md) e [`kit/`](../../kit/README.md).

## Proposta — corte de MVP

- [ ] Tela "Novo board": lista os repositórios da instalação do App; ao escolher, a API lê
      `.kanban/board.yml` na branch base e valida com `parseBoardConfig`.
- [ ] Erros de validação aparecem por campo, com o caminho (`stages[2].onRework`).
- [ ] Board criado guarda repositório, snapshot do `board.yml` e o sha lido; quem criou vira `owner`.
- [ ] "Recarregar configuração" relê o arquivo e mostra o que mudou nas colunas.
- [ ] Lista de boards do usuário.

### Fora do corte

- Cards — spec `card-backlog`. Membros — spec `board-members`.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Nenhum (usa o schema existente) |
| `packages/sdk` | Recurso `boards` |
| `apps/api` | Coleção `boards`, rotas, leitura do YAML |
| `apps/app` | Telas de lista e criação de board |
| Infra/env | Dependência de parser YAML na API |

## Riscos e trade-offs

- Um `board.yml` alterado depois da criação pode remover uma coluna com cards; recarregar deve recusar
  (ou pedir destino) quando houver cards na coluna removida.

## Sinais de pronto

- O next-boilerplate, com o kit aplicado, vira um board com as colunas do seu `board.yml`.
- Um `board.yml` com `onRework` inválido mostra o erro no campo certo.

## Perguntas em aberto

- Permitir mais de um board por repositório? — **recomendação:** não; um repositório, um board.
