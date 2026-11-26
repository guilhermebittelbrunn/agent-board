# Relatório de QA: criar board importando um repositório

Branch: `guilhermebittelbrunn/chore-cycle-three-tasks` (não protegida; o nome fora do padrão continua como
decisão em aberto da revisão). O working tree também contém as tarefas `github-app-integration` e
`github-sign-in`, testadas antes. Nada foi commitado; os testes criados aqui ficam no working tree para o
`/review`.

Resultado da rodada 2: a revisão corrigiu o 🟡 e os cinco 🟢 da rodada 1, e os seis itens foram
medidos de novo no browser. Cinco passaram. O item de layout passou a 390 px, mas a medição em `md` com o
menu lateral aberto achou um defeito 🟡 novo no passo 2 do assistente (o link "Abrir o arquivo no GitHub"
fica cortado fora da tela). Um critério continua 🔒 (permissão real abaixo de `admin`), porque depende do
GitHub App real. Detalhe em "Rodada 2", no fim do arquivo; as seções anteriores descrevem a rodada 1.

## Cobertura

| Comando | Resultado |
|---|---|
| `pnpm turbo run test --filter=@repo/kanban-contract --filter=@repo/sdk --filter=@repo/internationalization --filter=api --filter=app` (com cache, antes dos testes novos) | contrato 61/61, SDK 9/9, i18n 35/35, API 937/937, app 686/686. A task `app:test` saiu com código 1 por `[vitest-pool]: Timeout starting forks runner` (2 erros não tratados), com todos os testes passando. |
| `npx vitest run __tests__/boardsRoutes.test.ts` (API) | 46/46 (eram 40) |
| `npx vitest run __tests__/githubFileUrl.test.ts` (app) | 4/4 (arquivo novo) |
| `pnpm test` (raiz, com cache, JDK 21) | 11 de 13 tasks verdes. `app:test` e `api:test:emulator` falharam pelo mesmo `Timeout starting forks runner`, com 0 teste reprovado (API 943/943; `test:emulator` 138/138 em 3 arquivos, o quarto nem iniciou). |
| `npx vitest run --maxWorkers=3` em `apps/app` | 96 arquivos, 690/690, 0 erro |
| `pnpm run test:emulator` em `apps/api`, sozinho | 4 arquivos, 142/142, 0 erro |
| `pnpm e2e` (Playwright completo, desktop + mobile) | 31/31 em 3,4 min |
| `npx biome check` nos dois arquivos de teste alterados | sem erro |
| `pnpm turbo run typecheck --filter=api --filter=app` | 2/2 |

O timeout do pool de forks vem da carga da máquina, não de defeito: a média de carga estava em 48 (8
núcleos) na primeira rodada, com um Vitest de outro checkout rodando ao mesmo tempo. Com menos workers, e
com o `test:emulator` sozinho, as duas suítes passaram sem erro. Não usei `--force`.

Não medi o `apiErrorCodes` de novo: nenhum `error.code` mudou desde a revisão, que mediu 2/2, e a suíte
inteira da API (que o inclui) passou.

### Testes criados ou alterados

- `apps/api/__tests__/boardsRoutes.test.ts`: seis casos novos. `POST /boards` com papel `read`, `triage`,
  `write` e `maintain` responde 403 `BOARD_IMPORT_FORBIDDEN` sem chamar `createForRepository`; com papel
  `none`, 404 `GITHUB_REPOSITORY_NOT_ACCESSIBLE` sem gravar; `GET /boards/repositories` com papel `write`
  em todos os repositórios devolve lista vazia com 200.
- `apps/app/__tests__/githubFileUrl.test.ts` (novo): branch padrão, branch `release/v1` mantendo a barra,
  caracteres reservados codificados por segmento e `owner`/`name` com `/` codificados (não criam
  segmento novo).

## Decisões de custo de teste

