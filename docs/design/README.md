# Design do agent-board

Referência visual das telas do board. A spec diz o quê e por quê; esta pasta mostra como cada tela fica:
layout, estados, textos e o que acontece em cada clique. Consulte antes de planejar ou implementar qualquer
tela do board.

## O que tem aqui

- **Canvas** (fonte da verdade, navegável):
  [Agent Board — Telas](https://claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt). É privado; quem precisar pede
  acesso ao dono. Lá dá para clicar entre as telas e alternar o tema.
- **`screens/<Tela>.dc.html`**: a fonte de cada tela, copiada do canvas sem alteração. Não abre direto no
  navegador, porque depende do runtime do Claude Design. Leia como referência de estrutura, textos e estados.
- **`screenshots/<Tela>.png`**: a imagem de cada tela, no estado em que o canvas abre (aba padrão, opção
  recomendada marcada, tema claro, exceto as telas `Dark*`). O desktop está em 1x e o celular em 2x. As
  imagens foram geradas a partir das fontes, com os componentes do design system redesenhados com os mesmos
  tokens. Layout, textos e cores batem com o canvas; o desenho fino de um componente pode variar alguns
  pixels.
- **`canvas.json`**: índice do canvas, com título, posição e tamanho de cada tela.
- **`reference/vanilla-tokens.css`**: paleta, raios e fontes usados no desenho.
- **Mapa tela → spec**: [`docs/board/SCREENS.md`](../board/SCREENS.md). Cada spec também cita as suas telas
  na seção Referências.

Cópia do canvas feita em 2026-11-25, da versão `1795632665-ea35`.

## Como usar numa tarefa

- **`/analyze`**: abra as telas que a spec cita e traga para o plano os estados, textos e ações que elas
  mostram. Estado que aparece na tela e não está no plano é lacuna do plano.
- **`/develop`**: implemente com o `@repo/design-system` (tabela abaixo). O desenho é referência de layout e
  conteúdo, não código para copiar: nada de `<x-import>`, `VanillaUI` ou estilo inline no app. Textos vão
  para o dicionário de traduções, como qualquer texto de UI.
- **`/test`**: compare a tela pronta com a referência, em claro, escuro e celular.
- **Quando a tela não fecha com o código**: vale a spec. Registre a diferença no handoff, e o canvas é
  atualizado depois.

## Como ler um `.dc.html`

- O conteúdo da tela fica dentro de `<x-dc>`. O `<script type="text/x-dc">` no fim calcula o estado (tema,
  opção marcada, specs escolhidas).
- `<x-import component-from-global-scope="VanillaUI.Button" variant="secondary">Salvar</x-import>` é um
  componente do design system usado no desenho: os atributos são props e o que fica entre as tags é o
  conteúdo.
- `{{nome}}` é um valor que o script calcula (`{{theme}}`, `{{q1a.border}}`).
- `<sc-if>` é condicional; `<sc-for>` repete uma lista.
- `<dc-import name="Main">` embute outra tela, como o quadro por trás de um diálogo.
- `<a href="CardDetail.dc.html">` é a navegação do protótipo e vira rota no app.
- Cores sempre por token (`var(--color-…)`); a equivalência com os tokens do repo está abaixo.

## Equivalência com o design system do repo

O desenho usou o Vanilla Design System, por isso aparecem `VanillaUI.*` e `--color-*`. No app, use os
componentes de `packages/design-system/components/ui/`:

| No desenho | No app |
|------------|--------|
| `VanillaUI.Button` (`primary`, `secondary`, `ghost`, `danger`) | `button.tsx` (`default`, `secondary` ou `outline`, `ghost`, `destructive`) |
| `VanillaUI.Badge` (`ok`, `warn`, `info`, `accent`, `secondary`, `destructive`) | `badge.tsx`; hoje ele só tem `default`, `secondary`, `destructive` e `outline` |
| `VanillaUI.Card` | `card.tsx` |
| `VanillaUI.Avatar` | `avatar.tsx` |
| `VanillaUI.Input`, `Textarea`, `Select`, `Switch` | `input.tsx`, `textarea.tsx`, `select/`, `switch.tsx`; em formulário, os `HookForm*` |
| `VanillaUI.Tabs` | `tabs.tsx` |
| `VanillaUI.Table` | `table.tsx` (com `searchFields` e `onRefresh` em listas) |
| `VanillaUI.Dialog` | `dialog.tsx` |
| `VanillaUI.ToggleGroup` | `toggle-group.tsx` |
| Opções de uma pergunta (botões com `aria-pressed`) | `radio-group.tsx` |
| Escolha das specs de um ciclo | `checkbox.tsx` |
| Folha que sobe no celular (Mover card) | `drawer.tsx` |
| Botão de tema | `mode-toggle.tsx` |
| Estados vazios | `empty.tsx` |
| Barras de progresso | `progress.tsx` |

| Token no desenho | Token no repo |
|------------------|---------------|
| `--color-bg` | `--background` |
| `--color-surface` | `--card` |
| `--color-raised` | `--muted` |
| `--color-ink` | `--foreground` |
| `--color-ink-2`, `--color-muted` | `--muted-foreground` |
| `--color-line` | `--border` |
| `--color-accent`, `--color-accent-fill` | `--primary` |
| `--color-on-accent` | `--primary-foreground` |
| `--color-accent-tint` | `--accent` |
| `--color-ok` | `--success` |
| `--color-warn` | `--warning` |
| `--color-err`, `--color-destructive` | `--destructive` |
| `--color-info` | sem equivalente hoje |

Duas coisas ficam para decidir na primeira spec de tela que precisar delas: os tons de selo que o `badge.tsx`
ainda não tem (`ok`, `warn`, `info`, `accent`), junto com um token para `--color-info`; e se o app adota as
fontes do desenho (Sora nos títulos, Inter no texto) ou fica com a `--font-sans` atual.

## Padrões que se repetem

- **Cabeçalho do board:** logo, nome do board, menu (Quadro · Ciclos · Descobertas · Membros · Minhas
  credenciais · Configuração), estado do runner, botão de tema e avatar.
- **Card no quadro:** a coluna é a etapa; o estado vai num selo. Na fila; rodando, com a última atualização e
  os turnos; aguardando você, com borda de aviso e botão Responder; falhou, com borda de erro, o motivo e
  Rodar de novo; plano pronto, com Aprovar e seguir; volta de retrabalho; selo do ciclo. Nenhum card mostra
  valor ou custo.
- **Sem faixa colorida na borda esquerda dos cards.** O estado fica no selo e na cor da borda.
- **Perguntas dos agentes:** até 4 por rodada, cada uma com 2 a 4 opções e a recomendada marcada; "Escrever
  outra resposta" abre um campo livre.
- **Branch, commit, comando e caminho** em fonte mono. O resto do texto é pt-BR.
- **Celular:** as colunas viram uma lista vertical com atalhos no topo; mover um card é pelo menu "⋯", numa
  folha que sobe; a barra inferior tem Quadro, Ciclos, Descobertas e Mais.
- **Tema:** toda cor vem de token, e o escuro usa os mesmos tokens com outro valor.

## Telas

### 1 · Entrada

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Entrar | [`Login`](screens/Login.dc.html) ([imagem](screenshots/Login.png)) | Um botão, "Entrar com GitHub", e duas linhas sobre acesso e token. |
| Meus boards | [`Boards`](screens/Boards.dc.html) ([imagem](screenshots/Boards.png)) | Um card por board: papel, distribuição dos cards, selos de atenção e ciclo noturno. |
| Novo board | [`NewBoard`](screens/NewBoard.dc.html) ([imagem](screenshots/NewBoard.png)) | Passo 2 de 4 da importação, com um erro do `board.yml` apontado pelo caminho e a prévia das colunas. |

### 2 · Quadro, disparo e cards

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Quadro | [`Main`](screens/Main.dc.html) ([imagem](screenshots/Main.png)) | Oito colunas, de Rascunhos a Concluído; ações Nova spec, Descobrir specs e Rodar ciclo; filtros e aviso de perguntas. Todos os estados de card aparecem aqui. |
| Disparar etapa | [`TriggerStage`](screens/TriggerStage.dc.html) ([imagem](screenshots/TriggerStage.png)) | Diálogo ao soltar o card numa coluna: comando, modelo, branch, onde roda e com que credencial. |
| Card aguardando você | [`CardDetail`](screens/CardDetail.dc.html) ([imagem](screenshots/CardDetail.png)) | Perguntas no topo (interativas), linha do tempo por etapa, abas Spec, Artefatos e Execuções, detalhes ao lado. |
| Card aguardando PR | [`CardPr`](screens/CardPr.dc.html) ([imagem](screenshots/CardPr.png)) | Bloco da PR (checks, review, `/mediate` respondendo) e os relatórios das etapas no molde do contrato. |

### 3 · Administração do board

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Membros | [`Members`](screens/Members.dc.html) ([imagem](screenshots/Members.png)) | Convite por login, tabela com papel no board, permissão no GitHub e papel que vale, e o que cada papel pode fazer. |
| Minhas credenciais | [`Credentials`](screens/Credentials.dc.html) ([imagem](screenshots/Credentials.png)) | Runners online e offline, registro de runner e tarefas agendadas por etapa. |
| Configuração | [`Settings`](screens/Settings.dc.html) ([imagem](screenshots/Settings.png)) | Abas Etapas, Ciclo e agenda (aberta), Specs, Execução e Board. |

### 4 · Estados vazios

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Primeiro acesso | [`BoardsEmpty`](screens/BoardsEmpty.dc.html) ([imagem](screenshots/BoardsEmpty.png)) | Três passos: instalar o GitHub App, aplicar o kit, criar o board. |
| Board recém-criado | [`BoardEmpty`](screens/BoardEmpty.dc.html) ([imagem](screenshots/BoardEmpty.png)) | Nenhuma spec pronta e nenhum runner; colunas vazias com dica do que entra nelas. |
| Operador sem credencial | [`CredentialsEmpty`](screens/CredentialsEmpty.dc.html) ([imagem](screenshots/CredentialsEmpty.png)) | Escolha entre runner e nuvem, e como o card mostra um disparo recusado. |

### 5 · Celular

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Meus boards | [`MBoards`](screens/MBoards.dc.html) ([imagem](screenshots/MBoards.png)) | Boards empilhados e aviso de resposta pendente. |
| Quadro | [`MBoard`](screens/MBoard.dc.html) ([imagem](screenshots/MBoard.png)) | Lista vertical por coluna, atalhos no topo e barra inferior. |
| Mover card | [`MMove`](screens/MMove.dc.html) ([imagem](screenshots/MMove.png)) | Folha "Mover card" com o destino e a credencial (interativa). |
| Responder perguntas | [`MCard`](screens/MCard.dc.html) ([imagem](screenshots/MCard.png)) | Perguntas com a opção marcada e botão Responder fixo no rodapé. |

### 6 · Specs

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Nova spec | [`NewSpec`](screens/NewSpec.dc.html) ([imagem](screenshots/NewSpec.png)) | Diálogo com texto livre e anexos. |
| Spec em escrita | [`SpecDraft`](screens/SpecDraft.dc.html) ([imagem](screenshots/SpecDraft.png)) | Perguntas da rodada (interativas), respostas anteriores e o rascunho da spec ao lado. |
| Descobrir specs | [`Discover`](screens/Discover.dc.html) ([imagem](screenshots/Discover.png)) | Onde procurar, foco e quantidade, e o histórico das descobertas. |
| Propostas de uma descoberta | [`DiscoverResults`](screens/DiscoverResults.dc.html) ([imagem](screenshots/DiscoverResults.png)) | Propostas com evidência; aceitar, refinar ou descartar (interativo). |

### 7 · Ciclo

| Tela | Arquivo | O que mostra |
|------|---------|--------------|
| Novo ciclo | [`CycleStart`](screens/CycleStart.dc.html) ([imagem](screenshots/CycleStart.png)) | Escolha e ordem das specs (interativa) e as opções do ciclo. |
| Ciclo em andamento | [`CycleRun`](screens/CycleRun.dc.html) ([imagem](screenshots/CycleRun.png)) | Andamento spec × etapa, decisões tomadas sem você, decisão para revisar e atividade. |

### 8 · Modo escuro

[`DarkMain`](screens/DarkMain.dc.html) ([imagem](screenshots/DarkMain.png)), [`DarkSpecDraft`](screens/DarkSpecDraft.dc.html) ([imagem](screenshots/DarkSpecDraft.png)),
[`DarkCycleRun`](screens/DarkCycleRun.dc.html) ([imagem](screenshots/DarkCycleRun.png)) e [`DarkMBoard`](screens/DarkMBoard.dc.html) ([imagem](screenshots/DarkMBoard.png)) só embutem a
tela correspondente com `theme="dark"`. As outras telas trazem o botão de tema no cabeçalho.

## Atualizar esta pasta

Quando o canvas mudar, copie as telas alteradas para `screens/` sem reformatar, atualize o `canvas.json` e
a data e a versão da cópia no começo deste arquivo. Gere de novo a imagem das telas que mudaram, para que
`screenshots/` continue igual a `screens/`. Tela nova entra também no
[`docs/board/SCREENS.md`](../board/SCREENS.md) e na spec que a constrói.
