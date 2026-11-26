# Handoff do develop: integração com o GitHub App do board

Plano: [`analyze/plan.md`](../analyze/plan.md). Nada foi commitado; tudo está no working tree.

## Desvios do plano (leia primeiro)

1. **`@repo/kanban-contract` não era dependência da `apps/api`.** O plano importa `GithubRepoRole` e
   `GITHUB_REPO_ROLES` de lá, mas nenhum app declarava o pacote. Acrescentei
   `"@repo/kanban-contract": "workspace:*"` em `apps/api/package.json` e rodei `pnpm install`. O lockfile
   ganhou 3 linhas (link de workspace, nenhum pacote externo novo). Sem isso o `next build` não resolveria
   o import.
2. **`github-app-config.ts` não importa `@/env`.** As funções recebem as variáveis como argumento
   (`githubAppCredentials(env)`, `resolveGithubClientMode(env)`). O `instrumentation.ts` precisa do modo no
   boot e importar `@/env` ali valida todas as outras variáveis: nos testes (`NODE_ENV=test`) isso lança
   `Invalid environment variables` antes do `getFirestoreAdmin` e quebra `instrumentation.test.ts`. A rota
   e o `getGithubClient()` passam `env`; o boot passa `process.env`.
3. **Aviso de boot separado em dois.** O texto do plano para o modo `off` dizia que o webhook responde
   `GITHUB_APP_NOT_CONFIGURED`, o que é falso quando só o segredo está configurado (medido no smoke: a
   porta com segredo respondia 200 e o boot dizia o contrário). Agora há uma linha para o cliente
   (`fake`/`off`) e outra, independente, para `GITHUB_WEBHOOK_SECRET` ausente.
4. **403 sem cota esgotada vira `not_found`.** O plano não classificava esse caso. É o
   "Resource not accessible by integration" do GitHub, que para quem chama equivale a repositório sem
   acesso (`GITHUB_REPOSITORY_NOT_ACCESSIBLE`).
5. **Chave privada malformada vira `credentials_rejected`** (o plano dizia `unavailable` no R5 e
   `credentials_rejected` na tabela). Mesmo código para o cliente (`GITHUB_UNAVAILABLE`, 502) e o mesmo log
   `app-credentials-rejected`, então a diferença é só interna.
6. **`GithubClient` é `type`, não `interface`**: o Biome do repo exige (`useConsistentTypeDefinitions`).
7. **Paginação também em `GET /app/installations`**, não só em `/installation/repositories`. Com
   instalação repositório a repositório (D1), o App passa de 100 instalações com 100 repositórios.
   O `Link: rel="next"` só é seguido se apontar para `https://api.github.com`, para o token nunca sair do
   host do GitHub.
8. **Teste a mais: `corsOriginBoot.test.ts` alterado e `githubBootNotice.test.ts` criado.** O caso "stays
   quiet once a key is configured" afirmava que o boot não imprime nenhum `console.warn`; com o aviso do
   GitHub ele imprimiria. O teste continua exigindo boot silencioso, agora com as três variáveis do App
   preenchidas no ambiente do caso. Não afrouxei a asserção.

## Blueprint → arquivos

| Item | Arquivos |
|------|----------|
| 10.12 escopo de log + `BAD_GATEWAY` | `packages/shared/utils/helpers/log.ts`, `packages/shared/utils/helpers/httpStatus.ts` |
| 10.2 env | `apps/api/env.ts`, `apps/api/.env.example`, `apps/api/package.json`, `pnpm-lock.yaml` |
| 10.3 config e modo | `apps/api/(shared)/lib/github/github-app-config.ts` |
| 10.4 JWT | `apps/api/(shared)/lib/github/github-app-jwt.ts` |
| 10.5 assinatura | `apps/api/(shared)/lib/github/github-webhook-signature.ts` |
| 10.6 fronteira | `apps/api/(shared)/lib/github/github-client.ts` (`getGithubClient`, tipos) |
| 10.7 cliente real e erros | `github-rest-client.ts`, `github-installation-tokens.ts`, `github-errors.ts` (inclui `githubAppNotConfiguredResponse()`) |
| 10.8 cache de permissão | `github-permission-cache.ts` |
| 10.9 cliente falso | `github-fake-client.ts`, `github-sample-repositories.ts` |
| 10.10 webhook | `apps/api/app/(routes)/github/webhook/route.ts`, `apps/api/(shared)/lib/github/github-webhook-events.ts`, `apps/api/(shared)/validation/github-webhook.schema.ts` |
| 10.11 aviso de boot | `apps/api/instrumentation.ts` |
| 10.13 i18n | `packages/internationalization/translations/packages/shared/utils.ts` |
| docs | `docs/SETUP.md` (seção "GitHub App do board"), `docs/PRE-PRODUCTION.md` (item 5, bloqueador; itens seguintes renumerados de 6 a 13) |
| 7 testes | `apps/api/__tests__/github{AppJwt,WebhookSignature,WebhookRoute,RestClient,PermissionCache,ClientMode,ErrorResponse,FakeClient,BootNotice}.test.ts`, `corsOriginBoot.test.ts` |

## Contrato

Sem SDK e sem `apps/app`. A fronteira para a `board-import` é interna da API:

- `getGithubClient(): GithubClient | null`. `null` → responder `githubAppNotConfiguredResponse()`.
- `GithubClient`: `listInstallationRepositories()`, `readFile(repo, path, ref) → { content, sha } | null`,
  `getCollaboratorRole(repo, username) → GithubRepoRole`.
