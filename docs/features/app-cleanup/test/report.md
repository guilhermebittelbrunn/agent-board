# Relatório de QA: app-cleanup

Rodada autônoma do `/cycle`, em 2026-11-27, na branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (não é
protegida). O QA não criou teste nem alterou código de produção. Os critérios completos estão em
[`criterios-aceite.md`](criterios-aceite.md).

## Resultado

| | |
|---|---|
| Critérios | 20 no total: 19 ✅, 1 ✅ com ressalva (vídeo baixado com `prefers-reduced-motion`), 0 ❌, 0 🔒 |
| "Verificar no `/test`" da revisão | 9 itens: 8 confirmados, 1 confirmado como achado 🟡 (o vídeo desce oculto) |
| Defeito bloqueante | nenhum |

### Correção depois do teste

O orquestrador do `/cycle` corrigiu o 🟡 depois desta rodada: as duas `<source>` do vídeo da landing ganharam
`media="(prefers-reduced-motion: no-preference)"`, então com movimento reduzido nenhuma fonte casa e o browser não
baixa o vídeo. Medido só por `landingPage.test.tsx` (5/5, confere o atributo nas duas fontes) e typecheck do app. O
efeito na rede **não foi remedido no browser**: confira na próxima passada (cache vazio, reduced-motion emulado, só o
poster deve descer).

## Cobertura e gates

| Gate | Comando | Resultado |
|---|---|---|
| Vitest, todos os workspaces + emulador | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm test` | 14/14 tarefas (11 do cache), 54 s. api 87 arquivos / 1012 testes, app 83 / 659, emulador 8 / 133, auth 211, design-system 150, kanban-contract 145, security 65, shared 51, analytics 41, runner 46, next-config 34, i18n 33, e2e (vitest) 16, sdk 9 |
| E2E Playwright | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm e2e` | 20/20 em 1,0 min (setup 2, chromium 14, mobile 4) |
| Build da API | `next build` em `apps/api` | passou; 46 rotas, nenhuma de `entities`, `notifications`, `users` ou `account/password` |
| Build do app | `next build` em `apps/app` | passou; rotas `/`, `/[locale]`, `/[locale]/account`, 7 de board, `/[locale]/sign-in` e as 3 de `api/auth` |
| Varredura de referências | `grep -rniE` por `entity`, `entities`, `playground`, `requireAdminApi`, `isImpersonating`, `requireCommonPanelApi` e `x-role` em `apps` e `packages` | só `SpecMarkdown.tsx`, `Mapper.ts`, `MapperInterface.ts`, `session.mapper.ts` e os testes `sessionGuard`/`firestoreIndexes`, todos na lista de exceções do handoff |

`pnpm check`, `typecheck` e `apiErrorCodes` não foram remedidos aqui: o `/review` mediu os três depois da última
mudança de código. O typecheck do app e da API também roda dentro do `next build`, que passou.

O `next build` da API exige `FIREBASE_ADMIN_*` preenchidos (o `env.ts` só pula a validação em `development`). Foram
passados valores de mentira pela linha de comando, sem gravar em arquivo. O CI não roda `next build`; quem fizer o
build fora da Vercel precisa saber.

## Critérios de aceite, item a item

