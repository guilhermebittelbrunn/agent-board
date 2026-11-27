# Handoff do develop: escrever spec com um agente

Implementação do plano [`analyze/plan.md`](../analyze/plan.md), na rodada autônoma do `/cycle`. Nada foi commitado; tudo está no working tree da branch `guilhermebittelbrunn/chore-overnight-cycle-specs`.

## Blueprint → arquivos

| Item do plano (10.1) | Arquivos |
|----------------------|----------|
| 1. Contrato: etapa `spec` reservada e bloco `specAuthoring` | `packages/kanban-contract/src/boardConfig.ts` (`SPEC_STAGE_KEY`, `specAuthoringConfigSchema`, regra `stage_key_reserved`, `SLUG_PLACEHOLDER` exportado), `boardConfigIssues.ts`, `specAuthoring.ts` (novo: `findStageConfig`, `specAuthoringStage`, `specDraftPath`, `draftStatus`, `canApproveSpec`, `ATTACHMENT_*`, `DRAFT_REQUEST_MAX`), `boardLanes.ts` (`drafts` primeiro), `run.ts` (`cardRunActions` aceita `drafts`), `index.ts`; testes em `__tests__/boardConfig`, `boardLanes`, `run`, `specAuthoring` (novo) |
| 2. Contrato: `get_attachment` e pedido no `get_card` | `agentContract.ts` (`getAttachmentInputSchema`, ferramenta no MCP), `agentResults.ts` (`CardOrigin`, `AgentCardRequest`, `AgentAttachmentContent`, `card.origin`, `request`); teste em `agentContract.test.ts` |
| 3. SDK | `packages/sdk/src/types/board/card.ts` (`origin`, `request`, `specApproval`, `spec.ref`, `UploadedAttachmentDTO`, `CreateSpecDraftRequest/ResultDTO`), `types/board/member.ts` (`storageAvailable`), `actions/boardDraft/action.ts` (novo, registrado no `Client`), `actions/boardCard/action.ts` (`approveSpec`, `discardDraft`) |
| 4. API: anexos | `(shared)/validation/attachment.schema.ts` (novo), `(shared)/lib/storage.ts` (`readObject`, `readObjectMetadata`, `isAttachmentObjectPath`, `objectIdOf`), `app/(routes)/boards/[id]/attachments/route.ts` (novo) |
| 5. API: criar rascunho e rodar `spec` | `(shared)/mappers/card.mapper.ts`, `(shared)/repositories/card.repository.ts` (`isIdTaken`, `createDraft`, `approveDraft`, `discardDraft`, `move` recusa rascunho), `(shared)/lib/spec-draft.ts` (novo), `(shared)/validation/spec-draft.schema.ts` (novo), `boards/[id]/drafts/route.ts` (novo), `orchestrator/decide.ts`, `orchestrator/orchestrator.ts` (`resumeAfterAnswer`), `card-events.ts`, `card-move.ts`, `card-order.ts`, `board-view.ts`, `github/github-fake-client.ts` |
| 6. API: aprovar e descartar | `cards/[slug]/spec/approve/route.ts`, `cards/[slug]/spec/discard/route.ts` (novos), `cards/[slug]/spec/route.ts` lê em `spec.ref ?? baseBranch`, `cards/[slug]/move/route.ts` (status do código novo) |
| 7. API: sincronização | `(shared)/lib/card-sync.ts` (card `origin: board` não vira órfão; rascunho não é tocado pelo índice; `spec.ref: null` quando o slug aparece na base; `RESERVED_CARD_SLUGS` exportado) |
| 8. API: anexos para o agente | `agent-contract/agent-tools.ts` (`get_attachment`), `agent-card-view.ts` (`request`, `origin`, spec lida na `spec.ref`), `mcp.ts` (conteúdo `image`/`text`/`resource`) |
| 9. App: coluna Rascunhos | `groupCardsByColumn.ts`, `boardColumnTitle.ts`, `BoardColumn.tsx` (subtítulo e botão `+`), `BoardColumns.tsx` (dica vazia, rascunho sem arraste nem menu), `stageColumnName.ts` (novo) usado em `CardQuestions`, `CardArtifacts`, `RunnerList`, `TriggerStageDialog`, `useStageRunDialogs`, `useCardEventCrud`; `groupCardEvents.ts` e `CardTimeline.tsx` com `findStageConfig`; `cardRunReason.ts` aceita `drafts`; `useBoardCardCrud.tsx` (otimista mantém `drafts` ao rodar `spec`) |
| 10. App: diálogo Nova spec | `NewSpecDialog.tsx`, `DraftAttachmentList.tsx`, `DraftCardControls.tsx`, `draftCardStatus.ts`, `(validations)/newSpecSchema.ts`, `(hooks)/useSpecDraftCrud.tsx` (novos), `BoardClient.tsx` (botão no cabeçalho, `+` da coluna, aprovar pelo card) |
| 11. App: página do rascunho | `SpecDraftDetail.tsx`, `SpecDraftActions.tsx` (novos), `CardDetailClient.tsx` (ramo `drafts`, aba Spec omitida no rascunho, link do GitHub usa `spec.ref`) |
| 12. i18n | `translations/apps/app/pages/common/boards.ts` (`drafts.*`, colunas, `issues.stageKeyReserved`), `translations/packages/shared/utils.ts` (8 códigos) |
| 13. Comandos e kit | `kit/commands/spec.md` (novo), `.claude/commands/spec.md` (mesmo trecho), linha de card vindo de Rascunhos em `kit/commands/analyze.md` e `.claude/commands/analyze.md`, bloco comentado em `kit/.kanban/board.yml` e `.kanban/board.yml`, `kit/README.md` |
| 14. Docs do board | `docs/board/CONTRACT.md`, `ARCHITECTURE.md`, `IMPORT.md` |

