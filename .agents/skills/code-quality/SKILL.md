---
name: code-quality
description: Use whenever cleaning, validating, or finishing code; fixing or preventing formatting, lint, typecheck, import-order, naming, or other repository-standard violations; deciding whether the formatter or linter should autofix mechanical issues instead of editing them by hand; or running verification commands before calling work complete.
---

# Code Quality

Keep code mechanically clean through the repository's own type checker, linter,
formatter, and build tooling. Treat every rule here as a default unless the
repository's configuration says otherwise; its configuration is authoritative.

## Verification (run before done)

Always run the repo's typecheck, lint, format, and build before declaring a
change complete. The script runner is repo-specific; these are the SAME step
expressed two ways:

```bash
# pnpm-based repo            # bun-based repo
pnpm typecheck               bun run typecheck
pnpm lint                    bun run lint
pnpm format                  bun run format:check   # check; *:fix to auto-fix
pnpm build                   bun run build
```

- For mechanical formatting, import-order, and autofixable lint violations, run
  the repository's configured formatter or lint-fix command before editing the
  affected lines manually.
- Let the tool apply the rules it owns, then inspect its diff and fix only the
  remaining semantic or non-autofixable violations by hand.
- Do not imitate formatter or linter output manually when the repository already
  provides the command that produces it.
- Run from the repo's canonical directory (root or the app package — follow the
  repo's scripts; some lint scripts run with `--fix --max-warnings=0`).
- Fix everything to zero warnings/errors. Do not leave a red checker.
- If the change touches native/main-process code or packaging, also run the
  relevant native build/dev check — see **native-integration**.

## TypeScript: strict and honest

Keep strict mode on. Expect (and do not disable) at least:

```jsonc
{
  "strict": true,
  "strictNullChecks": true,
  "noImplicitAny": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
}
```

Typing principles:

- Prefer `unknown` + narrowing over `any`. Narrow with `typeof`, `instanceof`,
  or `in` guards before accessing properties.
- Use `enum` for named constant sets; reach for `as const` objects when an enum
  is heavier than the context needs, then derive `type T = typeof X[keyof typeof X]`.
- Use `satisfies` to type-check a literal without widening its inferred type.
- Derive types from their contract source, not by hand-duplication: `z.infer`
  from a Zod schema, or generated types from an OpenAPI generator — adapt to the
  repo's stack (see **api-integration** for contract typing).
- Add explicit return types on exported functions.

## Path aliases, never deep relatives

Import through the repo's configured alias (`@/...`, `@config`, `@internal/...`).
Never reach across the tree with `../../../`.

```ts
// Good                                    // Bad
import { UiButton } from '@/ui/UiButton'   import { UiButton } from '../../../ui/UiButton'
```

## Linting norms

- No unused variables. Remove them, or prefix intentionally-unused params with
  `_` (e.g. `(_event) => …`).
- No stray `console`. If a log is genuinely required, scope a single
  `eslint-disable-next-line` — and prefer the repo's logger (see
  **logging**).
- React Hooks rules apply; keep hook dependency lists correct.
- Let the linter sort/dedupe imports. Disable rules narrowly and only with a
  reason, never blanket-disable a whole file casually.

## Import order

Group imports, blank-line-separated, in this order (the linter usually enforces
it):

1. React
2. External packages
3. Internal alias imports (`@/...`)
4. Relative imports (`./...`)

```tsx
import { useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { UiButton } from '@/ui/UiButton'

import { Child } from './Child'
```

## Formatting

Adopt the repo's formatter — follow its `.prettierrc` (or equivalent) rather than
re-styling by hand; let the formatter own whitespace, quotes, and class sorting.
One repo's baseline, as an example of the kind of conventions to honor: 2-space
indent, no semicolons, single quotes (incl. JSX), trailing commas everywhere,
`arrowParens: avoid`, and a Tailwind class-sorting plugin. Match whatever the
target repo configures; do not impose this baseline on a repo that disagrees.

## Naming

- Components: `PascalCase`. Hooks: `camelCase` with `use` prefix.
- Module-level constants: `SCREAMING_SNAKE_CASE`.
- Files: `PascalCase` for components, `camelCase` for utilities.
- CSS: kebab-case utility classes (via Tailwind). The literal-class / `cn()`
  rule lives in **components**.

## Cross-links

- React component behavior, effect alternatives, and internal ordering —
  **components**.
- Logger instead of `console` — **logging**.
- Native/main-process build checks — **native-integration**.
