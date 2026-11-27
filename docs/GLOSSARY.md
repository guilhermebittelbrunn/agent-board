# Glossário

Vocabulário recorrente do agent-board — os termos que aparecem no código, nos `CLAUDE.md` e nas
conversas com a IA. Para a visão de sistema, veja [`ARCHITECTURE.md`](ARCHITECTURE.md).

As seções abaixo cobrem a infraestrutura herdada do core e o fluxo de trabalho com agentes. O vocabulário do
board (board, card, etapa, runner, papel efetivo) está na seção [Board](#board).

## Camadas e contratos

- **Slice vertical** — a unidade de trabalho: uma feature atravessando `packages/sdk` (contrato) →
  `apps/api` (rota) → `apps/app` (UI) → `packages/internationalization` (textos). É também a
  ordem de implementação e de commit.
- **`boardMember`** — o **recurso de referência**: os membros do board atravessam o slice inteiro (SDK,
  rota sob `requireBoardApi`, repositório com mapper, tela, i18n). Todo recurso novo espelha esse slice.
- **DTO** — o tipo exposto pela API e consumido pelo front, declarado em `packages/sdk/src/types/`.
  É **o contrato**: mudar um DTO afeta API e todos os apps.
- **Entity (persistência)** — o documento como está gravado no Firestore, mais o `id`. **Não** existe
  camada de domínio: `Entity` é o documento; `DTO` é o contrato. A tradução entre os dois é o mapper.
- **Mapper** — classe em `apps/api/(shared)/mappers/` que estende `Mapper<Entity, DTO>`: `toDTO` normaliza
  (`Timestamp` → ISO, string opcional → `null`) e `toPersistence` filtra as chaves graváveis. Exporta
  **uma instância** (ex.: `boardMemberMapper`).
- **`BaseRepository<DTO>`** — CRUD genérico sobre uma coleção do Firestore. Estampa
  `createdAt`/`updatedAt`/`deletedAt`, faz **soft delete** e aceita o mapper como 3º argumento do `super`.
  ⚠️ Não tem paginação, `orderBy` nem filtros compostos — filtro/ordenação hoje é feito em memória no
  método do repositório.
- **Action (SDK)** — `export default class XActions` em `packages/sdk/src/actions/<recurso>/action.ts`, com
  um método por operação. Precisa ser **registrada no `Client`** para virar `apiClient.<recurso>`.
- **`apiClient`** — a instância do `Client` do SDK usada pelo front (`apps/app/shared/lib/client.ts`). É a
  **única porta** do front para a API.
- **`error.code`** — código estável em `SCREAMING_SNAKE` que a API devolve em `{ error: { code } }`. O front
  traduz via `apiErrors` + `FormattedError`. Todo código novo precisa de entrada em `apiErrors` (pt-br).

## Autenticação e contexto

> Regra de negócio completa: [`AUTH-PANEL.md`](AUTH-PANEL.md).

- **Guard** — wrapper de handler em `apps/api/app/(guards)/` que autentica e autoriza **antes** da lógica.
  Retorna uma `Response` de erro em vez de lançar exceção.
  - **`requireSessionApi`** — exige sessão e perfil; injeta `ctx.user` e `ctx.profile`.
  - **`requireBoardApi`** — compõe sobre o de sessão e exige o papel efetivo no board.
- **Ownership** — regra de que um recurso pertence a um usuário (campo `userId` no documento). Violação
  responde **404**, não 403 — para não vazar a existência do recurso.
- **Session cookie × ID token** — o front autentica chamadas do SDK com `Authorization: Bearer <ID token>`;
  o Next (proxy, RSC, rotas de sessão) usa o **cookie `access-token`**, que guarda um *session cookie* do
  Firebase. A API aceita os dois.
- **`requireSession`** — guarda server-side de `apps/app/lib/server/`, que redireciona para o sign-in
  antes de renderizar. **Espelham** — não substituem — os guards da API.

## Produto e configuração

- **Core / `upstream`** — o next-boilerplate, de onde o agent-board foi copiado. O remoto `upstream` aponta
  para ele; `git fetch upstream && git merge upstream/main` traz melhorias. O que foi removido aqui volta como
  conflito "modificado lá / removido aqui" e se resolve mantendo a remoção.
- **Repositório importado** — um repositório (como o next-boilerplate) que recebeu o kit e virou um board.
- **`proxy.ts`** — o middleware do Next (renomeado no Next 16). Em `apps/app` resolve locale e sessão; em
  `apps/api` faz o CORS (header customizado novo precisa entrar no `allowHeaders`).

## Front-end

- **Grupos de rota** — pastas entre parênteses que **não** entram na URL:
  `(landing)`/`(authenticated)`/`(unauthenticated)` (guarda), `(common)` (a área com cabeçalho),
  `(pages)` (isola os `page.tsx` do `paths.ts`), e `(hooks)`/`(components)`/`(validations)`
  (colocação por rota).
- **Prefetch RSC** — o Server Component pré-carrega a query (`prefetchQuery` + `HydrationBoundary`) usando
  a **mesma `queryKey`** do hook client, para a hidratação casar.
- **`queryKeys`** — fábrica central de chaves do React Query (`apps/app/shared/lib/queryKeys.ts`), usada
  tanto no prefetch quanto nos hooks.
- **Toggle otimista** — mutation de `enabled` que atualiza o cache com `setQueryData` (lista + detalhe) e
  faz rollback no erro, **sem** `invalidateQueries`.
- **`HookForm*`** — os componentes de `packages/design-system/components/form/hookform/` que ligam os
  primitivos ao React Hook Form. A prop de erro é **`error`**, nunca `errorMessage`.
- **`Container` / `FormContainer` / `Footer`** — o casco de página/formulário. ⚠️ Ficam em
  **`apps/app/shared/components/ui/`**, não no design system.
- **`Table`** — o wrapper de tabela do design system (antd por baixo), com `searchFields` (busca em
  memória), `onRefresh` e `refreshLoading`. Por ser antd, **valide o tema light/dark** ao mexer nele.
- **Folha de dicionário** — arquivo de tradução com a chave de idioma `pt-br`, que sobe por `index.ts` até
  `translations/global.ts`. O dicionário é tipado pelo objeto, então chave inexistente quebra o
  `typecheck` de quem a lê.
- **Schema factory** — `buildXFormSchema(dictionary)`: o schema Zod é construído a partir do dicionário,
  para que as mensagens de validação também sejam traduzidas.

## Fluxo de trabalho

- **Spec** — a ficha de uma funcionalidade **candidata**, em `specs/features/<id>.md`: problema, evidência de
  mercado, corte de MVP e riscos. Responde **o quê** e **por quê**; o **como** é do `analyze/plan.md`. Uma
  spec não contém pseudo-diff nem nome de arquivo a criar. Ver [`specs/README.md`](../specs/README.md).
- **Arquivar uma spec** — tirá-la de `specs/` e guardá-la junto da feature que a implementou, quando o
  `/spec --sync` confirma a entrega **no código**. É o que mantém `specs/` significando "o que falta".
  Regra e exceções: [`specs/README.md`](../specs/README.md).
- **Backlog** — `specs/BACKLOG.md`, a fila priorizada das specs em uma página. É a **fonte da ordem**; o
  arquivo da spec, em `specs/features/<id>.md`, é a fonte do conteúdo. A evidência de cada auditoria (achados,
  gates, deriva, lotes paralelos) fica em `specs/reference/AUDIT.md`.
- **Prevalência** — quantas referências de um painel declarado entregam um recurso por padrão ("7 de 11").
  É o dado que sustenta "isso é padrão de mercado"; impressão não é.
- **Deriva** — quando o corte de MVP de uma spec foi implementado, mas **diferente** do especificado.
  Detectada pelo `/spec --sync`; significa que ou a spec estava errada, ou a implementação desviou.
- **`STATE.md`** — índice + gate do pipeline de uma tarefa, em `docs/features/<slug>/`. Quando a tarefa
  nasceu de uma spec, o frontmatter traz `spec: <id>`. Ver [`TASK-PIPELINE.md`](TASK-PIPELINE.md).
- **Handoff** — o resumo conciso que uma etapa deixa para a próxima (`develop/handoff.md`,
  `review/review.md`), para que ela não precise reler o plano e o diff inteiros.
- **Validação visual** — subir o app e percorrer o fluxo com a skill `agent-browser`, conferindo
  light/dark/mobile. É **bloqueante** em front-end (regra de ouro 11) e acontece **uma
  vez**, no `/test`: o `analista-qa` é o único agent que executa o produto.
- **Verificar no `/test`** — a lista que o `/review` deixa no `review.md` com as afirmações do handoff que
  não dá para confirmar lendo código, cada uma com repro sugerido. É por onde o QA começa.
- **Branch protegida** — `main`, `master`, `production`, `production-backup`. Nunca recebem commit direto.

## Board

Modelo completo em [`docs/board/`](board/README.md).

- **Board** — um quadro por repositório importado. As colunas vêm do `.kanban/board.yml` versionado nele.
- **Card** — uma spec do backlog do repositório (`specs/features/<id>.md`) dentro do board. Guarda coluna,
  estado (`idle`, `queued`, `running`, `waiting_input`, `failed`), branch, PR e custo acumulado.
- **Etapa** — o comando que uma coluna executa (`/analyze`, `/develop`, `/review`, `/test`). A etapa termina
  com um resultado (`success`, `needs_input`, `needs_rework`, `failed`) e o board decide a transição.
- **Modo board** — os comandos chamados com `--board <card-id>`: perguntas viram `ask` no card, cada etapa
  termina com commit e push na branch do card e a sessão nunca espera resposta no terminal.
- **Runner / executor** — quem roda a etapa: runner local (Agent SDK na máquina-alvo), nuvem (tarefa
  agendada do Claude Code com gatilho de API) e, depois, GitHub Actions.
- **Papel efetivo** — o menor entre o papel no board (owner, maintainer, operator, viewer) e a permissão da
  pessoa no repositório do GitHub. É o que os guards do board conferem.
- **Kit** — o que um repositório recebe para entrar num board (`kit/apply.mjs`): `.kanban/board.yml`, a regra
  `board-mode.md` e a seção "Modo board" nos comandos.
