# Antes de entrar em produção

Passos que **não são código** e que nenhum teste, lint ou CI consegue cobrar. Cada um exige console de
provedor ou painel do GitHub. O repositório já faz a parte dele; estes itens são a configuração que falta.

> **Por que este arquivo existe.** O repo sobe, os testes passam e a UI funciona com estes itens pendentes.
> É isso que os torna perigosos: a ausência só aparece quando alguém é prejudicado por ela. O `/cycle` e o
> modo board escrevem aqui as pendências de infra que encontram, em vez de travar a entrega.

Marque o que fizer. O que estiver desmarcado é o que falta para o deploy ser honesto.

---

## ⛔ Bloqueadores

### 1. Projeto Firebase próprio

- [ ] Projeto Firebase novo para o agent-board (Auth + Firestore), separado de qualquer produto
- [ ] Service account do Admin SDK gerada e guardada nas variáveis da `apps/api` e da `apps/app` (`FIREBASE_ADMIN_*`)
- [ ] App web registrado e configuração `NEXT_PUBLIC_FIREBASE_*` preenchida na `apps/app`
- [ ] Emuladores esvaziados nos `.env` de produção (as quatro variáveis do bloco de emulador **vazias**)

O repositório não versiona `.firebaserc`: todo comando do `firebase-tools` leva `--project <id>`. Detalhe
das variáveis, uma a uma, em [`SETUP.md`](SETUP.md).

### 2. Publicar as rules e os índices do Firestore

- [ ] `firestore.rules` publicado
- [ ] `firestore.indexes.json` publicado

A `apps/api` acessa o Firestore pelo Admin SDK e **ignora** as rules, então publicar não quebra a API:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --dry-run --project <id>   # valida a sintaxe
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project <id>
```

Conferir depois de publicar: uma leitura direta com a chave pública deve devolver **403
`PERMISSION_DENIED`** ([`SECURITY.md`](SECURITY.md#verificar-que-o-furo-está-fechado)). Sem os índices
compostos, as listas respondem `503 PAGINATION_INDEX_MISSING` e os resumos `503 SUMMARY_INDEX_MISSING` —
nunca 500 —, e o emulador serve as mesmas consultas sem índice, então só o projeto real denuncia a falta.

⛔ **Ordem e rollback.** Publique as rules **depois** de a API estar no ar. O rollback correto é reverter o
código da API primeiro: republicar rules permissivas sem reverter reexpõe a base inteira.

### 3. `CORS_ORIGIN`

- [ ] `CORS_ORIGIN` da `apps/api` com o host do painel em produção

Em produção, sem a lista, a API recusa subir (`[boot] CORS_ORIGIN is required in production…`). Não há
coringa. Detalhe em [`SECURITY.md`](SECURITY.md#cors-allowlist-sem-coringa).

### 4. Login

- [ ] Provedor Google ligado em Firebase Authentication → Sign-in method, com o domínio do painel entre os autorizados
- [ ] Contas iniciais criadas pelo admin (`POST /users`) ou pelo primeiro login com Google

O login com GitHub chega com a spec `github-sign-in`; quando ela entrar, este item ganha o passo do
provedor GitHub (OAuth App ou GitHub App, callback do Firebase) e o de e-mail/senha some.

---

## ⚠️ Fortemente recomendados

### 5. `ARCJET_KEY`

- [ ] `ARCJET_KEY` (começando com `ajkey_`) na `apps/api` e na `apps/app`
- [ ] Depois de uma semana de tráfego real, trocar `API_SHIELD_MODE` de `DRY_RUN` para `LIVE` (`packages/security/index.ts`)

Sem a chave, o limite de requisições é um no-op explícito e a API avisa uma vez no boot. Detalhe em
[`SECURITY.md`](SECURITY.md#limite-de-requisições).

### 6. Branch protection na `main`

- [ ] Exigir os checks `verify`, `e2e`, `secrets` e `audit` do CI antes do merge
- [ ] Ligar, em Settings → Code security, Dependabot alerts, Dependabot security updates, secret scanning e push protection

O CI sinaliza e não bloqueia enquanto a proteção não existir. O `e2e` só aparece na busca do ruleset depois
de rodar numa PR, e é pulado (o que conta como sucesso) em PR que só mexe em documentação. O modo board
depende disto: um agente rodando sem supervisão nunca deve conseguir escrever direto na `main`. Passo a
passo em [`SETUP.md`](SETUP.md#runbook--branch-protection-ação-manual-no-github).

### 7. Restringir as chaves do Firebase

- [ ] Chave do navegador (`NEXT_PUBLIC_FIREBASE_API_KEY`) com restrição por referenciador HTTP (`https://<painel>/*`, `https://<projeto>.firebaseapp.com/*`) e restrição de API (Identity Toolkit API, Token Service API)
- [ ] Chave separada para `FIREBASE_WEB_API_KEY`, só com restrição de API

