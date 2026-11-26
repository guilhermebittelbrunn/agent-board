# Plano: integração com o GitHub App do board

- **Spec:** [`specs/features/github-app-integration.md`](../../../../specs/features/github-app-integration.md) (`proposed`; executada a pedido explícito do usuário, sem aprovação formal)
- **Fase do roadmap:** 1, item 2 ([`docs/board/ROADMAP.md`](../../../board/ROADMAP.md))
- **Apps:** só `apps/api`, mais uma linha em `packages/shared` (escopo de log) e as traduções de `apiErrors` em `packages/internationalization`
- **Rodada:** `/cycle` autônomo, tarefa 1 de 3. A tarefa 3 (`board-import`) consome o cliente definido aqui.

---

## Etapa 1: análise

### 1. Contexto

**Resumo.** A API ganha um cliente do GitHub que fala em nome de um GitHub App próprio (JWT RS256 do App, token de instalação em cache), sabe listar os repositórios da instalação, ler um arquivo numa branch e devolver a permissão de um usuário como `GithubRepoRole`. Ganha também o primeiro endpoint de webhook do repositório, que valida a assinatura HMAC e invalida o cache de permissão nos eventos `member` e `installation_repositories`.

**Objetivos (corte da spec, adotado sem mudança):**

1. Credenciais do App no env da API, nunca no app.
2. Token de instalação gerado sob demanda e guardado em cache até expirar.
3. Listar os repositórios da instalação.
4. Ler um arquivo de um repositório numa branch.
5. Consultar a permissão de um usuário no repositório, devolvendo `GithubRepoRole`.
6. Webhook que valida a assinatura e registra o evento; só `installation_repositories` e `member` têm efeito (invalidar o cache de permissão).

**Acrescentado pelo orquestrador desta rodada (decisão já tomada):**

- Modo degradado: sem `GITHUB_APP_ID`, chave ou segredo (string vazia conta como ausência), a API sobe, o build passa e as rotas respondem `error.code`, nunca 500.
- Cliente GitHub falso, com repositórios de exemplo, ativo só quando a API roda contra o emulador e o App não está configurado. Nunca em produção.
- Zero dependência nova: `fetch` + `node:crypto`, sem octokit.

**Fora de escopo:**

- Abrir PR e reagir a eventos de PR (spec `pr-flow`).
- Qualquer rota HTTP que exponha repositórios, arquivos ou permissões ao painel. Quem expõe é a `board-import` (lista de repositórios, leitura do `board.yml`) e a `board-members` (papel efetivo). Este slice entrega a fronteira (`GithubClient`) e o mapeamento de erro que essas rotas vão usar.
- Persistir os eventos do webhook no Firestore. "Registrar o evento" vira uma linha de log estruturada (ver Decisão D3).
- Login com GitHub (spec `github-sign-in`, outra tarefa desta rodada).
- Tela, SDK e i18n de UI: não há superfície no `apps/app`.

**Corte de MVP.** A menor fatia observável é: com credenciais de teste, a suíte Vitest prova o JWT, a assinatura, o cache do token, o mapeamento de permissão e o webhook; sem credencial, a API sobe e o webhook responde `GITHUB_APP_NOT_CONFIGURED`; contra o emulador, `getGithubClient()` devolve o cliente falso que a `board-import` vai usar. Os "Sinais de pronto" da spec contra um repositório real ficam **não verificados** até o App existir (pré-requisito manual, seção 11).

**Área do painel / papel no board:** N/A. Nenhuma tela. O webhook é público e se autentica pela assinatura; o cliente é interno da API.

**Dependências externas e env nova:** GitHub REST API (`https://api.github.com`, versão `2022-11-28`). Variáveis `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`.

**Genérico × específico:** específico do produto, fica em `apps/api/(shared)/lib/github/`. Nada vai para `packages/kanban-contract`: o tipo de domínio que importa (`GithubRepoRole`) já está lá (`packages/kanban-contract/src/roles.ts:9-17`) e é reutilizado, nunca redefinido.

### 1.1 Fontes lidas

| Fonte | O que define |
|-------|--------------|
| `specs/features/github-app-integration.md` | Corte, riscos, perguntas com recomendação |
| `docs/board/ACCESS.md:10-40` | Permissões e eventos do App; `role_name` → `GithubRepoRole`; quando checar e quando invalidar o cache |
| `docs/board/ARCHITECTURE.md:32,70` | Webhooks na `apps/api`; o board guarda a instalação do App (por isso os métodos recebem `installationId`) |
| `docs/board/ROADMAP.md:52-62` | Posição na fase 1 |
| `specs/reference/AUDIT.md` (A4) | Sem App criado, assinatura e JWT se provam com segredo de teste; `board-import` precisa de cliente falso em dev |
| `.claude/cycle-policy.md` §2, §3 | Sem dependência nova; `||` para env vazia; modo degradado testado |
| `specs/features/board-import.md` (corte) | O que o consumidor vai pedir: lista de repositórios da instalação, leitura do `.kanban/board.yml` na branch base, com sha |

