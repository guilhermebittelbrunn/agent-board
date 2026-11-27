# Critérios de Aceite (Checklist)

Critérios da feature `app-cleanup`, reunindo o corte de MVP da spec (`specs/features/app-cleanup.md`), a seção 9 do
plano e a lista "Verificar no `/test`" da revisão. O status de cada um, com o meio de verificação, está em
[`report.md`](report.md).

- [ ] **Landing pública na raiz do locale**
  Sem sessão, `/`, `/pt-br` e `/pt-br/` mostram a landing: a marca no topo com o botão de tema, um `h1` com o nome
  do produto, a frase sobre a ideia (card é spec, coluna é etapa, o agente escreve no card) e o vídeo. `/` redireciona
  para `/pt-br/` e a barra final cai em `/pt-br`, sem passar pelo login. A página não tem preço, depoimento, lista de
  recursos nem chamada de venda, e todo texto vem do dicionário.

- [ ] **Botão da landing leva ao login**
  O link "Entrar com GitHub" da landing aponta para `/pt-br/sign-in` e, ao clicar, a tela de login abre com o botão do
  GitHub e, no emulador, o formulário de e-mail e senha. O link não dispara o popup do GitHub sozinho: quem decide o
  método é a tela de login.

- [ ] **Vídeo da landing: formato, peso e atributos**
  O `<video>` toca mudo, em loop e inline, com `poster` e duas fontes (WebM antes de MP4). O navegador baixa um formato
  só: num Chrome, o `agent-board.webm` (738.543 B) e nunca o MP4 junto. O GIF de 3,9 MB não fica em `public/`.

- [ ] **Primeiro quadro do vídeo mostra o board**
  O quadro 0 do vídeo, que também é o `poster`, mostra o quadro Kanban com o título sobreposto, e não uma tela vazia ou
  preta. Isso vale para quem tem a animação desligada, porque é esse quadro que fica parado.

- [ ] **`prefers-reduced-motion: reduce` mostra a imagem parada**
  Com a preferência ligada, o vídeo fica oculto (`display: none`) e não toca, e o PNG do `poster` aparece no lugar.
  Sem a preferência, o vídeo aparece e a imagem fica oculta. O ideal é que, com a preferência ligada, o arquivo de vídeo
  nem seja baixado; o achado 🟡 da revisão diz que ele desce mesmo oculto, e o `/test` mede isso.

- [ ] **Landing com sessão vai para os boards**
  Com sessão, `/pt-br` e `/pt-br/` redirecionam para `/pt-br/boards` sem a landing aparecer. `/pt-br/sign-in` com sessão
  também vai para `/pt-br/boards`.

- [ ] **Rotas protegidas continuam protegidas para anônimo**
  Sem sessão, `/pt-br/boards`, `/pt-br/account` e `/pt-br//boards` (barra dupla) terminam em
  `/pt-br/sign-in?redirect=<caminho codificado>`. A landing é pública só como raiz exata: `//boards` não pode ser tratado
  como subcaminho de `/`. Arquivo estático de `public/` (ex.: `/landing/agent-board.mp4`) responde 200 sem sessão.

- [ ] **Rotas removidas do app dão 404 com sessão**
  Logado, `/pt-br/entities`, `/pt-br/playground`, `/pt-br/admin` e `/pt-br/admin/users` respondem 404 com a página
  "Página não encontrada", e o botão "Ir para o início" aponta para `/pt-br/boards`. Anônimo, as mesmas rotas caem no
  login (o proxy é default-deny), então o ramo "anônimo vai para `/pt-br`" do 404 não é alcançável por elas.

- [ ] **Rotas removidas da API respondem `ROUTE_NOT_FOUND`**
  Com bearer válido, `GET /entities`, `/notifications`, `/users`, `/users/summary` e `/account/password` respondem
  404 `{ "error": { "code": "ROUTE_NOT_FOUND" } }` pelo catch-all. O `next build` da API não lista nenhuma dessas rotas.

