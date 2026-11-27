# Relatório de QA: cycle-runs (fatia 1)

Rodada autônoma do `/cycle`, 2026-11-27. Branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (não
protegida, sem upstream). O código da feature já estava commitado; o working tree tinha só
`docs/features/cycle-runs/`. Uma tentativa anterior deste `/test` caiu sem gravar nada; esta começou do zero.

Resultado: nenhum defeito de produção. Um achado de UI (selo ausente no card pendente do ciclo) e um problema
nos commits da própria feature, que o `/review` precisa corrigir antes do push (seção "Achados").

## Gates

| Comando | Resultado |
|---|---|
| `pnpm test` (raiz, JDK 21 em `/opt/homebrew/opt/openjdk@21`, sem `--force`) | 14 de 14 tarefas, nenhuma do cache, 58 s. api 1193, app 754, kanban-contract 217, auth 211, design-system 150, security 65, shared 51, runner 47, analytics 41, next-config 34, internationalization 33 (inclui `apiErrorCodes`), e2e (vitest) 16, sdk 9. `api:test:emulator`: 9 arquivos, 137 testes |
| `npx vitest run --config vitest.emulator.config.mts orchestratorRuns` (api, contra os meus emuladores) | 10 de 10, com os dois casos novos |
| `npx biome check apps/api/__tests__/orchestratorRuns.emulator.test.ts` | sem erros depois do `--write` |
| `pnpm e2e` (Playwright) | 20 de 20, 37 s |

Não rodei `pnpm check` nem os typechecks de novo: o código de produção não mudou desde o `/review`, e o único
arquivo que mexi passou no Biome isolado. O `pnpm test` acima roda antes do meu teste novo; o arquivo
alterado foi medido sozinho logo depois (10 de 10).

## Testes criados

Dois casos em `apps/api/__tests__/orchestratorRuns.emulator.test.ts`, na faixa cara. Os dois provam o que o
teste de rota com repositório em memória não alcança: `cycleRepository.stop`, `stopRun`, `finishOnCard` e
`startNextQueued` são transações separadas sobre `cycle`, `card`, `run` e `board`, e a ordem entre elas só
aparece contra o Firestore de verdade.

- **"stops a cycle mid-stage, detaches its cards and starts the queued cycle".** Ciclo de duas specs com
  `concurrency: 1` e um segundo ciclo na fila; parada com a primeira spec rodando a análise. Medido: ciclo
  `stopped` com itens `stopped` e `skipped`; o card da execução viva fica em `analyze`, sem `activeRunId`, sem
  `cycleId` e fora de `running`; nenhum `run` fica `running`; a spec pendente continua em Tarefas sem `run`; o
  ciclo da fila vira `running`, o `runningCycleId` do board aponta para ele e o card dele começa a análise.
  Parar de novo devolve `CYCLE_NOT_ACTIVE`.
- **"closes a cycle on the first failure with onFailure stop and lets the other spec end its current
  stage".** Três specs com `concurrency: 2` e `onFailure: stop`, a primeira roteirizada `failed`, a segunda
  `silent`, e outro ciclo na fila. Depois do primeiro tick: ciclo `stopped`, itens `failed`/`running`/`skipped`,
  a segunda spec ainda `running` na análise, o ciclo da fila já `running` com o card em `analyze`. No prazo da
  etapa, a segunda spec sai sem `activeRunId` e sem `cycleId`, com um único `run`, e o item fecha com o
  resultado dela (`failed`, porque a execução estourou o prazo).

Limite do segundo caso: o executor de teste termina as duas execuções no mesmo tick, então não dá para
roteirizar a segunda spec terminando com sucesso **depois** da falha da primeira. Usei `silent` para mantê-la
viva. O caminho "termina com sucesso e o item fecha `stopped`" continua coberto só pelo contrato
(`advanceCycle`) e por `planCompletion`.

Componentes: `newCycleClient.test.tsx` (6 casos) e `cycleDetailClient.test.tsx` (5 casos) já existiam e entram
no commit `d046651`. Cobrem lista de candidatos, ordem de envio, validação sem spec, aviso de fila, aviso de
runners, viewer sem formulário, andamento com "Para revisar", parada pelo diálogo, viewer e ciclo terminado
sem o botão, e o ciclo na fila. Não criei mais nada ali.

## Verificar no `/test` (lista do `review.md`)

