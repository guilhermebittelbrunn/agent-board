# Handoff do develop: tema claro e escuro no board

Plano: `analyze/plan.md`. Implementado na mesma branch das tarefas 1 a 5 do `/cycle` (`github-app-integration`,
`github-sign-in`, `board-import`, `board-members`, `card-backlog`), todas sem commit. Os arquivos abaixo são só
desta tarefa; nenhum deles tinha mudança das tarefas anteriores (`git diff --stat` dos três arquivos alterados mostra
apenas o diff descrito aqui).

## Blueprint → arquivos

| Item do plano | Arquivos |
|---------------|----------|
| 10.1 `ModeToggle` alterna direto | `packages/design-system/components/ui/mode-toggle.tsx` (alterado) |
| 10.3 teste do componente | `packages/design-system/__tests__/modeToggle.test.tsx` (novo) |
| 10.5 ajuste do teste de cópia | `packages/design-system/__tests__/componentCopy.test.tsx` (alterado: caso do seletor de tema e remoção da constante `ENTER`, que ficou sem uso) |
| 10.4 chaves de i18n | `packages/internationalization/translations/components/ui/mode-toggle.ts` (alterado: saem `trigger`, `light`, `dark`, `system`; entram `useDark`, `useLight`) |
| 10.2 teste de tokens em `boards/**` | `apps/app/__tests__/boardThemeTokens.test.ts` (novo) |
| 5.2 troca de cor fixa em `boards/**` | Nenhuma. O teste passou nos 61 arquivos `.ts`/`.tsx` da pasta, inclusive os da `card-backlog` |

O componente segue o blueprint: o clique chama `setTheme(resolvedTheme === "dark" ? "light" : "dark")`, o ícone
mostra a ação (lua no claro, sol no escuro) e o nome acessível vem de dois `span` `sr-only`, um com `dark:hidden`
e outro com `hidden dark:inline`. O texto não depende de `resolvedTheme`, então servidor e cliente renderizam o
mesmo HTML. O botão ganhou `type="button"` e continua aceitando `triggerProps`, que o `Navbar.tsx` usa para o
estilo redondo.

## Contrato

Nenhum DTO, action ou rota. A API pública do `ModeToggle` (`triggerProps`) não mudou. Consumidores:
`apps/app/shared/components/ui/Navbar.tsx` e `apps/app/app/[locale]/(unauthenticated)/layout.tsx`, ambos sem
alteração. As chaves removidas do dicionário não tinham outro leitor (`grep -rn "modeToggle"` em `apps` e
`packages`, e `grep -rln "Alternar tema"` no repositório, sem resultado fora do componente e dos testes).

## Códigos de erro novos

Nenhum.

## Desvios em relação ao plano

- **Playground não usa o `ModeToggle`.** O plano listava `playground/page.tsx:149` como terceiro consumidor. No
  código atual a página não importa o componente (`grep -n "Mode\|theme"` no arquivo, vazio). Sobram dois
  consumidores, e a conclusão do plano (sem variante "menu") continua valendo.
- **Teste de tokens mais estrito que o esqueleto, não mais frouxo.** Acrescentei os prefixos `decoration`,
  `accent`, `caret` e `placeholder`, os lados de borda (`border-t-slate-300`) e as funções `oklab(`, `lab(` e
  `lch(`. Também entraram casos de controle: o teste confere que a pasta tem arquivos, que o padrão acusa
  amostras como `bg-white`, `text-gray-500` e `bg-[#1a2b3c]`, e que aceita classes de token como
  `bg-destructive/10` e `bg-sidebar-border`. Sem esses casos, um caminho errado ou uma regex quebrada fariam o
  teste passar sem ler nada.
- **Nenhum falso positivo apareceu**, então o padrão de `#hex` ficou como no plano, sem restringir a
  `className`/`style`.
- Um comentário de uma linha no componente explica por que o rótulo segue a classe do `<html>` e não o estado do
  `next-themes` (armadilha de hidratação). É uma das duas exceções da regra de comentários.

## Decisões em aberto

As quatro perguntas do plano foram aplicadas pela recomendação, como o `/cycle` manda:

