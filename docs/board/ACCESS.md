# Acesso e colaboração

O GitHub é a fonte de identidade e de permissão: todos entram com a conta do GitHub, e o papel no board nunca passa do que a pessoa pode fazer no repositório.

## Identidade

- **Login:** Firebase Auth com o provedor GitHub (`GithubAuthProvider`). O `@repo/auth` herdado já é Firebase e hoje oferece e-mail/senha e Google; no board fica só o GitHub (spec `github-sign-in`).
- **Perfil:** `githubId` (estável, é a chave), `login` (pode mudar), nome e avatar. Sem cadastro por e-mail.

## GitHub App do board

Um GitHub App próprio, separado do Claude GitHub App (que as sessões do Claude Code usam para clonar e abrir PR). Instalado na conta ou organização dona dos repositórios.

| Permissão do App | Para quê |
|------------------|----------|
| Metadata: read | Consultar a permissão de cada membro no repositório |
| Contents: read | Ler `.kanban/board.yml`, `specs/` e `docs/features/` |
| Pull requests: read & write | Abrir a PR do card na coluna Aguardando PR e acompanhar reviews |
| Issues: read | Comentários gerais da PR |
| Checks: read | Estado do CI da PR |
| Webhooks | `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `check_suite`, `member`, `installation_repositories` |

A permissão de um membro vem de `GET /repos/{owner}/{repo}/collaborators/{username}/permission` com o token de instalação. O campo `role_name` (`read`, `triage`, `write`, `maintain`, `admin`) é o `GithubRepoRole` do `@repo/kanban-contract`; usuário sem acesso vira `none`.

## Papéis no board

| Papel | O que pode fazer | Exige no GitHub |
|-------|------------------|-----------------|
| `owner` | Tudo, mais configurar colunas e a API key do board, e excluir o board | `admin` |
| `maintainer` | Convidar e remover membros, editar colunas e a agenda de ciclos | `maintain` |
| `operator` | Escrever, descobrir e aprovar specs, priorizar e arrastar cards (dispara a etapa), rodar ciclos, responder perguntas | `write` |
| `viewer` | Ver board, cards, ciclos e relatórios; comentar | `read` |

**Papel efetivo = o maior papel que não passa do papel no board nem da permissão no GitHub** (`resolveEffectiveRole`). Exemplos: `operator` com `read` no GitHub vira `viewer`; `owner` com `write` vira `operator`; quem perdeu o repositório perde o board.

Quando checar:

- no login e ao abrir um board (com cache curto);
- **sempre** antes de disparar uma etapa;
- quando chega um webhook `member` ou `installation_repositories` daquele repositório (invalida o cache).

## Convites

- Por login do GitHub. O convite fica `pending` até a pessoa entrar pela primeira vez; ao entrar, vira `active` com o papel efetivo calculado.
- Só `maintainer` e `owner` convidam; ninguém convida para um papel acima do próprio.
- Remover um membro não apaga o que ele fez: `runs` e `events` guardam o autor.

## Com que credencial a execução roda

Ordem de escolha da credencial quando alguém dispara uma etapa:

1. A credencial **de quem disparou** que sirva ao executor da etapa: o runner local que ele registrou, ou as tarefas agendadas da conta dele (uma por etapa, com a URL de disparo).
2. Se ele não tiver, a **API key do board**, se o `owner` configurou.
3. Se nada servir, o disparo é recusado e o motivo aparece no card.

Commits e PR saem no nome de quem executou. `viewer` nunca dispara. Toda execução grava em `runs` quem disparou, com qual credencial e o modelo.

Regra da Anthropic que isso respeita: o login de uma assinatura do Claude é para uso próprio. O board nunca usa a assinatura de uma pessoa para rodar o que outra disparou; quando a credencial não é de quem disparou, é uma API key.

## Fases

- **MVP:** login GitHub, membros e papel `viewer` (alguém acompanha o board com você).
- **Fase 2:** convites para `operator` e disparo com a credencial de cada membro.
- **Fase 4:** API key do board como fallback.