| # | Item | Veredito |
|---|---|---|
| 1 | Ciclo preso depois de queda | **Confirmado.** No emulador, gravei um `cycle` `running` com um item `pending` (`qa-extra-c`) e apontei o `runningCycleId` do board para ele. Ao abrir o detalhe, o item virou `running` e o card foi para `analyze`, `running`, com o `cycleId` do ciclo. Depois de algumas leituras o ciclo fechou `finished` |
| 2 | `onFailure: stop` com `concurrency: 2` | **Confirmado em parte**, pelo caso novo no emulador: o ciclo fecha na falha, a pendente vira `skipped`, o ciclo da fila começa nesse momento e a outra spec termina a etapa sem abrir outra. O item dela fechou `failed` (prazo), não `stopped`; ver o limite acima. Também confirma o 🟡 do review: por um intervalo o board roda a spec viva do ciclo parado e a do ciclo novo ao mesmo tempo |
| 3 | Parar no meio, contra o emulador | **Confirmado**, pelo caso novo e no browser (abaixo) |
| 4 | Reconciliação depois do fim de uma etapa | **Confirmado por simulação.** Não derrubei a API no meio de um avanço (o intervalo é de milissegundos). Gravei um ciclo `running` com `qa-extra-a` como item `running` (card em `develop`, `idle`, sem `cycleId`, `lastRun` terminado depois do início do item) e `qa-extra-d` `pending`. Ao abrir o detalhe: `qa-extra-a` fechou `stopped` (o `lastRun` dele era uma parada), `qa-extra-d` virou `running` e o card foi para `analyze` |
| 5 | Roteiro §9 do plano, itens 1 a 8 | **Confirmado**, com o achado do selo (item 1 do roteiro) e a falha com `skip` não percorrida no browser. Detalhe em "Passada no browser" |
| 6 | Viewer abrindo `/cycles/new` pela URL | **Confirmado o comportamento descrito no review**: a tela mostra só o título "Novo ciclo" e a descrição, sem formulário e sem aviso de permissão |
| 7 | Tick no `deadline` com runner real | **🔒 Não verificável aqui**: precisa de runner real |

## Critérios de aceite

| Critério | Status | Meio |
|---|---|---|
| Lista de ciclos acessível pela navegação | PASS | e2e |
| Novo ciclo: 1 a 10 specs de Tarefas, na ordem | PASS | e2e (UI e chamadas diretas à API), unit |
| Opções `until`, `concurrency`, `onFailure` | PASS | e2e (padrões, aviso de runners, `until: merge` → 400); `CYCLE_RUNNERS_UNAVAILABLE` fora do emulador só por rota (unit) |
| Criar leva ao detalhe; duplo clique não duplica | PASS | e2e (uma `POST` só); `CYCLE_SPEC_BUSY` só por rota (unit) |
| Fila de ciclos | PASS | e2e, emulador |
| Aprovação do plano pulada no ciclo | PASS | e2e (aprovação ligada em Análise), emulador; "fora do ciclo continua parando" por unit (`cardState`) |
| Parada conforme `until` | PASS | e2e (PR e Testando) |
| Concorrência respeitada | PASS | e2e (`1`), emulador (`1` e `2`) |
| Falha com `onFailure: skip` | PASS | unit (contrato, `planCompletion`); não percorrido no browser |
| Falha com `onFailure: stop` | PASS | emulador (caso novo), unit |
| Parar o ciclo | PASS | e2e, emulador (caso novo) |
| Detalhe: andamento, decisões, "Para revisar" | PASS | e2e, componente |
| Selo "Ciclo" no card | **FALHOU em parte** | e2e: o card pendente do ciclo não tem selo (ver "Achados") |
| Autorização e ownership | PASS | e2e (403, 401, 404), rota (ciclo de outro board) |
| Agente não pergunta dentro do ciclo | PASS | rota (`agentToolsRoutes`), runner (`session.test.ts`); agente real 🔒 |
| Recuperação depois de queda | PASS | e2e por simulação, rota (carência de 10 minutos) |
| Mensagens de erro traduzidas | PASS | unit (`apiErrorCodesTranslated`); o toast com a copy não foi provocado na tela |
| Tema e viewport | PASS | e2e |

## Passada no browser

Uma passada com `agent-browser`, comandos em sequência. Login pelo popup GitHub do emulador como
`qa-cycle-runs@example.com` (login `qa-cycle`), dono do board criado a partir de
`agent-board-demo/sample-app`. Backlog sincronizado: três specs em Tarefas. Aprovação ligada em Análise pela
Configuração (`PATCH stage-settings` 200). Para a fila, a parada e a reconciliação, criei quatro cards a mais
direto no Firestore do emulador (`qa-extra-a` a `qa-extra-d`, cópias de `keyboard-shortcuts`).

- **Lista vazia:** tabela com "Nenhum ciclo ainda.", botões "Novo ciclo" e "Atualizar".
- **Novo ciclo sem spec:** "Escolha pelo menos uma spec." em vermelho e nenhuma requisição. Com "Até 2": "Duas
  specs ao mesmo tempo precisam de dois runners seus online. Agora você tem 0."
