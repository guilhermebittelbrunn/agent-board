# Relatório de QA: login com GitHub

Branch: `guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida; o nome fora do padrão continua
como decisão em aberto da revisão). O working tree também contém a `github-app-integration`, testada à
parte. Nada foi commitado nesta etapa.

Resultado: a feature passa. O E2E escrito no `/develop` tinha três corridas de tempo e foi corrigido
(arquivo de teste). Não há defeito de produção aberto. Um critério fica 🔒 por depender de infra externa
(R1).

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm turbo run test --filter=@repo/auth --filter=app` | 10 tarefas. `@repo/auth` 14 arquivos, 211/211; `app` 93 arquivos, 669/669 (inclui `authProviderSignOutDuringSessionWrite.test.tsx`, que a revisão rodou isolado). |
| `pnpm test` (raiz, `turbo test test:emulator`, JDK 21) | 13/13 tarefas, 10 do cache. `api` 78 arquivos, 892/892 (inclui `apiErrorCodesTranslated`); `api:test:emulator` 4 arquivos, 126/126; `e2e` (Vitest) 16/16; `@repo/kanban-contract` 41; `@repo/sdk` 9; `@repo/internationalization` 35. |
| `pnpm check` | 681 arquivos, nenhum erro. |
| `pnpm --filter e2e typecheck` | Sem erro, depois da correção do spec. |
| `playwright test githubSignIn signIn` (setup + chromium + mobile) | 13/13 na primeira rodada, com o spec original. |
| `playwright test githubSignIn --repeat-each=5`, spec original | 4/10. Falhas: 4 timeouts no popup e 2 asserções de cookie (ver "Correções em arquivo de teste"). |
| `githubSignIn.spec.ts` corrigido, `--repeat-each=5` | 10/10. |
| Spec temporário de linha do tempo do cookie no caso `-bad`, `--repeat-each=8` | 8/8 sem cookie ao fim e depois de recarregar a página; apagado depois da medição. |

Nenhum gate rodou com `--force`. O `pnpm e2e` completo (todas as specs) não rodou: só os specs da
feature e o `signIn.spec.ts`.

## Correções em arquivo de teste

`apps/e2e/tests/githubSignIn.spec.ts` (arquivo novo desta tarefa, ainda não commitado). Três corridas,
todas do teste e não do produto:

1. **Clique em "Add new account" antes de o popup terminar de carregar.** O seletor `#email-input`
   resolvia, mas o campo continuava invisível até o timeout de 120 s. O spec agora espera
   `popup.waitForLoadState()` antes do clique. Depois disso o popup passou 10/10.
2. **Clique no menu de perfil antes da hidratação.** A tela de login navega com recarga completa; o
   `toHaveURL` passa no commit da navegação e o clique cai num botão ainda sem handler. O menu não abria
   e `@e2e-octocat` não aparecia em 5 de 5 tentativas com servidor aquecido. O clique e a asserção estão
   agora dentro de `expect(...).toPass()`.
3. **Asserção do cookie lida uma vez, no instante do alerta.** No caso `-bad`, a gravação do cookie pelo
   `AuthProvider` às vezes termina depois da recusa da API. O provider então apaga o cookie, mas o teste
   já tinha lido. Medido: em 1 de 8 repetições o cookie existia no instante do alerta (1 ms) e já não
   existia 207 ms depois. O spec agora usa `expect.poll` até o cookie sumir.

Nenhum teste de unidade novo: as rotas e os módulos do diff já têm cobertura (ver abaixo).

## Decisões de custo de teste

| Módulo | Decisão |
|--------|---------|
| `apps/api/app/(routes)/auth/sign-in/github/route.ts` | `authSignInGithubRoute.test.ts` (mocks) já cobre 400, 401, 403 por método, os 502 de identidade e o 404 de arquivado. O que só a infra prova (claim `firebase.identities["github.com"][0]` igual ao `rawId` do `accounts:lookup` do emulador) ficou provado pelo E2E existente, sem teste novo. |
| `packages/auth` (filtro de método, `customTokenPOST`, `getUserFromSessionCookie`, provider) | Os unitários da revisão bastam; o E2E mediu a ordem real dos `fetch` no provider. |
| `apps/app` (`SignInForm`, `githubSignInApi`, `ProfileDropdown`) | `signInForm.test.tsx`, `githubSignInApi.test.ts` e `profileDropdownAccount.test.tsx` cobrem; a passada no browser mediu tema e layout. |
| `apps/e2e/tests/githubSignIn.spec.ts` | Faixa cara já existente. Prova o que o mock não prova: o popup do emulador, a claim montada pelo emulador e a corrida do cookie no browser. Corrigido, não ampliado. |

## Critérios de aceite

