# Decisões, riscos e quanto custa rodar

O porquê do desenho do agent-board: onde os agentes executam, quanto custa rodar o pipeline, por que
construir em vez de adotar, o que pode dar errado e o que ainda está em aberto. As peças em si estão em
[`ARCHITECTURE.md`](ARCHITECTURE.md); a ordem de construção, em [`ROADMAP.md`](ROADMAP.md).

> Preços e limites coletados em **2026-11-25**, das fontes no fim do arquivo. Preço envelhece: antes de
> decidir plano ou executor, confira a fonte e atualize a data.

## Resposta curta

Em novembro de 2026 todas as peças de execução já existem; faltam o board e o orquestrador. O Claude Code
roda sem ninguém no teclado de quatro formas: tarefas agendadas na nuvem com gatilho por API, GitHub Actions,
Agent SDK num processo seu e Managed Agents. O app vira uma máquina de estados: arrastar o card dispara a
etapa, o agente escreve no card por um contrato (MCP/HTTP) e o board decide a próxima coluna.

Não há licença a pagar pelo board nem pelas ferramentas. Paga-se o uso do Claude e uma hospedagem pequena.

## Quanto custa rodar

**O board não mostra custo nem orçamento** — isso saiu do escopo em 2026-11-25 (spec `schedules-and-budgets`
substituída por `cycle-schedule`). A conta abaixo serve para escolher o plano do Claude e se mede fora do
board, no uso da conta.

Para **40 features por mês**, o modelo custa de US$ 100–200 (assinatura) a cerca de US$ 400 (API, modelos
mistos); a infraestrutura fica abaixo de US$ 30. Os preços são de tabela; os volumes de tokens são estimativa
até as features do G2 serem medidas.

| Item | Como cobra | Estimativa mensal (40 features) |
|------|-----------|--------------------------------|
| Claude por assinatura, uso individual | Max US$ 100 ou Ultra US$ 200; excedente via créditos de uso, se ativados | US$ 100–200, mais excedente |
| Claude por assinatura, equipe | Team Premium US$ 100/assento (anual) ou US$ 125 (mensal) | US$ 100–125 por pessoa |
| API, tudo em Opus 5.5 | US$ 4 entrada, US$ 20 saída, US$ 0,20 cache lido, por milhão de tokens | ~US$ 590 |
| API, misto (Opus em análise e revisão, Sonnet no resto) | Opus como acima; Sonnet 5.5 a US$ 2 / US$ 10 / US$ 0,10 | ~US$ 390 |
| API, tudo em Sonnet 5.5 | Como acima | ~US$ 290 |
| GitHub Actions, se usado | US$ 0,006/min Linux; repositório privado tem franquia de US$ 12–18/mês | ~US$ 20 brutos, quase tudo na franquia |
| Managed Agents, se usado | US$ 0,08 por hora de sessão ativa, além dos tokens | ~US$ 6 (80 h) |
| Hospedagem do board (Vercel + Firebase) | Planos gratuitos no início | US$ 0–25 |

**Premissa por feature completa** (`/analyze` → `/test`): cerca de 270 turnos, 22 milhões de tokens lidos do
cache, 0,8 milhão gravados no cache e 0,3 milhão de saída. Dá ~US$ 15 em Opus, ~US$ 7 em Sonnet e ~US$ 10 no
misto. Feature pequena custa um terço disso; épico pode passar de US$ 40.

Dois pontos mudam a conta:

- **Créditos incluídos.** Max inclui US$ 100/mês de API, Ultra US$ 200 e Team até US$ 500 compartilhados,
  válidos para Agent SDK e Managed Agents com API key de uma organização Console vinculada. No Ultra, o
  cenário misto sairia por ~US$ 190 líquidos.
- **Limites da assinatura.** Não dá para converter o limite do Max ou do Ultra em número de features, e as
  execuções automáticas disputam o mesmo limite do uso interativo. Meça as cinco primeiras features (o
  Agent SDK devolve o custo de cada execução) antes de escolher o plano.

## Onde os agentes executam

Para o MVP, a combinação que dá nuvem sem operar infraestrutura e controle fino na máquina-alvo é **tarefas
agendadas com gatilho de API + runner local com Agent SDK**. GitHub Actions e Managed Agents entram quando o
uso for de equipe ou cobrado por API.

