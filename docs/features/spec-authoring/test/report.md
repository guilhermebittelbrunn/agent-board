# Relatório de QA: escrever spec com um agente

Rodada autônoma do `/cycle`, etapa `/test`, em 2026-11-27. Escopo: o diff da feature no working tree da branch `guilhermebittelbrunn/chore-overnight-cycle-specs` (contrato, SDK, API, app, i18n), com o `develop/handoff.md` e o `review/review.md` como ponto de partida.

## Resultado

### Rodada 2: aprovado

O `/review` (rodada 2) corrigiu os dois defeitos e duas observações 🟢 da rodada 1. Remedi só o que mudou: chamadas diretas à API, uma passada curta de `agent-browser` em light e dark, com a página do rascunho também em 390 px, e o `pnpm test` da raiz. Placar final: **18 ✅, 0 ❌, 1 🔒** (o critério 19, PDF via MCP, continua dependendo de runner real; o 9 segue verificado por rota e componente, com a parte ao vivo 🔒).

| Ponto | Veredito | O que foi medido |
|-------|----------|------------------|
| Critério 6, anexo com tipo recusado | ✅ | No diálogo, com um PNG e um `.txt` com byte nulo: o PNG subiu (`201`), o `.txt` recebeu `415`, e o item mostrou "Formato não aceito. Anexe imagem (PNG, JPEG, WebP), PDF ou texto (.txt, .md).". Direto na API, o mesmo arquivo respondeu `415 SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED`. |
| Critério 6, anexo grande | ✅ | Arquivo de 4 MiB direto na API: `413 SPEC_DRAFT_ATTACHMENT_TOO_LARGE`, traduzido em `apiErrors` como "O anexo passa do tamanho máximo de 3 MB.". No diálogo o seletor barra o arquivo antes do envio ("passa de 3 MB."), então a frase da API só aparece se a checagem do cliente for contornada. |
| Critério 15, `needs_rework` na escrita | ✅ | Com `fake-executor script <board> <slug> needs_input needs_rework`, "Rodar de novo" e a resposta à pergunta, a API devolveu `state: failed`, `pendingAsk: null`, `lastRun.outcome: needs_rework`. No quadro o card mostra "Falhou" e "Escrita a partir de texto e 1 anexo", sem "Responder" e sem nenhum link de ação. Na página, um selo só ("Falhou"), "Rodar de novo" disponível e aprovar desabilitado com "A última rodada falhou. Rode de novo antes de aprovar.". "Rodar de novo" em 390 px levou a "Spec pronta" com aprovar habilitado. |
| 🟢 Selo "Parado" | ✅ corrigido | Página do rascunho com "Spec pronta" e com "Falhou", em light, dark e 390 px: nenhuma ocorrência de "Parado". |
| 🟢 Input de arquivo na árvore de acessibilidade | ✅ corrigido | `aria-hidden="true"` no `input type="file"`; o snapshot de acessibilidade do diálogo mostra só o botão "Anexar print, PDF ou texto", sem "Choose Files". |
| Responsivo | ✅ | Página do rascunho em 390 px, dark: uma coluna, `scrollWidth` 375 (viewport 390 menos a barra de rolagem), sem rolagem horizontal. |

Gates da rodada 2: `pnpm test` da raiz (JDK 21, sem `--force`) com 14/14 tarefas (3 do cache): `app` 120 arquivos / 930 testes, `api` 110 / 1328 (inclui `apiErrorCodesTranslated`), `api:test:emulator` 8 / 165, `kanban-contract` 15 / 145, `internationalization` 35, `runner` 46, `sdk` 9, `e2e` 16. O `pnpm check` e o typecheck foram medidos pelo `/review` na rodada 2 e não foram repetidos aqui.

Ambiente da rodada 2: portas livres no início. Subi `pnpm emulators` (JDK 21), `pnpm seed`, `pnpm --filter api dev` e `pnpm --filter app dev`, com `.env` copiados dos exemplos; depois matei esses PIDs e confirmei com `lsof` as portas 3000, 3002, 8080, 9099, 9199, 4001, 4400, 4500 e 9150 vazias. Apaguei os `.env`, os `apps/*/AGENTS.md` gerados e o `firestore-debug.log`. Conta de QA só no emulador, pelo popup de GitHub, sem senha: `qa-spec-authoring@example.com` (`qa-spec-owner`). Prints em `test/e2e/r2-*.png`, descartados pelo `.gitignore`.

