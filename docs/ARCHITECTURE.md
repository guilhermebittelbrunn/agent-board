# Arquitetura

Visão de sistema do código-base do agent-board: as peças herdadas do core e como elas se conectam. O board
em si (orquestrador, contrato dos agentes, executores) está em [`docs/board/ARCHITECTURE.md`](board/ARCHITECTURE.md).
As convenções de implementação ficam em [`AGENTS.md`](../AGENTS.md) e nos `CLAUDE.md` aninhados por escopo
(`apps/*/CLAUDE.md`, `packages/CLAUDE.md`), com o mapa rápido em [`CLAUDE.md`](../CLAUDE.md).

## Propósito

Ferramenta pessoal, não produto: o agent-board é um fork enxuto do next-boilerplate (Turborepo + pnpm +
Next.js + Firebase) que mantém só o que acelera o desenvolvimento do board. Ficou o painel, a API, a
autenticação, o design system, notificações no app e upload de arquivos; saíram landing, e-mail, cobrança,
organizações, trilha de auditoria, fluxos de conta de MVP e os idiomas além do pt-br. O princípio herdado
continua valendo: **genérico no pacote, específico no app**.

> ⚠️ Ligar o **upload de arquivo** exige o plano **Blaze** do Firebase (cartão de crédito): o Cloud Storage
> não existe no plano Spark. Sem bucket configurado, a capacidade fica desligada e o resto do sistema segue no
> Spark. Ativação em [`PRE-PRODUCTION.md`](PRE-PRODUCTION.md).

## Topologia

```
┌──────────────┐        Monorepo (Turborepo + pnpm)
│   apps/app   │
│ (board,      │
│  conta,      │
│  admin)      │
│    :3000     │
└──────┬───────┘
       │  @repo/sdk (axios facade)
       ▼
┌──────────────┐   guards → repositórios → mappers
│   apps/api   │ ─────────────────────────────────►  Firestore · Cloud Storage
│    :3002     │   (@repo/auth verifica o token Firebase)
└──────────────┘
```

- **`apps/app`** — painel autenticado: o board, a conta do usuário e a **área admin** (gestão de usuários + impersonação).
- **`apps/api`** — API HTTP em Next no servidor. Valida na borda, aplica guards e fala com o Firestore e o bucket. É o único ponto que toca persistência; o orquestrador e o contrato dos agentes nascem aqui.
- **`apps/e2e`** — suíte Playwright que sobe emuladores, API e painel.

## Fluxo de dados (front → API → Firestore)

1. O front **nunca** chama a API direto. Usa o `apiClient` (`apps/app/shared/lib/client.ts`), instância de `Client` do `@repo/sdk`.
2. O `Client` (axios) tem uma **action por recurso** (`apiClient.entity.list()`, `.create(body)`, …) e injeta headers de contexto de auth (`BaseClient.setAuthRequestContext`): `userId`, `requestUserId`, `userRole`, `x-role`.
3. Na `apps/api`, o handler é embrulhado por um **guard** (`requireCommonPanelApi` / `requireAdminApi`) que:
   - valida o `Authorization: Bearer <token>` via `@repo/auth/server` (`getCurrentUser` → Firebase Admin `verifyIdToken`),
   - resolve o perfil Firestore do ator e o **subject** (titular ou usuário personificado),
   - injeta `ctx.subjectProfile`, `ctx.authRequest` no handler.
4. O handler **valida o input** (Zod, `parseCreateX`/`parseUpdateX`), monta o patch (`omitUndefined`), resolve `[id]` (`resolveIdFromContext`) e chama o **repositório**.
5. O **repositório** estende `BaseRepository<DTO>` (Firestore) e usa um **mapper** para normalizar (`Timestamp`→ISO, opcionais) entre o documento persistido e o `DTO` exposto pelo `@repo/sdk`. Soft delete via `deletedAt`.
6. A resposta volta como `{ data }` ou, em erro, `{ error: { code } }` com status HTTP correto.

> Não há camada "domain" separada: a `Entity` é o documento Firestore + `id`; o `DTO` é o tipo do `@repo/sdk`. Repositórios simples (ex.: `user`) dispensam mapper.

## Escopo de dados

Todo registro do painel comum pertence ao perfil que o criou: o documento grava `userId` (o id do documento
de perfil, não o uid do Firebase Auth) e o repositório filtra por ele num helper privado (`ownedBy`,
`findOwnedBy` em `entity.repository.ts`). O handler repassa `ctx.subjectProfile.id` e responde 404 ao `null`;
ele nunca compara ids por conta própria. Fotos e avatar ficam em `uploads/<profileId>/`.

