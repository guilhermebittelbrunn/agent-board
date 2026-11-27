# Revisão: credenciais de execução por membro

- Data: 2026-11-27, rodada autônoma do `/cycle`.
- Entrada: working tree inteiro (índice vazio no início), [`develop/handoff.md`](../develop/handoff.md) e
  [`analyze/plan.md`](../analyze/plan.md).
- Nada foi commitado nem preparado no índice.

## Branch

`guilhermebittelbrunn/chore-overnight-cycle-specs`, reutilizada. O usuário pediu que todo o trabalho da noite
ficasse nessa branch, então ela não foi renomeada e nenhuma outra foi criada.

O nome **não passa** no regex de [`.claude/rules/git-commits.md`](../../../../.claude/rules/git-commits.md): o
prefixo `guilhermebittelbrunn/` não é um `project` e falta o `<type>/` depois dele. A rodada segue nela por
decisão explícita do usuário; renomear ou abrir uma branch no padrão (sugestão: `feat/execution-credentials`, a
partir desta) fica para quem abrir a PR. A branch não é protegida.

## Achados

| Severidade | Onde | Problema | Ação |
|------------|------|----------|------|
| 🟡 | `apps/api/(shared)/lib/credentials/credentials-key.ts:46` | A chave pública de desenvolvimento era usada sempre que `isEmulated()` dava verdadeiro. `isEmulated()` também liga só com `FIREBASE_AUTH_EMULATOR_HOST` ou `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`. Um deploy com só uma dessas variáveis esquecida, `FIREBASE_ADMIN_PROJECT_ID` real e credencial padrão do Google gravaria tokens reais no Firestore real, cifrados com uma chave que está no código. | Corrigido: a chave de dev agora depende só de `firestoreEmulatorHost()`, que é onde os documentos cifrados moram. Teste novo em `secretBox.test.ts` ("only the Auth emulator host"). `.env.example` e `docs/SETUP.md` acompanham. |
| 🟡 | `apps/api/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts:28` e `ScheduledTaskTable.tsx` | A escolha do executor trata a etapa `spec` pelo `specAuthoring.runners` (`stageRunnersOf`), mas o cadastro só aceita etapas de `config.stages` e a tabela não mostra linha para a `spec`. Um board com `specAuthoring.runners: [cloud]` recusa o rascunho com `RUN_NO_CREDENTIAL_FOR_STAGE` ("Veja Minhas credenciais") e a pessoa não tem onde cadastrar. | Decisão em aberto (abaixo). Não há executor de nuvem ainda, então nada quebra hoje. |
| 🟢 | `apps/api/app/(routes)/boards/[id]/credentials/scheduled-tasks/[stageKey]/route.ts:68` | `DELETE` exige `trigger`. Quem cadastrou como `operator` e depois virou `viewer` vê a própria linha mas não consegue remover o segredo. | Decisão em aberto (abaixo). |
| 🟢 | `ScheduledTaskDialog.tsx:114` | `autoComplete="off"` num campo de senha é ignorado pelo Chrome, que pode oferecer salvar o token como senha do site. Trocar por `new-password` faria o Chrome sugerir senha gerada, o que é pior. | Mantido. Item para o `/test` olhar. |
| 🟢 | `packages/kanban-contract/__tests__/credential.test.ts` | A tabela de URLs recusadas não cobria porta explícita, `..` no caminho nem quebra de linha antes do fim. | Fechado: três casos novos; a regex ancorada recusa os três. |

Sem 🔴.

### O que foi conferido e passou

- Cifra (`secret-box.ts`): AES-256-GCM, IV de 12 bytes novo a cada gravação, tag de 16 bytes conferida
  (`authTagLength` no decipher e tamanho checado antes), AAD com o id do documento, formato `v1.` versionado e
  qualquer falha vira `null` sem exceção. Chave inválida desliga a feature em qualquer ambiente, inclusive no
  emulador.
- Nenhum segredo sai: `CredentialRecord` não tem `sealed`, `toScheduledTaskCredentialDTO` devolve só os 4 finais,
  `logEvent("credential", …)` leva `boardId` e `stageKey`, o aviso de boot não ecoa o valor, e a única exceção do
  repositório ("Credential id collides…") não carrega dado. As regras do Firestore negam tudo ao cliente
  (`firestore.rules:32-33`).
