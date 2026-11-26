# Handoff do /develop: card-timeline

Implementação do plano `analyze/plan.md`, feita no `/cycle` noturno sem perguntas. Nada foi commitado. A branch
continua `guilhermebittelbrunn/chore-cycle-three-tasks`, com as tarefas 1 a 6 (`github-app-integration`,
`github-sign-in`, `board-import`, `board-members`, `card-backlog`, `theme-toggle`) também no working tree sem
commit. O plano foi escrito antes da `card-backlog` existir; onde o código real diverge, segui o código e listei
abaixo.

## Blueprint → arquivos

### Contrato (`packages/kanban-contract`)

| Item | Arquivos |
|------|----------|
| `MAX_MARKDOWN` exportado, tipos `Question`, `PostUpdateInput`, `AttachArtifactInput` | `src/agentContract.ts` |
| Tipos e regras do evento | `src/cardEvent.ts` (novo): `CARD_EVENT_TYPES`, `CardEventAuthor`, `CardPendingAsk`, `MAX_ANSWER_TEXT` (2000), `answerSchema`, `answerQuestionsInputSchema`, `cardCommentInputSchema`, `ResolvedAnswer`, `resolveAnswers`, `displayCardState` |
| Papéis | `src/roles.ts`: `canAnswerQuestions` (`operator`+), `canCommentOnCards` (qualquer papel efetivo) |
| Exportação | `src/index.ts` |
| Testes | `__tests__/cardEvent.test.ts` (novo), `__tests__/roles.test.ts` (um caso) |

### SDK (`packages/sdk`)

| Item | Arquivos |
|------|----------|
| Tipos | `src/types/board/cardEvent.ts` (novo): `CardEventDTO` discriminado por `type`, `CardEventViewDTO` (`isOwn`), `CardCommentRequest`, `AnswerQuestionsRequest`, `AnswerQuestionsResultDTO`; `src/types/board/index.ts` reexporta |
| `CardDTO.pendingAsk` | `src/types/board/card.ts` |
| Action | `src/actions/boardCard/action.ts`: `listEvents`, `comment`, `editComment`, `deleteComment`, `answer` |

### API (`apps/api`)

| Item | Arquivos |
|------|----------|
| Capacidades `comment` e `answer` | `(shared)/lib/board-access.ts` |
| Mapper do evento | `(shared)/mappers/card-event.mapper.ts` (novo): `CARD_EVENT_TABLE = "cardEvent"`, `CardEventDocument`, `CardEventWrite`, `cardEventDocument`, `cardEventMapper`, `isOwnComment`, `toCardEventView` |
| `pendingAsk` no card | `(shared)/mappers/card.mapper.ts` (`toPendingAsk`, lido no `toDTO`) |
| Funções puras | `(shared)/lib/card-events.ts` (novo): `agentEventFromTool`, `normalizeArtifactPath`, `personAuthor`, `planAnswer` |
| Repositório | `(shared)/repositories/card-event.repository.ts` (novo): `listByCard`, `findInCard`, `appendComment`, `editComment`, `removeComment`, `appendAgentEvent` (transação, abre `pendingAsk`), `answer` (transação) |
| Validação | `(shared)/validation/card-event.schema.ts` (novo): `parseCardComment`, `parseAnswerQuestions` |
| Rotas | `app/(routes)/boards/[id]/cards/[slug]/events/route.ts` (GET, `view`), `comments/route.ts` (POST, `comment`), `events/[eventId]/route.ts` (PATCH e DELETE, `comment`), `answers/route.ts` (POST, `answer`) |
| Fixture do `/test` | `scripts/seed-card-timeline.mjs`, `scripts/cardTimelineFixture.mjs`, `scripts/fixtures/card-timeline.json` (novos); script `seed:timeline` em `package.json` |
| Testes | `__tests__/cardEvents.test.ts`, `cardEventMapper.test.ts`, `cardEventsRoutes.test.ts`, `cardTimelineFixture.test.ts`, `fakeCardEventRepository.ts` (novos) |

### App (`apps/app`)

Prefixo: `app/[locale]/(authenticated)/(common)/(pages)/boards/`.

