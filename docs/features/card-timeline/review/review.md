# Revisão: linha do tempo do card, perguntas e respostas

Revisão da tarefa 7 do `/cycle` noturno, sem perguntas. O working tree também traz as tarefas 1 a 6, já revisadas;
aqui só o diff da `card-timeline` foi lido. O plano de commits no fim cobre as sete tarefas.

## Branch

`guilhermebittelbrunn/chore-cycle-three-tasks`, reutilizada (o orquestrador mandou não criar nem trocar). O regex
de `.claude/rules/git-commits.md` reprova o nome: o prefixo `guilhermebittelbrunn/` não é projeto e
`chore-cycle-three-tasks` não separa tipo e título. É o mesmo veredito das seis revisões anteriores, e a decisão
continua com o `/review`: antes do primeiro commit, criar uma branch válida a partir desta, por exemplo
`feat/board-cards-and-timeline` (vários apps, então sem projeto). Nada foi renomeado.

## Achados

| Sev. | Onde | Problema | Ação |
|------|------|----------|------|
| 🟡 | `packages/kanban-contract/src/agentContract.ts:19-27` | `questionSchema` não limitava `question`, `label` nem `description`. O texto do agente é copiado para o documento do evento e, na resposta, o rótulo da opção é copiado de novo para `answers`. Sem teto, um `ask` com quatro perguntas podia chegar perto do limite de 1 MiB do documento. | Corrigido: 1.000, 120 e 500 caracteres. |
| 🟡 | `packages/kanban-contract/src/agentContract.ts:51-55` | `attach_artifact.path` sem tamanho máximo. | Corrigido: 1.024 caracteres. |
| 🟢 | `.../boards/(components)/CardQuestions.tsx:66` | `key={option.label}`: o contrato não exige rótulos distintos, e dois iguais dão key repetida. | Corrigido: `${optionIndex}-${option.label}`, como as keys das perguntas no mesmo arquivo. |
| 🟡 | `apps/api/(shared)/repositories/card-event.repository.ts:47` | `listByCard` lê todos os eventos do card, sem paginação. Qualquer membro pode comentar, então um card pode crescer sem limite e cada abertura do detalhe paga a leitura inteira. O plano assume "algumas centenas". | Registrado. Dentro do corte do MVP; paginar quando houver número medido. |
| 🟢 | `apps/api/(shared)/mappers/card-event.mapper.ts:179` | `toPersistence` repassa as chaves recebidas, sem whitelist. As escritas do repositório não passam por ele (usam `cardEventDocument`); só o `delete()` da base passa, com `deletedAt`. | Registrado, sem efeito hoje. |
| 🟢 | `.../boards/(hooks)/useListCardEvents.tsx:27` | `data ?? []` cria um array novo a cada render e invalida o `useMemo` de `groupCardEvents` em `CardTimeline`. Custo pequeno com poucas dezenas de eventos. | Registrado. |
| ✅ | rotas `events`, `comments`, `events/[eventId]`, `answers` | Regra 13: as quatro passam por `requireBoardApi` com capacidade (`view`, `comment`, `comment`, `answer`). `answer` exige `operator`+, `comment` qualquer papel efetivo. Personificação cai no `assertReadOnlyWhileImpersonating` do guard comum. | |
| ✅ | `events/[eventId]/route.ts:24-56` | IDOR: o card vem do board da URL (`findBySlug`, que confere `boardId`) e o evento só vale se `cardId` bater (`findInCard`), senão 404 `CARD_EVENT_NOT_FOUND`. Só o autor edita ou apaga (`isOwnComment`, que também recusa evento de agente). | |
| ✅ | `card-event.repository.ts:45-67`, `base.repository.ts` `findById` | Soft delete: `listByCard` filtra `deletedAt == null` e `findById` devolve `null` para documento apagado, então comentário apagado não volta na leitura nem pode ser editado. O texto continua no Firestore, e as rules negam leitura direta (`allow read, write: if false`). | |
| ✅ | `card-event.repository.ts:113-221` | Regra 14: as únicas escritas no card são `pendingAsk` e `updatedAt`. `stageKey` e `lane` aparecem só como campos do evento. O script de fixture também só grava `pendingAsk`. | |
| ✅ | `card-event.repository.ts:154-221`, `card-events.ts` `planAnswer` | Resposta em transação: card e pergunta lidos dentro dela, `planAnswer` exige que `pendingAsk.eventId` seja a pergunta respondida, do mesmo card. Duas respostas simultâneas: o Firestore refaz a perdedora, que encontra `pendingAsk = null` e recebe 409. Pergunta substituída por um `ask` novo também dá 409. | |
| ✅ | `CardEventItem.tsx`, `CardQuestions.tsx` | Regra 16: `update`, `comment` e `report` passam pelo `SpecMarkdown` (tokens do `marked` desenhados em React, sem HTML). Pergunta, opção e resposta livre saem como texto. Nenhum `dangerouslySetInnerHTML`. | |
| ✅ | `card-events.ts:32-45`, `githubFileUrl.ts` | `normalizeArtifactPath` recusa caminho absoluto, `\`, `.` e `..`. Uma URL externa vira caminho dentro do repositório (`https:/evil.com/x`), e o link sempre começa com `https://github.com/<owner>/<repo>/blob/`. `githubFileUrl` codifica cada segmento, então `%2e%2e` vira `%252e%252e` e o navegador não o trata como `..`. | |
| ✅ | `card-event.schema.ts`, `cardEvent.ts` | Borda: comentário 1 a 20.000 depois de `trim`, resposta livre até 2.000, até 4 respostas, `questionEventId` até 128, corpo limitado a 100 KiB pelo `parseRequestJson`. | |
| ✅ | `scripts/seed-card-timeline.mjs:7-14` | `seed:timeline` checa `refuseSeedReason` antes do `initializeApp`: exige os dois hosts de emulador e projeto `demo-*`. | |
| ✅ | `radio-group-input.tsx` | `description` e `badge` opcionais; sem eles a opção renderiza o mesmo `<span className="text-sm">` de antes. Consumidores: `AccountPreferencesForm`, `EntityFormFields` (sem os campos novos) e `CardQuestions`. | |
| ✅ | `CardQuestions.tsx:228` | `border-warning` usa o token `--warning`, definido no claro e no escuro em `globals.css`. | |