- Fire URL: regex ancorada (`^https://api\.anthropic\.com/v1/claude_code/routines/(trig_[A-Za-z0-9]+)/fire$`),
  com `trim` e limite de 200 caracteres. Não cabe userinfo, porta, query nem outro host. Redirect não se aplica
  ainda: nenhum código faz `fetch` na URL. Quando o adapter da `cloud-routines-runner` chegar, ele precisa de
  `redirect: "manual"` (ou `error`).
- IDOR: `userId` vem sempre de `ctx.profile.id`; o id do documento é montado no servidor
  (`boardId__userId__stageKey`) e o `stageKey` da rota do `PUT` é validado contra o `board.yml`. Leitura, gravação
  e remoção conferem `userId`, `boardId` e `stageKey` do documento além do id. O `DELETE` não valida o `stageKey`
  contra o `board.yml`, mas o predicado de dono no repositório basta: só apaga o que é da pessoa.
- Papel efetivo: `GET` com `view`, `PUT` e `DELETE` com `trigger`, todos por `requireBoardApi`. Membro removido
  não passa no guard; as credenciais dele ficam no banco sem uso (P7 do plano).
- i18n: nenhum texto solto nos componentes novos; os seis `error.code` novos estão no `apiErrors`.

## Correções aplicadas

- `apps/api/(shared)/lib/credentials/credentials-key.ts`: chave de dev só com `FIRESTORE_EMULATOR_HOST`
  (antes: `isEmulated()`), com o motivo no comentário da constante.
- `apps/api/__tests__/secretBox.test.ts`: caso novo, só o host do emulador de Auth dá `absent`.
- `apps/api/.env.example` e `docs/SETUP.md`: o texto da chave de dev cita `FIRESTORE_EMULATOR_HOST`.
- `packages/kanban-contract/__tests__/credential.test.ts`: porta, `..` e quebra de linha recusados.
- `apps/api/__tests__/specDraftRoutes.test.ts`: caso novo, `stage_not_served` na rota de rascunhos responde 409
  `RUN_NO_CREDENTIAL_FOR_STAGE`, não cria card e passa os `runners` da etapa `spec` para a escolha.

## Raio de impacto

- `@repo/kanban-contract`: `RUN_END_REASONS` ganhou `no_credential`. O mapper do `run` lê com `oneOf`, então
  documentos antigos seguem válidos. `cardRunReason.ts` trata o motivo novo.
- `apps/api`: `executorsForUsers` saiu; o único chamador era o `pumpBoard` (`git grep` não acha outro uso). `resolveExecutorFor`
  e `resolveStageExecutorMode` mantêm assinatura e comportamento para quem os usa (vista do board e lista).
  `getStageExecutor` passou a perguntar `isEmulated()` direto, com o mesmo resultado de antes.
- `resumeAfterAnswer` agora lê o card antes de escolher o executor e passa os runners da etapa do card. Antes
  checava o executor primeiro e saía sem ler.
- `@repo/sdk`: só adições (`client.boardCredential` e três tipos).
- `@repo/shared`: `LogScope` ganhou `"credential"`.

## Verificar no `/test`

1. **Cadastro e troca** (item 1 e 3 do handoff). Emulador + seed + `pnpm dev`, sem `CREDENTIALS_ENCRYPTION_KEY`.
   Cadastrar Análise com Fire URL no formato real e token inventado na hora; conferir `…/routines/••••<4>` e
   `terminando em <4>`, toast, diálogo fechado e campos vazios ao reabrir. Trocar o token muda os 4 finais.
2. **Nada do segredo na rede** (item 4). Aba de rede no `GET` e no `PUT`: só `triggerIdLast4`/`tokenLast4`.
   Conferir também o documento no emulador (UI do Firestore em 4000): `sealed` começa com `v1.` e não contém o
   token em claro.
