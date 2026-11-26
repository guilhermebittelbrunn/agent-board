# Relatório de QA: integração com o GitHub App do board

Etapa `/test`, rodada dentro de um `/cycle` autônomo em 2026-11-25. Branch
`guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). Nada foi commitado.

Resultado: nenhum defeito de produção. Treze critérios verificados, dois ficam 🔒 por dependerem de infra
que não existe nesta máquina (GitHub App criado, `ARCJET_KEY`). Um teste novo fechou a lacuna do teto de
paginação.

## Por que não houve browser

O diff toca só `apps/api`, `packages/shared` (um escopo de log e um status HTTP),
`packages/internationalization` (sete chaves de `apiErrors`) e documentação. Não existe tela nova nem
alterada, então a passada com `agent-browser` não teria o que olhar. A validação executável foi feita por
HTTP (`curl` + `openssl dgst -hmac`) contra a API rodando com `next dev`.

## Cobertura

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter api test` (antes do teste novo) | 79 arquivos, 887 testes, todos passando |
| `pnpm --filter api test` (depois do teste novo) | 79 arquivos, 888 testes, todos passando |
| `pnpm --filter api exec vitest run __tests__/githubRestClient.test.ts` | 25/25 |
| `pnpm --filter api exec vitest run __tests__/apiErrorCodes` | 2/2 (os sete códigos novos têm texto) |
| `pnpm --filter api typecheck` | sem erros |
| `pnpm exec biome check apps/api/__tests__/githubRestClient.test.ts` | sem achados |
| `pnpm turbo run test --continue` (cache ligado, sem `--force`) | 11 de 12 tarefas passando; `@repo/design-system` falhou em 1 de 140 testes por tempo (ver abaixo) |
| `pnpm --filter @repo/design-system test` (isolado, logo depois) | 14 arquivos, 140/140 |

Números da rodada completa do turbo: `api` 888, `app` 662, `@repo/auth` 192, `@repo/security` 65,
`@repo/shared` 51, `@repo/analytics` 41, `@repo/internationalization` 35, `@repo/next-config` 34,
`@repo/kanban-contract` 21, `e2e` 16, `@repo/sdk` 9, `@repo/design-system` 139/140.

### Falhas que não vêm deste diff

- **`@repo/design-system`**: em três rodadas do turbo, testes diferentes de `actionMenu`, `antdTheme` e
  `dateInputNavigation` estouraram o tempo (20 a 80 s cada), com a máquina em load average entre 120 e
  280 por outras sessões. O diff não altera nenhum arquivo do pacote (`git status --short
  packages/design-system` vazio) e a suíte isolada passou 140/140. É instabilidade de ambiente, não
  regressão.
- **Uma rodada do turbo travou**: os workers do Vitest da `apps/api` ficaram 30 minutos parados com 0% de
  CPU, no pico de carga. Matei os processos pelo PID. As duas rodadas seguintes da mesma suíte passaram
  (55 s isolada, e de novo dentro do turbo). Não reproduziu.
- **`test:emulator` não rodou.** As portas 8080, 9099 e 9199 estão com o emulador de outro checkout
  (`next-boilerplate/quahog`) que o usuário deixou de pé. O script `scripts/emulator-tests.mjs` reutiliza
  emulador já ligado e grava dados nele, o que mexeria no ambiente de outro projeto. Além disso o `java`
  do `PATH` é o 17 (o `openjdk@21` está instalado, mas fora do `PATH`). O diff não muda
  `firestore.rules`, `storage.rules` nem o upload, que é o que essa suíte cobre, então a lacuna não afeta
  esta feature.

### Teste criado

- `apps/api/__tests__/githubRestClient.test.ts`, caso `stops after ten pages and logs the truncation`:
  `GET /app/installations` responde sempre com `Link: rel="next"`; o cliente faz exatamente 10
  requisições, devolve lista vazia e registra `[github] pagination-truncated maxItems=1000`. Faixa
  barata, `fetch` mockado.

## Decisões de custo de teste

