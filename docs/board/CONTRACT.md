# Contrato dos agentes

As sessões do Claude Code falam com o board por um servidor MCP chamado `kanban` (as ferramentas aparecem como `mcp__kanban__<nome>`) ou pelos mesmos endpoints em HTTP, usados pelo runner local. Os schemas de entrada estão em `packages/kanban-contract/src/agentContract.ts`; nada aqui é redefinido em outro lugar.

## Autenticação

Cada execução recebe um **token de execução** curto, emitido pelo orquestrador no disparo e válido só para aquele `run` (card + etapa). O token é revogado quando a etapa termina. Uma sessão não consegue escrever em outro card.

## Ferramentas

| Ferramenta | Entrada | O que o board faz |
|------------|---------|-------------------|
| `get_card` | `cardId` | Devolve spec, slug, branch, etapa atual, respostas às perguntas anteriores e links dos artefatos das etapas já feitas |
| `post_update` | `cardId`, `stage`, `markdown` | Adiciona um evento à linha do tempo do card |
| `ask` | `cardId`, `stage`, `questions[]` (1–4, cada uma com 2–4 opções e recomendação opcional) | Guarda as perguntas; o card mostra o selo *aguardando você* |
| `attach_artifact` | `cardId`, `stage`, `path`, `commitSha` | Liga um arquivo versionado (plano, handoff, revisão, critérios) ao card |
| `complete_stage` | `cardId`, `stage`, `outcome`, `summary` | Encerra a execução; o orquestrador aplica `resolveTransition` com o `outcome` |
| `create_card` | `boardId`, `title`, `specMarkdown`, `parentCardId?` | Cria um card no backlog (para o planejador quebrar um épico) |

`outcome` ∈ `success` · `needs_input` · `needs_rework` · `failed`.

## Relatório da etapa

O `summary` de `complete_stage` segue um molde fixo, para que o card seja legível sem abrir o código:

```markdown
### <Etapa> — <resultado em uma linha>

**O que foi feito:** 2–4 linhas.
**Decisões tomadas sem você:** cada uma com a recomendação aplicada (ou "nenhuma").
**Commits:** `abc1234` type(project): ... (um por linha).
**Verificação:** typecheck, lint, testes (números), validação visual (feita / não feita e por quê).
**Pendências:** o que ficou para depois, com dono.
```

Tempo, modelo e link da sessão são preenchidos pelo board a partir do `run`.

## Garantias do lado do board

- Um `complete_stage` repetido para o mesmo `run` é ignorado (idempotente).
- Uma execução que não chama `complete_stage` até o tempo limite vira `failed` com o motivo "sem resposta do agente".
- Perguntas de uma etapa ficam ligadas ao `run`; a resposta vai junto no próximo disparo da mesma etapa.
