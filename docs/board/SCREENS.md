# Telas

O desenho das telas está num canvas do Claude Design:
[Agent Board — Telas](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt). O canvas é privado; quem precisar
ver pede acesso ao dono. Cada link abaixo abre a tela no canvas, e a coluna da direita diz que spec a
constrói.

O celular não tem spec própria: cada spec entrega a sua tela responsiva, e o `/test` percorre o fluxo no
celular e nos dois temas (regra de ouro 11 do [`CLAUDE.md`](../../CLAUDE.md)).

## 1 · Entrada

| Tela | Specs |
|------|-------|
| [Entrar](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Login) | `github-sign-in` |
| [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Boards) | `board-import`; ciclo noturno de `cycle-schedule` |
| [Novo board](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewBoard) | `board-import`, `github-app-integration` |

## 2 · Quadro, disparo e cards

| Tela | Specs |
|------|-------|
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main) | `card-backlog`, `orchestrator`; coluna Rascunhos de `spec-authoring`; selo de ciclo de `cycle-runs`; botão de tema de `theme-toggle` |
| [Disparar etapa](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-TriggerStage) | `orchestrator`, `execution-credentials` |
| [Card aguardando você](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardDetail) | `card-timeline`, `orchestrator` |
| [Card aguardando PR](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr) | `pr-flow`, `card-timeline`; relatório da etapa de `agent-contract` |

## 3 · Administração do board

| Tela | Specs |
|------|-------|
| [Membros](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Members) | `board-members` |
| [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials) | `local-runner`, `execution-credentials`, `cloud-routines-runner` |
| [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings) | Etapas: `board-import` e `orchestrator`. Ciclo e agenda: `cycle-runs` e `cycle-schedule`. Specs: `spec-authoring` e `spec-discovery`. Execução: `execution-credentials` e `pr-flow` |

## 4 · Estados vazios

| Tela | Specs |
|------|-------|
| [Primeiro acesso](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardsEmpty) | `board-import`, `github-app-integration` |
| [Board recém-criado](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardEmpty) | `card-backlog`, `spec-authoring`, `local-runner` |
| [Operador sem credencial](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CredentialsEmpty) | `execution-credentials` |

## 5 · Celular

| Tela | Specs |
|------|-------|
| [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MBoards) | `board-import` |
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MBoard) | `card-backlog`, `orchestrator` |
| [Mover card](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MMove) | `orchestrator`: no celular, mover pelo menu substitui arrastar |
| [Responder perguntas](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MCard) | `card-timeline`, `spec-authoring` |

## 6 · Specs

| Tela | Specs |
|------|-------|
| [Nova spec](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewSpec) | `spec-authoring` |
| [Spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-SpecDraft) | `spec-authoring` |
| [Descobrir specs](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Discover) | `spec-discovery` |
| [Propostas de uma descoberta](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DiscoverResults) | `spec-discovery` |

## 7 · Ciclo

| Tela | Specs |
|------|-------|
| [Novo ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleStart) | `cycle-runs` |
| [Ciclo em andamento](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleRun) | `cycle-runs` |

## 8 · Modo escuro

| Tela | Specs |
|------|-------|
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMain) · [Spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkSpecDraft) · [Ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkCycleRun) · [Celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMBoard) | `theme-toggle` |