| # | Critério | Status | Meio |
|---|---|---|---|
| 1 | Landing pública na raiz do locale | ✅ | browser + curl. `/` → 307 `/pt-br/` → 308 `/pt-br` → 200. Título "Board Kanban para o Claude Code \| agent-board"; `h1` "agent-board" |
| 2 | Botão da landing leva ao login | ✅ | browser + Playwright `signIn.spec.ts` (desktop e celular) |
| 3 | Vídeo: formato, peso e atributos | ✅ | browser: `muted`, `loop`, `playsInline`, `currentSrc` `agent-board.webm`; só o WebM (738.543 B) e o poster (59.745 B) descem |
| 4 | Primeiro quadro mostra o board | ✅ | browser, vídeo pausado em `currentTime=0` |
| 5 | `prefers-reduced-motion` | ✅ com ressalva | vídeo oculto e imagem visível, mas o WebM descia inteiro. Corrigido depois (ver acima) |
| 6 | Landing com sessão vai para boards | ✅ | `/pt-br`, `/pt-br/` e `/pt-br/sign-in` logado terminam em `/pt-br/boards` |
| 7 | Rotas protegidas para anônimo | ✅ | curl: `/pt-br/boards` e `/pt-br/account` → 307 para o login com `redirect`; `/pt-br//boards` → 308 `/pt-br/boards` → login; `proxy.test.ts` cobre `//boards` no proxy |
| 8 | Rotas removidas do app dão 404 | ✅ | browser: 404 e "Ir para o início" → `/pt-br/boards` |
| 9 | Rotas removidas da API | ✅ | curl com bearer → 404 `ROUTE_NOT_FOUND` |
| 10 | Guard de sessão | ✅ | `/boards` sem bearer → 401 `AUTH_INVALID_TOKEN`; preflight com `Content-Type, Authorization, x-locale`; 403 `AUTH_PROFILE_NOT_FOUND` por `sessionGuard.test.ts` |
| 11 | Perfil legado `type: "admin"` | ✅ | emulador: a conta com `type: "admin"` abriu boards, criou e aprovou rascunho; `x-role: admin` ignorado; board alheio → 404 `BOARD_NOT_FOUND` |
| 12 | Primeira carga sem 401 | ✅ | 0 respostas 401 no log da API na passada inteira |
| 13 | Cabeçalho sem sidebar | ✅ | cabeçalho de 64 px com marca, tema e avatar |
| 14 | Menu do avatar | ✅ | Perfil, Preferências, "Preferências de cookies" e Sair; Playwright `accountSettings.spec.ts` |
| 15 | Conta com duas abas | ✅ | Perfil e Preferências; `?tab=security` → `?tab=profile`; tema salvo com `PUT /account` 200 |
| 16 | Fluxos do board | ✅ | novo board, sincronizar backlog, mover para Análise até Concluído, membros, configuração, credenciais |
| 17 | `spec-authoring` | ✅ | rascunho com anexo, aprovar, descartar; `get_attachment` com `stage: "spec"` → 200, `stage` errado → 403 `AGENT_STAGE_MISMATCH` |
| 18 | Tema e responsivo | ✅ | 390×844 com `scrollWidth` 390 em todas as telas; light e dark; `a11yDark.spec.ts` sem violação séria |
| 19 | Builds e suítes | ✅ | ver "Cobertura e gates" |
| 20 | Nenhuma referência ao que saiu | ✅ | `grep` acima |

## Verificar no `/test` (lista da revisão)

1. Primeira carga autenticada sem 401: confirmado (critério 12).
2. Landing com `prefers-reduced-motion`: confirmado o achado 🟡 (o WebM descia inteiro mesmo oculto). Corrigido depois, sem remedição no browser.
3. Rotas públicas exatas: confirmado. O Next responde 308 para `/pt-br//boards` antes do proxy; o unitário cobre o caminho direto.
4. Rotas removidas: confirmado no app e na API. O ramo "anônimo vai para `/pt-br`" do 404 só é coberto pelo unitário de `resolveNotFoundHomePath`.
5. Perfil legado: confirmado.
6. `spec-authoring` ponta a ponta: confirmado.
7. Cabeçalho: confirmado. "Preferências de cookies" só aparece com medição configurada (testado com um ID de GA de mentira num `.env` temporário, cookies recusados).
8. `next build` do app e da API: os dois passam.
9. Primeiro quadro do vídeo: confirmado.

## Observações fora do escopo

- A página 404 (`app/not-found.tsx`) não tem `<title>`. O problema vem de antes.
- Depois de descartar um rascunho, o app ainda pede `spec` e `events` do card apagado (4 respostas 404) enquanto volta ao quadro. Nada aparece na tela. Vem da `spec-authoring`.

## Decisões de custo de teste

O QA não criou teste: guard, proxy, bearer no render e landing já tinham unitário, e a suíte E2E reescrita (20 testes) cobre landing, login, conta e acessibilidade em dark. O download com reduced-motion só se mede no browser.

## Lacunas herdadas

| Lacuna | Veredito |
|---|---|
| Nenhum E2E percorre um board | aberta, fora do corte pela spec |
| Barra fixa com formulário longo sem E2E | aberta, risco aceito na spec |
| `BaseRepository.countQuery` sem teste e sem consumidor | aberta; recomendação é remover o método |
| Escrita do bearer no primeiro render | fechada (unitário + critério 12) |

## Ambiente e dados de QA

Portas livres no início e no fim (3000, 3002, 8080, 9099, 9199, 4001, 4400, 4500, 9150). Emuladores com o JDK 21 de `/opt/homebrew/opt/openjdk@21`, `pnpm seed`, `next dev` de API e app; processos mortos pelo PID. Apagados `apps/*/.env`, `apps/*/AGENTS.md`, `firestore-debug.log` e `apps/*/.next`. Tudo no emulador; nenhuma conta em projeto real, `docs/PRE-PRODUCTION.md` não muda.