## Contrato e raio de impacto

- `CardLane` ganhou `drafts`. Todo `Record<CardLane, …>` e todo `if` sobre `lane` no app e na API foi revisto (`rg "lane ===|\.lane\b"`); `card-order.ts` ganhou o rank de `drafts`.
- `CardDTO` ganhou `origin`, `request`, `specApproval` e `spec.ref`. Os fixtures de teste do app e da API que montam `CardDTO` à mão foram atualizados.
- `CardRecord` deixou de ser `CardDTO & {…}`: o `request` do registro guarda `attachments[].path`, e `toCardDTO` remove o caminho.
- `BoardViewDTO.storageAvailable` sai de `toBoardView`, que agora importa `storage.ts`. Por isso quatro testes de rota que não mockavam o Storage passaram a mockar (`agentToolsRoutes`, `boardsRoutes`, `cardRunsRoutes`, `mcpRoute`): sem o mock, o import puxa `server-only` e o arquivo nem carrega.
- MCP: `tools/list` passou de cinco para seis ferramentas (`agentMcp.test.ts` atualizado).

## Códigos de erro novos

`SPEC_DRAFT_ATTACHMENT_INVALID`, `SPEC_DRAFT_SLUG_UNAVAILABLE`, `CARD_DRAFT_NOT_APPROVED`, `CARD_NOT_DRAFT`, `CARD_SPEC_NOT_READY`, `CARD_SPEC_DRAFT_MISSING`, `CARD_SPEC_DRAFT_INVALID`, `AGENT_ATTACHMENT_NOT_FOUND`. Os oito estão em `apiErrors`; `apiErrorCodesTranslated` passa (dentro do `api:test` abaixo). `AGENT_ATTACHMENT_NOT_FOUND` e o `STORAGE_NOT_CONFIGURED` do `get_attachment` estão em `docs/board/CONTRACT.md`.

## Desvios do plano

1. **Regex de caminho do Storage separada, não ampliada.** O plano condicionava: se `isStorageObjectPath` tivesse consumidor de imagem, separar. Tem dois, `entity-photo.ts` e `account-avatar.ts`; ampliar a regex faria um PDF passar como foto. Criei `isAttachmentObjectPath` e mantive a regex de imagem como estava.
2. **Fake do GitHub só sintetiza rascunho no caminho padrão.** O fake não conhece o `board.yml`, então responde com um rascunho `status: proposed` e `id: <slug>` apenas para `specs/features/<slug>.md` lido numa ref diferente da padrão. Um board de emulador com `specAuthoring.path` personalizado não vai conseguir aprovar.
3. **Testes de rota consolidados.** O plano listava `specDraftRoute`, `specApproveRoute` e `boardAttachmentRoute`; ficou um arquivo, `apps/api/__tests__/specDraftRoutes.test.ts`, com os mesmos casos (20 testes).
4. **Schema do diálogo em `(validations)/newSpecSchema.ts`**, não em `(components)/newSpecDialogSchema.ts`, que é onde o repositório guarda os schemas de formulário (`cardEventSchemas.ts`, `stageSettingsSchema.ts`).
5. **Rótulo da coluna da etapa `spec` vem do dicionário.** `findStageConfig` devolve `column: "Rascunhos"` (constante `SPEC_DRAFT_COLUMN` do contrato, usada só como dado). A tela usa `stageColumnName()`, que troca a etapa `spec` por `boards.board.columns.drafts`.
6. **Aprovar com run vivo ou pergunta aberta recusa com `CARD_SPEC_NOT_READY`** também dentro da transação (`approveDraft`), além da checagem antes de ler o GitHub. O plano falava em "reler dentro da transação" sem dizer qual código sai.
7. **Fora do plano, encontrado no caminho:** a mutação otimista `triggerMutation` do `useBoardCardCrud` punha `lane: "stage"` em qualquer disparo. Com "Rodar de novo" num rascunho, o card iria por um instante para uma coluna `stage:spec` inexistente, que o board desenha como "Etapa removida". Corrigido para manter `drafts` quando a etapa é `spec`.

