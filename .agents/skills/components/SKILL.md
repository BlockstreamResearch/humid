---
name: components
description: Use whenever work creates, modifies, refactors, reviews, styles, composes, or places any React component or conditional JSX; selects or adds a Ui* primitive; ports shadcn/Base UI components; designs compound, polymorphic, Context, or controlled/uncontrolled APIs; handles parent-child layout ownership, hooks and effects, skeletons, loading/error/empty/data states, or render-prop data loaders. Covers UI primitives, common business components, and feature- or page-owned components.
---

# Components

Treat the repository's existing `ui/` directory as the design-system authority.
Its `Ui*` components are local adaptations of official **shadcn** components built
on **Base UI** (`@base-ui/react`), commonly using
`class-variance-authority` (cva) and `cn()` (tailwind-merge).

Treat shadcn as an upstream source of component code and documentation, not as a
registry-managed project structure. Preserve the local `Ui*` conventions instead
of introducing Radix, HeroUI, another primitive system, or a parallel feature-local
design system.

## Distinguish Primitives From Product Components

Reserve the `ui/` directory and `Ui*` prefix for reusable design primitives and
their stable specializations.

Components that compose those primitives with product behavior are not `Ui*`
components. Name them after their business or interface responsibility and place
them at the nearest common owner that contains all of their real consumers:

- one consumer → keep it inside that component or page boundary;
- several consumers inside one page subtree → move it only to their nearest
  shared owner inside that page;
- several pages or subfeatures inside one feature → move it to that feature's
  contextual `components/` boundary;
- consumers from genuinely different features or application areas → place it
  in the shared business-component boundary, usually `common/`.

Do not promote a component based on hypothetical reuse, import count, or reuse
within a single owner. Move it upward only as real consumers cross ownership
boundaries:

```text
page/components
        ↑
resource-or-feature/components
        ↑
common
```

In the usual application layout, `common/` sits beside `ui/`:

```text
src/
├── ui/       # Ui* design primitives
└── common/   # Shared product and business components
```

Components in `common/` use names that describe their product or business
responsibility; the `Ui*` prefix remains reserved for primitives. Treat
`common/` as a real owner, not as a catch-all. Put only components with
demonstrated use across genuinely different ownership areas there, keep
feature- or page-private components local, and organize complex common
components recursively by responsibility.

Follow **file-structure** for the exact directory. A private child belongs inside
its owning component or page, commonly under its contextual `components/`
folder. Do not move a component into `ui/` merely because it is reusable,
complex, or implemented as a compound component.

The component-design rules below are not limited to `Ui*` primitives. Apply
composition, Context, controlled/uncontrolled state, effect, ownership, and
render-state guidance to product components whenever those patterns make the
component simpler and more coherent.

## Inspect The Existing UI System First

Before implementing or styling any component:

1. Decide whether the responsibility is a design primitive or a product
   component, then inspect the nearest current owner.
2. Locate the repository's `ui/` directory from existing imports, aliases, and
   source structure so the component reuses the available primitives.
3. Inspect its filenames and search for the needed behavior, not only the exact
   name you expect.
4. Read the closest existing `Ui*` primitive, its named variations, and a few
   real consumers. Read stories when the repository has them.
5. Reuse the existing primitive or variation when it already expresses the
   required semantics and state.
6. Add a shared primitive only when the capability is genuinely missing.

Do not enumerate the available primitives in this skill; discover the target
repository's current UI surface every time. Do not hand-roll or restyle an
interactive control before checking whether its `Ui*` equivalent already exists.

## Port Missing Primitives From Official Sources

When the required primitive is absent:

1. Read the current official shadcn documentation and the matching Base UI API.
2. Select the Base UI implementation, not a Radix or another-library variant.
3. Obtain the official source manually. Use the shadcn CLI only as an optional
   way to inspect or download source; do not let it initialize, restructure, or
   overwrite the application's `ui/` directory.
4. Inspect analogous local primitives to learn import paths, tokens, formatting,
   exports, and file shape.
5. Port the source into the local `Ui*` layer and adapt only its integration:
   local `cn`, theme tokens, icon system, `data-slot` values, import aliases, and
   `Ui*` exports.