| # | Critério | Status | Meio |
|---|----------|--------|------|
| 1 | Sem emulador, só o botão do GitHub | ✅ | e2e (browser) + unit. `next dev` com `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=""` e `FIREBASE_AUTH_EMULATOR_HOST` preenchido no servidor: 0 `input[name=email]`, 0 `input[name=password]`, sem "Acesso de teste", 2 notas, botão "Entrar com GitHub". Medido em `next dev`, não em `next build`. O HTML do SSR só traz o loader (a tela renderiza no cliente), então a medição foi no DOM. |
| 2 | No emulador, botão + formulário de teste | ✅ | e2e (browser). Separador "ACESSO DE TESTE (EMULADOR)" com fundo igual ao do card (`lab(100)` em light, `lab(2.75)` em dark). |
| 3 | Primeiro login cria o perfil com `github` | ✅ | e2e (browser + Playwright) + leitura do Firestore do emulador. Documento com `github.id = "8576793069196242191482356285384711342080"` (só dígitos), `github.login = "qa-octocat"`, `github.name = "QA Octocat"`, `github.avatarUrl = null`. |
| 4 | Menu mostra `@<login>` ou e-mail | ✅ | e2e. Conta GitHub: "QA Octocat" / "@qa-octocat", avatar com iniciais "QA". Usuário de senha do seed: e-mail na segunda linha. Em 390 px o menu vai de x=260 a x=389,7, sem rolagem horizontal. |
| 5 | Login repetido atualiza `github.login` | 🔒 | Só unit (`authSignInGithubRoute.test.ts`). O popup do emulador não troca o screen name de conta existente, e em produção depende do OAuth App (R1). |
| 6 | Screen name inválido: fica no login, sem cookie | ✅ | e2e (browser + Playwright 10/10 + linha do tempo 8/8). Alerta: "Não foi possível ler seu perfil do GitHub. Tente entrar novamente. (Código do erro: <uuid>)". URL `/pt-br/sign-in`. Nenhum documento com `github.login = "-bad"`. |
| 7 | A API nunca recebe o access token | ✅ | unit (`githubSignInApi.test.ts`) + leitura da rota (o Zod aceita só `idToken`). |
| 8 | Senha só no emulador | ✅ | unit para "fora do emulador" (`signInMethod`, `sessionRoutesAuthority`, `serverSessionRevocation`, `resolveApiActorSession`, `authSignInRoute`). Dentro do emulador, o login por senha do seed entrou em `/pt-br` no browser e nos 8 casos de `signIn.spec.ts` (desktop e mobile). A API sem emulador exige projeto real, então não há medição em runtime fora do emulador. |
| 9 | A rota do GitHub recusa entrada inválida | ✅ | curl na API do emulador: corpo `{}` → `400 VALIDATION_FAILED`; `idToken: "x"` → `401 AUTH_INVALID_TOKEN`; ID token de senha do seed → `403 AUTH_SIGN_IN_METHOD_DISABLED`. O 404 de perfil arquivado: unit. |
| 10 | Rota do Google removida | ✅ | curl: `POST /auth/sign-in/google` → 404. |
| 11 | Sessão, refresh e guards seguem passando | ✅ | `pnpm test` 13/13 + E2E `signIn.spec.ts` 8/8. |
| 12 | Códigos novos com texto | ✅ | `apiErrorCodesTranslated` dentro da suíte da `api`. |
| 13 | Conta GitHub sem troca de senha | ✅ | e2e. Aba "Segurança": "Esta conta entra pelo GitHub e não tem senha para trocar." |
| 14 | Light, dark e mobile | ✅ | e2e. Botão com 334 px num card de 334 px internos (desktop) e 292/292 (390 px). Notas: `lab(46.64)` sobre branco em light (cerca de 5,1:1) e `lab(66.13)` sobre `lab(2.75)` em dark (cerca de 7,6:1). Botão: cerca de 17:1 nos dois temas. Sem rolagem horizontal. |

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|------|----------|
| 1 | Corrida do cookie depois da recusa | **Confirmado**, com ressalva. O cookie some em 8 de 8 medições; no pior caso existe por menos de 207 ms depois do alerta, até o `DELETE` do provider removê-lo (log: `POST /api/auth/session 200` depois do `DELETE` sem cookie, seguido de `DELETE /auth/session 204` na API e `DELETE /api/auth/session 200` no app). As 2 falhas da primeira repetição eram do teste, que lia o cookie uma vez só. Suíte inteira do `app`: 669/669. |
| 2 | Claim `identities["github.com"][0]` igual ao `rawId` no emulador | **Confirmado**. O login feliz cai em `/pt-br` com `@qa-octocat` (browser) e `@e2e-octocat` (Playwright, 6 execuções). |
| 3 | `github.id` só dígitos, `github.login` igual ao screen name | **Confirmado** no Firestore do emulador (valores no critério 3). |
| 4 | Seletores do popup no `firebase-tools` 15.30.1 | **Confirmado**: `#email-input`, `#display-name-input`, `#screen-name-input`, `#sign-in` e o botão "Add new account" existem. A instabilidade era de tempo de carga, corrigida no spec. |
| 5 | Senha no emulador continua entrando | **Confirmado** (`signIn.spec.ts` 8/8 e browser). |
| 6 | Tela sem emulador | **Confirmado** em `next dev` com a variável pública vazia (critério 1). `next build` não rodou. |
| 7 | Light, dark e mobile 390 px | **Confirmado** (critério 14). |
| 8 | Texto da conta sem senha | **Confirmado** (critério 13). |
| 9 | Login atualizado em produção (R1) | 🔒 Não verificável até o OAuth App existir (item 4 do `docs/PRE-PRODUCTION.md`). |