O corte do MVP da spec bate com o que foi entregue. Os desvios do handoff (itens 1 a 11) não mudam escopo.

## Correções aplicadas

- `packages/kanban-contract/src/agentContract.ts`: constantes `MAX_QUESTION` (1.000), `MAX_OPTION_LABEL` (120),
  `MAX_OPTION_DESCRIPTION` (500) e `MAX_ARTIFACT_PATH` (1.024), aplicadas em `questionSchema` e em
  `attachArtifactInputSchema`. Nenhum produtor existe ainda (o `agent-contract` não foi construído). A fixture
  usa no máximo 49, 14, 32 e 36 caracteres.
- `docs/board/CONTRACT.md`: a tabela de ferramentas passa a citar esses limites e o formato do `path`.
- `.../boards/(components)/CardQuestions.tsx`: key da opção com índice e rótulo.

## Raio de impacto

- `questionSchema` e `attachArtifactInputSchema`: consumidos hoje só por `cardEvents.test.ts` e
  `cardTimelineFixture.test.ts` (API). O `agent-contract` vai validar com eles.
- `CardDTO.pendingAsk` (obrigatório): quadro, detalhe, hooks de cards e três testes do app, já ajustados pelo
  `/develop`.
- `RadioOption`: três consumidores, nenhum quebra.
- `BoardCapability` ganhou `comment` e `answer`; `CAPABILITY_CHECK` é `Record`, então o typecheck pega capacidade
  sem regra.

## Verificar no `/test`

