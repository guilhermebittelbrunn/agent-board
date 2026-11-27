# Handoff do develop: credenciais de execução por membro

- Plano: [`analyze/plan.md`](../analyze/plan.md)
- Data: 2026-11-27, rodada autônoma do `/cycle`. Nada foi commitado nem preparado no índice; a branch continua
  `guilhermebittelbrunn/chore-overnight-cycle-specs`.

## Blueprint → arquivos

| Item do blueprint | Arquivos |
|-------------------|----------|
| Contrato da credencial e escolha por etapa | `packages/kanban-contract/src/credential.ts` (novo: `CREDENTIAL_KINDS`, `CREDENTIAL_CHECK_STATUSES`, `SCHEDULED_TASK_FIRE_URL`, `scheduledTaskInputSchema`, `scheduledTaskIdOf`, `stageAcceptsRunner`, `stageRunnersOf`, `chooseStageExecutor`), `src/boardConfig.ts` (tipo `RunnerKind`), `src/run.ts` (`no_credential`), `src/index.ts` |
| SDK | `packages/sdk/src/types/board/credential.ts` (novo), `types/board/index.ts`, `src/actions/boardCredential/action.ts` (novo: `list`, `saveScheduledTask`, `removeScheduledTask`), registro `boardCredential` em `src/client/index.ts` |
| Cifra e chave | `apps/api/(shared)/lib/credentials/secret-box.ts`, `credentials-key.ts` (novos), `apps/api/env.ts`, `apps/api/instrumentation.ts` (aviso de boot), `apps/api/.env.example` |
| Persistência | `apps/api/(shared)/mappers/credential.mapper.ts`, `repositories/credential.repository.ts`, `validation/credential.schema.ts` (novos) |
| Rotas | `apps/api/app/(routes)/boards/[id]/credentials/route.ts` (GET), `.../credentials/scheduled-tasks/[stageKey]/route.ts` (PUT, DELETE) |
| Escolha do executor por etapa | `apps/api/(shared)/lib/orchestrator/executor-mode.ts`, `executor-choice.ts`, `executor.ts`, `orchestrator.ts` (`pumpBoard`, `resumeAfterAnswer`), `app/(routes)/boards/[id]/cards/[slug]/runs/route.ts`, `app/(routes)/boards/[id]/drafts/route.ts` |
| Escopo de log `credential` | `packages/shared/utils/helpers/log.ts` |
| App: dados | `apps/app/shared/lib/queryKeys.ts` (`boards.credentials`), `boards/(hooks)/useListBoardCredentials.tsx`, `boards/(hooks)/useBoardCredentialCrud.tsx` (novos) |
| App: tela | `boards/(components)/ScheduledTaskSection.tsx`, `ScheduledTaskTable.tsx`, `ScheduledTaskDialog.tsx`, `RemoveScheduledTaskDialog.tsx`, `boards/(validations)/scheduledTaskSchema.ts` (novos), `boards/(pages)/[id]/credentials/page.tsx` (prefetch), `BoardCredentialsClient.tsx` (seção da nuvem e quadro "Segredos") |
| Motivo no card | `boards/(components)/cardRunReason.ts` |
| i18n | `translations/apps/app/pages/common/boards.ts` (`credentials.cloud`, `credentials.secrets`, `runReason.noCredential`, texto de `howItRuns.own`), `translations/packages/shared/utils.ts` (`apiErrors`) |
| Docs | `docs/board/ARCHITECTURE.md` (linha `credential`, `no_credential` no `run`), `docs/board/CONTRACT.md` (regra da escolha), `docs/SETUP.md` (variável), `docs/PRE-PRODUCTION.md` (pendência da chave) |
| Testes | ver "Validação" |

## Contrato

- Novo no `@repo/kanban-contract`: os símbolos de `credential.ts` acima e `RunnerKind`. `RUN_END_REASONS` ganhou
  `no_credential`; o mapper do `run` lê o motivo com `oneOf`, então `run`s antigos seguem válidos.
- Novo no `@repo/sdk`: `ScheduledTaskCredentialDTO`, `BoardCredentialsDTO`, `SaveScheduledTaskRequest` e
  `client.boardCredential`. Nenhuma assinatura existente mudou.
- `apps/api`: `resolveStageExecutorMode` e `resolveExecutorFor` mantêm a assinatura (usados pela vista e pela lista
  de boards, sem mudança de comportamento). Entraram `chooseStageExecutorMode`, `chooseExecutorFor(userId, now, stage?)`
  e `executorsForRuns(runs, config, now)`. `executorsForUsers` saiu; o único chamador era o `pumpBoard`.
- `LogScope` do `@repo/shared` ganhou `"credential"`.

