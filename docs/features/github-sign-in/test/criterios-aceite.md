# Critérios de Aceite (Checklist)

Feature: login com GitHub (`github-sign-in`). O status medido de cada item está em [`report.md`](report.md).

- [x] **Sem emulador, a tela de login mostra só o botão do GitHub**
  Com `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` vazio, `/pt-br/sign-in` mostra o título "Entrar", o
  subtítulo, o botão "Entrar com GitHub" e as duas notas (permissão no repositório e token do GitHub).
  Não aparece nenhum `input[name=email]` nem `input[name=password]`, e o rótulo "Acesso de teste
  (emulador)" também não. A decisão segue a variável pública: ter só `FIREBASE_AUTH_EMULATOR_HOST`
  preenchido no servidor não faz o formulário aparecer.

- [x] **No emulador, a tela mostra o botão e, separado, o formulário de teste**
  Com o host do emulador preenchido, o formulário de e-mail e senha aparece abaixo de um separador com o
  rótulo "Acesso de teste (emulador)". O fundo do rótulo é o mesmo do card (`bg-card`), para a linha não
  cortar o texto, em light e em dark. Os rótulos "Email" e "Senha" não mudam.

- [x] **Primeiro login pelo GitHub cria o perfil com a identidade do GitHub**
  O popup do GitHub (no emulador, "Add new account" com screen name válido) leva a pessoa a `/pt-br`
  com o cookie `access-token`. O documento da coleção `user` passa a ter `github.id` só com dígitos,
  `github.login` igual ao screen name, `github.name` igual ao display name e `github.avatarUrl` `null`
  quando não há foto. O `login` sai do `accounts:lookup` feito com o ID token verificado, e qualquer
  `login` mandado no corpo é ignorado.

- [x] **O menu de perfil mostra `@<login>` para conta GitHub e o e-mail para as demais**
  Para conta com `github`, a segunda linha do menu mostra `@<login>`. Sem foto, o avatar mostra as
  iniciais. Para conta sem `github` (usuário de senha do seed), o menu continua mostrando o e-mail.
  Em mobile (390 px) o menu fica inteiro dentro da tela.

- [ ] **Login repetido com outro screen name atualiza `github.login`**
  Se o GitHub devolve outro `login` para a mesma conta, a rota grava o novo valor; sem mudança, não
  escreve no Firestore. Em produção isso depende do OAuth App criado (risco R1, item 4 do
  `docs/PRE-PRODUCTION.md`). A UI do emulador não oferece troca de screen name de conta existente.

- [x] **Screen name que não é login do GitHub mantém a pessoa no login, sem sessão**
  Com screen name `-bad`, a API responde `502 AUTH_GITHUB_PROFILE_UNAVAILABLE` e a tela mostra o texto
  traduzido "Não foi possível ler seu perfil do GitHub. Tente entrar novamente." com o código do erro. A
  URL continua `/pt-br/sign-in`. Nenhum cookie `access-token` sobra, mesmo quando o `AuthProvider`
  termina de gravar o cookie depois da recusa da API: nesse caso o provider apaga o cookie logo em
  seguida. Nenhum documento com `github.login = "-bad"` é criado.

- [x] **A API nunca recebe o access token do GitHub**
  O cliente manda para `POST /auth/sign-in/github` e para `/api/auth/session` só o ID token do
  Firebase. O schema da rota aceita apenas `idToken`; o resto do corpo é descartado.

- [x] **Senha só vale no emulador**
  Fora do emulador: `POST /auth/sign-in` responde `403 AUTH_SIGN_IN_METHOD_DISABLED` antes de ler o
  corpo, `/api/auth/session` com token de senha responde 403 sem gravar cookie, bearer ou cookie de senha
  na API viram anônimo (401 nas rotas protegidas), `customTokenPOST` recusa e limpa cookie de senha e
  `getUserFromSessionCookie` devolve `null`. `google.com` é recusado até no emulador. Dentro do emulador,
  o login por senha do seed continua entrando.

- [x] **A rota do GitHub recusa token de outro método e entrada inválida**
  `POST /auth/sign-in/github` com corpo vazio responde `400 VALIDATION_FAILED`; com token inválido,
  `401 AUTH_INVALID_TOKEN`; com ID token de senha válido, `403 AUTH_SIGN_IN_METHOD_DISABLED`. Perfil
  arquivado responde 404.

- [x] **A rota do Google não existe mais**
  `POST /auth/sign-in/google` responde 404, e nenhum código ainda chama `signInWithGoogle`.

- [x] **Sessão, refresh e guards seguem passando**
  A suíte inteira (`pnpm test`, com o `test:emulator`) e os fluxos de login do E2E (`signIn.spec.ts` em
  desktop e mobile) passam com o filtro de método ligado.

- [x] **Os códigos de erro novos têm texto**
  `AUTH_SIGN_IN_METHOD_DISABLED` e `AUTH_GITHUB_PROFILE_UNAVAILABLE` estão em `apiErrors`, e o teste
  `apiErrorCodesTranslated` passa.

- [x] **Conta GitHub não tem troca de senha na tela da conta**
  Na aba "Segurança" de `/pt-br/account`, uma conta GitHub vê "Esta conta entra pelo GitHub e não tem
  senha para trocar." no lugar do formulário.

- [x] **Tela legível em light, dark e mobile**
  Em light e dark, desktop e 390 px, o botão do GitHub ocupa a largura interna do card, as notas passam
  de 4,5:1 de contraste e não há rolagem horizontal.