O board troca esse escopo por outro: boards, cards e execuções pertencem a um **board**, e quem alcança cada
um é decidido pelo papel efetivo do membro (o menor entre o papel no board e a permissão no repositório do
GitHub). O guard composto que resolve esse papel nasce na spec `board-members`; o modelo está em
[`docs/board/ACCESS.md`](board/ACCESS.md).

## Autenticação e impersonação (admin)

- **Provider**: Firebase. No servidor, `@repo/auth/server` inicializa o Admin SDK (`FIREBASE_ADMIN_*`) e expõe uma API estilo Clerk (`auth()`, `currentUser()`, `getCurrentUser(token)`). O token vem do cookie `access-token`.
- **Login**: GitHub pelo popup do Firebase; a API lê o `login` no Firebase e grava em `user.github`. E-mail/senha só existe no emulador (seed, E2E e QA local) e o servidor recusa fora dele. Detalhe em [`SECURITY.md`](SECURITY.md).
- **Admin impersona usuário comum**: o SDK carrega `requestUserId`/`x-role` e o guard `requireCommonPanelApi` resolve o `subjectProfile` como o usuário personificado, só para leitura. Ao trocar o usuário em `PanelNavbarControls`, o `setImpersonatedUser` grava os cookies e chama `router.refresh()`.
- **Regra**: autorização é **sempre** repetida no servidor (guards). UI oculta nunca é a única proteção.

Detalhes em [`AUTH-PANEL.md`](AUTH-PANEL.md) e [`SECURITY.md`](SECURITY.md).

## Notificações no app

Avisos para a pessoa (`notification`, escopo pelo perfil) com sino no navbar, contagem de não lidas e
paginação. Um aviso carrega um tipo e parâmetros, nunca texto pronto: o dicionário do leitor transforma em
palavras. O board vai usá-los para "seu card espera resposta" e "etapa falhou".

## Internacionalização

- Pacote próprio `@repo/internationalization`, **sem serviço de terceiros**, com um idioma só: `pt-br`. A regra "nenhuma string de UI solta" continua valendo.
- Dicionário composto por arquivos-folha (cada um com a chave `"pt-br"`) que sobem por `index.ts` até `translations/global.ts`.
- As rotas mantêm o segmento `[locale]` (`/pt-br/...`): o proxy redireciona o caminho sem idioma e repassa o idioma no header `x-request-locale`. Acrescentar um idioma volta a ser só dicionário.
- Erros de API: a API responde `error.code` estável; o app traduz via `apiErrors` (`translations/packages/shared/utils.ts`) + `FormattedError`/`handleClientError`.

## UI, tema e responsividade

- **`@repo/design-system`**: componentes shadcn + tokens CSS + `next-themes` (light/dark/system). Componentes `HookForm*` ligam os primitivos ao React Hook Form.
- **Tema configurável por CSS**: as cores ficam em tokens; mudar o tema é editar variáveis CSS.
- **Responsivo mobile-first**, breakpoints consistentes com o design system.

## Build, deploy e tooling

- **Turborepo** orquestra `dev`/`build`/`test`/`analyze` (`turbo.json`); `build` depende de `test`.
- **pnpm workspaces** (`apps/*`, `packages/*`); `public-hoist-pattern[]=*` no `.npmrc` para resolução estável de libs no IDE.
- **Biome/Ultracite** para lint/format (`pnpm check` / `pnpm fix`); **Vitest** para testes; **Playwright** para E2E.
- **Deploy**: `apps/app` e `apps/api` são independentes e pensados para a **Vercel** — ver `vercel.json` de cada app.

## Onde cada coisa vive

| Camada | Caminho | Papel |
|--------|---------|-------|
| Fachada HTTP | `packages/sdk` | Única porta do front para a API. |
| UI + tema | `packages/design-system` | Componentes genéricos, dark mode, RHF. |
| Traduções | `packages/internationalization` | pt-br, chaves estáveis. |
| Auth | `packages/auth` | Firebase Admin + client, API estilo Clerk. |
| Contrato do board | `packages/kanban-contract` | Schema do `.kanban/board.yml`, papéis, transições do card, ferramentas dos agentes. |
| Utils transversais | `packages/shared` | `HTTP_STATUS`, `FormattedError`, mappers de data. |
| Config compartilhada | `packages/next-config`, `packages/typescript-config` | Next/TS base, marca. |
| Integrações | `packages/analytics`, `packages/security`, `packages/seo` | Analytics, Arcjet + headers, metadata. |
