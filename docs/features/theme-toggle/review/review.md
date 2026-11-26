# Revisão: tema claro e escuro no board

Revisão da tarefa 6 do `/cycle`. O working tree também traz as tarefas 1 a 5, revisadas em
[`card-backlog/review/review.md`](../../card-backlog/review/review.md); aqui só entra o diff desta tarefa. O plano
de commits no fim deste arquivo é o final das seis tarefas e substitui a lista da `card-backlog`.

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada. É a branch das seis tarefas do ciclo e o
orquestrador pediu para não criar nem trocar. O regex de [`git-commits.md`](../../../.claude/rules/git-commits.md)
reprova o nome (`BRANCH INVALIDA`), como já registrado na `board-members` e na `card-backlog`. A revisão não
renomeou nem criou branch. Nome no padrão para o `/review` usar antes do push, se o usuário quiser trocar:
`feat/github-board-import-members-and-cards`, o mesmo proposto na `card-backlog` (a tarefa 6 não muda o
escopo de vários apps).

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| ✅ | `packages/design-system/components/ui/mode-toggle.tsx:31-34` | Nome acessível. `sr-only` só posiciona fora da tela e continua na árvore de acessibilidade; `hidden` é `display:none` e sai dela. No claro, o primeiro `span` é lido e o segundo está em `display:none`. No escuro, `dark:hidden` tira o primeiro e `dark:inline` traz o segundo de volta. Com a variante `dark` declarada como `&:is(.dark *)` em `packages/design-system/styles/globals.css:7`, a regra com variante vem depois no CSS e vence `hidden`. A semântica está certa; só a medição no navegador confirma. | Nenhuma; item no "Verificar no `/test`" |
| ✅ | `mode-toggle.tsx:21` | Hidratação. O texto e as classes não dependem de `resolvedTheme`; servidor e cliente geram o mesmo HTML. `resolvedTheme` só é lido no clique. | Nenhuma |
| ✅ | `mode-toggle.tsx:30` | Comentário explica o porquê (armadilha de hidratação), sem citar o fluxo. Cabe na exceção 2 de `code-comments.md`. | Nenhuma |
| ✅ | `AccountPreferencesForm.tsx:51-67`, `ProfileDropdown.tsx:64` | "Sistema" continua alcançável: o menu do perfil leva a `/account`, a aba de preferências tem o rádio com `system`, e o `Footer` do formulário não depende de `isDirty`, então salvar `system` de novo funciona mesmo quando a conta já guardava `system`. | Nenhuma |
| 🟢 | `AccountPreferencesForm.tsx:47` | O rádio mostra a preferência salva na conta, não o tema do navegador. Depois de alternar pelo navbar, a conta pode mostrar "Sistema" com a tela no escuro. Isso já valia antes para quem mudava o tema pelo menu antigo. | Registrado, sem correção (fora do corte) |
| ✅ | `mode-toggle.tsx:22-27` | `type="button"` e `onClick` vêm depois do `{...trigger}` e sobrescrevem o do chamador. Nenhum dos dois consumidores passa `onClick` ou `type`. | Nenhuma |
| ✅ | i18n | `trigger`, `light`, `dark` e `system` saíram de `components/ui/mode-toggle.ts`; nenhum leitor sobrou (`grep "modeToggle"` em `apps` e `packages`). `Escuro`/`Sistema` que restam são de `account.ts`, outro namespace. `useDark` e `useLight` têm leitor no componente e no teste de cópia. Sem chave órfã. | Nenhuma |
| 🟢 | `apps/app/__tests__/boardThemeTokens.test.ts:13` | O padrão não pegava `ring-offset-<cor>`, comum em componentes shadcn: `offset` não é prefixo da lista, então `ring-offset-white` passava. | Corrigido: `ring-offset` na lista e amostra nova nos casos de controle |
| ✅ | `boardThemeTokens.test.ts` | Rigidez sem falso positivo. O teste confere que a pasta tem arquivos, que o padrão acusa amostras fixas e aceita classes de token. Os 61 arquivos de `boards/**` passam. O `#hex` pode acusar um fragmento como `#add` em texto, mas o erro aponta o arquivo e hoje não acontece. | Nenhuma |

## Correções aplicadas

- `apps/app/__tests__/boardThemeTokens.test.ts`: `ring-offset` em `COLOR_UTILITY_PREFIX` e
  `'className="ring-offset-white"'` entre as amostras que precisam ser acusadas. Sem o prefixo, essa amostra não
  casa com nenhuma alternativa do padrão, então o caso de controle mede a mudança.

## Raio de impacto

`ModeToggle` é exportado por `packages/design-system/components/ui/index.ts:61`. Consumidores:

- `apps/app/shared/components/ui/Navbar.tsx:29`, com `triggerProps` (estilo redondo);
- `apps/app/app/[locale]/(unauthenticated)/layout.tsx:32`, sem props, no painel lateral que só aparece a partir de
  `lg`.

`playground/page.tsx:149` só tem a string `"mode-toggle"` numa lista de nomes de componentes, sem importar nada. A
prop `triggerProps` não mudou. Nenhum teste E2E procura "Alternar tema".

## Verificar no `/test`

Desta tarefa:

1. Nome acessível por tema. Snapshot de acessibilidade do botão do navbar com `agent-browser`: no claro, só "Usar
   tema escuro"; no escuro, só "Usar tema claro". É a afirmação que sustenta o corte e o jsdom não aplica
   `dark:hidden`.