Nenhum teste da faixa cara foi criado. O objeto de infra desta feature é o GitHub, que não tem emulador;
todo o cliente real se prova com `fetch` mockado, e o Firestore não é tocado.

| Módulo | O que já cobria |
|--------|-----------------|
| `app/(routes)/github/webhook/route.ts` | `githubWebhookRoute.test.ts` (503, 413, 401, 400, invalidação por evento). A travessia do `proxy.ts`, que o teste unitário pula, foi medida por HTTP. |
| `github-webhook-signature.ts` | `githubWebhookSignature.test.ts` |
| `github-rest-client.ts`, `github-installation-tokens.ts` | `githubRestClient.test.ts`; acrescentei só o teto de páginas |
| `github-permission-cache.ts` | `githubPermissionCache.test.ts` |
| `github-app-config.ts` | `githubClientMode.test.ts` |
| `github-errors.ts` | `githubErrorResponse.test.ts` |
| `github-fake-client.ts`, `github-sample-repositories.ts` | `githubFakeClient.test.ts` |
| `instrumentation.ts` | `githubBootNotice.test.ts`, `corsOriginBoot.test.ts`; a linha de boot foi medida com o processo de pé |
| `packages/shared` (`LogScope`, `BAD_GATEWAY`) | só acrescentam valores; typecheck da `api` e suíte do `@repo/shared` (51) |

## Verificar no `/test` (lista do `review.md`)

| # | Item | Veredito |
|---|------|----------|
| 1 | Webhook atravessa o `proxy.ts` sem `Origin` | **Confirmado.** `ping` assinado, sem `Origin` e sem cookie: `200 {"data":{"handled":false}}`. Com `Origin: https://evil.example`: `403 AUTH_FORBIDDEN_ORIGIN`. Com cookie `access-token` e sem `Origin`: `403 AUTH_FORBIDDEN_ORIGIN` e log `[security] blocked reason=missing-origin path=/github/webhook`; o GitHub não manda cookie, então não afeta entrega real. |
| 2 | Linha de boot no modo `fake` contra o emulador | **Confirmado.** Sem as três variáveis e com `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`, o boot imprimiu uma vez cada: `[github] GitHub App is NOT configured: using the sample repositories of the emulator.` e `[github] GITHUB_WEBHOOK_SECRET is not set: POST /github/webhook answers GITHUB_APP_NOT_CONFIGURED.`. Com o segredo definido, só a primeira aparece. |
| 3 | 2 MB com `Transfer-Encoding: chunked` → 413 | **Confirmado.** `413 {"error":{"code":"GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE"}}`, igual ao envio com `Content-Length`. Limite exato: 1.048.576 bytes de JSON válido responderam 200; 1.048.577 bytes responderam 413. Nenhum erro não tratado no log. |
| 4 | Log limpo com o servidor de pé | **Confirmado.** `grep -c` do segredo nos dois logs: 0. Do login `qa-octo-login` e dos repositórios `qa-owner/qa-repo`, `added-repo` e `removed-repo`, que estavam nos corpos: 0. De `Error`, `Unhandled` e linha de stack: 0. As linhas do webhook trazem só `event`, `delivery`, `action` e `handled`. |
| 5 | Rate limit R4 (61ª entrega → 429) | **🔒 não verificável.** Sem `ARCJET_KEY` nesta máquina. Medi o caso sem chave: 61 `ping` assinados no mesmo minuto, 61 respostas 200, e o boot avisa `[security] rate limiting is DISABLED (no ARCJET_KEY)`. Pela leitura do `proxy.ts`, `POST /github/webhook` cai no orçamento `standard` (não está em `STRICT_RATE_LIMITED_PATHS`). |
| 6 | Sinais de pronto contra repositório real | **🔒 não verificável.** Depende do App criado (item 5 do `docs/PRE-PRODUCTION.md`). |

## Critérios de aceite

Texto completo em [`criterios-aceite.md`](criterios-aceite.md).

