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

- [x] Projeto Firebase novo para o agent-board (Auth + Firestore), separado de qualquer produto
- [x] Service account do Admin SDK gerada e guardada nas variáveis da `apps/api` e da `apps/app` (`FIREBASE_ADMIN_*`)
- [x] App web registrado e configuração `NEXT_PUBLIC_FIREBASE_*` preenchida na `apps/app`
- [x] Emuladores esvaziados nos `.env` de produção (as quatro variáveis do bloco de emulador **vazias**)

O repositório não versiona `.firebaserc`: todo comando do `firebase-tools` leva `--project <id>`. Detalhe
das variáveis, uma a uma, em [`SETUP.md`](SETUP.md).

Num projeto recém-criado, a Cloud Firestore API vem desligada, e criar o banco responde 403 até ela ser
ligada com `gcloud services enable firestore.googleapis.com --project <id>`. A ativação leva alguns
minutos para propagar. A região do banco não muda depois de criada: escolha a mais próxima de onde a API
roda, porque é a API que conversa com o Firestore.

### 2. Publicar as rules e os índices do Firestore

- [x] `firestore.rules` publicado
- [x] `firestore.indexes.json` publicado

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

- [x] `CORS_ORIGIN` da `apps/api` com o host do painel em produção

Em produção, sem a lista, a API recusa subir (`[boot] CORS_ORIGIN is required in production…`). Não há
coringa. Detalhe em [`SECURITY.md`](SECURITY.md#cors-allowlist-sem-coringa).

### 4. Login com GitHub

- [x] OAuth App do GitHub criado (Settings → Developer settings → OAuth Apps → New OAuth App), com
      Authorization callback URL `https://<authDomain>/__/auth/handler`, onde `<authDomain>` é o
      `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` do projeto. É outro registro, separado do GitHub App do item 5
- [x] Firebase Console → Authentication → Sign-in method → GitHub ligado, com o Client ID e o Client
      Secret do OAuth App. O Client Secret fica só no Firebase, não vai para variável de ambiente
- [x] Email/Password e Google **desligados** no mesmo lugar
- [x] Domínio do painel em Authentication → Settings → Authorized domains

O app não tem papel global: toda conta com perfil usa as mesmas telas, e o acesso a cada board vem do papel
efetivo nele. Um perfil antigo com `type: "admin"` gravado entra normalmente; nenhum guard lê esse campo.

**Por quê.** A tela de login de produção só tem o botão "Entrar com GitHub". O popup é do Firebase, que
precisa do OAuth App para falar com o GitHub. A API lê o `login` da pessoa no próprio Firebase
(`accounts:lookup`) e grava em `user.github`; é esse login que a permissão por repositório vai usar.

**Sem isso.** A app sobe, o build passa e nada mais quebra, mas ninguém entra: o popup falha com
`auth/operation-not-allowed`, que a tela mostra traduzido. O código já recusa senha e Google fora do
emulador (`POST /auth/sign-in` e `/api/auth/session` respondem `403 AUTH_SIGN_IN_METHOD_DISABLED`, e a
API trata a credencial como anônima). Desligar os provedores no console é a primeira barreira; o código é
a segunda.

**Como verificar.**

1. Abrir `https://<painel>/pt-br/sign-in`: só o botão do GitHub e as duas notas, sem campo de e-mail.
2. Entrar pelo popup e abrir o menu de perfil: a segunda linha mostra `@<seu-login>`.
3. No Firestore, o documento `user` da conta tem `github.id` (só dígitos) e `github.login`.
4. Senha recusada no servidor:

   ```bash
   curl -s -X POST https://<host-da-api>/auth/sign-in \
     -H 'content-type: application/json' -d '{"email":"x@example.com","password":"qualquer"}'
   # esperado: {"error":{"code":"AUTH_SIGN_IN_METHOD_DISABLED"}}
   ```

5. Ainda não medido: se o Firebase de produção atualiza o `screenName` quando a pessoa troca de login no
   GitHub (o emulador atualiza). Para conferir, troque o login de uma conta de teste no GitHub, entre de
   novo e veja se `github.login` mudou. Se não mudar, o login fica parado no do primeiro acesso.

Se o popup voltar com "credenciais inválidas" e o Firebase não criar nenhuma conta, confira o Client
Secret. Na página do OAuth App, um secret que nunca autenticou continua marcado como "Never used". Um
Client Secret do GitHub tem 40 caracteres hexadecimais, e o GitHub só mostra o valor no momento em que
gera.

### 5. GitHub App do board

- [x] GitHub App criado na conta ou organização dona dos repositórios (Settings → Developer settings → GitHub Apps → New GitHub App). É um App próprio do board, separado do Claude GitHub App
- [x] Permissões de repositório: Metadata (read), Contents (read), Pull requests (read & write), Issues (read), Checks (read)
- [x] Nenhum evento extra marcado. O `installation_repositories` chega a todo GitHub App sem precisar assinar
- [ ] Conferir no App (Permissions & events → Repository permissions) que `Pull requests` está mesmo em
  `Read and write`. O item acima foi marcado antes de existir código que escrevesse no GitHub; até a
  `pr-flow`, nada mediu. Se precisar mudar, cada instalação tem de aceitar a permissão nova (a conta dona
  recebe o pedido em Settings → Applications → Installed GitHub Apps → Review request); até lá o card mostra
  `GITHUB_APP_PERMISSION_MISSING` e a API não responde 500
- [ ] Assinar os eventos `Pull request`, `Pull request review`, `Issue comment` e `Check suite`
  (Permissions & events → Subscribe to events). `Issue comment` depende de `Issues: read` e `Check suite`
  de `Checks: read`, já listadas. Sem eles a PR abre, mas o card não vê review, comentário, CI nem merge
- [ ] Conferir de ponta a ponta num repositório de teste com o kit: levar um card até Aguardando PR e ver a
  PR aparecer como rascunho com autor `<app>[bot]`; comentar e ver o `/mediate` na linha do tempo; em
  Advanced → Recent Deliveries do App, as entregas com `200` e `{"data":{"handled":true}}`; mergear e ver o
  card em Concluído. Também conferir se `check_suite.completed` do GitHub Actions chega ao App (a
  documentação diz que sim para quem tem `Checks: read`; não medido). Em repositório privado de conta Free o
  GitHub não aceita rascunho: o board abre pronta para review e avisa na linha do tempo
- [x] Webhook URL `https://<host-da-api>/github/webhook`, content type `application/json`, com um segredo gerado por `openssl rand -hex 32`
- [ ] Chave privada gerada no App (Credentials → Key pairs → New key), `.pem` baixado e guardado só no gerenciador de segredos
- [x] `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (com as quebras de linha escapadas como `\n`) e `GITHUB_WEBHOOK_SECRET` nas variáveis da `apps/api` na Vercel. Nunca na `apps/app`
- [x] App instalado repositório a repositório, começando por um repositório de teste que já tenha o kit aplicado

O evento `member` fica de fora de propósito. O GitHub só oferece esse evento a um App com a permissão
Administration (read) do repositório, ou Members numa organização, e as duas dão acesso bem maior do que o
board precisa. Na API, o `member` só serve para limpar o cache de permissões
(`apps/api/(shared)/lib/github/github-permission-cache.ts`), que já expira em 5 minutos e vive na memória
de cada instância. Sem ele, um colaborador adicionado ou removido leva até 5 minutos para valer no board.

Por quê: é a credencial com que a API lista os repositórios, lê o `.kanban/board.yml` e consulta a
permissão de cada pessoa no GitHub, que limita o papel no board. Sem ele não há importação de board em
produção. As permissões de PR, Issues e Checks são usadas pela coluna Aguardando PR (spec `pr-flow`): o board abre
a PR com `Pull requests: write` e acompanha o card pelos eventos `pull_request`, `pull_request_review`,
`issue_comment` e `check_suite`. O `pull_request_review_comment` fica de fora porque cada comentário em
linha já chega dentro do `pull_request_review`, e assinar os dois dispararia o `/mediate` uma vez por
comentário.

Sem as variáveis, a API sobe e o build passa. O boot avisa uma vez (`[github] GitHub App is NOT
configured…` e `[github] GITHUB_WEBHOOK_SECRET is not set…`), `POST /github/webhook` responde `503
GITHUB_APP_NOT_CONFIGURED` e a API fica sem cliente do GitHub; as rotas que dependem dele (a importação
de board, quando entrar) respondem o mesmo código. Contra o emulador, a API usa três repositórios de exemplo (`agent-board-demo/*`) no
lugar do GitHub; isso nunca acontece fora do emulador.

Conferir depois de configurar:

1. O log de boot da API não tem mais nenhuma linha `[github] … NOT configured` nem `… is not set`.
2. Na aba Advanced do App, a entrega de `ping` aparece com resposta `200` e corpo `{"data":{"handled":false}}`.
3. Troque o segredo no App sem trocar na Vercel e reenvie uma entrega em Recent Deliveries: a resposta é
   `401` com `GITHUB_WEBHOOK_SIGNATURE_INVALID`. Depois volte o segredo.
4. Com a importação de board entregue (spec `board-import`), o repositório de teste aparece na lista e o
   `.kanban/board.yml` dele é lido.

Se a chave estiver mal colada (quebras reais em vez de `\n`, ou escapadas duas vezes), o log mostra
`[github] app-credentials-rejected` e as chamadas respondem `502 GITHUB_UNAVAILABLE`. A chave nunca vai
para o log.

---

## ⚠️ Fortemente recomendados

### 6. `ARCJET_KEY`

- [ ] `ARCJET_KEY` (começando com `ajkey_`) na `apps/api` e na `apps/app`
- [ ] Depois de uma semana de tráfego real, trocar `API_SHIELD_MODE` de `DRY_RUN` para `LIVE` (`packages/security/index.ts`)

Sem a chave, o limite de requisições é um no-op explícito e a API avisa uma vez no boot. Detalhe em
[`SECURITY.md`](SECURITY.md#limite-de-requisições).

### 7. Branch protection na `main`

- [x] Exigir os checks `verify`, `e2e`, `secrets` e `audit` do CI antes do merge
- [x] Ligar, em Settings → Code security, Dependabot alerts, Dependabot security updates, secret scanning e push protection

O CI sinaliza e não bloqueia enquanto a proteção não existir. O `e2e` só aparece na busca do ruleset depois
de rodar numa PR, e é pulado (o que conta como sucesso) em PR que só mexe em documentação. O modo board
depende disto: um agente rodando sem supervisão nunca deve conseguir escrever direto na `main`. Passo a
passo em [`SETUP.md`](SETUP.md#runbook--branch-protection-ação-manual-no-github).

### 8. Restringir as chaves do Firebase

- [x] Chave do navegador (`NEXT_PUBLIC_FIREBASE_API_KEY`) com restrição por referenciador HTTP (`https://<painel>/*`, `https://<projeto>.firebaseapp.com/*`) e restrição de API (Identity Toolkit API, Token Service API)
- [x] Chave separada para `FIREBASE_WEB_API_KEY`, só com restrição de API

A chave do servidor não pode ter restrição de referenciador, porque a API chama o Identity Toolkit sem
`Referer`. Conferir sem `Referer`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' \
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<CHAVE_DO_NAVEGADOR>"
```

A chave restrita responde **403**; **400** quer dizer que ela aceita chamada de qualquer origem.

### 9. Observabilidade

- [ ] Health check da plataforma apontado para `/health/ready` (responde `503` quando o Firestore não atende em 2 s)
- [ ] Um coletor de erro no `reportRequestError` (`onRequestError` dos apps), se quiser alerta em vez de log
- [ ] Retenção de log da plataforma conferida no painel do provedor

### 10. Índices e dados órfãos depois da limpeza do app

- [ ] `firebase deploy --only firestore:indexes` no projeto de produção, depois do merge que tirou os
      recursos herdados do core (CRUD `entity`, notificações e a área admin)
- [ ] Os índices de `entity`, `notification` e os dois de `user` (`deletedAt` + `type`, `deletedAt` +
      `lastAccessAt`) apagados no console, ou com `--force` no deploy

O `firestore.indexes.json` agora declara só o índice de `user` (`reference_id` + `deletedAt`). Um deploy
sem `--force` não apaga índice que existe no projeto e saiu do arquivo: os antigos ficam na lista, sem custo
de leitura. Os documentos de `entity` e `notification` e os campos `type` e `lastAccessAt` dos perfis também
ficam no banco, sem leitor. Limpar esses dados é um script avulso, fora do código do app.

### 11. Backup do Firestore

- [ ] Recuperação a um instante (PITR) ou export agendado ligado (os dois exigem faturamento ativo)
- [ ] Uma restauração de teste feita num banco separado

Boards, cards e execuções passam a morar no Firestore; backup que nunca foi restaurado não conta.
Referências: [PITR](https://docs.cloud.google.com/firestore/native/docs/pitr) e
[export e import](https://docs.cloud.google.com/firestore/docs/manage-data/export-import).

---

## Opcional

### 12. Cloud Storage — só se for usar upload de arquivo

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

### 13. Marca

- [ ] `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_LOGO_URL` e `NEXT_PUBLIC_APP_SUPPORT_EMAIL`, se quiser algo além do padrão `agent-board`

---

## Pendências registradas pelo pipeline

O `/cycle` e o modo board acrescentam aqui o que exige infra externa ou julgamento seu (provedor, custo,
credencial), com o passo a passo e o que acontece sem ele. A primeira foi o GitHub App do board, que por
ser bloqueador ficou no item 5.

### Executor de etapas em produção (spec `orchestrator`, 2026-11-26)

**O que fazer:** registrar e ligar um runner local (spec `local-runner`) em "Minhas credenciais" de qualquer board.
Fora do emulador, ele é o único executor.

**Por quê:** o único executor implementado é o de teste, que simula o resultado e só existe quando a API fala com
o emulador (`isEmulated()`, o mesmo critério do cliente GitHub falso). Nenhuma variável de ambiente o liga.

**O que acontece sem ele:** para quem não tem runner online, o quadro mostra "Nenhum runner seu está online, então as
etapas não podem ser disparadas.", as colunas de etapa não aceitam card e `POST /boards/<id>/cards/<slug>/runs` responde
`503 RUN_EXECUTOR_UNAVAILABLE`. Mover para Tarefas e Concluído continua funcionando. Antes desta spec, arrastar para
uma etapa só mudava o card de coluna; isso deixou de existir.

**Como verificar:** `GET /boards/<id>` devolve `"executor": null` em produção para quem não tem runner online,
`"executor": "local"` para quem tem, e `"executor": "fake"` com `pnpm emulators` + `pnpm dev` sem runner.

### Tempo limite de etapa sem ninguém olhando o board (spec `orchestrator`, 2026-11-26)

**O que fazer:** decidir se vale pagar por um agendador quando os ciclos noturnos (spec `cycle-runs`) existirem.
Opções, todas com custo:

- Vercel Pro, com cron por minuto. No plano Hobby o cron roda no máximo uma vez por dia, com precisão de
  ±59 minutos ([Vercel, Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing),
  consultado em 2026-11-26).
- Firebase Blaze, com uma função agendada. Cloud Functions não existem no plano Spark
  ([Firebase pricing](https://firebase.google.com/pricing), consultado em 2026-11-26).
- Um agendador externo chamando uma rota protegida por segredo, que ainda teria de ser criada.

**Por quê:** a API não tem worker. O que depende de evento (disparo, resultado, parada, resposta) roda no próprio
request. O que depende do relógio (o prazo de cada execução e, no emulador, a resposta do executor de teste) roda no
começo de `GET /boards/<id>/cards` e `GET /boards/<id>/cards/<slug>`. O quadro consulta a cada 5 segundos enquanto há
card na fila ou rodando.

**O que acontece sem ele:** com alguém olhando o board, o prazo é aplicado em até 5 segundos. Sem ninguém olhando,
uma execução vencida continua `running` no banco até a próxima leitura; a tela nunca mostra o estado velho, porque a
leitura aplica o prazo antes de responder. A etapa seguinte de um card que estourou o prazo de madrugada só começa
quando alguém abre o board. Gatilho para reavaliar: o primeiro ciclo noturno que travar por isso.

Com runner local, o ciclo não depende mais disso para prazos: o runner avisa o `finish` com `exit: "deadline"` e o
board fecha a execução vencida na hora (spec `cycle-runs`). Continua dependendo para um `run` que nenhum runner pegou.

**Como verificar:** no emulador, `pnpm --filter api fake-executor script <boardId> <slug> silent`, disparar a etapa,
esperar o card ficar Rodando e rodar `pnpm --filter api fake-executor expire <boardId> <slug>`. O card continua
Rodando no Firestore até o quadro ser aberto; ao abrir, vira "Falhou" com "O agente não respondeu em 45 min.".

### Token do agente no connector MCP da nuvem (spec `agent-contract`, 2026-11-26)

**O que fazer:** decidir, na spec `cloud-routines-runner`, como a sessão agendada na nuvem recebe o token da execução.
As duas saídas são passar o token no próprio disparo de cada execução ou trocar o header por OAuth no servidor MCP.
Dono: `cloud-routines-runner`.

**Por quê:** o servidor MCP `kanban` (`POST /mcp`) autentica cada chamada com um token que vale para uma execução só
e muda a cada disparo. Um connector configurado uma vez na conta costuma guardar uma credencial fixa, então não acompanha
essa troca. O runner local não tem o problema: ele põe o token numa variável de ambiente da sessão que abre. O connector
também precisa da API em HTTPS público.

**O que acontece sem ele:** nada quebra hoje. Nenhuma sessão na nuvem dispara etapas ainda, e as rotas do agente
respondem `401 AGENT_TOKEN_INVALID` a quem chega sem token.

**Como verificar:** com a API publicada, uma sessão agendada chama `mcp__kanban__get_card` do card que a disparou e
recebe `200`; a mesma chamada com o token de uma execução já encerrada recebe `409 AGENT_RUN_CLOSED` (ferramentas de
escrita e leitura) ou `{ "ignored": true }` (`complete_stage`).

### Custo de Firestore do polling do runner local (spec `local-runner`, 2026-11-26)

**O que fazer:** antes de deixar mais de um runner ligado o dia inteiro no plano gratuito, decidir entre espaçar o
polling (`pnpm --filter runner cli start --poll-interval 30`) e passar o projeto para o plano Blaze.

**Por quê:** cada polling do runner custa três leituras de documento: o guard lê o runner, e a transação do `claim`
relê o runner e faz a consulta de `run`s (uma consulta sem resultado também conta uma leitura). O último contato é
gravado no máximo a cada 30 segundos. Com o intervalo padrão de 10 segundos, um runner ocioso faz por dia:

| | Conta | Por dia |
|---|---|---|
| Leituras | 86.400 s / 10 s × 3 | 25.920 |
| Escritas | 86.400 s / 30 s | 2.880 |

Somam-se as leituras da tela: cada leitura do quadro agora consulta os runners de quem lê, para decidir se a etapa
pode ser disparada.

A cota gratuita do Firestore Standard é de 50.000 leituras, 20.000 escritas e 20.000 exclusões de documento por dia,
renovada por volta da meia-noite no horário do Pacífico, e vale para um banco por projeto
([Firestore quotas](https://firebase.google.com/docs/firestore/quotas), consultada em 2026-11-26). Um runner ocioso
usa cerca de 52% da cota de leitura (25.920 de 50.000), e dois runners ligados o dia inteiro passam dela antes de
contar uma leitura da tela.

**Quando reavaliar o intervalo:** ao registrar um segundo runner que fica ligado o dia todo, ou quando o painel de
uso do Firestore mostrar mais de 40.000 leituras num dia (80% da cota). Qualquer um dos dois pede `--poll-interval 30`
ou o plano Blaze antes do dia seguinte.

**O que acontece sem isso:** no plano gratuito, a cota estourada faz o Firestore recusar leituras até a virada do
dia, e a API inteira para de responder, não só o runner. Com `--poll-interval 30`, um runner ocioso cai para cerca de
8.640 leituras por dia.

**Como verificar:** no console do Firebase, aba Uso do Firestore, comparar as leituras de um dia com um runner ligado
e de um dia sem.

### Roteiro com o `claude` real antes de declarar o G2 (spec `local-runner`, 2026-11-26)

**O que fazer:** rodar uma etapa de verdade pelo runner, sem o agente de teste, num repositório descartável.

1. Criar um repositório de teste com o kit aplicado (`node kit/apply.mjs`) e ruleset protegendo `main`.
2. Importar o repositório num board com a API apontando para o GitHub real.
3. Na máquina do runner, `claude` logado e `git push` funcionando para esse repositório.
4. `pnpm --filter runner cli register <código> --api <API>` e `pnpm --filter runner cli start`, sem
   `--agent-command` e sem `--repo-base`.
5. Arrastar uma spec pequena para Análise e conferir o `plan.md` commitado na branch do card, o relatório no card e o
   custo impresso no terminal do runner.

**Por quê:** os testes e o modo de teste exercitam todo o caminho com um agente falso que não gasta nada. Ninguém
rodou ainda uma sessão real do `claude -p` pelo runner, e é ela que mostra se o `--max-turns`, o `--mcp-config` com o
token e o modo de permissão `acceptEdits` se comportam como o runner espera.

**O que acontece sem isso:** o G2 do roadmap fica sem evidência.

**Como verificar:** o card chega a Concluído e a branch tem um commit por etapa.

### Chave das credenciais da nuvem (spec `execution-credentials`, 2026-11-27)

**O que fazer:** gerar a chave e gravá-la no ambiente da API de produção, no gerenciador de segredos do provedor,
nunca em arquivo versionado.

```bash
openssl rand -base64 32
```

O valor vai em `CREDENTIALS_ENCRYPTION_KEY`. Guarde uma cópia fora do provedor (num cofre de senhas, por exemplo):
perder a chave equivale a apagar todas as tarefas agendadas cadastradas.

**Por quê:** a Fire URL e o token de cada tarefa agendada ficam cifrados no Firestore com AES-256-GCM. A chave fica no
ambiente da API, separada do banco, para que um vazamento do Firestore sozinho não entregue os tokens. Fora do
emulador não há chave padrão.

**O que acontece sem ela:** a API sobe e o build passa. O boot imprime
`[credentials] CREDENTIALS_ENCRYPTION_KEY is not set: saving scheduled tasks is switched off.` (ou a versão de erro,
quando o valor não decodifica para 32 bytes). Em "Minhas credenciais", a seção da nuvem mostra "O cadastro na nuvem
está desligado neste ambiente." com as ações desabilitadas, e `PUT /boards/<id>/credentials/scheduled-tasks/<etapa>`
responde `503 CREDENTIALS_ENCRYPTION_NOT_CONFIGURED`. Runners locais e disparos funcionam como antes. Hoje nada roda
pela nuvem ainda (isso chega com a spec `cloud-routines-runner`), então a falta da chave não bloqueia nenhum fluxo.

**Trocar a chave:** tudo o que foi cifrado com a anterior deixa de abrir. O prefixo `v1` do valor guardado reserva
espaço para rotação com duas chaves, que ainda não existe; até lá, trocar a chave significa pedir a cada membro que
cadastre as tarefas de novo.

**Como verificar:** com a API publicada, `GET /boards/<id>/credentials` devolve `"cloudCredentialsEnabled": true`, e
cadastrar uma tarefa na tela muda a linha da etapa para "Cadastrada", com os quatro últimos caracteres do id e do
token. Na resposta do `PUT` e no documento `credential/<boardId>__<userId>__<etapa>` do Firestore, nem a URL nem o token
aparecem em claro.

---

## Ordem na primeira ida a produção

Projeto Firebase → service account → build passa → `CORS_ORIGIN` → deploy da API → publicar rules e
índices → login GitHub no domínio → GitHub App (o webhook precisa da API no ar) → branch protection →
storage, se for usar.

Referências: [`SETUP.md`](SETUP.md) (variáveis) · [`SECURITY.md`](SECURITY.md) (postura e comandos) ·
[`ARCHITECTURE.md`](ARCHITECTURE.md).