**Referências não lidas:** os artboards "Novo board" e "Primeiro acesso" (`claude.ai/artifact/...`) são telas da `board-import`; não mudam este slice, que não tem UI.

### 2. Dados (Firestore)

N/A. Nenhuma coleção nova. Os dois caches (token de instalação e permissão) vivem em memória do processo, com TTL. Motivo: nenhum dos dois é estado de produto, o pior caso de perda é uma chamada a mais ao GitHub, e numa função serverless fria o cache simplesmente começa vazio. A `board-members` decide depois se o papel efetivo vai para o documento de `members` (`ARCHITECTURE.md:71` já prevê "papel efetivo e data da última checagem").

### 3. Contrato `@repo/sdk`

N/A. Nenhuma rota consumida pelo painel. Os tipos do cliente (`GithubRepository`, `GithubFile`) ficam internos à API; a `board-import` define o DTO público quando expuser a lista.

### 4. API

#### 4.1 Rota e guard

| Método | Path | Guard | Autenticação |
|--------|------|-------|--------------|
| `POST` | `/github/webhook` | nenhum | assinatura `X-Hub-Signature-256` (HMAC SHA-256 do corpo cru com `GITHUB_WEBHOOK_SECRET`) |

Arquivo: `apps/api/app/(routes)/github/webhook/route.ts`.

Como a rota passa pelo `proxy.ts` sem ajuste:

- CORS: requisição de servidor não manda `Origin`; `isOriginAllowed(null, …)` devolve `true` (`apps/api/(shared)/lib/cors.ts:53`).
- Escrita por cookie sem origem: o GitHub não manda o cookie `access-token`, então `isUnprovenCookieWrite` é `false` (`apps/api/(shared)/lib/cookie-write-origin.ts:12-19`).
- Rate limit: `POST` cai no orçamento `standard` (`apps/api/proxy.ts:62-67`), 60 por minuto por endereço com sujeito `anonymous`. Suficiente para um board pessoal com instalação por repositório. Registrado como risco R4.

#### 4.2 Validação na borda

- Corpo lido como bytes com `readCappedBody` (`apps/api/(shared)/lib/read-capped-body.ts:1`), teto de 1 MiB. Não dá para usar `parseRequestJson` (`apps/api/(shared)/lib/parse-request-json.ts:43`): ele já devolve o JSON parseado e a assinatura precisa dos bytes exatos.
- Assinatura verificada **antes** de qualquer parse.
- Depois da assinatura, `JSON.parse` e um schema Zod mínimo por evento tratado (`member`, `installation_repositories`). Os demais eventos só são registrados.

Schemas (em `apps/api/(shared)/validation/github-webhook.schema.ts`):

```ts
const repositoryRefSchema = z.object({ full_name: z.string().min(1) });

export const memberEventSchema = z.object({
    action: z.string(),
    repository: repositoryRefSchema,
});

export const installationRepositoriesEventSchema = z.object({
    action: z.string(),
    repositories_added: z.array(repositoryRefSchema).default([]),
    repositories_removed: z.array(repositoryRefSchema).default([]),
});
```

#### 4.3 Persistência

N/A (ver seção 2). O efeito do webhook é `githubPermissionCache.invalidateRepository(fullName)`.

#### 4.4 Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `GITHUB_APP_NOT_CONFIGURED` | 503 | Webhook sem `GITHUB_WEBHOOK_SECRET`; cliente pedido sem App e fora do emulador |
| `GITHUB_WEBHOOK_SIGNATURE_INVALID` | 401 | Cabeçalho ausente, sem prefixo `sha256=`, tamanho errado ou HMAC diferente |
| `GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE` | 413 | Corpo acima de 1 MiB |
| `GITHUB_WEBHOOK_PAYLOAD_INVALID` | 400 | Assinatura válida mas JSON quebrado, ou evento tratado com forma inesperada |
| `GITHUB_REPOSITORY_NOT_ACCESSIBLE` | 404 | (fronteira para a `board-import`) o App não está instalado no repositório ou o repositório não existe |
| `GITHUB_RATE_LIMITED` | 503 | (fronteira) o GitHub devolveu 403/429 com cota esgotada |
| `GITHUB_UNAVAILABLE` | 502 | (fronteira) 5xx, timeout, rede, ou credencial do App recusada (401) |

Os três últimos nascem em `githubErrorResponse(error)`, o helper que a `board-import` vai chamar no `catch`. O teste `apps/api/__tests__/apiErrorCodesTranslated.test.ts:14-40` varre os literais de `app/` e `(shared)/`, então todos os sete precisam de entrada em `apiErrors`.

`GITHUB_RATE_LIMITED` é 503 e não 429 de propósito: quem esgotou a cota foi o board, não quem chamou a API, e o app já trata 429 como "você está indo rápido demais" (`AUTH_RATE_LIMITED`, `apps/api/proxy.ts`).

Credencial recusada pelo GitHub (401 no JWT ou no token) vira `GITHUB_UNAVAILABLE` com log `github app-credentials-rejected`, sem expor ao cliente que a chave está errada.

### 5. Front-end

