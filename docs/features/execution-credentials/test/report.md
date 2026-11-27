# Relatório de QA: credenciais de execução por membro

## Rodada 2 (2026-11-27): reteste depois da correção de D1 e D2

Resultado: **passou**. A rodada 2 do [`review/review.md`](../review/review.md) corrigiu D1 (o `pick` de
`pumpBoard` só promove run com escolha calculada, com teste unitário novo em `orchestratorTick.test.ts`) e D2
(`SECRET_KEY_BYTES` foi para `credentials-key.ts`, e `secret-box.ts` com `node:crypto` saiu do bundle Edge da
instrumentação). D3 ficou como estava, por decisão registrada lá.

Não abri o browser nesta rodada: o diff da correção mexe só em `apps/api` (orquestrador, chave de cifra e
teste), sem nada de UI nem de rota HTTP. A passada da rodada 1 continua valendo para a tela.

| Medição | Comando | Resultado |
|---------|---------|-----------|
| `pnpm test`, rodada A | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm test` (raiz, sem `--force`) | 14/14 tarefas, 11 do cache. Rodaram de verdade, em paralelo: `api#test` (96 arquivos, 1150 testes), `app#test` (86, 701) e `api#test:emulator` (9, 135). É a mesma carga em que a falha do D1 apareceu na rodada 1 |
| `pnpm test`, rodada B | o mesmo comando, logo em seguida | 14/14 tarefas, 13 do cache. Só o `api#test:emulator` rodou (ele nunca vem do cache): 9 arquivos, 135 testes |
| D2 no log | `pnpm e2e`, contando no log | 0 ocorrências de "Ecmascript file had an error", 0 de `node:crypto` e 0 de "Edge Instrumentation" (eram 61 avisos na rodada 1). O boot da API mostrou a linha `[credentials] … sealing scheduled tasks with the emulator-only key` normalmente |
| E2E | `pnpm e2e` | 20/20 (1,9 min) |

A rodada B teve menos carga que a A, porque o turbo reaproveitou os testes de unidade do cache. A rodada A
reproduz a condição da falha original e passou; a rodada B só confirma o emulador de novo. Nenhuma das duas
prova sozinha a correção do D1, porque a falha era intermitente. O que prova é o teste unitário "leaves queued a
run that was queued after the pump read the board", que entrou no `api#test` verde da rodada A. A revisão diz
que ele falha sem o filtro; não reverti código de produção para conferir.

Ambiente: as nove portas (3000, 3002, 8080, 9099, 9199, 4001, 4400, 4500, 9150) estavam livres antes e
continuaram livres depois. O `pnpm test` e o `pnpm e2e` sobem e derrubam os próprios emuladores e servidores, e
eu não subi nenhum processo à parte. Apaguei `apps/*/AGENTS.md`, `firestore-debug.log`,
`apps/api/firestore-debug.log` e `apps/*/.next`, que o `pnpm e2e` gerou.

Status atualizado:

| Item | Rodada 1 | Rodada 2 |
|------|----------|----------|
| D1, corrida em `pumpBoard` | aberto | fechado (unit + `pnpm test` com carga verde) |
| D2, `node:crypto` no Edge | aberto | fechado (0 avisos no log do `pnpm e2e`) |
| D3, Remover habilitado sem chave | observação | sem mudança, coerente |
| Critério "Run na fila sem executor termina com o motivo certo" | FALHOU | PASS |
| Oferta do Chrome para salvar o token | 🔒 | 🔒, continua manual |

O resto deste arquivo é o registro da rodada 1.

## Rodada 1

- Data: 2026-11-27, rodada autônoma do `/cycle`.
- Branch: `guilhermebittelbrunn/chore-overnight-cycle-specs` (não protegida). Nada foi commitado nem preparado no
  índice; os testes novos ficaram no working tree.
- Entrada: [`review/review.md`](../review/review.md), [`develop/handoff.md`](../develop/handoff.md) e a seção de
  critérios do [`analyze/plan.md`](../analyze/plan.md).
- Resultado: **bloqueado**. A passada no browser confirmou os sete itens verificáveis da lista da revisão (o
  oitavo ficou 🔒), mas o `pnpm test` da raiz falhou uma vez num teste de emulador por uma corrida que o diff
  abriu em `pumpBoard` (defeito D1). Os outros dois achados são menores.

### Defeitos

#### D1 (🟡, produção): run enfileirado durante um `pumpBoard` em andamento termina com `no_runner`