## Códigos de erro novos

Todos em `apiErrors`, conferido por `pnpm --filter api test` (`apiErrorCodesTranslated`, 2 testes passando).

| `error.code` | Status |
|--------------|--------|
| `CREDENTIALS_ENCRYPTION_NOT_CONFIGURED` | 503 |
| `CREDENTIAL_STAGE_NOT_FOUND` | 404 |
| `CREDENTIAL_STAGE_NOT_CLOUD` | 409 |
| `CREDENTIAL_FIRE_URL_INVALID` | 422 |
| `CREDENTIAL_NOT_FOUND` | 404 |
| `RUN_NO_CREDENTIAL_FOR_STAGE` | 409 |

## Desvios em relação ao plano

1. **Recusa de etapa só-nuvem sem runner online.** O blueprint devolvia `no_executor` (e portanto
   `RUN_EXECUTOR_UNAVAILABLE`, "nenhum runner seu está online") quando a pessoa não tinha runner online, mesmo numa
   etapa `runners: [cloud]`. Ligar o runner não resolveria nada ali, então o texto enganaria. Agora a recusa depende
   da etapa: aceita `local` → `no_executor`; não aceita → `stage_not_served`. É o que o corte de MVP pede ("recusado
   com `RUN_NO_CREDENTIAL_FOR_STAGE`, mesmo com runner online").
2. **`no_runner` continua para quem ficou sem runner.** O plano trocava todo `run` sem executor no `pumpBoard` por
   `no_credential`. Para um `run` cuja etapa aceita o runner local e cuja pessoa só está sem runner online, o texto
   certo continua sendo o de `no_runner` ("Inicie o runner e rode de novo"). `no_credential` ficou só para
   `stage_not_served`.
3. **`stageRunnersOf` mora no contrato**, não na API: é regra de domínio (a etapa `spec` lê `specAuthoring.runners`)
   e assim os testes de rota que fazem mock de `executor-choice` não precisam copiá-la.
4. **Validação do corpo:** o plano citava `VALIDATION_ERROR` 422, código que não existe no repo. Usei o padrão das
   outras rotas, `VALIDATION_FAILED` 400. A Fire URL fora do formato continua com `CREDENTIAL_FIRE_URL_INVALID` 422.
5. **Repositório recebe o dono como objeto** (`removeOwned({ boardId, userId, stageKey }, now)`,
   `findSealed(owner)`) e confere `userId`, `boardId` e `stageKey` do documento além do id. Remover também grava
   `sealed: null`, para o segredo não sobreviver ao soft delete.
6. **Fire URL limitada a 200 caracteres** no schema do contrato, além da regex.
7. **Token com `HookFormInputPassword`** (o componente do design system com o botão de mostrar), não
   `HookFormInput type="password"`.
8. **Seção da nuvem com query própria.** `ScheduledTaskSection` chama `useListBoardCredentials` e trata o próprio erro,
   em vez de somar ao `loadError` da página. Foi para manter o `BoardCredentialsClient` dentro do limite de
   complexidade do Biome; o prefetch RSC usa a mesma `queryKey`.
9. **Teste contra o emulador do repositório**, que o plano dispensava: `credentialRepository.emulator.test.ts` cobre
   a transação de gravação (preserva `createdAt`), o AAD com o id real do documento, a lista só da pessoa e a remoção
   que apaga o `sealed`.
10. **`howItRuns.own`** ganhou "se o board.yml deixar a etapa rodar no runner local", porque a regra mudou.

## Decisões em aberto

Nenhuma bloqueia. As nove do plano (P1 a P9) foram seguidas. Fica para o usuário:

- A spec continua `proposed`; aprovar é decisão dele.
- `cloud-routines-runner` precisa tirar "cadastro da URL e do token" do corte dela (P1).

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` (Biome, 870 arquivos) | 0 erros |
| Lint, typecheck e testes | `pnpm turbo run lint typecheck test` | 27/27 tarefas ok |
| Testes da API | idem | 95 arquivos, 1142 testes |
| Testes do app | idem | 84 arquivos, 683 testes |
| Contrato | idem | 17 arquivos, 190 testes |
| Emulador | `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm --filter api test:emulator` | 9 arquivos, 135 testes (o script subiu e derrubou os próprios emuladores; portas 8080, 9199 e 4400 livres depois) |
| `apiErrors` | `apiErrorCodesTranslated` | passa |

Testes novos ou alterados: `kanban-contract/__tests__/credential.test.ts` (novo), `runner.test.ts`;
`api/__tests__/secretBox.test.ts`, `credentialMapper.test.ts`, `boardCredentialsRoutes.test.ts`,
`executorChoice.test.ts`, `credentialRepository.emulator.test.ts` (novos), `stageExecutorMode.test.ts`,
`orchestratorTick.test.ts`, `cardRunsRoutes.test.ts`, `specDraftRoutes.test.ts`, `orchestratorPullRequest.test.ts`,
`corsOriginBoot.test.ts`; `app/__tests__/cardRunActions.test.tsx`.

O que esses testes medem (fonte é o próprio teste):

- A resposta do `PUT` não contém o token, o id `trig_…` nem a palavra `sealed`, e o documento guardado não contém o
  token em claro (`boardCredentialsRoutes.test.ts`). O `userId` mandado no corpo é ignorado; vale o da sessão.
- `PUT` responde 503, 404, 409, 422 e 400 nos casos da tabela de erros; `viewer` recebe 403; `DELETE` responde 204 e
  404 para a credencial de outra pessoa; o `GET` lista só as da pessoa e devolve `cloudCredentialsEnabled: false` sem
  chave fora do emulador.
- Cifra: ida e volta, IV diferente a cada gravação, `null` com AAD, tag, corpo, chave ou versão trocados; chave de 31
  bytes ou texto fora de base64 desliga a feature mesmo no emulador; vazio no emulador usa a chave de dev
  (`secretBox.test.ts`).
- Boot sem chave fora do emulador: a API sobe e avisa; chave inválida: `console.error` sem ecoar o valor
  (`corsOriginBoot.test.ts`).
- Escolha: etapa `runners: [cloud]` com runner online → `RUN_NO_CREDENTIAL_FOR_STAGE` 409 (`cardRunsRoutes.test.ts`);
  `pumpBoard` termina com `no_credential` (`stage_not_served`) e com `no_runner` (`no_executor`)
  (`orchestratorTick.test.ts`); runners lidos uma vez por pessoa e etapa `spec` lida do `specAuthoring`
  (`executorChoice.test.ts`).
- Card: `no_credential` mostra "Você não tem credencial que sirva a Análise. Veja Minhas credenciais."
  (`cardRunActions.test.tsx`).

Não subi app nem API: nenhum smoke de tela foi feito nesta etapa.

## A verificar no `/test`

Nada abaixo foi medido no browser. Ambiente sugerido: `pnpm emulators` + `pnpm seed` + `pnpm dev`, sem
`CREDENTIALS_ENCRYPTION_KEY`.

1. A seção "Nuvem: tarefas agendadas por etapa" aparece abaixo dos runners com uma linha por etapa do `board.yml` de
   exemplo, todas "Não cadastrada". Cadastrar Análise com uma Fire URL no formato real e um token inventado na hora
   (não gravar em arquivo): a linha vira "Cadastrada" com `…/routines/••••<4>` e `terminando em <4>`, o toast aparece
   e o diálogo fecha com os campos limpos.
2. Fire URL `https://example.com/fire`: erro no campo, nenhuma requisição.
3. Trocar o token muda os 4 finais; remover pede confirmação e volta a "Não cadastrada".
4. Aba de rede: nem o `GET` nem o `PUT` trazem a URL ou o token.
5. Membro `viewer` do seed: tabela sem a coluna de ações preenchida.
6. API com `CREDENTIALS_ENCRYPTION_KEY=invalida`: linha `[credentials] …` no boot, aviso "O cadastro na nuvem está
   desligado neste ambiente.", botões desabilitados; `PUT` direto responde 503 com o código.
7. Layout: o quadro "Segredos" fica na coluna lateral em `lg` e depois da seção da nuvem no mobile; em 390 px as
   linhas empilham sem rolagem horizontal da página. Conferir claro e escuro.
8. Etapa só-nuvem: o `board.yml` do cliente GitHub falso não tem etapa `runners: [cloud]`, e no emulador o executor
   de teste serve a nuvem, então o 409 só é coberto por teste de rota e de unidade.

## Lacunas de teste conhecidas

- Nenhum teste de componente para `ScheduledTaskTable`, `ScheduledTaskDialog` e `RemoveScheduledTaskDialog`
  (estados de linha, ações escondidas para `viewer`, botões desabilitados com cadastro desligado, `reset` do formulário
  depois de salvar).
- Nenhum teste dos hooks `useListBoardCredentials` e `useBoardCredentialCrud` (atualização do cache com
  `setQueryData`).
- A rota de rascunhos (`drafts/route.ts`) não tem caso para `RUN_NO_CREDENTIAL_FOR_STAGE`; a lógica é a mesma da rota
  de disparo, que tem.
- `resumeAfterAnswer` com etapa que a pessoa não serve não tem teste dedicado.