| Módulo | Decisão |
|---|---|
| Rotas `/boards*` | Faixa barata. O filtro por `admin` e o 403 já tinham teste na lista, na prévia e na recarga; faltava a criação, que agora tem. O cliente falso responde `admin` sempre, então o teste de rota com `withRole` é o jeito barato de provar o corte. |
| `githubFileUrl` | Unitário puro; a correção da revisão não tinha teste. |
| `board.repository.ts` | Nenhum teste novo. O browser exercitou `createForRepository` com id fixo contra o emulador (um documento depois de três `POST`). Não criei teste com emulador: o `ALREADY_EXISTS` tem precedente em `notification.repository` e o browser mediu o caso. |
| Telas (`NewBoardClient`, `BoardColumnsPreview`, `BoardSettingsClient`) | Sem teste de componente; a passada no browser cobriu os estados válido, inválido, ausente, já importado, erro, personificação e board alheio. |
| Hooks de leitura | Sem teste próprio; cada um é uma chamada de SDK, e o browser os exercitou. |

Nenhum teste da faixa cara foi criado.

## Critérios de aceite

Texto completo em [`criterios-aceite.md`](criterios-aceite.md).

| # | Critério | Status | Meio |
|---|---|---|---|
| 1 | Primeiro acesso com três passos e "Novo board" | ✅ | e2e (browser) |
| 2 | Lista só com repositórios `admin` e o estado de board | ✅ | rota (`write` → lista vazia; mistura → só o `admin`) + e2e ("Escolher", "Abrir board", "Já tem board", "Privado") |
| 3 | Arquivo válido, prévia e criação | ✅ | e2e + rota |
| 4 | Arquivo inválido com caminho e frase, criar bloqueado | ✅ | e2e (tela) + rota (422) |
| 5 | Arquivo ausente | ✅ | e2e (tela) + rota (422) |
| 6 | Um board por repositório | ✅ | e2e (3 `POST`: 201, 409, 409; um documento) + rota |
| 7 | Snapshot com defaults, sha e dono; `installationId` da API | ✅ | Firestore do emulador + rota |
| 8 | Recarga: nada mudou, mudanças, erros | ✅ | e2e (nada mudou e coluna nova) + rota (inválido e ausente mantêm o snapshot) |
| 9 | Só os boards da pessoa; board alheio não encontrado | ✅ | e2e com duas contas + rota |
| 10 | `error.code` traduzido para conta sem GitHub, App ausente, repo inacessível, papel insuficiente | ✅ | e2e (conta de senha, repositório inacessível) + rota (App ausente, papéis) |
| 11 | Personificação lê e não escreve | ✅ | e2e (botões desabilitados, aviso) + rota (403) |
| 12 | Erro da prévia com uma repetição | ✅ | e2e (log da API) |
| 13 | "Abrir o arquivo no GitHub" | ✅ | e2e (href) + unit |
| 14 | Claro, escuro e 390 px sem rolagem horizontal | ✅ | e2e; observações 🟢 de layout abaixo |
| 15 | Permissão real abaixo de `admin` | 🔒 | Só rota. Exige o GitHub App real (item 5 do `docs/PRE-PRODUCTION.md`). |

## Verificar no `/test` (lista da revisão)

| # | Item | Veredito |
|---|---|---|
| 1 | Filtro por admin e 403 `BOARD_IMPORT_FORBIDDEN` para `write` | **Confirmado no teste de rota**: lista sem o repositório `write` (já existia) e lista vazia quando a pessoa é `write` em todos (novo); prévia 403 para `read`/`triage`/`write`/`maintain` (já existia); criação 403 para os quatro papéis sem gravar (novo); recarga 403 para `write` (já existia); `none` → 404 `GITHUB_REPOSITORY_NOT_ACCESSIBLE` na prévia e na criação. Em runtime fica 🔒, porque o cliente falso sempre responde `admin`. |
| 2 | IDOR na tela | **Confirmado**. Com a conta de senha do seed e com uma segunda conta GitHub, `/pt-br/boards/agent-board-demo--sample-app/settings` mostra "Board não encontrado." com código de rastreio; a API respondeu `GET /boards/agent-board-demo--sample-app 404`; "Recarregar configuração" não aparece. |
| 3 | F1 a F11 pelo emulador | **Confirmado** (detalhe em "Evidências"). `invalid-config` mostra o selo "1 erro" e a coluna Revisando com borda vermelha; `no-kanban` desabilita "Criar board"; a URL do repositório já importado mostra "Este repositório já tem um board.". |
| 4 | F8, recarga com mudança | **Confirmado**. Com `test` removido de `config.stages` e `configSource.sha` trocado por zeros no emulador, a tela mostrou "Lido de main em 0000000"; a recarga mostrou "Configuração atualizada para 4fb2827." e "Coluna nova: Testando", e a linha voltou a "Lido de main em 4fb2827". |
| 5 | Conta de senha em `/boards/new` | **Confirmado**: "Entre com a sua conta do GitHub para criar um board." no lugar da lista. |
| 6 | Personificação | **Confirmado**: aviso "Modo somente leitura" com "Atuando como: QA Board"; "Recarregar configuração" e "Criar board" com `disabled`. |
| 7 | Retry em 4xx | **Confirmado, uma repetição**. `/boards/new?repository=someone/else` gerou dois `GET /boards/preview` com 404 e o erro apareceu cerca de 1,9 s depois da navegação. O 403 de `/boards/repositories` da conta de senha também gerou duas requisições. |
| 8 | "Abrir no GitHub" | **Confirmado**: `https://github.com/agent-board-demo/invalid-config/blob/main/.kanban/board.yml`, `target="_blank"`, `rel="noopener noreferrer"`. |
| 9 | Layout claro, escuro e 390 px; "Copiar" | **Confirmado com observações** (abaixo). "Copiar" grava `node kit/apply.mjs ../meu-repositorio` e mostra "Copiado"; quando o navegador recusa a escrita, o rótulo continua "Copiar" sem aviso. |