N/A. Sem rota, hook, formulário ou tabela.

### 5.4 i18n

Só `apiErrors` em `packages/internationalization/translations/packages/shared/utils.ts` (bloco que começa na linha 7, vizinho de `STORAGE_NOT_CONFIGURED` na linha 65). Textos na seção 10.

### 6. Autorização e segurança

- **Chave privada e segredo só na API.** Lidos de `env.ts` da `apps/api`; nenhuma variável `NEXT_PUBLIC_*`. Nunca entram em log: `logEvent` só aceita valores escalares (`packages/shared/utils/helpers/log.ts:18`) e nenhum call site passa chave, token, JWT ou corpo do webhook.
- **Comparação em tempo constante** com `timingSafeEqual`, depois de conferir o comprimento (que lança se for diferente).
- **Assinatura antes de parse:** corpo não autenticado nunca é interpretado.
- **Token de instalação** fica só na memória do processo, nunca em resposta HTTP, log ou Firestore.
- **Conteúdo do repositório é dado** (regra de ouro 16): `readFile` devolve texto; quem interpreta é a `board-import`, com `parseBoardConfig`.
- **Cliente falso nunca em produção:** só é escolhido quando `isEmulated()` (`packages/auth/emulator.ts:51`) é verdadeiro **e** o App não está configurado. Um processo emulado fala com o projeto `demo-*`, que não tem usuário real; o mesmo raciocínio que mantém o storage fora de bucket real (`apps/api/(shared)/lib/storage.ts:29-37`).
- **Impersonação:** N/A, nenhuma rota autenticada.
- **Papel efetivo (regra 13):** este slice só fornece `getCollaboratorRole`; quem compõe com `resolveEffectiveRole` é a `board-members`.

### 7. Testes (Vitest, todos unitários, `apps/api/__tests__/`)

Nenhum teste precisa de emulador nem de rede: a infra aqui é o GitHub, que não tem emulador, e todo o comportamento cabe em `fetch` mockado com `vi.stubGlobal` e chaves geradas com `generateKeyPairSync`.

| Arquivo | Nível | O que prova |
|---------|-------|-------------|
| `githubAppJwt.test.ts` | unit (lógica pura) | JWT tem 3 segmentos, `alg: RS256`, `iss` = App id, `iat` = agora − 60 s, `exp` = agora + 540 s; a assinatura verifica com a chave pública gerada no teste; chave com `\n` escapado funciona |
| `githubWebhookSignature.test.ts` | unit | assinatura válida passa; cabeçalho ausente, sem `sha256=`, hex de outro tamanho, corpo alterado em 1 byte e segredo diferente falham sem lançar |
| `githubWebhookRoute.test.ts` | rota com `vi.mock("@/env")` e espião no cache | 503 sem segredo; 413 acima do teto; 401 com assinatura errada; 400 com JSON quebrado assinado; `member` invalida `owner/repo`; `installation_repositories` invalida adicionados e removidos; `ping` e evento desconhecido respondem 200 com `handled: false` e não tocam no cache |
| `githubRestClient.test.ts` | unit com `fetch` mockado | token reaproveitado até 60 s antes de expirar e renovado depois; `listInstallationRepositories` percorre `GET /app/installations` e segue o `Link: rel="next"`; `readFile` decodifica base64 e devolve `sha`, 404 → `null`, diretório → `null`; `getCollaboratorRole` mapeia `role_name`, cai em `permission` quando o papel é customizado, 404 → `none`; 403 com `x-ratelimit-remaining: 0` → `rate_limited`; 401 → `credentials_rejected`; 5xx e rede → `unavailable` |
| `githubPermissionCache.test.ts` | unit com `vi.useFakeTimers` | entrada vale 5 min; `invalidateRepository` apaga só as entradas daquele repositório, sem diferenciar maiúsculas |
| `githubClientMode.test.ts` | unit | App completo → `app`; App ausente e emulado → `fake`; ausente e não emulado → `off`; `GITHUB_APP_ID=""` conta como ausente; App configurado vence o emulador |
| `githubErrorResponse.test.ts` | unit | cada `GithubApiError.kind` vira o par `error.code`/status da tabela 4.4 |
| `apiErrorCodesTranslated.test.ts` | já existe | falha se algum dos sete códigos ficar sem tradução |

Use a skill `/write-tests`. Comando: `pnpm --filter api test`.

### 8. O que o `/test` vai percorrer

Diff sem superfície de UI: **não sobe browser** (`.claude/cycle-policy.md` §3.1). O `analista-qa`:

1. Roda `pnpm --filter api test` e `pnpm --filter api typecheck`.
2. Faz uma passada HTTP contra a API local (`pnpm --filter api dev`, com emulador):
   - sem `GITHUB_WEBHOOK_SECRET`: `POST /github/webhook` → 503 `GITHUB_APP_NOT_CONFIGURED`;
   - com um segredo de teste exportado só no shell (nunca gravado em arquivo versionado): corpo assinado com `openssl dgst -sha256 -hmac` → 200; assinatura trocada → 401 `GITHUB_WEBHOOK_SIGNATURE_INVALID`.
