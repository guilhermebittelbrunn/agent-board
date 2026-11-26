# Critérios de Aceite (Checklist)

Tema claro e escuro no board. O status de cada item, com o meio que o provou, está em
[`report.md`](report.md#critérios-de-aceite).

- [ ] **Um clique no navbar troca o tema, sem menu e sem recarregar**
  O botão redondo do navbar do painel alterna entre claro e escuro no primeiro clique. Nenhum menu abre
  (zero elementos `role="menu"` depois do clique) e a página não recarrega: o estado da janela continua o
  mesmo e quadro, colunas, cards e navbar trocam de cor na hora. Clicar de novo volta ao tema anterior. O
  clique sempre escolhe o oposto do tema resolvido, então funciona igual quando a preferência guardada é
  "Sistema".

- [ ] **O nome acessível diz a ação, um por tema**
  Na árvore de acessibilidade do navegador, o botão se chama só "Usar tema escuro" no claro e só "Usar tema
  claro" no escuro. Os dois textos estão no HTML, mas o do outro tema fica com `display: none` e sai da
  árvore. O nome não depende do estado do `next-themes`, então o HTML do servidor e o do cliente são iguais e
  o console não mostra aviso de hidratação, com ou sem o cookie `x-theme`.

- [ ] **O ícone diz a ação e fica centrado**
  No claro aparece a lua; no escuro, o sol. O ícone escondido fica com escala 0. O ícone visível tem 16 px e
  o centro dele coincide com o centro do botão de 36 px nos dois temas.

- [ ] **Quem nunca escolheu vê o tema do sistema**
  Sem `localStorage.theme` e sem o cookie `x-theme`, o board abre no tema do sistema operacional: escuro com
  `prefers-color-scheme: dark`, claro com `light`, e o nome do botão acompanha. Com a preferência
  "Sistema" salva na conta, trocar o tema do sistema troca a tela sem recarregar.

- [ ] **A escolha persiste e a primeira pintura já vem no tema certo**
  Depois do clique, `localStorage.theme` e o cookie `x-theme` guardam o valor escolhido (`light` ou `dark`).
  Ao recarregar, o servidor já manda o `<html>` com a classe do tema, então a tela não pisca. Isso vale mesmo
  quando a escolha contraria o sistema (claro escolhido com o sistema em escuro).

- [ ] **Diálogos, menus, toasts e a tabela antd seguem o tema**
  No escuro, o menu "⋯" do card, o menu de ações do membro, o diálogo "Mudar o papel de …", o toast da
  sincronização e a tabela de membros (antd) usam fundo escuro e texto claro. No claro, o inverso. O
  cabeçalho da tabela troca de cor com o tema.

- [ ] **O botão fica ao lado do avatar em todas as telas do board, no desktop e no celular**
  Em `/boards`, `/boards/new`, `/boards/<id>`, no detalhe do card, em Membros e em Configuração, o botão
  aparece no navbar imediatamente à esquerda do avatar. A 390 px ele continua visível, ao lado do avatar, sem
  rolagem horizontal, e alterna do mesmo jeito.

- [ ] **Nenhuma tela do board deixa trecho claro no escuro**
  No escuro, as telas do board só mostram fundos claros onde o token pede (botão primário, selo de
  notificação, checkbox marcado). Nenhum arquivo de `boards/**` usa cor fixa: o teste de tokens reprova
  `bg-white`, `text-gray-500`, `ring-offset-white`, cor arbitrária em `#hex`, `rgb(`, `oklch(` e afins.

- [ ] **A opção "Sistema" continua na tela da conta**
  Em Conta, aba Preferências, o rádio "Sistema" existe e "Salvar preferências" grava `system` mesmo quando a
  conta já tinha `system`. Depois de salvar, a tela volta a seguir o sistema. O rádio mostra a preferência da
  conta, não o tema do navegador: depois de alternar pelo navbar, ele pode continuar em "Sistema" com a tela
  no escuro.

- [ ] **A tela de entrar alterna direto**
  Em `/sign-in`, com largura `lg` ou maior, o botão do painel lateral troca o tema no primeiro clique, sem
  abrir menu, com os mesmos nomes acessíveis do navbar. Abaixo de `lg` o painel lateral não aparece.

- [ ] **Sem regressão nos fluxos críticos**
  A suíte Vitest de todos os workspaces e a suíte Playwright (`pnpm e2e`, inclusive acessibilidade no escuro)
  passam com as seis tarefas do ciclo no working tree.