Repro base: `pnpm emulators` + `pnpm seed` + `pnpm dev`, importar `sample-app`, sincronizar, mover "Busca por
texto nos cards" para Análise e rodar `pnpm --filter api seed:timeline agent-board-demo--sample-app search-cards`.

1. Maior risco: a transação de resposta contra o Firestore real. Duas abas como `qa-operator` respondendo ao
   mesmo tempo: uma recebe 200, a outra 409 `CARD_QUESTIONS_NOT_PENDING`, e o documento da pergunta tem um único
   `answeredByEventId`. Nenhum teste roda o repositório contra o emulador.
2. `GET events` (`cardId ==` e `deletedAt == null`) responde 200 no emulador, sem pedir índice composto.
3. O script grava os nove eventos e abre `pendingAsk` (só a recusa foi medida).
4. IDOR: `PATCH /boards/<id>/cards/<outro-slug>/events/<eventId-do-primeiro-card>` responde 404; `DELETE` de
   comentário de outra pessoa responde 403 `CARD_EVENT_NOT_EDITABLE`.
5. Comentário apagado some da lista depois de recarregar, e `PATCH` nele dá 404.
6. Markdown com `<script>` e link `javascript:` num comentário aparece como texto; artefato com `path` de URL
   abre dentro de `github.com/<owner>/<repo>/blob/`.
7. T1 a T11 do plano e a lista do handoff: selo "Aguardando você", perguntas com a recomendada marcada, grupos por
   etapa, chips de artefato, aba Artefatos, "Escrever outra resposta", `qa-reader` sem radios, personificação sem
   campo de comentário, botão "Responder" fixo abaixo de `md`, 390 px sem rolagem horizontal, `border-warning` no
   claro e no escuro, link "Respondida" rolando até a resposta, selo sumindo no quadro depois de responder.
8. Opção com descrição e selo "Recomendado" no `HookFormRadioGroup`: alinhamento do radio com a primeira linha;
   as telas de Conta e de entidade sem mudança visual.

## Lacunas de teste

- Teste de componente para `CardTimeline`, `CardEventItem` e `CardArtifacts`: continua aberta.
- `card-event.repository.ts` contra o emulador: continua aberta, e é o item 1 acima.
- E2E da linha do tempo: continua aberta.
- Limites novos de `questionSchema` e do `path` sem teste de borda: aberta, cabe no `cardEvent.test.ts` do
  contrato.

## Decisões em aberto

- Nome da branch (ver acima). Recomendação: `feat/board-cards-and-timeline` a partir da atual.
- Paginação de `listByCard`: deixar para quando houver medida. Recomendação: não fazer agora.

## Gates

| Gate | Resultado |
|------|-----------|
| `pnpm check` | 849 arquivos, sem erro |
| `pnpm turbo run typecheck --filter=api --filter=app --filter=@repo/kanban-contract` | 3 de 3 |
| `pnpm --filter api test apiErrorCodes` | 2 de 2 |

Os typechecks de SDK, i18n e design system não foram refeitos: as correções não tocam esses pacotes, e o handoff
mediu 6 de 6. A suíte não foi rodada (é do `/test`).

## Depois do /test, rodada 1

O `/test` (`test/report.md`) achou dois defeitos 🟡 e dois 🟢. Todos foram corrigidos aqui, sem browser.

