# docs/board — o agent-board por dentro

O agent-board transforma o pipeline de agentes de um repositório num board Kanban: o backlog de specs vira a coluna Tarefas, cada comando do pipeline vira uma coluna, e o board dispara, acompanha e registra cada etapa.

| Documento | Responde |
|-----------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Quais são as peças, como um card anda e onde os agentes rodam |
| [ACCESS.md](ACCESS.md) | Login GitHub, GitHub App, papéis e com que credencial cada execução roda |
| [CONTRACT.md](CONTRACT.md) | As ferramentas que os agentes chamam e o que o board faz com cada uma |
| [IMPORT.md](IMPORT.md) | Como um repositório entra num board e o formato do `.kanban/board.yml` |
| [SCREENS.md](SCREENS.md) | Que tela do canvas cada spec constrói |
| [ROADMAP.md](ROADMAP.md) | Fases, gates e quais specs fecham cada fase |
| [DECISIONS.md](DECISIONS.md) | Onde os agentes executam, construir ou adotar, riscos e decisões em aberto |

## Escopo

Ferramenta de uso próprio, não MVP. Entra só o que acelera o time:

- **Sim:** boards por repositório, cards a partir de specs, disparo de etapas, linha do tempo do card, perguntas e respostas, membros com papéis, specs escritas com um agente, descoberta de specs, ciclos de ponta a ponta e agenda de ciclos.
- **Não:** landing, cobrança, e-mail transacional, onboarding, recuperação de conta, MFA, consentimento de cookies, organizações herdadas do core, multi-idioma, custos e orçamento.

O `/cycle` herdado do core (rodada inteira sem acompanhamento, com decisões pela `.claude/cycle-policy.md`) continua disponível; o modo board usa a mesma política para não perguntar o que ela já decide. No board, o mesmo comportamento vira o ciclo, com várias specs (spec `cycle-runs`).

## Decisões

As principais, em uma linha cada; o porquê e as que estão em aberto ficam em [DECISIONS.md](DECISIONS.md).

| Decisão | Escolha |
|---------|---------|
| Base do código | Fork da `main` do next-boilerplate (`b7f9124`) com o core como remoto `upstream`; o que era de produto para cliente final saiu na spec [`fork-cleanup`](../features/fork-cleanup/spec.md) |
| Identidade | Conta do GitHub (spec `github-sign-in`); e-mail/senha só no emulador |
| Permissão | Papel no board limitado pela permissão no repositório do GitHub |
| Fonte do backlog | `specs/` + `specs/BACKLOG.md` de cada repositório importado |
| Com que credencial a etapa roda | A de quem disparou; API key do board como fallback |
| Onde a spec nasce | No repositório (`specs/`) ou no board, escrita por um agente na branch do card |
| Custos | Fora do escopo: o board não mostra valor nem orçamento |
| Executores | Runner local (Agent SDK) no MVP; nuvem (tarefas agendadas com gatilho de API) na fase 2 |