## Comparação com a tela de referência

Comparei `docs/design/screenshots/Login.png` com a tela medida. Texto, ordem e ícones batem: título
"Entrar", o mesmo subtítulo, botão "Entrar com GitHub" com o ícone do GitHub, linha divisória e as duas
notas com escudo e chave. As diferenças abaixo não estavam no plano, que listou só título, subtítulo,
botão e notas:

- O layout de autenticação existente divide a tela em painel esquerdo com a marca e card à direita. A
  referência centraliza o card, põe o logo "agent-board" acima dele e mostra as etapas do pipeline
  ("Tarefas → … → Aguardando PR") abaixo.
- Na referência o botão é totalmente arredondado e os ícones das notas são roxos. Aqui o botão segue o
  raio padrão do design system e os ícones usam a cor `primary` (quase preta em light, quase branca em
  dark).
- Em 390 px não aparecem a marca nem o seletor de tema; o layout já era assim.

Ficam como observação para uma tarefa de layout da tela de entrada, não como falha desta.

## Observações sem impacto no aceite

- A aba "Segurança" mantém o subtítulo "A senha com que você entra na conta." acima do aviso de que a
  conta GitHub não tem senha. Para essa conta as duas frases se contradizem. Copy fora do corte da spec.
- O `agent-browser` não entrega cliques de ponteiro à janela do popup do emulador. Na passada manual
  dirigi o popup por `eval` (clique no DOM e `requestSubmit`). O Playwright dirige o popup sem isso.
- O campo de senha mostra pontos no placeholder; não é autopreenchimento.

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Popup do emulador de ponta a ponta | Fechada (Playwright 10/10 com o spec corrigido, mais o browser). |
| Identidade gravada no Firestore do emulador | Fechada. |
| Claim × `rawId` no emulador | Fechada. |
| Tela em temas e mobile | Fechada. |
| Senha no emulador | Fechada. |
| Tela sem emulador em build real | Fechada em `next dev`. O `next build` com a variável vazia continua aberto, com risco baixo: a decisão vem de `env.NEXT_PUBLIC_*`, embutida do mesmo jeito nos dois modos. |
| R1 em produção | Fora de alcance até o OAuth App existir. |
| Corrida do cookie no provider | Fechada em runtime (item 1). |
| `customTokenPOST` e `getUserFromSessionCookie` com cookie recusado | Continua fechada só por unitário; fora do emulador não há como medir em runtime. |
| Login repetido com screen name novo (critério 5) | Continua aberta em runtime, coberta por unitário. |

## Evidências e2e

Prints em `docs/features/github-sign-in/test/e2e/`, que o `.gitignore` descarta; a prova é o texto
acima: `01-login-light-desktop.png`, `02-login-dark-desktop.png`, `03-menu-github-login-light.png`,
`04-menu-github-login-dark.png`, `05-menu-mobile-dark.png`, `06-login-mobile-dark.png`,
`07-login-mobile-light.png`, `08-bad-screen-name-alert.png`, `09-login-sem-emulador.png`.

## Ambiente do e2e

- As portas 3000, 3002, 4001, 4400, 4500, 8080, 9099, 9150 e 9199 estavam livres no início. Não
  reutilizei nada de outro checkout.
- Subi um emulador próprio (`pnpm emulators`, JDK 21 do Homebrew em `/opt/homebrew/opt/openjdk@21`,
  portas padrão), a `api` em 3002 e o `app` em 3000 com o mesmo ambiente que o Playwright monta
  (`buildStackEnv`, sem `.env` local). Nas duas primeiras rodadas o Playwright subiu e derrubou os
  próprios servidores.
- No fim derrubei por PID os dois `app` (o segundo sem o host do emulador), a `api` e o emulador
  (SIGINT). Todas as portas acima voltaram vazias. O `test:emulator` do `pnpm test` sobe e derruba o
  próprio emulador; as portas ficaram vazias depois dele também.
- Apaguei os `apps/api/AGENTS.md` e `apps/app/AGENTS.md` gerados pelo `next dev` e os arquivos
  temporários do Playwright (`apps/e2e/qa-tmp*`).

## Dados de QA

Tudo ficou no emulador local, que perde os dados ao parar: `qa-github-sign-in@example.com`
(`qa-octocat`), `qa-github-sign-in-bad@example.com` (`-bad`), as contas `gh-*@example.com` criadas pelo
E2E e as `gh-qa-bad-*@example.com` do spec temporário. Nenhuma conta em projeto Firebase real. A senha
do seed é a do `docs/SETUP.md`, só de emulador, e não está escrita aqui.
