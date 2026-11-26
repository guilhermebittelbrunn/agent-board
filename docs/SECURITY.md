# Segurança

Modelo de segurança do agent-board e como mantê-lo. Leia junto com [`docs/ARCHITECTURE.md`](ARCHITECTURE.md). Regra de ouro transversal: **autorização é sempre repetida no servidor** — UI oculta nunca é a única proteção.

## Autenticação

- **Provider**: Firebase. Em produção o usuário entra só pelo popup do GitHub (`GithubAuthProvider`) e obtém um **ID token**, sincronizado num cookie de sessão. A app manda à API apenas esse ID token (`POST /auth/sign-in/github`); o access token do GitHub fica no SDK do Firebase. A API confere que o método foi `github.com`, lê `rawId`, `screenName`, nome e foto com `accounts:lookup` usando o próprio ID token, confere o `rawId` com a claim `firebase.identities`, valida o formato com `githubIdentitySchema` (`@repo/kanban-contract`) e grava em `user.github` só quando algo mudou. O `login` nunca vem do corpo da requisição. O primeiro login cria o perfil como `common`.
- **Métodos aceitos** (`packages/auth/sign-in-method.ts`): `github.com` e `custom` (a adoção da sessão entre apps, que só nasce de um cookie válido) sempre; `password` só com emulador configurado. O filtro roda ao gravar o cookie (`/api/auth/session` → `403 AUTH_SIGN_IN_METHOD_DISABLED`) e ao resolver a credencial na API (método recusado vira anônimo → `401`). `POST /auth/sign-in` responde `403 AUTH_SIGN_IN_METHOD_DISABLED` fora do emulador antes de ler o corpo. O seed, o E2E e o QA local entram com senha no emulador.
- **Política de senha**: mínimo de 8 e máximo de 1024 caracteres para toda senha **definida** (troca na área de conta e criação pelo admin), sem regra de composição e sem aparar espaços. Quem confere uma senha que já existe (login e senha atual na troca) segue aceitando 6. As três constantes vivem em `packages/shared/utils/helpers/passwordPolicy.ts`; a API responde `400 AUTH_PASSWORD_TOO_SHORT` para senha nova curta.
- **No servidor** (`@repo/auth/server`), o Firebase **Admin SDK** verifica o token (`verifyIdToken`) a partir do cookie `access-token` ou do header `Authorization: Bearer`. Falhas benignas (token expirado/ inválido) viram "sem sessão", não erro 500.
- **Identity Toolkit REST** (`FIREBASE_WEB_API_KEY`) é usado no servidor para a leitura da conta no login com GitHub (`accounts:lookup`), o login por senha no emulador, a conferência da senha atual na troca de senha e a criação de usuário pelo admin (`POST /users`).
- **`POST /auth/sign-in`** valida o corpo com Zod e responde `400 VALIDATION_FAILED` para corpo ausente, JSON inválido, e-mail inválido ou senha com menos de 6 caracteres, sem chamar o Identity Toolkit. Toda recusa do provedor (senha errada, conta inexistente, conta desativada) vira o mesmo `400 AUTH_INVALID_CREDENTIALS`, que não diz se o e-mail existe nem ecoa a mensagem do provedor; o limite do provedor vira `429 USERS_AUTH_RATE_LIMITED`.
- **Troca de senha** (`POST /account/password`) confere a senha atual e encerra todas as sessões da conta; se o Firebase recusar a revogação, a senha fica gravada e a rota responde `500 AUTH_SESSIONS_NOT_REVOKED`. Conta que só entra pelo GitHub não tem senha para trocar (`400 ACCOUNT_PASSWORD_UNSUPPORTED`).

## Autorização (guards da API)

São **20** arquivos de rota em `apps/api/app/(routes)/`. **Catorze** exportam o handler embrulhado num
guard, que roda **antes** da lógica; **seis** exportam handler nu (medido com
`find "apps/api/app/(routes)" -name route.ts` e `grep -LE "require(CommonPanel|Admin)Api"`):

