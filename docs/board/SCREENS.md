# Telas

O desenho das telas está num canvas do Claude Design:
[Agent Board — Telas](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt). O canvas é privado; quem precisar
ver pede acesso ao dono. A fonte de cada tela também está no repositório, em
[`docs/design/screens/`](../design/README.md), com o guia de leitura e a equivalência com o
`@repo/design-system`.

Cada tela abaixo tem o link do canvas, o arquivo no repositório e a spec que a constrói.

O celular não tem spec própria: cada spec entrega a sua tela responsiva, e o `/test` percorre o fluxo no
celular e nos dois temas (regra de ouro 11 do [`CLAUDE.md`](../../CLAUDE.md)).

## 1 · Entrada

| Tela | Fonte | Specs |
|------|-------|-------|
| [Entrar](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Login) | [`Login`](../design/screens/Login.dc.html) | `github-sign-in` |
| [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Boards) | [`Boards`](../design/screens/Boards.dc.html) | `board-import`; ciclo noturno de `cycle-schedule` |
| [Novo board](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewBoard) | [`NewBoard`](../design/screens/NewBoard.dc.html) | `board-import`, `github-app-integration` |

## 2 · Quadro, disparo e cards

| Tela | Fonte | Specs |
|------|-------|-------|
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Main) | [`Main`](../design/screens/Main.dc.html) | `card-backlog`, `orchestrator`; coluna Rascunhos de `spec-authoring`; selo de ciclo de `cycle-runs`; botão de tema de `theme-toggle` |
| [Disparar etapa](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-TriggerStage) | [`TriggerStage`](../design/screens/TriggerStage.dc.html) | `orchestrator`, `execution-credentials` |
| [Card aguardando você](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardDetail) | [`CardDetail`](../design/screens/CardDetail.dc.html) | `card-timeline`, `orchestrator` |
| [Card aguardando PR](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CardPr) | [`CardPr`](../design/screens/CardPr.dc.html) | `pr-flow`, `card-timeline`; relatório da etapa de `agent-contract` |

## 3 · Administração do board

| Tela | Fonte | Specs |
|------|-------|-------|
| [Membros](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Members) | [`Members`](../design/screens/Members.dc.html) | `board-members` |
| [Minhas credenciais](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Credentials) | [`Credentials`](../design/screens/Credentials.dc.html) | `local-runner`, `execution-credentials`, `cloud-routines-runner` |
| [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings) | [`Settings`](../design/screens/Settings.dc.html) | Etapas: `board-import` e `orchestrator`. Ciclo e agenda: `cycle-runs` e `cycle-schedule`. Specs: `spec-authoring` e `spec-discovery`. Execução: `execution-credentials` e `pr-flow` |

## 4 · Estados vazios

| Tela | Fonte | Specs |
|------|-------|-------|
| [Primeiro acesso](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardsEmpty) | [`BoardsEmpty`](../design/screens/BoardsEmpty.dc.html) | `board-import`, `github-app-integration` |
| [Board recém-criado](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-BoardEmpty) | [`BoardEmpty`](../design/screens/BoardEmpty.dc.html) | `card-backlog`, `spec-authoring`, `local-runner` |
| [Operador sem credencial](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CredentialsEmpty) | [`CredentialsEmpty`](../design/screens/CredentialsEmpty.dc.html) | `execution-credentials` |

## 5 · Celular

| Tela | Fonte | Specs |
|------|-------|-------|
| [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MBoards) | [`MBoards`](../design/screens/MBoards.dc.html) | `board-import` |
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MBoard) | [`MBoard`](../design/screens/MBoard.dc.html) | `card-backlog`, `orchestrator` |
| [Mover card](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MMove) | [`MMove`](../design/screens/MMove.dc.html) | `orchestrator`: no celular, mover pelo menu substitui arrastar |
| [Responder perguntas](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-MCard) | [`MCard`](../design/screens/MCard.dc.html) | `card-timeline`, `spec-authoring` |

## 6 · Specs

| Tela | Fonte | Specs |
|------|-------|-------|
| [Nova spec](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-NewSpec) | [`NewSpec`](../design/screens/NewSpec.dc.html) | `spec-authoring` |
| [Spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-SpecDraft) | [`SpecDraft`](../design/screens/SpecDraft.dc.html) | `spec-authoring` |
| [Descobrir specs](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Discover) | [`Discover`](../design/screens/Discover.dc.html) | `spec-discovery` |
| [Propostas de uma descoberta](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DiscoverResults) | [`DiscoverResults`](../design/screens/DiscoverResults.dc.html) | `spec-discovery` |

## 7 · Ciclo

| Tela | Fonte | Specs |
|------|-------|-------|
| [Novo ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleStart) | [`CycleStart`](../design/screens/CycleStart.dc.html) | `cycle-runs` |
| [Ciclo em andamento](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-CycleRun) | [`CycleRun`](../design/screens/CycleRun.dc.html) | `cycle-runs` |

## 8 · Modo escuro

| Tela | Fonte | Specs |
|------|-------|-------|
| [Quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMain) · [Spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkSpecDraft) · [Ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkCycleRun) · [Celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMBoard) | [`DarkMain`](../design/screens/DarkMain.dc.html) · [`DarkSpecDraft`](../design/screens/DarkSpecDraft.dc.html) · [`DarkCycleRun`](../design/screens/DarkCycleRun.dc.html) · [`DarkMBoard`](../design/screens/DarkMBoard.dc.html) | `theme-toggle` |