3. Confirma que a API sobe com as três variáveis vazias (a linha de boot `[github] …` aparece uma vez) e que `pnpm --filter api build` passa sem elas.
4. Marca como **🔒 não verificado** os sinais de pronto contra repositório real (listar, ler `.kanban/board.yml`, permissão de colaborador): dependem do App criado (seção 11). Não é reprovação.

### 9. Critérios de aceite (rascunho para o `/test`)

O `analista-qa` gera a versão final no formato §9.1. Pontos que o plano exige:

- Webhook rejeita assinatura ausente, malformada ou errada com 401 e o código exato.
- Webhook sem segredo configurado responde 503 `GITHUB_APP_NOT_CONFIGURED`, e a API continua subindo e passando no build.
- Corpo acima de 1 MiB → 413, sem calcular HMAC.
- `member` e `installation_repositories` invalidam o cache do(s) repositório(s) citado(s); outros eventos não mexem em nada.
- Token de instalação reaproveitado dentro da validade e renovado perto dela.
- `getCollaboratorRole` devolve sempre um valor de `GITHUB_REPO_ROLES`, inclusive para papel customizado e para quem não é colaborador (`none`).
- Contra o emulador sem App, `getGithubClient()` devolve o cliente falso; fora do emulador sem App, nenhum cliente e `GITHUB_APP_NOT_CONFIGURED`.
- Nenhuma chave, token, JWT ou corpo de webhook aparece em log.

---

## Etapa 2: blueprint técnico

### 10.1 Árvore de arquivos

```
apps/api/
  env.ts                                         (editar: 3 variáveis opcionais)
  .env.example                                   (editar: bloco do GitHub App)
  instrumentation.ts                             (editar: aviso de boot)
  (shared)/lib/github/
    github-app-config.ts                         (novo: leitura do env + modo)
    github-app-jwt.ts                            (novo: JWT RS256 com node:crypto)
    github-webhook-signature.ts                  (novo: HMAC + timingSafeEqual)
    github-errors.ts                             (novo: GithubApiError + githubErrorResponse)
    github-client.ts                             (novo: interface + getGithubClient)
    github-rest-client.ts                        (novo: implementação com fetch)
    github-installation-tokens.ts                (novo: cache de token por instalação)
    github-permission-cache.ts                   (novo: cache TTL de permissão)
    github-fake-client.ts                        (novo: repositórios de exemplo)
  (shared)/validation/github-webhook.schema.ts   (novo)
  app/(routes)/github/webhook/route.ts           (novo)
  __tests__/github*.test.ts                      (novos, seção 7)
packages/shared/utils/helpers/log.ts             (editar: escopo "github")
packages/internationalization/translations/packages/shared/utils.ts  (editar: 7 apiErrors)
docs/SETUP.md, docs/PRE-PRODUCTION.md            (editar: variáveis e item novo do App)
```

### 10.2 Env (`apps/api/env.ts`)

```diff
     server: {
         ...
         FIREBASE_STORAGE_BUCKET: z.string().optional(),
+        GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
+        GITHUB_APP_PRIVATE_KEY: z.string().optional(),
+        GITHUB_WEBHOOK_SECRET: z.string().optional(),
     },
     runtimeEnv: {
         ...
+        GITHUB_APP_ID: process.env.GITHUB_APP_ID || undefined,
+        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY || undefined,
+        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || undefined,
     },
```

`|| undefined` segue o precedente de `FIREBASE_STORAGE_BUCKET` no mesmo arquivo: string vazia vira ausência, e `optional()` não derruba o processo nem o build.

### 10.3 Configuração e modo (`github-app-config.ts`)

```ts
export type GithubAppCredentials = { appId: string; privateKey: string };
export type GithubClientMode = "app" | "fake" | "off";

export function githubAppCredentials(): GithubAppCredentials | null {
    if (!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY)) return null;
    return {
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
}

export const githubWebhookSecret = (): string | null =>
    env.GITHUB_WEBHOOK_SECRET || null;

export function resolveGithubClientMode(): GithubClientMode {
    if (githubAppCredentials()) return "app";
    return isEmulated() ? "fake" : "off";
}
```

O `replace(/\\n/g, "\n")` repete o tratamento da chave do Firebase (`packages/auth/server.ts:76-77`).

### 10.4 JWT do App (`github-app-jwt.ts`)

```ts
const CLOCK_SKEW_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 540; // o GitHub recusa exp acima de 10 min

export function createAppJwt(
    { appId, privateKey }: GithubAppCredentials,
    nowSeconds = Math.floor(Date.now() / 1000)
): string {
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({
        iat: nowSeconds - CLOCK_SKEW_SECONDS,
        exp: nowSeconds + JWT_LIFETIME_SECONDS,
        iss: appId,
    }));
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey)
        .toString("base64url");
    return `${header}.${payload}.${signature}`;
}
```

`sign` de `node:crypto`; `Buffer#toString("base64url")` existe no Node 22 (`.nvmrc`).

### 10.5 Assinatura do webhook (`github-webhook-signature.ts`)