| grupo | quantas | por que não tem guard |
|-------|---------|------------------------|
| `/auth/*` — `me`, `session`, `sign-in`, `sign-in/github` | 4 | é a superfície **anterior à sessão**: um guard que exige sessão recusaria justamente quem vem criar uma. `/auth/me` e `/auth/session` resolvem a credencial por dentro (`resolveApiActor`, `resolveApiCredential`). Sem credencial ativa, ou com conta que não existe mais no Auth, `/auth/me` responde `401 AUTH_INVALID_TOKEN`, o mesmo código dos guards |
| `/health`, `/health/ready` | 2 | sondas de plataforma, precisam responder sem credencial |

As **catorze** rotas de negócio — `account` ×2, `entities` ×3, `files`, `notifications/*` ×4 e `users` ×4 —
passam por um dos dois guards:

- `requireCommonPanelApi` — exige um usuário comum válido; resolve `ctx.subjectProfile` (titular **ou** usuário personificado). Todo registro do painel comum é do perfil que o criou (`userId`), e o escopo é sempre `ctx.subjectProfile.id`.
- `requireAdminApi` — exige perfil admin.
  - `PUT` e `DELETE /users/:id` recusam com `403 USERS_SELF_LOCKOUT_FORBIDDEN` desativar, rebaixar (`type` diferente de `ADMIN`) ou arquivar a própria conta, comparando o `reference_id` do perfil alvo com o uid de quem chama. Nenhum admin tira o próprio acesso pelo painel, mas isso não garante que sobre um admin ativo: dois admins que desativam um ao outro em pedidos simultâneos passam pelo guard antes de qualquer gravação.

Os papéis do board (owner/maintainer/operator/viewer, limitados pela permissão no GitHub) chegam com a spec
`board-members`, como um guard composto sobre o `requireCommonPanelApi`; o modelo está em
[`docs/board/ACCESS.md`](board/ACCESS.md).

Os guards:
1. Validam o Bearer token (Firebase Admin).
2. Resolvem o perfil Firestore do **ator** (`userRepository.findByReferenceId(uid)`).
3. Resolvem o **subject** e validam o contexto de impersonação em `resolveAuthRequestContext` — os headers `x-role` / `requestUserId` enviados pelo SDK **não são confiados cegamente**: são validados server-side (papel, posse, permissão de painel).
4. Checam o **escopo** do recurso pelo repositório: `entityRepository.findOwnedBy(id, ctx.subjectProfile.id)` devolve `null` para registro de outra pessoa → 404.

> Ao criar rotas, repita a checagem mesmo que o front já restrinja a navegação. Ver [`apps/api/CLAUDE.md`](../apps/api/CLAUDE.md) e a skill `/new-api-route`.

## Firestore: acesso por service account, rules em deny-all

**Postura vigente**: a `apps/api` acessa o Firestore pelo **Admin SDK** — `getFirestoreAdmin()` de `@repo/auth/server`, resolvido em `apps/api/(shared)/infra/database.ts` e injetado no `BaseRepository`. Como serviço confiável, a API **ignora** as security rules; então [`firestore.rules`](../firestore.rules) pode **negar todo acesso direto de cliente** (`allow read, write: if false`) sem afetar a API.

