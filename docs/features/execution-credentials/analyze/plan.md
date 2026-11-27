# Plano: Credenciais de execução por membro

- Spec: [`specs/features/execution-credentials.md`](../../../../specs/features/execution-credentials.md) (status
  `proposed`, fase 2)
- Slug: `execution-credentials`
- Data: 2026-11-27, rodada autônoma do `/cycle`. Nenhuma pergunta foi feita; as decisões estão em "Perguntas em
  aberto".
- **Por que rodou estando `proposed`:** o usuário pediu para levar o máximo de specs possível pelo `/cycle` nesta
  noite, e a auditoria de hoje recomendou aprovar esta depois da `pr-flow` (`specs/BACKLOG.md`, "Precisam de
  decisão"). O status da spec não muda: aprovar ou rejeitar é decisão dele.
- Base de código: branch `guilhermebittelbrunn/chore-overnight-cycle-specs`, já com `spec-authoring`, `app-cleanup`
  (guard `requireSessionApi` com `ctx.profile`, `requireBoardApi` por cima) e `pr-flow` (PR pelo bot do App,
  `dispatchAs` nos comentários de PR).

---

## Etapa 1: análise

### 1. Contexto

**Resumo.** Cada membro dispara etapas com a própria credencial do Claude. Boa parte do corte já foi entregue
pela `local-runner` e pela `board-members`. Este plano mede o que existe e planeja só a diferença: o cadastro
cifrado das tarefas agendadas por etapa (a credencial da nuvem) e a regra que respeita, no disparo, quais
executores cada etapa aceita.

#### 1.1 O corte de MVP medido no código

| Item do corte | Situação | Evidência |
|---------------|----------|-----------|
| `operator` passa a disparar | **Entregue** | `canTriggerStages` aceita `operator` ou acima (`packages/kanban-contract/src/roles.ts:47-49`); o guard mapeia a capacidade `trigger` para ela (`apps/api/(shared)/lib/board-access.ts:44`); a rota de disparo usa `requireBoardApi("trigger", …)` (`apps/api/app/(routes)/boards/[id]/cards/[slug]/runs/route.ts:16-17`); o app libera os botões pelo mesmo predicado (`boards/(pages)/[id]/BoardClient.tsx:223`) |
| No disparo, o orquestrador escolhe a credencial de quem disparou | **Entregue para o runner local** | `resolveExecutorFor(userId)` lê só os runners de quem disparou (`apps/api/(shared)/lib/orchestrator/executor-choice.ts:7-15`); `pumpBoard` resolve o executor por `run.triggeredBy.userId` (`orchestrator.ts:333-346`); um runner só pega `run` do próprio dono (`apps/api/(shared)/lib/runner/runner-claim.ts:32-34`) |
| … que sirva ao executor **da etapa** | **Falta** | O `board.yml` declara `runners` por etapa (`packages/kanban-contract/src/boardConfig.ts:57`, e `:37` na etapa de spec), mas nenhum código da API lê esse campo: `resolveStageExecutorMode` só recebe `hasOnlineRunner` (`executor-mode.ts:12-17`). Uma etapa com `runners: [cloud]` roda no runner local mesmo assim |
| Sem nenhuma credencial, recusa com o motivo no card | **Entregue em parte** | O arraste é recusado antes de entrar na fila com `RUN_EXECUTOR_UNAVAILABLE` 503 (`runs/route.ts:27-31`); um `run` na fila cuja pessoa ficou sem executor termina com `no_runner` (`orchestrator.ts:351-365`) e o card mostra o motivo (`boards/(components)/cardRunReason.ts:54-56`, copy em `translations/apps/app/pages/common/boards.ts:199-200`). Falta o motivo "nenhuma credencial sua serve a esta etapa", que hoje cai no texto de runner offline |
| `runs` registram quem disparou e qual credencial foi usada | **Entregue para o runner local** | `triggeredBy` (`run.mapper.ts:38`), `executor` (`:39`) e `runnerId`/`claimedAt` gravados na transação do `claim` (`run.mapper.ts:51-53`). A credencial da nuvem só passa a ser usada com o adapter da `cloud-routines-runner`, que grava o id dela no `run` |
| Coleção `credentials` com dono, tipo e referência cifrada | **Falta para a nuvem** | O runner local tem coleção própria com dono, hash do token e os quatro últimos caracteres (`runner.repository.ts`, `docs/board/ARCHITECTURE.md:93`). Não existe coleção para a tarefa agendada nem nenhuma cifra no repo: `node:crypto` só aparece para hash e HMAC (`run-token.ts:1`, `runner-code.ts:1`, `github-webhook-signature.ts:1`) |
| Tela "Minhas credenciais": runners e tarefas agendadas por etapa | **Entregue para runners; falta a nuvem** | `boards/(pages)/[id]/credentials/page.tsx` e `BoardCredentialsClient.tsx` listam, registram e revogam runners. A seção "Nuvem: tarefas agendadas por etapa" e o quadro "Segredos" do desenho (`docs/design/screenshots/Credentials.png`) não existem |
| Sinal de pronto: `operator` com runner próprio arrasta e os commits saem no nome dele | **Entregue** | O runner clona e faz push com o git da própria máquina (`docs/features/local-runner/analyze/plan.md:62`, regra 15 do mesmo plano) |

**Conclusão.** O que resta é:

1. **Tarefa agendada como credencial**: coleção nova, URL e token de disparo cifrados (AES-256-GCM com
   `node:crypto`), rotas para cadastrar, trocar e remover, e a seção da nuvem na tela.
2. **A etapa decide quem a serve**: a escolha do executor passa a respeitar `stage.runners`, e o card ganha o
   motivo `no_credential` quando nada de quem disparou serve àquela etapa.

**Ressalva de valor.** Sem o adapter da `cloud-routines-runner`, uma tarefa agendada cadastrada ainda não roda
nada. O corte da spec pede o cadastro e a cifragem aqui; o disparo pela nuvem é da outra spec, que depende desta
(`specs/features/cloud-routines-runner.md:11`). A tela diz isso com todas as letras (ver 5.3) e a pergunta P1
deixa a alternativa registrada.

**Problema.** Para outro membro arrastar um card e disparar a etapa, a execução tem de rodar com a credencial
dele. O runner local já resolve isso. A nuvem ainda não tem onde guardar a credencial de cada pessoa, e o
`board.yml` não tem como dizer "esta etapa só roda no runner local" (ou só na nuvem) com efeito.

**Objetivos.**

- Um membro com papel efetivo `operator` ou acima cadastra, por etapa do board, a URL e o token da tarefa
  agendada dele. A API guarda os dois cifrados e nunca os devolve; a tela mostra só os últimos caracteres.
- O disparo só escolhe um executor que a etapa aceita. Quando nenhum serve, o arraste é recusado com um código
  próprio e o `run` na fila termina com `no_credential`, com o motivo no card.
- Sem a chave de cifra no ambiente, a API sobe, a tela mostra o cadastro desligado e as rotas de escrita
  respondem `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED`, nunca 500.

**Fora de escopo.**

- API key do board como fallback (fora do corte da spec, fase 4).
- O adapter que dispara a tarefa agendada, o executor `cloud`, os erros 401/429 no card e a URL da sessão no
  `run` (`cloud-routines-runner`).
- A coluna "Conferida" do desenho: a API de tarefas agendadas não tem como conferir um token sem disparar uma
  sessão (o `/fire` inicia uma sessão a cada chamada, `code.claude.com/docs/en/routines`). A conferência chega com
  o adapter, que grava o resultado do disparo real. Ver P4.
- A tela "Operador sem credencial" com dois cartões lado a lado (`CredentialsEmpty.png`): a página atual já mostra
  o painel de registro quando a lista está vazia. Ver P6.
- Mover os runners para a coleção nova: o runner guarda só hash e nunca precisa ler o segredo de volta
  (`docs/features/local-runner/analyze/plan.md:643`, D6).
- Tarefa agendada para a etapa de escrita de spec (`spec`, coluna Rascunhos). A tabela lista só `config.stages`.
  Ver P5.

**Corte de MVP (o desta tarefa).** A menor fatia observável:

1. Em "Minhas credenciais", a seção "Nuvem: tarefas agendadas por etapa" lista as etapas do board, com a situação
   de cada uma (cadastrada, não cadastrada, só no runner local), o final da URL e do token, e as ações cadastrar,
   trocar e remover.
2. Um `board.yml` com `runners: [cloud]` numa etapa faz o arraste nessa coluna ser recusado com
   `RUN_NO_CREDENTIAL_FOR_STAGE`, mesmo com runner online, e um `run` dela na fila termina com `no_credential`.

**Apps impactados.** `packages/kanban-contract` (tipos da credencial, formato da URL, regra de escolha, motivo
novo), `packages/sdk` (recurso `boardCredential`), `apps/api` (cifra, coleção, rotas, escolha por etapa),
`apps/app` (seção da nuvem, motivo no card), `packages/internationalization` (textos e `apiErrors`). Sem mudança
em `apps/runner`.

**Guard e papel.** Rotas sob o board, com `requireBoardApi` (regra 13: papel efetivo resolvido antes de agir).
Listar: `view` (todo membro vê a própria linha; um `viewer` vê a tabela sem ações). Cadastrar, trocar e remover:
`trigger` (`operator` ou acima), porque a credencial só serve a quem dispara.

#### 1.2 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/execution-credentials.md` | Corte de MVP, fora do corte, risco (vazamento de token), pergunta da chave no env |
| `specs/features/cloud-routines-runner.md` | O adapter, o 401/429 e a URL da sessão ficam lá; ela também cita o cadastro da URL e do token (sobreposição, P1) |
| `docs/board/ACCESS.md:46-56` | Ordem de escolha: credencial de quem disparou que sirva ao executor da etapa; API key do board; recusa com motivo |
| `docs/board/ARCHITECTURE.md:73-95` | Executores e credenciais; linha `credentials` (dono, tipo, referência cifrada, última verificação) |
| `docs/board/DECISIONS.md:138-139` | Credencial de quem disparou; nuvem por tarefas agendadas na fase 2 |
| `docs/board/ROADMAP.md:19,75` | Fase 2: disparo com a credencial de cada membro |
| `docs/features/local-runner/analyze/plan.md` | Runner como credencial local, hash em vez de cifra (D6), tela mínima que esta spec completa (D4) |
| `docs/features/orchestrator/`, `agent-contract/`, `pr-flow/` | `pumpBoard`, `tick`, `findUnclaimed`, `dispatchAs` |
| `.claude/cycle-policy.md` | Sem dependência nova, modo degradado testado, string vazia é ausência, pendência de infra no `PRE-PRODUCTION.md` |
| `docs/design/screenshots/Credentials.png`, `CredentialsEmpty.png`, `TriggerStage.png` | Conteúdo da tabela da nuvem (etapa, situação, URL de disparo, conferida, ação), quadro "Segredos" |
| [Automate work with scheduled tasks](https://code.claude.com/docs/en/routines) (coletado 2026-11-27) | Fire URL `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`, token `sk-ant-oat01-…` mostrado uma vez, um token por tarefa, sem conferência sem disparar, research preview |

### 2. Dados (Firestore)

#### 2.1 Coleção `credential` (nova)

Nome no singular, como `run`, `runner` e `cardEvent` (`run.mapper.ts:20`). O `ARCHITECTURE.md:95` diz
`credentials`; a doc é corrigida junto (ver P2).

Um documento por pessoa, board e etapa. O id é determinístico, `${boardId}__${userId}__${stageKey}`: cadastrar
de novo é um `set` no mesmo documento, sem consulta prévia e sem duplicata. `stageKey` segue `STAGE_KEY` e os ids
do Firestore não têm `/`, então o id passa em `isUsableDocumentId` (`apps/api/(shared)/lib/pagination.ts:18-26`).

| Campo | Tipo | Default | `null`? | Por quê |
|-------|------|---------|---------|---------|
| `userId` | string | — | não | Dono (id do perfil, como `runner.userId`) |
| `boardId` | string | — | não | A tarefa agendada roda num repositório; a credencial vale para um board |
| `stageKey` | string | — | não | Uma tarefa por etapa (corte da spec) |
| `kind` | `"scheduled_task"` | — | não | Tipo; a API key do board entra aqui na fase 4 |
| `sealed` | string | — | não | URL e token cifrados juntos (`v1.<iv>.<tag>.<cifra>`, base64url). Nunca sai do repositório |
| `triggerIdLast4` | string | — | não | Últimos 4 caracteres do id `trig_…`, para a tela |
| `tokenLast4` | string | — | não | Últimos 4 caracteres do token, para a tela |
| `lastCheckedAt` | Timestamp | `null` | sim | Reservado para o adapter (conferência real); esta spec só grava `null` |
| `lastCheckStatus` | `"ok" \| "rejected"` | `null` | sim | Idem |
| `createdAt`, `updatedAt` | Timestamp | agora | não | Padrão do `BaseRepository` |
| `deletedAt` | Timestamp | `null` | sim | Remover é soft delete; cadastrar de novo limpa o campo |

A cifra usa como dado autenticado (AAD) o id do documento. Um `sealed` copiado para o documento de outra pessoa
não abre.

#### 2.2 Consultas

- Listar as da pessoa no board: `where("boardId","==").where("userId","==")`, filtro de `deletedAt === null` em
  memória. Só igualdades, servidas pelos índices de campo único; não precisa de índice composto.
- Ler, trocar e remover: `doc(id)` direto.

O volume é de no máximo uma credencial por etapa por pessoa, então o limite do `BaseRepository` (sem paginação,
filtro em memória) não pesa.

#### 2.3 Dados existentes

Coleção nova; nada a migrar. O campo `runners` das etapas já existe no `board.yml` com default `["local","cloud"]`
(`boardConfig.ts:57`), então boards atuais seguem iguais: toda etapa aceita o runner local.

`RUN_END_REASONS` ganha `no_credential`. O mapper lê o motivo com `oneOf(...)` (`run.mapper.ts:164` para
`executor`, mesmo padrão), então `run`s antigos continuam válidos.

### 3. Contrato

#### 3.1 `@repo/kanban-contract`

Arquivo novo `src/credential.ts`, exportado no `index.ts`:

- `CREDENTIAL_KINDS = ["local_runner", "scheduled_task"]` e o tipo `CredentialKind`.
- `SCHEDULED_TASK_FIRE_URL`: regex de `https://api.anthropic.com/v1/claude_code/routines/<id>/fire`, com o id em
  `trig_[A-Za-z0-9]+`. Só esse host: a API vai fazer `POST` nessa URL com o token, então aceitar outro host abriria
  SSRF a partir do servidor.
- `scheduledTaskInputSchema` (Zod): `{ fireUrl, token }`, URL validada pela regex, token `trim().min(20).max(512)`.
- `scheduledTaskIdOf(fireUrl)` devolve o `trig_…`.
- `stageAcceptsRunner(stage, kind)`: `stage.runners.includes(kind)`.
- `chooseStageExecutor({ stageRunners, hasOnlineRunner, emulated })` devolve
  `{ ok: true, executor: StageExecutorKind } | { ok: false, refusal: "no_executor" | "stage_not_served" }`:
  - `local` quando a etapa aceita `local` e a pessoa tem runner online;
  - `fake` só no emulador, quando a etapa aceita `local` ou `cloud` (o falso faz as vezes dos dois);
  - `stage_not_served` quando a pessoa tem runner online e a etapa não aceita `local`;
  - `no_executor` nos outros casos.

  A nuvem entra aqui na `cloud-routines-runner`, com mais um campo de entrada.

Em `src/run.ts`: `RUN_END_REASONS` ganha `"no_credential"`.

#### 3.2 `@repo/sdk`

`src/types/board/credential.ts`:

```ts
export type ScheduledTaskCredentialDTO = {
    stageKey: string;
    triggerIdLast4: string;
    tokenLast4: string;
    lastCheckedAt: string | null;
    lastCheckStatus: "ok" | "rejected" | null;
    updatedAt: string;
};

export type BoardCredentialsDTO = {
    cloudCredentialsEnabled: boolean;
    scheduledTasks: ScheduledTaskCredentialDTO[];
};

export type SaveScheduledTaskRequest = { fireUrl: string; token: string };
```

`src/actions/boardCredential/action.ts` (`list(boardId)`, `saveScheduledTask(boardId, stageKey, body)`,
`removeScheduledTask(boardId, stageKey)`), registrado no client como `boardCredential`, no molde de
`boardMember`. Nenhuma assinatura existente muda; nada quebra.

### 4. API

#### 4.1 Rotas

| Método e caminho | Capacidade | Corpo → resposta |
|------------------|-----------|------------------|
| `GET /boards/:id/credentials` | `view` | → `200 { data: BoardCredentialsDTO }`, só as da pessoa |
| `PUT /boards/:id/credentials/scheduled-tasks/:stageKey` | `trigger` | `SaveScheduledTaskRequest` → `200 { data: ScheduledTaskCredentialDTO }` |
| `DELETE /boards/:id/credentials/scheduled-tasks/:stageKey` | `trigger` | → `204` |

Ownership: `userId` vem sempre de `ctx.profile.id`, nunca do corpo. Ninguém lê nem remove a credencial de outra
pessoa, nem o `owner`.

#### 4.2 Cifra (`apps/api/(shared)/lib/credentials/secret-box.ts`)

- `credentialsKey(variables)` devolve `Buffer | null`:
  - `CREDENTIALS_ENCRYPTION_KEY` em base64 que decodifica para 32 bytes → a chave;
  - vazio e `isEmulated()` → uma chave fixa de desenvolvimento, que só vale contra o projeto `demo-*` do emulador,
    no mesmo espírito do cliente GitHub falso (`github-app-config.ts:31-42`);
  - vazio fora do emulador, ou valor inválido em qualquer ambiente → `null` (cadastro desligado).
- `sealSecret(key, plaintext, aad)`: `createCipheriv("aes-256-gcm", key, iv)` com IV de 12 bytes de
  `randomBytes`, `setAAD(aad)`, devolve `v1.<iv>.<tag>.<cifra>` em base64url.
- `openSecret(key, sealed, aad)`: o inverso; tag inválida, AAD trocado ou versão desconhecida → `null`. Esta spec
  só usa o `openSecret` nos testes; quem o chama em produção é o adapter da nuvem.
- O texto cifrado é `JSON.stringify({ fireUrl, token })`.

Sem dependência nova: `node:crypto` já está em uso na API (`run-token.ts:1`).

`instrumentation.ts` ganha um aviso de boot no molde do GitHub (`instrumentation.ts:46-56`): chave ausente fora do
emulador → "cadastro de tarefas agendadas desligado"; chave inválida → o mesmo aviso com o motivo. A API sobe nos
dois casos.

#### 4.3 Persistência

`credential.mapper.ts` (`CREDENTIAL_TABLE = "credential"`, `CredentialRecord`, `toScheduledTaskCredentialDTO`) e
`credential.repository.ts` (estende `BaseRepository`, `super(db, CREDENTIAL_TABLE, credentialMapper)`):
`listOwned(boardId, userId)`, `saveScheduledTask(input)` (`set` com `createdAt` preservado se o documento
existe), `removeOwned(boardId, userId, stageKey)`.

O `CredentialRecord` que circula pela API **não** carrega `sealed`. Como o token do `run`
(`run.mapper.ts:195-208`, `toRunTokenState`), o segredo é lido à parte por `findSealed(id)`, que só o adapter
vai chamar.

#### 4.4 Escolha do executor por etapa

`executor-choice.ts`:

- `resolveExecutorFor(userId, now, stage?)`: sem `stage`, o comportamento atual (o board diz se a pessoa tem algum
  executor, usado na vista do board e na lista). Com `stage`, chama `chooseStageExecutor` com `stage.runners`.
- `executorsForUsers` vira `executorsForRuns(runs, config, now)`: lê os runners uma vez por pessoa e decide por
  `run` com a etapa dele (`config.stages` pelo `stageKey`; a etapa `spec` pelo `config.specAuthoring`).

Pontos que passam a etapa:

| Onde | Hoje | Depois |
|------|------|--------|
| `runs/route.ts:27` | `resolveExecutorFor(profile.id)` | com a etapa do corpo; `stage_not_served` → `RUN_NO_CREDENTIAL_FOR_STAGE` 409, `no_executor` → `RUN_EXECUTOR_UNAVAILABLE` 503 (inalterado) |
| `drafts/route.ts:37` | idem | com a etapa de spec |
| `orchestrator.ts:304` (`resumeAfterAnswer`) | idem | com a etapa do card |
| `pumpBoard` (`orchestrator.ts:341-365`) | `no_runner` quando o executor é `null` | `no_credential` quando a escolha recusa; `no_runner` fica só para o `run` local que nenhum runner pegou a tempo (`tick`, `orchestrator.ts:466-477`) |

A vista do board (`board-view.ts`, `board-list.ts`) segue com o executor "de qualquer etapa", sem mudança.

#### 4.5 Erros

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED` | 503 | `PUT` sem chave de cifra utilizável |
| `CREDENTIAL_STAGE_NOT_FOUND` | 404 | `stageKey` que não está em `config.stages` |
| `CREDENTIAL_STAGE_NOT_CLOUD` | 409 | a etapa não aceita `cloud` no `board.yml` |
| `CREDENTIAL_FIRE_URL_INVALID` | 422 | URL fora do formato `SCHEDULED_TASK_FIRE_URL` |
| `CREDENTIAL_NOT_FOUND` | 404 | `DELETE` sem credencial viva da pessoa naquela etapa |
| `RUN_NO_CREDENTIAL_FOR_STAGE` | 409 | disparo numa etapa que nenhum executor da pessoa serve |
| `VALIDATION_ERROR` | 422 | corpo fora do schema (token curto, campo faltando), pelo `parseRequestJson` + Zod de sempre |

Todos entram em `apiErrors` (`translations/packages/shared/utils.ts`).

### 5. Front-end (`apps/app`)

#### 5.1 Rotas e prefetch

Sem rota nova. `boards/(pages)/[id]/credentials/page.tsx` acrescenta ao `Promise.all` do prefetch
`queryKeys.boards.credentials(id)` → `client.boardCredential.list(id)`.

#### 5.2 Dados

- `queryKeys.boards.credentials(id)` (`apps/app/shared/lib/queryKeys.ts`, junto de `members`).
- `useListBoardCredentials(boardId)` + `fetchBoardCredentials` em `boards/(hooks)/useListBoardCredentials.tsx`.
- `useBoardCredentialCrud(boardId)` em `boards/(hooks)/useBoardCredentialCrud.tsx`: `saveMutation` e
  `removeMutation`, que atualizam o cache com `setQueryData` (mesmo padrão do `revokeMutation` dos runners).

#### 5.3 Tela

Seção nova abaixo dos runners em `BoardCredentialsClient.tsx`, componente `ScheduledTaskTable.tsx`:

| Coluna | Conteúdo |
|--------|----------|
| Etapa | `stage.column` |
| Situação | `Badge`: "Cadastrada" · "Não cadastrada" · "Só no runner local" (etapa sem `cloud` em `runners`) |
| URL de disparo | `…/routines/••••<triggerIdLast4>` em mono; texto "o board.yml não permite nuvem" quando for o caso |
| Token | `terminando em <tokenLast4>` |
| Ação | "Cadastrar" ou "Trocar" + "Remover" (só com `canTriggerStages(effectiveRole)` e cadastro ligado) |

Em 390 px a tabela vira lista de linhas empilhadas (o `Table` do design system já faz rolagem; preferir
`flex-col` por linha para não haver rolagem horizontal da página).

- `ScheduledTaskDialog.tsx`: formulário RHF com `HookFormInput` para a Fire URL e `HookFormInput type="password"`
  para o token, resolver com o `scheduledTaskInputSchema` do contrato, erro pela prop `error`. Ao salvar, o diálogo
  fecha e o token some do estado do formulário (`reset`).
- `RemoveScheduledTaskDialog.tsx`: confirmação.
- Descrição da seção, honesta sobre o estado atual (ver P1): a tarefa agendada fica guardada para o executor da
  nuvem; por enquanto as etapas rodam no runner local.
- `cloudCredentialsEnabled === false`: aviso "O cadastro na nuvem está desligado neste ambiente" e ações
  desabilitadas.
- Quadro "Segredos" na coluna lateral, abaixo de "Com que credencial cada disparo roda", com o texto do desenho.

Estados: carregando (o `Container` já trata), lista vazia (todas "Não cadastrada"), erro (`handleClientError`),
`viewer` (sem ações).

#### 5.4 Motivo no card

`cardRunReason.ts`: `endReason === "no_credential"` → "Você não tem credencial que sirva a {column}. Veja Minhas
credenciais." com a coluna da etapa do `run`. O toast do arraste recusado sai do `apiErrors` de
`RUN_NO_CREDENTIAL_FOR_STAGE`.

### 6. i18n (pt-br)

Em `translations/apps/app/pages/common/boards.ts`, dentro de `credentials`:

```ts
cloud: {
    title: "Nuvem: tarefas agendadas por etapa",
    description:
        "Uma tarefa agendada do Claude Code, com gatilho de API, para cada etapa. O board guarda a URL e o token cifrados. Por enquanto as etapas rodam só no runner local.",
    disabled: "O cadastro na nuvem está desligado neste ambiente.",
    columns: { stage: "Etapa", status: "Situação", url: "URL de disparo", token: "Token", action: "Ação" },
    status: { saved: "Cadastrada", missing: "Não cadastrada", localOnly: "Só no runner local" },
    localOnlyHint: "o board.yml não permite nuvem",
    urlHint: "…/routines/••••{last4}",
    tokenEnding: "terminando em {last4}",
    add: "Cadastrar",
    replace: "Trocar",
    remove: "Remover",
    addAria: "Cadastrar a tarefa agendada de {stage}",
    replaceAria: "Trocar a tarefa agendada de {stage}",
    removeAria: "Remover a tarefa agendada de {stage}",
    dialog: {
        title: "Tarefa agendada de {stage}",
        description: "Cole a Fire URL e o token do gatilho de API da tarefa. O token aparece uma vez só no Claude Code.",
        fireUrl: "Fire URL",
        fireUrlPlaceholder: "https://api.anthropic.com/v1/claude_code/routines/trig_…/fire",
        token: "Token",
        save: "Salvar",
        saving: "Salvando…",
        cancel: "Cancelar",
        saved: "Tarefa agendada de {stage} salva.",
    },
    removeDialog: {
        title: "Remover a tarefa agendada de {stage}?",
        description: "O board apaga a URL e o token guardados. A tarefa continua existindo no Claude Code.",
        confirm: "Remover",
        cancel: "Cancelar",
        removed: "Tarefa agendada de {stage} removida.",
    },
},
secrets: {
    title: "Segredos",
    body: "Tokens e URLs de disparo ficam cifrados na API. Aqui você vê só os últimos caracteres e pode remover a qualquer hora.",
},
```

`runReason.noCredential: "Você não tem credencial que sirva a {column}. Veja Minhas credenciais."`

`apiErrors`:

```ts
CREDENTIALS_ENCRYPTION_NOT_CONFIGURED: "O cadastro de credenciais da nuvem está desligado neste ambiente.",
CREDENTIAL_STAGE_NOT_FOUND: "Esta etapa não existe no board.",
CREDENTIAL_STAGE_NOT_CLOUD: "O board.yml não permite nuvem nesta etapa.",
CREDENTIAL_FIRE_URL_INVALID: "Use a Fire URL do gatilho de API da tarefa agendada.",
CREDENTIAL_NOT_FOUND: "Credencial não encontrada.",
RUN_NO_CREDENTIAL_FOR_STAGE: "Nenhuma credencial sua serve a esta etapa. Veja Minhas credenciais.",
```

### 7. Autorização e segurança

- Regra 13: as três rotas passam por `requireBoardApi`; escrita exige `trigger`. Quem perdeu o repositório recebe
  `BOARD_REPOSITORY_ACCESS_LOST` antes do handler (`board-access.ts:189-191`).
- Regra 15: `sealed` não está no `CredentialRecord` nem no DTO; a resposta do `PUT` traz só os finais. O teste de
  rota confere que nem a URL nem o token aparecem no JSON de resposta.
- O token não vai para log: o handler registra `logEvent("credential", "saved", { boardId, stageKey })` sem
  valores.
- Chave fora do repositório: só no env de produção; a de desenvolvimento só vale com `isEmulated()`.
- SSRF: a URL só é aceita no host `api.anthropic.com` e no caminho `/v1/claude_code/routines/trig_…/fire`.
- Remover um membro não apaga as credenciais dele, mas ninguém mais consegue usá-las: a escolha é sempre pela
  pessoa que disparou, e quem saiu do board não dispara. Limpar na remoção fica como P7.
- Firestore rules: a negação padrão (`firestore.rules`) cobre a coleção nova; nada a mudar.
- Regra de uso próprio da assinatura (`ACCESS.md:56`): a credencial é sempre a de quem disparou; esta spec não
  cria caminho para usar a de outra pessoa.

### 8. Testes (Vitest)

| Teste | Nível | Prova |
|-------|-------|-------|
| `kanban-contract/__tests__/credential.test.ts` | unitário | `scheduledTaskInputSchema` aceita a Fire URL real e recusa outro host, `http`, caminho sem `/fire`, id sem `trig_`; `chooseStageExecutor` nas combinações (online × `runners` × emulado) |
| `kanban-contract/__tests__/run.test.ts` | unitário | `no_credential` em `RUN_END_REASONS` |
| `api/__tests__/secretBox.test.ts` | unitário | ida e volta; AAD trocado, tag alterada e versão desconhecida dão `null`; chave de 31 bytes, base64 inválido e string vazia fora do emulador dão `null`; vazio no emulador dá a chave de dev |
| `api/__tests__/credentialMapper.test.ts` | unitário | `Timestamp` → ISO; o DTO não tem `sealed` |
| `api/__tests__/boardCredentialsRoutes.test.ts` | rota com `vi.mock` do repositório e do `resolveBoardAccess` | `GET` só da pessoa; `PUT` 422/404/409/503, 200 sem URL nem token no corpo; `DELETE` 204 e 404; `viewer` recebe 403 no `PUT` |
| `api/__tests__/stageExecutorMode.test.ts` (existe) | unitário | atualizado para a escolha por etapa |
| `api/__tests__/orchestratorTick.test.ts` ou `orchestratorRuns` (mock) | unitário | `pumpBoard` termina com `no_credential` uma etapa `runners: [cloud]`; `tick` segue com `no_runner` para o não pego |
| `api/__tests__/triggerStageRoute` (rota existente de runs, mock) | rota | `RUN_NO_CREDENTIAL_FOR_STAGE` 409 com runner online e etapa sem `local` |
| `app/__tests__/cardRunReason.test.ts` | unitário | texto de `no_credential` com a coluna |
| `app/__tests__/apiErrorCopy.test.ts` (existe) | unitário | cobre os códigos novos sem mudança |

Nenhum teste contra o emulador: não há consulta que dependa de índice composto nem regra de segurança nova. O
`Timestamp` do documento é coberto no mapper.

### 9. O que o `/test` vai percorrer

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, sem `CREDENTIALS_ENCRYPTION_KEY` (vale a chave de dev do
emulador).

1. **Cadastrar.** Como dono, abrir Minhas credenciais. A seção da nuvem lista as etapas do `board.yml` de exemplo,
   todas "Não cadastrada". Cadastrar a de Análise com uma Fire URL no formato real e um token de teste qualquer
   (inventado na hora, nunca gravado em arquivo). A linha vira "Cadastrada", com `••••` e os 4 finais do id e do
   token.
2. **URL inválida.** Cadastrar com `https://example.com/fire` → erro no campo, nada salvo.
3. **Trocar e remover.** Trocar o token (os 4 finais mudam); remover (volta a "Não cadastrada").
4. **Segredo não volta.** Conferir na aba de rede que a resposta do `GET` e do `PUT` não traz a URL nem o token.
5. **Viewer.** Entrar como membro `viewer` do seed: a tabela aparece sem ações.
6. **Cadastro desligado.** Subir a API com `CREDENTIALS_ENCRYPTION_KEY=invalida`: aviso de boot, a seção mostra
   "desligado" e as ações ficam desabilitadas; `PUT` direto responde 503 com o código.
7. **Etapa que o runner não serve.** Só por teste de rota e de unidade: o `board.yml` do cliente GitHub falso não
   tem etapa `runners: [cloud]`, e mudar a fixture para o QA está fora do diff. Registrar no relatório.
8. Temas claro e escuro, e 390 px (sem rolagem horizontal da página).

---

## Etapa 2: blueprint técnico

### Contrato

```ts
// packages/kanban-contract/src/credential.ts
import { z } from "zod";
import type { RunnerKind, StageConfig } from "./boardConfig";
import type { StageExecutorKind } from "./run";

export const CREDENTIAL_KINDS = ["local_runner", "scheduled_task"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

// The board POSTs the token to this URL later, so any other host would let a member point the API anywhere.
export const SCHEDULED_TASK_FIRE_URL =
    /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/(trig_[A-Za-z0-9]+)\/fire$/;

export const scheduledTaskInputSchema = z.object({
    fireUrl: z.string().trim().regex(SCHEDULED_TASK_FIRE_URL),
    token: z.string().trim().min(20).max(512),
});
export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

export function scheduledTaskIdOf(fireUrl: string): string | null {
    return SCHEDULED_TASK_FIRE_URL.exec(fireUrl)?.[1] ?? null;
}

export function stageAcceptsRunner(
    stage: Pick<StageConfig, "runners">,
    kind: RunnerKind
): boolean {
    return stage.runners.includes(kind);
}

export type StageExecutorChoice =
    | { ok: true; executor: StageExecutorKind }
    | { ok: false; refusal: "no_executor" | "stage_not_served" };

export function chooseStageExecutor(input: {
    stageRunners: readonly RunnerKind[];
    hasOnlineRunner: boolean;
    emulated: boolean;
}): StageExecutorChoice {
    const acceptsLocal = input.stageRunners.includes("local");
    if (acceptsLocal && input.hasOnlineRunner) {
        return { ok: true, executor: "local" };
    }
    const fakeServes = acceptsLocal || input.stageRunners.includes("cloud");
    if (input.emulated && fakeServes) {
        return { ok: true, executor: "fake" };
    }
    return {
        ok: false,
        refusal: input.hasOnlineRunner ? "stage_not_served" : "no_executor",
    };
}
```

`RunnerKind` ainda não existe: exportar `type RunnerKind = z.infer<typeof runnerKindSchema>` em `boardConfig.ts` (o schema está na linha 25).

### Rota

```ts
// apps/api/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts
type Params = { id: string; stageKey: string };

export const PUT = requireBoardApi<Params>("trigger", async (req, ctx) => {
    const key = credentialsKey(process.env);
    if (!key) {
        return errorResponse("CREDENTIALS_ENCRYPTION_NOT_CONFIGURED", HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
    const stage = ctx.board.config.stages.find((item) => item.key === ctx.params.stageKey);
    if (!stage) {
        return errorResponse("CREDENTIAL_STAGE_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    if (!stageAcceptsRunner(stage, "cloud")) {
        return errorResponse("CREDENTIAL_STAGE_NOT_CLOUD", HTTP_STATUS.CONFLICT);
    }
    const body = await parseRequestJson(req);
    if (!body.ok) {
        return body.response;
    }
    const parsed = parseSaveScheduledTask(body.value); // URL fora do formato → CREDENTIAL_FIRE_URL_INVALID 422
    if (!parsed.ok) {
        return parsed.response;
    }
    const saved = await credentialRepository.saveScheduledTask({
        boardId: ctx.board.id,
        userId: ctx.profile.id,
        stageKey: stage.key,
        input: parsed.value,
        key,
        now: new Date(),
    });
    logEvent("credential", "saved", { boardId: ctx.board.id, stageKey: stage.key });
    return Response.json({ data: toScheduledTaskCredentialDTO(saved) });
});

export const DELETE = requireBoardApi<Params>("trigger", async (_req, ctx) => {
    const removed = await credentialRepository.removeOwned(ctx.board.id, ctx.profile.id, ctx.params.stageKey, new Date());
    if (!removed) {
        return errorResponse("CREDENTIAL_NOT_FOUND", HTTP_STATUS.NOT_FOUND);
    }
    return new Response(null, { status: 204 });
});
```

O `credentialsKey` recebe `env` (`@/env`) no código final; `process.env` acima só ilustra, como no
`github-app-config.ts`, que recebe as variáveis por parâmetro para o aviso de boot.

```ts
// apps/api/app/(routes)/boards/[id]/credentials/route.ts
export const GET = requireBoardApi("view", async (_req, ctx) => {
    const records = await credentialRepository.listOwned(ctx.board.id, ctx.profile.id);
    return Response.json({
        data: {
            cloudCredentialsEnabled: credentialsKey(env) !== null,
            scheduledTasks: records.map(toScheduledTaskCredentialDTO),
        },
    });
});
```

Exemplo:

```http
PUT /boards/b1/credentials/scheduled-tasks/analyze
{ "fireUrl": "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGH/fire", "token": "<token de teste>" }

200 { "data": { "stageKey": "analyze", "triggerIdLast4": "EFGH", "tokenLast4": "…", "lastCheckedAt": null,
                "lastCheckStatus": null, "updatedAt": "2026-11-27T05:00:00.000Z" } }
```

### Persistência

```ts
// documento credential/b1__u1__analyze
{
  userId: "u1", boardId: "b1", stageKey: "analyze", kind: "scheduled_task",
  sealed: "v1.<iv>.<tag>.<cifra>",
  triggerIdLast4: "EFGH", tokenLast4: "x9Qa",
  lastCheckedAt: null, lastCheckStatus: null,
  createdAt: Timestamp, updatedAt: Timestamp, deletedAt: null
}
```

```ts
// apps/api/(shared)/lib/credentials/secret-box.ts
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function sealSecret(key: Buffer, plaintext: string, aad: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), body]
        .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
        .join(".");
}

export function openSecret(key: Buffer, sealed: string, aad: string): string | null {
    const [version, iv, tag, body] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || !body) return null;
    try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}
```

### Pseudo-diffs

```diff
 // packages/kanban-contract/src/run.ts
 export const RUN_END_REASONS = [
     "agent", "timeout", "dispatch_failed", "stopped", "no_runner",
+    "no_credential",
 ] as const;
```

```diff
 // apps/api/(shared)/lib/orchestrator/executor-mode.ts
-export function resolveStageExecutorMode(input: { hasOnlineRunner: boolean }): StageExecutorKind | null {
-    if (input.hasOnlineRunner) return "local";
-    return isEmulated() ? "fake" : null;
-}
+export function resolveStageExecutorMode(input: {
+    hasOnlineRunner: boolean;
+    stageRunners?: readonly RunnerKind[];
+}): StageExecutorChoice {
+    return chooseStageExecutor({
+        stageRunners: input.stageRunners ?? ["local", "cloud"],
+        hasOnlineRunner: input.hasOnlineRunner,
+        emulated: isEmulated(),
+    });
+}
```

`getStageExecutor` (`executor.ts:37`) passa a perguntar `isEmulated()` direto em vez de chamar
`resolveStageExecutorMode({ hasOnlineRunner: false })`.

```diff
 // apps/api/(shared)/lib/orchestrator/executor-choice.ts
-export async function resolveExecutorFor(userId: string, now = new Date()): Promise<StageExecutorKind | null> {
+export async function chooseExecutorFor(
+    userId: string,
+    now = new Date(),
+    stage?: { runners: readonly RunnerKind[] }
+): Promise<StageExecutorChoice> {
     const runners = await runnerRepository.listByUser(userId);
-    return resolveStageExecutorMode({ hasOnlineRunner: runners.some(...) });
+    return resolveStageExecutorMode({
+        hasOnlineRunner: runners.some((runner) => isRunnerOnline(runner, now)),
+        stageRunners: stage?.runners,
+    });
 }
+
+export async function resolveExecutorFor(userId: string, now = new Date()): Promise<StageExecutorKind | null> {
+    const choice = await chooseExecutorFor(userId, now);
+    return choice.ok ? choice.executor : null;
+}
```

```diff
 // apps/api/app/(routes)/boards/[id]/cards/[slug]/runs/route.ts
-        if ((await resolveExecutorFor(ctx.profile.id)) === null) {
-            return errorResponse("RUN_EXECUTOR_UNAVAILABLE", HTTP_STATUS.SERVICE_UNAVAILABLE);
-        }
+        const stage = ctx.board.config.stages.find((item) => item.key === parsed.value.stageKey);
+        const choice = await chooseExecutorFor(ctx.profile.id, new Date(), stage);
+        if (!choice.ok) {
+            return choice.refusal === "stage_not_served"
+                ? errorResponse("RUN_NO_CREDENTIAL_FOR_STAGE", HTTP_STATUS.CONFLICT)
+                : errorResponse("RUN_EXECUTOR_UNAVAILABLE", HTTP_STATUS.SERVICE_UNAVAILABLE);
+        }
```

Etapa desconhecida continua chegando ao `triggerStage`, que já recusa com o código dele; com `stage` indefinido a
escolha usa o default `["local","cloud"]`.

```diff
 // apps/api/(shared)/lib/orchestrator/orchestrator.ts (pumpBoard)
-    const byUser = await executorsForUsers(queuedBy, now);
+    const choices = await executorsForRuns(queued, board.config, now);
     const started = await runRepository.promote({
         ...
-        executorFor: (run) => byUser.get(run.triggeredBy.userId) ?? null,
+        executorFor: (run) => {
+            const choice = choices.get(run.id);
+            return choice?.ok ? choice.executor : null;
+        },
     });
     for (const run of started) {
         ...
         if (executor === null) {
-            logEvent("orchestrator", "no_runner", ...);
-            await completeRun({ ..., endReason: "no_runner", now });
+            logEvent("orchestrator", "no_credential", ...);
+            await completeRun({ ..., endReason: "no_credential", now });
```

`promote` recebe a configuração guardada (`stored.config`) na transação; se for mais simples, `executorsForRuns`
recebe `stored.config` por dentro do `executorFor`. O desenvolvedor escolhe a forma que não dobre leituras.

```diff
 // apps/app/.../boards/(components)/cardRunReason.ts
     if (lastRun.endReason === "no_runner") {
         return reasonCopy.noRunner;
     }
+    if (lastRun.endReason === "no_credential") {
+        return fillMessage(reasonCopy.noCredential, {
+            column: config.stages.find((stage) => stage.key === lastRun.stageKey)?.column ?? lastRun.stageKey,
+        });
+    }
```

```diff
 // apps/api/env.ts
     server: {
         ...
+        CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
     },
     runtimeEnv: {
         ...
+        CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY || undefined,
     },
```

### Árvore de arquivos

```
packages/kanban-contract/src/credential.ts                     (novo)
packages/kanban-contract/src/run.ts                            (no_credential)
packages/kanban-contract/src/index.ts                          (export)
packages/kanban-contract/__tests__/credential.test.ts          (novo)
packages/sdk/src/types/board/credential.ts                     (novo) + index
packages/sdk/src/actions/boardCredential/action.ts             (novo) + registro no client
apps/api/env.ts                                                (CREDENTIALS_ENCRYPTION_KEY)
apps/api/instrumentation.ts                                    (aviso de boot)
apps/api/.env.example                                          (CREDENTIALS_ENCRYPTION_KEY="")
apps/api/(shared)/lib/credentials/secret-box.ts                (novo)
apps/api/(shared)/lib/credentials/credentials-key.ts           (novo; chave do env ou de dev no emulador)
apps/api/(shared)/mappers/credential.mapper.ts                 (novo)
apps/api/(shared)/repositories/credential.repository.ts        (novo)
apps/api/(shared)/validation/credential.schema.ts              (novo; parseSaveScheduledTask)
apps/api/(shared)/lib/orchestrator/executor-mode.ts            (escolha por etapa)
apps/api/(shared)/lib/orchestrator/executor-choice.ts          (chooseExecutorFor, executorsForRuns)
apps/api/(shared)/lib/orchestrator/executor.ts                 (isEmulated direto)
apps/api/(shared)/lib/orchestrator/orchestrator.ts             (pumpBoard, resumeAfterAnswer)
apps/api/app/(routes)/boards/[id]/credentials/route.ts         (novo, GET)
apps/api/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts (novo, PUT/DELETE)
apps/api/app/(routes)/boards/[id]/cards/[slug]/runs/route.ts   (recusa por etapa)
apps/api/app/(routes)/boards/[id]/drafts/route.ts              (etapa de spec)
apps/api/__tests__/secretBox.test.ts, credentialMapper.test.ts, boardCredentialsRoutes.test.ts (novos)
apps/app/shared/lib/queryKeys.ts                               (boards.credentials)
apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/
  (hooks)/useListBoardCredentials.tsx                          (novo)
  (hooks)/useBoardCredentialCrud.tsx                           (novo)
  (components)/ScheduledTaskTable.tsx                          (novo)
  (components)/ScheduledTaskDialog.tsx                         (novo)
  (components)/RemoveScheduledTaskDialog.tsx                   (novo)
  (components)/cardRunReason.ts                                (no_credential)
  (pages)/[id]/credentials/page.tsx                            (prefetch)
  (pages)/[id]/credentials/BoardCredentialsClient.tsx          (seção da nuvem + Segredos)
packages/internationalization/translations/apps/app/pages/common/boards.ts
packages/internationalization/translations/packages/shared/utils.ts
docs/board/ARCHITECTURE.md                                     (linha credential + no_credential no run)
docs/SETUP.md / docs/PRE-PRODUCTION.md                         (a chave)
```

### Ordem de implementação e commit

1. `feat(kanban-contract): add scheduled task credentials and the per-stage executor choice`
2. `feat(sdk): add the board credentials resource`
3. `feat(api): seal scheduled task credentials with aes-256-gcm` (secret-box, chave, env, aviso de boot, testes)
4. `feat(api): add the board credentials routes` (mapper, repositório, schema, rotas, testes)
5. `feat(api): honor the stage runners when choosing the executor` (executor-choice, orchestrator, runs, drafts,
   testes)
6. `feat(app): add the scheduled tasks section to my credentials` (hooks, tabela, diálogos, página)
7. `feat(app): explain a run refused for lack of credential on the card`
8. `feat(internationalization): add credentials copy and error codes`
9. `docs: describe the credential collection and its encryption key`
10. `docs(features): execution-credentials`

### Env e configuração

| Variável | Onde | Valor | Sem ela |
|----------|------|-------|---------|
| `CREDENTIALS_ENCRYPTION_KEY` | `apps/api` | 32 bytes aleatórios em base64 (`openssl rand -base64 32`) | Emulador: chave fixa de dev. Fora dele: cadastro da nuvem desligado, `PUT` 503, tela com aviso. Runners e disparo seguem iguais |

`.env.example` publica `CREDENTIALS_ENCRYPTION_KEY=""`; o `env.ts` trata string vazia como ausência (`||`), pela
regra da política do `/cycle`.

### Infra: pré-requisitos manuais (vão para `docs/PRE-PRODUCTION.md`)

- Gerar a chave e gravá-la no secret manager do ambiente da API. Não bloqueia a entrega: sem ela a feature fica
  desligada e o resto do board funciona.
- Trocar a chave invalida tudo o que já foi cifrado. O prefixo `v1` deixa espaço para rotação com duas chaves; até
  lá, trocar a chave significa pedir que cada membro cadastre as tarefas de novo.
- Guardar uma cópia da chave fora do provedor: perder a chave equivale a apagar todas as credenciais da nuvem.

### Riscos

| Risco | Mitigação |
|-------|-----------|
| Vazamento de token de disparo permite rodar tarefas na conta de alguém | Cifra em repouso com AAD por documento, segredo fora do DTO e do log, só os 4 finais na tela, remover a qualquer hora |
| Chave no env vaza junto com o banco | Chave e banco em lugares diferentes (env × Firestore). KMS fica como alternativa em P3 |
| A Fire URL muda de formato (research preview) | Regex num único lugar do contrato; a `cloud-routines-runner` revisa junto com o header beta |
| Cadastro sem uso até a nuvem existir | Texto da seção diz que as etapas rodam só no runner local; P1 |
| `no_runner` e `no_credential` confundidos em `run`s antigos | `run`s antigos ficam com `no_runner`, com o mesmo texto de antes |

---

## Perguntas em aberto

Decisões adotadas sem perguntar (rodada autônoma). Cada uma com a recomendação aplicada.

- **P1. Cadastro da nuvem aqui ou na `cloud-routines-runner`?** A spec põe no corte "tarefa agendada por etapa"
  e a tela; a `cloud-routines-runner` também lista "Cadastro da URL e do token de disparo". **Adotado:** cadastro
  e cifra aqui (precedência da spec), adapter lá; a `cloud-routines-runner` deve tirar esse item do corte dela.
  Descartado: deixar a tabela para a outra spec e entregar aqui só a escolha por etapa. Teria raio menor, mas
  contraria o corte desta.
- **P2. Nome da coleção.** **Adotado:** `credential`, no singular como `run` e `runner`; o `ARCHITECTURE.md` é
  corrigido. Descartado: `credentials`, como está na doc.
- **P3. Chave no env ou KMS?** **Adotado:** env, como a spec recomenda, com AES-256-GCM do `node:crypto`.
  Descartado: Cloud KMS (serviço pago e dependência nova).
- **P4. Coluna "Conferida".** **Adotado:** fora; os campos `lastCheckedAt`/`lastCheckStatus` nascem `null` e o
  adapter os preenche com o resultado do disparo real. Descartado: conferir no cadastro, o que dispararia uma
  sessão (e gastaria cota) só para validar.
- **P5. Etapa de spec (Rascunhos) na tabela.** **Adotado:** fora; a tabela lista `config.stages`, como o
  desenho. Descartado: incluir `spec`.
- **P6. Tela "Operador sem credencial".** **Adotado:** não construir o layout de dois cartões; a página já
  mostra o painel de registro quando não há runner. Descartado: reproduzir o desenho completo.
- **P7. Remoção do membro.** **Adotado:** as credenciais dele ficam no banco, inúteis (ninguém dispara como ele).
  Descartado: apagar em cascata na remoção, que mexe na rota de membros fora do escopo.
- **P8. Chave de dev no emulador.** **Adotado:** chave fixa só com `isEmulated()`, para o QA e o e2e rodarem sem
  configurar nada; valor inválido desliga a feature mesmo no emulador, o que permite testar o modo degradado.
  Descartado: exigir a chave também no desenvolvimento local.
- **P9. Validar o host da Fire URL.** **Adotado:** só `api.anthropic.com` e o caminho documentado, pelo risco de
  SSRF. Descartado: aceitar qualquer `https`.

## Referências não lidas

- Os artboards do claude.ai citados na spec (`claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt#…`): usei as imagens
  exportadas em `docs/design/screenshots/` (`Credentials.png`, `CredentialsEmpty.png`, `TriggerStage.png`).
- [Trigger a routine through the API](https://platform.claude.com/docs/en/api/claude-code/routines-fire): a
  página do Claude Code já trouxe o formato da URL e do token; a referência completa de erros fica para a
  `cloud-routines-runner`.
