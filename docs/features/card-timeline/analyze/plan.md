# Plano: linha do tempo do card, perguntas e respostas

Spec de origem: [`specs/features/card-timeline.md`](../../../../specs/features/card-timeline.md) (status `proposed`
quando o `/cycle` a executou). Depende de `card-backlog`, que nesta rodada só tem plano
(`docs/features/card-backlog/analyze/plan.md`) e será implementada antes desta. Este plano parte do código como
está no working tree em 2026-11-26 e do que o plano da `card-backlog` promete entregar. Onde a `card-backlog`
mudar algo na implementação (nome de arquivo, assinatura), o `/develop` segue o código real e registra o desvio.

## Etapa 1: análise

### 1. Contexto

Os agentes vão escrever no card por quatro ferramentas do contrato (`post_update`, `ask`, `attach_artifact`,
`complete_stage`, em `packages/kanban-contract/src/agentContract.ts:37-57`). Hoje não existe onde guardar nem
mostrar isso: a coleção de eventos, a linha do tempo no detalhe do card e a resposta às perguntas são a lacuna
que a spec aponta.

**Valor para o usuário:** quem prioriza ou revisa lê no card o que cada etapa fez, responde as perguntas do
agente sem abrir sessão nem arquivo, e deixa comentários que os agentes recebem como contexto.

**Corte de MVP** (o da spec, sem mudança):

1. Coleção de eventos por card: autor (agente ou pessoa), etapa, tipo (atualização, pergunta, resposta,
   artefato, relatório, comentário) e corpo em markdown.
2. Linha do tempo no detalhe do card, mais recente em cima, agrupada por etapa.
3. Perguntas pendentes no topo do card, com as opções e a recomendação marcada; responder escolhendo uma opção
   ou escrevendo outra.
4. Artefatos como links para o arquivo no GitHub no sha informado.
5. Comentário livre de membros, `viewer` incluído.

A pergunta em aberto da spec ("Editar ou apagar eventos?") tem recomendação: só comentários de pessoas, pelo
autor. O plano adota a recomendação (pergunta 2 no fim).

**Fora de escopo:**

- Notificações fora do board (spec).
- Rotas e servidor MCP que os agentes chamam, token de execução: spec `agent-contract`.
- Disparo, fila, `runs`, redisparo da etapa depois da resposta, mudança de `state`: spec `orchestrator`.
- Aba Execuções do detalhe, linha "Disparada por … · runner · turnos · min" no cabeçalho de cada grupo, painel
  lateral Pipeline e o texto "Roda no seu runner …" abaixo do botão de responder (`CardDetail.png`): dependem
  de `runs` (`orchestrator`, `local-runner`).
- Painel "Depende de" (`CardDetail.png`): não está em nenhum corte de spec hoje.
- Bloco de PR, checks e reviews (`CardPr.png`): spec `pr-flow`.
- Evento do board "Card criado ao sincronizar o backlog…" (`CardDetail.png`, grupo Tarefas): a spec fixa seis
  tipos, todos de agente ou pessoa. Fica fora (pergunta 6).
- Atualização ao vivo enquanto o agente escreve (stream, polling): sem `runs` não há execução a acompanhar. A
  linha do tempo recarrega ao focar a janela (padrão do React Query) e depois de cada ação na tela.
- Cabeçalho próprio do board com menu e tema: `theme-toggle` e as specs de cada item.

### 1.1 Fronteiras com as specs vizinhas

Esta é a parte que mais pode dar errado, então fica explícita.

| Quem | Faz | Não faz |
|------|-----|---------|
| `card-timeline` (esta) | Coleção `cardEvent`, mapper, repositório com as funções de escrita de cada tipo de evento, a função pura que converte a entrada de uma ferramenta de agente em evento, rotas de leitura, comentário e resposta para pessoas, UI | Não expõe rota para agente, não emite token, não chama `resolveTransition`, não grava `state`, `stageKey` nem `lane` do card |
| `agent-contract` | Rotas HTTP e MCP das ferramentas, token por execução. Cada handler valida com o schema do contrato e chama `agentEventFromTool` + `cardEventRepository.appendAgentEvent` desta spec | Não define outro formato de evento nem grava em `cardEvent` por fora do repositório |
| `orchestrator` | No `complete_stage`, chama `resolveTransition` e grava `state`. Depois da resposta a uma pergunta, redispara a etapa (pendura no `POST …/answers`, logo após a transação, ver 4.3) | Não reescreve a lógica de pendência de perguntas |

Pontos de encaixe deixados prontos (nomes no blueprint):

- `apps/api/(shared)/lib/card-events.ts` → `agentEventFromTool(tool, input, ctx)`: pura, coberta por teste com os
  schemas do contrato. É o que o `agent-contract` chama.
- `cardEventRepository.appendAgentEvent(card, write)`: transação que grava o evento e, para `ask`, abre a
  pendência no card.
- `cardEventRepository.listByCard(cardId)`: o `get_card` do `agent-contract` lê daqui as respostas e os
  artefatos.
- `runId: null` em todo evento: o `orchestrator` passa a preencher sem migração.

Regra 14: nada aqui move o card. Regra 16: markdown, perguntas, opções e comentários são dados; a UI os desenha
como texto escapado e o comentário chega ao agente como contexto (copy do campo de comentário diz isso).

### 1.2 Fontes lidas

| Fonte | O que trouxe |
|-------|--------------|
| `specs/features/card-timeline.md` | Corte, risco (markdown não confiável), sinais de pronto, pergunta sobre editar/apagar |
| `.claude/cycle-policy.md` | Sem dependência nova sem relatório; corte manda; `error.code` em vez de 500; só o `/test` executa |
| `.claude/rules/board-mode.md` | O que o agente manda e em que ordem: `post_update` em marcos, `ask` com até 4 perguntas numa chamada, `attach_artifact` com caminho + sha, `complete_stage` com o molde |
| `docs/board/CONTRACT.md` | Ferramentas, molde do relatório, "Perguntas de uma etapa ficam ligadas ao `run`; a resposta vai junto no próximo disparo da mesma etapa" |
| `docs/board/ARCHITECTURE.md:74` | `events`: card, etapa, autor, tipo, corpo em markdown |
| `docs/board/ACCESS.md` | `operator` responde perguntas; `viewer` comenta; remover membro não apaga o que ele fez (`events` guardam o autor) |
| `docs/board/SCREENS.md:28,29,54` | `CardDetail`, `CardPr` e `MCard` pertencem a esta spec |
| `docs/design/screenshots/CardDetail.png` + `screens/CardDetail.dc.html` | Bloco de perguntas, abas, campo de comentário, grupos por etapa, ícone por tipo, textos |
| `docs/design/screenshots/MCard.png` | Celular: perguntas no topo, linha do tempo resumida, botão de responder fixo embaixo |
| `docs/design/screenshots/CardPr.png` | Relatório da etapa desenhado como bloco com seções, selo do resultado, chips dos arquivos |
| `packages/kanban-contract/src/agentContract.ts:4-57` | `questionSchema` (2 a 4 opções, `recommended` opcional), limites `MAX_MARKDOWN = 20_000`, `COMMIT_SHA` |
| `packages/kanban-contract/src/cardState.ts:3-17` | `CARD_STATES` (inclui `waiting_input`), `STAGE_OUTCOMES` |
| `packages/kanban-contract/src/boardConfig.ts:24-35` | Etapa tem `key`, `column`, `command` e `agent` opcional |
| `packages/kanban-contract/src/roles.ts:43-57` | Predicados de papel; nenhum para responder nem comentar |
| `apps/api/app/(guards)/board.ts` + `(shared)/lib/board-access.ts:27-41,201` | `requireBoardApi(capability)` e o mapa capacidade → predicado |
| `apps/api/scripts/seed-emulator.mjs`, `emulatorTarget.mjs:26-51` | O seed apaga tudo; a trava `refuseSeedReason` só deixa rodar com os dois emuladores e projeto `demo-*` |
| `firestore.rules:32-34` | Negação total para cliente; nada a mudar |
| `docs/features/card-backlog/analyze/plan.md` | Coleção `card` (id `<boardId>__<slug>`), rota de detalhe, `SpecMarkdown` com o lexer do `marked`, `useFindBoardCard`, selos de estado, `CARD_NOT_FOUND` |
| `apps/app/.../boards/(components)/githubFileUrl.ts`, `shortSha.ts` | Link do arquivo no GitHub por ref e sha curto, já existentes |
| `apps/app/shared/lib/formatDisplayDateTime.ts:22,37` | Formato de data e hora do painel |
| `packages/design-system/components/form/hookform/hookformRadioGroup.tsx`, `hookformTextarea.tsx` | Campos do formulário de resposta e de comentário |