6. Preserve the upstream semantics, accessibility behavior, keyboard behavior,
   state attributes, prop forwarding, and ref contract.
7. Add stories or focused tests when that is the repository's established
   practice, then run the normal verification through **code-quality**.

Never paste an upstream component directly into a feature. The local `Ui*`
adaptation becomes the reusable boundary.

## Ui* Wrapper Convention

A `Ui*` module adapts one or more shadcn/Base UI parts into the application's
reusable design primitive.

- Keep internal component names aligned with upstream, then alias every public
  export with the `Ui` prefix:
  `export { Button as UiButton, buttonVariants as UiButtonVariants }`.
- For multi-part primitives, preserve the parts and alias each public part:
  `DialogContent as UiDialogContent`, `DialogTrigger as UiDialogTrigger`, and so
  on.
- Put stable `data-slot` attributes on rendered parts. Preserve upstream props
  and refs instead of narrowing the primitive accidentally.
- Use cva for real variant axes and compose caller classes through `cn(...)`.
- Prefer an existing wrapper before writing a new one. Add a new `Ui*` only for a
  genuinely reusable design primitive — never for one feature's one-off layout.
- Use the icon system the repo already established; do not introduce another.

## Keep Styling At The Owning Layer

The shared `Ui*` layer owns the visual language of controls and surfaces:
colors, typography treatments, backgrounds, borders, radii, shadows, and
hover/focus/active/disabled/invalid/ARIA state styling.

Feature and page components should use Tailwind primarily for structure:
layout, positioning, sizing, spacing, responsive arrangement, and placement of
children. Passing `className` for those structural concerns is expected.

Do not rebuild a primitive's visual or interaction states in a consumer. If a
visual treatment is intentional and reusable, add a clearly named variation
beside the primitive. If it is unique feature composition rather than a reusable
primitive treatment, compose existing `Ui*` parts without redefining their
owned states.

## File & Folder Layout — base + variations

Choose one of three shapes from the component's actual responsibility:

**1. Self-contained primitive → a flat file** `Ui{Name}.tsx` at the ui root
(`UiCard.tsx`, `UiAlert.tsx`, `UiDialog.tsx`). It may export one component or
several upstream compound parts.

**2. Primitive with specializations → a folder `Ui{Name}/`** named after the
component and containing:

- **`base.tsx`** — the canonical local adaptation of the official component. It
  contains the shared primitive behavior, state styles, and cva variants and
  exports `Ui{Name}` plus any public variants helper.
- **Named visual variations beside `base.tsx`** — one file per stable treatment,
  kebab-case named for what it is (`outline-primary.tsx`,
  `ghost-destructive.tsx`, `outline.tsx`, `simple.tsx`). Each one:
  - imports the original: `import { UiButton } from './base'`
  - is a **`default export`** named `Ui{Name}{Variation}` (`UiButtonOutlinePrimary`,
    `UiInputOutline`)
  - locks a base variant and/or layers extra classes via `cn('…extra', className)`,
    narrowing the props it now fixes (`Omit<ComponentProps<typeof UiButton>, 'variant'>`)
  - or composes richer stable structure around `base`, such as affixes, field
    chrome, or another repeated integration.
- No barrel — import the exact file: `@/ui/UiButton/base`, `@/ui/UiButton/outline-primary`.

```tsx
// UiButton/outline-primary.tsx
import { UiButton } from './base'

export default function UiButtonOutlinePrimary({
  className,
  ...rest
}: Omit<ComponentProps<typeof UiButton>, 'variant'>) {
  return (
    <UiButton
      {...rest}
      variant='outline'
      className={cn('border-primary! text-primary bg-transparent!', className)}
    />
  )
}
```

**3. Bespoke/composed component (not a variant family) → `Ui{Name}/index.tsx`**
(+ assets or `components/` subparts): `UiIcon`, `UiMarkdown` (+ `styles.scss`),
`UiToaster` (+ `components/`).