| Opção | Onde roda | Como paga | Modelo e esforço por etapa | A favor | Contra |
|-------|-----------|-----------|----------------------------|---------|--------|
| Tarefas agendadas com gatilho de API | Nuvem Anthropic, ou ambiente self-hosted (Team/Enterprise, beta) | Assinatura Pro, Max, Team ou Enterprise | Modelo fixo por tarefa; a etapa troca o modelo passando-o ao subagente | Zero infra; `POST /fire` devolve a URL da sessão; clona o repo e usa as skills commitadas; aceita agenda e eventos do GitHub | Research preview; a tarefa pertence a uma conta; a API só dispara (criar e editar é na web); 30 disparos/h por tarefa e 100/h por conta; o texto do disparo chega marcado como não confiável |
| GitHub Actions (`claude-code-action`) | Runner do GitHub | Assinatura (token de `claude setup-token`) ou API, mais minutos | `--model` e `--max-turns` em `claude_args` | Segredos, concorrência, logs e `workflow_dispatch` nativos | Sem sessão ao vivo; um workflow por repositório |
| Agent SDK (TypeScript) | Processo seu: servidor ou máquina-alvo | API key; login da assinatura só para uso próprio | Total: modelo, esforço, turnos, ferramentas, hooks; intercepta `AskUserQuestion` | Controle máximo, stream ao vivo; carrega `.claude/` do repo como o CLI | Você opera fila, isolamento (worktrees) e atualizações |
| Managed Agents | Sandbox da Anthropic ou self-hosted | API: tokens + US$ 0,08/h de sessão ativa | Total, via API | Escala para equipe sem operar sandbox | Só API key; repo e skills precisam ser empacotados no agente |

Três detalhes pesam no desenho:

- **Modelo e esforço.** No runner próprio, vêm da configuração da coluna. Nas tarefas agendadas, o modelo é o
  do cadastro da tarefa; a sessão principal roda num modelo barato e passa o modelo da etapa ao subagente,
  como os comandos já fazem (`desenvolvedor` e `analista-qa` usam `sonnet`, `observador-tarefa` usa `haiku`).
- **Retorno ao board.** A sessão na nuvem só acessa domínios liberados. Cadastrar o board como connector MCP
  no claude.ai evita isso, porque o tráfego de connectors passa pelos servidores da Anthropic.
- **Regra de login.** A documentação do Agent SDK proíbe oferecer login do claude.ai em produtos de terceiros
  sem aprovação. Runner na sua máquina com o seu login é uso próprio; servidor central rodando para equipe
  ou clientes usa API key.

### Modelo sugerido por coluna

| Coluna | Agente | Modelo | Sai quando |
|--------|--------|--------|-----------|
| Rascunhos | `estrategista-produto` (via `/spec`) | — | Spec aprovada por alguém (`spec-authoring`) |
| Tarefas | — | — | Você arrasta o card ou um ciclo o puxa (`cycle-runs`) |
| Análise | `planejador-tarefa` | Opus, esforço alto | `plan.md` pronto, `analyze = done`, sem perguntas abertas |
| Executando | `desenvolvedor` | Sonnet | `handoff.md` escrito e typecheck verde |
| Revisando | `revisor-codigo` | Opus | `review.md`, commits na branch da feature e push |
| Testando | `analista-qa` | Sonnet | Testes relacionados verdes e critérios de aceite gerados |
| Aguardando PR | `mediador-pr`, `observador-tarefa` | Sonnet, Haiku | PR aprovada e mergeada |

Modelo e esforço ficam na configuração da coluna e podem ser trocados por card.

## Construir ou adotar

Nenhuma ferramenta pronta executa um pipeline de etapas com os comandos e agentes do próprio repositório,
então o board é construído. As opções abaixo servem de referência de produto.

| Ferramenta | O que já faz | Por que não basta |
|------------|--------------|-------------------|
| Claude Code Projects (beta, Pro e Max) | Threads paralelas na nuvem; painel com Trabalhando, Aguardando você e Pronto para revisão; PR com auto-fix de CI; modelo e esforço por thread | As threads leem o `CLAUDE.md`, mas não as skills nem o `.claude/settings.json`; sem colunas por etapa; ainda sem Team e Enterprise |
| Cline Kanban (research preview, código aberto) | Board local em que cada card é uma tarefa de agente de terminal, com dependências, commits e PR automáticos e MCP para o agente criar cards | Roda local; o fluxo é por tarefa, não por etapas customizadas |
| Vibe Kanban (Apache-2.0) | Board com workspace isolado por agente, revisão de diff e PR | A empresa por trás encerrou em abril de 2026; o projeto segue só com manutenção da comunidade |
| GitHub Projects + Actions | Board nativo e workflows no mesmo lugar | Mover coluna não dispara workflow direto (exige um GitHub App no meio); pouco espaço para o relatório de cada etapa |

Duas ideias copiadas: os estados do Projects (*aguardando você* como sinal no card, não como coluna) e o MCP
do Cline Kanban, que deixa o agente quebrar um épico em cards ligados (`kanban.create_card`).

## Riscos e mitigações

O maior risco é um agente com permissão de escrita rodando sem supervisão; o segundo, depender de APIs em
preview. Os dois têm mitigação barata se entrarem desde o MVP.