```ts
const PREFIX = "sha256=";

export function isValidWebhookSignature(body: Buffer, header: string | null, secret: string): boolean {
    if (!header?.startsWith(PREFIX)) return false;
    const received = Buffer.from(header.slice(PREFIX.length), "hex");
    const expected = createHmac("sha256", secret).update(body).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
}
```

### 10.6 Fronteira do cliente (`github-client.ts`)

```ts
import type { GithubRepoRole } from "@repo/kanban-contract";

export type GithubRepositoryRef = { installationId: number; owner: string; name: string };

export type GithubRepository = GithubRepositoryRef & {
    fullName: string;
    defaultBranch: string;
    private: boolean;
};

export type GithubFile = { content: string; sha: string };

export interface GithubClient {
    listInstallationRepositories(): Promise<GithubRepository[]>;
    readFile(repo: GithubRepositoryRef, path: string, ref: string): Promise<GithubFile | null>;
    getCollaboratorRole(repo: GithubRepositoryRef, username: string): Promise<GithubRepoRole>;
}

export function getGithubClient(): GithubClient | null {
    switch (resolveGithubClientMode()) {
        case "app": return githubRestClient;
        case "fake": return githubFakeClient;
        default: return null;
    }
}
```

Quem consome (a `board-import`) faz:

```ts
const client = getGithubClient();
if (!client) {
    return Response.json({ error: { code: "GITHUB_APP_NOT_CONFIGURED" } }, { status: HTTP_STATUS.SERVICE_UNAVAILABLE });
}
try { ... } catch (error) {
    const response = githubErrorResponse(error);
    if (response) return response;
    throw error;
}
```

`getCollaboratorRole` passa pelo `githubPermissionCache` nas duas implementações, então o webhook invalida o mesmo cache que o cliente lê.

### 10.7 Cliente real (`github-rest-client.ts`)

| Método | Chamadas | Autenticação |
|--------|----------|--------------|
| `listInstallationRepositories` | `GET /app/installations?per_page=100`, e para cada uma `GET /installation/repositories?per_page=100` seguindo `Link: rel="next"` | JWT do App; depois token de instalação |
| `readFile` | `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`; resposta `{ type: "file", content, encoding: "base64", sha }` | token de instalação |
| `getCollaboratorRole` | `GET /repos/{owner}/{repo}/collaborators/{username}/permission`; usa `role_name` quando está em `GITHUB_REPO_ROLES`, senão `permission` (`admin`/`write`/`read`/`none`); 404 → `none` | token de instalação |
| token | `POST /app/installations/{id}/access_tokens` → `{ token, expires_at }` | JWT do App |

Cabeçalhos fixos: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: agent-board`. Timeout de 10 s com `AbortSignal.timeout`. Respostas validadas com Zod antes de usar (`role_name: z.string()`, `permission: z.enum([...])`, etc.).

Segmentos do path (`owner`, `repo`, `username`) passam por `encodeURIComponent`; `path` do arquivo é codificado segmento a segmento para manter as barras.

Cache de token (`github-installation-tokens.ts`): `Map<installationId, { token, expiresAt }>`; reusa enquanto faltar mais de 60 s para `expiresAt`; uma promessa em andamento por instalação, para duas chamadas simultâneas não pedirem dois tokens. Teto de 10 páginas na listagem (1.000 repositórios), com log se for atingido.

Erros (`github-errors.ts`):

```ts
export type GithubApiErrorKind =
    | "not_found" | "rate_limited" | "credentials_rejected" | "unavailable";

export class GithubApiError extends Error {
    constructor(readonly kind: GithubApiErrorKind, readonly status: number | null) {
        super(`GitHub API ${kind}`);
    }
}

const RESPONSES: Record<GithubApiErrorKind, { code: string; status: number }> = {
    not_found: { code: "GITHUB_REPOSITORY_NOT_ACCESSIBLE", status: HTTP_STATUS.NOT_FOUND },
    rate_limited: { code: "GITHUB_RATE_LIMITED", status: HTTP_STATUS.SERVICE_UNAVAILABLE },
    credentials_rejected: { code: "GITHUB_UNAVAILABLE", status: HTTP_STATUS.BAD_GATEWAY },
    unavailable: { code: "GITHUB_UNAVAILABLE", status: HTTP_STATUS.BAD_GATEWAY },
};

export function githubErrorResponse(error: unknown): Response | null { ... }
```

`HTTP_STATUS.BAD_GATEWAY` não existe hoje em `packages/shared/utils/helpers/httpStatus.ts` (tem `UNAUTHORIZED` na linha 5, `PAYLOAD_TOO_LARGE` na 12, `SERVICE_UNAVAILABLE` na 15): acrescentar `BAD_GATEWAY: 502` lá, no mesmo commit do escopo de log.

Classificação: 404 → `not_found` (exceto nos dois casos que o próprio método trata como resultado: arquivo ausente → `null`, não colaborador → `none`); 403 ou 429 com `x-ratelimit-remaining: 0` ou `retry-after` → `rate_limited`; 401 → `credentials_rejected` com `logEvent("github", "app-credentials-rejected")`; 5xx, timeout e erro de rede → `unavailable`.

### 10.8 Cache de permissão (`github-permission-cache.ts`)

```ts
const PERMISSION_TTL_MS = 5 * 60 * 1000;