2. Sem aviso de hidratação no console ao abrir `/boards/<id>` com cookie `x-theme=dark` e sem o cookie.
3. Clique troca o tema sem recarregar; `localStorage.theme` e cookie `x-theme` acompanham; recarregar não pisca.
4. Ícone: lua no claro, sol no escuro, centrado no botão de 36 px.
5. Diálogos, menus, toasts e tabela antd no escuro; celular a 390 px com o botão ao lado do avatar.
6. "Sistema" pela conta: alternar para escuro no navbar, ir em Conta, Preferências, escolher "Sistema" e salvar; o
   tema volta a seguir o sistema.
7. Tela de entrar (largura `lg` ou maior) alterna sem abrir menu.

Herdados da `card-backlog` (seção "Depois do `/test`, rodada 1" da revisão dela):

8. Detalhe do card sem frontmatter: abrir `/boards/<id>/cards/<slug>` de uma spec com bloco `---`; o topo não pode
   mostrar `<hr>` nem um título "id: … title: …".
9. Foco depois de mover por teclado: abrir o menu de um card, mover para outra coluna; o foco volta ao gatilho do
   menu desse card na coluna nova. Repetir com "reordenar".
10. Card órfão sem o selo de status: remover a spec do backlog de exemplo, sincronizar; o card mostra só "Spec
    removida", no quadro (`NotReadyCards`) e no detalhe.

## Lacunas de teste

- Troca do nome acessível pela classe `dark`: continua aberta. Só aparece com CSS aplicado (item 1 acima).
- Cor fixa em CSS-in-JS por nome (`style={{ color: "red" }}`) e em `.css` dentro de `boards/**`: continua aberta.
  Hoje não existe nenhum dos dois na pasta.
- `ring-offset-<cor>` no teste de tokens: fechada nesta revisão.

## Decisões em aberto

- Nome da branch fora do padrão (seção Branch). Recomendação: criar `feat/github-board-import-members-and-cards`
  a partir desta antes do push, sem renomear.
- Nenhuma decisão nova desta tarefa. As quatro perguntas do plano foram aplicadas pela recomendação no `/develop`.

## Gates

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | `Checked 816 files`, nenhum problema |
| Typecheck | `pnpm turbo run typecheck --filter=@repo/design-system --filter=@repo/internationalization --filter=app` | 3 de 3 ok |
| Teste alterado | `pnpm --filter app exec vitest run __tests__/boardThemeTokens.test.ts` | 74 de 74 (73 do handoff mais a amostra nova) |
| `apiErrors` | não se aplica | nenhum `error.code` novo |

Os testes do `ModeToggle` e do `componentCopy` não rodaram de novo: a revisão não tocou esses arquivos e o handoff
mediu 16 de 16. Varredura de segredo em `docs/features/theme-toggle/`: nenhuma senha, token, chave ou e-mail real.
O índice está vazio (`git diff --cached --stat`).

## Plano de commits (tarefas 1 a 6)

> A tarefa 7 (`card-timeline`) acrescentou doze commits e renumerou esta lista. O plano final das sete tarefas
> está em [`card-timeline/review/review.md`](../../card-timeline/review/review.md#plano-de-commits-tarefas-1-a-7).

Este plano substitui a lista de
[`card-backlog/review/review.md`](../../card-backlog/review/review.md#plano-de-commits-tarefas-1-a-5). Os commits
de 1 a 51 de lá continuam com a mesma mensagem, os mesmos arquivos e os mesmos comandos de blob da seção
"Arquivos mistos" de lá; só a numeração muda. A tarefa 6 acrescenta três commits e troca o antigo 51.

A tarefa 6 é separada por pacote, como o resto do plano. O `/develop` sugeriu `feat(packages)` juntando
design-system e i18n porque o typecheck só passa com os dois, mas o plano já aceita commit intermediário vermelho
(os do app dependem do dicionário do 41) e só exige o PR verde no último commit. O commit 14 fica vermelho no
typecheck do `@repo/design-system` até o 42. Nenhum dos arquivos da tarefa 6 tem mudança de outra tarefa, então
todos entram inteiros com `git add`.

Numeração final:

| Novo | Antigo | Commit |
|------|--------|--------|
| 1 a 13 | 1 a 13 | sem mudança |
| **14** | novo | `feat(design-system): toggle the theme with one click instead of a menu` |
| 15 a 36 | 14 a 35 | sem mudança |
| **37** | novo | `test(app): keep board screens on color tokens` |
| 38 a 41 | 36 a 39 | sem mudança |
| **42** | novo | `feat(internationalization): name the theme toggle by the action it takes` |
| 43 a 53 | 40 a 50 | sem mudança |
| **54** | 51 | `docs(features): theme-toggle`, agora a pasta inteira |

Commits novos:

14. `feat(design-system): toggle the theme with one click instead of a menu`
    - `packages/design-system/components/ui/mode-toggle.tsx`
    - `packages/design-system/__tests__/modeToggle.test.tsx`
    - `packages/design-system/__tests__/componentCopy.test.tsx`
37. `test(app): keep board screens on color tokens`
    - `apps/app/__tests__/boardThemeTokens.test.ts`
42. `feat(internationalization): name the theme toggle by the action it takes`
    - `packages/internationalization/translations/components/ui/mode-toggle.ts`
54. `docs(features): theme-toggle`
    - `docs/features/theme-toggle/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md`)

Os arquivos do design-system que também aparecem no `git status` (`action-menu.tsx`, `actionMenu.test.tsx`,
`antd-app.tsx`, `antdTheme.test.tsx`, `package.json`) continuam nos commits 6 e 13.

Antes do commit 1, `git diff --cached --stat` vazio; depois de cada commit, `git show --stat --oneline HEAD`
conferido contra a lista. Toda mensagem termina com a linha de coautoria da sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members, cards and theme toggle`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
