# Revisão: escrever spec com um agente

Revisão do working tree depois do `/develop`, na rodada autônoma do `/cycle`. Escopo: o diff inteiro da feature (contrato, SDK, API, app, i18n, kit e comandos, docs do board), lido contra [`docs/review-checklist.md`](../../../review-checklist.md), com atenção à segurança das rotas novas.

## Branch

- **Nome:** `guilhermebittelbrunn/chore-overnight-cycle-specs`, reutilizada. Não foi criada nem renomeada.
- **Validação do nome:** o regex de `.claude/rules/git-commits.md` **não passa** (o primeiro segmento é o login, e `chore-overnight-cycle-specs` fica onde o padrão espera `<type>/<title>`).
- **Por que ficou assim:** o usuário pediu, de forma explícita, que todo o trabalho da noite ficasse nesta branch. O nome foi escolha dele. A branch não é protegida, então commitar nela não viola a regra central. O título da PR pode seguir o padrão mesmo com a branch fora dele.

## Achados

| Sev. | Arquivo:linha | Problema | Ação |
|------|---------------|----------|------|
| 🟡 | `apps/api/(shared)/lib/spec-draft.ts:190` | O `name` de cada anexo vinha do corpo do `POST /drafts` sem limpeza. O upload limpava o nome, mas a criação do rascunho aceitava qualquer texto do cliente, inclusive quebra de linha e caracteres de controle, e esse nome chega ao agente no `get_card` (regra 16: conteúdo do card é dado). | Corrigido: a limpeza do upload virou `cleanAttachmentName` em `(shared)/lib/attachment-name.ts` e passa a valer também na criação do rascunho. Teste novo em `specDraftRoutes.test.ts`. |
| 🟡 | `apps/api/(shared)/repositories/card.repository.ts:196` | `approveDraft` relia, dentro da transação, só run vivo e pergunta aberta. Uma rodada nova que começasse e falhasse entre a checagem da rota e a transação deixava aprovar um rascunho com `state: failed`. | Corrigido: a transação também exige `state === "idle"`. O fake em `__tests__/fakeCardRepository.ts` acompanha. |
| 🟢 | `apps/api/(shared)/lib/orchestrator/decide.ts:186` | `specDraftStateAfter` leva `needs_rework` para `waiting_input`. Sem `pendingAsk`, o card mostra "Aguardando você" e o botão "Responder" sem pergunta nenhuma para responder. O `/spec` do kit não usa `needs_rework`, então só acontece se o agente sair do roteiro. | Rodada 1: não alterado, foi para o `/test`. O QA mediu e o efeito era pior (critério 15). Corrigido na rodada 2, ver abaixo. |
| 🟢 | `apps/api/(shared)/lib/card-sync.ts:301` | Card nascido no board e já aprovado, ainda em Tarefas: se o slug aparecer no índice da base (alguém mergeou a branch antes de começar), a sincronização reescreve `spec.status` com o do arquivo (`proposed`) e o card pode deixar de ficar pronto. Caso raro, fora do fluxo normal. | Não alterado. Registrado. |
| 🟢 | `packages/sdk/src/types/board/card.ts:31` | `request.requestedBy.userId` e `specApproval.userId` saem no `CardDTO`. O `RunDTO` expõe só o login, mas os eventos do card (`CardEventAuthor`) já expõem `userId`, então não é vazamento novo. | Não alterado. |
| 🟢 | `packages/kanban-contract/src/boardConfig.ts:36` | `specAuthoring.path` só exige `{slug}`. Um `board.yml` pode apontar para qualquer caminho do repositório. O caminho é lido pela API do GitHub e escrito pelo agente na branch do card, e quem edita o `board.yml` já controla o repositório. | Não alterado. |

Nada bloqueante.

## Rodada 2: defeitos do `/test`

O `/test` (rodada 1) devolveu dois defeitos de produção 🟡, descritos em [`test/report.md`](../test/report.md). Os dois foram corrigidos e medidos com teste.