export const githubPermissionCache = {
    get(fullName: string, username: string): GithubRepoRole | undefined,
    set(fullName: string, username: string, role: GithubRepoRole): void,
    invalidateRepository(fullName: string): void,
};
```

Chave `${fullName.toLowerCase()}#${username.toLowerCase()}`: nomes do GitHub não diferenciam maiúsculas. Cinco minutos é o "cache curto" de `docs/board/ACCESS.md:38`; antes de disparar uma etapa, a `board-members`/`orchestrator` deve ignorar o cache (`ACCESS.md:39`), o que fica registrado para eles.

### 10.9 Cliente falso (`github-fake-client.ts`)

Dados fixos, `installationId: 1`, dono `agent-board-demo`:

| Repositório | `.kanban/board.yml` | Para que serve na `board-import` |
|-------------|---------------------|-----------------------------------|
| `agent-board-demo/sample-app` | válido (cópia enxuta de `kit/.kanban/board.yml`, com `version: 1`, `baseBranch: main`, as etapas do pipeline) | caminho feliz |
| `agent-board-demo/invalid-config` | inválido de propósito (`stages[2].onRework` aponta para etapa inexistente) | erros por campo |
| `agent-board-demo/no-kanban` | ausente (`readFile` → `null`) | repositório sem kit |

`getCollaboratorRole` devolve `admin` para qualquer usuário nos três, para quem roda o seed conseguir importar como `owner`. `sha` é um hash fixo por arquivo (`createHash("sha1")` do conteúdo, igual ao blob sha em formato), para a "Recarregar configuração" ter o que comparar. O conteúdo exato do YAML válido é responsabilidade do `/develop`, que deve conferir contra `boardConfigSchema` (`packages/kanban-contract/src/boardConfig.ts:36`); como ainda não há parser de YAML na API (AUDIT A5), o teste do conteúdo fica para a `board-import`.

### 10.10 Webhook (`app/(routes)/github/webhook/route.ts`)

```ts
const WEBHOOK_MAX_BYTES = 1024 * 1024;

export async function POST(req: Request) {
    const secret = githubWebhookSecret();
    if (!secret) return errorResponse("GITHUB_APP_NOT_CONFIGURED", HTTP_STATUS.SERVICE_UNAVAILABLE);

    const body = req.body ? await readCappedBody(req.body, WEBHOOK_MAX_BYTES) : Buffer.alloc(0);
    if (body === null) return errorResponse("GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE", HTTP_STATUS.PAYLOAD_TOO_LARGE);

    if (!isValidWebhookSignature(body, req.headers.get("x-hub-signature-256"), secret)) {
        logEvent("github", "webhook-signature-invalid");
        return errorResponse("GITHUB_WEBHOOK_SIGNATURE_INVALID", HTTP_STATUS.UNAUTHORIZED);
    }

    const event = req.headers.get("x-github-event") ?? "unknown";
    const delivery = req.headers.get("x-github-delivery");
    const payload = safeJsonParse(body);
    if (payload === undefined) return errorResponse("GITHUB_WEBHOOK_PAYLOAD_INVALID", HTTP_STATUS.BAD_REQUEST);

    const outcome = applyWebhookEvent(event, payload);   // { handled, action, invalid }
    if (outcome.invalid) return errorResponse("GITHUB_WEBHOOK_PAYLOAD_INVALID", HTTP_STATUS.BAD_REQUEST);

    logEvent("github", "webhook-received", { event, delivery, action: outcome.action, handled: outcome.handled });
    return Response.json({ data: { handled: outcome.handled } });
}
```

`applyWebhookEvent` fica no mesmo arquivo ou num `github-webhook-events.ts` em `(shared)/lib/github/`, a critério do `/develop`; é um `switch` de dois casos.

Exemplo de entrega `member`:

```http
POST /github/webhook
X-GitHub-Event: member
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958
X-Hub-Signature-256: sha256=<hex>
Content-Type: application/json

{ "action": "added", "member": { "login": "octocat" }, "repository": { "full_name": "agent-board-demo/sample-app" } }
```

```json
{ "data": { "handled": true } }
```

Erro:

```json
{ "error": { "code": "GITHUB_WEBHOOK_SIGNATURE_INVALID" } }
```

### 10.11 Aviso de boot (`instrumentation.ts`)

Ao lado de `warnOnDisabledRateLimit()` (`apps/api/instrumentation.ts:11,49`):

```ts
function warnOnGithubAppMode(): void {
    const mode = resolveGithubClientMode();
    if (mode === "fake") console.warn("[github] GitHub App is NOT configured: using the sample repositories of the emulator.");
    if (mode === "off") console.warn("[github] GitHub App is NOT configured: repository import and the webhook answer GITHUB_APP_NOT_CONFIGURED.");
}
```