| Item | Arquivos |
|------|----------|
| Chave de cache | `shared/lib/queryKeys.ts`: `boards.cardEvents(id, slug)`, debaixo de `boards.cards(id)` |
| Hooks | `(hooks)/useListCardEvents.tsx` (`useListCardEvents` + `fetchCardEvents`), `(hooks)/useCardEventCrud.tsx` (novos) |
| Schemas | `(validations)/cardEventSchemas.ts` (novo): `buildCardQuestionsSchema`, `buildCardCommentSchema`, `initialQuestionAnswers`, `toAnswers` |
| Helpers puros | `(components)/groupCardEvents.ts`, `(components)/latestArtifacts.ts` (novos) |
| Componentes | `(components)/CardQuestions.tsx`, `CardTimeline.tsx`, `CardEventItem.tsx`, `CardArtifacts.tsx` (novos) |
| Selo pelo `displayCardState` | `(components)/BoardCardItem.tsx`, `(pages)/[id]/cards/[slug]/CardDetailClient.tsx` |
| Detalhe com perguntas e abas | `(pages)/[id]/cards/[slug]/CardDetailClient.tsx` (componente `CardActivity`) |
| Prefetch dos eventos | `(pages)/[id]/cards/[slug]/page.tsx` |
| Testes | `__tests__/groupCardEvents.test.ts`, `latestArtifacts.test.ts`, `cardQuestionsForm.test.tsx`, `useCardEventCrud.test.tsx`, `cardEventFixtures.ts` (novos) |

### Design system (`packages/design-system`)

`components/ui/radio-group-input.tsx`: `RadioOption` ganhou `description` e `badge` opcionais, desenhados abaixo e ao
lado do rótulo. É o que permite usar `HookFormRadioGroup` com a descrição da opção e o selo "Recomendado".

### i18n (`packages/internationalization`)

- `translations/apps/app/pages/common/boards.ts`: dentro de `cardDetail`, os blocos `tabs`, `questions`,
  `timeline` e `artifacts`.
- `translations/packages/shared/utils.ts`: os cinco códigos novos (ver abaixo).

### Docs

- `docs/board/ARCHITECTURE.md`: `events` virou `cardEvent` com os campos reais; `card` ganhou `pendingAsk`.
- `docs/SETUP.md`: como popular a linha do tempo com `seed:timeline`.
- `docs/PRE-PRODUCTION.md`: sem mudança. Nenhuma env, rule, índice ou dependência nova.

## Contrato mexido e quem consome

- `CardDTO.pendingAsk: CardPendingAsk | null`, obrigatório no tipo. A API sempre preenche (o mapper devolve `null`
  quando o campo falta ou está incompleto). Consumidores: todo lugar que recebe `CardDTO` (quadro, detalhe, hooks
  de cards). Três testes do app montam `CardDTO` à mão e ganharam `pendingAsk: null` no arranjo.
- `Client.boardCard` ganhou cinco métodos; só os hooks novos e o `page.tsx` do detalhe chamam.
- `RadioOption` ganhou dois campos opcionais; os usos atuais não mudam.
- `BoardCapability` ganhou `comment` e `answer`.

## Códigos de erro novos

| Código | Status | Onde |
|--------|--------|------|
| `CARD_QUESTIONS_NOT_PENDING` | 409 | answers |
| `CARD_ANSWERS_MISMATCH` | 422 | answers |
| `CARD_EVENT_NOT_FOUND` | 404 | events/[eventId] |
| `CARD_EVENT_NOT_EDITABLE` | 403 | events/[eventId] |
| `CARD_ARTIFACT_PATH_INVALID` | sem rota ainda | retorno de `agentEventFromTool` |

Os cinco estão em `apiErrors`. `apiErrorCodesTranslated.test.ts` passa.

## Desvios em relação ao plano

1. **`CARD_ARTIFACT_PATH_INVALID` entrou em `apiErrors`.** O plano dizia que não entraria porque nenhuma rota o
   devolve. Mas o `apiErrorCodesTranslated.test.ts` varre `(shared)/` atrás de qualquer literal `UPPER_SNAKE`, e o
   código está em `card-events.ts`. Sem a copy, o teste falha. A frase já serve ao `agent-contract`.