| Sev. | Arquivo:linha | Problema | Correção |
|------|---------------|----------|----------|
| 🟡 | `apps/api/(shared)/validation/attachment.schema.ts` | O upload de anexo recusava com `UPLOAD_FILE_TYPE_NOT_ALLOWED` e `UPLOAD_FILE_TOO_LARGE`, cuja copy fala de "JPG, PNG ou WebP" e "4 MB". Anexo de spec aceita imagem, PDF e texto até 3 MB (critério 6). | Códigos próprios `SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED` (415) e `SPEC_DRAFT_ATTACHMENT_TOO_LARGE` (413), com copy em `apiErrors`. O diálogo já traduzia o erro de cada item por `FormattedError`, então não precisou de mapeamento no cliente. `UPLOAD_FILE_MISSING` continua, porque a copy dele serve. |
| 🟡 | `apps/api/(shared)/lib/orchestrator/decide.ts:189` e `packages/kanban-contract/src/specAuthoring.ts` | `needs_rework` na etapa `spec` deixava `waiting_input` sem `pendingAsk`. A tela mostrava "Aguardando você" e "Responder" sem pergunta, e a dica do aprovar falava de pergunta aberta (critério 15). | `needs_rework` da etapa `spec` passa a deixar `state: failed`, de onde "Rodar de novo" já sai (`canRunAgain`). `draftStatus` só devolve `waiting` quando há `pendingAsk`; um `waiting_input` sem pergunta (inclusive o de cards gravados antes desta correção) aparece como `failed`, com a dica "A última rodada falhou. Rode de novo antes de aprovar." |

Observações 🟢 do report:

- **Selos "Spec pronta" e "Parado" juntos na página do rascunho.** Corrigido: `CardRunControls` ganhou `showState` (padrão `true`), e `SpecDraftDetail` passa `false`, porque o selo do rascunho já diz o estado.
- **"Choose Files" em inglês na árvore de acessibilidade.** Corrigido: o `<input type="file">` do diálogo, que já era `sr-only` e `tabIndex={-1}` e é acionado pelo botão "Anexar", ganhou `aria-hidden`.
- **Assistente de criação do quadro sem Rascunhos, clique fora do diálogo descartando o texto e "1 kB" para arquivos pequenos.** Não alterados. Os dois primeiros mudam comportamento de outras telas ou do diálogo e merecem decisão de produto; o terceiro é cosmético.

Testes que acompanham as correções:

- `apps/api/__tests__/attachmentSchema.test.ts` e `apps/app/__tests__/newSpecDialog.test.tsx` esperam os códigos novos; o teste do diálogo confere também a frase mostrada no item recusado.
- `apps/api/__tests__/orchestratorDecide.test.ts`: `needs_rework` da etapa `spec` termina em `failed`.
- `packages/kanban-contract/__tests__/specAuthoring.test.ts`: caso novo, `waiting_input` sem pergunta é `failed`, nunca `waiting`.
- `apps/app/__tests__/specDraftDetail.test.tsx`: a página do rascunho pronto não mostra "Parado".

`docs/board/ARCHITECTURE.md` foi atualizado com o novo destino de `needs_rework`.

### Conferido e conforme