3. **Chave inválida** (item 6). `CREDENTIALS_ENCRYPTION_KEY=invalida`: linha `[credentials] …` no boot sem o
   valor, aviso na tela, botões desabilitados, `PUT` direto com 503 `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED`.
4. **Só o Auth emulado** (correção desta revisão). Subir a API com `FIREBASE_AUTH_EMULATOR_HOST` preenchido e
   `FIRESTORE_EMULATOR_HOST` vazio, sem chave: o boot diz "saving scheduled tasks is switched off", não "emulator-only
   key". A API pode não chegar a responder sem Firestore; a linha de boot basta.
5. **Viewer** (item 5): tabela sem ações; `PUT` e `DELETE` diretos com o cookie do viewer respondem 403.
6. **Outro membro**: com dois usuários do seed, cadastrar como um e chamar `DELETE` como o outro na mesma etapa:
   404 `CREDENTIAL_NOT_FOUND`, e a linha do primeiro continua cadastrada.
7. **Browser salvando o token**: no Chrome, salvar o diálogo e ver se aparece a oferta de salvar senha. Se
   aparecer, registrar; não bloqueia.
8. **Layout** (item 7): quadro "Segredos" na lateral em `lg`, depois da seção no mobile, 390 px sem rolagem
   horizontal, claro e escuro.

O 409 de etapa só-nuvem não aparece no emulador (o executor de teste serve a nuvem); fica coberto por teste de
rota e de unidade.

## Lacunas de teste

| Lacuna (do handoff) | Veredito |
|---------------------|----------|
| Componentes `ScheduledTaskTable`, `ScheduledTaskDialog`, `RemoveScheduledTaskDialog` sem teste | Fechada no `/test` (`apps/app/__tests__/scheduledTaskSection.test.tsx`) |
| Hooks `useListBoardCredentials` e `useBoardCredentialCrud` sem teste | Fechada no `/test` (`apps/app/__tests__/useBoardCredentialCrud.test.tsx`) |
| `RUN_NO_CREDENTIAL_FOR_STAGE` na rota de rascunhos | Fechada na rodada 1 (`specDraftRoutes.test.ts`) |
| `resumeAfterAnswer` com etapa não servida | Fechada no `/test` (`apps/api/__tests__/orchestratorResumeAfterAnswer.test.ts`) |
| Run enfileirado durante um `pumpBoard` em andamento (D1 do `/test`) | Fechada na rodada 2 (`orchestratorTick.test.ts`) |

## Decisões em aberto

1. **Credencial para a etapa `spec`.** Resolvida na rodada 2 com a recomendação: fica para a
   `cloud-routines-runner`. O item entrou no corte de MVP de `specs/features/cloud-routines-runner.md`.
2. **Remover a própria credencial depois de virar `viewer`.** Continua em aberto, é decisão de produto.
   Recomendação: liberar o `DELETE` com `view`, já que o repositório só apaga o que é da pessoa.
3. **Nome da branch fora do padrão.** Recomendação: abrir a PR a partir de `feat/execution-credentials` criada
   desta branch, ou renomear antes do push.

