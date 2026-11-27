---
id: cycle-schedule
title: Agenda de ciclos
status: proposed
value: médio
effort: P
audience: time
phase: 3
area: [apps/api, apps/app]
depends_on: [cycle-runs, execution-credentials]
contends_on: []
feature: null
updated: 2026-11-27
---

# Agenda de ciclos

> **Resumo**
> - **O quê:** o board inicia um ciclo sozinho, em dias e horário definidos, com as primeiras specs de Tarefas.
> - **Por quê:** features prontas para revisar de manhã, sem alguém precisar iniciar o ciclo à noite.
> - **Status:** `proposed` · valor médio · esforço P · time
> - **Próximo passo:** aprovar; depende da `cycle-runs` (fatia 2 pendente) e da `execution-credentials`, ainda sem merge

## Problema

Com a spec `cycle-runs`, alguém ainda precisa abrir o board e iniciar o ciclo. Para o backlog andar à noite,
o board precisa disparar o ciclo sozinho, na ordem do board e respeitando os limites das colunas.

## O que já existe no repo

- Spec `cycle-runs` — ciclo com várias specs, opções e fila.
- Spec `execution-credentials` — credencial de cada membro.
- **Lacuna:** agenda por board e a escolha da credencial quando ninguém está disparando na hora.

## Referências

- Telas: aba Ciclo e agenda da
  [Configuração](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Settings) · ciclo noturno em
  [Meus boards](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-Boards). Mapa completo em
  [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md#com-que-credencial-a-execução-roda) — uso próprio da
  assinatura.

## Proposta — corte de MVP

- [ ] Na configuração do board: ligar o ciclo agendado e escolher horário, dias da semana e quantas specs
      por ciclo.
- [ ] No horário, o board cria um ciclo com as primeiras specs de Tarefas, com as opções padrão de ciclo do
      board.
- [ ] Se já houver um ciclo rodando, o agendado espera ele terminar.
- [ ] O ciclo agendado roda com a credencial de quem ligou a agenda. Sem credencial válida, ele não começa
      e o board avisa.
- [ ] Os limites de cards por coluna valem para o ciclo agendado.

### Fora do corte

- Mais de um horário por dia.
- Agenda por coluna.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `apps/api` | Agenda por board (cron) que cria o ciclo |
| `apps/app` | Aba Ciclo e agenda na configuração |

## Riscos e trade-offs

- A credencial de quem ligou a agenda só pode rodar o que essa pessoa disparou: para a regra de uso
  próprio, quem ligou a agenda é quem disparou. Se ela perder o papel no board, a agenda desliga.

## Sinais de pronto

- Um board com agenda às 22:00 e 3 specs por ciclo amanhece com três PRs em rascunho e o relatório do ciclo.
- **Gate 4:** uma semana de backlog andando sem intervenção.

## Perguntas em aberto

- Quem é o dono do ciclo agendado? — **recomendação:** quem ligou a agenda; trocar de dono exige ligar de
  novo.