- **Autorização na API:** as quatro rotas novas usam `requireBoardApi`, que resolve o papel efetivo. Upload de anexo e criação de rascunho exigem `trigger`; aprovar e descartar exigem `prioritize`, como o plano decidiu. A UI esconde as mesmas ações para quem não tem papel e durante impersonação (`BoardClient.tsx:223`, `SpecDraftDetail.tsx:187`).
- **Escopo do board:** aprovar e descartar leem o card por `findBySlug(ctx.board.id, slug)` e refazem lane, run vivo e pergunta aberta dentro da transação.
- **Limite de upload no servidor:** `Content-Length` acima de 3 MiB mais o envelope é recusado antes de ler o corpo; a leitura é limitada por `readCappedBody`; o `file.size` é checado de novo. O tipo vem dos bytes (imagem e PDF pela assinatura, texto por extensão mais UTF-8 válido e sem byte nulo), e a imagem perde os metadados.
- **Path traversal no Storage:** o caminho do objeto é montado no servidor (`uploads/<userId>/<uuid>.<ext>`). Na criação do rascunho, cada caminho passa por `isAttachmentObjectPath` (sem `.`, `/` extra ou `..` possível) e por `isOwnedBy` com a barra final do prefixo, e o tipo e o tamanho vêm dos metadados do objeto, não do cliente. O caminho nunca sai da API: `toCardDTO` e `agentRequestOf` removem o campo.
- **`get_attachment`:** o schema do contrato exige `cardId` e `stage` e passa por `checkToolScope`, que prende ao card e à etapa do run do token. O anexo é procurado só no `request` do card do token; id de outro card responde `AGENT_ATTACHMENT_NOT_FOUND`. Run encerrado responde `AGENT_RUN_CLOSED`.
- **Regra 16:** o pedido e os anexos chegam ao agente como campos do `get_card` e como resultado de ferramenta. A descrição da ferramenta no MCP e o trecho do `/spec` no kit dizem que o conteúdo é dado, não instrução. O disparo leva só os campos do `StageDispatch`.
- **Transições:** `decideTrigger` só roda a etapa `spec` em rascunho e recusa qualquer outra etapa em rascunho (`CARD_DRAFT_NOT_APPROVED`); `decideCardMove` e a transação de `move` recusam mover rascunho; `planCompletion` nunca tira o card de Rascunhos sozinho. A ordem manual (`cards/order`) já filtra `lane === "tasks"`.
- **i18n:** nenhuma string solta nos componentes novos; os oito códigos novos estão em `apiErrors`.
- **Comentários:** nenhum aponta para artefato do fluxo.

### Corte da spec

O que foi implementado bate com o corte de MVP de `specs/features/spec-authoring.md`, com três itens que o plano tirou de propósito e que continuam fora: a barra "N de 8 seções prontas", o slug escolhido pelo agente e a escrita de `status: approved` no arquivo. A aprovação fica no card (`specApproval`), e o `/analyze` em modo board trata `proposed` de card com `origin: board` como aprovado. O `/spec --sync` decide se a spec fecha com essa diferença.

## Correções aplicadas

- `apps/api/(shared)/lib/attachment-name.ts` (novo): `cleanAttachmentName`, a mesma limpeza que já existia no upload, num módulo sem dependências para poder ser usado pela criação do rascunho.
- `apps/api/(shared)/validation/attachment.schema.ts`: passa a importar `cleanAttachmentName` em vez da função privada `cleanName`.
- `apps/api/(shared)/lib/spec-draft.ts`: `resolveDraftAttachments` limpa o nome enviado pelo cliente; a extensão do fallback vem do caminho do objeto.
- `apps/api/(shared)/repositories/card.repository.ts`: `approveDraft` recusa com `CARD_SPEC_NOT_READY` quando o `state` relido não é `idle`.
- `apps/api/__tests__/fakeCardRepository.ts`: mesma checagem no fake.
- `apps/api/__tests__/specDraftRoutes.test.ts`: caso novo, "strips control characters and slashes from the attachment name".

## Raio de impacto

- `CardLane` ganhou `drafts`. Todo `Record<CardLane, …>` do app e da API foi atualizado (o typecheck pega o que faltasse). `card-order.ts` ordena Rascunhos primeiro.
- `CardDTO` ganhou `origin`, `request`, `specApproval` e `spec.ref`. Consumidores: `apps/app` (board e página do card) e os fixtures de teste do app e da API. O runner não lê `CardDTO`.
- `BoardViewDTO.storageAvailable` é novo e obrigatório; `toBoardView` importa `storage.ts`, por isso quatro testes de rota passaram a mockar o Storage.
- `AGENT_MCP_TOOLS` tem seis ferramentas. Um repositório importado que fixe a lista de ferramentas em `allowedTools` precisa incluir `get_attachment`.
- `boardConfigSchema` ganhou `specAuthoring` com padrão completo, então todo `board.yml` existente continua válido. Um `board.yml` com etapa de chave `spec` passa a falhar com `stage_key_reserved`.

