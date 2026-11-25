---
id: theme-toggle
title: Tema claro e escuro no board
status: proposed
value: médio
effort: P
audience: time
phase: 1
area: [apps/app, packages/design-system]
depends_on: [card-backlog]
contends_on: [packages/design-system/components/ui/mode-toggle.tsx]
feature: -
updated: 2026-11-25
---

# Tema claro e escuro no board

> **Resumo**
> - **O quê:** um botão no cabeçalho do board alterna entre tema claro e escuro; o primeiro acesso segue o tema do sistema.
> - **Por quê:** o board fica aberto o dia todo ao lado do editor, e quem usa tema escuro no resto do ambiente não quer uma tela clara no meio.
> - **Status:** `proposed` · valor médio · esforço P · time
> - **Próximo passo:** aguardando triagem

## Problema

O core já tem tema escuro, com o `ModeToggle` no navbar do painel e a escolha nas preferências da conta,
que ficaram depois do `fork-cleanup`. O cabeçalho do board é novo e ainda não tem o botão. As telas novas do board (quadro, card,
ciclos) também precisam funcionar nos dois temas desde o começo.

## O que já existe no repo

- `packages/design-system/components/ui/mode-toggle.tsx` — `ModeToggle` com claro, escuro e sistema, via
  `next-themes`.
- `packages/design-system/providers/theme.tsx` — provider de tema.
- `apps/app/app/[locale]/(authenticated)/(common)/(pages)/account/(components)/AccountPreferencesForm.tsx` —
  onde a pessoa escolhe o tema hoje; ficou no `fork-cleanup`.
- `apps/app/shared/components/ui/Navbar.tsx` — o navbar do painel já usa o `ModeToggle`.
- **Lacuna:** o cabeçalho do board ainda não existe, e nada garante que as telas novas usem só os tokens de
  cor.

## Referências

- Telas: botão de tema no cabeçalho de todas as telas do canvas e a fileira Modo escuro
  ([quadro](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMain),
  [spec em escrita](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkSpecDraft),
  [ciclo](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkCycleRun),
  [celular](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#artboard-DarkMBoard)). Mapa completo em
  [`docs/board/SCREENS.md`](../../docs/board/SCREENS.md).
- Regra de ouro 11 do [`CLAUDE.md`](../../CLAUDE.md): o QA percorre as telas em claro e escuro.

## Proposta — corte de MVP

- [ ] Botão de tema no cabeçalho do board, ao lado do avatar, no desktop e no celular.
- [ ] O primeiro acesso segue o tema do sistema; a escolha fica salva no navegador.
- [ ] As telas do board usam só os tokens de cor do design system, sem cor fixa.

### Fora do corte

- Guardar a preferência no perfil para valer entre dispositivos.
- Temas além de claro e escuro.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/design-system` | Ajuste no `ModeToggle` para alternar direto, sem menu |
| `apps/app` | Botão no cabeçalho do board |

## Riscos e trade-offs

- Diálogos e menus abrem fora da árvore da página e precisam herdar o tema. Conferir no `/test`.

## Sinais de pronto

- Alternar o tema muda o quadro, o card e os diálogos sem recarregar a página.
- O `/test` percorre as telas do board nos dois temas.

## Perguntas em aberto

- Botão que alterna direto ou o menu atual, com "sistema"? — **recomendação:** alternar direto; seguir o
  sistema fica só como padrão do primeiro acesso.