**Rule of thumb:** a recurring restyle of a `Ui*` belongs in a **named variation
file** under the component folder — not scattered as inline `className` overrides
across features. `className` does merge through `cn()` (caller overrides win), but
promote anything reused into a variation so the base stays the shared authority.

### Keep the base free of feature-specific changes

Adapt `base.tsx` intentionally when importing, updating, or correcting the shared
primitive itself. Do not edit it to satisfy one feature's visual request. Build
that treatment around the base through a sibling variation or composition.

## Polymorphism (render prop, not Slot)

Base UI primitives are polymorphic via the `render` prop / `useRender` hook +
`mergeProps` — there is no Radix `asChild`/`Slot` here. To let a caller swap the
rendered element, forward `render` or drive it with `useRender`. Ensure custom
render targets accept the forwarded ref and spread the received props onto their
underlying DOM element. Preserve correct element semantics; polymorphism is not
permission to make a button behave as a link or vice versa.

## Compound Components

Use the compound pattern when a primitive or business component has meaningful
parts that should compose independently while sharing one coherent behavior.
This includes shadcn-style parts such as `Select.Trigger`/`Select.Content` and
higher-level feature components decomposed into Root, Trigger, Content,
Indicator, or similar roles.

Compound parts do not require Context by default. Use the local Context boundary
below only when the parts genuinely need shared state or behavior.

## Context As A Local Composition Boundary

Use Context when one coherent component, feature, or page subtree has several
parts that need the same state, derived values, or actions, and explicit props
would cause prop drilling or fragmented ownership.

Place the Provider at the narrowest owner that contains all real consumers.
Keep state and actions in that owner and expose them through a guarded consumer
hook. Derive the context value type from its owning value hook or factory when
practical instead of declaring a parallel type manually.

```tsx
const XContext = createContext<XState | null>(null)
const useXContext = () => {
  const ctx = useContext(XContext)
  if (!ctx) throw new Error('X parts must be used within X')
  return ctx
}
```

Do not introduce Context when local state and explicit props remain clearer. Do
not use it to duplicate server state owned by the data-fetching layer or durable
client state owned by the state-management layer.

## Controlled / Uncontrolled

Choose the state contract that fits the component. Do not require every
component to support both modes.

- Use an uncontrolled mode when the component can own its interaction state.
- Use a controlled mode when a parent must own that state.
- Support both when the same reusable component genuinely needs autonomous and
  parent-driven usage. Accept `defaultX` for the uncontrolled seed and
  `x` + `onXChange` for controlled usage; never switch modes after mount.
- Use `x !== undefined` only when `undefined` unambiguously means uncontrolled.
  If `undefined` is a valid controlled value, define an explicit contract instead.

## Avoid useEffect

Treat `useEffect` as exceptional. Before adding one, prove that the component
must synchronize with a lifecycle that no existing declarative abstraction
already owns. The mere presence of an external source does not justify an
effect: when the source fits an async or server-state model, prefer the
repository's data-fetching layer, such as TanStack Query, so request lifecycle,
caching, retries, deduplication, and cancellation stay outside the component.

Use an effect only as the final option for synchronization that genuinely
belongs to the component, such as an imperative browser API, a third-party
imperative library, or a subscription that cannot use `useSyncExternalStore`.
Do not use it as a general-purpose way to run component logic.

| Instead of `useEffect` for… | Prefer |
| --- | --- |
| Fetching data | The data-fetching layer, such as TanStack Query — see **api-integration** |
| Derived or computed state | Compute during render, or use `useMemo` for expensive computation |
| Subscribing to an external store | `useSyncExternalStore` or store selectors — see **state-management** |
| Responding to a prop change | Compute during render or lift state up |
| Resetting state on prop change | A `key` prop that remounts the owned subtree |
| Handling a user action | The event handler itself |

If a React data-flow or event-driven pattern expresses the behavior, use it
instead of adding an effect.

## Parent Owns Placement

A child owns its internal structure, content, internal visual treatment, and
local show/hide behavior. It must NOT own the styles that place it within its
parent: surrounding layout, positioning, sibling-dependent sizing, route-level
offsets, or dock dimensions. Apply those external layout styles through a parent
wrapper so the child renders correctly in any correctly-sized slot.