- [ ] **Guard de sessão sem `x-role` e sem `type`**
  `requireSessionApi` responde 401 `AUTH_INVALID_TOKEN` sem bearer e 403 `AUTH_PROFILE_NOT_FOUND` sem perfil (ou perfil
  arquivado). Não lê `x-role` nem o campo `type` do perfil. O CORS só libera `Content-Type`, `Authorization` e
  `x-locale` em `Access-Control-Allow-Headers`.

- [ ] **Perfil legado com `type: "admin"` usa o board**
  Um perfil com `type: "admin"` gravado à mão no Firestore abre `/pt-br/boards`, vê os próprios boards e escreve no
  board (cria rascunho de spec com anexo, aprova). Nenhuma navegação leva a `/admin`. `GET /boards` com `x-role: admin`
  devolve 200 só com os boards da própria pessoa; outra pessoa com o mesmo cabeçalho recebe lista vazia, e o board
  alheio por id responde 404 `BOARD_NOT_FOUND`.

- [ ] **Primeira carga autenticada sem 401**
  Recarregar `/pt-br/boards`, `/pt-br/boards/<id>`, a página de um card e `/pt-br/account` não gera nenhuma resposta
  401 da API, nem do navegador nem do render no servidor. O `ApiAuthProvider` escreve o bearer antes de liberar as
  queries.

- [ ] **Cabeçalho sem sidebar**
  O layout autenticado é um cabeçalho de 64 px com a marca (link "Ir para os boards" para `/pt-br/boards`), o botão de
  tema e o avatar. Não há sidebar, botão de abrir sidebar, sino de notificações nem troca de painel. O botão de tema
  alterna a classe `dark` do documento.

- [ ] **Menu do avatar com Perfil, Preferências, Cookies e Sair**
  O menu mostra o nome e o `@login` do GitHub, e os itens Perfil (`/pt-br/account?tab=profile`), Preferências
  (`?tab=preferences`), "Preferências de cookies" (só com medição configurada, abre o diálogo de consentimento) e Sair.
  Sair encerra a sessão e leva à landing; depois disso `/pt-br/boards` volta a exigir login.

- [ ] **Conta com duas abas e Segurança removida**
  `/pt-br/account` tem só Perfil e Preferências. `?tab=security` abre Perfil (URL reescrita para `?tab=profile`), e
  `?tab=` ausente também. Salvar uma preferência (ex.: tema Escuro) responde 200, mostra "Preferências atualizadas." e
  aplica o tema.

- [ ] **Fluxos do board sem regressão**
  Criar board pelo assistente, sincronizar backlog, mover card com a confirmação de disparo, abrir o card, e abrir
  Membros, Configuração e Minhas credenciais funcionam como antes da remoção do `isImpersonating`. Os botões de ação
  (Convidar, Gerar código, Salvar) aparecem para quem tem o papel.

- [ ] **`spec-authoring` de ponta a ponta**
  "Nova spec" com um anexo de texto cria o rascunho (`POST attachments` 201, `POST drafts` 201). Aprovar leva o card a
  Tarefas; descartar pede confirmação e remove o rascunho. O agente, com o token da execução, lê o anexo por
  `get_attachment` com `stage: "spec"` e recebe nome, tipo, tamanho e conteúdo; com outra etapa recebe 403
  `AGENT_STAGE_MISMATCH`.

- [ ] **Tema e responsivo**
  Landing, boards, quadro, card, conta e membros, em light e dark, a 1280 px e a 390×844, sem rolagem horizontal
  (`scrollWidth` igual à largura da janela) e com o cabeçalho cabendo inteiro. No celular o nome ao lado do avatar some
  e o menu abre dentro da tela.

- [ ] **Builds e suítes**
  `pnpm test` da raiz (incluindo `test:emulator`), `pnpm e2e` (a suíte reescrita, desktop e celular) e `next build` de
  `apps/app` e `apps/api` passam. O `next build` do app só lista `/[locale]`, a conta, as telas de board e o login.

- [ ] **Nenhuma referência ao que saiu**
  `grep` por `entity`, `entities`, `playground`, `requireAdminApi`, `requireCommonPanelApi`, `isImpersonating` e
  `x-role` em `apps/` e `packages/` só encontra os nomes genéricos já listados no handoff (`Mapper<Entity, DTO>`,
  entidades HTML do `marked`) e testes que afirmam a ausência.
