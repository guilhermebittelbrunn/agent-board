---
id: github-app-integration
title: Integração com o GitHub App do board
status: done
value: alto
effort: M
audience: confianca
phase: 1
area: [apps/api, packages/kanban-contract]
depends_on: []
contends_on: []
feature: github-app-integration
updated: 2026-11-27
---

# Integração com o GitHub App do board

> **Resumo**
> - **O quê:** o board fala com o GitHub por um App próprio: lê repositórios, consulta permissões e recebe webhooks.
> - **Por quê:** sem isso nenhuma importação, papel ou PR funciona.
> - **Status:** `done` · valor alto · esforço M · confianca
> - **Próximo passo:** nenhum. Entregue na PR #8 (merge `a19ece1`); spec arquivada em 2026-11-27.

## Problema

Para importar um repositório, consultar a permissão dos membros, ler specs e abrir PRs, o board precisa
falar com o GitHub em nome próprio, não com o token de uma pessoa. Sem isso, nenhuma das specs de board
consegue começar.

## O que já existe no repo

- Nenhum webhook com verificação de assinatura sobrou depois do `fork-cleanup` (o da cobrança saiu); o
  endpoint do GitHub é o primeiro e vira o molde.
- `apps/api/env.ts` — env tipado da API.
- **Lacuna:** nenhum cliente do GitHub, nenhum segredo de App, nenhum endpoint de webhook do GitHub.

## Referências

- Telas: [Novo board](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewBoard) · [Primeiro acesso](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardsEmpty). Mapa completo em [`docs/board/SCREENS.md`](../../board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../board/ACCESS.md#github-app-do-board) — permissões e eventos do App.
- [REST API — collaborators](https://docs.github.com/en/enterprise-cloud@latest/rest/collaborators/collaborators).

## Proposta — corte de MVP

- [ ] Credenciais do App (id, chave privada, segredo de webhook) no env da API, nunca no app.
- [ ] Token de instalação gerado sob demanda e mantido em cache até expirar.
- [ ] Listar os repositórios da instalação.
- [ ] Ler um arquivo de um repositório numa branch (para `.kanban/board.yml` e `specs/`).
- [ ] Consultar a permissão de um usuário no repositório, devolvendo o `GithubRepoRole` do
      `@repo/kanban-contract`.
- [ ] Endpoint de webhook que valida a assinatura e registra o evento; por enquanto só
      `installation_repositories` e `member` têm efeito (invalidar cache de permissão).

### Fora do corte

- Abrir PR e reagir a eventos de PR — spec `pr-flow`.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Nenhum (usa `GithubRepoRole`) |
| `apps/api` | Cliente do GitHub, rota de webhook, cache de tokens |
| Infra/env | GitHub App criado na organização; `GITHUB_APP_ID`, chave privada e segredo do webhook |

## Riscos e trade-offs

- A chave privada do App é o segredo mais sensível do board: só na API, nunca em log.
- Limites de taxa da API do GitHub: cache das permissões com expiração curta.
- Sem o App criado, a assinatura do webhook e o JWT do App se provam com segredo e chave de teste, mas os
  "Sinais de pronto" contra um repositório real ficam sem verificação até a credencial existir. A
  `board-import` depende disso para mostrar a lista de repositórios no `/test`.

## Sinais de pronto

- Com o App instalado num repositório de teste, a API lista o repositório, lê o `.kanban/board.yml` e
  devolve a permissão de um colaborador.
- Um webhook com assinatura inválida é rejeitado.

## Perguntas em aberto

- Instalar na organização inteira ou repositório a repositório? — **recomendação:** repositório a
  repositório no começo.
- Ter um cliente GitHub falso quando a API roda contra o emulador, com um repositório de exemplo? —
  **recomendação:** sim, no mesmo espírito do seed do Firebase; sem ele, `board-import` não tem como ser
  percorrida no `/test` sem credencial real.

## Nota de entrega

Conferida no código em 2026-11-27 pelo `/spec --sync`: todos os itens do corte de MVP estão implementados e entraram em `main` pela PR #8 (merge `a19ece1`). O que saiu diferente do texto acima:

- A listagem de repositórios percorre todas as instalações do App, não uma só (`apps/api/(shared)/lib/github/github-rest-client.ts:242`).
- "Registrar o evento" ficou só no log; nada é persistido. O cache de permissão vive na memória do processo (`github-permission-cache.ts:54`), então, em serverless, o webhook `member` invalida apenas a instância que o recebeu. Achado A7 da auditoria.
- Entrou um cliente GitHub falso, com repositórios de exemplo, usado quando a API roda contra o emulador (`github-fake-client.ts`). Era a recomendação da pergunta em aberto.