## Evidências e2e

Ambiente: emulador (auth, Firestore, Storage) com o seed, `api` em 3002 e `app` em 3000 com o mesmo
ambiente que o Playwright monta (`buildStackEnv`), cliente GitHub em modo `fake`. Login pela janela do
emulador com a conta `qa-board-import` (o `agent-browser` não entrega clique à janela; preenchi e enviei
o formulário pelo DOM, como no roteiro do `github-sign-in`).

- **F1, primeiro acesso.** Título "Comece pelo seu primeiro board", três cartões numerados, link "Novo
  board" para `/pt-br/boards/new`. Em claro, escuro e 390 px (`scrollWidth` 375 = `clientWidth` 375).
- **Picker.** Três linhas: `agent-board-demo/sample-app`, `agent-board-demo/invalid-config` com selo
  "Privado" e `agent-board-demo/no-kanban`, cada uma com "Escolher". Depois da importação, o dono vê
  "Abrir board" em `sample-app`, e a segunda conta GitHub vê "Já tem board".
- **F2, `sample-app`.** "em main · commit 4fb2827", seis colunas (Tarefas, Análise, Executando,
  Revisando, Testando, Concluído), regras com "Branches protegidas main, master, production,
  production-backup" e "Preparo do ambiente —". "Criar board" levou a
  `/pt-br/boards/agent-board-demo--sample-app/settings`.
- **F3, `invalid-config`.** "em main · commit 4cd7d8b", selo "1 erro", `stages[2].onRework` e "A etapa
  Revisando devolve o card para deploy, que não existe antes dela. Aponte para uma etapa anterior, como
  develop." Revisando com borda vermelha, "Retrabalho volta para deploy" e "Esta etapa tem um erro".
  "Criar board" com `disabled=true`. "Ler de novo" disparou um segundo `GET /boards/preview` (200).
  Em escuro, a borda e as linhas de erro continuam vermelhas e legíveis sobre o fundo escuro.
- **F4, `no-kanban`.** "Este repositório ainda não tem .kanban/board.yml na branch main. Aplique o kit e
  leia de novo." e "Criar board" desabilitado.
- **Criação com cliques repetidos.** Três `click()` no mesmo tick geraram `POST /boards 201`,
  `POST /boards 409`, `POST /boards 409`. A coleção `board` ficou com um documento, que tem
  `ownerUserId`, `ownerGithubId` (só dígitos), `repository.installationId = 1`, `config` com
  `protectedBranches` padrão, `configSource.sha` de 40 caracteres, `createdAt` e `updatedAt`.
- **F5, lista.** Card "sample-app", selo "Dono", `agent-board-demo/sample-app`, "4 etapas · lido de main
  em 4fb2827"; o card é link para a configuração.
- **F6.** `/pt-br/boards/new?repository=agent-board-demo/sample-app` mostra "Este repositório já tem um
  board." com "Criar board" desabilitado, para o dono e para a segunda conta.
- **F7.** "Recarregar configuração" mostrou "Nada mudou desde a última leitura (4fb2827)."
  (`POST /boards/agent-board-demo--sample-app/reload 200`).