## Gates (rodada 1)

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 871 arquivos, sem erro |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=app --filter=@repo/kanban-contract --filter=@repo/sdk` | 4/4 ok |
| `apiErrors` | `vitest run apiErrorCodes` (api) | passa |
| Testes que esta revisão editou | `vitest run secretBox specDraftRoutes boardCredentialsRoutes corsOriginBoot` (api), `vitest run credential` (kanban-contract) | 58 e 22 testes, verdes |

A suíte completa e o `test:emulator` não rodaram aqui; os números do handoff valem para o que não foi tocado.

## Rodada 2: defeitos do `/test`

O `/test` voltou bloqueado com dois defeitos no código ([`test/report.md`](../test/report.md)). A correção
sugerida pelo QA foi tratada como hipótese e medida.

### D1 (🟡): run enfileirado durante um `pumpBoard` terminava com `no_runner`

`pumpBoard` calcula `choices` a partir de um `listActiveByBoard` lido antes da transação de `promote`. Se outro
disparo enfileirava um run no meio e o `pick` o escolhia, `choices.get(run.id)` vinha `undefined`, o run começava
com `executor: null` e terminava `failed`/`no_runner` com o runner online. Antes do diff o mapa era por pessoa, o
que cobria o caso da mesma pessoa.

Correção em `apps/api/(shared)/lib/orchestrator/orchestrator.ts:352`: o `pick` filtra o resultado de
`pickPromotions` por `choices.has(run.id)`. O filtro vem depois do `pickPromotions`, então a ordem da fila e o
limite da coluna continuam valendo; um run sem escolha não cede a vaga a quem chegou depois dele.

Nenhum run fica preso na fila por isso. Quem enfileira é `triggerStage`, e ele chama `pumpBoard` depois do
`enqueueOnCard` confirmar, então o retrato desse segundo `pumpBoard` já tem o run. Se a coluna estiver cheia, o
`tick` que roda a cada leitura do board bombeia de novo (`tick` chama `pumpBoard` quando há run `queued`).

Teste novo em `apps/api/__tests__/orchestratorTick.test.ts` ("leaves queued a run that was queued after the pump
read the board"): o `promote` falso agora chama o `pick`, e o `executorsForRuns` falso enfileira um run fora do
retrato. Sem o filtro o teste falha (o run tardio sai `running` sem executor); com o filtro passa.

### D2 (🟢): `node:crypto` no bundle Edge da instrumentação

A sugestão do QA (import dinâmico de `credentials-key` dentro de `prepareServer`) **não resolveu**: o
`next build` da API continuou com o aviso "A Node.js module is loaded ('node:crypto')" no rastro "Edge
Instrumentation", porque o Turbopack segue o `import()` também. A mudança foi revertida.

O que resolveu foi cortar a dependência: `credentials-key.ts` importava `secret-box.ts` só pela constante
`SECRET_KEY_BYTES`. A constante agora mora em `credentials-key.ts` e `secret-box.ts` não a exporta mais. No
`next build` seguinte o aviso sumiu e o build compilou ("Compiled successfully"). Os dois builds pararam depois,
na coleta de dados de `/github/webhook`, por variável de ambiente que faltava no meu shell; não tem relação
com a mudança.

### D3 (🟢): Remover habilitado com o cadastro desligado

Sem mudança. A rota `DELETE` não depende da chave, então a pessoa consegue apagar o segredo guardado mesmo com o
cadastro desligado. O texto do handoff ("botões desabilitados") é que estava impreciso.

### Gates da rodada 2

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 874 arquivos, sem erro |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=app` | 2/2 ok |
| Vitest da API | `vitest run` em `apps/api` | 96 arquivos, 1150 testes, verdes |
| Vitest do app (arquivos tocados) | `vitest run scheduledTaskSection useBoardCredentialCrud cardRunActions` | 3 arquivos, 26 testes, verdes |
| Emulador repetido | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator`, 6 vezes seguidas | 6/6 verdes, 9 arquivos e 135 testes em cada |
| Edge | `next build` em `apps/api` | sem o aviso de `node:crypto` |

As seis rodadas verdes não provam a correção do D1: o QA também viu o teste passar isolado (5 de 5) antes dela, e
a falha só apareceu com o turbo carregando a máquina. Quem prova o D1 é o teste de unidade acima, que falha sem o
filtro.

## Plano de commits

1. `feat(kanban-contract): add scheduled task credentials and per-stage executor choice`
2. `feat(sdk): add the board credential actions`
3. `feat(shared): add the credential log scope`
4. `feat(api): seal scheduled task credentials with AES-256-GCM`
5. `feat(api): store scheduled task credentials per member`
6. `feat(api): add the board credentials routes`
7. `feat(api): choose the executor by the runners each stage accepts`
8. `feat(app): add the board credentials data hooks`
9. `feat(app): add the cloud scheduled tasks section to my credentials`
10. `feat(app): explain the no_credential end reason on the card`
11. `feat(internationalization): add credential copy and error codes`
12. `docs: describe execution credentials and the encryption key`
13. `docs(specs): add the spec stage credential to cloud-routines-runner`
14. `docs(features): execution-credentials`

Commits realizados: _(preenchido pelo orquestrador)_
