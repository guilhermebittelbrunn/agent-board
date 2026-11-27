---
name: write-tests
description: Escreve testes Vitest neste monorepo seguindo o setup do repo — schemas Zod, mappers, handlers de rota da API, hooks de dados (React Query) e componentes RHF, com mocks de SDK/Firebase. Use quando o usuário pedir "escrever testes", "adicionar testes para X", "cobrir com testes", "testar essa rota/hook/componente". Roda com Vitest (jsdom) + @testing-library/react.
---

# Escrever testes (Vitest)

Padrões de teste alinhados ao setup do repo. Cada app/pacote testável tem `vitest.config.mts` (environment `jsdom`, aliases `@` e `@repo`) e script `test: vitest run`. Testes ficam em `__tests__/` ou colocados ao lado (`*.test.ts(x)`). Rode: `pnpm --filter <workspace> test` ou `pnpm test` (todos).

## Ordem de prioridade (maior ROI primeiro)
1. **Funções puras** — mappers (`toDTO`/`toPersistence`), Zod (`parseCreateX`/`parseUpdateX`), utils de `@repo/shared`. Sem mocks, rápidas, alto valor.
2. **Handlers de rota** — lógica de validação/posse/erro, com deps mockadas.
3. **Hooks de dados** — `useListX`/`useFindXById` e mutations, com `apiClient` mockado.
4. **Componentes** — smoke render + interações-chave, com SDK/dictionary mockados.

## 1. Funções puras (sem mock)

```ts
import { describe, expect, it } from "vitest";
import { parseInviteBoardMember } from "@/(shared)/validation/board-member.schema";
import { boardMemberMapper } from "@/(shared)/mappers/board-member.mapper";

describe("board-member.schema", () => {
  it("rejeita um login fora do formato do GitHub", () => {
    const r = parseInviteBoardMember({ login: "-bad", role: "operator" });
    expect(r.ok).toBe(false);
  });
});

describe("boardMemberMapper.toDTO", () => {
  it("normaliza Timestamp para ISO", () => {
    const record = boardMemberMapper.toDTO({ id: "b1__octo", boardId: "b1", role: "owner", status: "active", login: "octo", createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null });
    expect(typeof record.createdAt).toBe("string"); // ISO
  });
});
```

`apps/api/__tests__/boardMemberMapper.test.ts` é o modelo completo.

## 2. Handler de rota da API

Handlers puros (sem guard) chamam-se direto, como `apps/api/__tests__/health.test.ts`. Para rotas com **guard** ou repositório, mocke as dependências com `vi.mock` **antes** de importar o handler:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/(shared)/repositories/board-member.repository", () => ({
  boardMemberRepository: { listByBoard: vi.fn().mockResolvedValue([]) },
}));
// Mocke o guard para injetar um ctx falso e apenas executar o handler:
vi.mock("@/app/(guards)/board", () => ({
  requireBoardApi: (_capability: string, h: any) => (req: any) =>
    h(req, { profile: { id: "p1" }, board: { id: "b1" }, member: { id: "b1__octo" } }),
}));

const { GET } = await import("@/app/(routes)/boards/[id]/members/route");

describe("GET /boards/:id/members", () => {
  it("retorna { data } do board em contexto", async () => {
    const res = await GET(new Request("http://t/boards/b1/members") as any, {} as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });
});
```

> Teste também o 404 de escopo e o 400 de validação. Recurso da pessoa: o repositório não acha o
> registro de outra pessoa e a rota responde 404 (`runnersRoutes.test.ts`). Para exercitar o guard de
> verdade (sem sessão, sem perfil, papel insuficiente), mocke `resolveApiActor` e o `userRepository` em
> vez do guard, como em `boardMembersRoutes.test.ts` e `sessionGuard.test.ts`.

## 3. Hook de dados (React Query)

Mocke o `apiClient` e envolva com um `QueryClientProvider`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/client", () => ({
  apiClient: { boardMember: { list: vi.fn().mockResolvedValue([{ id: "1" }]) } },
}));
const { useListBoardMembers } = await import(
  "@/app/[locale]/(authenticated)/(common)/(pages)/boards/(hooks)/useListBoardMembers"
);

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useListBoardMembers", () => {
  it("carrega a lista via SDK", async () => {
    const { result } = renderHook(() => useListBoardMembers("b1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });
});
```

Hook que usa `useAuthorizedQuery` espera `useSdkAuthorized()`: mocke `@/shared/providers/ApiAuthProvider`
com `useSdkAuthorized: () => true`.

## 4. Componente (smoke + interação)

Smoke render como `apps/app/__tests__/signInForm.test.tsx`; para componentes que usam dictionary/SDK, mocke-os:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/internationalization/client", () => ({
  getDictionary: () => ({ locale: "pt-br", dictionary: { /* fatia mínima usada */ } }),
}));

describe("InviteMemberForm", () => {
  it("renderiza os campos", () => {
    render(/* <InviteMemberForm ... /> */);
    expect(screen.getByRole("button")).toBeDefined();
  });
});
```

## Convenções
- **Não** teste implementação de libs (RHF, React Query) — teste o comportamento do **seu** código (validação, mapeamento, posse, estados de erro/sucesso).
- Mocke nas **bordas**: `@/shared/lib/client` (SDK), `@repo/auth/server`, `firebase/*`. Evite mockar tudo.
- `vi.mock` é içado: para controlar o retorno por teste, use `vi.fn()` no factory e ajuste com `mockResolvedValueOnce` dentro do `it`.
- Importe o módulo sob teste com `await import(...)` **depois** dos `vi.mock` quando o mock precisa valer na carga.
- Nomeie o arquivo `*.test.ts(x)`; rode `pnpm --filter <workspace> test` e garanta verde antes de concluir.

## Onde rodar
`pnpm test` (turbo, todos) · `pnpm --filter app test` · `pnpm --filter api test` · `pnpm --filter @repo/internationalization test` · `pnpm --filter api test apiErrorCodes` (cobertura do `apiErrors`).