Continuam sem alteração, por decisão do `/review`, as observações 🟢 sobre o assistente de criação sem Rascunhos, o clique fora do diálogo que descarta o texto e o "1 kB" para arquivos pequenos.

### Rodada 1

**Rodada 1: bloqueado para correção.** Os testes passam e 16 dos 19 critérios estão verificados, mas dois critérios falharam por defeito de produção (seção "Defeitos de produção") e voltam para o `/review`. Um fica sem verificação por depender de infra externa.

A etapa também encontrou uma regressão de teste que o `/develop` e o `/review` não mediram: a suíte `test:emulator` da API quebrava (2 arquivos não carregavam). Foi corrigida nos arquivos de teste.

## Placar dos critérios

| # | Critério | Status | Meio |
|---|----------|--------|------|
| 1 | Coluna Rascunhos antes de Tarefas | ✅ | e2e (desktop dark, 390 px dark), componente |
| 2 | Nova spec só com texto | ✅ | e2e, componente, rota |
| 3 | Pedido vazio recusado | ✅ | componente, API direta (`400 VALIDATION_FAILED`) |
| 4 | Anexos aceitos | ✅ | e2e, API direta, componente |
| 5 | Anexo recusado no diálogo | ✅ | e2e, componente |
| 6 | Anexo recusado pela API com a mensagem certa | ✅ na rodada 2 (❌ na 1) | e2e, API direta |
| 7 | Anexo de outra pessoa ou caminho malformado | ✅ | API direta com dois usuários, rota |
| 8 | Sem Storage, só texto | ✅ | e2e com a API sem Storage, API direta, componente |
| 9 | Sem executor | ✅ | rota (`creates nothing without an executor`), componente; ao vivo 🔒 |
| 10 | Rodada de perguntas | ✅ | e2e com `fake-executor script needs_input` |
| 11 | Aprovar só depois de rodada com sucesso | ✅ | e2e, API direta (`409 CARD_SPEC_NOT_READY`), componente, emulador |
| 12 | Aprovar leva ao fim de Tarefas | ✅ | e2e, API direta |
| 13 | Rascunho não sai sem aprovar | ✅ | e2e (arraste, menu, 390 px), API direta (`409 CARD_DRAFT_NOT_APPROVED`) |
| 14 | Descartar rascunho | ✅ | e2e, componente, emulador |
| 15 | Saída `needs_rework` na etapa `spec` | ✅ na rodada 2 (❌ na 1) | e2e com `fake-executor script needs_input needs_rework` |
| 16 | Papéis: viewer, operator, impersonação | ✅ | e2e com viewer e operator, API direta (`403`), componente (impersonação) |
| 17 | Concorrência na criação e na aprovação | ✅ | emulador (teste novo) |
| 18 | Página do rascunho: layout, tema, responsivo | ✅ | e2e (light e dark, 1440 px e 390 px), componente |
| 19 | Agente lê os anexos pelo MCP | 🔒 | unitário prova o formato; o modelo real não foi exercido |

Placar da rodada 1: 16 ✅ (o 9 com a parte ao vivo 🔒), 2 ❌, 1 🔒. Placar final, depois da rodada 2: 18 ✅, 1 🔒.

## Defeitos de produção

### 1. Mensagem de erro de anexo fala das regras da foto de entidade (🟡, critério 6)

A rota `POST /boards/[id]/attachments` reaproveita os códigos `UPLOAD_FILE_TYPE_NOT_ALLOWED` e `UPLOAD_FILE_TOO_LARGE` do upload de imagem. O `apiErrors` traduz esses códigos como "Formato não aceito. Envie JPG, PNG ou WebP." e "O arquivo excede o tamanho máximo de 4 MB.". Para anexo de spec as duas frases estão erradas: PDF e texto são aceitos, e o limite é 3 MB.

Repro: abrir "Nova spec", anexar um `.txt` com um byte nulo (`printf 'abc\0def' > binario.txt`) junto com um PNG e um PDF, preencher o texto e clicar em "Começar a spec". O PNG e o PDF sobem (`201`), o `.txt` recebe `415`, e o item fica marcado com "Formato não aceito. Envie JPG, PNG ou WebP.".

Correção sugerida: códigos próprios para anexo de spec (`SPEC_DRAFT_ATTACHMENT_TYPE_NOT_ALLOWED`, `SPEC_DRAFT_ATTACHMENT_TOO_LARGE`) com copy que liste imagem, PDF e texto e o limite de 3 MB.