`pumpBoard` (`apps/api/(shared)/lib/orchestrator/orchestrator.ts`) calcula `choices` com
`executorsForRuns(queued, …)` a partir de um `listActiveByBoard` lido **antes** da transação de `promote`. Dentro
da transação, `runRepository.promote` relê os runs ativos e o `pick` pode escolher um run que não estava no
retrato. Para esse run, `choices.get(run.id)` dá `undefined`, o `executorFor` devolve `null`, o run começa com
`executor: null` e termina na hora como `failed`/`no_runner`.

Antes do diff, o mapa era por pessoa (`executorsForUsers`), então um run da mesma pessoa enfileirado no meio
recebia o executor dela. O buraco já existia para um run de **outra** pessoa que entrasse no meio; o diff o
estendeu à mesma pessoa, que é o caso comum (dois arrastes seguidos, ou arraste durante o `tick`).

- Repro: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm test` na raiz. Na primeira rodada,
  `orchestratorRuns.emulator.test.ts > keeps the second card queued when the column's limit is one` falhou com
  `expected [ 'failed', 'running' ] to deeply equal [ 'queued', 'running' ]`: dois `triggerStage` simultâneos do
  mesmo usuário numa coluna com `wipLimit: 1`. É intermitente: passou 5 de 5 vezes isolado e passou na segunda
  rodada de `pnpm --filter api test:emulator` (135/135). A carga do turbo em paralelo abre a janela.
- Efeito para o usuário: o card mostra "Inicie o runner e rode de novo" com o runner online.
- Correção sugerida: não promover um run sem escolha calculada. Por exemplo, no `pick`, filtrar
  `pickPromotions(...)` por `choices.has(run.id)`; o run que ficou de fora é promovido pelo `pumpBoard` do disparo
  que o criou, cujo retrato já o inclui. Outra saída é calcular a escolha dentro do `executorFor` a partir de um
  mapa de "runner online" por pessoa e de `stageRunnersOf(stored.config, run.stageKey)`, deixando na fila quem
  não está no mapa. Vale um teste unitário com `promote` falso que devolve um run fora do retrato.

#### D2 (🟢): `instrumentation.ts` puxa `node:crypto` para o bundle Edge

`instrumentation.ts` importa `credentialsKeyState` no topo, e `credentials-key.ts` importa `secret-box.ts`, que
importa `node:crypto`. O Next compila `instrumentation.ts` também para o Edge e avisa "A Node.js module is loaded
('node:crypto' at line 1) which is not supported in the Edge Runtime", seguido de "Ecmascript file had an error".
No `pnpm e2e`, o aviso saiu 61 vezes no log da API (uma por compilação). O `next build` da API compila
("Compiled successfully") e lista o aviso; o código só roda com `NEXT_RUNTIME === "nodejs"`, então não quebra
em execução. Correção sugerida: mover `warnOnCredentialsKey` para `instrumentation-node.ts` (ou importar
`credentials-key` dinamicamente dentro de `prepareServer`), ou separar o parse da chave de `secret-box.ts` para
não arrastar `node:crypto`.

#### D3 (🟢, observação): Remover fica habilitado com o cadastro desligado

Com a chave inválida, Cadastrar e Trocar ficam desabilitados e Remover não. A rota `DELETE` não depende da chave,
então o comportamento é coerente: a pessoa consegue apagar o segredo guardado. O handoff dizia "botões
desabilitados"; registro para o texto não induzir a erro. Não exige mudança.

### Cobertura

#### Comandos e números

| Comando | Resultado |
|---------|-----------|
| `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm test` (raiz, com cache) | **falhou** em `api#test:emulator`: 134/135, 1 falha (D1). Demais tarefas verdes: `api#test` 96 arquivos/1149 testes, `app#test` 86/701, `@repo/kanban-contract` 17/193, `@repo/auth` 14/211, `@repo/design-system` 16/150, `@repo/security` 3/65, `@repo/shared` 4/51, `runner` 9/46, `@repo/analytics` 3/41, `@repo/next-config` 2/34, `@repo/internationalization` 4/33, `e2e#test` 2/16, `@repo/sdk` 1/9 |
| `pnpm --filter api test:emulator` (segunda rodada) | 9 arquivos, 135/135 |
| `firebase emulators:exec … vitest run orchestratorRuns.emulator.test.ts -t "limit is one"`, 5 vezes | 5/5 passaram |
| `pnpm e2e` | 20/20 (Playwright, desktop e mobile) |
| `pnpm turbo run typecheck --filter=api --filter=app` | 2/2 ok |
| `biome check` nos três arquivos de teste novos | sem erro |
| `apiErrorCodesTranslated` | dentro do `api#test` acima, passa; nenhum `error.code` novo nesta etapa |

