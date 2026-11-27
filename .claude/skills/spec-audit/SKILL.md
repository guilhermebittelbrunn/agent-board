---
name: spec-audit
description: Reconcilia o backlog de specs (specs/features/) com a realidade do código e do pipeline — confere no código se o corte de MVP de cada spec foi entregue, cruza com docs/features/*/STATE.md, corrige os status, detecta deriva, move as specs entregues para docs/features/<slug>/spec.md, regrava a fila em specs/BACKLOG.md e a evidência em specs/reference/AUDIT.md. Use no /spec --sync <slug> para fechar a spec na branch da feature depois do /test, no /spec --sync para a auditoria completa, ou quando desconfiar que o backlog está mentindo.
---

# Auditoria do backlog de specs

O `status` gravado numa spec é **uma afirmação, não um fato**. Esta skill verifica cada afirmação contra o
código e fecha o loop `/spec → /analyze → /develop → /review → /test → /spec`.

Regra que governa tudo: **o código é a verdade.** Se o frontmatter diz `proposed` e a capacidade está
implementada, o frontmatter está errado.

## 0. Dois modos

| Modo | Quando | Escopo |
|------|--------|--------|
| **Fechamento** (`--sync <slug>`) | Na branch da feature, logo depois do `/test` com `test = done` | Só a spec daquela feature: confere o corte, arquiva e atualiza a fila. Procedimento no §9. |
| **Auditoria completa** (`--sync`) | No começo do `/cycle`, ou quando desconfiar do backlog | Todo `specs/`: os §1 a §8 abaixo. |

O fechamento existe para a spec sair de `specs/` **na mesma branch que a implementou**. Assim o merge leva
para `main`, num pacote só, o código, a spec arquivada em `docs/features/<slug>/spec.md` e o `BACKLOG.md` já
com a próxima tarefa. A branch seguinte nasce de um backlog correto e não precisa reconstruir o que a
anterior entregou.

A auditoria completa continua necessária: ela pega deriva, regressão e a feature que pulou o fechamento.

## 1. Levante o material

**Antes de tudo, meça o quanto o backlog está defasado.** O `specs/reference/AUDIT.md` registra a data e a PR da
última auditoria; compare com o que já entrou em `main`:

```bash
git fetch origin --quiet
git log origin/main --oneline -5          # o que mergeou desde a última auditoria
grep -n "Última rodada" specs/reference/AUDIT.md
```

Se mergeou PR depois da auditoria registrada, **essas entregas ainda não foram reconciliadas** — é o
trabalho óbvio desta rodada, e começar por ele evita auditar uma fila que já mudou. Já aconteceu de o
`BACKLOG.md` dizer "pós-PR #19" com a #20 mergeada, e o desvio só foi pego na mão.

```bash
ls specs/features/*.md
ls docs/features/*/spec.md 2>/dev/null    # specs já entregues e arquivadas
grep -l '' docs/features/*/STATE.md 2>/dev/null
```

Para cada spec, leia o frontmatter (`id`, `status`, `feature`, `depends_on`) e a seção
**"Proposta — corte de MVP"** (a lista de capacidades é o que você vai verificar).

Contrato do backlog e valores válidos de `status`: [`specs/README.md`](../../../specs/README.md).

## 2. Verifique cada spec no código

Audite **tudo que ainda está em `specs/`**, exceto `rejected` (esse, só sob suspeita de regressão — §5).
Isso inclui três casos que é fácil deixar de fora:

- **`done` ainda em `specs/`** — é um estado inconsistente por definição: entregue deveria ter sido
  arquivado. Confirme no código; se bater, **arquive agora** (§4.1); se não bater, é **regressão** (§5).
  Sem esta linha o loop teria um estado absorvente — o `/analyze` detecta essa spec e não tem quem a
  resolva.
- **`deferred`** — adiar não impede que outra tarefa entregue o escopo por tabela. Verifique.
- **`superseded`** — confirme que a spec que a absorveu existe e ainda está viva.

Para **cada item do corte de MVP**, procure a evidência de implementação nas camadas que a spec declarou em
"Impacto por camada":

| Camada | Onde procurar a evidência |
|--------|---------------------------|
| Contrato | `packages/sdk/src/actions/**`, `packages/sdk/src/types/**` |
| API | `apps/api/app/(routes)/**`, `(shared)/repositories`, `(shared)/validation`, `(guards)` |
| App | `apps/app/app/[locale]/**`, `shared/hooks`, `shared/components` |
| Packages | `packages/<nome>/**` (exports reais no `package.json` **e** arquivo no disco) |
| i18n | `packages/internationalization/translations/**` |
| Infra | `firestore.rules`, `firestore.indexes.json`, `turbo.json`, `.github/workflows`, `env.ts`/`keys.ts` |

Classifique cada item em: **implementado** · **parcial** · **ausente**.

### Cuidados que evitam falso positivo

- **Export declarado ≠ arquivo existente.** Confira o disco, não só o `package.json`.
- **Código morto conta como ausente.** Função que ninguém chama, `keys.ts` sem a env, handler com corpo
  vazio ou `// TODO` não é entrega.
- **Documentação não é evidência.** Um `docs/*.md` descrevendo o recurso como pronto vale zero — se houver
  divergência entre doc e código, **registre-a**: é achado de auditoria.
- **Teste não é entrega**, mas entrega sem teste vira nota no relatório.

## 3. Cruze com o pipeline

Para cada `docs/features/*/STATE.md`:

- Leia o frontmatter (`slug`, `spec`, `branch`) e a tabela de etapas.
- Feature com `spec: <id>` e todas as etapas até `test` em `done` → forte indício de spec entregue (mas
  ainda **confirme no código**, §2).
- Feature em andamento → a spec correspondente deve estar `in-progress`.
- Feature sem `spec:` cujo escopo casa com uma spec → o vínculo faltou; proponha preenchê-lo nos dois
  lados.

## 4. Aplique as transições

| Achado | Transição | Observação |
|--------|-----------|------------|
| Todos os itens do MVP implementados | → `done` + **arquive** (§ 4.1) | preencha `feature: <slug>` e a data |
| Parte implementada, feature em andamento | → `in-progress` | liste os itens que faltam; **não** arquive |
| Parte implementada, **nenhuma** feature ativa | mantenha o status | **entrega parcial órfã** — sinalize alto |
| Nada implementado | mantenha | - |
| Escopo absorvido por outra spec | → `superseded` | aponte o `id` que a absorveu; **fica em `specs/`** |
| Tornou-se irrelevante | **proponha** `rejected` | ⚠️ **não aplique** — decisão do usuário |

### 4.1 Arquivar a spec entregue (o movimento)

Uma spec `done` **sai de `specs/`** e passa a viver junto da feature que a implementou. É isso que mantém
`specs/` como "o que falta" em vez de virar um arquivo morto crescente.

1. Descubra o `<slug>` da feature: pelo `feature:` do frontmatter, ou pelo `docs/features/*/STATE.md` que
   traz `spec: <id>`. **Sem slug identificado, não mova** — reporte e peça a decisão.
2. Confirme que `docs/features/<slug>/` existe. Se não existir, algo está errado (spec entregue sem
   feature registrada): reporte em vez de criar a pasta.
3. **Se `docs/features/<slug>/spec.md` já existir, PARE.** Não sobrescreva e **nunca** use `git mv -f`:
   ou a spec já foi arquivada (e a que está em `specs/` é duplicata a investigar), ou duas specs
   diferentes apontam para a mesma feature. Reporte a colisão com os dois caminhos e peça decisão.
4. Atualize o frontmatter **antes** de mover: `status: done`, `feature: <slug>`, `updated` de hoje.
5. Mova preservando o histórico do arquivo:

   ```bash
   git mv specs/features/<id>.md docs/features/<slug>/spec.md
   ```

   Se o arquivo ainda não estiver rastreado pelo git, use `mv` simples — mas prefira `git mv` sempre que
   possível, porque a rastreabilidade do arquivo é metade do valor de guardar a spec.
6. No `BACKLOG.md`, tire a spec da fila e registre-a na seção **Entregues** (uma linha: id, data, link para o
   novo caminho). O detalhe da conferência (itens do corte, PRs, `/test`, derivas) vai para a seção **Entregues**
   do `reference/AUDIT.md`. **O id nunca some do índice** — some da fila.
7. Se o `docs/features/<slug>/STATE.md` ainda não citar a spec, acrescente `spec: <id>` ao frontmatter.
8. **Conserte os links que o movimento quebrou.** Toda spec que citava `](<id>.md)` agora aponta para
   nada — as specs restantes se referenciam entre si o tempo todo (`depends_on`, "bloqueada por",
   comparações de esforço). Varra e corrija:

   ```bash
   grep -rn "](<id>.md)\|features/<id>.md" specs/ docs/
   ```

   O alvo novo é `](../../docs/features/<slug>/spec.md)` a partir de `specs/features/` e de `specs/reference/`, e
   `](../docs/features/<slug>/spec.md)` a partir do `specs/BACKLOG.md`. Reescreva também os links de **saída** da
   spec movida: `../reference/*.md` vira `../../../specs/reference/*.md`, spec viva vira
   `../../../specs/features/<id>.md`, e `../../docs/...` vira `../../...`. Três specs ficaram com link
   morto por uma rodada inteira porque este passo não existia.

**Nunca apague uma spec.** `done` é movida; `rejected` e `superseded` ficam em `specs/features/` como memória
institucional — é o que impede o `/spec` de repropor a mesma coisa na rodada seguinte.

> **Commit:** o movimento entra na branch da feature, num commit `docs(specs): archive <id>` que fica antes
> do `docs(features): <slug>` (ou junto dele, se esse ainda não foi feito). Não commite por conta própria:
> [`git-commits.md`](../../rules/git-commits.md) exige aprovação explícita, e quem pede é o orquestrador.

## 5. Detecte deriva

**Deriva** = o corte de MVP foi implementado, mas **diferente** do especificado (outro modelo de dados,
outra área do painel, capacidade extra, capacidade silenciosamente cortada).

Deriva não é erro — é informação. Para cada caso, diga qual das duas ocorreu:

- **a spec estava errada** → atualize a spec para refletir a realidade, com uma linha de nota;
- **a implementação desviou** → registre como achado para o usuário decidir.

Verifique também **regressão**: spec `done` cuja capacidade não está mais no código (removida num refactor).
Isso é achado bloqueante — reporte, não rebaixe o status em silêncio.

## 6. Compute os lotes paralelos

Depois que os status estão reconciliados — e **só depois**, porque o cálculo lê o `status` corrigido, não o
gravado —, monte os **lotes paralelizáveis**: conjuntos de specs que podem ser executadas ao mesmo tempo,
em workspaces diferentes, sem brigar pelo mesmo arquivo.

Isto é o que o `depends_on` **não** resolve. Ele modela ordem lógica ("A precisa de B"), não contenção de
arquivo: duas specs com `depends_on: []` podem alterar as duas o mesmo
`apps/api/(shared)/repositories/base.repository.ts`. Quem modela isso é o `contends_on`
([contrato](../../../specs/README.md#depends_on--contends_on)).

### O algoritmo

1. **Filtre as elegíveis.** `status` em `proposed`/`approved`, **e** `depends_on` **satisfeito** (toda
   dependência arquivada **em `main`**: `git cat-file -e origin/main:docs/features/<slug>/spec.md`). Exclua
   `deferred`, `rejected`, `superseded` e `in-progress`.
   > Spec arquivada só numa branch ainda não mergeada **não** satisfaz `depends_on`: o código dela não está
   > em `main`, e quem depender dela vai ramificar de uma base que não a contém.
2. **Ordene pela prioridade do backlog** — a ordem da seção "Ordem recomendada", não a alfabética.
3. **Monte gulosamente.** Percorra a lista em ordem; a spec entra no lote atual se seu `contends_on` for
   **disjunto** do de **todas** as specs já no lote. Senão, tenta a próxima; o que sobrar abre lote novo.
4. **Teto de 3 specs por lote.** Acima disso, o custo de token e a revisão humana no dia seguinte deixam de
   compensar. Registre isso como **decisão**, não como limite técnico — se um dia a revisão deixar de ser o
   gargalo, o teto sobe.

Leia o `contends_on` do frontmatter **do disco**; não o reconstrua de memória nem o deduza do `area:`.

### O que escrever no `reference/AUDIT.md`

Seção **"Lotes paralelos"** do `reference/AUDIT.md`, contendo:

- a **tabela dos lotes** — lote · specs · o que cada uma toca · por que não colidem;
- **por que uma spec ficou de fora do lote 1, nominalmente** — é a parte que se consulta de verdade
  (ex.: "`audit-log` não entra com `cursor-pagination`: as duas alteram `base.repository.ts`"). Diga também
  quando a spec ficou de fora **sem colisão**, barrada só pelo teto de 3: é informação diferente;
- a **nota de processo**: só **um** workspace roda a auditoria (`--audit-only`); os demais usam
  `--no-audit`. Sem isso, o `BACKLOG.md` é reescrito por 3 agents ao mesmo tempo;
- a **ressalva honesta**: lote disjunto em `contends_on` **reduz** conflito, não elimina. Duas features
  ainda podem brigar num arquivo que nenhuma das duas previu.

## 7. Regrave o `BACKLOG.md` e o `reference/AUDIT.md`

São dois arquivos com leitores diferentes, e a separação é o que mantém o backlog legível.

**`specs/BACKLOG.md` é para o usuário decidir.** Cabe numa tela e não traz evidência de auditoria: nada de âncora
`arquivo:linha`, gate, deriva ou achado. Seções, nesta ordem:

1. **Ordem recomendada**: tabela com `#`, spec (link), o quê (uma linha), status, valor e esforço, e o próximo
   comando. Só `approved`, ordenadas por prioridade (`value` alto e `effort` baixo primeiro), respeitando
   `depends_on`. Spec `approved` cujo `depends_on` aponta para spec não-`done` **não** pode ser recomendada como
   próxima; sinalize o bloqueio na linha.
2. **Em andamento** (`in-progress`), **Aguardando triagem** (`proposed`) e **Adiadas e rejeitadas**
   (`deferred`, `rejected`, `superseded`, com o motivo em uma linha).
3. **Tarefas diretas**: as poucas que vêm a seguir, em uma linha cada, com link para o achado no `AUDIT.md`.
4. **Precisam de decisão**: só as abertas, com a recomendação.
5. **Entregues**: uma linha por spec arquivada (id, data, link para `docs/features/<slug>/spec.md`). O índice é a
   única visão que mostra entregue e pendente lado a lado.
6. Contadores por `status` e a data da última auditoria, numa linha, com link para o `AUDIT.md`.

**`specs/reference/AUDIT.md` é a evidência.** Regrave o cabeçalho "Última rodada" e as seções que a rodada
tocou: entregas conferidas, tarefas diretas entregues, gates, lotes paralelos (§6), decisões estacionadas,
dependências, a tabela detalhada de Entregues, contradições doc × código, deriva, achados e pendências.
Preserve o que a rodada não tocou.

**Bloco Resumo das specs.** Toda spec em `specs/features/` abre com o bloco **Resumo** (ver
[`TEMPLATE.md`](../../../specs/reference/TEMPLATE.md)). Spec cujo status, valor, esforço ou próximo passo mudou
nesta rodada tem o Resumo atualizado junto. Spec sem Resumo ganha um.

## 8. Relatório

```markdown
## Auditoria do backlog — <YYYY-MM-DD>

**Verificadas:** N specs · **transições aplicadas:** N · **precisam de decisão:** N

### Transições aplicadas
| id | de → para | evidência (arquivo:linha) | arquivada em |

### Precisam de decisão
| id | recomendação | por quê |

### Deriva
| id | especificado | implementado | leitura |

### Lotes paralelos
| lote | specs | fora do lote 1 e por quê |

### Achados
- Entrega parcial órfã: <id> — <itens implementados sem feature ativa>
- Divergência doc × código: <arquivo> afirma X, código mostra Y
- Regressão: <id> — capacidade ausente no código
```

## 9. Fechamento na branch da feature (`--sync <slug>`)

Roda na branch que implementou a feature, depois do `/test`, antes da PR. Faz o §2, o §4.1 e o §5 **só para
a spec daquela feature** e mexe o mínimo no `BACKLOG.md`.

### Pré-condições (qualquer uma falhando → não feche e diga por quê)

- A branch atual **não** é protegida (`git rev-parse --abbrev-ref HEAD`). Em `main`, o que cabe é a
  auditoria completa.
- `docs/features/<slug>/STATE.md` existe, traz `spec: <id>` e tem `analyze`, `develop`, `review` e `test`
  em `done`. `test` em `blocked` significa defeito aberto: a spec não está entregue.
- `specs/features/<id>.md` existe nesta branch. Se ela já estiver em `docs/features/<slug>/spec.md`, o
  fechamento já foi feito; confira só se o `BACKLOG.md` bate.

### Passos

1. **Confira o corte de MVP no código da branch** (§2), item a item, com `arquivo:linha`. Os 🔒 do
   `test/report.md` (critério que só infra externa verifica) não impedem o fechamento; registre-os.
2. **Entrega parcial planejada** (o plano dividiu o corte em fatias e esta branch fez só a primeira): **não
   arquive**. A spec fica em `specs/` como `in-progress`, com uma nota dizendo o que a fatia entregou e o
   que falta, e o Resumo aponta o próximo `/analyze`.
3. **Deriva** (§5), só desta spec.
4. **Arquive** (§4.1): frontmatter `done` + `feature: <slug>`, `git mv`, links de entrada e de saída.
5. **`BACKLOG.md`, mudança mínima:**
   - tire a spec da fila e de "Em andamento";
   - acrescente a linha em **Entregues** (id, data, link novo e a branch; a PR, se já existir);
   - nas specs cujo `depends_on` esperava só esta, troque o próximo comando por "liberada depois do merge de
     `<branch>`";
   - atualize os contadores.

   Não regrave seções que a feature não tocou. Duas branches fechando ao mesmo tempo editam linhas
   diferentes do mesmo arquivo; quanto menos cada uma reescreve, mais fácil é o merge (mantenha as duas
   mudanças; a próxima auditoria completa reordena a fila).
6. **`reference/AUDIT.md`:** acrescente a entrada desta spec na seção **Entregues** (itens do corte com
   evidência, placar do `/test`, 🔒, derivas). O cabeçalho "Última rodada" é da auditoria completa; não
   mexa.
7. **Relatório** curto: o que foi arquivado e para onde, o que a entrega libera na fila, e o commit proposto
   `docs(specs): archive <id>`, com a lista de arquivos (a spec movida, `BACKLOG.md`, `AUDIT.md`, specs com
   link corrigido e, se mudou, o `STATE.md`).

Se a PR for fechada sem merge, nada disso chega a `main`: lá a spec continua em `specs/` com o status de
antes, e o backlog segue coerente.

## Limites

- **Escreve em `specs/`** (`BACKLOG.md`, `features/`, `reference/AUDIT.md`) e, **só para arquivar a spec entregue**, cria `docs/features/<slug>/spec.md` e
  acrescenta o campo `spec:` ao `STATE.md` daquela feature. Nada além disso em `docs/features/**`.
- **Nunca toque em `apps/**` ou `packages/**`.**
- **Nunca aplique `rejected`** por conta própria — proponha.
- **Nunca apague uma spec.** Entregue é **movida**; `superseded` e `rejected` ficam em `specs/`.
- **Nunca arquive sem verificar o código.** Mover uma spec por acreditar no `status` gravado destrói
  exatamente a garantia que esta skill existe para dar.
- **Não commite.** Ver [`git-commits.md`](../../rules/git-commits.md).
- Datas absolutas via `date '+%Y-%m-%d'`.