- Erros lançados são `GithubApiError`; `githubErrorResponse(error)` devolve o `Response` ou `null` (aí relance).
- `readFile` devolve `null` para 404, e o GitHub também responde 404 quando a instalação não alcança o
  repositório. Quem chama com um repositório tirado de `listInstallationRepositories()` não cai nesse caso.

### Repositórios de exemplo para a `board-import` (decisão desta etapa)

O YAML de cada `.kanban/board.yml` fica como texto em `github-sample-repositories.ts`, que é o que
`readFile` devolve, como no GitHub. Ao lado, `SAMPLE_BOARD_CONFIGS.valid` e `.invalid` guardam o objeto que
cada YAML representa. Como a API ainda não tem parser de YAML, é esse objeto que o teste passa por
`parseBoardConfig` hoje: o válido passa, o inválido falha só em `["stages", 2, "onRework"]`
(`githubFakeClient.test.ts`). Quando a `board-import` trouxer o parser, ela acrescenta o teste
`parse(yml)` deep-equal ao objeto. Já conferi essa equivalência uma vez com o pacote `yaml@2.9.1`, que
existe só como dependência transitiva no `node_modules` (teste descartável, apagado em seguida:
`1 passed`). O `sha` do falso é o blob sha do git (`sha1("blob <n>\0" + conteúdo)`).

## Códigos de erro novos

`GITHUB_APP_NOT_CONFIGURED` (503), `GITHUB_WEBHOOK_SIGNATURE_INVALID` (401),
`GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` (413), `GITHUB_WEBHOOK_PAYLOAD_INVALID` (400),
`GITHUB_REPOSITORY_NOT_ACCESSIBLE` (404), `GITHUB_RATE_LIMITED` (503), `GITHUB_UNAVAILABLE` (502). Os sete
têm copy em `apiErrors`, com o texto do plano (10.13). `pnpm --filter api test apiErrorCodes` → 2/2.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | `Checked 673 files … No fixes applied.`, 0 erros |
| Typecheck API | `pnpm --filter api typecheck` | sem erros |
| Typecheck i18n | `pnpm --filter @repo/internationalization typecheck` | sem erros |
| Testes API | `pnpm --filter api test` | 79 arquivos, 887 testes, todos passando (9 arquivos novos, 76 testes do GitHub) |
| Testes shared | `pnpm --filter @repo/shared test` | 4 arquivos, 51 testes |
| `apiErrors` | `pnpm --filter api test apiErrorCodes` | 2/2 |
| Build sem as variáveis do App | `env -u GITHUB_APP_ID -u GITHUB_APP_PRIVATE_KEY -u GITHUB_WEBHOOK_SECRET … npx next build` (service account com chave RSA gerada em runtime, nunca gravada) | `✓ Compiled successfully`, rota `ƒ /github/webhook` listada |

Smoke contra o build de produção (`next start` em 3092 sem segredo e 3093 com segredo aleatório de
`openssl rand -hex 16`, só no shell; os dois processos foram derrubados e as portas conferidas livres):

| Requisição | Resposta |
|------------|----------|
| sem segredo, `ping` | `503 {"error":{"code":"GITHUB_APP_NOT_CONFIGURED"}}` |
| `member` assinado com `openssl dgst -sha256 -hmac` | `200 {"data":{"handled":true}}` |
| assinatura de 64 zeros | `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` |
| sem cabeçalho de assinatura | `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` |
| corpo de 2 MB | `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` |

Log do boot (sem segredo): `[github] GitHub App is NOT configured: repository reads answer
GITHUB_APP_NOT_CONFIGURED.` e `[github] GITHUB_WEBHOOK_SECRET is not set: …`, uma vez cada. Log da entrega:
`[github] webhook-received event=member delivery=smoke-1 action=added handled=true`. `grep -c` do segredo
e do login `octocat` (que estava no corpo) nos dois logs: 0 e 0.

## A verificar no `/test`

- **API subindo com `pnpm --filter api dev` contra o emulador**: a linha `[github] … sample repositories
  of the emulator` aparece. Medi o modo `fake` só em teste (`githubClientMode.test.ts`,
  `githubBootNotice.test.ts`), não com o processo de pé.
- **Rate limit padrão no webhook** (60/min por endereço, risco R4 do plano): não medido.
- **Sinais de pronto contra um repositório real** (listar, ler `.kanban/board.yml`, permissão de
  colaborador, entrega real do GitHub): 🔒 não verificáveis sem o App criado (item 5 do
  `docs/PRE-PRODUCTION.md`). Todo o cliente real foi provado só com `fetch` mockado.

## Lacunas de teste conhecidas

- Nenhum teste lê o YAML de exemplo com um parser (só o objeto equivalente): fica para a `board-import`.
- O teto de 10 páginas da paginação (`pagination-truncated`) não tem teste.
- O formato real das respostas do GitHub (por exemplo `role_name` de colaborador externo) só se confirma
  com o App criado (R1).

## Pendências e decisões em aberto

- A spec segue `in-progress`, sem aprovação formal; mover para `approved` é decisão do usuário.
- Os sinais de pronto com repositório real dependem do App criado (bloqueador 5 do `PRE-PRODUCTION.md`).
- Ao revalidar a permissão antes de disparar uma etapa, a `board-members`/`orchestrator` precisa ignorar o
  cache de 5 minutos. Hoje o cliente não tem um parâmetro para isso; quem precisar acrescenta um
  `getCollaboratorRole(..., { fresh: true })` ou chama `githubPermissionCache.invalidateRepository` antes.