### 2. `needs_rework` na escrita deixa o card pedindo resposta sem pergunta (🟡, critério 15)

`specDraftStateAfter` leva `needs_rework` para `state: waiting_input` sem `pendingAsk`. O `/review` registrou isso como 🟢; medido, o efeito na tela é pior.

Repro: com um rascunho pronto, `pnpm --filter api fake-executor script <board> <slug> needs_input needs_rework`, "Rodar de novo", responder a pergunta. Depois da segunda rodada a API devolve `state: waiting_input`, `pendingAsk: null`, `lastRun.outcome: needs_rework`. No quadro, o card mostra "Aguardando você" e "Responder", que leva a uma página sem perguntas; na página, o selo aparece duas vezes e o aprovar fica desabilitado com "Libera quando não houver perguntas abertas". "Rodar de novo" funciona.

Correção sugerida: tratar `needs_rework` da etapa `spec` como falha recuperável (`state: failed`), e `draftStatus` só devolver `waiting` quando houver `pendingAsk`.

## Verificar no `/test` (lista do `review.md`)

| # | Item | Veredito |
|---|------|----------|
| 1 | PDF chega ao modelo pelo MCP | 🔒 Exige runner local com `claude -p`. O teste unitário de `mcp.ts` prova que o PDF sai como `resource` com `blob`; se o Claude Code repassa esse bloco ao modelo, só a primeira rodada real mostra. |
| 2 | Aprovar só depois de rodada com sucesso e sem pergunta | Confirmado. Com pergunta aberta, botão desabilitado e `POST .../spec/approve` → `409 CARD_SPEC_NOT_READY`. Depois de sucesso, aprovar levou o card à última posição de Tarefas, e o menu "Mover para Análise" abriu "Disparar a etapa Análise?". |
| 3 | Anexo de outra pessoa é recusado | Confirmado: `422 SPEC_DRAFT_ATTACHMENT_INVALID`, nenhum card criado. |
| 4 | Limites do upload | Confirmado nos números, derrubado na mensagem (defeito 1). PNG `201`, PDF `201`, `.md` `201`, `.txt` com byte nulo `415`, 4 MiB `413`, seis anexos no `POST /drafts` `400`. No diálogo, 4 MiB barrado com "grande.png passa de 3 MB." e o sexto com "No máximo 5 anexos por spec.". |
| 5 | Sem Storage | Confirmado. `storageAvailable: false`, aviso no diálogo sem seletor, upload `503 STORAGE_NOT_CONFIGURED`, pedido só com texto criou o card. |
| 6 | Sem executor | Confirmado por teste de rota e de componente; ao vivo 🔒 (no emulador o executor de teste sempre existe). |
| 7 | Rascunho não sai de Rascunhos | Confirmado, também em 390 px. `move` e `runs` com `analyze` → `409 CARD_DRAFT_NOT_APPROVED`. |
| 8 | Descartar | Confirmado. A confirmação cita a branch, o card some e o mesmo texto cria `<slug>-2`. |
| 9 | Saída `needs_rework` | Derrubado como 🟢; vira o defeito 2. |
| 10 | Visual | Confirmado. Rascunhos é a primeira coluna; o viewer não vê as ações e recebe `403 BOARD_ROLE_INSUFFICIENT` nas quatro rotas; página em duas colunas em 1440 px e uma em 390 px, sem rolagem horizontal, em light e dark. |

## Evidências e2e

Os prints ficam em `test/e2e/`, que o `.gitignore` descarta; o texto abaixo é a prova.

- **Quadro vazio (dark, 1440 px):** colunas Rascunhos, Tarefas, Análise, Executando; Rascunhos com "0", subtítulo e `+`; dica "Nenhum rascunho. Use Nova spec para descrever o que quer construir.".
- **Diálogo (dark):** "Nova spec", "O que você quer construir?", "Anexar print, PDF ou texto", "Até 5 arquivos de 3 MB cada.", os três passos e "Executor de teste · o resultado é simulado". Em 390 px os botões empilham e cabem na tela.
- **Rascunho só texto:** cerca de 5 s depois de criar, o selo era "Spec pronta", com o caminho `specs/features/<slug>.md` e o rascunho sintético do GitHub falso; aprovar habilitado.
- **Rascunho com anexos (light):** "Seu pedido" lista imagem, PDF e markdown com ícones distintos; a API não devolve `path` nos anexos do card.
- **Rodada de perguntas (light):** "Aguardando você", bloco com a opção recomendada marcada e "Responder e retomar a etapa Rascunhos".
- **Tarefas depois de aprovar e sincronizar:** os aprovados têm `spec.status: approved`, `spec.ref` na branch do card e `specApproval.login`; a sincronização não marcou nenhum como órfão.