- **F8.** Ver item 4 acima. A tabela de etapas passou a mostrar Testando.
- **Configuração.** Tabela com Análise, Executando, Revisando e Testando; colunas Comando e agente,
  Modelo, Onde roda, Retrabalho volta para e Aprovação. Revisando e Testando mostram "Executando" em
  retrabalho; Análise mostra aprovação "Opcional".
- **F9, F10, F11 e item 7.** Ver a tabela anterior.

### Comparação com as telas de referência

As diferenças abaixo estão previstas no plano (seção 5.3) e não contam como defeito. O primeiro acesso não
tem o botão "Instalar no GitHub", o selo "Ainda não instalado", o "Libera depois do passo 1" nem a faixa
"Foi convidado para um board?". Os cards de `Boards.png` e `MBoards.png` não têm distribuição por coluna,
selos de execução nem ciclo noturno, e a faixa "O GitHub App do board está instalado em N repositórios"
ficou fora. O assistente de `NewBoard.png` tem 2 passos em vez de 4, e o botão final é "Criar board" em
vez de "Continuar para executores". A Configuração mostra só as etapas, sem as abas de `Settings.png`. A
tela usa o layout do painel (barra lateral, breadcrumb, cores neutras) em vez do topo roxo da referência,
e no celular o "+" da lista fica abaixo do título, não ao lado.

## Defeitos e observações

1. 🟡 **O resumo do repositório afirma acesso de admin quando a prévia falhou.** Repro: entrar com uma
   conta GitHub e abrir `/pt-br/boards/new?repository=someone/else`. A tela mostra o erro "O GitHub App
   do board não tem acesso a este repositório." e, logo acima, "GitHub App instalado · você é admin no
   repositório · vira dono do board". O `RepositorySummary` aparece com a frase fixa sempre que há
   repositório selecionado (`NewBoardClient.tsx:213`), inclusive com 404 e 403. Com um App real e papel
   `write`, a tela diria "você é admin" ao lado de `BOARD_IMPORT_FORBIDDEN`. Correção sugerida: mostrar a
   linha de detalhe só quando `previewData` existe.
2. 🟢 **Configuração a 390 px.** O botão "Recarregar configuração" fica ao lado do texto, e "Lido de main
   em 4fb2827, 26 de nov. de 2026, 01:12." quebra em seis linhas de uma ou duas palavras. O mesmo
   acontece no passo 3 do primeiro acesso (descrição em nove linhas ao lado de "Novo board") e no resumo
   do repositório do passo 2. Empilhar o botão abaixo do texto no celular resolve.
3. 🟢 **Nome do repositório quebra no meio da palavra a 390 px** (`agent-board-demo/s` / `ample-app`)
   por causa do `break-all`.
4. 🟢 **Rótulo acessível diferente do texto visível.** O botão "Novo board" da lista tem `aria-label`
   "Criar um board" (`newBoardAria`). O critério 2.5.3 do WCAG (rótulo no nome) pede que o nome acessível
   contenha o texto visível; quem usa comando de voz e diz "Novo board" não acha o botão.
5. 🟢 **`no-kanban` mostra "Corrija o erro para continuar"** ao lado do botão desabilitado; para arquivo
   ausente, a frase não descreve o que falta.
6. 🟢 **"Copiar" falha sem aviso.** Se `navigator.clipboard.writeText` rejeita, o `catch` só mantém
   "Copiar", sem mensagem.

Sem defeito: cliques no mesmo tick enviam três `POST`, porque o botão só desabilita no próximo render. A
API segura com 409 e o banco fica com um documento, como o critério pede.

## Lacunas herdadas

| Lacuna | Veredito |
|---|---|
| Sem teste de componente das telas | Continua aberta no Vitest; o browser percorreu os estados. |
| `board.repository.ts` sem teste | Parcialmente fechada em runtime: `createForRepository` com id já ocupado devolveu 409 contra o Firestore do emulador, e `linksFor` mostrou "Abrir board"/"Já tem board" para as duas contas. Board apagado (`deletedAt`) em `linksFor` continua sem medição. |
| Hooks de leitura sem teste próprio | Continua aberta, baixa prioridade; o browser os exercitou. |
| Limite de 8 consultas simultâneas | Continua aberta. |
| `githubFileUrl` com `/` no `ref` | Fechada (`githubFileUrl.test.ts`). |
| Filtro por `admin` na criação | Fechada (casos novos em `boardsRoutes.test.ts`). |

