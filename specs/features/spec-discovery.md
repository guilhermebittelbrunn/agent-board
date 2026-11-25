---
id: spec-discovery
title: Descobrir specs novas pelo board
status: proposed
value: médio
effort: M
audience: time
phase: 3
area: [packages/kanban-contract, packages/sdk, apps/api, apps/app, kit]
depends_on: [spec-authoring]
contends_on: [packages/kanban-contract/src/agentContract.ts]
feature: -
updated: 2026-11-25
---

# Descobrir specs novas pelo board

> **Resumo**
> - **O quê:** pedir ao board uma rodada de descoberta: um agente lê o código e o backlog, olha ferramentas parecidas e devolve propostas de spec, cada uma com evidência.
> - **Por quê:** o `/spec` já faz isso no terminal; no board, as propostas ficam junto do backlog e viram rascunho com um clique.
> - **Status:** `proposed` · valor médio · esforço M · time
> - **Próximo passo:** aguardando triagem

## Problema

Achar o que falta construir depende de rodar `/spec` sem argumento no terminal, escolher o foco e triar o
lote na conversa. O resultado fica nos arquivos e na conversa, e quem acompanha pelo board não vê as
propostas nem participa da triagem.

## O que já existe no repo

- `.claude/commands/spec.md` — modo descoberta: pergunta o foco (produto, dx, confiança ou equilibrado) e
  o tamanho do lote, e aciona o `estrategista-produto` com a skill `market-research`.
- `.claude/skills/market-research/` — pesquisa com fontes e data.
- `packages/kanban-contract/src/agentContract.ts` — `create_card`, que já deixa um agente criar card no
  backlog.
- Spec `spec-authoring` — coluna Rascunhos e aprovação de spec.
- **Lacuna:** disparo da descoberta pelo board, um lugar para as propostas e a decisão sobre cada uma.

## Referências

- Telas: [Descobrir specs](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Discover) ·
  [Propostas de uma descoberta](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DiscoverResults)
  · aba Specs da [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings). Mapa
  completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).

## Proposta — corte de MVP

- [ ] Página Descobertas: escolher onde procurar (código, backlog, web), o foco (as mesmas opções do
      `/spec`), um contexto livre e quantas propostas.
- [ ] A descoberta roda `/spec --board <descoberta>` no runner de quem pediu e não escreve no repositório.
- [ ] Ferramenta nova no contrato, `propose_spec`: título, spec em markdown, valor, esforço, dependências e
      evidências (no código, no backlog ou em fonte externa com URL).
- [ ] Cada proposta pode ser aceita (vira card em Rascunhos com a spec pronta para aprovar), aceita com
      refinamento (vira rascunho e o agente pergunta antes) ou descartada com motivo.
- [ ] Histórico das descobertas do board, com quantas propostas foram aceitas e descartadas. Proposta
      descartada não volta nas descobertas seguintes.
- [ ] A configuração do board liga ou desliga a pesquisa na web.

### Fora do corte

- Descoberta agendada.
- Votação entre membros.
- Juntar duas propostas numa só.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Schema de `propose_spec` e de evidência |
| `kit/` | Modo board no `/spec` sem argumento: foco e lote vêm do disparo, sem `AskUserQuestion` |
| `packages/sdk` | Recurso `discoveries` |
| `apps/api` | Coleção `discoveries` com as propostas e a decisão de cada uma; aceitar cria card em Rascunhos |
| `apps/app` | Páginas Descobertas e Propostas |

## Riscos e trade-offs

- Fonte externa é conteúdo não confiável. A proposta mostra a URL, e o texto da página não entra como
  instrução em nenhum agente.
- Proposta sem evidência é palpite. A API recusa proposta sem ao menos uma evidência.

## Sinais de pronto

- Uma descoberta no agent-board devolve propostas com evidência, e aceitar uma cria o card em Rascunhos.
- Uma proposta descartada não reaparece na descoberta seguinte.

## Perguntas em aberto

- Proposta aceita deve ser escrita de volta no `BACKLOG.md` da base? — **recomendação:** não; a ordem vale
  no board, como em `card-backlog`.