Referências não lidas: o canvas do Claude Design (`claude.ai/artifact/HmEgc6dwaEXChE9y3ftSEt`) é privado. Usei as
cópias em `docs/design/screens/` e `docs/design/screenshots/`, que o README da pasta declara equivalentes.

### 1.3 Apps e área

`packages/kanban-contract`, `packages/sdk`, `apps/api`, `apps/app`, `packages/internationalization`. Área comum
do painel, dentro das telas de board. Específico do produto: tudo fica em `apps/*`, menos tipos e predicados do
domínio, que vão para o contrato (regra 12).

### 2. Dados (Firestore)

#### 2.1 Coleção `cardEvent` (nova)

Singular em camelCase, como `card` e `boardMember`. Id automático do Firestore. O `ARCHITECTURE.md` chama de
`events`; o `/develop` corrige a tabela para o nome real, como a `card-backlog` faz com `card`.

| Campo | Tipo | `null`? | Por quê |
|-------|------|---------|---------|
| `boardId` | string | não | Escopo; o guard já resolveu o board |
| `cardId` | string | não | `<boardId>__<slug>` da `card-backlog`; consulta por igualdade |
| `stageKey` | string | sim | Etapa a que o evento pertence. Agente: a `stage` da ferramenta. Pessoa: a etapa do card no momento (`null` em Tarefas e Concluído) |
| `lane` | `CardLane` | não | Faixa do card no momento do evento; agrupa os eventos sem etapa em "Tarefas" ou "Concluído" |
| `type` | `CardEventType` | não | `update`, `question`, `answer`, `artifact`, `report`, `comment` |
| `author` | `{ kind: "agent", name }` ou `{ kind: "person", userId, login }` | não | `name` = `stage.agent ?? stage.command` gravado no momento; `login` gravado para continuar legível depois que a pessoa sai do board |
| `markdown` | string | sim | Corpo de `update`, `report` e `comment`; `null` nos demais |
| `questions` | `Question[]` | sim | Só em `question`, exatamente o que o agente mandou |
| `answers` | `ResolvedAnswer[]` | sim | Só em `answer`: para cada pergunta, a opção escolhida (índice + rótulo copiado) ou o texto livre |
| `questionEventId` | string | sim | Só em `answer`: a qual `question` responde |
| `answeredByEventId` | string | sim | Só em `question`: preenchido na mesma transação da resposta |
| `artifact` | `{ path, commitSha }` | sim | Só em `artifact` |
| `outcome` | `StageOutcome` | sim | Só em `report` |
| `runId` | string | sim | Sempre `null` aqui; o `orchestrator` preenche |
| `editedAt` | Timestamp | sim | Só em `comment` editado |
| `createdAt`, `updatedAt`, `deletedAt` | Timestamp | `deletedAt` sim | Padrão do `BaseRepository` |

O mapper converte `Timestamp` → ISO e devolve um `CardEventDTO` discriminado por `type`, sem campos de outros
tipos.

#### 2.2 Card: pendência de perguntas

`card` (da `card-backlog`) ganha `pendingAsk: { eventId, stageKey, count } | null`, `null` por padrão e quando o
campo falta. É escrito só por duas transações desta spec: a do evento `question` (abre) e a da resposta (fecha).
Serve para três coisas: o bloco do topo do detalhe sabe qual pergunta mostrar sem varrer os eventos, o quadro
mostra o selo *aguardando você* sem ler eventos de cada card, e a rota de resposta recusa resposta a uma pergunta
que já não está pendente.

Isso não é `state`. O selo na UI usa `displayCardState(card)`: `waiting_input` quando `pendingAsk !== null`, senão
`card.state`. Quando o `orchestrator` chegar, ele grava `state: "waiting_input"` no `needs_input` e `queued` no
redisparo; as duas fontes concordam. Sem ele, responder já tira o selo, que é o sinal de pronto da spec.

Um `ask` novo com uma pergunta ainda pendente na mesma etapa substitui a pendência: o evento antigo fica na linha
do tempo como "Sem resposta" (pergunta 8).

#### 2.3 Consultas

| Consulta | Forma | Índice |
|----------|-------|--------|
| Eventos do card | `where("cardId","==",id).where("deletedAt","==",null)` | Nenhum (só igualdade) |
| Evento por id | `doc(id)` + conferência de `cardId` | Nenhum |

Sem `orderBy`: ordenação em memória por `createdAt` (desempate por id), como a `card-backlog` faz com cards. O
`BaseRepository` não pagina. Volume esperado: um card passa por 4 a 6 etapas, com 2 a 10 eventos cada, mais
voltas de retrabalho; fica abaixo de 200. O teto de leitura vira risco registrado; paginação fica para quando
houver número medido.

#### 2.4 Dados existentes

Nenhuma migração. Cards sem `pendingAsk` viram `null` no mapper.

### 3. Contrato

**`@repo/kanban-contract`** (regra 12), arquivo novo `src/cardEvent.ts`:

- `CARD_EVENT_TYPES`, `CardEventType`, `CardEventAuthor`, `ResolvedAnswer`.
- `cardCommentInputSchema` (`markdown` 1..`MAX_MARKDOWN`, depois de `trim`).
- `answerQuestionsInputSchema`: `{ questionEventId, answers: Answer[] }`, com `Answer` =
  `{ kind: "option", option: 0..3 } | { kind: "text", text: 1..2000 }`, 1 a 4 respostas.
- `resolveAnswers(questions, answers)`: pura. Confere quantidade e índice de opção contra as perguntas
  guardadas e devolve `ResolvedAnswer[]` ou `{ ok: false }`.
- `agentContract.ts` passa a exportar `MAX_MARKDOWN` (hoje é `const` local, linha 4) para não repetir o número.

`roles.ts` ganha `canAnswerQuestions` (`operator`+, como diz o `ACCESS.md`) e `canCommentOnCards` (qualquer papel
efetivo). Dois nomes, mesmo que hoje um coincida com `canTriggerStages` e o outro com `canViewBoard`: o
`orchestrator` e uma spec futura de leitura pública podem mudar um sem mexer no outro (mesmo argumento do
`canPrioritizeCards` da `card-backlog`).