## Ambiente do e2e

- No início, 3000, 3002, 4001, 4400, 4500, 8080, 9099, 9150 e 9199 estavam livres.
- Subi o emulador (`pnpm emulators`, JDK 21 de `/opt/homebrew/opt/openjdk@21`), rodei `pnpm seed` e subi
  `api` (3002) e `app` (3000) com `next dev`. No fim derrubei os processos por PID (os filhos do
  `next dev` também) e mandei SIGINT ao `firebase-tools`; as portas voltaram vazias.
- O `pnpm e2e` subiu e derrubou o próprio ambiente; as portas ficaram vazias depois.
- O `pnpm test` e a repetição do `test:emulator` subiram emulador próprio e o derrubaram (o
  `firestore-debug.log` da `apps/api` fechou às 01:25:01). Às 01:25:40 outro checkout da máquina
  (`next-boilerplate/quahog`) subiu um emulador nas portas 8080, 9099 e 9199; não é meu, não foi tocado
  e não recebeu dado desta rodada.
- Apaguei `apps/api/AGENTS.md` e `apps/app/AGENTS.md` gerados pelo `next dev`. Os prints ficaram em
  `test/e2e/` (ignorado pelo git) só como apoio; a prova é o texto acima.

## Dados de QA

Tudo ficou no emulador local, que perde os dados ao parar: as contas GitHub `qa-board-import` e
`qa-board-import-2` (e-mails `qa-board-import@example.com` e `qa-board-import-2@example.com`), as contas
do seed (`user@example.com`, `admin@example.com`) e o board `agent-board-demo--sample-app`. Nenhuma
conta em projeto Firebase real. A senha do seed é a do `docs/SETUP.md`, só de emulador, e não está
escrita aqui.

## Rodada 2

A revisão corrigiu os seis achados da rodada 1 e pediu nova medição. Medi os seis itens da seção
"Remedir no `/test` (rodada 2)" do `review.md` no browser e rodei os testes do app que mudaram. Não rodei
o `pnpm e2e` de novo; a referência continua o 31/31 da rodada 1.

### Testes

| Comando | Resultado |
|---|---|
| `npx vitest run` com `newBoardWizardCopy`, `boardConfigIssueMessage`, `useBoardCrud`, `panelTitles` e `githubFileUrl` (app) | 5 arquivos, 43/43 |
| `npx vitest run --maxWorkers=3` em `apps/app` (suíte inteira) | 97 arquivos, 695/695, 0 erro |
| `pnpm --filter @repo/internationalization test` | 35/35 |

### Itens remedidos

| # | Item | Veredito |
|---|---|---|
| 1 | Resumo do repositório sem a frase de acesso quando não se aplica | ✅ `someone/else` (404) mostra só o nome e "Trocar repositório". `sample-app` já importado mostra só o nome e "Este repositório já tem um board.". `sample-app` antes de importar, `invalid-config` e `no-kanban` mostram "GitHub App instalado · você é admin no repositório · vira dono do board". |
| 2 | Rodapé por estado | ✅ `no-kanban`: "Aplique o kit para continuar". `invalid-config`: "Corrija o erro para continuar". |
| 3 | 390 px e `md` com o menu aberto | ❌ parcial. A 390 px passou: "Recarregar configuração" em x=53, abaixo de "Lido de main em 4fb2827, 26 de nov. de 2026, 01:39." (duas linhas); "Novo board" do passo 3 em y=960, abaixo da descrição (4 linhas, base em y=944); "Trocar repositório" abaixo do nome e da frase. Nenhuma das quatro telas rola na horizontal (`scrollWidth` = `clientWidth`). Em 768 px com o menu lateral aberto, o resumo do repositório cabe na coluna ("Trocar repositório" termina em x=704, o card em x=736), mas o card do arquivo não: ver o defeito abaixo. |
| 4 | Nome do repositório sem quebra no meio da palavra | ✅ `word-break: normal` e `overflow-wrap: break-word`. A 390 px o picker quebra em "agent-board-" / "demo/sample-app" e "agent-board-" / "demo/invalid-" / "config", sempre depois de `-` ou `/`. Na lista, `agent-board-demo/sample-app` ocupa uma linha. |
| 5 | Nome acessível do "Novo board" | ✅ A árvore de acessibilidade mostra `button "Novo board"` a 390 px (só o ícone "+") e a 1440 px. |
| 6 | "Copiar" com a escrita recusada | ✅ Com `navigator.clipboard.writeText` rejeitando (`NotAllowedError`), o botão mostra "Não foi possível copiar" em 100 ms e 1 s e volta para "Copiar" em 2,5 s. Com a escrita aceita, mostra "Copiado" e grava `node kit/apply.mjs ../meu-repositorio`. |