2. **`displayCardState` mora no contrato**, não em `(components)/` do app. É regra do domínio (o `orchestrator`
   precisa saber que o selo olha `pendingAsk` e `state`), e a regra 12 manda o domínio para o contrato. O teste
   ficou em `kanban-contract/__tests__/cardEvent.test.ts`.
3. **`planAnswer` puro em `card-events.ts`.** A decisão da transação de resposta (card existe, pergunta é a
   pendente, do mesmo card, respostas batem) virou função pura usada pela transação real e pelo repositório falso.
   Assim os testes de rota exercitam a mesma regra que roda no Firestore, sem emulador.
4. **`CardEventViewDTO` com `isOwn`.** O app precisa saber quais comentários são de quem lê para mostrar o menu
   "⋯", e não tem o id do perfil à mão. As rotas que devolvem evento a uma pessoa calculam `isOwn` no servidor, como
   `isSelf` dos membros. `listByCard` continua devolvendo `CardEventDTO` puro para o `agent-contract`.
5. **`agentEventFromTool` recebe `{ tool, input }` discriminado**, não `(tool, input, ctx)` separados, para o
   TypeScript ligar a ferramenta ao tipo da entrada. Também não recebe `now`: a data é do repositório.
6. **Apagar comentário usa a confirmação do próprio `ActionsMenu`** (`Popconfirm` com `deleteLabels`), não um
   `alert-dialog.tsx` separado. É o componente que o plano manda usar para o menu e já confirma o apagar.
7. **Estado "Aguardando resposta" na pergunta.** O plano tinha só "Respondida" e "Sem resposta". A pergunta que
   ainda está pendente no card mostra "Aguardando resposta"; "Sem resposta" fica para a que um `ask` novo
   substituiu. Chave `timeline.questionPending`.
8. **Schemas do formulário em `(validations)/cardEventSchemas.ts`**, não em `(components)/cardQuestionsSchema.ts`.
   É a pasta que o app usa (`inviteMemberSchema.ts`).
9. **Nomes da `card-backlog`.** Hook do card é `useFindBoardCardBySlug`; código de validação é
   `VALIDATION_FAILED`; `SpecMarkdown` já recebia a base dos links por prop (`links`), então não mudou. Nos
   eventos, a base é a raiz do repositório (`documentPath: ""`) na branch do card, ou na `baseBranch` quando o card
   não tem branch.
10. **Comentário de outro card ou board.** O plano pedia 404 `CARD_EVENT_NOT_FOUND`; a rota faz isso lendo o card
    pelo board da URL e conferindo o `cardId` do evento (`findInCard`). A resposta de uma pergunta faz a mesma
    conferência dentro da transação.
11. **Tamanho dos inputs.** Comentário: 1 a 20.000 caracteres depois de `trim` (`MAX_MARKDOWN`). Resposta livre: 1
    a 2.000. `questionEventId`: até 128 caracteres. Tudo validado na borda com os schemas do contrato; o formulário
    do app repete os limites só para mostrar o erro no campo.

Nenhuma decisão consolidada do plano foi reaberta.

## Separar os commits

Arquivos que já tinham diff de tarefas anteriores e o trecho que é desta:

| Arquivo compartilhado | Trecho desta tarefa |
|-----------------------|---------------------|
| `packages/kanban-contract/src/roles.ts` | As funções `canAnswerQuestions` (com o comentário) e `canCommentOnCards` |
| `packages/kanban-contract/src/index.ts` | `export * from "./cardEvent";` |
| `packages/kanban-contract/__tests__/roles.test.ts` | Imports de `canAnswerQuestions`/`canCommentOnCards` e o teste "lets operators and above answer questions, and every member comment" |
| `packages/sdk/src/types/board/card.ts` | Import de `CardPendingAsk` e o campo `pendingAsk` |
| `packages/sdk/src/types/board/index.ts` | `export * from "./cardEvent";` |
| `packages/sdk/src/actions/boardCard/action.ts` | Os imports novos e os métodos de `listEvents` até `answer` |
| `apps/api/(shared)/lib/board-access.ts` | Imports de `canAnswerQuestions`/`canCommentOnCards`, `"comment"`/`"answer"` em `BoardCapability` e no `CAPABILITY_CHECK` |
| `apps/api/(shared)/mappers/card.mapper.ts` | Import de `CardPendingAsk`, a função `toPendingAsk` e a linha `pendingAsk:` em `toDTO` |
| `apps/api/package.json` | A linha `seed:timeline` |
| `apps/app/shared/lib/queryKeys.ts` | `cardEvents` em `boards` |
| `.../boards/(components)/BoardCardItem.tsx` | Import de `displayCardState` e `state={displayCardState(card)}` |
| `.../boards/(pages)/[id]/cards/[slug]/page.tsx` | O `prefetchQuery` de `cardEvents` |
| `.../boards/(pages)/[id]/cards/[slug]/CardDetailClient.tsx` | Imports de `Tabs*`, `canAnswerQuestions`/`canCommentOnCards`/`displayCardState`, `CardEventViewDTO`, `useAuthRequestPanel`, `CardArtifacts`, `CardQuestions`, `CardTimeline`, `useCardEventCrud`, `useListCardEvents`; `displayCardState(card)` no `CardSummary`; as funções `pendingQuestionsOf` e `CardActivity`; `<CardActivity>` no lugar de `<SpecSection>` no `CardDetailClient` |
| `apps/app/__tests__/boardColumnsMove.test.tsx`, `groupCardsByColumn.test.ts`, `useBoardCardCrud.test.tsx` | A linha `pendingAsk: null` no fixture do card |
| `translations/apps/app/pages/common/boards.ts` | Os blocos `tabs`, `questions`, `timeline` e `artifacts` dentro de `cardDetail` |
| `translations/packages/shared/utils.ts` | De `CARD_QUESTIONS_NOT_PENDING` até `CARD_ARTIFACT_PATH_INVALID` |
| `docs/board/ARCHITECTURE.md` | A frase das coleções existentes, o `pendingAsk` na linha `card` e a linha `cardEvent` |
| `docs/SETUP.md` | O bloco do `seed:timeline` depois da tabela do backlog do `sample-app` |

`packages/kanban-contract/src/agentContract.ts` e `packages/design-system/components/ui/radio-group-input.tsx`
não tinham diff antes; entram inteiros.

Ordem sugerida (o plano, 10.10, ajustado): contrato; SDK; `feat(design-system)` com o `radio-group-input.tsx`;
API, eventos e leitura (mapper, `pendingAsk`, `card-events.ts`, repositório, `GET events`, testes de mapper e puros);
API, comentários e respostas (capacidades, validação, rotas, `fakeCardEventRepository.ts`, `cardEventsRoutes.test.ts`);
API, fixture (`scripts/*`, `package.json`, `cardTimelineFixture.test.ts`); i18n; app, hooks e helpers (com testes);
app, perguntas e selo; app, linha do tempo e artefatos; docs; `docs(features): card-timeline`. O i18n vem antes do
app para cada commit do app passar no typecheck. `CARD_ARTIFACT_PATH_INVALID` está em `card-events.ts`, então o
commit da API que traz esse arquivo só passa no `apiErrorCodesTranslated` se a copy já existir; se o `/review`
quiser cada commit verde, ponha o i18n antes da API.

## Decisões em aberto e pendências

- Nenhuma pergunta nova. As do plano seguem como estão.
- `questionSchema` do contrato não limita o tamanho de `question`, `label` e `description` (só `header`). Não é
  input de pessoa e o plano não pede; fica para o `agent-contract` decidir junto com a rota.
- Sem smoke local: com o load da máquina acima de 12, não subi emulador, API nem app. Tudo que depende de tela
  está em "A verificar no `/test`".

## Validação

| Gate | Comando | Resultado |
|------|---------|-----------|
| Lint | `pnpm check` | 849 arquivos, sem erro |
| Typecheck | `pnpm turbo run typecheck --filter=api --filter=app --filter=@repo/sdk --filter=@repo/kanban-contract --filter=@repo/internationalization --filter=@repo/design-system` | 6 de 6 |
| Testes | `pnpm turbo run test --filter=api --filter=app --filter=@repo/kanban-contract --filter=@repo/design-system` | 11 de 11 tasks; contrato 102, API 1100 (91 arquivos), app 835 (109 arquivos), design system 148 |
| `apiErrors` | `apiErrorCodesTranslated.test.ts` (na suíte da API) | passa |