1. Botão no navbar do painel, sem cabeçalho próprio do board. O cabeçalho do desenho continua sem dono no
   backlog.
2. Alternar direto. "Sistema" fica só na tela da conta.
3. Mudança no `ModeToggle` do pacote, sem variante.
4. Estilo do navbar (36 px, `bg-sidebar-border`), não os 40 px com borda do desenho.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 816 arquivos, nenhum problema |
| Typecheck | `pnpm turbo run typecheck --filter=@repo/design-system --filter=@repo/internationalization --filter=app` | 3 de 3 tarefas ok |
| Testes | `pnpm turbo run test --filter=@repo/design-system --filter=@repo/internationalization --filter=app` | 10 de 10 tarefas ok; design-system 148 testes, internationalization 35, app 809 |
| Testes novos isolados | `pnpm --filter @repo/design-system exec vitest run __tests__/modeToggle.test.tsx __tests__/componentCopy.test.tsx` e `pnpm --filter app exec vitest run __tests__/boardThemeTokens.test.ts` | 16 e 73 testes ok |
| `apiErrors` | não se aplica | nenhum `error.code` novo |

O aviso `<button> cannot contain a nested <button>` no stderr do `componentCopy.test.tsx` vem do caso "nomeia os
dois botões de fechar do Dialog", que esta tarefa não tocou.

Não subi o app: o comportamento novo está coberto no nível do componente e nada no layout mudou. Nenhuma
afirmação visual abaixo foi medida.

## A verificar no `/test`

Tudo o que depende de CSS real e de navegador. O jsdom não aplica `dark:hidden`, então os testes só provam que os
dois textos existem no botão, não qual deles o leitor de tela anuncia.

- Nome acessível por tema: no claro, a árvore de acessibilidade anuncia só "Usar tema escuro"; no escuro, só "Usar
  tema claro" (T1, T2 do plano). Repro: `agent-browser` com snapshot de acessibilidade do botão nos dois temas.
- Sem aviso de hidratação no console ao carregar `/boards/[id]` com cookie `x-theme=dark` e com cookie ausente.
- Ícone: lua no claro, sol no escuro, e o sol absoluto continua centrado sobre a lua no botão de 36 px.
- Troca sem recarregar, persistência em `localStorage.theme` e no cookie `x-theme`, primeira pintura sem piscar
  (T2, T3).
- Diálogos, menus, toasts e a tabela antd no escuro (T4, T5).
- Celular, 390 px: botão ao lado do avatar (T6).
- "Sistema" continua na tela da conta (T7) e telas do board no escuro contra `DarkMain.png`/`DarkMBoard.png` (T8).
- Tela de entrar (≥ `lg`) alterna sem menu (T9).

## Lacunas de teste conhecidas

- Nenhum teste automatizado prova a troca do nome acessível pela classe `dark`; isso só aparece com CSS aplicado
  (E2E ou `agent-browser`).
- O teste de tokens não pega cor fixa em CSS-in-JS por nome (`style={{ color: "red" }}`) nem em arquivo `.css`
  dentro de `boards/**` (hoje não há nenhum).

## Separar os commits

Os arquivos são exclusivos desta tarefa, então podem entrar sem `git add -p`:

1. `feat(packages): toggle the theme with one click instead of a menu`:
   `packages/design-system/components/ui/mode-toggle.tsx`,
   `packages/design-system/__tests__/modeToggle.test.tsx`,
   `packages/design-system/__tests__/componentCopy.test.tsx`,
   `packages/internationalization/translations/components/ui/mode-toggle.ts`.
   Componente e dicionário juntos, porque o typecheck só passa com os dois. Se o revisor preferir separar, o
   `design-system` vai primeiro e o commit dele fica vermelho até o de i18n.
2. `test(app): keep board screens on color tokens`: `apps/app/__tests__/boardThemeTokens.test.ts`.
3. `docs(features): theme-toggle`: `docs/features/theme-toggle/`.

Atenção: `packages/design-system/__tests__/actionMenu.test.tsx`, `antdTheme.test.tsx`, `action-menu.tsx`,
`package.json` e `providers/antd-app.tsx` também aparecem alterados no `git status`, mas são de tarefas anteriores
e não fazem parte destes commits.
