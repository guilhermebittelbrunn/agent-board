# docs/board — o agent-board por dentro

O agent-board transforma o pipeline de agentes de um repositório num board Kanban: o backlog de specs vira a coluna Tarefas, cada comando do pipeline vira uma coluna, e o board dispara, acompanha e registra cada etapa.

| Documento | Responde |
|-----------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Quais são as peças, como um card anda e onde os agentes rodam |
| [ACCESS.md](ACCESS.md) | Login GitHub, GitHub App, papéis e quem paga cada execução |
| [CONTRACT.md](CONTRACT.md) | As ferramentas que os agentes chamam e o que o board faz com cada uma |
| [IMPORT.md](IMPORT.md) | Como um repositório entra num board e o formato do `.kanban/board.yml` |

## Escopo

Ferramenta de uso próprio, não MVP. Entra só o que acelera o time:

- **Sim:** boards por repositório, cards a partir de specs, disparo de etapas, linha do tempo do card, perguntas e respostas, membros com papéis, custos por execução, agenda.
- **Não:** landing, cobrança, e-mail transacional, onboarding, recuperação de conta, MFA, consentimento de cookies, administração de usuários, multi-idioma.

O `/cycle` herdado do core (rodada inteira sem acompanhamento, com decisões pela `.claude/cycle-policy.md`) continua disponível; o modo board usa a mesma política para não perguntar o que ela já decide.

## Decisões tomadas

| Decisão | Escolha |
|---------|---------|
| Base do código | Fork da `main` do next-boilerplate (`b7f9124`) com o core como remoto `upstream`; o que é de produto para cliente final sai na spec `fork-cleanup` |
| Identidade | Conta do GitHub (Firebase Auth, provedor GitHub) |
| Permissão | Papel no board limitado pela permissão no repositório do GitHub |
| Fonte do backlog | `specs/` + `specs/BACKLOG.md` de cada repositório importado |
| Quem paga a execução | A credencial de quem disparou; API key do board como fallback |
| Executores no MVP | Runner local (Agent SDK) e nuvem (tarefas agendadas do Claude Code com gatilho de API) |

## Em aberto

- Aprovação humana do plano entre Análise e Executando: sempre, nunca ou por board (o `board.yml` já aceita `approval: optional`).
- Runner padrão de cada board: local ou nuvem.
- PR aberta automaticamente como draft ou só depois de aprovação no card.
- GitHub App instalado na organização inteira ou repositório a repositório.

Plano completo, com custos e comparação de executores: documento "Kanban de agentes — plano de integração" no projeto *Next boilerplate* do Claude.
