# `specs/` — backlog do agent-board

Esta pasta é a **entrada do ciclo de desenvolvimento** do agent-board, no mesmo formato do next-boilerplate:
`specs/` guarda o que **ainda falta construir** e o porquê, uma spec por arquivo em `features/`; `docs/features/<slug>/` guarda como cada
tarefa foi construída. Spec entregue **sai daqui** (`/spec --sync` move para `docs/features/<slug>/spec.md`).

> **Este repo é uma ferramenta de uso próprio, não um core de MVPs.** Uma spec entra aqui se acelera o time que
> usa o board. Não há "evidência de mercado": a seção equivalente é **Referências** (documentação do
> Claude Code, do GitHub e decisões em [`docs/board/DECISIONS.md`](../docs/board/DECISIONS.md)).

## O ciclo

```
/spec → /analyze <id> → /develop → /review → /test → /observe
                       (docs/features/<slug>/ ......................)
```

Rode `/analyze <id>` na primeira spec `approved` do [`BACKLOG.md`](BACKLOG.md). O `/cycle` herdado do
core também funciona aqui, para uma rodada inteira sem acompanhamento. Depois que o próprio
board existir (fase 1), o mesmo ciclo passa a ser disparado pelos cards — o agent-board é construído com o
agent-board.

## Frontmatter

```yaml
---
id: board-import          # slug em inglês = nome do arquivo em features/
title: Criar board importando um repositório
status: proposed          # proposed | approved | in-progress | done | deferred | rejected | superseded
value: alto               # alto | médio | baixo
effort: M                 # P (≤1 dia) | M (2–4 dias) | G (>1 semana)
audience: time            # time | dx | confianca — quem colhe o benefício
phase: 1                  # fase do roadmap (docs/board/ROADMAP.md)
area: [apps/api, apps/app, packages/kanban-contract]
depends_on: []            # ordem: specs que precisam vir antes
contends_on: []           # arquivos compartilhados existentes que a spec altera
feature: -
updated: 2026-11-25
---
```

- **`audience: time`** — valor direto para quem usa o board (ver, disparar, acompanhar).
- **`audience: dx`** — valor para quem desenvolve o board (limpeza, testes, CI).
- **`audience: confianca`** — segurança e controle de acesso (papéis, segredos, auditoria).

Todo arquivo abre com o bloco **Resumo** (o quê, por quê, status, próximo passo), como no core. Status,
ciclo de vida e quem move cada status seguem o
[`specs/README.md` do next-boilerplate](https://github.com/guilhermebittelbrunn/next-boilerplate/blob/main/specs/README.md).

## Regras de qualidade

1. **O que já existe no repo**, com caminho (e linha quando ajudar): prova que a spec não duplica nada.
2. **Corte de MVP explícito**: a menor fatia vertical que entrega valor observável; o resto em "Fora do corte".
3. **Contrato primeiro**: tipos e regras do domínio do board vão para `@repo/kanban-contract`; a spec diz
   quais entram lá.
4. **Sem pseudo-diff**: nome de arquivo a criar e assinatura de função são do `/analyze`.

## Estrutura

```
specs/
  README.md            ← este arquivo
  BACKLOG.md           ← ordem (fonte da ordem)
  features/<id>.md     ← uma spec por arquivo
  reference/
    TEMPLATE.md        ← esqueleto de spec nova
    AUDIT.md           ← registro das auditorias do /spec --sync
```