### Defeito novo

🟡 **Passo 2 do assistente estoura a coluna em `md` com o menu lateral aberto.** Repro: viewport de 768
px, menu lateral aberto (o estado padrão), abrir `/pt-br/boards/new?repository=agent-board-demo/sample-app`
ou `invalid-config`. A grade `md:grid-cols-[14rem_minmax(0,1fr)]` (`NewBoardClient.tsx:209`) deixa cerca de
200 px para a coluna da direita, porque o menu ocupa 256 px. O link "Abrir o arquivo no GitHub" tem 215 px
num contêiner de 157 px e termina em x=773, além da viewport; a página não rola na horizontal, então o fim
do link fica cortado. Com `invalid-config`, oito blocos transbordam, e os títulos "Executando" e
"Revisando" passam da borda dos próprios cards. Com o menu fechado (link termina em x=581) ou a 1024 px
(x=914), nada transborda. As outras telas a 768 px com o menu aberto não transbordam; a tabela da
Configuração rola dentro do próprio contêiner. Correção sugerida: passar a grade de duas colunas para
`lg`, ou deixar a lista de passos acima do conteúdo enquanto a coluna não tem largura.

### Observação 🟢

O nome acessível de "Copiar" é sempre "Copiar o comando do kit", e não há região `aria-live`; quem usa
leitor de tela não ouve "Copiado" nem "Não foi possível copiar".

### Ambiente da rodada 2

O checkout `next-boilerplate/quahog` ocupava 3000, 3002, 4001, 8080, 9099 e 9199, e não foi tocado. Subi
um emulador próprio com uma config temporária (`firebase.qa-r2.json`, apagada no fim): auth 9098,
Firestore 8085 (websocket 9151), Storage 9198, hub 4401, logging 4501, sem UI. Rodei `pnpm seed` contra
ele e subi `api` em 3012 e `app` em 3010 com o ambiente do Playwright, trocando só portas e hosts. No fim
derrubei tudo por PID (o `firebase-tools` com SIGINT); as oito portas voltaram vazias. Apaguei
`apps/api/AGENTS.md` e `apps/app/AGENTS.md`. Dados de QA, todos nesse emulador e já descartados: a conta
GitHub `qa-board-import`, a conta de senha do seed e o board `agent-board-demo--sample-app`.

## Remedição na passada da board-members

Na passada do `/test` da `board-members` (2026-11-26, por volta de 02:20) medi no browser as três
pendências que a rodada 2 deixou, com emulador próprio e o app em 3010. Detalhes e ambiente em
[`../../board-members/test/report.md`](../../board-members/test/report.md).

| Pendência | Veredito |
|---|---|
| 768 px com o menu lateral aberto no Novo board | ✅ Fechada. O passo 2 passou a ter uma coluna só nessa largura (`grid-template-columns: 447px`; a grade de duas colunas agora começa em `lg`). O link "Abrir o arquivo no GitHub" vai de x=453 a x=668 com `sample-app` e de x=451 a x=666 com `invalid-config`, dentro da viewport de 768 px. Nenhum elemento transborda e a página não rola na horizontal. |
| Prévia em `lg` com 2 colunas e em `xl` com 4, sem título cortado | ✅ Fechada. 2 colunas a 768, 1024 e 1279 px; 4 a 1280 e 1440 px. Nenhum texto cortado nem fora do próprio cartão, com `sample-app` (6 colunas) e `invalid-config` (5). |
| "Copiar" anuncia o resultado num leitor de tela | ✅ Fechada. Existe `<output aria-live="polite" class="sr-only">`, vazio no início. Com a escrita aceita, mostrou "Copiado" e voltou a vazio depois de 2,6 s; com a escrita recusada (`NotAllowedError`), mostrou "Não foi possível copiar". |

O `pnpm e2e` da mesma passada rodou 31/31, e a suíte Vitest da raiz ficou verde (app 703, api 1006).