**`@repo/sdk`**: tipos em `types/board/cardEvent.ts`; `CardDTO` ganha `pendingAsk`; o recurso `boardCard` da
`card-backlog` ganha `listEvents`, `comment`, `editComment`, `deleteComment` e `answer`. Não quebra ninguém:
`pendingAsk` é campo novo.

### 4. API (`apps/api`)

#### 4.1 Capacidades novas no guard

`BoardCapability` ganha `"comment"` → `canCommentOnCards` e `"answer"` → `canAnswerQuestions`
(`board-access.ts:33-41`). Todas as rotas passam por `requireBoardApi`, que resolve o papel efetivo (regra 13).
Sob personificação, métodos não seguros já são recusados pelo `requireCommonPanelApi`.

#### 4.2 Rotas

| Método e rota | Capacidade | O que faz |
|---------------|------------|-----------|
| `GET /boards/[id]/cards/[slug]/events` | `view` | Eventos do card, mais antigos primeiro (a UI agrupa e inverte) |
| `POST /boards/[id]/cards/[slug]/comments` | `comment` | Cria `comment` com a etapa e a faixa atuais do card |
| `PATCH /boards/[id]/cards/[slug]/events/[eventId]` | `comment` | Edita o próprio comentário |
| `DELETE /boards/[id]/cards/[slug]/events/[eventId]` | `comment` | Apaga (soft delete) o próprio comentário |
| `POST /boards/[id]/cards/[slug]/answers` | `answer` | Responde a pendência aberta |

`[slug]` passa em `isValidSlug`; `[eventId]` é tratado como texto opaco e só vale se o documento existir com o
mesmo `cardId`.

#### 4.3 Responder

Em transação (`db.runTransaction`):

1. lê o card; sem card → 404 `CARD_NOT_FOUND`;
2. `card.pendingAsk?.eventId !== body.questionEventId` → 409 `CARD_QUESTIONS_NOT_PENDING` (alguém respondeu
   antes, ou chegou um `ask` novo);
3. lê o evento `question`; `resolveAnswers` falha → 422 `CARD_ANSWERS_MISMATCH`;
4. grava o evento `answer` (autor pessoa, `stageKey` = o da pergunta), `answeredByEventId` na pergunta e
   `pendingAsk: null` no card.

Devolve `{ event, card }`. O `orchestrator` acrescenta o redisparo depois do passo 4, fora da transação.

#### 4.4 Comentários

`POST`: `parseRequestJson` + `cardCommentInputSchema`; grava com `author` da pessoa (`subjectProfile.id` e
`github.login`). `PATCH`/`DELETE`: evento inexistente ou de outro card → 404 `CARD_EVENT_NOT_FOUND`; tipo diferente
de `comment` ou autor diferente de quem chama → 403 `CARD_EVENT_NOT_EDITABLE`. Um `owner` não apaga comentário
alheio (pergunta 2).

#### 4.5 Escrita pelos agentes (só a função, sem rota)

`agentEventFromTool(tool, input, { card, config, now })` converte:

| Ferramenta | Evento | Observação |
|------------|--------|------------|
| `post_update` | `update` com `markdown` | |
| `ask` | `question` com `questions` | `appendAgentEvent` abre `pendingAsk` na mesma transação |
| `attach_artifact` | `artifact` com `{ path, commitSha }` | `path` normalizado; recusado se começar com `/` ou tiver `..` |
| `complete_stage` | `report` com `markdown = summary` e `outcome` | Não toca em `state` |

`stage` que não existe em `config.stages` é recusado (`{ ok: false, code: "CARD_STAGE_NOT_FOUND" }`, código que a
`card-backlog` já cria). `author.name` = `stage.agent ?? stage.command`. Nenhuma rota desta spec chama isso; o
teste cobre, e o `agent-contract` usa.

#### 4.6 Erros novos

| `error.code` | Status | Quando |
|--------------|--------|--------|
| `CARD_QUESTIONS_NOT_PENDING` | 409 | A pergunta respondida não é a pendente |
| `CARD_ANSWERS_MISMATCH` | 422 | Número de respostas ou índice de opção não bate com as perguntas |
| `CARD_EVENT_NOT_FOUND` | 404 | Evento inexistente, apagado ou de outro card |
| `CARD_EVENT_NOT_EDITABLE` | 403 | Não é comentário, ou não é de quem chama |

Os quatro entram em `apiErrors` (`translations/packages/shared/utils.ts`); o `apiErrorCodesTranslated.test.ts`
cobra. Reaproveitados: `CARD_NOT_FOUND`, `VALIDATION_ERROR`, `BOARD_ROLE_INSUFFICIENT`.

### 5. Front-end (`apps/app`)

#### 5.1 Rotas

Nenhuma rota nova. O detalhe `/boards/[id]/cards/[slug]` da `card-backlog` (`CardDetailClient.tsx`) ganha o
bloco de perguntas e as abas. O prefetch RSC da página passa a incluir os eventos (`fetchCardEvents`), já que a
linha do tempo é a aba aberta por padrão.

#### 5.2 Dados

- `queryKeys.boards.cardEvents(id, slug)`.
- `useListCardEvents(boardId, slug)` + `fetchCardEvents`, `enabled` com ids não vazios.
- `useCardEventCrud(boardId, slug)`: `commentMutation`, `editCommentMutation`, `deleteCommentMutation` (invalidam
  os eventos) e `answerMutation` (grava o card devolvido com `setQueryData` em `boards.card`, invalida os eventos
  e `boards.cards`, para o selo do quadro sumir). No 409 `CARD_QUESTIONS_NOT_PENDING`, o `handleClientError`
  mostra o toast e o hook invalida card e eventos, para a tela mostrar o estado atual.
- Helpers puros em `(components)/`: `groupCardEvents(events, config)`, `latestArtifacts(events)`,
  `displayCardState(card)`.

`displayCardState` também passa a alimentar o selo do card no quadro (`BoardCardItem` da `card-backlog`).

#### 5.3 Tela do detalhe (`CardDetail.png`, `MCard.png`, `CardPr.png`)

**Cabeçalho** (da `card-backlog`): o selo de estado passa a usar `displayCardState`.

**Bloco de perguntas pendentes**, acima das abas, só com `card.pendingAsk`:

- Título "A {etapa} parou com {n} perguntas" (singular para 1), com `{etapa}` = `column` da etapa. Subtítulo "O
  agente recebe as suas respostas na próxima execução desta etapa. A opção recomendada já vem marcada."
- Uma pergunta por bloco, numerada, com o `question` como enunciado. As opções em `HookFormRadioGroup`, cada uma
  com rótulo, descrição e o selo "Recomendado" na `recommended`. A última opção é sempre "Escrever outra
  resposta" ("O texto vai para o agente como resposta a esta pergunta."), que abre um `HookFormTextarea`.
- Valor inicial: a recomendada; sem recomendação, nenhuma, e o schema exige escolha.
- Botão "Responder" (sem "e retomar a Análise": sem `orchestrator`, nada retoma; pergunta 7). Enviando: desabilita
  e mostra o spinner padrão do botão.
- Borda de aviso no bloco, como no desenho, por token (`--warning`). Sem faixa colorida na borda esquerda.
- Quem não pode responder (`viewer` efetivo, personificação) vê as perguntas e opções sem campos de escolha, com
  "Só quem pode disparar etapas responde às perguntas."
- Abaixo de `md` (`MCard.png`), o botão fica fixo no rodapé (`sticky bottom-0` com fundo `--background`).

