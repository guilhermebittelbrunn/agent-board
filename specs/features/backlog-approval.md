---
id: backlog-approval
title: Ver no board todas as specs do backlog e aprovar pelo painel
status: approved
value: alto
effort: M
audience: time
phase: 2
area: [packages/kanban-contract, packages/sdk, apps/api, apps/app, kit, .claude]
depends_on: [card-backlog, spec-authoring]
contends_on: ["apps/api/(shared)/lib/card-sync.ts", "apps/api/(shared)/lib/spec-draft.ts", packages/kanban-contract/src/boardLanes.ts]
feature: null
updated: 2026-11-27
---

# Ver no board todas as specs do backlog e aprovar pelo painel

> **Resumo**
> - **O quê:** toda spec que o índice do backlog lista vira card, com o motivo do bloqueio quando houver, e uma spec `proposed` sem bloqueio pode ser aprovada pelo painel.
> - **Por quê:** hoje, para saber o que está no backlog e por que algo não anda, é preciso abrir o repositório; para aprovar, editar o arquivo, mergear e sincronizar.
> - **Status:** `approved` · valor alto · esforço M · time
> - **Próximo passo:** `/analyze backlog-approval`

## Problema

O board só mostra uma spec do repositório como card pronto quando o frontmatter abre e o status é o
`readyStatus`. Aprovar exige trocar o status no arquivo, mergear na base e sincronizar. Spec cujo YAML o
parser recusa não vira card: aparece num aviso que some ao fechar ou recarregar a página. Em 2026-11-27,
sete specs deste repositório ficaram fora do board por isso, e o motivo só apareceu lendo o parser. Quem usa
o board precisa abrir o código para saber o que tem no backlog e o que impede cada spec de andar.

## O que já existe no repo

- `apps/api/(shared)/lib/card-sync.ts:60` (`readSpecFile`) — arquivo com frontmatter que não abre vira
  `skipped` com motivo `frontmatter_invalid` e não gera card.
- `apps/api/(shared)/lib/card-sync.ts:239` — o card fica pronto só quando o status do arquivo é igual ao
  `readyStatus`; nada guardado no card torna pronta uma spec do backlog.
- `apps/api/app/(routes)/boards/[id]/cards/[slug]/spec/approve/route.ts` e
  `apps/api/(shared)/lib/spec-draft.ts:288` (`checkDraftApprovable`) — a aprovação pelo painel já existe,
  mas só para card em Rascunhos. Ela grava `specApproval` (quem e quando) no card, e o arquivo continua com
  o status que o agente escreveu.
- `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(pages)/[id]/BoardClient.tsx:306` — a
  lista de arquivos que não viraram card vive num `useState`: fechar o aviso ou recarregar apaga.
- `apps/app/.../boards/(components)/NotReadyCards.tsx` — lista as specs não prontas com o status, e a dica
  diz que elas só entram em Tarefas quando o status mudar no repositório.
- `.claude/commands/analyze.md:25` e `kit/commands/analyze.md:13` — no modo board, o `/analyze` trata
  `proposed` como `approved` só quando `card.origin` é `"board"`.
- `docs/board/ACCESS.md:17` — o GitHub App tem `Contents: read`; o board não escreve no repositório.
- **Lacuna:** aprovar spec do backlog pelo painel, card para spec que não abre, motivo do bloqueio visível
  no card e lista de arquivos fora do board que sobreviva ao recarregar.

## Referências

