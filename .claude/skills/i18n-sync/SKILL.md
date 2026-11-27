---
name: i18n-sync
description: Adiciona, edita ou valida chaves de tradução no pacote @repo/internationalization (dicionário pt-br), incluindo os apiErrors da API. Use quando precisar criar textos de UI, adicionar um código de erro novo da API, ou auditar se algum error.code ficou sem copy. Strings de interface NUNCA ficam soltas em JSX — sempre passam por aqui.
---

# Sincronizar traduções (`@repo/internationalization`)

O repo tem **um idioma só, `pt-br`**, mas todo texto visível continua passando pelo dicionário: é o que
mantém a copy num lugar só e permite adicionar um idioma depois sem caçar string em JSX. Regras por
escopo: [`apps/app/CLAUDE.md`](../../../apps/app/CLAUDE.md) (front) e
[`apps/api/CLAUDE.md`](../../../apps/api/CLAUDE.md) (`error.code`).

## Como o dicionário é montado

- Base: `packages/internationalization/translations/`. Cada arquivo-folha exporta um objeto com a chave
  de idioma `"pt-br"`.
- Folhas sobem por `index.ts` (ex.: `apps/app/pages/common/index.ts`) até `translations/global.ts`
  (`globalTranslations`).
- No app: `const { dictionary, locale } = getDictionary()` — client de
  `@repo/internationalization/client`, server de `@repo/internationalization/server`. Acesso por caminho,
  ex.: `dictionary.apps.app.pages.common.boards.members.invite.success`.
- `locales` e `getDefaultLocale` ficam em `packages/internationalization/utils.ts`. O segmento `[locale]`
  da URL continua existindo (hoje só aceita `pt-br`); no servidor ele chega pelo header
  `x-request-locale` que o proxy repassa.

## Adicionar/editar chaves de UI

1. **Localize ou crie a folha** sob o caminho que reflete onde o texto aparece (ex.: página comum →
   `translations/apps/app/pages/common/<recurso>.ts`). Espelhe o bloco `members` de `boards.ts` como modelo de
   estrutura (título, campos, mensagens, tabela).
2. **Adicione a chave dentro de `"pt-br"`**, com nome estável e descritivo (`messages.created`,
   `fields.name.label`).
3. **Conecte no `index.ts`** do diretório (e acima, se for folha nova) para que apareça em
   `globalTranslations`.
4. No app, a variável que guarda a fatia do dictionary tem nome descritivo (`membersCopy`), nunca
   `t`/`d`.
5. Mensagens de Zod: injete via `buildXSchema(dictionary)` em vez de texto fixo no schema compartilhado.

## Adicionar código de erro da API (`apiErrors`)

Quando a API passar a responder um `error.code` novo:

1. Abra `packages/internationalization/translations/packages/shared/utils.ts`.
2. Adicione a chave (ex.: `CARD_NOT_FOUND`) dentro de `apiErrors`, com uma frase que diga ao usuário o
   que aconteceu e, se der, o que fazer.
3. O app mapeia `code` → texto via `FormattedError` / `handleClientError`. Não precisa mudar o app se a
   chave existir aqui.

## Validar (determinístico)

```bash
pnpm --filter @repo/internationalization typecheck   # folha bem formada e conectada
pnpm --filter api test apiErrorCodes                 # todo error.code da API tem copy
```

- O dicionário é tipado pelo próprio objeto: chave lida pelo app que não existe quebra o `typecheck` de
  quem a lê (`pnpm --filter app typecheck`).
- `apps/api/__tests__/apiErrorCodesTranslated.test.ts` varre `app/`, `(shared)/` e `proxy.ts` atrás de
  literais `UPPER_SNAKE` e falha listando cada código sem entrada em `apiErrors`, com o arquivo de origem.
  Mensagens do Identity Toolkit comparadas com `.includes("…")` ficam de fora (são entrada, não código).

## Checklist final

- [ ] Chave nova dentro de `"pt-br"`, na folha da área.
- [ ] Folha nova conectada nos `index.ts` até `global.ts`.
- [ ] Código de erro novo da API com entrada em `apiErrors`.
- [ ] Nenhuma string literal de UI ficou no JSX.
- [ ] `typecheck` do pacote e do app passam; `pnpm --filter api test apiErrorCodes` passa.