| Critério | Status | Meio |
|----------|--------|------|
| Webhook sem segredo responde 503 | ✅ PASS | HTTP: `503 GITHUB_APP_NOT_CONFIGURED`; rota (unit) |
| Entrega do GitHub atravessa o `proxy.ts` | ✅ PASS | HTTP (item 1) |
| Assinatura ausente, malformada ou errada → 401 | ✅ PASS | HTTP: sem cabeçalho, 64 zeros e prefixo `sha1=` deram `401 GITHUB_WEBHOOK_SIGNATURE_INVALID`; unit cobre hex de outro tamanho, corpo alterado e outro segredo |
| Corpo acima de 1 MiB → 413, com ou sem `Content-Length` | ✅ PASS | HTTP (item 3) |
| Corpo assinado mas inválido → 400 | ✅ PASS | HTTP: JSON quebrado e `member` sem `repository` deram `400 GITHUB_WEBHOOK_PAYLOAD_INVALID` |
| `member` e `installation_repositories` invalidam o cache | ✅ PASS | HTTP: os dois responderam `handled: true`, `star` e `ping` responderam `handled: false`; a invalidação em si é conferida pelo espião no cache em `githubWebhookRoute.test.ts` |
| Nada de segredo, corpo ou login no log | ✅ PASS | grep no log do servidor (item 4) + unit |
| Escolha do cliente: App, falso ou nenhum | ✅ PASS | boot com o processo de pé (item 2) + `githubClientMode.test.ts` |
| Build de produção sem as variáveis do App | ✅ PASS | `next build` com as três `GITHUB_*` removidas: `✓ Compiled successfully`, `ƒ /github/webhook` listada |
| Token de instalação reaproveitado e renovado | ✅ PASS | unit (`githubRestClient.test.ts`) |
| Paginação com teto de 10 páginas | ✅ PASS | unit, teste criado nesta etapa |
| `getCollaboratorRole` sempre devolve papel válido | ✅ PASS | unit (`githubRestClient.test.ts`, `githubPermissionCache.test.ts`) |
| Falha do GitHub vira `error.code`, nunca 500 | ✅ PASS | unit (`githubErrorResponse.test.ts`, `githubRestClient.test.ts`) + `apiErrorCodes` 2/2 |
| Rate limit no webhook (R4) | 🔒 não verificado | falta `ARCJET_KEY`; sem chave, 61/61 passaram |
| Sinais de pronto contra repositório real | 🔒 não verificado | falta o GitHub App (item 5 do `PRE-PRODUCTION.md`) |

Sobre o build: a primeira tentativa, só com as variáveis do emulador, falhou em `Failed to collect page
data for /github/webhook` com `Invalid environment variables` para os três `FIREBASE_ADMIN_*`. Isso não é
regressão: o `docs/SETUP.md` já documentava que `pnpm --filter api build` exige a service account e não
funciona só com o emulador, porque `apps/api/env.ts` é importado por rota (`storage.ts`, via `/files`).
A rota nova é só a primeira a aparecer na mensagem. Com uma service account descartável (chave RSA gerada
no shell, nunca gravada) o build passou.

## Evidências da passada HTTP

Dois processos `next dev` da `apps/api` deste checkout, ambos com `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
e `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` e sem as variáveis do App:

- porta 3092, sem `GITHUB_WEBHOOK_SECRET`;
- porta 3093, com um segredo aleatório de `openssl rand -hex 16`, que existiu só no shell e num arquivo
  temporário fora do repositório, apagado no fim.

| Requisição (3093, salvo indicação) | Resposta |
|------------------------------------|----------|
| 3092, `ping` sem segredo configurado | `503 {"error":{"code":"GITHUB_APP_NOT_CONFIGURED"}}` |
| 3092, `ping` com `Origin: https://evil.example` | `403 {"error":{"code":"AUTH_FORBIDDEN_ORIGIN"}}` |
| `ping` assinado, sem `Origin` | `200 {"data":{"handled":false}}` |
| `member` assinado | `200 {"data":{"handled":true}}` |
| `installation_repositories` assinado (um adicionado, um removido) | `200 {"data":{"handled":true}}` |
| `star` assinado | `200 {"data":{"handled":false}}` |
| assinatura de 64 zeros | `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` |
| sem `X-Hub-Signature-256` | `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` |
| HMAC correto com prefixo `sha1=` | `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` |
| `{not json` assinado | `400 GITHUB_WEBHOOK_PAYLOAD_INVALID` |
| `member` sem `repository`, assinado | `400 GITHUB_WEBHOOK_PAYLOAD_INVALID` |
| 2 MB chunked | `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` |
| 2 MB com `Content-Length` | `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` |
| 1.048.576 bytes, JSON válido | `200 {"data":{"handled":false}}` |
| 1.048.577 bytes | `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` |
| cookie `access-token`, sem `Origin` | `403 AUTH_FORBIDDEN_ORIGIN` |
| `GET /github/webhook` | `405` |
| 61 `ping` assinados no mesmo minuto | 61 × `200` |

