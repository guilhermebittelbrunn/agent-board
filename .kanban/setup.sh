#!/usr/bin/env bash
# Prepara o ambiente de nuvem (tarefa agendada do Claude Code) para rodar as etapas do board.
# O resultado fica em cache no ambiente; ajuste ao que o repositório precisa.
set -euo pipefail

corepack enable
pnpm install --frozen-lockfile

# Validação visual (agent-browser) e emulador do Firebase, se o pipeline do repositório exigir.
if ! command -v agent-browser >/dev/null 2>&1; then
    npm install -g agent-browser
    agent-browser install
fi
if ! command -v firebase >/dev/null 2>&1; then
    npm install -g firebase-tools
fi