- **Ordem:** escolhi Tema escuro e depois Busca por texto. A lista mostrou "1ª no ciclo" e "2ª no ciclo", e o
  botão virou "Iniciar ciclo com 2 specs".
- **Duplo clique** em "Iniciar ciclo": uma `POST /cycles` (201) no log da API e navegação para o detalhe.
- **Rodando:** "Rodando", "2 specs · uma por vez · até abrir a PR · iniciado por qa-cycle". Tema escuro com
  Análise "feita" e Executando "Rodando"; Busca com "aguardando a vez". A análise não parou na aprovação.
- **Quadro durante o ciclo:** Tema escuro em Testando com o selo "Ciclo"; Busca por texto, a próxima do ciclo,
  em Tarefas sem selo nem outra indicação.
- **Fim (`until: pull_request`):** "Terminado", "Todas as specs saíram do ciclo.", "2 / 2 specs com PR aberta",
  12 decisões, 2 de produto; andamento com "#1716 rascunho" e "#2147 rascunho". No quadro, os dois cards em
  Aguardando PR, "Parado", "Aguardando o merge", sem selo. As decisões de produto aparecem nas duas listas.
- **Fila:** com o ciclo A rodando, o Novo ciclo avisou "Já existe um ciclo rodando. Este entra na fila e
  começa quando ele terminar." O ciclo B abriu com "Ciclo na fila desde 27 de nov. de 2026, 08:10", status
  "Na fila", "O andamento aparece quando o ciclo começar." e sem contadores.
- **`until: testing` e parar:** no ciclo A, Atalhos terminou em Testando, `idle`, sem PR ("pronta"). Parei com
  `qa-extra-a` em Executando. O diálogo diz "Parar o ciclo?" e explica o efeito, com "Continuar rodando" e
  "Parar o ciclo". Depois: "Parado", "Parado por qa-cycle.", `qa-extra-a` "parada" com Executando "Parado".
  No Firestore: `qa-extra-a` em `develop`, `idle`, sem `cycleId` nem `activeRunId`; o ciclo B virou `running`
  e o `runningCycleId` do board passou a ele. O botão "Parar o ciclo" some no ciclo parado.
- **Ciclo B** terminou com `qa-extra-b` em "#5745 rascunho".
- **Viewer** (`qa-cycle-viewer`, convidado como Leitor): lê lista e detalhe, não vê "Novo ciclo" nem "Parar o
  ciclo". Com o token dele: `POST /cycles` e `POST /cycles/<id>/stop` → `403 BOARD_ROLE_INSUFFICIENT`;
  `GET /cycles/nao-existe` → `404 CYCLE_NOT_FOUND`; `GET /cycles` → 200. Sem token: `401 AUTH_INVALID_TOKEN`.
- **Dono, caminhos de erro:** parar ciclo terminado → `409 CYCLE_NOT_ACTIVE`; spec que já roda, spec em
  Aguardando PR e slug inexistente → `422 CYCLE_SPECS_INVALID`; lista vazia, 11 slugs, slug duplicado e
  `until: "merge"` → `400 VALIDATION_FAILED`.
- **Tema e 390 px:** detalhe em dark e light, lista em dark a 390 px, detalhe em light a 390 px. A 390 px,
  `scrollWidth` do documento ficou em 375 contra `innerWidth` 390 no detalhe e no Novo ciclo, e 390 contra 390
  na lista; nenhuma rolagem lateral da página. A tabela de andamento rola dentro do próprio contêiner (576 de
  conteúdo em 309 visíveis), a da lista também (508 em 326). Badges legíveis nos dois temas ("Parado" em
  vermelho, "Terminado" neutro). O selo "Ciclo" só foi visto em dark.

Prints em `test/e2e/` (`01` a `10`), descartados pelo `.gitignore`; o texto acima é a evidência.

## Achados