Sem lançar: o App é opt-in até a ida a produção. O `instrumentation.ts` não importa `@/env` hoje; o `/develop` decide entre ler `process.env` com `||` direto ou importar o módulo dinamicamente como já faz com `@repo/auth/server`.

### 10.12 Log (`packages/shared/utils/helpers/log.ts`)

```diff
 export type LogScope =
     | "account"
     | "auth"
+    | "github"
     | "notifications"
```

### 10.13 i18n (`apiErrors`)

```ts
GITHUB_APP_NOT_CONFIGURED: "A integração com o GitHub não está configurada. Fale com o suporte.",
GITHUB_WEBHOOK_SIGNATURE_INVALID: "Assinatura do webhook do GitHub inválida.",
GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE: "O evento do GitHub excede o tamanho máximo aceito.",
GITHUB_WEBHOOK_PAYLOAD_INVALID: "O evento do GitHub chegou num formato inesperado.",
GITHUB_REPOSITORY_NOT_ACCESSIBLE: "O GitHub App do board não tem acesso a este repositório.",
GITHUB_RATE_LIMITED: "O GitHub limitou as chamadas do board por alguns minutos. Tente de novo em instantes.",
GITHUB_UNAVAILABLE: "Não foi possível falar com o GitHub agora. Tente de novo em instantes.",
```

### 10.14 `.env.example` da API

```bash
# GitHub App do board. OPTIONAL until production: without these three the API still starts,
# POST /github/webhook answers GITHUB_APP_NOT_CONFIGURED and, while the emulator hosts above
# are filled in, the API uses sample repositories instead of GitHub. App id is numeric.
# Keep the newlines in the private key escaped as \n. See docs/PRE-PRODUCTION.md.
GITHUB_APP_ID=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_WEBHOOK_SECRET=""
```

(O `.env.example` existente é todo em inglês; o bloco segue o arquivo.)

### 10.15 Ordem de implementação e commits

Não há SDK nem app. Ordem por dependência:

1. `chore(shared): add github log scope and bad gateway status` (`packages/shared/utils/helpers/log.ts`, `packages/shared/utils/helpers/httpStatus.ts`).
2. `feat(api): read github app credentials from env` (`env.ts`, `.env.example`, `github-app-config.ts`, `githubClientMode.test.ts`).
3. `feat(api): sign github app jwt and verify webhook signatures` (`github-app-jwt.ts`, `github-webhook-signature.ts` + testes).
4. `feat(api): add github rest client with installation token cache` (`github-client.ts`, `github-rest-client.ts`, `github-installation-tokens.ts`, `github-permission-cache.ts`, `github-errors.ts` + testes).
5. `feat(api): add sample github client for the emulator` (`github-fake-client.ts`).
6. `feat(api): receive github webhooks` (schema, rota, `instrumentation.ts` + teste da rota).
7. `feat(internationalization): translate github api errors`.
8. `docs: document the github app variables` (`docs/SETUP.md`, `docs/PRE-PRODUCTION.md`).
9. `docs(features): github-app-integration` (último).

---

## 11. Pré-requisitos manuais de infra

O `/develop` não cumpre nenhum destes itens e o `/test` não reprova por falta deles: o que depende deles fica **🔒 não verificado**. O `/develop` registra este bloco como item novo em `docs/PRE-PRODUCTION.md` ("GitHub App do board"), na seção de bloqueadores, porque sem ele a `board-import` não funciona em produção.