**Abas** (`tabs.tsx`): Linha do tempo (padrão) · Spec (o conteúdo atual da `card-backlog`) · Artefatos. A aba
Execuções fica fora.

**Linha do tempo:**

- Campo "Comentar no card" (`HookFormTextarea`, placeholder "Visível para todos os membros. Agentes leem como
  contexto, não como instrução.") e botão "Comentar", para quem tem `canCommentOnCards`. Some sob personificação.
- Grupos por etapa: título = `column` da etapa; eventos sem etapa ficam em "Tarefas" ou "Concluído" pela `lane`;
  `stageKey` que saiu do `board.yml` vira "Etapa removida ({key})" e não some. Grupos ordenados pelo evento mais
  recente; dentro do grupo, mais recente em cima. Um mesmo `stageKey` em momentos separados por outra etapa (volta
  de retrabalho) forma grupos distintos, como "Executando" e "Executando · volta" no `CardPr.png`; o rótulo da
  volta usa a contagem de grupos anteriores da mesma etapa.
- Item: ícone por tipo (lucide, já usado no app), autor · data e hora (`formatDisplayDateTime`), corpo.
  - `update`: markdown.
  - `question`: as perguntas com as opções e a recomendada marcada; rodapé "Respondida" (link para a resposta) ou
    "Sem resposta".
  - `answer`: "{login} respondeu", e para cada pergunta o enunciado e a opção escolhida ou o texto livre.
  - `artifact`: chip com o caminho em mono e o sha curto, link para `githubFileUrl(owner, name, commitSha, path)`,
    nova aba, `rel="noreferrer noopener"`.
  - `report`: bloco (`card.tsx`) com o markdown do molde e o selo do resultado (Concluída, Precisa de resposta,
    Pediu retrabalho, Falhou), como no `CardPr.png`.
  - `comment`: "{login} comentou", markdown em caixa, "(editado)" quando `editedAt`. No próprio comentário, menu
    "⋯" (`ActionsMenu`, `triggerLabel` "Ações do comentário") com Editar (troca a caixa por textarea com Salvar e
    Cancelar) e Apagar (confirmação com `alert-dialog.tsx`).
- Vazio: `empty.tsx` com "Nada aconteceu neste card ainda" e "Quando uma etapa rodar, o que o agente fizer
  aparece aqui."
- Carregando: skeleton de três itens. Erro: `loadError`, como nas outras telas de board.

**Aba Artefatos:** um item por caminho (o mais recente vence), com nome do arquivo, caminho em mono, sha curto,
etapa e link. Vazio: "Nenhum artefato ainda" e "O plano aparece aqui, ligado ao commit, quando a Análise
terminar." (textos do `CardDetail.dc.html`).

**Markdown dos eventos:** o mesmo `SpecMarkdown` da `card-backlog` (lexer do `marked`, tokens desenhados como
React, `html` vira texto, só `http(s)` vira link, `javascript:`/`data:` viram texto). Ele recebe a base dos links
relativos por prop; para eventos, a base é a raiz do repositório na branch do card (ou na `baseBranch` quando o
card não tem branch). Se a `card-backlog` tiver fixado a base dentro do componente, o `/develop` transforma em
prop opcional com o valor atual como padrão, sem duplicar o componente. Nada de `dangerouslySetInnerHTML`.

#### 5.4 i18n e a11y

Árvore em 10.8. Cada grupo é `section` com `aria-labelledby`; a lista de eventos é `ol` com `time dateTime`. O
`RadioGroup` de cada pergunta tem `aria-labelledby` no enunciado. Resultado de responder e comentar vai para o
toast padrão.

### 6. Autorização e segurança

| Ação | Quem | Onde é checado |
|------|------|----------------|
| Ler eventos | qualquer papel efetivo | `requireBoardApi("view")` |
| Comentar | qualquer papel efetivo | `requireBoardApi("comment")`; UI com `canCommentOnCards` |
| Editar e apagar comentário | o autor | `comment` + conferência de `author.userId` na rota |
| Responder | `operator`+ efetivo | `requireBoardApi("answer")`; UI com `canAnswerQuestions` |

- Não membro: 404 pelo guard. `operator` no board com `read` no GitHub vira `viewer`: comenta, não responde.
- Personificação: leitura apenas. A API recusa pelo guard global; a UI esconde campo de comentário e responder.
- Conteúdo de agente e de pessoa é dado (regra 16): desenhado com escape do React; links filtrados por esquema;
  `<script>` vira texto. Tamanho limitado pelos schemas do contrato (20.000 caracteres).
- A resposta guarda uma cópia do rótulo da opção, para o `get_card` devolver texto estável mesmo que alguém leia
  o evento depois.
- `artifact.path` passa pela mesma normalização de caminho, sem `..`, antes de virar URL.

### 7. Testes

Nenhum precisa de emulador: as consultas são de igualdade, sem índice composto, e o `/test` exercita o Firestore
emulado ao percorrer o detalhe.

| Nível | Arquivo | Prova |
|-------|---------|-------|
| contrato | `packages/kanban-contract/__tests__/cardEvent.test.ts` | `resolveAnswers`: quantidade errada, índice fora das opções, texto livre, cópia do rótulo; `answerQuestionsInputSchema` recusa texto vazio e mais de 4 respostas; `cardCommentInputSchema` recusa só espaços |
| contrato | `__tests__/roles.test.ts` (acréscimo) | `canAnswerQuestions` e `canCommentOnCards` por papel |
| API, puro | `apps/api/__tests__/cardEvents.test.ts` | `agentEventFromTool` para as quatro ferramentas com entradas que passam nos schemas do contrato; etapa inexistente; `author.name` com e sem `agent`; caminho com `..` recusado |
| API | `__tests__/cardEventMapper.test.ts` | `Timestamp` → ISO; DTO discriminado por tipo sem campos de outros tipos; `pendingAsk` ausente vira `null` no `card.mapper` |
| API, rota | `__tests__/cardEventsRoutes.test.ts` | Com `fakeBoardMemberRepository` e repositórios em memória (o falso de cards da `card-backlog` + um de eventos): `qa-reader` lê e comenta (200) e recebe 403 ao responder; responder fecha `pendingAsk` e grava `answeredByEventId`; segunda resposta → 409 `CARD_QUESTIONS_NOT_PENDING`; opção 3 numa pergunta de 2 → 422 `CARD_ANSWERS_MISMATCH`; editar comentário alheio → 403; apagar evento de agente → 403; evento de outro card → 404; nenhuma rota altera `state`, `lane` ou `stageKey` do card |
| API | `__tests__/cardTimelineFixture.test.ts` | Cada documento de `scripts/fixtures/card-timeline.json` passa pelo mapper sem perder campo, e as perguntas passam no `questionSchema` do contrato. Impede que a fixture do `/test` saia do formato real |
| app | `apps/app/__tests__/groupCardEvents.test.ts` | Grupos por etapa, Tarefas/Concluído pela `lane`, etapa removida não some, ordem mais recente em cima, volta de retrabalho em grupo separado |
| app | `__tests__/latestArtifacts.test.ts` | Um por caminho, o mais recente vence |
| app | `__tests__/displayCardState.test.ts` | `pendingAsk` vence `state` |
| app | `__tests__/cardQuestionsForm.test.tsx` | Recomendada marcada de início; "Escrever outra resposta" mostra o textarea e exige texto; envia o payload certo; `viewer` não vê radios |
| app | `__tests__/useCardEventCrud.test.tsx` | Responder grava o card devolvido e invalida eventos e lista; 409 invalida card e eventos |

### 8. O que o `/test` vai percorrer

**Como popular a linha do tempo localmente.** Sem `agent-contract`, nenhum agente escreve. O `/develop` cria
`apps/api/scripts/seed-card-timeline.mjs` (script `pnpm --filter api seed:timeline <boardId> <slug>`):

- usa `readEmulatorTarget` + `refuseSeedReason` de `emulatorTarget.mjs` antes de `initializeApp`, como o
  `seed-emulator.mjs`. Sem os dois emuladores ou com projeto que não seja `demo-*`, sai com erro. Nunca roda contra
  produção, e não é rota: não existe endpoint de fixture na API;
- não apaga nada (o `pnpm seed` apaga). Recusa se o card `<boardId>__<slug>` não existir;
- grava os documentos de `scripts/fixtures/card-timeline.json` com ids determinísticos
  (`fixture_<cardId>_<nn>`), datas escalonadas a partir de agora, e abre `pendingAsk` no card. Rodar de novo
  reabre as perguntas, o que permite repetir o fluxo de resposta;
- a fixture tem, na etapa `analyze`: três `update`, um `question` com duas perguntas (uma com `recommended`, outra
  sem), um `artifact` (`docs/features/<slug>/analyze/plan.md`, sha de 40 hex inventado); na etapa `develop`: um
  `update` e um `report` no molde do `CONTRACT.md` com `outcome: "needs_rework"`, contendo uma tabela, um link
  `javascript:`, uma linha `<script>` e um link relativo; um `update` com `stageKey: "legacy"` (etapa que não existe
  no `sample-app`); e um `comment` de outra pessoa (`login: "qa-maintainer"`, `userId` fictício). Textos curtos,
  inventados, sem dado pessoal.

Ambiente: `pnpm emulators` + `pnpm seed` + `pnpm dev`, contas `qa-*` do cliente falso (`docs/SETUP.md`); `qa-owner`
importa `sample-app`, sincroniza o backlog e move "Busca por texto nos cards" para Análise (fluxos da
`card-backlog`); depois `pnpm --filter api seed:timeline agent-board-demo--sample-app search-cards`. Claro, escuro
e 390 px.

| # | Fluxo | Esperado |
|---|-------|----------|
| T1 | Quadro depois do script | Card com selo "Aguardando você" |
| T2 | Abrir o card | Bloco "A Análise parou com 2 perguntas" no topo; 1ª pergunta com a recomendada marcada; 2ª sem marcação; botão "Responder" |
| T3 | Linha do tempo | Grupos Executando (relatório com selo "Pediu retrabalho"), Análise, "Etapa removida (legacy)"; mais recente em cima; `<script>` e `javascript:` aparecem como texto; tabela renderizada; link relativo aponta para o GitHub |
| T4 | Artefato | Chip com `plan.md`, caminho em mono e sha curto; link `https://github.com/<owner>/sample-app/blob/<sha>/docs/features/search-cards/analyze/plan.md`; aba Artefatos lista o mesmo |
| T5 | Enviar sem escolher na 2ª | Erro no campo, nada enviado |
| T6 | "Escrever outra resposta" na 2ª, digitar, Responder | Toast; bloco some; selo some no detalhe e no quadro; evento de resposta no grupo Análise com o texto; a pergunta mostra "Respondida" |
| T7 | Rodar o script de novo; abrir em duas abas; responder numa, depois na outra | Segunda recebe o toast de `CARD_QUESTIONS_NOT_PENDING` e a tela atualiza |
| T8 | Comentar como `qa-owner`; editar; apagar | Comentário aparece com "(editado)"; apagado some; o comentário de `qa-maintainer` não tem menu |
| T9 | Entrar como `qa-reader` (operator no board, `read` no GitHub) | Vê perguntas sem radios e com o aviso; comenta; não vê botão de responder |
| T10 | Personificar `qa-owner` a partir de um admin | Sem campo de comentário, sem responder |
| T11 | 390 px | Perguntas no topo, botão fixo no rodapé, abas e linha do tempo sem rolagem horizontal da página |

Comparar com `CardDetail.png`, `MCard.png` e `CardPr.png`, anotando o que ficou fora por escopo (seção 1).

### 9. Critérios de aceite (resumo; o `/test` escreve no formato 9.1)

1. Os eventos de um card aparecem agrupados por etapa, mais recente em cima.
2. Um relatório no molde do `CONTRACT.md` aparece legível, com o selo do resultado.
3. Markdown de agente não executa HTML nem link `javascript:`.
4. Perguntas pendentes aparecem no topo, com a recomendada marcada.
5. Responder (opção ou texto livre) grava a resposta e tira o selo *aguardando você* no detalhe e no quadro.
6. Responder uma pergunta que já não está pendente devolve 409 `CARD_QUESTIONS_NOT_PENDING`.
7. Artefatos linkam o arquivo no GitHub no sha informado.
8. `viewer` comenta e não responde (API 403 `BOARD_ROLE_INSUFFICIENT`).
9. Só o autor edita ou apaga o próprio comentário; eventos de agente não são editáveis.
10. Nenhuma rota desta spec altera `state`, `lane` ou `stageKey` do card.
11. Detalhe legível em claro, escuro e 390 px.

## Etapa 2: blueprint técnico

### 10.1 Contrato do domínio (`@repo/kanban-contract`)

```ts
// src/agentContract.ts
export const MAX_MARKDOWN = 20_000; // era const local
export type Question = z.infer<typeof questionSchema>;
```

```ts
// src/cardEvent.ts
import { z } from "zod";
import { MAX_MARKDOWN, type Question } from "./agentContract";

export const CARD_EVENT_TYPES = ["update", "question", "answer", "artifact", "report", "comment"] as const;
export type CardEventType = (typeof CARD_EVENT_TYPES)[number];

export type CardEventAuthor =
    | { kind: "agent"; name: string }
    | { kind: "person"; userId: string; login: string };

const MAX_ANSWER_TEXT = 2000;

export const answerSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("option"), option: z.number().int().min(0).max(3) }),
    z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(MAX_ANSWER_TEXT) }),
]);
export type Answer = z.infer<typeof answerSchema>;

export const answerQuestionsInputSchema = z.object({
    questionEventId: z.string().min(1),
    answers: z.array(answerSchema).min(1).max(4),
});

export const cardCommentInputSchema = z.object({
    markdown: z.string().trim().min(1).max(MAX_MARKDOWN),
});

export type ResolvedAnswer = {
    question: string;
    header: string;
    choice: { kind: "option"; option: number; label: string } | { kind: "text"; text: string };
};

export function resolveAnswers(
    questions: Question[],
    answers: Answer[]
): { ok: true; answers: ResolvedAnswer[] } | { ok: false };
```

```ts
// src/roles.ts (acréscimo)
export function canAnswerQuestions(role: BoardRole | null): boolean {
    return role !== null && boardRank(role) >= boardRank("operator");
}
export function canCommentOnCards(role: BoardRole | null): boolean {
    return role !== null;
}
```

`src/index.ts` exporta `./cardEvent`.

### 10.2 SDK

```ts
// packages/sdk/src/types/board/cardEvent.ts
import type { CardEventAuthor, CardLane, Question, ResolvedAnswer, StageOutcome } from "@repo/kanban-contract";

type CardEventBase = {
    id: string; boardId: string; cardId: string;
    stageKey: string | null; lane: CardLane;
    author: CardEventAuthor; runId: string | null;
    createdAt: string; updatedAt: string;
};

export type CardEventDTO =
    | (CardEventBase & { type: "update"; markdown: string })
    | (CardEventBase & { type: "question"; questions: Question[]; answeredByEventId: string | null })
    | (CardEventBase & { type: "answer"; questionEventId: string; answers: ResolvedAnswer[] })
    | (CardEventBase & { type: "artifact"; artifact: { path: string; commitSha: string } })
    | (CardEventBase & { type: "report"; markdown: string; outcome: StageOutcome })
    | (CardEventBase & { type: "comment"; markdown: string; editedAt: string | null });

export type CardPendingAskDTO = { eventId: string; stageKey: string; count: number };

export type CardCommentRequest = { markdown: string };
export type AnswerQuestionsRequest = { questionEventId: string; answers: Answer[] };
export type AnswerQuestionsResultDTO = { event: CardEventDTO; card: CardDTO };
```

`CardDTO` (de `types/board/card.ts`): `pendingAsk: CardPendingAskDTO | null`.

```ts
// packages/sdk/src/actions/boardCard/action.ts (acréscimo)
listEvents(boardId: string, slug: string): Promise<CardEventDTO[]>;                                   // GET    cards/[slug]/events
comment(boardId: string, slug: string, body: CardCommentRequest): Promise<CardEventDTO>;             // POST   cards/[slug]/comments
editComment(boardId: string, slug: string, eventId: string, body: CardCommentRequest): Promise<CardEventDTO>; // PATCH  cards/[slug]/events/[eventId]
deleteComment(boardId: string, slug: string, eventId: string): Promise<void>;                        // DELETE cards/[slug]/events/[eventId]
answer(boardId: string, slug: string, body: AnswerQuestionsRequest): Promise<AnswerQuestionsResultDTO>; // POST cards/[slug]/answers
```

Todo segmento passa por `encodeURIComponent`, como em `cardPath` da `card-backlog`.

### 10.3 API (esqueletos)

```ts
// apps/api/(shared)/lib/card-events.ts
type AgentTool = "post_update" | "ask" | "attach_artifact" | "complete_stage";

export type CardEventWrite = Omit<CardEventDocument, "createdAt" | "updatedAt" | "deletedAt">;

export function agentEventFromTool(
    tool: AgentTool,
    input: PostUpdateInput | AskInput | AttachArtifactInput | CompleteStageInput,
    ctx: { card: CardDTO; config: BoardConfig }
): { ok: true; write: CardEventWrite } | { ok: false; code: "CARD_STAGE_NOT_FOUND" | "CARD_ARTIFACT_PATH_INVALID" };

export function personAuthor(profile: UserDTO): CardEventAuthor; // { kind: "person", userId, login }
```

`CARD_ARTIFACT_PATH_INVALID` só existe no retorno da função; o `agent-contract` decide o status quando expuser a
rota. Por isso não entra em `apiErrors` agora.

```ts
// apps/api/(shared)/repositories/card-event.repository.ts
class CardEventRepository extends BaseRepository<CardEventDTO> {
    constructor(db: Firestore) { super(db, "cardEvent", cardEventMapper); }
    listByCard(cardId: string): Promise<CardEventDTO[]>;                       // igualdade + sort em memória
    findInCard(cardId: string, eventId: string): Promise<CardEventDTO | null>;
    appendComment(card: CardDTO, author: CardEventAuthor, markdown: string): Promise<CardEventDTO>;
    editComment(id: string, markdown: string): Promise<CardEventDTO>;          // editedAt, updatedAt
    removeComment(id: string): Promise<void>;                                  // deletedAt
    appendAgentEvent(card: CardDTO, write: CardEventWrite): Promise<CardEventDTO>; // transação; question abre pendingAsk
    answer(input: {
        cardId: string; questionEventId: string; author: CardEventAuthor; answers: Answer[];
    }): Promise<
        | { ok: true; event: CardEventDTO; card: CardDTO }
        | { ok: false; code: "CARD_NOT_FOUND" | "CARD_QUESTIONS_NOT_PENDING" | "CARD_ANSWERS_MISMATCH" }
    >; // transação de 4.3
}
export const cardEventRepository = new CardEventRepository(getDb());
```

```ts
// apps/api/app/(routes)/boards/[id]/cards/[slug]/answers/route.ts
export const POST = requireBoardApi<{ id: string; slug: string }>("answer", async (req, ctx) => {
    const body = await parseRequestJson(req);
    if (!body.ok) return body.response;
    const parsed = parseAnswerQuestions(body.value);            // validation/card-event.schema.ts
    if (!parsed.ok) return parsed.response;
    const result = await cardEventRepository.answer({
        cardId: cardIdFor(ctx.board.id, ctx.params.slug),       // helper da card-backlog
        questionEventId: parsed.value.questionEventId,
        author: personAuthor(ctx.subjectProfile),
        answers: parsed.value.answers,
    });
    if (!result.ok) return errorResponse(result.code, ANSWER_ERROR_STATUS[result.code]);
    return Response.json({ data: { event: result.event, card: result.card } });
});
```

```ts
// apps/api/app/(routes)/boards/[id]/cards/[slug]/events/[eventId]/route.ts
export const PATCH = requireBoardApi<{ id: string; slug: string; eventId: string }>("comment", async (req, ctx) => {
    // parse cardCommentInputSchema → findInCard → 404 CARD_EVENT_NOT_FOUND
    // type !== "comment" || author.kind !== "person" || author.userId !== ctx.subjectProfile.id → 403 CARD_EVENT_NOT_EDITABLE
    // editComment → 200 { data: event }
});
export const DELETE = /* mesmas checagens → removeComment → 204 */;
```

`GET …/events` e `POST …/comments` seguem o formato de `members/route.ts:12-17`. O `POST …/comments` lê o card
(404 `CARD_NOT_FOUND`) para pegar `stageKey` e `lane`.

`(shared)/validation/card-event.schema.ts`: `parseAnswerQuestions` e `parseCardComment`, envolvendo os schemas do
contrato no formato de `board-member.schema.ts`.

### 10.4 Payloads de exemplo

```http
GET /boards/agent-board-demo--sample-app/cards/search-cards/events
200
{ "data": [
  { "id": "fixture_…_01", "type": "update", "stageKey": "analyze", "lane": "stage",
    "author": { "kind": "agent", "name": "planejador-tarefa" },
    "markdown": "Branch criada a partir de `main`. Lendo a spec.", "runId": null, "createdAt": "2026-11-26T…" },
  { "id": "fixture_…_04", "type": "question", "stageKey": "analyze", "lane": "stage",
    "author": { "kind": "agent", "name": "planejador-tarefa" },
    "questions": [ { "question": "A busca considera o corpo da spec?", "header": "Escopo",
                     "options": [ { "label": "Só o título" }, { "label": "Título e corpo" } ], "recommended": 0 } ],
    "answeredByEventId": null, "runId": null, "createdAt": "…" }
] }
```

```http
POST /boards/agent-board-demo--sample-app/cards/search-cards/answers
{ "questionEventId": "fixture_…_04", "answers": [ { "kind": "option", "option": 0 }, { "kind": "text", "text": "Usar o atalho /" } ] }
200 { "data": { "event": { "type": "answer", "…": "…" }, "card": { "pendingAsk": null, "state": "idle", "…": "…" } } }

(de novo)
409 { "error": { "code": "CARD_QUESTIONS_NOT_PENDING" } }
```

```http
PATCH /boards/agent-board-demo--sample-app/cards/search-cards/events/fixture_…_09
{ "markdown": "editando o comentário de outra pessoa" }
403 { "error": { "code": "CARD_EVENT_NOT_EDITABLE" } }
```

### 10.5 Tabela `error.code` → status

| Código | Status | Rota |
|--------|--------|------|
| `CARD_NOT_FOUND` (da `card-backlog`) | 404 | events, comments, answers |
| `CARD_QUESTIONS_NOT_PENDING` | 409 | answers |
| `CARD_ANSWERS_MISMATCH` | 422 | answers |
| `CARD_EVENT_NOT_FOUND` | 404 | events/[eventId] |
| `CARD_EVENT_NOT_EDITABLE` | 403 | events/[eventId] |
| `BOARD_ROLE_INSUFFICIENT` (existente) | 403 | answers (viewer) |
| `VALIDATION_ERROR` (existente) | 400 | comments, answers, events/[eventId] |

### 10.6 Documentos no Firestore

```txt
cardEvent/<auto>
{
  boardId: "agent-board-demo--sample-app",
  cardId: "agent-board-demo--sample-app__search-cards",
  stageKey: "analyze",
  lane: "stage",
  type: "question",
  author: { kind: "agent", name: "planejador-tarefa" },
  markdown: null,
  questions: [ { question, header, options: [{ label, description }], recommended } ],
  answers: null, questionEventId: null, answeredByEventId: null,
  artifact: null, outcome: null, runId: null, editedAt: null,
  createdAt: Timestamp, updatedAt: Timestamp, deletedAt: null
}

card/<boardId>__<slug>.pendingAsk = { eventId: "<id do question>", stageKey: "analyze", count: 2 } | null
```

### 10.7 Árvore de arquivos

```txt
packages/kanban-contract/
  src/agentContract.ts                 (export MAX_MARKDOWN, Question)
  src/cardEvent.ts                     (novo)
  src/roles.ts                         (canAnswerQuestions, canCommentOnCards)
  src/index.ts
  __tests__/cardEvent.test.ts (novo), roles.test.ts

packages/sdk/src/
  types/board/cardEvent.ts (novo), types/board/card.ts (pendingAsk), types/board/index.ts
  actions/boardCard/action.ts          (listEvents, comment, editComment, deleteComment, answer)

apps/api/
  package.json                         (script seed:timeline)
  scripts/seed-card-timeline.mjs       (novo)
  scripts/fixtures/card-timeline.json  (novo)
  (shared)/lib/board-access.ts         (capacidades comment e answer)
  (shared)/lib/card-events.ts          (agentEventFromTool, personAuthor)
  (shared)/mappers/card-event.mapper.ts (novo)
  (shared)/mappers/card.mapper.ts      (pendingAsk)
  (shared)/repositories/card-event.repository.ts (novo)
  (shared)/validation/card-event.schema.ts (novo)
  app/(routes)/boards/[id]/cards/[slug]/events/route.ts
  app/(routes)/boards/[id]/cards/[slug]/events/[eventId]/route.ts
  app/(routes)/boards/[id]/cards/[slug]/comments/route.ts
  app/(routes)/boards/[id]/cards/[slug]/answers/route.ts
  __tests__/cardEvents.test.ts, cardEventMapper.test.ts, cardEventsRoutes.test.ts,
            cardTimelineFixture.test.ts, fakeCardEventRepository.ts (novos)

apps/app/
  shared/lib/queryKeys.ts              (cardEvents)
  .../boards/(hooks)/useListCardEvents.tsx, useCardEventCrud.tsx (novos)
  .../boards/(components)/CardQuestions.tsx, CardQuestionsForm.tsx, cardQuestionsSchema.ts,
      CardTimeline.tsx, CardTimelineGroup.tsx, CardEventItem.tsx, CardCommentForm.tsx,
      CardCommentItem.tsx, CardReport.tsx, CardArtifacts.tsx,
      groupCardEvents.ts, latestArtifacts.ts, displayCardState.ts (novos)
  .../boards/(components)/SpecMarkdown.tsx (prop da base dos links, se ainda não tiver)
  .../boards/(components)/BoardCardItem.tsx (selo por displayCardState)
  .../boards/(pages)/[id]/cards/[slug]/page.tsx (prefetch dos eventos), CardDetailClient.tsx (bloco + abas)
  __tests__/groupCardEvents.test.ts, latestArtifacts.test.ts, displayCardState.test.ts,
            cardQuestionsForm.test.tsx, useCardEventCrud.test.tsx (novos)

packages/internationalization/translations/
  apps/app/pages/common/boards.ts (cardDetail.questions, timeline, artifacts, comment)
  packages/shared/utils.ts (4 apiErrors)

docs/board/ARCHITECTURE.md             (events → cardEvent, campos reais)
docs/SETUP.md                          (como popular a linha do tempo no emulador)
```

### 10.8 Chaves de i18n (pt-br)

```ts
// boards.ts, dentro de cardDetail
tabs: { timeline: "Linha do tempo", spec: "Spec", artifacts: "Artefatos" },
questions: {
  titleOne: "A {stage} parou com 1 pergunta",
  titleOther: "A {stage} parou com {count} perguntas",
  subtitle: "O agente recebe as suas respostas na próxima execução desta etapa. A opção recomendada já vem marcada.",
  recommended: "Recomendado",
  other: "Escrever outra resposta",
  otherHint: "O texto vai para o agente como resposta a esta pergunta.",
  otherLabel: "Sua resposta para a pergunta {number}",
  required: "Escolha uma opção ou escreva uma resposta.",
  submit: "Responder",
  sent: "Respostas enviadas",
  readOnly: "Só quem pode disparar etapas responde às perguntas.",
},
timeline: {
  commentLabel: "Comentar no card",
  commentPlaceholder: "Visível para todos os membros. Agentes leem como contexto, não como instrução.",
  commentSubmit: "Comentar",
  commented: "{login} comentou",
  answered: "{login} respondeu",
  edited: "(editado)",
  commentActions: "Ações do comentário",
  edit: "Editar", save: "Salvar", cancel: "Cancelar", delete: "Apagar",
  deleteTitle: "Apagar comentário?", deleteBody: "O comentário some da linha do tempo para todos.",
  questionAnswered: "Respondida", questionUnanswered: "Sem resposta",
  groups: { tasks: "Tarefas", done: "Concluído", removedStage: "Etapa removida ({key})", rework: "{column} · volta {count}" },
  outcomes: { success: "Concluída", needs_input: "Precisa de resposta", needs_rework: "Pediu retrabalho", failed: "Falhou" },
  empty: { title: "Nada aconteceu neste card ainda", body: "Quando uma etapa rodar, o que o agente fizer aparece aqui." },
},
artifacts: {
  empty: { title: "Nenhum artefato ainda", body: "O plano aparece aqui, ligado ao commit, quando a Análise terminar." },
  openOnGithub: "Abrir {path} no GitHub",
},
```

```ts
// packages/shared/utils.ts (apiErrors)
CARD_QUESTIONS_NOT_PENDING: "Estas perguntas já foram respondidas ou foram substituídas. A tela foi atualizada.",
CARD_ANSWERS_MISMATCH: "As respostas não batem com as perguntas. Recarregue o card e responda de novo.",
CARD_EVENT_NOT_FOUND: "Este item não está mais na linha do tempo.",
CARD_EVENT_NOT_EDITABLE: "Só quem escreveu o comentário pode editá-lo ou apagá-lo.",
```

### 10.9 Pseudo-diffs

```diff
// apps/api/(shared)/lib/board-access.ts
 export type BoardCapability =
     | "view"
     | "manageMembers"
     | "configure"
-    | "trigger";
+    | "trigger"
+    | "comment"
+    | "answer";
 ...
     trigger: canTriggerStages,
+    comment: canCommentOnCards,
+    answer: canAnswerQuestions,
```

(A `card-backlog` acrescenta `"prioritize"` no mesmo lugar; as duas mudanças convivem.)

```diff
// CardDetailClient.tsx (da card-backlog)
-  <SpecSection … />
+  {card.pendingAsk ? <CardQuestions card={card} events={events} canAnswer={canAnswer} /> : null}
+  <Tabs defaultValue="timeline">
+    <TabsList> timeline · spec · artifacts </TabsList>
+    <TabsContent value="timeline"><CardTimeline … /></TabsContent>
+    <TabsContent value="spec"><SpecSection … /></TabsContent>
+    <TabsContent value="artifacts"><CardArtifacts … /></TabsContent>
+  </Tabs>
```

```diff
// BoardCardItem.tsx (da card-backlog)
-  <CardStateBadge state={card.state} />
+  <CardStateBadge state={displayCardState(card)} />
```

### 10.10 Ordem de implementação e commits

1. `feat(kanban-contract): add card event types, answers and comment roles` (com testes).
2. `feat(sdk): add card events to the board cards resource`.
3. `feat(api): store card events and expose the timeline` (mapper, repositório, `pendingAsk` no card, `GET events`,
   `agentEventFromTool`, testes).
4. `feat(api): let members comment and answer questions` (capacidades, rotas comments, events/[eventId], answers,
   testes de rota).
5. `feat(api): seed a card timeline in the emulator` (script, fixture, teste da fixture).
6. `feat(internationalization): add card timeline copy and error codes` (antes do app, para cada commit do app
   passar no typecheck).
7. `feat(app): add card events data hooks` (hooks, `queryKeys`, helpers puros, testes).
8. `feat(app): show pending questions and the answer form` (bloco, formulário, `displayCardState` no quadro).
9. `feat(app): show the card timeline and artifacts` (abas, linha do tempo, comentários, artefatos).
10. `docs: card events collection and timeline seed` (`ARCHITECTURE.md`, `SETUP.md`).
11. `docs(features): card-timeline`.

### 10.11 Env e configuração

Nenhuma env nova. Nenhuma rule nem índice novo. Nenhuma dependência nova: `marked` entra pela `card-backlog`;
`tabs.tsx`, `radio-group.tsx`, `alert-dialog.tsx` e os ícones já estão no repo.

## Pré-requisitos manuais de infra

Nenhum. As consultas usam só igualdade (sem `firestore.indexes.json`), o acesso continua só pelo Admin SDK
(`firestore.rules` com negação total não muda) e o script de fixture só roda contra o emulador. O `/develop` não
acrescenta linha ao `docs/PRE-PRODUCTION.md`. O sinal de pronto "um relatório de etapa aparece no card" com agente
real depende de `agent-contract` e `orchestrator`, que trazem as próprias pendências.

## Riscos

- **Dependência de um plano ainda não implementado.** Nomes de arquivo, `cardIdFor`, `SpecMarkdown`,
  `BoardCardItem` e o falso de cards vêm do plano da `card-backlog`. Se a implementação mudar algum, o `/develop`
  segue o código e registra no handoff.
- **`pendingAsk` e `state` desalinhados.** Se alguém gravar `state: "waiting_input"` sem `ask` (o `orchestrator`
  faz isso no limite de retrabalho), o selo aparece sem bloco de perguntas. É o comportamento certo para aquele
  caso; o `orchestrator` precisa saber que `displayCardState` olha os dois.
- **Leitura sem limite.** `GET events` devolve todos os eventos do card. Um agente que chame `post_update` em loop
  infla o card. O teto natural é o `maxTurnsPerStage`; se medir problema, cortar em N eventos com `orderBy` e
  índice composto (passa a exigir deploy de índice).
- **Markdown de terceiros.** Herda o risco de escape do `codespan` registrado na `card-backlog`; o teste do
  `SpecMarkdown` já cobra.
- **Arquivos compartilhados com tarefas sem commit.** `board-access.ts`, `roles.ts`, `index.ts` do contrato,
  `boardCard/action.ts`, `card.ts` do SDK, `card.mapper.ts`, `CardDetailClient.tsx`, `BoardCardItem.tsx`,
  `queryKeys.ts`, `boards.ts` e `utils.ts` terão diff da `card-backlog` (e alguns de `board-import`,
  `board-members` e `theme-toggle`). O handoff do `/develop` lista o trecho desta tarefa em cada um.

## Perguntas em aberto

Decisões tomadas pelo `/cycle` sem perguntar. Cada uma pode ser revertida.

1. **Pendência de perguntas: `pendingAsk` no card × derivar só de `state`.** **Adotada: `pendingAsk`**, gravado
   só pelas transações de pergunta e resposta, e `displayCardState` na UI. Responder tira o selo agora, sem
   esperar o `orchestrator`, e a regra 14 fica intacta porque `state` não muda. Alternativa: o selo depende só de
   `state`, e o sinal de pronto "responder tira o selo" só fecha junto com o `orchestrator`.
2. **Editar e apagar eventos.** **Adotada: a recomendação da spec**, só comentários de pessoas, só pelo autor,
   apagar é soft delete. Nem o `owner` apaga comentário alheio. Alternativa: `maintainer`+ modera comentários.
3. **Quem responde.** **Adotada: `operator`+ efetivo** (`ACCESS.md`). `viewer` vê as perguntas e comenta.
4. **"Escrever outra resposta" em toda pergunta.** O desenho mostra só na primeira; a spec pede "escolhendo uma
   opção ou escrevendo outra" sem restrição. **Adotada: em todas.**
5. **O que do desenho fica fora.** **Adotada:** aba Execuções, Pipeline, Detalhes, Depende de, linha de execução
   no grupo e "Roda no seu runner…". Dependem de `runs` ou de spec que não existe.
6. **Evento do board ("Card criado ao sincronizar…").** A spec lista seis tipos, nenhum do sistema. **Adotada:
   fora.** Alternativa: tipo `system` gravado pela sincronização da `card-backlog`.
7. **Texto do botão.** O desenho diz "Responder e retomar a Análise", mas nada retoma sem o `orchestrator`.
   **Adotada: "Responder"**, com subtítulo que não promete redisparo. O `orchestrator` troca a copy.
8. **`ask` novo com pergunta pendente.** **Adotada: o novo substitui**, o antigo fica como "Sem resposta".
   Alternativa: recusar o `ask` enquanto houver pendência (decisão que pode voltar no `agent-contract`).
9. **Como o `/test` popula a linha do tempo.** **Adotada: script `seed:timeline` com a trava do emulador e
   fixture validada por teste.** Alternativa descartada: rota de dev na API liberada só com emulador, porque
   abriria um caminho de escrita que teria de ser provado desligado em produção.
10. **Nome da coleção `cardEvent`** × `events` do `ARCHITECTURE.md`. **Adotada: `cardEvent`**, coerente com
    `card` e `boardMember`; o `/develop` corrige o documento.
11. **Sem paginação nem atualização ao vivo.** **Adotada:** lista inteira, recarga ao focar a janela e depois de
    cada ação. Polling durante execução fica com o `orchestrator`, que sabe quando há execução.