| Sev. | Onde | O quê |
|---|---|---|
| 🟡 | commits `d8f6d0d`..`c73b190` | As mensagens estão deslocadas em um commit. `d8f6d0d` tem como mensagem só a linha `Co-Authored-By` e traz o domínio do ciclo no `kanban-contract`; `1ec1bb1` diz "add the cycle domain" e traz as `decisions`; `1f1c337` diz "add stage decisions" e traz o SDK; `3c249d1` diz "sdk" e traz a API; e assim até `c73b190`, que diz "claude" e traz `docs/board/*` e `docs/PRE-PRODUCTION.md`. Não há commit `docs(board)`. A branch não tem upstream, então dá para refazer com `git reset <base>` (mixed) e recommitar pelo plano. Não mexi: é do `/review` |
| 🟡 | quadro, `BoardCardItem` | Card pendente de um ciclo `running` fica em Tarefas sem o selo "Ciclo" (o `cycleId` só entra no card quando a etapa dispara). O roteiro §9 do plano esperava o selo nos três cards logo depois de criar. Sem indicação, a pessoa pode arrastar esse card para fora do ciclo; não medi o que o ciclo faz quando chega nele depois disso. Repro do que vi: criar um ciclo de duas specs com `concurrency: 1` e abrir o quadro; a segunda spec aparece em Tarefas sem selo |
| 🟢 | `CycleActivity` | A atividade mostra a primeira linha do markdown como texto, com as crases literais: "Executor de teste: \`/develop dark-theme\` iniciado na branch \`feat/dark-theme\`." É o desvio 10 do handoff; fica estranho de ler |
| 🟢 | `NewCycleClient` | Viewer em `/cycles/new` vê só o título, sem explicação (item 6 acima) |

## Decisões de custo de teste

- `orchestrator/cycle.ts` (`stopCycle`, avanço com `onFailure: stop`): dois casos no emulador, justificados acima.
- Rotas `cycles`, `[cycleId]`, `stop`: `boardCyclesRoutes.test.ts` (22 casos) já cobre validação, códigos,
  guard, 404 de outro board e reconciliação. Não criei teste de rota.
- `NewCycleClient`, `CycleDetailClient`: os testes de componente existentes cobrem o que listei; não criei
  mais.
- Runner, contrato, SDK, i18n: os testes existentes passaram; não houve lacuna nova.

## Lacunas do handoff e do review

- `reconcileCycle` sem teste unitário: já fechada pelo review; confirmei os caminhos 1 e 4 no emulador.
- `stopCycle` contra o emulador: **fechada** (caso novo).
- `onFailure: stop` no emulador: **fechada em parte** (caso novo; o caminho com sucesso depois da falha segue
  só no contrato).
- Teste de componente de `NewCycleClient` e `CycleDetailClient`: **fechada**. Os arquivos já existiam quando o
  review escreveu "continua aberta".
- Tick no `deadline` com runner real: **continua aberta** (🔒).
- `CYCLE_RUNNERS_UNAVAILABLE` e `CYCLE_SPEC_BUSY` vistos na tela: **continua aberta**, só por rota.
- Falha com `skip` no browser: **continua aberta**, coberta por unit.

## Ambiente do e2e

Todas as portas (3000, 3002, 8080, 9099, 9199, 4001, 4400, 4500, 9150) estavam livres no início. Subi os
emuladores (`pnpm emulators`), a API e o app (`pnpm --filter <app> dev`) e guardei os PIDs. O `pnpm e2e` subiu
e derrubou os próprios servidores e reaproveitou os meus emuladores. No fim, derrubei por PID os processos
que eu tinha subido e os filhos que ficaram presos às portas (dois `next-server` e o `firebase-tools` com o
Java do Firestore). As nove portas voltaram a sair vazias no `lsof`. Apaguei `apps/*/.next`,
`apps/*/AGENTS.md`, `firestore-debug.log`, um print solto na raiz e os `apps/api/.env` e `apps/app/.env`
copiados (gitignored).

## Estado de dev alterado

Nenhum projeto real foi tocado. Tudo ficou no emulador (projeto `demo-next-boilerplate`), que morreu com o
processo: contas `qa-cycle-runs@example.com` e `qa-cycle-viewer@example.com`, o board de amostra, os cards
`qa-extra-*` e cinco ciclos. Nenhuma conta nova para o `docs/PRE-PRODUCTION.md`. A senha das contas do seed
não está neste arquivo.

## Roteiro manual

1. `pnpm emulators`, `pnpm seed`, `pnpm dev`; entrar pelo GitHub do emulador e criar o board de
   `agent-board-demo/sample-app`; sincronizar o backlog.
2. Configuração → ligar "Pedir aprovação antes da etapa seguinte a Análise" → salvar.
3. Ciclos → Novo ciclo → escolher duas specs → "Iniciar ciclo com 2 specs". Esperado: detalhe "Rodando", a
   análise passa sem aprovação, as duas terminam em Aguardando PR com PR rascunho e o ciclo fecha "Terminado".
4. Com um ciclo rodando, criar outro: aviso de fila, detalhe "Na fila", começa quando o primeiro termina ou
   é parado.
5. No detalhe de um ciclo rodando, "Parar o ciclo" → confirmar: "Parado por <login>", card fica na etapa sem
   selo, pendentes "pulada".
6. Entrar como Leitor: sem "Novo ciclo" e sem "Parar o ciclo"; chamadas diretas devolvem 403.
