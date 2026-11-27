---
id: board-import
title: Criar board importando um repositório
status: done
value: alto
effort: M
audience: time
phase: 1
area: [apps/api, apps/app, packages/sdk, packages/kanban-contract]
depends_on: [github-app-integration, github-sign-in]
contends_on: []
feature: board-import
updated: 2026-11-27
---

# Criar board importando um repositório

> **Resumo**
> - **O quê:** criar um board escolhendo um repositório e lendo o `.kanban/board.yml` dele.
> - **Por quê:** é o primeiro valor visível: o repositório vira colunas, com erro claro quando o arquivo está errado.
> - **Status:** `done` · valor alto · esforço M · time
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

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

- Telas: [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Boards) · [Novo board](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewBoard) · [Primeiro acesso](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardsEmpty) · aba Etapas da [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/IMPORT.md`](../../board/IMPORT.md) e [`kit/`](../../../kit/README.md).

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
- O parser de YAML entra como dependência direta da API. Hoje `yaml` e `js-yaml` só aparecem como
  dependências transitivas no lockfile.

## Sinais de pronto

- O next-boilerplate, com o kit aplicado, vira um board com as colunas do seu `board.yml`.
- Um `board.yml` com `onRework` inválido mostra o erro no campo certo.

## Perguntas em aberto

- Permitir mais de um board por repositório? — **recomendação:** não; um repositório, um board.

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- O `board.yml` é lido do branch padrão do repositório (`apps/api/(shared)/lib/board-import.ts:167`), não do `baseBranch` declarado no próprio arquivo. A spec estava imprecisa: o `baseBranch` só existe depois de ler o arquivo.
- Parse do YAML, issues por campo e diff de etapas foram para `@repo/kanban-contract`, com a dependência `yaml` lá. A tabela de impacto dizia "Nenhum" para o contrato.
- As coleções se chamam `board` e `boardMember`. O id é determinístico (`owner--name`), então vale um board por repositório; a lista de repositórios mostra só aqueles em que a pessoa é admin.