`pnpm check` do repositório inteiro não foi remedido: o `/review` mediu 871 arquivos sem erro e esta etapa só
acrescentou arquivos de teste, conferidos um a um.

#### Testes criados

| Arquivo | Testes | O que prova |
|---------|--------|-------------|
| `apps/app/__tests__/scheduledTaskSection.test.tsx` | 10 | Linhas "Não cadastrada", "Só no runner local" (sem ações) e "Cadastrada" com os finais; viewer sem nenhum botão; aviso e Cadastrar/Trocar desabilitados com o cadastro desligado; erro da lista em `role="alert"`; URL e token inválidos barrados sem chamar a API; salvar atualiza a linha, mostra o toast, fecha o diálogo e reabre vazio; erro 503 mantém o diálogo com os valores e o cache intacto; remover pede confirmação, chama o `DELETE` e volta a "Não cadastrada"; cancelar não chama a API |
| `apps/app/__tests__/useBoardCredentialCrud.test.tsx` | 8 | `setQueryData` troca só a etapa salva, sem invalidar nem refazer a lista; erro deixa o cache igual e mostra a mensagem traduzida; remover tira só a etapa; 404 mantém a linha; cache ausente não é criado; `useListBoardCredentials` busca a lista, espera o token do SDK e não chama sem `boardId` |
| `apps/api/__tests__/orchestratorResumeAfterAnswer.test.ts` | 5 | Com `stage_not_served` ou `no_executor`, `resumeAfterAnswer` não enfileira; com executor, enfileira o card; num rascunho, os `runners` vêm do `specAuthoring`; card fora de `waiting_input` não escolhe executor |

#### Decisões de custo de teste

Nenhum teste novo da faixa cara. Os três arquivos rodam com `vi.mock` e terminam em milissegundos.

- Componentes e hooks do app: render com `QueryClientProvider` e SDK falso. Nada ali depende de infra.
- `resumeAfterAnswer`: repositórios de card e run falsos bastam para provar a decisão; a transação real já está
  em `orchestratorRuns.emulator.test.ts`.
- Rotas de credenciais, cifra, mapper e escolha por etapa: `boardCredentialsRoutes`, `secretBox`,
  `credentialMapper`, `executorChoice`, `stageExecutorMode`, `cardRunsRoutes`, `specDraftRoutes` e
  `orchestratorTick` já cobriam; rodei o que existe.
- Repositório contra o Firestore: `credentialRepository.emulator.test.ts` (do `/develop`) prova a transação, o AAD
  com o id real e o `sealed: null` na remoção. Não acrescentei cenário.
- D1 pede teste novo, que deve acompanhar a correção no `/develop`.

### Verificar no `/test` (lista do `review.md`)

Ambiente: emulador próprio, `pnpm seed` e `pnpm dev`, com os `.env` copiados do `.env.example` e sem
`CREDENTIALS_ENCRYPTION_KEY`. Login pelo popup GitHub do emulador como `qa-exec-creds` (dono do board
`agent-board-demo/sample-app`, criado pela UI), mais `qa-reader` e `qa-writer` convidados como Operador.