> O projeto Firebase do agent-board ainda não existe. Publique as rules antes de o primeiro dado real
> entrar e confira com o passo [Verificar que o furo está fechado](#verificar-que-o-furo-está-fechado).

Consequências:

- Nenhum cliente (browser) toca o Firestore: o front fala só com a API via `@repo/sdk`. A chave pública do projeto deixa de ser um caminho de leitura dos dados.
- A API **não sobe** sem `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` e `FIREBASE_ADMIN_PRIVATE_KEY`: `apps/api/instrumentation.ts` resolve a instância no boot e o processo morre com mensagem clara se faltar alguma. Não existe modo degradado — credencial ausente é erro de configuração, não estado de negócio.
- `packages/auth/keys.ts` trata a service account como **tudo ou nada**: um conjunto parcial é erro de env (antes passava e só explodia no primeiro request).

### Publicar rules e índices

```bash
npx -y firebase-tools@latest login                                          # uma vez por máquina
npx -y firebase-tools@latest deploy --only firestore:rules --dry-run        # valida a sintaxe
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

O repositório não versiona `.firebaserc`: publique sempre com `--project <id-do-projeto>` — ver [`docs/SETUP.md`](SETUP.md).

⛔ **Ordem e rollback**: publique as rules **depois** de a API estar rodando no Admin SDK; o inverso deixa a API sem acesso. E o rollback correto é **reverter o código da API primeiro** — republicar rules permissivas sem reverter reexpõe a base inteira, o que não é rollback.

### Verificar que o furo está fechado

Com as rules publicadas, uma leitura direta com a chave pública do projeto deve ser **negada**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/entity?key=<NEXT_PUBLIC_FIREBASE_API_KEY>"
```

Esperado **403** (`PERMISSION_DENIED`). Com rules permissivas o mesmo comando devolve **200 com os dados** — é a medida da vulnerabilidade. Não salve o corpo da resposta: ele contém dados reais.

### Auditar as rules
- **Firebase MCP**: use a skill `firebase:firebase-security-rules-auditor` para avaliar a robustez das rules — especialmente útil **se** adotar o modelo alternativo (regras por dono) comentado em `firestore.rules`. Para `allow ... if false` o resultado é trivialmente "máximo de restrição".
- CLI: `npx -y firebase-tools@latest deploy --only firestore:rules --dry-run` para validar sintaxe.

## Cloud Storage: bucket privado, leitura por URL assinada

Mesma postura do Firestore — **a API é a única autoridade** — com uma diferença que engana: aqui são
**duas** camadas de acesso, e publicar as rules fecha só uma.

- O upload atravessa a API (`POST /files`, sob guard de painel comum), que valida **tipo real** (magic
  bytes) e tamanho. O caminho do objeto é derivado no servidor: o perfil de quem envia + UUID + extensão
  do tipo sniffado —
  nada que o cliente envia entra no path.
- A imagem é gravada **sem metadados** (`apps/api/(shared)/lib/image-metadata.ts`). Saem EXIF (com GPS,
  modelo da câmera e número de série), XMP, IPTC, comentários, blocos de texto e o que vier depois do fim da
  imagem. Ficam o perfil de cor (ICC) e, no JPEG, a orientação, regravada num EXIF mínimo que só tem essa
  tag. No WebP a orientação se perde. A remoção copia os blocos da imagem sem decodificar pixel, por lista de
  permissão: bloco desconhecido sai. Arquivo cuja estrutura ela não consegue percorrer recebe
  `415 UPLOAD_FILE_TYPE_NOT_ALLOWED`. Objetos gravados antes dessa regra continuam com o EXIF original.
- Foto de entidade e avatar aceitam só um objeto do bucket do próprio dono ou
  uma URL `https://lh3.googleusercontent.com/...`, o único host externo aceito para foto gravada
  (`EXTERNAL_IMAGE_HOSTS` em `apps/api/(shared)/lib/entity-photo.ts`, espelho de
  `apps/app/proxy.ts`). O `img-src` do painel libera também `https://avatars.githubusercontent.com`, só
  para o avatar do GitHub que o Firebase devolve e o menu de perfil exibe; foto gravada não aceita esse host. URL `http`, com porta, com credencial ou de outro host recebe `400
  ENTITY_PHOTO_INVALID` ou `400 ACCOUNT_AVATAR_INVALID`. O valor que já está gravado e volta sem mudança
  continua aceito, para que um registro antigo com URL externa siga salvável. Nenhum código do servidor busca
  essas URLs. Um CDN próprio exige editar a constante e a CSP juntas.
- A leitura sai por **URL assinada V4, expirável (15 min)**, emitida só depois do check de posse do
  recurso. O documento no Firestore guarda o **caminho**, nunca uma URL assinada.
  A exceção é o emulador de Storage (`FIREBASE_STORAGE_EMULATOR_HOST` preenchido): ali a URL é o caminho do
  objeto no emulador, `http://127.0.0.1:9199/<bucket>/<objeto>`, sem assinatura, porque o emulador não
  confere assinatura e assinar exigiria uma chave que o projeto `demo-` não tem. O ramo de produção não muda.
- [`storage.rules`](../storage.rules) é `deny-all` e governa `firebasestorage.googleapis.com`. Quem fecha
  `storage.googleapis.com` — de onde saem as URLs assinadas — é a **ausência de IAM público**.

⛔ **Nunca** conceda `allUsers`/`allAuthenticatedUsers` no bucket, nem use `makePublic()`,
`predefinedAcl: "publicRead"` ou `getDownloadURL()` — o último gera URL permanente e pública, o oposto do
desenho. Verificação: `curl -o /dev/null -w '%{http_code}' https://storage.googleapis.com/<bucket>/<objeto>`
→ **403**.

Ativação, permissões e custo (exige plano **Blaze**): [`PRE-PRODUCTION.md`](PRE-PRODUCTION.md). Sem
configurar, a capacidade fica desligada e `POST /files` responde `STORAGE_NOT_CONFIGURED` (503).

## Borda HTTP: cabeçalhos, CSP, CORS e limite de requisições

Os três controles vivem no `proxy.ts` de cada app e na política genérica de `@repo/security`
(`middleware.ts` monta as opções, `applySecurityHeaders` as aplica na resposta que o proxy já construiu).

### Cabeçalhos de segurança + CSP

| App | Política | Observação |
|-----|----------|------------|
| `apps/app` | `Content-Security-Policy` **bloqueante** | Maior superfície: analytics, avatares do Google e do GitHub, popup de login |
| `apps/api` | `Content-Security-Policy` **bloqueante**, `default-src 'none'` | Responde JSON; o único HTML é a página de erro do Next |

Os dois apps mandam também `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(),
magnetometer=(), microphone=(), payment=(), usb=()`, que desliga no navegador APIs que nenhum deles usa. O
nosecone não tem essa opção, então `applySecurityHeaders` põe o cabeçalho à mão, com o valor da constante
`PERMISSIONS_POLICY` de `packages/security/middleware.ts`. Quem precisar de uma dessas APIs edita a constante
e libera só a origem necessária, sem tirar o cabeçalho.

As rotas de sessão do painel (`/api/auth/session`, `/api/auth/session/refresh` e
`/api/auth/custom-token`, em `apps/app`) passam pelo proxy e saem com a mesma política das
páginas. O proxy responde cedo nesses caminhos: aplica os cabeçalhos e não resolve idioma, não grava o
cookie `x-locale`, não confere sessão e não consulta o Arcjet.

O painel e a API mandam `X-Robots-Tag: noindex` em toda resposta que passa pelo proxy, inclusive redirect
para o login, `/api/auth/*`, recusa de origem, 429 e preflight. Quem liga é a opção `noIndex` de
`applySecurityHeaders`, passada em `apps/app/proxy.ts` e `apps/api/proxy.ts`; o padrão é não mandar.

Três defaults do nosecone são **deliberadamente afrouxados** no painel, porque derrubam o login:

- `Cross-Origin-Opener-Policy` vai para `same-origin-allow-popups` — `same-origin` corta `window.opener` e o popup de login nunca devolve a credencial (falha silenciosa: o popup fecha e nada acontece).
- `Cross-Origin-Embedder-Policy` fica **desligado** — `require-corp` exigiria CORP no avatar servido pelo Google.
- `frame-src` lista `https://<NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN>` — o resolver do popup monta um iframe oculto ali.

⚠️ **`script-src` ainda usa `'unsafe-inline'`.** O script anti-flash do `next-themes`, o bootstrap de hidratação do App Router e o `gtag` são inline **sem nonce**, e fiar nonce nos três é tarefa própria. O valor desta política vem das demais diretivas (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` e as allowlists de `connect-src`/`img-src`/`frame-src`); o bloqueio de XSS por `script-src` é parcial até lá. `style-src 'unsafe-inline'` é irremovível nesta stack (antd CSS-in-JS, `next-themes`, `sonner`).

> **Ao introduzir um terceiro, acrescente-o à CSP do app** — é o custo herdado. Ex.: o avatar do GitHub (`avatars.githubusercontent.com`) entra em `img-src` junto com o login GitHub.

### CORS (allowlist, sem coringa)

`CORS_ORIGIN` é uma **lista separada por vírgula** e é **obrigatória em produção** — a exigência é aplicada no boot (`apps/api/instrumentation.ts`), não no env tipado, para que o build não passe a exigir valor de produção em qualquer ambiente. Em produção, sem a lista (ausente, vazia ou só com vírgulas), o processo imprime `[boot] CORS_ORIGIN is required in production…` e sai com código 1 (`apps/api/instrumentation-node.ts`). A credencial do Firestore ausente segue o mesmo caminho. Fora de produção o erro só é lançado. Decisão por requisição:

| Situação | Resposta |
|----------|----------|
| Sem header `Origin` em leitura (`GET`/`HEAD`/`OPTIONS`), ou em escrita sem o cookie `access-token`, com `Authorization` ou com `Sec-Fetch-Site: same-origin` (servidor→servidor, prefetch RSC, webhook) | Passa, **sem** cabeçalho de CORS |
| `POST`/`PUT`/`PATCH`/`DELETE` sem `Origin`, com o cookie `access-token`, sem `Authorization` e sem `Sec-Fetch-Site: same-origin` | `403 { "error": { "code": "AUTH_FORBIDDEN_ORIGIN" } }` + `Vary: Origin`, antes do limite de requisições e do guard; o log registra `reason=missing-origin` (`isUnprovenCookieWrite`, `apps/api/(shared)/lib/cookie-write-origin.ts:12`) |
| `Origin` na allowlist | Ecoa aquela origem + `Vary: Origin` |
| `Origin` fora da allowlist | `403 { "error": { "code": "AUTH_FORBIDDEN_ORIGIN" } }`; preflight recebe `204` **sem** `Access-Control-Allow-Origin` |

A segunda linha fecha o CSRF pelo cookie: o navegador anexa o cookie de sessão sozinho, mas não consegue pôr `Authorization` numa requisição montada por outro site. O SDK e o servidor dos front-ends mandam bearer, então nenhum chamador do core cai nessa recusa. Cliente que não é navegador e usa o cookie de sessão precisa mandar bearer ou `Origin`.

Refletir a origem **após** conferir a allowlist é a implementação canônica de multi-origem (o cabeçalho não aceita lista); o anti-padrão é refletir incondicionalmente.

### Limite de requisições

`checkRateLimit()` (Arcjet, `slidingWindow` de 60 s) roda no proxy da API com dois orçamentos, e uma requisição gasta no máximo um deles (`rateLimitBudgetFor`, `apps/api/proxy.ts:62`, medido em 2026-11-25):

| Requisição | Orçamento | Chave | Limite |
|------------|-----------|-------|--------|
| Caminho da lista estrita (e método, quando a lista restringe) | `strict` | IP | 20 / 60 s |
| `POST`, `PUT`, `PATCH` ou `DELETE` em qualquer outro caminho | `standard` | IP + sujeito | 60 / 60 s |
| `GET`, `HEAD` e `OPTIONS` fora da lista estrita | nenhum | — | — |

A **lista estrita** tem **4 caminhos**, casados por igualdade exata (`STRICT_RATE_LIMITED_PATHS`, `apps/api/proxy.ts`): `/auth/sign-in`, `/auth/sign-in/github`, `/files` e `/account/password`. Cada um gasta cota do Identity Toolkit ou grava no bucket.

O **orçamento padrão** casa por método, não por caminho: uma rota mutável nova nasce limitada sem ninguém mexer no proxy, e o vizinho de um caminho estrito (`/auth/sign-in/apple`, `/files/x`) cai nele. A chave soma o IP e o **sujeito**, um hash SHA-256 truncado do `sub` do JWT que chega em `Authorization: Bearer` (`apps/api/(shared)/lib/rate-limit-subject.ts`). Sem bearer, ou com um bearer que não é JWT, o sujeito é `"anonymous"` e a chave fica só o IP. O token é decodificado **sem verificação**: um `sub` forjado só compra um balde novo para uma requisição que o guard recusa em seguida, e por isso o valor nunca serve para autorizar. O hash existe porque o valor vai para o Arcjet, e um identificador estável de conta não tem por que sair daqui. Somar o sujeito ao IP evita que um escritório atrás de um NAT divida um orçamento só. Personificando, o sujeito é o admin, porque o bearer é dele.

Estouro, nos dois orçamentos, devolve `429 AUTH_RATE_LIMITED` + `Retry-After`. Ficam fora dos dois `/auth/me` (autenticada, hot path, e `GET`), `/health` e `/health/ready`.

Para mudar o comportamento, edite a lista em `apps/api/proxy.ts`: endpoint que confere segredo, manda e-mail ou custa dinheiro entra na lista estrita. Os webhooks do GitHub App (spec `github-app-integration`) e o contrato dos agentes (spec `agent-contract`) vão precisar decidir o orçamento deles ao nascer. O número do orçamento padrão é `STANDARD_RATE_LIMIT_MAX` em `packages/security/index.ts`.

`/auth/session` fica fora da lista estrita de propósito. Quem chama é o servidor do painel, antes de gravar o cookie de sessão, no logout e no proxy da `apps/app`, e chama com o IP do servidor: um limite só por IP contaria todos os usuários juntos e derrubaria o login de todo mundo de uma vez. O `GET` não conta em orçamento nenhum. O `DELETE` (logout) é método mutável e cai no orçamento padrão: o servidor encaminha o cookie de sessão como bearer (`createSessionAuthority`, `packages/sdk/src/client/sessionAuthority.ts`), e esse cookie é um JWT com o `uid` no `sub`, então cada pessoa gasta o próprio balde mesmo saindo do IP do servidor.

⚠️ **O limite só alcança a `apps/api`.** `POST /api/auth/session/refresh` (`packages/auth/session-routes.ts`), reexportado pela `apps/app`, regrava o cookie de sessão e vive nos front-ends, fora deste proxy, sem limite de requisições. A barreira dele é `isSameOriginRequest` (`packages/auth/session.ts:79-90`), que exige `Origin` do próprio host ou, sem `Origin`, `Sec-Fetch-Site: same-origin`; o resto recebe `403 AUTH_FORBIDDEN_ORIGIN`. A mesma checagem vale para `POST /api/auth/session`, `POST /api/auth/custom-token` e `DELETE /api/auth/session`. Antes de renovar, a rota exige um ID token de até 4096 caracteres, confere a sessão atual no Firebase Admin e pergunta à API se ela não foi encerrada noutro aparelho.

- **Sem `ARCJET_KEY` o limite é um no-op explícito**, nos dois orçamentos: nada é contado, nenhuma chamada de rede é feita, e a API avisa **uma vez, no boot** que as rotas mutáveis aceitam requisições sem limite. Nunca há contador em memória — em serverless ele não limita nada.
- **Chave sem o prefixo `ajkey_` conta como ausente na API.** O pacote lê a chave a cada chamada com `readArcjetKey()` (`packages/security/keys.ts:23-26`), que não lança: o limite vira no-op e as requisições seguem. O boot registra `console.error` dizendo que a chave não começa com `ajkey_`, sem imprimir o valor (`apps/api/instrumentation.ts:31-46`). Na `apps/app` a mesma chave faz o build falhar, porque o `env.ts` estende o schema estrito de `keys()` (`packages/security/keys.ts:35-41`); na Vercel, o deploy anterior continua no ar.
- **Shield do Arcjet em observação.** Os dois orçamentos levam também a regra `shield` em `DRY_RUN`
  (`API_SHIELD_MODE`, `packages/security/index.ts:28`): o Arcjet registra no painel as requisições com
  padrão de ataque e nenhuma resposta muda. Um falso positivo aqui recusaria uma escrita legítima, então
  observe uma semana de tráfego real antes de trocar a constante para `LIVE`
  ([`PRE-PRODUCTION.md`](PRE-PRODUCTION.md)). Em `LIVE`, a recusa sai como `429 AUTH_RATE_LIMITED`,
  pelo mesmo caminho de "recusado" que já existe. O shield só avalia o que passa por `checkRateLimit`
  (escritas e a lista estrita), não os `GET` comuns.
- ⚠️ **Isto não protege o formulário de login.** O popup do GitHub e o login por e-mail/senha (este só no emulador) vão do browser direto para o Firebase; quem limita esse trecho é a proteção nativa do Firebase (`USERS_AUTH_RATE_LIMITED`). Só a troca seguinte, `POST /auth/sign-in/github`, passa pela `apps/api` e cai na lista estrita. O limite aqui cobre a **superfície da API**.
- Bloqueio é registrado pelo helper de log compartilhado, numa linha só (`logEvent("security", "blocked", …)` em `apps/api/proxy.ts:128`, saindo como `[security] blocked reason=… path=… method=… requestId=…`), **sem IP, e-mail, body ou token** — IP é dado pessoal. A assinatura do helper não aceita objeto (`packages/shared/utils/helpers/log.ts:23`), então não há como passar o erro inteiro por descuido.

### Tamanho do corpo

O `parseRequestJson` (`apps/api/(shared)/lib/parse-request-json.ts`) lê o corpo de todas as rotas que recebem JSON e recusa acima de **100 KiB** com `413 VALIDATION_FAILED`, antes do `JSON.parse` e do Zod. Um `content-length` declarado acima do teto é recusado sem ler o corpo. Sem o header, ou com um valor menor que o real, o helper soma os bytes enquanto lê e para de ler ao passar do teto, soltando o stream sem cancelá-lo: no corpo que o Next monta sobre o `Readable` do Node, o cancelamento deixa um `unhandledRejection` (`AbortError`) no log a cada recusa. O maior corpo legítimo de hoje é o da criação de entidade: cerca de 74 KB no pior caso, com todo caractere escapado como `\uXXXX`.

A resposta 413 sai com `connection: close`. O helper não lê o resto do corpo, e sem esse header o Node mantém o socket aberto esperando por ele até o `requestTimeout` (300 s por padrão). Medido em `next start` no dia 2026-10-20, com 50 envios simultâneos de 5 MiB para `/auth/sign-in`: sem o header, 40 das 50 conexões com corpo em `chunked` continuavam ESTABLISHED 2 s e 60 s depois; com ele, nenhuma ficou aberta aos 60 s, em três rajadas. Com `content-length` declarado, com ou sem `Expect: 100-continue`, o `curl` encerra a conexão por conta própria ao receber o 413, e nenhuma ficou aberta antes nem depois da mudança.

Fechar a conexão tem um custo para o cliente que ainda está enviando quando o 413 chega. O `fetch` do Node 22 mandando 5 MiB pelo localhost recebeu o 413 em 230 de 240 tentativas. Nas outras 10 (8 com `content-length`, 2 em `chunked`; 9 delas em lotes de 30 envios simultâneos), a escrita falhou com `ECONNRESET` ou `EPIPE` e o cliente não viu o 413 nem o `error.code`. Sem o header, as 120 tentativas de controle receberam o 413. Através de um proxy local que atrasa cada sentido em 25 ms ou 100 ms, as 40 tentativas receberam o 413, mas esse proxy não reproduz como uma rede real entrega o `RST`. Na Vercel nada disso foi medido. Corpo acima de 100 KiB não é uso legítimo, então um erro de socket nesse caso é aceitável. O 400 de JSON inválido mantém a conexão, porque nele o corpo foi lido inteiro.

Uma rota lê o corpo por fora do helper: `/files`, que tem teto próprio de 4 MiB (`file.schema.ts`). O `/files` usa o mesmo leitor com contagem (`apps/api/(shared)/lib/read-capped-body.ts`) com teto de 4 MiB mais 64 KiB de envelope multipart: sem `content-length`, para de ler ao passar do teto e responde `413 UPLOAD_FILE_TOO_LARGE` com `connection: close`, como o `parseRequestJson`.

O teto limita o que o handler acumula e parseia, e não o que a plataforma recebe. Na Vercel, corpo acima de 4,5 MB é recusado antes do handler, sem `error.code`. No `next start`, a presença do `proxy.ts` faz o Next guardar em memória até 10 MiB de qualquer corpo (`experimental.proxyClientMaxBodySize`, pela leitura do código do Next 16.0.0) e truncar o resto. Uma rota nova que leia o corpo sem o helper fica sem teto.

## Segredos e configuração

- Não commite `.env`/`.env.local`. As vars reais estão em [`docs/SETUP.md`](SETUP.md).
- `@repo/security` (Arcjet + nosecone) fornece rate limiting e secure headers — habilite `ARCJET_KEY` em produção e defina `CORS_ORIGIN` **antes** do primeiro deploy da API.

## Checklist ao revisar mudanças sensíveis

- [ ] Rota nova tem guard (`requireCommonPanelApi`/`requireAdminApi`, ou o guard de papel do board) e checa posse ou escopo.
- [ ] Nenhum header de auth do cliente é confiado sem validação server-side.
- [ ] Erros expõem só `error.code` (sem stack trace/PII).
- [ ] Acesso a dados via API; cliente não toca Firestore direto.
- [ ] Webhooks verificam assinatura.
- [ ] Segredos só no servidor; nada de `NEXT_PUBLIC_*` para chave secreta.
- [ ] Domínio de terceiro novo (script, iframe, imagem, endpoint) foi acrescentado à CSP do app que o carrega.
- [ ] Arquivo é servido por URL assinada e expirável; bucket sem IAM público e sem `getDownloadURL()`.

> Para uma varredura automatizada das mudanças pendentes, use a skill global `/security-review`.
