# Critérios de Aceite (Checklist)

Feature: integração com o GitHub App do board (`apps/api`). O diff não tem tela; não há critério de
tema, responsivo nem papel de usuário logado, porque a única rota nova é pública e se autentica pela
assinatura. O status de cada item está em [`report.md`](report.md).

- [ ] **Webhook sem segredo configurado responde 503**
  Com `GITHUB_WEBHOOK_SECRET` ausente ou vazio, `POST /github/webhook` responde
  `503 {"error":{"code":"GITHUB_APP_NOT_CONFIGURED"}}` antes de ler o corpo. A API continua subindo nesse
  estado e o boot imprime uma vez a linha `[github] GITHUB_WEBHOOK_SECRET is not set: …`. String vazia na
  variável conta como ausência, igual a não declarar.

- [ ] **Entrega do GitHub atravessa o `proxy.ts`**
  Uma entrega real chega sem `Origin` e sem cookie de sessão. O proxy deixa passar (não responde
  `403 AUTH_FORBIDDEN_ORIGIN`) e conta a requisição no orçamento `standard` de rate limit. Um `ping`
  assinado responde `200 {"data":{"handled":false}}`. Uma requisição com `Origin` fora da lista
  continua recusada com 403, e uma com cookie `access-token` e sem `Origin` também (caso que o GitHub
  não produz).

- [ ] **Assinatura ausente, malformada ou errada responde 401**
  Sem `X-Hub-Signature-256`, com prefixo diferente de `sha256=`, com hex de tamanho errado, com 64 zeros
  ou assinada com outro segredo, a resposta é `401 GITHUB_WEBHOOK_SIGNATURE_INVALID` e o log registra só
  `[github] webhook-signature-invalid`, sem corpo nem cabeçalho. A comparação usa `timingSafeEqual` e
  nenhum desses casos lança exceção.

- [ ] **Corpo acima de 1 MiB responde 413, com ou sem `Content-Length`**
  O teto é 1.048.576 bytes. Exatamente esse tamanho é aceito; um byte a mais responde
  `413 GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE`. Vale também para corpo enviado com
  `Transfer-Encoding: chunked`, em que o tamanho só se conhece lendo o stream. O HMAC não é calculado
  sobre corpo rejeitado e o log não mostra erro não tratado.

- [ ] **Corpo assinado mas inválido responde 400**
  JSON quebrado, ou um evento conhecido (`member`, `installation_repositories`) sem os campos que o
  handler precisa, responde `400 GITHUB_WEBHOOK_PAYLOAD_INVALID`. O corpo só é interpretado depois de a
  assinatura passar.

- [ ] **`member` e `installation_repositories` invalidam o cache de permissão**
  `member` invalida o repositório citado e responde `handled: true`. `installation_repositories` invalida
  os repositórios adicionados e os removidos e responde `handled: true`. `ping` e eventos desconhecidos
  (por exemplo `star`) respondem `200 handled: false` e não tocam no cache.

- [ ] **Nada de segredo, corpo ou login no log**
  Nenhuma linha de log traz o segredo do webhook, a chave do App, o JWT, o token de instalação ou o
  conteúdo do corpo (logins e nomes de repositório). O log do webhook guarda só evento, `delivery`,
  `action` e `handled`.

- [ ] **Escolha do cliente: App, falso ou nenhum**
  Com `GITHUB_APP_ID` e `GITHUB_APP_PRIVATE_KEY` preenchidos, o cliente é o real. Sem eles e com
  emulador (`FIRESTORE_EMULATOR_HOST` ou `FIREBASE_AUTH_EMULATOR_HOST`), `getGithubClient()` devolve o
  cliente falso e o boot imprime uma vez `[github] GitHub App is NOT configured: using the sample
  repositories of the emulator.`. Sem eles e sem emulador não há cliente, e quem chama responde
  `503 GITHUB_APP_NOT_CONFIGURED`. `GITHUB_APP_ID=""` conta como ausente.

- [ ] **Build de produção sem as variáveis do App**
  `next build` da `apps/api` passa sem nenhuma das três variáveis do GitHub e lista a rota
  `ƒ /github/webhook`. As três `FIREBASE_ADMIN_*` continuam obrigatórias no build, como já era antes.

- [ ] **Token de instalação reaproveitado e renovado**
  O token fica em memória e é reaproveitado até 60 s antes de expirar, depois renovado. Nunca aparece em
  resposta HTTP, log ou Firestore.

- [ ] **Paginação com teto de 10 páginas**
  `listInstallationRepositories` segue o `Link: rel="next"` só para `https://api.github.com`. Depois de 10
  páginas para de pedir e registra `[github] pagination-truncated maxItems=1000`.

- [ ] **`getCollaboratorRole` sempre devolve um papel de `GITHUB_REPO_ROLES`**
  `role_name` padrão é mapeado direto; papel customizado cai no campo `permission`; quem não é
  colaborador (404) recebe `none`. O resultado fica 5 minutos em cache, e a invalidação ignora
  maiúsculas.

- [ ] **Falha do GitHub vira `error.code`, nunca 500**
  403 com `x-ratelimit-remaining: 0` vira `503 GITHUB_RATE_LIMITED`; 403 sem cota esgotada e 404 de
  repositório viram `404 GITHUB_REPOSITORY_NOT_ACCESSIBLE`; 401, chave malformada, 5xx e erro de rede
  viram `502 GITHUB_UNAVAILABLE`. Os sete códigos novos têm texto em `apiErrors`.

- [ ] **Rate limit no webhook (risco R4)**
  Com `ARCJET_KEY` configurada, a 61ª entrega no mesmo minuto vinda do mesmo endereço responde
  `429 AUTH_RATE_LIMITED`. Sem chave o limitador é no-op e todas passam. Este critério só registra o
  número; isentar a rota assinada é decisão da `pr-flow`.

- [ ] **Sinais de pronto contra repositório real**
  Com o App criado e instalado: listar os repositórios da instalação, ler `.kanban/board.yml` de um deles,
  consultar a permissão de um colaborador (inclusive externo) e receber uma entrega real do GitHub com
  resposta 200. Depende do item 5 do `docs/PRE-PRODUCTION.md`.