| # | Item | Veredito | O que foi medido |
|---|------|----------|------------------|
| 1 | Cadastro e troca | **confirmado** | Análise cadastrada com Fire URL de mentira terminando em `0001`: `PUT …/scheduled-tasks/analyze` 200, linha "Cadastrada" com `…/routines/••••0001` e `terminando em 1111`, toast "Tarefa agendada de Análise salva.", diálogo fechado. Reaberto por Trocar, `fireUrl` e `token` estavam com `value` vazio. Na troca para id `…0002` e token `…2222`, a linha passou a `••••0002` e `terminando em 2222`, sem linha duplicada |
| 2 | Nada do segredo na rede e no banco | **confirmado** | `GET` e `PUT` chamados pelo browser com o bearer da sessão: os corpos trazem só `stageKey`, `triggerIdLast4`, `tokenLast4`, `lastCheckedAt`, `lastCheckStatus`, `updatedAt`; nenhuma ocorrência do token, do id `trig_…`, de `anthropic` ou de `sealed`. No Firestore emulado, os dois documentos têm `sealed` começando com `v1.`, com 211 caracteres, e nenhum campo contém o token, a URL ou o id em claro |
| 3 | Chave inválida | **confirmado** | API com `CREDENTIALS_ENCRYPTION_KEY=invalida`: boot "[credentials] CREDENTIALS_ENCRYPTION_KEY is not 32 bytes in base64: saving scheduled tasks is switched off.", sem o valor no log. A tela mostra "O cadastro na nuvem está desligado neste ambiente.", Cadastrar e Trocar com `disabled` e Remover habilitado (D3). `PUT` direto: 503 `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED`. `GET`: `cloudCredentialsEnabled: false`, e a linha já cadastrada continua listada |
| 4 | Só o Auth emulado | **confirmado** | API com `FIRESTORE_EMULATOR_HOST` vazio e chave vazia: boot "[credentials] CREDENTIALS_ENCRYPTION_KEY is not set: saving scheduled tasks is switched off.", e não a linha da chave de emulador. Com o Firestore emulado, o boot dizia "sealing scheduled tasks with the emulator-only key" |
| 5 | Viewer | **confirmado** | `qa-reader` (Operador no board, `read` no GitHub, papel efetivo `viewer`) vê as cinco etapas "Não cadastrada" e nenhum botão na tabela; a credencial do dono não aparece. `PUT` e `DELETE` diretos: 403 `BOARD_ROLE_INSUFFICIENT`. `GET`: 200 com `scheduledTasks: []` |
| 6 | Outro membro | **confirmado** | `qa-writer` (Operador efetivo) chamou `DELETE …/scheduled-tasks/analyze` e recebeu 404 `CREDENTIAL_NOT_FOUND`. O documento do dono seguiu com `sealed` preenchido e `deletedAt: null`, e a tela do dono continuou com Análise "Cadastrada" |
| 7 | Browser oferecendo salvar o token | **🔒 não verificável** | O Chrome do `agent-browser` roda sem gerenciador de senhas, então a oferta não aparece em caso nenhum. Os inputs têm `type=password` e `autocomplete=off`, como a revisão leu. Fica para conferência manual num Chrome com perfil |
| 8 | Layout | **confirmado** | Em 1440 px, "Com que credencial cada disparo roda" e "Segredos" ficam na coluna lateral e a tabela de cinco colunas à esquerda. Em 390 px, `scrollWidth` 390 igual ao `clientWidth`, linhas empilhadas com os rótulos Situação, URL de disparo e Token, e "Segredos" depois da seção da nuvem. Escuro e claro conferidos nas duas larguras; o badge "Cadastrada" inverte (claro no escuro, escuro no claro) com texto legível. O diálogo em 390 px ocupa de 16 a 374 px |