- Aprovação de rascunho: [`docs/features/spec-authoring/spec.md`](../../docs/features/spec-authoring/spec.md).
- Cards a partir do backlog: [`docs/features/card-backlog/spec.md`](../../docs/features/card-backlog/spec.md).
- Permissões do GitHub App: [`docs/board/ACCESS.md`](../../docs/board/ACCESS.md).
- Contrato do frontmatter e as duas armadilhas de YAML: [`specs/README.md`](../README.md#frontmatter).

## Proposta — corte de MVP

- [ ] A sincronização cria card para toda spec que o índice lista, pronta ou não. Spec com frontmatter
      que não abre também vira card: slug pelo nome do arquivo, título pelo primeiro `#` e bloqueio
      `frontmatter_invalid` com a mensagem do YAML e a linha.
- [ ] Card não pronto mostra primeiro o bloqueio e o motivo, quando houver:
  - frontmatter que não abre, com o erro e a linha;
  - status que o painel não aprova: qualquer um além do aprovável (`proposed`) e do `readyStatus`, como
    `deferred`, `superseded` ou `rejected`, aparece como "Bloqueada: status `<status>`";
  - `depends_on` não entregue: "Depende de `<id>` (`<status>`)", ou "Depende de `<id>`, que não está no
    backlog" quando o índice não lista a dependência. Uma dependência conta como entregue quando o card
    dela tem o status de entregue (`done`).
- [ ] Botão "Aprovar" no card do backlog com status `proposed` e sem bloqueio, na lista de não prontas e na
      página do card. Mesmo papel que aprova rascunho (`prioritize`). Com bloqueio, o botão aparece
      desabilitado com o motivo.
- [ ] A aprovação fica no card (`specApproval`: quem, quando e o sha da spec aprovada) e o arquivo continua
      `proposed`. O card passa a pronto e entra no fim de Tarefas.
- [ ] A API recusa aprovar card com bloqueio, com um `error.code` por motivo, e recusa status diferente do
      aprovável. A UI desabilitada não é a única proteção.
- [ ] A sincronização preserva a aprovação enquanto o arquivo estiver `proposed` ou no `readyStatus`. Se o
      arquivo mudar para outro status ou ganhar um bloqueio, o card que ainda está em Tarefas deixa de estar
      pronto e mostra o motivo.
- [ ] O `get_card` informa a aprovação, e o `/analyze` no modo board (neste repositório e no `kit/`) trata
      `proposed` como `approved` quando o card tem `specApproval`, venha de Rascunhos ou do backlog.
- [ ] Arquivos que não têm como virar card (`not_found`, `slug_invalid`, `slug_duplicated`, `limit`) ficam
      guardados com a última sincronização e aparecem no board até a próxima, em vez de só na resposta do
      sync.

### Fora do corte

- Gravar a aprovação no repositório (PR trocando o status): exige `Contents: write` no GitHub App, e o
  board continua só lendo o repositório.
- Aprovar pelo painel spec `deferred`, `superseded` ou `rejected`: reabrir continua sendo decisão tomada no
  arquivo.
- Corrigir o frontmatter pelo board: quem quiser edita no GitHub.
- Avisar quando a spec muda depois de aprovada.

## Impacto por camada

| Camada | Impacto |
|--------|---------|
| `packages/kanban-contract` | Motivos de bloqueio do card; status aprovável (padrão `proposed`) e status de entregue (padrão `done`) no bloco `backlog` do `board.yml`; regra de pronto que considera a aprovação no card |
| `kit/` | Trecho do modo board do `/analyze`: aprovação no card vale para qualquer origem; `board.yml` do kit com os status novos comentados |
| `packages/sdk` | Bloqueios e aprovação no `CardDTO`; ação de aprovar spec do backlog; arquivos fora do board no `backlogSync` |
| `apps/api` | Sync cria card para spec que não abre e calcula os bloqueios; rota de aprovação aceita card do backlog; `get_card` com a aprovação; `error.code` novos |
| `apps/app` | Bloqueio e "Aprovar" na lista de não prontas e na página do card; aviso de arquivos fora do board persistente |
| `packages/internationalization` | Textos dos bloqueios, do botão e dos `apiErrors` novos |
| Infra/env | Nenhuma |

## Riscos e trade-offs

- O board passa a ter um card para cada spec do índice, as entregues inclusive (15 no agent-board hoje). A
  lista de não prontas precisa continuar curta: agrupada por motivo e com as entregues recolhidas.
- Quem lê o repositório vê `proposed` numa spec aprovada no board. A divergência dura até o `/analyze`
  gravar `in-progress` na branch da feature, e o `/spec --sync` precisa saber que aprovação no card existe
  para não acusar a spec de parada.
- Spec com frontmatter quebrado recebe o slug pelo nome do arquivo. Se o `id` corrigido for outro, o board
  deve casar pelo caminho do arquivo, senão nasce um card novo e o antigo fica órfão.

## Sinais de pronto

- No agent-board, uma spec com YAML quebrado aparece como card com o erro e a linha, sem abrir o código.
- Aprovar `spec-discovery` pelo painel coloca o card em Tarefas, e arrastar para Análise roda o `/analyze`
  sem perguntar sobre o status.
- `cycle-schedule` mostra "Depende de `cycle-runs` (`in-progress`)" com o "Aprovar" desabilitado, e um
  `POST` direto na rota de aprovação responde 409.
- Depois de recarregar a página, os arquivos que não viraram card continuam listados.

## Perguntas em aberto

- Spec `done` aparece como bloqueada? — **recomendação:** não; aparece como entregue, num grupo recolhido,
  porque não há nada a destravar.
- O card de spec com frontmatter quebrado casa com o card certo depois da correção pelo `id` ou pelo
  caminho? — **recomendação:** pelo caminho do arquivo, para não deixar card órfão.