1. **Criar o GitHub App** na conta ou organização dona dos repositórios (Settings → Developer settings → GitHub Apps → New). Separado do Claude GitHub App (`docs/board/ACCESS.md:12`).
2. **Permissões de repositório** (`ACCESS.md:14-20`): Metadata read, Contents read, Pull requests read & write, Issues read, Checks read. As de PR, Issues e Checks só são usadas pela `pr-flow`, mas pedir agora evita reaprovar a instalação depois.
3. **Eventos do webhook** (`ACCESS.md:21`): `member` e `installation_repositories` agora; `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment` e `check_suite` quando a `pr-flow` entrar.
4. **Webhook URL:** `https://<host-da-api>/github/webhook`, content type `application/json`, com um segredo gerado (`openssl rand -hex 32`).
5. **Chave privada:** gerar no App, baixar o `.pem` e guardar só no gerenciador de segredos.
6. **Variáveis no deploy da API (Vercel):** `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (com `\n` escapado), `GITHUB_WEBHOOK_SECRET`. Nunca no `apps/app`.
7. **Instalar o App** repositório a repositório (Decisão D1), começando por um repositório de teste com o kit aplicado.
8. **Conferir os sinais de pronto da spec** nesse repositório: a API lista o repositório, lê `.kanban/board.yml` e devolve a permissão de um colaborador; uma entrega reenviada pela aba "Recent Deliveries" do App com o segredo trocado é recusada com 401.

---

## 12. Decisões tomadas sem perguntar

| # | Decisão | Fonte | Alternativa descartada |
|---|---------|-------|------------------------|
| D1 | Instalação repositório a repositório; o cliente percorre todas as instalações do App ao listar | recomendação da spec | Instalação na organização inteira |
| D2 | Cliente falso com três repositórios de exemplo, escolhido quando `isEmulated()` e o App não está configurado | recomendação da spec + orquestrador | Ativar por `NODE_ENV !== "production"`: um `next build && start` local contra o emulador ficaria sem cliente, e o critério de "sem usuário real" é o emulador, não o `NODE_ENV` |
| D3 | "Registrar o evento" = uma linha `logEvent("github", "webhook-received", …)` com evento, delivery id, action e `handled` | menor raio de impacto | Coleção `githubEvents` no Firestore: sem leitor hoje, exige rules e índice; a `pr-flow`/`orchestrator` decide quando precisar |
| D4 | Caches de token e de permissão em memória do processo, TTL de 5 min na permissão | menor raio + `ACCESS.md:38` | Cache no Firestore ou em Redis: estado de produto que ninguém lê ainda |
| D5 | Nenhuma rota de leitura (repositórios, arquivo, permissão) neste slice; só o webhook | escopo da spec (impacto: "cliente, rota de webhook, cache") | `GET /github/repositories` agora: exporia a lista da instalação a qualquer usuário autenticado antes de existir board e papel; é da `board-import` |
| D6 | Erros de fronteira (`GITHUB_REPOSITORY_NOT_ACCESSIBLE`, `GITHUB_RATE_LIMITED`, `GITHUB_UNAVAILABLE`) e `githubErrorResponse` entram já | modo degradado exigido pelo orquestrador | Deixar para a `board-import`: cada rota consumidora reinventaria o mapeamento |
| D7 | `GITHUB_RATE_LIMITED` responde 503, não 429 | padrão do repo (429 = cota de quem chama, `AUTH_RATE_LIMITED`) | 429 |
| D8 | Papel customizado de organização cai no campo `permission` | `ACCESS.md:23` só lista os cinco papéis padrão; `role_name` pode trazer outro | Tratar papel desconhecido como `none` (bloquearia admin de org com papel customizado) |
| D9 | Webhook com teto de 1 MiB | menor raio; os dois eventos tratados são pequenos com instalação por repositório | 25 MB (teto do GitHub): abre a API para corpo grande não autenticado |
| D10 | Aviso de boot, sem falhar a subida, quando o App não está configurado | precedente do `ARCJET_KEY` (`instrumentation.ts:11-26`) | Exigir as variáveis em produção no boot, como `CORS_ORIGIN`: travaria o deploy antes de o App existir |

## 13. Perguntas em aberto

1. **Registrar o evento do webhook só em log ou também no Firestore?** Opções: (a) só log; (b) coleção `githubEvents` com TTL. **Adotada: (a)**, porque nada lê esses eventos antes da `pr-flow`. Reabrir quando a `pr-flow` precisar de idempotência por `X-GitHub-Delivery`.
2. **Nome e conteúdo dos repositórios de exemplo do cliente falso.** Opções: (a) `agent-board-demo/sample-app`, `invalid-config`, `no-kanban`; (b) espelhar o próprio `agent-board` lendo `.kanban/board.yml` do disco. **Adotada: (a)**, porque são dados fixos e não dependem do working tree de quem roda. Aparecem na tela da `board-import`, então o nome é visível ao usuário em dev.
3. **Pedir já as permissões de PR, Issues e Checks ao criar o App?** Opções: (a) já; (b) só Metadata e Contents agora. **Adotada no pré-requisito: (a)**, para não reaprovar a instalação quando a `pr-flow` entrar. É configuração manual sua, não código.
4. **Mover a spec para `approved`?** Não é decisão do ciclo (`.claude/cycle-policy.md` §1). A spec fica `in-progress` com `feature: github-app-integration`; a aprovação formal é sua.

## 14. Riscos

- **R1. Sinais de pronto sem verificação até o App existir.** Toda a prova desta rodada é com chave e segredo de teste e `fetch` mockado. Formato de resposta real do GitHub (por exemplo `role_name` de um colaborador externo) só se confirma com o App criado.
- **R2. Cache em memória numa função serverless.** Cada instância fria tem o próprio cache e o webhook invalida só a instância que o recebeu. Com TTL de 5 min, o atraso máximo para perder acesso é esse; a revalidação obrigatória antes de disparar etapa (`ACCESS.md:39`) cobre o caso que gasta dinheiro.
- **R3. Cliente falso dependente de `isEmulated()`.** Se alguém deixar `FIRESTORE_EMULATOR_HOST` preenchido num deploy, o cliente falso entraria; nesse cenário a API inteira já estaria apontando para um emulador inexistente e falhando no boot ao abrir o Firestore.
- **R4. Rate limit padrão no webhook.** 60 entregas por minuto por endereço. Com a `pr-flow` (reviews e checks em rajada) pode ser pouco; reavaliar lá, possivelmente isentando a rota assinada.
- **R5. Chave privada mal colada.** PEM com quebras reais ou escapadas duas vezes faz o `sign` lançar; o cliente converte em `unavailable` com log `app-credentials-rejected`, sem vazar a chave.
