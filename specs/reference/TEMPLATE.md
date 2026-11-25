---
id: <slug-em-ingles>
title: <título curto em português>
status: proposed
value: <alto | médio | baixo>
effort: <P | M | G>
audience: <time | dx | confianca>
phase: <0-4>
area: [<apps/api>, <apps/app>, <packages/...>]
depends_on: []      # ordem: ids de specs que precisam vir ANTES desta
contends_on: []     # contenção: arquivos compartilhados EXISTENTES que esta spec ALTERA (0–3)
feature: -
updated: <YYYY-MM-DD>
---

# <Título>

> **Resumo**
> - **O quê:** <a capacidade nova, em uma frase>
> - **Por quê:** <a dor que resolve, para quem usa o board>
> - **Status:** `proposed` · valor <alto/médio/baixo> · esforço <P/M/G> · <time/dx/confianca>
> - **Próximo passo:** <`/analyze <id>` | aguardando triagem | aguardando <decisão>>

## Problema

Qual dor existe hoje, para quem usa o board, e o que acontece se nada for feito. 3–6 linhas.

## O que já existe no repo

- `caminho/arquivo.ts:NN` — <o que já resolve / até onde vai>
- **Lacuna:** <o que falta, objetivamente>

## Referências

- <documentação externa com URL> · <decisão em ../../docs/board/...>

## Proposta — corte de MVP

- [ ] <capacidade 1 — observável>
- [ ] <capacidade 2>

### Fora do corte

- <o que fica para depois, e por quê>

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | <tipos/regras novas? ou nenhum> |
| `packages/sdk` | <recurso/DTO novo?> |
| `apps/api` | <rotas, guard, coleção, webhook> |
| `apps/app` | <telas> |
| Infra/env | <variável nova, índice, regra do Firestore, serviço externo> |

## Riscos e trade-offs

- <risco>

## Sinais de pronto

- <observável>

## Perguntas em aberto

- <decisão> — **recomendação:** <default>