Observações 🟢, para o `/review` decidir:

- A página do rascunho mostra dois selos que se contradizem ("Spec pronta" e "Parado").
- O assistente de criação do quadro não menciona Rascunhos na lista de colunas.
- Clicar fora do diálogo "Nova spec" descarta texto e anexos sem confirmação.
- Arquivos pequenos aparecem como "1 kB".
- Em 390 px, o aprovar fica no fim da página, depois da linha do tempo.
- O `input type="file"` escondido aparece na árvore de acessibilidade em inglês ("Choose Files").

## Cobertura e comandos

| Comando | Resultado |
|---------|-----------|
| `pnpm test` (raiz, JDK 21, sem `--force`), primeira passada | **falhou**: `api:test:emulator` com `agentContract.emulator.test.ts` e `runnerClaim.emulator.test.ts` sem carregar ("Invalid environment variables" vindo de `storage.ts` → `@/env`) |
| `pnpm --filter api test:emulator` depois da correção | 8 arquivos, 165 testes |
| `pnpm test` (raiz), segunda passada | 14/14 tarefas. `app` 930 testes; `api` 1328; `api:test:emulator` 165; `kanban-contract` 144; `internationalization` 35; `runner` 46; `sdk` 9 |
| `pnpm check` | 1007 arquivos, sem erro |
| typecheck de `app` e `api` | limpos |
| `pnpm e2e` | não rodado: 3,5 GB livres em disco; a passada com `agent-browser` cobriu os fluxos |

Causa da regressão do emulador: `agent-tools.ts` passou a importar `storage.ts` (para o `get_attachment`), e `storage.ts` importa `@/env`, que exige `FIREBASE_ADMIN_*` fora de `development`. Como o CI roda `test:emulator`, a PR teria falhado.

### Testes criados ou alterados

| Arquivo | Nível | O que prova |
|---------|-------|-------------|
| `apps/app/__tests__/draftCardControls.test.tsx` (6) | componente | selo por estado, "Responder", aprovar só quando pronto e para quem prioriza, linha de origem |
| `apps/app/__tests__/specDraftActions.test.tsx` (8) | componente | aprovar habilitado só quando pronto, as quatro dicas, confirmação de descarte com a branch |
| `apps/app/__tests__/newSpecDialog.test.tsx` (11) | componente | só texto, anexos antes do rascunho, recusas no seletor, Storage desligado, sem executor, texto mantido na falha |
| `apps/app/__tests__/specDraftDetail.test.tsx` (6) | componente | pedido, anexo, branch e rascunho; ações por papel e impersonação |
| `apps/api/__tests__/specDraftRepository.emulator.test.ts` (9) | emulador | concorrência do `createDraft`, releitura de `state` no `approveDraft`/`discardDraft` |
| `agentContract.emulator.test.ts`, `runnerClaim.emulator.test.ts` (alterados) | emulador | mock de `@/env` |

O teste de emulador se justifica porque o objeto é a transação do Firestore, que o fake em memória sempre aceita.

## Lacunas herdadas

| Lacuna | Veredito |
|--------|----------|
| Componentes do rascunho sem teste | Fechada |
| Transações do rascunho sem emulador | Fechada |
| `readObject`/`readObjectMetadata` | Parcial: `readObjectMetadata` rodou no e2e; `readObject` só roda no `get_attachment`, que nenhum agente chamou. Aberta. |
| Limite de imagem do modelo em bytes | Aberta, fora do alcance deste ambiente |
| PDF via MCP | 🔒 |

## Ambiente e dados de QA

Portas livres no início. Subi emuladores (JDK 21 do Homebrew), `pnpm seed`, API (3002, reiniciada uma vez sem Storage) e app (3000), e derrubei só esses PIDs; `lsof` vazio no fim. `.env` copiados dos exemplos, `apps/*/AGENTS.md` e `firestore-debug.log` apagados. Contas só no emulador, criadas pelo popup de GitHub sem senha (`qa-spec-owner`, `qa-writer`, `qa-reader`). Nada em projeto real; `docs/PRE-PRODUCTION.md` não muda.
