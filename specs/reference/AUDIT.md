# Registro de auditoria do backlog

O `/spec --sync` registra aqui achados, gates, deriva e decisões estacionadas, no mesmo formato do core.

## Entregues

### `fork-cleanup` — 2026-11-25

- **Como:** direto na PR #1 (`chore/bootstrap-agent-board`), sem as etapas do pipeline; spec arquivada em
  [`docs/features/fork-cleanup/spec.md`](../../docs/features/fork-cleanup/spec.md).
- **Conferido:** typecheck dos 12 workspaces, `pnpm check` e Vitest de todos os workspaces, verdes.
  `pnpm e2e` e `test:emulator` ficam com o CI da PR.
- **Deriva:** organizações e trilha de auditoria saíram, embora a spec as deixasse fora do corte; `entity` e
  upload passaram a ser escopados por pessoa (`userId`). O login ficou com e-mail/senha e Google até
  `github-sign-in`.