Fora da lista: a URL `https://example.com/fire` no diálogo mostrou "Use a Fire URL do gatilho de API da tarefa
agendada." e nenhum `PUT` chegou à API. `PUT` direto respondeu 422 `CREDENTIAL_FIRE_URL_INVALID` para a mesma URL
e 404 `CREDENTIAL_STAGE_NOT_FOUND` para a etapa `nope`. Remover Revisando pediu confirmação ("Remover a tarefa
agendada de Revisando?"), o `DELETE` respondeu 204, a linha voltou a "Não cadastrada" e o documento ficou com
`sealed: null` e `deletedAt` preenchido.

No `agent-browser` em 390 px, o clique sintético em Trocar não abriu o diálogo duas vezes seguidas; o
`element.click()` abriu na hora. Em 1440 px o mesmo botão abriu pelo clique sintético. Tratei como limitação da
ferramenta, não do produto, mas vale um toque manual no celular.

O 409 `RUN_NO_CREDENTIAL_FOR_STAGE` de etapa só nuvem não aparece no emulador, porque o executor de teste serve a
nuvem. Continua coberto por `cardRunsRoutes.test.ts`, `specDraftRoutes.test.ts` e `orchestratorTick.test.ts`.

### Critérios de aceite

Checklist completo em [`criterios-aceite.md`](criterios-aceite.md).

| Critério | Status | Meio |
|----------|--------|------|
| A seção da nuvem lista uma linha por etapa do `board.yml` | PASS | e2e + componente |
| Cadastrar guarda a URL e o token e devolve só os finais | PASS, sem o duplo clique | e2e + componente. O duplo clique em Salvar não foi medido; o botão usa `loading` enquanto salva |
| Trocar substitui a credencial da etapa | PASS | e2e + hook + emulador (`credentialRepository.emulator`) |
| Remover pede confirmação e apaga o segredo | PASS | e2e + componente + banco emulado |
| URL ou token fora do formato são recusados | PASS | e2e + componente + rota + contrato |
| Etapa inexistente ou que não aceita nuvem | PASS | e2e (404) + rota (409) |
| Nenhum segredo sai da API | PASS | e2e + rota |
| O documento guardado está cifrado | PASS | e2e (banco emulado) + unit (`secretBox`) |
| Viewer vê a tabela sem ações e a API recusa a escrita | PASS | e2e + componente + rota |
| Cada pessoa só vê e só apaga o que é dela | PASS | e2e + rota |
| Sem chave válida, o cadastro fica desligado | PASS | e2e + componente + rota + boot |
| A chave de desenvolvimento só vale com o Firestore emulado | PASS | e2e (boot) + unit |
| A escolha do executor respeita os `runners` da etapa | PASS | rota + unit (não reproduzível no emulador) |
| Run na fila sem executor termina com o motivo certo | **FALHOU** | emulador: D1, disparos simultâneos da mesma pessoa terminaram um card com `no_runner` |
| Responder pergunta não redispara etapa que a pessoa não serve | PASS | unit (`orchestratorResumeAfterAnswer`, novo) |
| Erros de lista e de gravação aparecem traduzidos | PASS | componente + hook |
| Tema e responsivo | PASS | e2e |

### Lacunas herdadas

| Lacuna (handoff e review) | Veredito |
|---------------------------|----------|
| Componentes `ScheduledTaskTable`, `ScheduledTaskDialog`, `RemoveScheduledTaskDialog` sem teste | Fechada: `scheduledTaskSection.test.tsx` |
| Hooks `useListBoardCredentials` e `useBoardCredentialCrud` sem teste | Fechada: `useBoardCredentialCrud.test.tsx` |
| `RUN_NO_CREDENTIAL_FOR_STAGE` na rota de rascunhos | Já fechada no `/review` (`specDraftRoutes.test.ts`); rodou verde |
| `resumeAfterAnswer` com etapa não servida | Fechada: `orchestratorResumeAfterAnswer.test.ts` |
| Oferta do Chrome para salvar o token | Continua aberta (🔒, manual) |
| Corrida em `pumpBoard` (D1) | Aberta, nova; precisa de correção e teste no `/develop` |

### Decisões em aberto do `/review`

As três continuam com o usuário: credencial para a etapa `spec`, `DELETE` liberado para `viewer` e nome da branch
fora do padrão.

### Evidências e ambiente

Prints em `test/e2e/`, descartados pelo `.gitignore` (o texto acima é a evidência): `01-desktop-vazio.png`,
`02-url-invalida.png`, `03-cadastrada-dark.png`, `04-remover-confirmacao.png`, `05-desktop-light.png`,
`06-mobile-light.png`, `07-mobile-dark-dialogo.png`, `08-viewer.png`, `09-chave-invalida.png`. Nenhum mostra
e-mail ou nome de pessoa real.

- As portas 3000, 3002, 8080, 9099, 9199, 4001, 4400, 4500 e 9150 estavam livres no início; não reutilizei nada.
- Subi `pnpm emulators`, `pnpm --filter api dev` (três vezes: normal, chave inválida e só Auth emulado) e
  `pnpm --filter app dev`, e matei só esses processos e os filhos deles (`next-server`, `firebase.js`, `java`),
  conferidos por PID. Todas as portas acima saíram vazias no fim. O `pnpm e2e` e o `test:emulator` sobem e
  derrubam os próprios emuladores.
- Apaguei `apps/api/.env`, `apps/app/.env`, `apps/*/AGENTS.md`, `firestore-debug.log` e `apps/*/.next`.
- Dados de QA ficaram só no emulador, que morreu com o processo. Contas: `qa-execution-credentials@example.com`
  (screen name `qa-exec-creds`), `qa-reader-execution-credentials@example.com` e
  `qa-writer-execution-credentials@example.com`. Nenhuma conta em projeto Firebase real, nada a acrescentar ao
  `docs/PRE-PRODUCTION.md`. Os tokens e as URLs eram de mentira e não constam neste arquivo.
- Estado de dev alterado fora do emulador: nenhum.
