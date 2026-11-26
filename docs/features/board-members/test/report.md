# Relatório de QA: membros, convites e papéis do board

Passada única do `/test` da tarefa 4 do `/cycle` (`board-members`), em 2026-11-26, na branch
`guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida). O working tree carrega também as tarefas
1 a 3, já testadas. Nada foi commitado.

Resultado: 15 de 16 critérios confirmados. Um defeito 🟡 visual: a seção ativa do board ("Membros" ou
"Configuração") não aparece destacada. Suíte Vitest e E2E verdes.

## Cobertura

| Comando | Resultado |
|---|---|
| `pnpm test` (raiz, com cache, JDK 21 no `PATH`) | 13/13 tasks. `@repo/kanban-contract` 67, `@repo/sdk` 9, `@repo/design-system` 140, `@repo/internationalization` 35, `@repo/auth` 211, `@repo/shared` 51, `@repo/security` 65, `@repo/next-config` 34, `@repo/analytics` 41, `e2e` (Vitest) 16, `api` 1006 (83 arquivos), `api` `test:emulator` 142, `app` 701 (98 arquivos). 1m40s, 4 tasks do cache. |
| `pnpm test` de novo, depois do teste novo | 11 tasks do cache; `app` 703 (99 arquivos). |
| `npx vitest run __tests__/boardMembersChangeRole.test.tsx` (app) | 2/2 |
| O mesmo, com a correção do `useMemo` desfeita à mão | 1 falha (`Expected "viewer"`, `Received "operator"`), 1 passa. Arquivo restaurado e conferido com `diff`. |
| `npx biome check` no teste novo | sem erro |
| `pnpm e2e` (Playwright, suíte inteira) | 31/31 em 4,4 min |

A cobertura do `apiErrors` (`apiErrorCodesTranslated`) roda dentro do `api` 1006, verde. O `/review` já
tinha medido `pnpm check` e typecheck; só o arquivo de teste novo mudou depois disso, e passou no Biome.

### Teste criado

`apps/app/__tests__/boardMembersChangeRole.test.tsx`: monta o `BoardMembersClient` com os hooks de dados
mockados e o `ChangeMemberRoleDialog` real. Prova que a escolha no select sobrevive a duas renderizações
do pai com o diálogo aberto e que "Salvar" manda o papel escolhido, e que a linha do dono, que é a
própria pessoa, não oferece mudar o papel. O teste reprova sem a correção do `useMemo`.

## Decisões de custo de teste

| Módulo tocado | Decisão |
|---|---|
| `BoardMembersClient` + `ChangeMemberRoleDialog` | Teste de componente novo (faixa barata). O diálogo que perdia a escolha só aparece com o pai renderizando de novo, e o mock dos hooks basta para isso. |
| `boardMemberRepository` | Sem teste da faixa cara. As consultas são igualdades e rodaram contra o Firestore do emulador nesta passada (item 2 da revisão). Um teste de emulador só repetiria isso. |
| Rotas de membros, guard, rotas de board | Já cobertos por `boardMembersRoutes.test.ts`, `boardAccess.test.ts` e `boardsRoutes.test.ts`; o contrato de infra não mudou. |
| Regras de papel (`roles.ts`) | Já cobertas por `roles.test.ts`. |

## Critérios de aceite

| # | Critério | Status | Meio |
|---|---|---|---|
| 1 | Toda rota de board resolve o papel efetivo; não-membro recebe 404 | ✅ | curl + e2e |
| 2 | Dono importa e aparece como primeiro membro | ✅ | e2e |
| 3 | Convite pendente vira ativo ao entrar | ✅ | e2e + curl |
| 4 | Convite repetido e login inválido | ✅ | e2e + curl |
| 5 | Papel que vale limitado pelo GitHub | ✅ | e2e + curl |
| 6 | "Sem acesso" para quem perdeu o repositório | ✅ | e2e |
| 7 | Só Mantenedor/Dono gerenciam; ninguém passa do próprio papel | ✅ | curl + e2e |
| 8 | IDOR por `memberId` | ✅ | curl |
| 9 | "Mudar papel" mantém a escolha e salva | ✅ | componente + e2e |
| 10 | Remover e cancelar convite | ✅ | e2e + curl |
| 11 | Leitor sem "Recarregar"; API recusa | ✅ | e2e + curl |
| 12 | Personificação lê e não escreve | ✅ | e2e + curl |
| 13 | Webhook `member` invalida o cache | ✅ | unit (`boardAccess.test.ts`) |
| 14 | Erros traduzidos, sem 500 | ✅ | curl + log da API |
| 15 | Claro, escuro, 390 px e seção ativa destacada | ❌ | e2e (defeito 🟡) |
| 16 | Pendências da `board-import` | ✅ | e2e |

As chamadas diretas usaram `Authorization: Bearer <ID token do emulador>`, o mesmo caminho do SDK; a API
também aceita o cookie de sessão, que o browser usou nos fluxos de tela.

Fluxos do plano: M1 a M12 ✅. Valores medidos:

- **M1**: linha do dono "qa-owner / você / Dono / admin / Dono / 26 de nov. de 2026, 02:26 / —" e os
  quatro cartões de papel com "Exige read/write/maintain/admin no GitHub".
- **M2**: quatro `POST .../members` 201; linhas "confere ao entrar", "Convite pendente", "convidado em
  26 de nov. de 2026, 02:27". O menu de um pendente tem só "Cancelar convite". O campo de login fica
  vazio depois de cada convite.
- **M3**: 409; alerta "Esta pessoa já é membro ou já tem convite neste board."; continuaram 5 linhas.
- **M4**: `aria-invalid="true"` no campo, mensagem "Use o login do GitHub: letras, números e hífen, até 39
  caracteres."; nenhum `POST` novo no log da API (5 antes, 5 depois). Direto: 400 `VALIDATION_FAILED`.
- **M5**: `qa-reader` vê `sample-app` com o selo "Operador" em `/boards`; Configuração sem o botão
  "Recarregar configuração"; Membros sem card de convite e sem nenhum botão "Ações de ...".
- **M6**: linha `qa-reader` "Operador / read / Leitor / limitado pelo GitHub".
- **M7**: `qa-reader` em `POST reload`, `POST members`, `PATCH` e `DELETE`: 403 `BOARD_ROLE_INSUFFICIENT`
  nos quatro. `access` = `{role: operator, githubRole: read, effectiveRole: viewer}`.
- **M8**: `qa-outsider` abrindo Configuração vê "Você não tem mais acesso a este repositório no GitHub,
  então não pode abrir o board."; na tabela, "Operador / none / Sem acesso / saiu do repositório".
- **M9**: `qa-maintainer` vê o card de convite com Leitor, Operador e Mantenedor; "—" na linha do dono e
  na própria; menu "Mudar papel / Remover" nas demais. Chamadas diretas no item 3 abaixo.
- **M10**: o dono muda `qa-writer` para Leitor (`PATCH` 200, linha "Leitor / write / Leitor") e remove
  `qa-outsider` (`DELETE` 204, a linha some). `qa-outsider` passa a ver "Board não encontrado." e
  `GET /boards` vazio.
- **M11**: conta de senha `user@example.com`: `GET` do board, `GET` e `POST` de membros respondem 404
  `BOARD_NOT_FOUND`; `GET /boards` devolve lista vazia. Uma conta GitHub `admin` que não é membro
  (`qa-stranger`) recebe o mesmo 404 em `GET`, `GET` de membros e reload. Sem token: 401
  `AUTH_INVALID_TOKEN`.
- **M12**: o admin personificando `qa-owner` vê "Modo somente leitura", "Ações de criação, edição e
  exclusão ficam bloqueadas enquanto você atua como outro usuário." e "Atuando como: qa-owner"; sem card
  de convite e sem ações. Em Configuração, "Recarregar configuração" aparece desabilitado. Direto, com os
  headers de personificação: convite, `PATCH`, `DELETE` e reload respondem 403
  `AUTH_REQUEST_IMPERSONATION_READ_ONLY`.

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|---|---|
| 1 | Diálogo "Mudar papel" depois da correção | **Confirmado.** No browser, `qa-maintainer` abriu o diálogo de `qa-writer` (select em "Operador"), trocou para "Mantenedor" e salvou; o `PATCH` levou 2,2 s e, durante ele, o select só mostrou "Mantenedor". O diálogo fechou e a API devolveu `role: maintainer`. O refetch por foco que o item descreve não acontece neste app: o `QueryProvider` define `refetchOnWindowFocus: false`, e disparar `visibilitychange` não gerou `GET` novo. O caminho de renderização do pai ficou coberto pelo teste de componente, que reprova sem a correção. |
| 2 | Consultas reais no Firestore emulado | **Confirmado** no emulador. O batch do `POST /boards` respondeu 201 e gravou board e membro dono. `findActive`, `claimPendingFor` (convites de `qa-reader`, `qa-writer` e `qa-outsider` reivindicados no `GET /boards` e no guard), `listActiveByGithubId` (lista de boards de cada conta) e a transação de `activate` rodaram sem erro e sem 5xx. Ressalva: o emulador do Firestore nunca exige índice composto, então isso não prova o comportamento em produção. As quatro consultas usam só igualdade, que o Firestore real resolve com os índices de campo único; a confirmação em projeto real fica 🔒. |
| 3 | Escalonamento direto na API | **Confirmado.** `qa-maintainer`: convite com `role: "owner"` → 400 `VALIDATION_FAILED`; `PATCH` e `DELETE` no dono → 403 `BOARD_MEMBER_CHANGE_FORBIDDEN`; `PATCH` em si mesmo → 403 `BOARD_MEMBER_CHANGE_FORBIDDEN`; `PATCH` de `qa-writer` para `owner` → 400; reload → 403 `BOARD_ROLE_INSUFFICIENT`. `qa-writer` como Mantenedor com `write` (efetivo Operador): convite e `PATCH` → 403 `BOARD_ROLE_INSUFFICIENT`. |
| 4 | IDOR | **Confirmado.** Gravei no emulador um membro com `boardId` de outro board (`other-org--other-repo__qa-reader`). `PATCH` e `DELETE` por `/boards/agent-board-demo--sample-app/members/<esse id>` responderam 404 `BOARD_MEMBER_NOT_FOUND`, e o documento ficou intacto. Id com `/` (`a%2Fb`) e id inexistente também deram 404. Apaguei o documento depois. |
| 5 | Convite pendente | **Confirmado.** `qa-reader` ao entrar vê o board com o selo "Operador", o papel no board, como o plano pede em M5 (o item da revisão falava em "Leitor", que é o papel que vale e aparece na tabela). Personificando `qa-reader` com o convite ainda pendente, `GET /boards` devolveu lista vazia, o `GET` do board deu 404, e a linha continuou `pending`. |
| 6 | Perda de acesso | **Confirmado** (M8). |
| 7 | M1 a M12, claro, escuro e 390 px | **Confirmado, com um defeito.** Fluxos acima. A 390 px, nos dois temas, a página não rola na horizontal (`scrollWidth` igual a `clientWidth`) e a tabela rola dentro do `.ant-table-content` (897 px de conteúdo em 326 px). As confirmações "Remover qa-outsider do board?" e "Cancelar o convite de qa-newbie?" apareceram com esse texto; o botão do menu se chama "Ações de <login>". Defeito da seção ativa abaixo. |
| 8 | Pendências da `board-import` | **Confirmado** nos três subitens (abaixo e no relatório da `board-import`). |

### Item 8 em números

- 768 px com o menu lateral aberto (menu em x=8 com 240 px; conteúdo a partir de x=257): o passo 2 tem
  uma coluna só (`grid-template-columns: 447px`). Com `sample-app`, o link "Abrir o arquivo no GitHub" vai
  de x=453 a x=668; com `invalid-config`, de x=451 a x=666. Nenhum elemento passa da viewport e a página
  não rola na horizontal.
- Prévia das colunas: 2 colunas a 768, 1024 e 1279 px; 4 colunas a 1280 e 1440 px. Nenhum texto cortado
  (`scrollWidth` maior que `clientWidth`) nem fora do próprio cartão, com `sample-app` (6 colunas) e
  `invalid-config` (5).
- "Copiar" do primeiro acesso: `<output aria-live="polite" class="sr-only">` vazio no início. Com a
  escrita aceita, passou a "Copiado" e gravou `node kit/apply.mjs ../meu-repositorio`; voltou a vazio
  depois de 2,6 s. Com a escrita recusada (`NotAllowedError`), passou a "Não foi possível copiar". O nome
  acessível do botão continua "Copiar o comando do kit".

## Defeitos e observações

### 🟡 A seção ativa do board não aparece destacada

Repro: entrar como dono e abrir `/pt-br/boards/agent-board-demo--sample-app/members` (ou `/settings`), em
claro ou escuro. O link ativo da navegação "Seções do board" tem `aria-current="page"` e a classe
`bg-secondary`, mas o fundo calculado é `rgba(0, 0, 0, 0)`, igual ao do link inativo. Na tela os dois
rótulos ficam idênticos; na referência (`Members.png`) a seção ativa tem fundo.

Causa provável: as duas telas montam componentes do antd (a tabela), e o antd injeta uma regra global
`a { background-color: transparent }` fora de `@layer`. Regra fora de camada vence as utilidades do
Tailwind, que vivem em `@layer utilities`. Na lista de boards, sem antd, o mesmo tipo de link mantém o
fundo. Correção sugerida: pôr os estilos do antd numa camada abaixo das utilidades (`StyleProvider layer`
do `@ant-design/cssinjs`) ou estilizar o link ativo por um seletor que não dependa só da utilidade de
fundo. Arquivo: `apps/app/app/[locale]/(authenticated)/(common)/(pages)/boards/(components)/BoardSectionNav.tsx`.
Outros links com `buttonVariants` em telas com antd podem ter o mesmo problema; não medi.

### 🟢 Observações sem impacto no aceite

- Durante a animação de saída do diálogo "Mudar papel", o título vira "Mudar o papel de {login}", porque o
  membro já foi limpo. Dura o tempo da animação.
- Os itens destrutivos do menu de ações têm nome acessível "delete Remover" e "delete Cancelar convite": o
  `aria-label` do ícone do antd entra no nome. Vem do `ActionsMenu` compartilhado.
- O primeiro clique em "Criar board" pelo `agent-browser` não disparou nada enquanto o `next dev`
  recompilava (Fast Refresh no console); o segundo criou o board. É da ferramenta, não do produto.

### Comparação com `Members.png`

Batem o título, a descrição, o card "Convidar pelo login do GitHub" com o texto de ajuda, as seis colunas
da tabela, os selos "Dono", "Convite pendente" e "Sem acesso" com "saiu do repositório", a nota "limitado
pelo GitHub" e os quatro cartões de papel. Diferenças:

- A referência tem a barra superior do board (Quadro, Ciclos, Descobertas, Membros, Minhas credenciais,
  Configuração). Aqui ficam o menu lateral do app e a navegação de seções com Configuração e Membros.
- Conferido sai como data absoluta ("26 de nov. de 2026, 02:31"); a referência usa tempo relativo ("há 5
  min"). Desvio previsto no plano.
- As ações ficam num menu de três pontos; a referência mostra "Mudar papel" e "Remover" como links na
  linha.
- O selo "Leitor" limitado pelo GitHub é cinza; na referência é laranja. "Convite pendente" tem contorno
  neutro; na referência é azul.
- Na referência o botão "Convidar" e a seção ativa usam roxo; aqui seguem o tema do design system.

## Lacunas

| Lacuna | Veredito |
|---|---|
| Sem teste de componente de `BoardMembersClient`/`BoardMembersTable` (handoff e revisão) | Fechada em parte: o teste novo cobre o diálogo, a escolha do papel e a linha do dono sem ação. Formulário escondido para Leitor e sob personificação continua sem teste de componente; foi medido no browser (M5, M12). |
| `boardMemberRepository` sem teste próprio | Continua aberta no Vitest; as consultas rodaram no emulador (item 2). |
| Gravação da conferência sob personificação | Continua só em teste unitário (`boardAccess.test.ts`). No browser a conferência do dono tinha menos de 5 min, então a ausência de escrita não prova nada. |
| Permissão real, webhook `member` real e várias instâncias | 🔒 Dependem do GitHub App real (item 5 do `docs/PRE-PRODUCTION.md`). |
| Lacunas herdadas da `board-import` | As três pendências do item 8 estão fechadas; o resto segue como registrado lá. |

## Ambiente do e2e

- No início, 3000, 3002, 4001, 4400, 8080, 9099, 9199 e as portas próprias estavam livres; o `quahog`
  não estava de pé.
- O `pnpm test` e o `pnpm e2e` subiram e derrubaram os próprios servidores e emuladores; as portas padrão
  voltaram vazias depois de cada um.
- Para o browser subi um emulador com config temporária fora do repositório (auth 9098, Firestore 8085,
  websocket 9151, Storage 9198, hub 4401, logging 4501, sem UI), rodei `pnpm seed` contra ele e subi `api`
  em 3012 e `app` em 3010 com o ambiente do Playwright, trocando só portas e hosts. O cliente do GitHub
  rodou no modo falso. Nenhum índice composto foi pedido.
- No fim fechei as cinco sessões do `agent-browser`, matei `api` e `app` por PID (com os filhos) e mandei
  SIGINT ao `firebase-tools`. As oito portas voltaram vazias e nenhum processo ficou. Apaguei
  `apps/api/AGENTS.md`, `apps/app/AGENTS.md` e os dois `firestore-debug.log`.

## Evidências

Prints em `docs/features/board-members/test/e2e/`, que o `.gitignore` descarta; a prova é o texto acima:
`01-new-board-768-invalid.png`, `02-members-light-desktop.png`, `03-members-dark-desktop.png`,
`04-members-dark-390.png`, `05-members-light-390.png`, `06-boards-light-390.png`,
`07-boards-dark-desktop.png`.

## Dados de QA

Tudo no emulador local, já descartado: as contas GitHub `qa-owner`, `qa-maintainer`, `qa-writer`,
`qa-reader`, `qa-outsider` e `qa-stranger` (e-mails `qa-board-members-<papel>@example.com`), as contas do
seed (`admin@example.com`, `user@example.com`, `user2@example.com`), o board
`agent-board-demo--sample-app`, o convite cancelado `qa-newbie` e um membro de teste de outro board,
apagado no fim do item 4. Criei as contas GitHub pelo `signInWithIdp` do emulador, no mesmo formato que o
popup usa, e as sessões do browser entraram pelo popup escolhendo essas contas. Nenhuma conta em projeto
Firebase real. A senha do seed é a do `docs/SETUP.md`, só de emulador, e não está escrita aqui.

## Remedição na passada da card-backlog

Em 2026-11-26, durante o `/test` da `card-backlog`, medi de novo no browser o defeito 🟡 da seção ativa, depois
de o `/review` pôr os estilos do antd na camada `antd`, abaixo das utilidades do Tailwind
(`StyleProvider layer` no `AntdAppProvider` e `@layer theme, base, antd, components, utilities` no
`styles.css`). Mesmo ambiente desta passada: emulador e servidores em portas próprias, cliente falso do GitHub.

| O que foi medido | Resultado |
|---|---|
| Link ativo da navegação "Seções do board" em Membros (tabela antd) | Fundo `lab(96.52)` em claro e `lab(15.2)` em escuro, com `aria-current="page"`; os inativos transparentes. Antes era `rgba(0, 0, 0, 0)`. |
| O mesmo em Configuração (55 elementos antd), escuro | "Configuração" com `lab(15.2)`, os outros transparentes. |
| Outros links com `buttonVariants` | Passo 2 do novo board ("Abrir o arquivo no GitHub", contorno de 1 px, 36 px de altura), página 404 ("Ir para o início", fundo `lab(98.26)` no escuro), "Minha conta" no menu do perfil e o item ativo da sidebar (`lab(96.52)`/`lab(15.2)`): fundo e cor esperados. |
| Tabela antd | Cabeçalho `lab(96.52)` em claro e `lab(15.2)` em escuro, peso 600; linhas transparentes com borda `lab(90.95)`/`lab(15.2)`. |
| Menu de ações e `Popconfirm` | Fundo `lab(100)`/`lab(2.75)`, raio 12 px; item destrutivo em vermelho nos dois temas; "Cancelar o convite de qa-reader?" com "Não" de contorno e "Sim" preenchido, invertidos no escuro. |
| Paginação | 🔒: nenhuma tela do emulador tinha mais de uma página. |
| Nomes do `ActionsMenu` | "Cancelar convite" e, no quadro, "Mover para …": só o rótulo, sem "delete" nem "edit". |

Veredito: o defeito 🟡 "A seção ativa do board não aparece destacada" está corrigido, e a camada nova não mudou a
aparência do antd nas telas medidas. Os 16 critérios desta spec ficam confirmados. Detalhes no
[`report.md` da `card-backlog`](../../card-backlog/test/report.md).

## Estado do pipeline

O `review` continua `in-progress` e nenhum commit das quatro tarefas existe: o gate do `/review` segue
aberto à espera do plano de commits.