## Verificar no `/test`

Nenhum comportamento de tela ou de integração foi medido no `/develop` nem aqui. Por ordem de risco:

1. **PDF chega ao modelo pelo MCP.** `attachmentContent` manda PDF como `resource` com `blob`. Não há como saber, lendo o código, se o Claude Code repassa esse bloco ao modelo. Repro: rascunho com um PDF de uma página e texto conhecido, executor `local`, e conferir se a spec cita o texto do PDF. Se não houver runner real, marcar 🔒.
2. **Aprovar só libera depois de uma rodada com sucesso e sem pergunta.** Repro: executor de teste com um script que termina em `needs_input` com `ask`; conferir o botão desabilitado com a dica, chamar `POST .../spec/approve` direto e esperar `409 CARD_SPEC_NOT_READY`; responder, deixar a rodada terminar com `success`, aprovar e ver o card no fim de Tarefas, arrastável para Análise.
3. **Anexo de outra pessoa é recusado.** Repro: subir um anexo com o usuário A, criar o rascunho com o usuário B usando o `path` devolvido para A; esperar `422 SPEC_DRAFT_ATTACHMENT_INVALID` e nenhum card criado.
4. **Limites do upload.** Repro: com o emulador de Storage, enviar PNG e PDF (aceitos), `.txt` com byte nulo (`415`), arquivo de 4 MiB (`413`) e um sexto anexo (bloqueado no diálogo e `400 VALIDATION_FAILED` na API).
5. **Sem Storage.** Repro: subir sem o emulador de Storage; a área de anexos some com o aviso, `POST /boards/<id>/attachments` responde `503 STORAGE_NOT_CONFIGURED` e o pedido só com texto cria o card.
6. **Sem executor.** Repro: sem runner online, "Começar a spec" desabilitado com o aviso e `POST /boards/<id>/drafts` responde `503 RUN_EXECUTOR_UNAVAILABLE` sem criar card.
7. **Rascunho não sai de Rascunhos sem aprovar.** Repro: tentar arrastar, abrir o menu e chamar `POST .../move` e `POST .../runs` com `stageKey: analyze`; esperar `409 CARD_DRAFT_NOT_APPROVED` nas chamadas diretas. Repetir em 390 px.
8. **Descartar.** Repro: a confirmação mostra a branch, o quadro volta sem o card e um novo pedido com o mesmo começo de texto recebe o sufixo `-2`.
9. **Saída `needs_rework` na etapa `spec`.** Repro: script de teste que termina em `needs_rework`; conferir o que o card mostra e se "Rodar de novo" está disponível (achado 🟢 acima).
10. **Visual:** coluna Rascunhos antes de Tarefas com subtítulo, contagem e `+` só para operador; página do rascunho em duas colunas no `lg` e uma no celular; light e dark; viewer não vê "Nova spec", "Aprovar" nem "Descartar".

## Lacunas de teste

| Lacuna (do handoff) | Veredito |
|---------------------|----------|
| Sem teste de componente para `NewSpecDialog`, `SpecDraftDetail` e `DraftCardControls` | Continua aberta. Cobertura de UI fica com o `/test`. |
| `createDraft`, `approveDraft` e `discardDraft` sem teste contra o emulador | Continua aberta. A checagem nova de `state` no `approveDraft` também só roda no fake. Um teste de emulador se justifica para a colisão concorrente do `createDraft`, que é comportamento da transação real. |
| `readObject` e `readObjectMetadata` sem teste próprio | Continua aberta. São chamadas diretas ao SDK do Storage; o teste do emulador de upload é o lugar certo, se alguém quiser cobrir. |
| Nome de anexo com caractere de controle | Fechada aqui (teste novo na rota de rascunho). |

## Decisões em aberto

- **Nome da branch fora do padrão.** Recomendação: manter, como o usuário pediu, e usar `feat: spec authoring on the board` (ou o título por app) como título da PR.

## Gates estáticos