`test:emulator` não rodou: nenhuma rule nem índice mudou, e as consultas novas usam só igualdade.

Medido nos testes de rota (`cardEventsRoutes.test.ts`, repositórios em memória, guard real):
- `qa-reader` (operator no board, `read` no GitHub) lê eventos e comenta (201), e recebe 403
  `BOARD_ROLE_INSUFFICIENT` ao responder.
- Responder fecha `pendingAsk` e grava `answeredByEventId`; a segunda resposta recebe 409
  `CARD_QUESTIONS_NOT_PENDING`; responder perguntas substituídas por um `ask` novo também.
- Opção 3 numa pergunta de 2 opções: 422 `CARD_ANSWERS_MISMATCH`, e a pendência continua aberta.
- O `owner` não edita nem apaga comentário do operador (403 `CARD_EVENT_NOT_EDITABLE`); evento de agente também
  não; evento de outro card e de outro board dá 404 `CARD_EVENT_NOT_FOUND` e não é alterado.
- Comentário vazio, comentário acima de 20.000 caracteres e resposta livre acima de 2.000: 400 `VALIDATION_FAILED`.
- Admin personificando recebe 403 ao comentar.
- Comentar, editar, apagar e responder não mudam `lane`, `stageKey` nem `state` do card.

Medido em `cardTimelineFixture.test.ts`: o script `seed-card-timeline.mjs`, executado com `node` sem os hosts do
emulador, sai com código 1 e "Refusing to seed"; com os hosts e projeto `agent-board-prod`, também sai com 1. Cada
documento da fixture passa pelo mapper sem perder campo, e perguntas, artefato e atualizações passam nos schemas do
contrato.

## A verificar no `/test`

Repro: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*` (`docs/SETUP.md`), importar `sample-app`,
sincronizar o backlog, mover "Busca por texto nos cards" para Análise e rodar
`pnpm --filter api seed:timeline agent-board-demo--sample-app search-cards`. Nada abaixo foi medido nesta etapa.

- O script contra o emulador de verdade: grava os nove eventos e abre `pendingAsk` (só a recusa foi medida).
- `appendAgentEvent` e `answer` em transação real do Firestore: nenhum teste roda contra o emulador. O
  `GET events` (`cardId ==` + `deletedAt == null`) não pode pedir índice composto.
- T1 a T11 do plano (seção 8): selo "Aguardando você" no quadro; bloco "A Análise parou com 2 perguntas" com a
  recomendada marcada e a segunda sem marcação; grupos Executando, Análise e "Etapa removida (legacy)", mais recente
  em cima; `<script>` e `javascript:` como texto e tabela desenhada no relatório com o selo "Pediu retrabalho";
  link relativo do relatório apontando para o GitHub na branch do card; chip do artefato com sha curto e link no
  sha; aba Artefatos; enviar sem escolher; "Escrever outra resposta"; duas abas respondendo (toast de
  `CARD_QUESTIONS_NOT_PENDING` e tela atualizada); comentar, editar, "(editado)" e apagar; o comentário de
  `qa-maintainer` sem menu; `qa-reader` sem radios e com o aviso; personificação sem campo de comentário nem
  responder.
- Botão "Responder" fixo no rodapé abaixo de `md` (`sticky bottom-0` dentro do card); abas e linha do tempo sem
  rolagem horizontal da página em 390 px.
- Borda `border-warning` do bloco de perguntas em claro e escuro.
- O link "Respondida" rola até o evento de resposta (`#card-event-<id>`, `scroll-mt-24`).
- O selo some no quadro depois de responder: o hook invalida `boards.cards(id)` com `exact: true`; conferir que a
  lista é lida de novo ao voltar ao quadro.

## Lacunas de teste conhecidas

- Sem teste de componente para `CardTimeline`, `CardEventItem` (menu do comentário, edição) e `CardArtifacts`. A
  lógica que eles usam (`groupCardEvents`, `latestArtifacts`, `isOwn` vindo da API) tem teste.
- `card-event.repository.ts` sem teste contra o emulador (transações). A regra das duas transações está em
  `planAnswer` e no teste de rota com o falso.
- Sem E2E da linha do tempo.