This rule governs runtime layout and styling ownership, not source-file
placement. Locate the component itself according to **file-structure**.

### Docked / sheet surfaces — two-layer split

1. A **generic container** (bar/sheet) owns only open/close behavior and a content slot.
2. The **owning page or layout** applies absolute/flex/grid placement and
   surrounding offsets through its wrapper.
3. The **business content** fills the provided slot without knowing the page,
   shell, sibling panels, or external geometry.

The container never decides its own position in the page.

## Component internal ordering

Order a component file as imports → types/interfaces → component. Inside the
component, call hooks before any conditional return, then keep computed values,
handlers, and render:

```tsx
export function MyComponent({ title }: Props) {
  const [open, setOpen] = useState(false)
  const items = useMemo(() => data?.filter(item => item.active), [data])
  const handleClick = () => setOpen(true)

  return <UiButton onClick={handleClick}>{title}</UiButton>
}
```

## Skeletons

A skeleton must preserve the real content's visible geometry: the same occupied
space, primary dimensions, and row/section arrangement. It does not need to copy
the real DOM or every decorative detail, but swapping in data must not cause a
layout shift. For lists, render several skeleton rows to represent a realistically
populated list.

## Ordered Async-State Rendering

For mutually exclusive async states in one UI region, use one ordered waterfall:
loading → error → empty → data. Base blocking loading and error states on the
absence of usable data, not on query flags alone. Existing cached or stale data
normally remains the data state during a background refetch or background error;
surface secondary status separately when the product requires it.

Prefer an inline IIFE with sequential early returns. Avoid ternary expressions
for conditional rendering in JSX; never build nested or chained render
ternaries. They quickly obscure branch priority and turn JSX into an unreadable
conditional tree. Do not scatter conditionals that can overlap or render
contradictory states.

```tsx
{(() => {
  const hasUsableData = query.data !== undefined

  if (!hasUsableData && query.isPending) return <ListSkeleton />
  if (!hasUsableData && query.isError) return <ErrorState />
  if (!query.data?.items.length) return <EmptyState />
  return <List items={query.data.items} />
})()}
```

Render shared chrome such as the header, title, and primary action once outside
the waterfall. Give separate regions separate waterfalls when they can load or
fail independently.

## Render-Prop Data-Loading Components (abstract-requesting)

Consider a thin render-prop requesting component when referenced entities are
loaded repeatedly across UI contexts or direct request wiring would clutter
their consumers. Let it accept the entity identity, call the existing query
options through the shared data-fetching client, and expose the query result to
the render prop. Keep loading, error, empty, and presentation decisions inline
at the call site:

```tsx
<EntityById id={id}>
  {({ data, isPending, isError }) => {
    if (data === undefined && isPending) return <UiSkeleton />
    if (data === undefined && isError) {
      return <UiAlert>Unable to load</UiAlert>
    }
    if (data === undefined) return null
    return <EntityView entity={data} />
  }}
</EntityById>
```

Do not create one reflexively for every entity or embed presentation policy
inside it. Place it at the nearest common owner of its real consumers according
to **file-structure**.

The render-prop boundary improves declarative composition, not network
performance by itself. Query caching, deduplication, key factories, batching,
and request balancing remain responsibilities of the shared data layer → see
**api-integration**.

## Cross-References

- Route/page contracts, layouts, params, and navigation → **routing**.
- Physical file placement, visibility, and ownership boundaries →
  **file-structure**.
- Form state, `register`, `Controller`, and validation → **forms**.
- Query and mutation options, keys, cache updates, invalidation, batching, and
  request balancing → **api-integration**.
- Durable client state, selectors, persistence, and external-store
  subscriptions → **state-management**.
- User-facing labels, placeholders, accessibility text, and messages when the
  application uses i18n → **localization**.
- Error propagation, reporting, retry, and recovery boundaries →
  **error-handling**.
- Error, success, warning, fallback, and recovery presentation →
  **user-feedback**.
- Structured diagnostics and transports → **logging**.
- Lint, formatting, typecheck, and build verification → **code-quality**.
