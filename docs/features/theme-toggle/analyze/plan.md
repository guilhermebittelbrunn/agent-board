# Plano: tema claro e escuro no board

Spec de origem: [`specs/features/theme-toggle.md`](../../../../specs/features/theme-toggle.md) (status `proposed`
quando o `/cycle` a executou, a pedido do usuário). Depende de `card-backlog`, que tem só o plano
(`docs/features/card-backlog/analyze/plan.md`) e vai ser implementada antes desta. Este plano parte do working
tree de 2026-11-26, com `github-app-integration`, `github-sign-in`, `board-import` e `board-members`
implementadas e sem commit.

## Etapa 1: análise

### 1. Contexto

O board fica aberto o dia todo ao lado do editor. Quem usa tema escuro no resto do ambiente quer o board escuro
também, e trocar com um clique, sem menu.

A infraestrutura de tema já existe e funciona. O que falta é pequeno:

| Peça | Onde | Estado hoje |
|------|------|-------------|
| Provider `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) | `packages/design-system/providers/theme.tsx:8-13` | Pronto |
| Primeira pintura sem piscar: o servidor lê o cookie `x-theme` e põe a classe no `<html>` | `apps/app/app/layout.tsx:24-37` e `:63-72` | Pronto |
| Escolha guardada no navegador (`localStorage.theme`, do `next-themes`) e espelhada no cookie | `apps/app/shared/lib/themePreference.ts:28-62`, `AppDesignProvider.tsx:14-22` | Pronto |
| Preferência da conta (claro, escuro, sistema), semeada no navegador no login só se não houver escolha local | `AccountPreferencesForm.tsx:60-69`, `postLoginNavigation.ts:22-33`, `themePreference.ts:41-46` | Pronto; padrão `system` em `apps/api/(shared)/lib/account-avatar.ts:10-12` |
| Botão de tema no navbar do painel, ao lado do avatar | `apps/app/shared/components/ui/Navbar.tsx:29-30` | Existe, mas abre um **menu** com Claro, Escuro e Sistema (`mode-toggle.tsx:27-48`) |
| Telas do board só com tokens de cor | `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/**` | Hoje sim (varredura abaixo), mas nada impede uma cor fixa amanhã |

**Onde fica o botão.** A spec fala em "cabeçalho do board", e o desenho (`Main.dc.html:46`, `MBoard.dc.html:28`)
mostra um cabeçalho próprio com logo, menu de seções, estado do runner, botão de tema e avatar. Esse cabeçalho
não existe e não vai existir depois da `card-backlog`: o plano dela deixa o "cabeçalho próprio do board" fora do
escopo e põe o quadro "no layout atual do painel, como `board-import` decidiu"
(`docs/features/card-backlog/analyze/plan.md:40-41`; `board-import` disse o mesmo em
`docs/features/board-import/analyze/plan.md:37`). Todas as telas do board, inclusive as que a `card-backlog` cria
(`/boards/[id]` e `/boards/[id]/cards/[slug]`, plano dela §5.1), ficam sob
`(common)/layout.tsx:55-60`, que renderiza o `Navbar` com o `ModeToggle` já ao lado do `ProfileDropdown` (o
avatar). Esse navbar aparece no desktop e no celular (`Navbar.tsx:19-32`, sem classe que o esconda).

Por isso o botão não precisa de cabeçalho novo: o lugar dele já existe e já está ao lado do avatar. O trabalho é
fazer o botão alternar direto, como a spec e o desenho pedem.

**Corte de MVP** (o da spec, sem mudança):

1. Botão de tema ao lado do avatar, no desktop e no celular, que alterna entre claro e escuro com um clique.
2. Primeiro acesso segue o tema do sistema; a escolha fica salva no navegador.
3. As telas do board usam só tokens de cor do design system.

**Fora de escopo:**

- Guardar no perfil a escolha feita pelo botão (spec, "Fora do corte"). A tela da conta continua salvando no perfil,
  como hoje.
- Temas além de claro e escuro.
- O cabeçalho próprio do board do desenho (logo, menu Quadro · Ciclos · …, estado do runner). Ninguém no backlog é
  dono dele hoje; ver pergunta 1.
- O botão de tema na tela de entrar no celular: o `ModeToggle` de `(unauthenticated)/layout.tsx:31-33` fica dentro
  de um painel `hidden lg:flex` (`:20`). Não é tela do board.
- Cores fixas fora de `boards/**` (ex.: `text-white` em `(unauthenticated)/layout.tsx:20`).

### 1.1 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/theme-toggle.md` | Corte, recomendação "alternar direto", risco dos diálogos fora da árvore |
| `.claude/cycle-policy.md` | Corrigir na raiz; escopo preferencial em `apps/*`; sem dependência nova |
| `docs/design/README.md` | Botão de tema ↔ `mode-toggle.tsx`; "toda cor vem de token" |
| `docs/design/screens/Main.dc.html:46-49, 323-324` e `MBoard.dc.html:28-31, 159-160` | Botão redondo de 40 px, ícone da **ação** (lua no claro, sol no escuro), rótulo "Usar tema escuro" / "Usar tema claro" |
| `docs/board/SCREENS.md:26, 72-76` | Telas `Dark*` são desta spec |
| `docs/board/ROADMAP.md:18, 61` | Fase 1, item 6 |
| `docs/features/card-backlog/analyze/plan.md:40-41, 272-345` | Sem cabeçalho próprio; telas novas no layout do painel |
| `packages/design-system/components/ui/mode-toggle.tsx` | Menu atual, ícone do estado atual |
| `packages/design-system/__tests__/componentCopy.test.tsx:113-131` | Teste que hoje exige o menu com três itens |
| `apps/app/__tests__/appIcons.test.ts`, `focusNotObscuredScrollPadding.test.tsx` | Precedente de teste que lê arquivo do repo com `readFileSync` |
| `apps/e2e/tests/a11yDark.spec.ts:27`, `playwright.config.ts:44` | O E2E fixa o tema por `colorScheme`, não pelo menu: nada quebra |

Referências não lidas: o canvas `claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt` é privado. Usei as cópias em
`docs/design/screens/` e `docs/design/screenshots/`, que o README da pasta declara equivalentes.

### 2. Dados (Firestore)

N/A. Nenhum campo novo. A preferência da conta (`preferences.theme`) continua como está.

### 3. Contrato `@repo/sdk`

N/A.

### 4. API (`apps/api`)

N/A. Nenhuma rota, nenhum `error.code`.

### 5. Front-end

#### 5.1 `ModeToggle` alterna direto (`packages/design-system`)

O `ModeToggle` deixa de ser menu e vira um botão que alterna:

- Clique: `setTheme(resolvedTheme === "dark" ? "light" : "dark")`. Usa `resolvedTheme`, não `theme`, para que uma
  pessoa em "sistema" troque para o oposto do que está vendo.
- Ícone da ação, como no desenho: lua no claro, sol no escuro. A troca continua por classe `dark:` (hoje
  `mode-toggle.tsx:36-37` mostra o sol no claro; inverte).
- Rótulo acessível que diz a ação: "Usar tema escuro" no claro, "Usar tema claro" no escuro. Os dois textos ficam
  em `span`s `sr-only`, um com `dark:hidden` e outro com `hidden dark:inline`. Assim o nome acessível acompanha o
  tema pela classe do `<html>`, sem ler `resolvedTheme` na renderização. Isso importa porque no servidor
  `resolvedTheme` é `undefined`, e um rótulo calculado em JS causaria diferença de hidratação.
- Mantém a prop `triggerProps` e o mesmo `Button` (`size="icon"`, `variant="ghost"`), para o `Navbar.tsx:14-16,29`
  continuar passando o estilo redondo dele sem mudança.

A opção "Sistema" continua na tela da conta (`AccountPreferencesForm.tsx:51-58`), e "sistema" continua sendo o
padrão de quem nunca escolheu (`providers/theme.tsx:10`). Ninguém perde a opção.

Os três lugares que usam o `ModeToggle` passam a alternar direto: navbar do painel (`Navbar.tsx:29`), tela de
entrar (`(unauthenticated)/layout.tsx:32`) e playground (`playground/page.tsx:149`). Não há variante "menu"
porque não sobra quem a use.

#### 5.2 `apps/app`

Nenhuma mudança de componente. O botão já está no lugar certo (`Navbar.tsx:29`, ao lado do avatar em `:30`) para
todas as telas do board.

Se, ao implementar, a `card-backlog` tiver deixado alguma cor fixa em `boards/**`, o teste de 7.2 aponta e o
`/develop` troca pelo token equivalente (tabela de tokens do `docs/design/README.md`). Varredura de hoje
(`grep` de `#hex`, `rgb(`, `hsl(` e classes de paleta como `bg-white`, `text-gray-500`, `border-red-200` em
`boards/**`): zero ocorrências.

#### 5.3 Estados

| Estado | Como aparece |
|--------|--------------|
| Primeiro acesso, sistema claro | Tema claro, botão com lua, rótulo "Usar tema escuro" |
| Primeiro acesso, sistema escuro | Tema escuro, botão com sol, rótulo "Usar tema claro" |
| Depois de clicar | Troca na hora, sem recarregar; `localStorage.theme` e cookie `x-theme` gravados |
| Recarregar depois de escolher | Primeira pintura já no tema escolhido (cookie lido no servidor) |
| Personificação | O botão funciona igual: a escolha é do navegador, não grava nada na API |

### 6. i18n (pt-br)

`packages/internationalization/translations/components/ui/mode-toggle.ts`: as chaves `trigger`, `light`, `dark` e
`system` saem (só o `ModeToggle` e o teste de cópia as leem); entram `useDark` e `useLight`. Árvore em 10.4.

### 7. Autorização e segurança

N/A para autorização: a escolha não sai do navegador. Sob personificação, o botão troca o tema do navegador de
quem está personificando, como já acontece hoje com o menu; a tela da conta segue bloqueando o salvar
(`AccountPreferencesForm.tsx:93`).

### 7.1 Testes

| Teste | Nível | O que prova |
|-------|-------|-------------|
| `packages/design-system/__tests__/modeToggle.test.tsx` (novo) | Componente, com `next-themes` mockado | Com `resolvedTheme: "light"`, clicar chama `setTheme("dark")`; com `"dark"`, chama `setTheme("light")`; com `theme: "system"` e `resolvedTheme: "dark"`, chama `setTheme("light")`; não existe `role="menu"` depois do clique |
| `packages/design-system/__tests__/componentCopy.test.tsx` (ajuste do caso em `:113-131`) | Componente | O botão expõe os dois textos `useDark` e `useLight` do dicionário e não abre menu |
| `apps/app/__tests__/boardThemeTokens.test.ts` (novo) | Leitura de arquivo, sem render | Nenhum `.ts`/`.tsx` em `boards/**` tem cor fixa: hex, `rgb(`/`hsl(`/`oklch(` literais, ou classe de paleta do Tailwind (`(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow)-(white|black|<paleta>)(-\d{2,3})?`). Falha listando arquivo e trecho |

Os testes de `themePreference.test.ts` já cobrem a gravação no cookie e a semeadura no login; não mudam.
Nenhum teste precisa de emulador nem de app de pé.

### 8. O que o `/test` vai percorrer

Rodar com o seed do QA de `board-members` (contas `qa-*` do cliente falso do GitHub) e um board com cards criado
pela `card-backlog`.

| # | Fluxo | Como produzir | Esperado |
|---|-------|---------------|----------|
| T1 | Primeiro acesso segue o sistema | Navegador com `localStorage` e cookie `x-theme` limpos, `prefers-color-scheme: dark`; entrar com conta cuja preferência é "Sistema" | `/boards/[id]` abre escuro, botão com sol e nome "Usar tema claro". Repetir com `light` |
| T2 | Alternar no quadro | Clicar no botão em `/boards/[id]` | Quadro, colunas, cards e navbar trocam na hora, sem recarregar; o nome do botão passa a "Usar tema escuro" |
| T3 | Escolha persiste | Recarregar depois de T2 | Primeira pintura já no tema escolhido, sem piscar; `localStorage.theme` e cookie `x-theme` com o valor |
| T4 | Diálogos e menus herdam o tema | No escuro: abrir o menu "⋯" de um card, o diálogo de mudar papel em `/boards/[id]/members`, um toast (sincronizar backlog) | Todos escuros, texto legível |
| T5 | Tabela antd | `/boards/[id]/members` nos dois temas | A tabela acompanha o tema |
| T6 | Celular | Viewport 390 px, `/boards/[id]` e detalhe do card | Botão visível ao lado do avatar, alterna igual |
| T7 | "Sistema" continua alcançável | Tela da conta → "Sistema" → salvar | Volta a seguir o sistema |
| T8 | Telas do board em escuro | `/boards`, `/boards/new`, `/boards/[id]`, `/boards/[id]/cards/[slug]`, `members`, `settings` | Comparar com `DarkMain.png` e `DarkMBoard.png`; nenhum trecho claro sobrando, contraste legível |
| T9 | Tela de entrar | `/sign-in` em desktop (≥ `lg`) | O botão alterna direto, sem menu |

Não observável sem infra externa: nada.

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Um clique no botão do navbar troca entre claro e escuro, sem menu e sem recarregar.
2. O nome acessível e o ícone dizem a ação: lua e "Usar tema escuro" no claro, sol e "Usar tema claro" no escuro.
3. Quem nunca escolheu vê o tema do sistema; depois de escolher, a escolha vale ao recarregar, sem piscar.
4. Diálogos, menus, toasts e a tabela antd seguem o tema.
5. O botão aparece ao lado do avatar no desktop e no celular, em todas as telas do board.
6. Nenhum arquivo de `boards/**` tem cor fixa (teste 7.1).
7. A opção "Sistema" continua na tela da conta.

## Etapa 2: blueprint técnico

### 10.1 `mode-toggle.tsx`

```tsx
"use client";

import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { cn } from "@repo/design-system/lib/utils";
import { getDictionary } from "@repo/internationalization/client";
import { useTheme } from "next-themes";
import { Button } from "./button";

type ModeToggleProps = {
  triggerProps?: React.ComponentProps<typeof Button>;
};

export const ModeToggle = ({ triggerProps }: ModeToggleProps) => {
  const { resolvedTheme, setTheme } = useTheme();
  const { dictionary } = getDictionary();
  const modeToggleCopy = dictionary.components.modeToggle;
  const trigger = triggerProps ?? {};

  return (
    <Button
      {...trigger}
      className={cn("shrink-0 text-foreground", trigger.className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size={trigger.size ?? "icon"}
      type="button"
      variant={trigger.variant ?? "ghost"}
    >
      <MoonIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <SunIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only dark:hidden">{modeToggleCopy.useDark}</span>
      <span className="sr-only hidden dark:inline">{modeToggleCopy.useLight}</span>
    </Button>
  );
};
```

O `onClick` de `triggerProps`, se alguém passar, é sobrescrito; hoje nenhum chamador passa (`Navbar.tsx:14-16`
só passa `className`).

### 10.2 `boardThemeTokens.test.ts` (esqueleto)

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const boardsDir = join(
  __dirname,
  "../app/[locale]/(authenticated)/(common)/(pages)/boards"
);

const PALETTE =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const FIXED_COLOR = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|\\b(?:rgb|rgba|hsl|hsla|oklch)\\(|\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow)-(?:${PALETTE})(?:-\\d{2,3})?\\b`,
  "g"
);

const sourceFiles = readdirSync(boardsDir, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file));

describe("telas do board usam só tokens de cor", () => {
  it.each(sourceFiles)("%s", (file) => {
    const source = readFileSync(join(boardsDir, file), "utf8");
    expect(source.match(FIXED_COLOR) ?? []).toEqual([]);
  });
});
```

O `#hex` pode casar com âncora de URL em string (ex.: `#L10` não casa porque `L` não é hex, mas `#add` casaria).
Se aparecer falso positivo, o `/develop` restringe o padrão ao contexto de `className`/`style` em vez de
afrouxar a regra.

### 10.3 Teste do componente (esqueleto)

```tsx
const { setThemeMock, themeState } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  themeState: { theme: "light", resolvedTheme: "light" },
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ ...themeState, setTheme: setThemeMock }),
}));

it.each([
  [{ theme: "light", resolvedTheme: "light" }, "dark"],
  [{ theme: "dark", resolvedTheme: "dark" }, "light"],
  [{ theme: "system", resolvedTheme: "dark" }, "light"],
  [{ theme: "system", resolvedTheme: "light" }, "dark"],
])("com %o, um clique escolhe %s", async (state, expected) => { /* render, click, expect setThemeMock */ });