| Sev. | Defeito | Correção |
|------|---------|----------|
| 🟡 | "Responder" não fica fixo abaixo de `md`. O `sticky bottom-0` ficava preso ao `div` `overflow-auto` do `Container.tsx:68`, que não rola; quem rola é a janela. | `CardQuestions.tsx`: a barra do botão passa a `fixed inset-x-0 bottom-0` abaixo de `md` e volta a `static` a partir de `md`, com `data-sticky-action-bar` para o `scroll-pb-20` do layout raiz não esconder o campo focado. `CardDetailClient.tsx`: um espaçador `h-16 md:hidden` no fim da página enquanto há perguntas e a pessoa pode responder, para a barra não cobrir o fim da linha do tempo. |
| 🟡 | Duas `<textarea id="markdown">` na edição de comentário: o rótulo "Editar comentário" apontava para o campo de comentar. | Na raiz: `HookFormTextarea` aceitava `id` no tipo (herdado de `TextareaInputProps`), mas sobrescrevia com `field.name`. Agora usa `id ?? field.name`. `CardEventItem.tsx` passa `card-comment-edit-<eventId>`. Teste novo: `packages/design-system/__tests__/hookformTextareaId.test.tsx`. |
| 🟢 | "Linha do tempo" vazava da aba: `TabsTrigger` tem `flex-1` dentro de `TabsList` `w-fit`. | `flex-none` nas três abas desta tela. O componente do design system não mudou; `AccountTabs` e o playground ficam como estão. |
| 🟢 | O leitor via "O agente recebe as suas respostas..." sem poder responder. | O subtítulo só aparece para quem responde; o leitor vê só a linha `readOnly` ("Só quem pode disparar etapas responde às perguntas."). |

O selo "Aguardando você" continua igual para todos, no quadro e no detalhe. Ele descreve o estado do card (a
etapa parou esperando uma pessoa), e `displayCardState` é regra do contrato, usada também pelo `orchestrator`.
Condicionar o selo ao papel de quem lê faria o mesmo card mostrar estados diferentes para membros diferentes. Se o
texto do selo incomodar quem só lê, a troca é de copy ("Aguardando resposta") e fica como pergunta de produto.

Por que não o `stickyBar` do `Container`: a barra do `Container` fica fora do `<form>` das perguntas, então o botão
precisaria de `form="..."`, que o `apps/app/CLAUDE.md` pede para evitar, e o estado de envio teria de subir até a
página. A barra `fixed` fica dentro do formulário e só existe enquanto há perguntas.

Raio de impacto do `HookFormTextarea`: nenhum uso atual passa `id` (conferido com grep), então todos continuam com
`id = name`.

Gates depois da rodada: `pnpm check` 851 arquivos sem erro; typecheck de `app` e `@repo/design-system` 2 de 2;
`cardQuestionsForm.test.tsx` 5 de 5; `hookformTextareaId.test.tsx` e `hookformAria.test.tsx` 26 de 26.

A remedição no browser (390 px com o botão fixo, edição de comentário com nome acessível, rótulo da aba) fica para
a passada de QA do `orchestrator`, que abre a mesma tela.

## Plano de commits (tarefas 1 a 7)