As linhas `[github]` do log da 3093 batem com as requisições: 3 `webhook-signature-invalid`, 3
`webhook-payload-invalid` e um `webhook-received` por resposta 200. As respostas 413 não geram linha.

Não houve screenshot: não há tela.

## Ambiente

- **Encontrado de pé, de outro checkout** (`~/orca/workspaces/next-boilerplate/quahog`): `next-server`
  em 3000 e 3002 e o emulador em 8080, 9099, 4001 e 9199. Não usei os servidores 3000/3002 (rodam outro
  código) e não derrubei nada. O emulador só serviu de alvo das variáveis `*_EMULATOR_HOST`; o webhook não
  lê nem grava no Firestore, então nada foi escrito nele.
- **Subido por mim**: `next dev -p 3092` (PID 59362) e `next dev -p 3093` (PID 61900), cada um derrubado
  por PID ao fim do seu cenário. `lsof -ti tcp:3092` e `tcp:3093` saíram vazios no fim. Também matei por
  PID a rodada travada do turbo e os workers do Vitest dela.
- **Arquivo gerado pelo `next dev`**: o Next 16 criou `apps/api/AGENTS.md` (regras para agentes) na
  primeira subida. Apaguei, porque não faz parte da feature. Quem rodar `pnpm --filter api dev` neste
  checkout vai ver o arquivo reaparecer; vale decidir se ele entra no `.gitignore` ou se o
  `next.config` liga `agentRules: false`.
- **Builds**: `next build` deixou `apps/api/.next` (ignorado pelo git).

## Lacunas herdadas

| Lacuna (handoff / review) | Veredito |
|---------------------------|----------|
| YAML de exemplo lido por um parser | Fora de escopo: entra com a `board-import`, que traz o parser. |
| Teto de 10 páginas (`pagination-truncated`) sem teste | **Fechada aqui** com o teste novo. |
| Formato real de `role_name` de colaborador externo | Continua aberta, bloqueada pelo App real (R1). |
| 401 com token de instalação no cache (achado 🟢 do review) | Continua aberta, baixa prioridade; vale para quando a `board-import` consumir o cliente. |
| Arquivo acima de 1 MB lido como ausente (achado 🟢 do review) | Continua aberta, fora do caminho de um `.kanban/board.yml`. |
| Webhook atravessando o `proxy.ts` | **Fechada aqui** por HTTP (item 1). |
| Linha de boot do modo `fake` com o processo de pé | **Fechada aqui** (item 2). |
| Rate limit R4 | Continua aberta: precisa de `ARCJET_KEY`. A decisão de isentar a rota fica para a `pr-flow`. |
| Sinais de pronto com repositório real | Continua aberta: precisa do App (item 5 do `PRE-PRODUCTION.md`). |

## Estado do gate

O `STATE.md` mostra `review` como `in-progress`. Não há commit da feature (`git log main..HEAD` vazio),
porque o `/cycle` não commita; o plano de commits do `review.md` ainda espera aprovação do usuário. O gate
fica aberto por esse motivo, não por revisão inacabada.

## Estado de dev alterado

Nenhum. Nenhuma conta criada, nenhum dado gravado no emulador ou em projeto real, nenhuma credencial em
arquivo.