| Gate | Resultado |
|------|-----------|
| `pnpm check` | 1002 arquivos, sem erro (depois das correções) |
| `pnpm turbo run typecheck` em `kanban-contract`, `sdk`, `api`, `app`, `internationalization`, `runner` | 6/6 (cache, antes das correções); `pnpm --filter api typecheck` limpo depois delas |
| `pnpm --filter api test apiErrorCodes` | 2/2 |
| Testes da API (para validar as duas correções) | 110 arquivos, 1328 testes, todos passando |
| Rodada 2: `pnpm check` | 1007 arquivos, sem erro |
| Rodada 2: typecheck dos seis workspaces | 6/6 |
| Rodada 2: Vitest dos arquivos tocados | `api` 4 arquivos e 54 testes (inclui `apiErrorCodesTranslated`), `kanban-contract` 2 e 21, `app` 4 e 31; todos passando |

## Plano de commits

Na ordem. A branch é `guilhermebittelbrunn/chore-overnight-cycle-specs`.

1. `feat(kanban-contract): add drafts lane and spec authoring settings`
   - `packages/kanban-contract/src/boardConfig.ts`
   - `packages/kanban-contract/src/boardConfigIssues.ts`
   - `packages/kanban-contract/src/boardLanes.ts`
   - `packages/kanban-contract/src/run.ts`
   - `packages/kanban-contract/src/specAuthoring.ts`
   - `packages/kanban-contract/src/index.ts`
   - `packages/kanban-contract/__tests__/boardConfig.test.ts`
   - `packages/kanban-contract/__tests__/boardLanes.test.ts`
   - `packages/kanban-contract/__tests__/run.test.ts`
   - `packages/kanban-contract/__tests__/specAuthoring.test.ts`
2. `feat(kanban-contract): add get_attachment and the card request to the agent contract`
   - `packages/kanban-contract/src/agentContract.ts`
   - `packages/kanban-contract/src/agentResults.ts`
   - `packages/kanban-contract/__tests__/agentContract.test.ts`
3. `feat(sdk): add spec draft actions and card request types`
   - `packages/sdk/src/actions/boardDraft/action.ts`
   - `packages/sdk/src/actions/boardCard/action.ts`
   - `packages/sdk/src/client/index.ts`
   - `packages/sdk/src/types/board/card.ts`
   - `packages/sdk/src/types/board/member.ts`
4. `feat(api): keep spec drafts in the drafts lane`
   - `apps/api/(shared)/mappers/card.mapper.ts`
   - `apps/api/(shared)/repositories/card.repository.ts`
   - `apps/api/(shared)/lib/card-move.ts`
   - `apps/api/(shared)/lib/card-order.ts`
   - `apps/api/(shared)/lib/card-events.ts`
   - `apps/api/(shared)/lib/card-sync.ts`
   - `apps/api/(shared)/lib/orchestrator/decide.ts`
   - `apps/api/(shared)/lib/orchestrator/orchestrator.ts`
   - `apps/api/(shared)/lib/github/github-fake-client.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/move/route.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/route.ts`
   - `apps/api/__tests__/cardMapper.test.ts`
   - `apps/api/__tests__/cardMove.test.ts`
   - `apps/api/__tests__/cardSync.test.ts`
   - `apps/api/__tests__/fakeCardRepository.ts`
   - `apps/api/__tests__/orchestratorDecide.test.ts`
   - `apps/api/__tests__/specDraftRepository.emulator.test.ts`
5. `feat(api): upload spec draft attachments`
   - `apps/api/(shared)/lib/storage.ts`
   - `apps/api/(shared)/lib/attachment-name.ts`
   - `apps/api/(shared)/validation/attachment.schema.ts`
   - `apps/api/app/(routes)/boards/[id]/attachments/route.ts`
   - `apps/api/(shared)/lib/board-view.ts`
   - `apps/api/__tests__/attachmentSchema.test.ts`
   - `apps/api/__tests__/boardsRoutes.test.ts`
   - `apps/api/__tests__/cardRunsRoutes.test.ts`
   - `apps/api/__tests__/mcpRoute.test.ts`
