import type { GithubRepoRole } from "@repo/kanban-contract";

export const SAMPLE_INSTALLATION_ID = 1;
export const SAMPLE_OWNER = "agent-board-demo";
export const BOARD_CONFIG_PATH = ".kanban/board.yml";

/**
 * Repository permission the emulator answers for these logins, on every sample
 * repository. Any other login is admin, so whoever runs the seed can import a board.
 */
export const SAMPLE_COLLABORATOR_ROLES: Readonly<
    Record<string, GithubRepoRole>
> = {
    "qa-maintainer": "maintain",
    "qa-writer": "write",
    "qa-reader": "read",
    "qa-outsider": "none",
};

const VALID_BOARD_YML = `version: 1
name: sample-app

baseBranch: main
protectedBranches: [main, master, production, production-backup]
branchPattern: feat/{slug}

backlog:
  source: specs
  index: specs/BACKLOG.md
  readyStatus: approved

featuresDir: docs/features

stages:
  - key: analyze
    column: Análise
    command: /analyze
    agent: planejador-tarefa
    model: opus
    effort: high
    approval: optional
  - key: develop
    column: Executando
    command: /develop
    agent: desenvolvedor
    model: sonnet
    effort: medium
  - key: review
    column: Revisando
    command: /review
    agent: revisor-codigo
    model: opus
    effort: high
    onRework: develop
  - key: test
    column: Testando
    command: /test
    agent: analista-qa
    model: sonnet
    effort: medium
    onRework: develop
  - key: pr
    column: Aguardando PR
    command: /observe
    agent: observador-tarefa
    model: haiku
    effort: low
    onPrComment: /mediate
    pullRequest:
      draft: true

limits:
  maxReworkLoops: 2
  maxTurnsPerStage: 200
  maxPrCommentRunsPerHour: 3
`;

const INVALID_BOARD_YML = `version: 1
name: invalid-config

baseBranch: main
protectedBranches: [main]
branchPattern: feat/{slug}

stages:
  - key: analyze
    column: Análise
    command: /analyze
  - key: develop
    column: Executando
    command: /develop
  - key: review
    column: Revisando
    command: /review
    onRework: deploy
`;

export const SAMPLE_BACKLOG_INDEX_PATH = "specs/BACKLOG.md";

const SAMPLE_BACKLOG_INDEX = `# Backlog

Contract and frontmatter: [README](README.md).

| # | spec | what |
|---|------|------|
| 1 | [\`search-cards\`](features/search-cards.md) | Search the board by text |
| 2 | [\`slack-alerts\`](features/slack-alerts.md) | Slack alerts |
| 3 | [\`keyboard-shortcuts\`](features/keyboard-shortcuts.md) | Keyboard shortcuts |
| 4 | [\`legacy-export\`](features/legacy-export.md) | Legacy export |
| 5 | [\`broken-frontmatter\`](features/broken-frontmatter.md) | A spec missing its status |
| 6 | [\`dark-theme\`](features/dark-theme.md) | Dark theme |

## Delivered

- [\`fork-cleanup\`](../docs/features/fork-cleanup/spec.md)
`;

const SEARCH_CARDS_SPEC = `---
id: search-cards
title: Busca por texto nos cards
status: approved
---

# Busca por texto nos cards

Quem usa o board quer achar um card pelo título ou pela branch sem rolar as colunas.

## Corte

| Item | Entra |
|------|-------|
| Busca pelo título | sim |
| Busca pela branch | sim |
| Filtros salvos | não |

- [x] Campo de busca no topo do quadro
- [ ] Atalho \`/\` para focar a busca

Exemplo de consulta: \`title & branch\`.

\`\`\`ts
const matches = cards.filter((card) => card.title.includes(query));
\`\`\`

Veja também [os atalhos](keyboard-shortcuts.md), [a documentação do GitHub](https://docs.github.com/) e
[um link que não deve virar link](javascript:alert(1)).

<script>alert("spec")</script>

![Esboço da busca](assets/search.png)
`;

const SLACK_ALERTS_SPEC = `---
id: slack-alerts
title: Avisos no Slack quando um card espera você
status: proposed
---

# Avisos no Slack

Ainda em triagem.
`;

const KEYBOARD_SHORTCUTS_SPEC = `---
id: keyboard-shortcuts
status: approved
---

# Atalhos de teclado no quadro

Mover cards e abrir o detalhe sem o mouse.
`;

const BROKEN_FRONTMATTER_SPEC = `---
id: broken-frontmatter
title: Spec sem status
---

# Spec sem status
`;