| Risco | Mitigação |
|-------|-----------|
| Tarefas agendadas e Managed Agents estão em preview/beta; a API pode mudar | Cada executor atrás de um adapter; o board não depende de nenhum deles |
| Agente sem supervisão commita onde não deve | Hook `PreToolUse` de branch protegida, ruleset no GitHub, nunca merge automático, limite de turnos por etapa |
| Injeção de prompt via spec, comentário de PR ou ClickUp | Conteúdo do card tratado como dado; o disparo leva só campos esperados (card, slug, etapa); as tarefas agendadas já marcam o texto do disparo como não confiável |
| Loop review ↔ develop queimando tokens | No máximo duas voltas; na terceira o card para em *aguardando você*; limite de turnos por etapa |
| Cards em paralelo conflitando (i18n, lockfile) | Limite WIP por coluna e rebase antes do review |
| Nuvem diferente da máquina local (emulador, browser) | Script de setup do ambiente; validação visual pesada no runner local |
| Login da assinatura usado fora da regra | Assinatura só no runner local e nas suas tarefas agendadas; servidor central com API key |
| Conflito "modificado no upstream / removido aqui" a cada merge do core | Resolver mantendo a remoção; o que saiu está listado na [spec `fork-cleanup`](../features/fork-cleanup/spec.md) |

## Decisões tomadas

| Decisão | Escolha |
|---------|---------|
| Base do código | Fork da `main` do next-boilerplate (`b7f9124`), com o core como remoto `upstream` para `git merge upstream/main` |
| Natureza | Ferramenta de uso próprio, não produto: sem landing, cobrança, e-mail transacional nem telas de suporte a usuário final |
| Custos no board | Fora do escopo: nenhuma tela mostra valor, teto de gasto ou painel de custos; `runs` grava modelo, turnos e tempo |
| Onde a spec nasce | No repositório (`specs/`) ou no board, escrita por um agente na branch do card (spec `spec-authoring`) |
| Rodar o backlog sem ninguém | Ciclo com várias specs (`cycle-runs`), agendável (`cycle-schedule`) |
| O que ficou do core | `apps/app`, `apps/api`, `apps/e2e`; auth, conta (perfil com avatar e preferências), upload de arquivos, analytics com consentimento, design system, SDK; o pipeline `.claude` e `specs/` |
| O que saiu do core | Landing de produto (a atual é uma página só, com a animação do board), preview de e-mail, cobrança e modo de produto, organizações e convites, trilha de auditoria, e-mail transacional, en/es, cadastro, recuperação, verificação, link por e-mail, MFA, tela de sessões, métodos vinculados, troca de e-mail, onboarding, kickoff e `/deliver`; e, depois, área admin, impersonação, notificações, sidebar, aba Segurança da conta e o CRUD de exemplo `entity` (spec `app-cleanup`) |
| Escopo dos dados | Por pessoa (`userId`) até a spec `board-members`; depois, por board, com guard de papel |
| Idioma | Só pt-br, mantendo o segmento `[locale]` e a regra "sem string solta" |
| Identidade | Conta do GitHub (spec `github-sign-in`); e-mail/senha só no emulador |
| Permissão | Papel no board limitado pela permissão no repositório do GitHub |
| Fonte do backlog | `specs/` + `specs/BACKLOG.md` de cada repositório importado |
| Com que credencial a etapa roda | A de quem disparou; API key do board como fallback (fase 4) |
| Executores no MVP | Runner local (Agent SDK) primeiro; nuvem (tarefas agendadas com gatilho de API) na fase 2 |

## Em aberto

- Aprovação humana do plano entre Análise e Executando: sempre, nunca ou por board? (o `board.yml` já aceita
  `approval: optional`)
- Runner padrão de cada board: local ou nuvem?
- PR aberta automaticamente como draft, ou só depois de aprovação no card?
- GitHub App do board instalado na organização inteira ou repositório a repositório?
- Projeto Firebase novo para o agent-board (recomendado) ou reaproveitar um existente?

## Fontes

Coletadas em 2026-11-25.

- [Automate work with scheduled tasks (routines)](https://code.claude.com/docs/en/routines) — Claude Code Docs
- [Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments) — Claude Code Docs
- [Claude Code Projects](https://code.claude.com/docs/en/claude-projects) — Claude Code Docs
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) — Claude Code Docs
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — Claude Code Docs
- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) — Claude Help Center
- [Pricing (modelos e Managed Agents)](https://platform.claude.com/docs/en/about-claude/pricing) — Claude Platform Docs
- [Planos Claude](https://claude.com/pricing) — claude.com
- [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) — GitHub Docs
- [REST API endpoints for collaborators](https://docs.github.com/en/enterprise-cloud@latest/rest/collaborators/collaborators) — GitHub Docs
- [Cline Kanban](https://github.com/cline/kanban) — GitHub
- [Goodbye bloop (Vibe Kanban)](https://vibekanban.com/blog/shutdown) — vibekanban.com