A chave do servidor não pode ter restrição de referenciador, porque a API chama o Identity Toolkit sem
`Referer`. Conferir sem `Referer`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' \
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<CHAVE_DO_NAVEGADOR>"
```

A chave restrita responde **403**; **400** quer dizer que ela aceita chamada de qualquer origem.

### 8. Observabilidade

- [ ] Health check da plataforma apontado para `/health/ready` (responde `503` quando o Firestore não atende em 2 s)
- [ ] Um coletor de erro no `reportRequestError` (`onRequestError` dos apps), se quiser alerta em vez de log
- [ ] Retenção de log da plataforma conferida no painel do provedor

### 9. Retenção das notificações

- [ ] Política de TTL em `notification.expiresAt` ligada (exige faturamento ativo)

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=notification --enable-ttl --project=<id>
```

Cada notificação nasce com `expiresAt` em 90 dias. Sem a TTL nada quebra: a lista é paginada e a contagem
para em 100.

### 10. Backup do Firestore

- [ ] Recuperação a um instante (PITR) ou export agendado ligado (os dois exigem faturamento ativo)
- [ ] Uma restauração de teste feita num banco separado

Boards, cards e execuções passam a morar no Firestore; backup que nunca foi restaurado não conta.
Referências: [PITR](https://docs.cloud.google.com/firestore/native/docs/pitr) e
[export e import](https://docs.cloud.google.com/firestore/docs/manage-data/export-import).

---

## Opcional

### 11. Cloud Storage — só se for usar upload de arquivo

- [ ] Storage ativado no projeto (exige plano **Blaze**, ou seja, cartão)
- [ ] `FIREBASE_STORAGE_BUCKET` (`apps/api`) e `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (`apps/app`) com o mesmo valor, local **e** na Vercel
- [ ] `roles/storage.objectAdmin` concedido à service account
- [ ] `storage.rules` publicado
- [ ] Verificado que o objeto **não** abre sem assinatura

Sem as variáveis, o app sobe, `POST /files` responde `503 STORAGE_NOT_CONFIGURED` e os formulários mantêm o
campo de URL de imagem. A franquia gratuita do Cloud Storage só existe em `us-central1`, `us-east1` e
`us-west1`: criar o bucket em outra região cobra desde o primeiro byte.

```bash
gcloud storage buckets add-iam-policy-binding gs://<bucket> \
  --member="serviceAccount:<FIREBASE_ADMIN_CLIENT_EMAIL>" \
  --role="roles/storage.objectAdmin"
npx -y firebase-tools@latest deploy --only storage --project <id>
curl -s -o /dev/null -w '%{http_code}\n' "https://storage.googleapis.com/<bucket>/<objeto>"   # esperado 403
```

⛔ **Nunca conceda `allUsers` nem `allAuthenticatedUsers`** no bucket.

### 12. Marca

- [ ] `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_LOGO_URL` e `NEXT_PUBLIC_APP_SUPPORT_EMAIL`, se quiser algo além do padrão `agent-board`

---

## Pendências registradas pelo pipeline

O `/cycle` e o modo board acrescentam aqui o que exige infra externa ou julgamento seu (provedor, custo,
credencial), com o passo a passo e o que acontece sem ele. Nenhuma por enquanto.

---

## Ordem na primeira ida a produção

Projeto Firebase → service account → build passa → `CORS_ORIGIN` → deploy da API → publicar rules e
índices → login Google no domínio → branch protection → storage, se for usar.

Referências: [`SETUP.md`](SETUP.md) (variáveis) · [`SECURITY.md`](SECURITY.md) (postura e comandos) ·
[`ARCHITECTURE.md`](ARCHITECTURE.md).