Nenhuma decisão do plano me pareceu errada a ponto de ser revertida.

## Decisões em aberto e pendências

- **Barra "N de 8 seções prontas", slug escolhido pelo agente e escrita de `status: approved` no arquivo** continuam fora, como o plano decidiu.
- **Limite de imagem do modelo:** o plano pedia conferir. A referência da Claude API consultada em 2026-11-27 (skill `claude-api`) confirma PDF em base64 até 32 MB por requisição e 600 páginas; o limite por imagem em bytes não aparece nela. Fica a verificar na documentação de visão antes da primeira rodada real.
- **PDF via MCP (`resource` com `blob`)**: risco 6 do plano, segue aberto. Só o agente real confirma se o Claude Code repassa o PDF ao modelo.
- **`specAuthoring.runners`** é aceito e documentado, mas nada no orquestrador filtra executor por `runners` (o mesmo vale hoje para `stages[].runners`).
- **Anexo enviado e não usado** fica no bucket, como o plano aceitou.

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 1001 arquivos, sem erro |
| Typecheck + testes | `pnpm turbo run typecheck test --filter=@repo/kanban-contract --filter=@repo/sdk --filter=api --filter=app --filter=@repo/internationalization --filter=runner` | 18/18 tarefas; `kanban-contract` 144 testes, `sdk` 9, `api` 1327 (110 arquivos, inclui `apiErrorCodesTranslated`), `app` 899 (116 arquivos), `internationalization` 35, `runner` 46 |
| `board.yml` deste repo e do kit | teste temporário com `parseBoardConfigYaml`, apagado depois | os dois validam e trazem os padrões de `specAuthoring` |
| `test:emulator` | não rodado | exige JDK 21 e emuladores; nenhum teste novo depende deles, mas as transações novas do `card.repository` (`createDraft`, `approveDraft`, `discardDraft`) só foram exercitadas pelo fake em memória |

Antes de rodar os gates foi preciso `pnpm install --frozen-lockfile --prefer-offline`: o worktree estava sem `node_modules`.

Smoke local: não subi app nem API.

## A verificar no `/test`

Nenhum comportamento de tela foi medido. Tudo abaixo é hipótese com o repro sugerido; o roteiro completo está na seção 9 do plano.

- Coluna Rascunhos aparece antes de Tarefas com subtítulo, contagem e `+` só para operador. Repro: abrir o quadro como `operator` e como `viewer`.
- Nova spec só com texto cria o card, navega para a página dele e, com o executor `fake`, chega a "Spec pronta". Repro: fluxo 1 do plano.
- Com o emulador de Storage, PNG e PDF sobem e aparecem com tamanho; `.txt` binário, arquivo de 4 MiB e sexto anexo são recusados com mensagem por item. Repro: fluxos 2 e 8.
- Sem Storage, a área de anexos some com o aviso e o pedido em texto funciona; `POST /boards/<id>/attachments` responde `503 STORAGE_NOT_CONFIGURED`. Repro: fluxo 9.
- Sem executor, "Começar a spec" fica desabilitado com o aviso e `POST /boards/<id>/drafts` responde `503 RUN_EXECUTOR_UNAVAILABLE` sem criar card. Repro: fluxo 11.
- Pergunta aberta deixa "Aprovar spec e mandar para Tarefas" desabilitado com a dica certa; aprovar leva o card ao fim de Tarefas com o título do rascunho sintético e ele arrasta para Análise. Repro: fluxos 3 a 5 (o executor de teste precisa de um script com `needs_input`).
- Descartar mostra a branch na confirmação, volta ao quadro e o card some. Repro: fluxo 6.
- Rascunho não arrasta e não tem menu "Mover". Repro: fluxo 7, inclusive em 390 px.
- Layout da página do rascunho (duas colunas em `lg`, uma no celular), light e dark.

## Lacunas de teste conhecidas

- Nenhum teste de componente para `NewSpecDialog`, `SpecDraftDetail` e `DraftCardControls`; a cobertura de UI fica para o `/test`.
- `card.repository` (`createDraft` com colisão concorrente, `approveDraft`, `discardDraft`) não tem teste contra o emulador.
- `readObject`/`readObjectMetadata` do `storage.ts` não têm teste próprio; só aparecem mockados.