const DARK_THEME_SPEC = `---
id: dark-theme
title: Tema escuro
status: approved
---

# Tema escuro

O quadro segue o tema do sistema.
`;

const SPECS_README = `# Specs

Cada spec é um arquivo em \`features/\` com frontmatter \`id\`, \`title\` e \`status\`.
`;

const FORK_CLEANUP_SPEC = `---
id: fork-cleanup
title: Enxugar o fork do boilerplate
status: done
---

# Enxugar o fork do boilerplate

Entregue.
`;

/**
 * The backlog of \`sample-app\`: three ready specs, one still proposed, one delivered, a
 * README without frontmatter, a link to a file that does not exist and a spec without a
 * status, so a sync exercises every outcome.
 */
export const SAMPLE_BACKLOG_FILES: Readonly<Record<string, string>> = {
    [SAMPLE_BACKLOG_INDEX_PATH]: SAMPLE_BACKLOG_INDEX,
    "specs/README.md": SPECS_README,
    "specs/features/search-cards.md": SEARCH_CARDS_SPEC,
    "specs/features/slack-alerts.md": SLACK_ALERTS_SPEC,
    "specs/features/keyboard-shortcuts.md": KEYBOARD_SHORTCUTS_SPEC,
    "specs/features/broken-frontmatter.md": BROKEN_FRONTMATTER_SPEC,
    "specs/features/dark-theme.md": DARK_THEME_SPEC,
    "docs/features/fork-cleanup/spec.md": FORK_CLEANUP_SPEC,
};

/**
 * The object each YAML above parses into, before the schema defaults. Kept next to the
 * text so a change to one without the other fails the test that parses the YAML and
 * compares it with these objects.
 */
export const SAMPLE_BOARD_CONFIGS = {
    valid: {
        version: 1,
        name: "sample-app",
        baseBranch: "main",
        protectedBranches: [
            "main",
            "master",
            "production",
            "production-backup",
        ],
        branchPattern: "feat/{slug}",
        backlog: {
            source: "specs",
            index: "specs/BACKLOG.md",
            readyStatus: "approved",
        },
        featuresDir: "docs/features",
        stages: [
            {
                key: "analyze",
                column: "Análise",
                command: "/analyze",
                agent: "planejador-tarefa",
                model: "opus",
                effort: "high",
                approval: "optional",
            },
            {
                key: "develop",
                column: "Executando",
                command: "/develop",
                agent: "desenvolvedor",
                model: "sonnet",
                effort: "medium",
            },
            {
                key: "review",
                column: "Revisando",
                command: "/review",
                agent: "revisor-codigo",
                model: "opus",
                effort: "high",
                onRework: "develop",
            },
            {
                key: "test",
                column: "Testando",
                command: "/test",
                agent: "analista-qa",
                model: "sonnet",
                effort: "medium",
                onRework: "develop",
            },
            {
                key: "pr",
                column: "Aguardando PR",
                command: "/observe",
                agent: "observador-tarefa",
                model: "haiku",
                effort: "low",
                onPrComment: "/mediate",
                pullRequest: { draft: true },
            },
        ],
        limits: {
            maxReworkLoops: 2,
            maxTurnsPerStage: 200,
            maxPrCommentRunsPerHour: 3,
        },
    },
    invalid: {
        version: 1,
        name: "invalid-config",
        baseBranch: "main",
        protectedBranches: ["main"],
        branchPattern: "feat/{slug}",
        stages: [
            { key: "analyze", column: "Análise", command: "/analyze" },
            { key: "develop", column: "Executando", command: "/develop" },
            {
                key: "review",
                column: "Revisando",
                command: "/review",
                onRework: "deploy",
            },
        ],
    },
} as const;

export type SampleRepository = {
    name: string;
    defaultBranch: string;
    private: boolean;
    files: Record<string, string>;
};

export const SAMPLE_REPOSITORIES: readonly SampleRepository[] = [
    {
        name: "sample-app",
        defaultBranch: "main",
        private: false,
        files: {
            [BOARD_CONFIG_PATH]: VALID_BOARD_YML,
            ...SAMPLE_BACKLOG_FILES,
        },
    },
    {
        name: "invalid-config",
        defaultBranch: "main",
        private: true,
        files: { [BOARD_CONFIG_PATH]: INVALID_BOARD_YML },
    },
    {
        name: "no-kanban",
        defaultBranch: "main",
        private: false,
        files: {},
    },
];
