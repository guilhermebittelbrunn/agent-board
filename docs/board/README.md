# docs/board — o agent-board por dentro

O agent-board transforma o pipeline de agentes de um repositório num board Kanban: o backlog de specs vira a coluna Tarefas, cada comando do pipeline vira uma coluna, e o board dispara, acompanha e registra cada etapa.

| Documento | Responde |
|-----------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Quais são as peças, como um card anda e onde os agentes rodam |
| [ACCESS.md](ACCESS.md) | Login GitHub, GitHub App, papéis e quem paga cada execução |
| [CONTRACT.md](CONTRACT.md) | As ferramentas que os agentes chamam e o que o board faz com cada uma |
| [IMPORT.md](IMPORT.md) | Como um repositório entra num board e o formato do `.kanban/board.yml` |
| [ROADMAP.md](ROADMAP.md) | Fases, gates e quais specs fecham cada fase |
| [DECISIONS.md](DECISIONS.md) | Custos, onde os agentes executam, construir ou adotar, riscos e decisões em aberto |

## Escopo

Ferramenta de uso próprio, não MVP. Entra só o que acelera o time:

- **Sim:** boards por repositório, cards a partir de specs, disparo de etapas, linha do tempo do card, perguntas e respostas, membros com papéis, custos por execução, agenda.
- **Não:** landing, cobrança, e-mail transacional, onboarding, recuperação de conta, MFA, consentimento de cookies, organizações herdadas do core, multi-idioma.

O `/cycle` herdado do core (rodada inteira sem acompanhamento, com decisões pela `.claude/cycle-policy.md`) continua disponível; o modo board usa a mesma política para não perguntar o que ela já decide.

## Decisões

As principais, em uma linha cada; o porquê, os custos e as que estão em aberto ficam em [DECISIONS.md](DECISIONS.md).

| Decisão | Escolha |
|---------|---------|
| Base do código | Fork da `main` do next-boilerplate (`b7f9124`) com o core como remoto `upstream`; o que era de produto para cliente final saiu na spec [`fork-cleanup`](../features/fork-cleanup/spec.md) |
| Identidade | Conta do GitHub (spec `github-sign-in`); até lá, e-mail/senha e Google |
| Permissão | Papel no board limitado pela permissão no repositório do GitHub |
| Fonte do backlog | `specs/` + `specs/BACKLOG.md` de cada repositório importado |
| Quem paga a execução | A credencial de quem disparou; API key do board como fallback |
| Executores | Runner local (Agent SDK) no MVP; nuvem (tarefas agendadas com gatilho de API) na fase 2 |