> A tarefa 8 (`orchestrator`) acrescentou onze commits e renumerou esta lista. O plano final das oito tarefas está em
> [`orchestrator/review/review.md`](../../orchestrator/review/review.md#plano-de-commits-tarefas-1-a-8); mensagens,
> arquivos e comandos de blob abaixo continuam valendo, exceto os blobs do `index.ts`, que passam a excluir `./run`.

Este plano substitui o de [`theme-toggle/review/review.md`](../../theme-toggle/review/review.md#plano-de-commits-tarefas-1-a-6).
Mensagens, arquivos e comandos de blob de lá e de
[`card-backlog/review/review.md`](../../card-backlog/review/review.md#arquivos-mistos) continuam valendo, com as
mudanças abaixo. A estratégia é a mesma: arquivo misto entra inteiro no primeiro commit que precisa dele.

### Onde a tarefa 7 entra em commits existentes

| Arquivo | Commit (numeração nova) | Por quê |
|---------|-------------------------|---------|
| `packages/kanban-contract/src/roles.ts`, `__tests__/roles.test.ts` | 4 | Funções isoladas; o arquivo já é deste commit. Corpo ganha: `Also adds canAnswerQuestions and canCommentOnCards.` |
| `packages/sdk/src/types/board/card.ts`, `index.ts`, `actions/boardCard/action.ts` + `packages/sdk/src/types/board/cardEvent.ts` (novo) | 11 | O barril e o client já citam os tipos de evento. Corpo ganha: `The card client already lists card events, comments and answers.` |
| `apps/api/package.json` | 14 | Traz a linha `seed:timeline`; o script chega no 32. |
| `apps/api/(shared)/lib/board-access.ts` | 24 | Capacidades `comment` e `answer` já no guard. |
| `apps/api/(shared)/mappers/card.mapper.ts` | 25 | `pendingAsk` já lido pelo mapper. |
| `apps/app/shared/lib/queryKeys.ts` | 36 | Chave `cardEvents`. |
| `useBoardCardCrud.test.tsx` | 40 | `pendingAsk: null` no fixture. |
| `BoardCardItem.tsx`, `groupCardsByColumn.test.ts`, `boardColumnsMove.test.tsx` | 41 | Selo via `displayCardState`. |
| `(pages)/[id]/cards/[slug]/page.tsx`, `CardDetailClient.tsx` | 42 | Já montam `CardActivity`. Typecheck do app fica vermelho até o 45. |
| `translations/packages/shared/utils.ts` | 48 | Os cinco códigos novos. A API fica vermelha no `apiErrorCodes` do 30 ao 47, como já acontecia com os outros códigos. |
| `translations/apps/app/pages/common/boards.ts` | 50 | Blocos `tabs`, `questions`, `timeline`, `artifacts`. |
| `docs/SETUP.md` | 52 | Bloco do `seed:timeline`. |
| `docs/board/ARCHITECTURE.md` | 54 | Mensagem muda para `docs(board): name the board, member, card and card event collections`. |

### Blobs do `packages/kanban-contract/src/index.ts`

O barril agora exporta `./cardEvent`, que só existe a partir do commit 6:

- commit 2: `grep -vE '\./(boardConfigDiff|boardConfigIssues|boardLanes|specBacklog|cardEvent)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 3: `grep -vE '\./(boardLanes|specBacklog|cardEvent)"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- commit 5 (antes ia inteiro): `grep -vE '\./cardEvent"' packages/kanban-contract/src/index.ts | git hash-object -w --stdin`
- em cada um, `git update-index --cacheinfo 100644,<sha>,packages/kanban-contract/src/index.ts`. O commit 6 leva o
  arquivo inteiro com `git add`.

### Numeração

| Novo | No plano de 54 | Commit |
|------|----------------|--------|
| 1 a 5 | 1 a 5 | sem mudança (2, 3 e 5 com os blobs acima) |
| **6** | novo | `feat(kanban-contract): add card events, answers and the displayed card state` |
| 7 | 6 | sem mudança |
| **8** | novo | `feat(design-system): show a description and a badge on radio options` |
| **9** | novo | `fix(design-system): let HookFormTextarea take its own id` |
| 10 a 17 | 7 a 14 | sem mudança (11 com `cardEvent.ts` do SDK) |
| 18 a 29 | 15 a 26 | sem mudança |
| **30** | novo | `feat(api): store card events and list them on the card timeline` |
| **31** | novo | `feat(api): let members comment on cards and answer pending questions` |
| **32** | novo | `chore(api): add a script that seeds a card timeline in the emulator` |
| 33 a 42 | 27 a 36 | sem mudança |
| **43** | novo | `feat(app): add card event hooks and timeline helpers` |
| **44** | novo | `feat(app): answer a stage's questions from the card detail` |
| **45** | novo | `feat(app): show the card timeline, comments and artifacts` |
| 46 a 54 | 37 a 45 | sem mudança (54 com mensagem nova) |
| **55** | novo | `docs(board): state the size limits of agent questions and artifact paths` |
| 56, 57 | 46, 47 | sem mudança |
| **58** | novo | `docs(specs): start the orchestrator spec` |
| 59 a 63 | 48 a 52 | sem mudança |
| **64** | 53 | `docs(features): card-timeline`, agora a pasta inteira |
| 65 | 54 | sem mudança |
| **66** | novo | `docs(features): orchestrator` |

### Commits novos

6. `feat(kanban-contract): add card events, answers and the displayed card state`
   - corpo: `Also caps the length of agent questions, option labels and descriptions, and artifact paths.`
   - `packages/kanban-contract/src/cardEvent.ts`, `agentContract.ts`, `index.ts`
   - `packages/kanban-contract/__tests__/cardEvent.test.ts`
8. `feat(design-system): show a description and a badge on radio options`
   - `packages/design-system/components/ui/radio-group-input.tsx`
9. `fix(design-system): let HookFormTextarea take its own id`
   - corpo: `The id prop was typed but replaced by the field name, so two forms with the same field name on one page shared an id and a label pointed at the wrong textarea.`
   - `packages/design-system/components/form/hookform/hookformTextarea.tsx`
   - `packages/design-system/__tests__/hookformTextareaId.test.tsx`
30. `feat(api): store card events and list them on the card timeline`
   - `apps/api/(shared)/mappers/card-event.mapper.ts`, `apps/api/(shared)/lib/card-events.ts`,
     `apps/api/(shared)/repositories/card-event.repository.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/events/route.ts`
   - `apps/api/__tests__/cardEventMapper.test.ts`, `cardEvents.test.ts`
31. `feat(api): let members comment on cards and answer pending questions`
   - `apps/api/(shared)/validation/card-event.schema.ts`
   - `apps/api/app/(routes)/boards/[id]/cards/[slug]/comments/route.ts`, `events/[eventId]/route.ts`,
     `answers/route.ts`
   - `apps/api/__tests__/fakeCardEventRepository.ts`, `cardEventsRoutes.test.ts`
32. `chore(api): add a script that seeds a card timeline in the emulator`
   - `apps/api/scripts/seed-card-timeline.mjs`, `cardTimelineFixture.mjs`, `fixtures/card-timeline.json`
   - `apps/api/__tests__/cardTimelineFixture.test.ts`
43. `feat(app): add card event hooks and timeline helpers`
   - `.../boards/(hooks)/useListCardEvents.tsx`, `useCardEventCrud.tsx`
   - `.../boards/(validations)/cardEventSchemas.ts`
   - `.../boards/(components)/groupCardEvents.ts`, `latestArtifacts.ts`
   - `apps/app/__tests__/cardEventFixtures.ts`, `groupCardEvents.test.ts`, `latestArtifacts.test.ts`,
     `useCardEventCrud.test.tsx`
44. `feat(app): answer a stage's questions from the card detail`
   - `.../boards/(components)/CardQuestions.tsx`
   - `apps/app/__tests__/cardQuestionsForm.test.tsx`
45. `feat(app): show the card timeline, comments and artifacts`
   - `.../boards/(components)/CardTimeline.tsx`, `CardEventItem.tsx`, `CardArtifacts.tsx`
55. `docs(board): state the size limits of agent questions and artifact paths`
   - `docs/board/CONTRACT.md`
58. `docs(specs): start the orchestrator spec`
   - `specs/features/orchestrator.md`
64. `docs(features): card-timeline`
   - `docs/features/card-timeline/` (`STATE.md`, `analyze/plan.md`, `develop/handoff.md`, `review/review.md`,
     `test/`)
66. `docs(features): orchestrator`
   - `docs/features/orchestrator/` (`STATE.md`, `analyze/plan.md`)

O prefixo `.../boards/` é `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/`. As pastas
`docs/features/card-timeline/` (com `test/`) e `docs/features/orchestrator/` foram varridas atrás de senha, token
e e-mail: só aparecem contas `@example.com` do emulador e códigos de erro.

Antes do commit 1, `git diff --cached --stat` vazio; depois de cada commit, `git show --stat --oneline HEAD`
conferido contra a lista. Toda mensagem termina com a linha de coautoria da sessão.

Título de PR sugerido: `feat: GitHub App integration, GitHub sign-in, board import, members, cards, card timeline and theme toggle`.

### Commits realizados

(preenchido pelo `/review` depois de commitar)
