---
id: github-app-integration
title: Integração com o GitHub App do board
status: proposed
value: alto
effort: M
audience: confianca
phase: 1
area: [apps/api, packages/kanban-contract]
depends_on: []
contends_on: []
feature: -
updated: 2026-11-25
---

# Integração com o GitHub App do board

> **Resumo**
> - **O quê:** o board fala com o GitHub por um App próprio: lê repositórios, consulta permissões e recebe webhooks.
> - **Por quê:** sem isso nenhuma importação, papel ou PR funciona.
> - **Status:** `proposed` · valor alto · esforço M · confianca
> - **Próximo passo:** aguardando triagem

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

- Telas: [Novo board](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewBoard) · [Primeiro acesso](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardsEmpty). Mapa completo em [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#github-app-do-board) — permissões e eventos do App.
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

## Sinais de pronto

- Com o App instalado num repositório de teste, a API lista o repositório, lê o `.kanban/board.yml` e
  devolve a permissão de um colaborador.
- Um webhook com assinatura inválida é rejeitado.

## Perguntas em aberto

- Instalar na organização inteira ou repositório a repositório? — **recomendação:** repositório a
  repositório no começo.
