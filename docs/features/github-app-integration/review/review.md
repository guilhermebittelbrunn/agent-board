# Revisão: integração com o GitHub App do board

Escopo: o diff do working tree em `apps/api`, `packages/shared`, `packages/internationalization`,
`docs/SETUP.md` e `docs/PRE-PRODUCTION.md`, lido contra o `develop/handoff.md` e o
`docs/review-checklist.md`. A auditoria do backlog (`specs/`) está no mesmo working tree e entra num
commit próprio.

## Branch

- Atual: `guilhermebittelbrunn/chore-cycle-three-tasks`, sem upstream e sem commit além de `main`.
- Regex do padrão `<project>/<type>/<title>`: **inválida**. O prefixo `guilhermebittelbrunn/` não é
  projeto do repo e `chore-cycle-three-tasks` junta tipo e título num segmento só.
- O usuário pediu as três tarefas do `/cycle` nesta branch, então a revisão não renomeou nem criou outra.
  Fica como decisão em aberto. Nome proposto: `feat/cycle-three-tasks` (a branch toca mais de um
  workspace, por isso sem `project`). Como não há remoto nem commit de terceiro, basta
  `git branch -m feat/cycle-three-tasks` antes do primeiro commit.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | branch | Nome fora do padrão (ver acima). | Decisão em aberto. |
| 🟢 | `apps/api/(shared)/lib/github/github-rest-client.ts:83-86`, `github-installation-tokens.ts:22-25` | Um 401 com token de instalação não tira o token do cache. Se o GitHub revogar o token, as chamadas daquela instalação respondem `502 GITHUB_UNAVAILABLE` até o token chegar a 60 s da expiração (no máximo 1 h) e o log diz `app-credentials-rejected`, que aponta para a chave do App e não para o token. | Não corrigido: revogação de token de instalação é rara, o efeito é um 502 e nada vaza. Fica para quando um consumidor real existir (`board-import`). |
| 🟢 | `github-rest-client.ts:51-60,287-290` | Arquivo acima de 1 MB vem do GitHub com `encoding: "none"`, cai no segundo ramo do `contentSchema` e `readFile` devolve `null`, a mesma resposta de arquivo ausente. | Não corrigido: um `.kanban/board.yml` não chega perto disso. Registrado para a `board-import` não dizer "arquivo não encontrado" nesse caso. |
| 🟢 | `specs/features/github-app-integration.md:22` | O "Próximo passo" ainda mandava rodar `/develop`. | Corrigido para `/test github-app-integration`. |
| ✅ | `apps/api/app/(routes)/github/webhook/route.ts:29-56` | Segredo ausente responde `503 GITHUB_APP_NOT_CONFIGURED` antes de ler o corpo; o corpo é lido com teto de 1 MiB por stream (`readCappedBody`), e a assinatura é conferida antes de qualquer `JSON.parse`. | Nenhuma. |
| ✅ | `github-webhook-signature.ts:10-19` | Exige o prefixo `sha256=`, compara tamanho antes do `timingSafeEqual` (que lançaria com buffers de tamanhos diferentes); hex inválido vira buffer curto e cai no `false`. | Nenhuma. |
| ✅ | `github-app-config.ts:37-44` | O cliente falso só é escolhido quando `isEmulated()` é verdadeiro, a mesma função que manda o Admin SDK para o projeto `demo-*`. Sem emulador e sem credencial o modo é `off` e `getGithubClient()` devolve `null`. Não depende de `NODE_ENV` de propósito: o job `e2e` roda o build de produção contra o emulador. | Nenhuma. |
| ✅ | `github-rest-client.ts:142-192`, `github-errors.ts:9-19` | Nenhum segredo chega a log ou resposta: `logEvent` aceita só escalares e nenhum call site passa chave, JWT, token ou corpo; o `catch` do `fetch` e do `sign` descarta o erro original; a mensagem do `GithubApiError` é só o `kind`. O `Link: rel="next"` só é seguido para `https://api.github.com`. | Nenhuma. |
| ✅ | `github-errors.ts:26-58` | Toda falha do GitHub vira `error.code` com status (404, 503, 502); nenhum caminho previsto termina em 500. Os sete códigos têm copy em `apiErrors`. | Nenhuma. |
| ✅ | `route.ts:28` | `export async function POST` sem guard. A rota é pública e se autentica pela assinatura, como `auth/sign-in`; o plano (§4.1) define isso. | Nenhuma. |

A skill `/code-review` (nível `low`) não apontou defeito de correção no diff.

## Correções aplicadas

- `specs/features/github-app-integration.md:22`: "Próximo passo" passou de `/develop` para `/test`.

Nenhuma mudança de código.

## Raio de impacto

- `LogScope` ganhou `"github"` e `HTTP_STATUS` ganhou `BAD_GATEWAY` (`packages/shared`). As duas mudanças
  só acrescentam valores; nenhum consumidor existente faz `switch` exaustivo sobre elas.
- `apiErrors` ganhou sete chaves. O `apps/app` não usa nenhuma ainda.
- `apps/api/package.json` passou a depender de `@repo/kanban-contract` (link de workspace, sem pacote
  externo novo; o lockfile ganhou 3 linhas).
- `apps/api/instrumentation.ts` passou a avisar no boot. `corsOriginBoot.test.ts` foi ajustado para manter
  o caso "boot silencioso" com as três variáveis preenchidas, sem afrouxar a asserção.
- Nenhum consumidor de `getGithubClient()` ainda; o primeiro é a `board-import`.

## Verificar no `/test`