6. `feat(api): create, approve and discard spec drafts`
   - `apps/api/(shared)/lib/spec-draft.ts`
   - `apps/api/(shared)/validation/spec-draft.schema.ts`
   - `apps/api/app/(routes)/boards/[id]/drafts/route.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/approve/route.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/discard/route.ts`
   - `apps/api/__tests__/specDraft.test.ts`
   - `apps/api/__tests__/specDraftRoutes.test.ts`
7. `feat(api): serve the draft request and attachments to agents`
   - `apps/api/(shared)/lib/agent-contract/agent-card-view.ts`
   - `apps/api/(shared)/lib/agent-contract/agent-tools.ts`
   - `apps/api/(shared)/lib/agent-contract/mcp.ts`
   - `apps/api/__tests__/agentMcp.test.ts`
   - `apps/api/__tests__/agentToolsRoutes.test.ts`
   - `apps/api/__tests__/agentContract.emulator.test.ts`
   - `apps/api/__tests__/runnerClaim.emulator.test.ts`
8. `feat(app): show the drafts column on the board`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/groupCardsByColumn.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardColumnTitle.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardColumn.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardColumns.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/stageColumnName.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardQuestions.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardArtifacts.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardTimeline.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/RunnerList.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/TriggerStageDialog.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/useStageRunDialogs.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/groupCardEvents.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/cardRunReason.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/boardConfigIssueMessage.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useBoardCardCrud.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useCardEventCrud.tsx`
   - `apps/app/__tests__/boardColumnsMove.test.tsx`
   - `apps/app/__tests__/groupCardsByColumn.test.ts`
   - `apps/app/__tests__/runCardFixtures.ts`
   - `apps/app/__tests__/useBoardCardCrud.test.tsx`
   - `apps/app/__tests__/useCardEventCrud.test.tsx`
9. `feat(app): start a spec draft from the board`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/NewSpecDialog.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/DraftAttachmentList.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/DraftCardControls.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/draftCardStatus.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(validations)/newSpecSchema.ts`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useSpecDraftCrud.tsx`
   - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/BoardClient.tsx`
   - `apps/app/__tests__/newSpecSchema.test.ts`
   - `apps/app/__tests__/useSpecDraftCrud.test.tsx`
   - `apps/app/__tests__/newSpecDialog.test.tsx`
   - `apps/app/__tests__/draftCardControls.test.tsx`
10. `feat(app): add the spec draft page`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecDraftDetail.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/SpecDraftActions.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx`
    - `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/CardRunControls.tsx`
    - `apps/app/__tests__/specDraftDetail.test.tsx`
    - `apps/app/__tests__/specDraftActions.test.tsx`
11. `feat(internationalization): add spec draft copy and error codes`
    - `packages/internationalization/translations/apps/app/pages/common/boards.ts`
    - `packages/internationalization/translations/packages/shared/utils.ts`
12. `feat(claude): run /spec in board mode for spec drafts`
    - `kit/commands/spec.md`
    - `kit/commands/analyze.md`
    - `kit/.kanban/board.yml`
    - `kit/README.md`
    - `.claude/commands/spec.md`
    - `.claude/commands/analyze.md`
    - `.kanban/board.yml`
13. `docs(board): describe spec drafts and get_attachment`
    - `docs/board/ARCHITECTURE.md`
    - `docs/board/CONTRACT.md`
    - `docs/board/IMPORT.md`
14. `docs(features): spec-authoring`
    - `docs/features/spec-authoring/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md`, `test/criterios-aceite.md`, `test/report.md`)

Os commits 1 e 2 deixam a API e o app sem compilar até o 8 (`CardLane` novo e `CardDTO` com campos obrigatórios). É o custo de separar por pacote; a branch só é avaliada inteira, no CI da PR.

A pasta `docs/features/spec-authoring/` foi varrida: sem senha, token, chave ou e-mail de pessoa.

**Commits realizados:** (preenchido pelo orquestrador)