it("não abre menu", () => { /* click; expect(screen.queryByRole("menu")).toBeNull() */ });
```

### 10.4 Chaves de i18n

```ts
// packages/internationalization/translations/components/ui/mode-toggle.ts
export const modeToggleTranslations = {
    "pt-br": {
        useDark: "Usar tema escuro",
        useLight: "Usar tema claro",
    },
};
```

### 10.5 Pseudo-diff

```diff
 packages/design-system/components/ui/mode-toggle.tsx
-  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
-  const themeValues = ["light", "dark", "system"] as const;
-  <DropdownMenu>…{themeValues.map(…)}…</DropdownMenu>
+  <Button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>…</Button>  (10.1)

 packages/design-system/__tests__/componentCopy.test.tsx:113-131
-  abre o menu e confere [light, dark, system]
+  confere que o botão contém useDark e useLight e que não há role="menu"

+packages/design-system/__tests__/modeToggle.test.tsx      (10.3)
+apps/app/__tests__/boardThemeTokens.test.ts               (10.2)

 packages/internationalization/translations/components/ui/mode-toggle.ts
-  trigger, light, dark, system
+  useDark, useLight                                         (10.4)
```

Nenhuma mudança em `Navbar.tsx`, `AppDesignProvider.tsx`, `themePreference.ts`, `layout.tsx` nem na API.

### 10.6 Ordem de implementação e commits

1. `feat(design-system): toggle the theme with one click instead of a menu`: `mode-toggle.tsx`,
   `modeToggle.test.tsx`, ajuste do `componentCopy.test.tsx`.
2. `feat(internationalization): name the theme toggle by its action`: `mode-toggle.ts`.
   Os commits 1 e 2 só passam juntos no typecheck (o componente lê as chaves novas). Se o revisor preferir cada
   commit verde, junta os dois num `feat(packages): …`, como a política aceita para commit misto.
3. `test(app): keep board screens on color tokens`: `boardThemeTokens.test.ts` (mais qualquer troca de cor fixa
   que ele aponte em `boards/**`, num `fix(app): …` separado).
4. `docs(features): theme-toggle`.

### 10.7 Env e configuração

N/A. Sem dependência nova (`next-themes@0.4.6` e `@radix-ui/react-icons` já são do design system).

## Riscos

- **Mudança visível fora do board.** O navbar do painel e a tela de entrar perdem o menu. A opção "Sistema" segue na
  tela da conta e como padrão, então ninguém fica preso; só o atalho de voltar a "sistema" pelo navbar some.
- **Ordem com a `card-backlog`.** O teste de tokens lê os arquivos que existirem. Se a `card-backlog` entrar com cor
  fixa, este teste falha e a correção vem aqui. Se esta spec for implementada antes, as telas novas ficam cobertas
  assim que forem criadas.
- **Falso positivo no teste de tokens** (`#` seguido de letras hex dentro de string). Ver nota em 10.2.
- **Diálogos e menus fora da árvore.** O `next-themes` põe a classe no `<html>` e os portais do Radix montam no
  `body`, então herdam. Fica para o `/test` medir (T4).

## Perguntas em aberto

1. **Cabeçalho próprio do board.** O desenho tem um cabeçalho com logo, menu de seções, estado do runner, tema e
   avatar. `board-import` e `card-backlog` empurraram esse cabeçalho para cá, e esta spec só pede o botão. O plano
   usa o navbar do painel, que já tem o botão ao lado do avatar em todas as telas do board. Recomendação: manter
   assim e registrar o cabeçalho próprio como achado no backlog (spec nova ou parte de `local-runner`, que precisa
   do estado do runner nele).
2. **Alternar direto ou menu com "Sistema".** A spec recomenda alternar direto; o plano adota. Recomendação: seguir
   assim, com "Sistema" só na tela da conta.
3. **Mudar o `ModeToggle` no pacote ou criar um botão só no app.** A política prefere escopo em `apps/*`, mas a
   spec declara o ajuste no `ModeToggle` e a mesma política manda corrigir na raiz. Um botão novo no app deixaria o
   menu vivo só na tela de entrar e no playground. Recomendação: mudar o `ModeToggle`, sem variante.
4. **Tamanho do botão.** O desenho usa 40 px com borda; o navbar usa 36 px com fundo `bg-sidebar-border`
   (`Navbar.tsx:15`). Recomendação: manter o estilo do navbar, igual ao gatilho da sidebar ao lado dele.