O handoff afirma estas coisas e a leitura do código não basta para confirmá-las:

1. **O webhook passa pelo `proxy.ts` com uma entrega real.** Os testes chamam o `POST` da rota direto e
   pulam o proxy. Pela leitura, uma requisição sem `Origin` e sem cookie passa pela checagem de origem e
   cai no orçamento `standard` de rate limit. Repro: com a API de pé e um `GITHUB_WEBHOOK_SECRET` de shell,
   `curl -X POST localhost:3002/github/webhook -H 'X-GitHub-Event: ping' -H "X-Hub-Signature-256: sha256=$(printf '{}' | openssl dgst -sha256 -hmac "$S" -r | cut -d' ' -f1)" -d '{}'`
   deve responder `200 {"data":{"handled":false}}`, não `403 AUTH_FORBIDDEN_ORIGIN`.
2. **Modo `fake` com o processo de pé.** `pnpm --filter api dev` contra o emulador deve imprimir uma vez
   `[github] GitHub App is NOT configured: using the sample repositories of the emulator.` e, sem segredo,
   a linha do `GITHUB_WEBHOOK_SECRET`. O handoff só mediu isso em teste unitário.
3. **413 sem `Content-Length`.** Corpo de 2 MB enviado com `Transfer-Encoding: chunked`
   (`curl -H 'Transfer-Encoding: chunked' --data-binary @2mb.bin`) deve responder
   `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE`, sem erro não tratado no log.
4. **Log limpo com o servidor de pé.** Depois das entregas acima, `grep` do segredo e de um login que
   estava no corpo no log da API: zero ocorrências.
5. **Rate limit no webhook (risco R4).** A 61ª entrega no mesmo minuto responde `429 AUTH_RATE_LIMITED`
   quando há `ARCJET_KEY`; sem chave o limite é no-op. Só registrar o número, a decisão fica para a
   `pr-flow`.
6. 🔒 **Sinais de pronto contra repositório real** (listar repositórios, ler `.kanban/board.yml`,
   permissão de colaborador, entrega real do GitHub): dependem do App criado, item 5 do
   `docs/PRE-PRODUCTION.md`. Não verificáveis.

## Lacunas de teste

| Lacuna | Veredito |
|--------|----------|
| YAML de exemplo lido por um parser (hoje só o objeto equivalente) | Fora de escopo: entra com a `board-import`, que traz o parser. |
| Teto de 10 páginas (`pagination-truncated`) sem teste | Continua aberta. |
| Formato real de `role_name` de colaborador externo | Continua aberta, bloqueada pelo App real (R1). |
| 401 com token de instalação no cache (achado 🟢 acima) | Nova, aberta, baixa prioridade. |
| Webhook atravessando o `proxy.ts` | Nova; vai para o `/test` como item 1 da lista acima. |

## Decisões em aberto

1. **Nome da branch.** Recomendação: `git branch -m feat/cycle-three-tasks` antes do primeiro commit
   (sem remoto, sem commit de terceiro). Se o usuário preferir manter o nome atual, os commits seguem
   iguais, mas a PR fica fora do padrão.
2. **`specs/features/github-app-integration.md`** mistura a deriva da auditoria (riscos e pergunta sobre o
   cliente falso) com a mudança de status do `/analyze` (`proposed` → `in-progress`, `feature:`). Decidi
   pôr o arquivo inteiro no commit `docs(specs)`: separar exigiria `git add -p`, e `in-progress` é status
   de pipeline, não aprovação. Mover a spec para `approved` continua com o usuário.
3. **Commits intermediários e o `apiErrorCodes`.** A ordem pedida põe o i18n depois da `apps/api`, então
   o teste `apiErrorCodes` falha nos commits da API até o commit do i18n entrar. É a ordem da regra do
   repo; só afeta quem fizer bisect.

## Gates

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | `Checked 673 files … No fixes applied.` |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=@repo/internationalization` | 2/2 tarefas sem erro (cache). `@repo/shared` não tem script de typecheck; as duas linhas novas são cobertas pelo typecheck da `api`, que as importa. |
| `apiErrors` | `pnpm --filter api test apiErrorCodes` | 1 arquivo, 2/2 testes. |

A suíte completa não rodou aqui; o handoff registra 887 testes da API passando, e a revisão não mudou
código.

## Plano de commits

O plano final das três tarefas está em
[`docs/features/board-import/review/review.md`](../../board-import/review/review.md#plano-de-commits-tarefas-1-2-e-3).
O texto abaixo fica como registro.

Substituído pelo plano consolidado das tarefas 1 e 2, em
[`docs/features/github-sign-in/review/review.md`](../../github-sign-in/review/review.md#plano-de-commits-tarefas-1-e-2).
Os commits desta tarefa mantêm mensagem e arquivos, com três mudanças: o lockfile e o `.env.example`
levam também a linha da tarefa 2 (commit 6 de lá); o `translations/packages/shared/utils.ts` entra num
commit de copy das duas tarefas (`feat(internationalization): add copy for GitHub and sign-in error codes`);
e `docs/SETUP.md` com `docs/PRE-PRODUCTION.md` entram num commit de docs das duas
(`docs: document GitHub App and GitHub sign-in setup`). Separar qualquer um deles exigiria `git add -p`.

Varredura de segredo em `docs/features/github-app-integration/`: nenhuma senha, token ou chave. O único
`BEGIN PRIVATE KEY` do diff é a string falsa `abc` em `githubClientMode.test.ts:20`.

Commits realizados: _(preenchido pelo orquestrador)_
