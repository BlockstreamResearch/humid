---
name: routing
description: Use whenever work adds, changes, moves, debugs, or reviews application routes, route or page directories, URL paths, path or search params, navigation, redirects, layouts, outlets, guards, loaders, route-tree composition, router context or history, deep-link mapping, not-found behavior, or routed Storybook/test harnesses. Also use when deciding where a route or page belongs, even if the requested change is described only as a file move or a new screen.
---

# Routing

Model application navigation as one explicit, typed tree. Keep URL contracts,
route declarations, page components, and tree composition separate enough that
each has one owner and the import graph stays acyclic.

## Inspect The Existing Router First

Before changing routes:

1. Find the router entrypoint, root route, top-level branches, guards, and
   not-found handling.
2. Trace the concrete parent chain of the affected page.
3. Inspect how the project validates params/search, loads route data, lazy-loads
   components, and constructs links.
4. Check platform constraints such as browser, hash, or memory history and any
   deep-link adapter.
5. Preserve a coherent local router convention unless this task explicitly
   corrects or migrates it.

Do not infer routing from directory names alone. The router definition is the
runtime source of truth.

## Keep The Route Tree At The Source Root

Prefer one `routes/` directory at the application source root:

```text
src/
├── api/
├── routes/
│   ├── __root.tsx
│   ├── router.tsx
│   ├── guards.ts
│   ├── app/
│   ├── auth/
│   └── local-auth/
└── ui/
```

Do not nest this root under an application branch and produce shapes such as
`app/routes/app`. `routes/app`, `routes/auth`, and `routes/local-auth` are clear
siblings in one navigation tree.

These directories represent routing scopes, not necessarily literal URL
segments. For example, `routes/app` may be a pathless authenticated layout with
an internal id, while `routes/auth` may own the real `/auth` segment. Choose
branch names for the boundary they own; define the URL explicitly in the route.

If the framework mandates filesystem routing, adapt the filenames it requires
while preserving the ownership and composition rules in this skill.

## Treat URLs As Resource Contracts

- Use stable, resourceful paths: `/projects` and `/projects/$projectId`.
- Put resource identity in path params.
- Put filters, sorting, tabs, pagination, and view options in search params.
- Keep transient component state outside the URL only when it has no navigation,
  sharing, refresh, or history meaning.
- Treat import/export formats and persisted files as data contracts, not routes.
- Define redirects deliberately; do not use them to conceal an incoherent tree.

A page directory mirrors ownership in the route tree, but it does not create a
route by filesystem magic unless the selected router explicitly works that way.

## Use Three Deliberate Directory Shapes

### Layout or guard branch

Use a route-owning branch when descendants share a layout, guard, or URL segment:

```text
routes/app/pages/Projects/
├── index.tsx                      # ProjectsLayout with Outlet
├── route.tsx                      # /projects
├── route.tree.ts                  # List route + Item subtree
├── components/                    # shared by project routes
└── pages/
    ├── List/
    │   ├── index.tsx              # project list page
    │   └── route.tsx              # /projects
    └── Item/
        ├── index.tsx              # ProjectLayout with Outlet
        ├── route.tsx              # /projects/$projectId
        ├── route.tree.ts          # index redirect + item subpages
        ├── components/            # shared by one project's subpages
        └── pages/
            ├── Overview/
            │   ├── index.tsx
            │   └── route.tsx      # /projects/$projectId/overview
            └── Workspace/
                ├── index.tsx
                └── route.tsx      # /projects/$projectId/workspace
```

`Projects/index.tsx` is a layout because `List` and `Item` are its route
children. `Item/index.tsx` repeats the same role one level deeper because
`Overview` and `Workspace` are its children. The pattern is recursive: any leaf
may become a layout boundary when it gains real child pages.

Use contextual page names inside an established owner. `Projects/pages/Item`
means the selected project route; keep `ProjectItem` for a list row/card
component and `projectId` for the route parameter. Name rendered components by
their UI role, such as `ProjectsLayout`, `ProjectListPage`, `ProjectLayout`, and
`ProjectOverviewPage`.

### Page with direct subpages

When a page is not a resource collection and has no selected-id level, omit the
artificial `List` and `Item` layers:

```text
routes/app/pages/Project/
├── index.tsx                  # ProjectLayout with Outlet
├── route.tsx                  # /project + explicit index route
├── route.tree.ts
└── pages/
    ├── Overview/
    │   ├── index.tsx
    │   └── route.tsx          # /project/overview
    ├── Workspace/
    │   ├── index.tsx
    │   └── route.tsx          # /project/workspace
    └── Settings/
        ├── index.tsx
        └── route.tsx          # /project/settings
```

Define what happens at `/project` explicitly. It may redirect to `Overview`,
`Workspace`, `Settings`, or another existing child, but there is no universal
default: choose the destination at this boundary from the product's business
logic. Never infer it from child order or silently treat the first registered
route as the default.

Keep the redirect local and visible:

- use an owned index route declaration when the decision is available from
  router context, a guard, a loader, or static product policy;
- render a named index-forwarder component when the decision requires
  render-time state or hooks;
- let `route.tree.ts` register that index route with the subpages, but keep the
  redirect decision out of tree-composition code;
- keep the ordinary layout component focused on shared UI and its `Outlet`.

### Terminal page without subpages

Treat `Overview`, `Workspace`, and `Settings` in the preceding example as leaf
pages: each is a terminal route with no child routes, `Outlet`, or
`route.tree.ts`. A leaf page normally owns:

- `index.tsx`: the page component only;
- `route.tsx`: the route declaration, schema, guard/loader when leaf-specific,
  and lazy component binding.

Private page components, hooks, and other implementation go inward under the
same page boundary according to **file-structure**. When a leaf gains real
subpages, promote it to the layout-branch shape and apply the same structure
recursively.

For example, keep components used only by `Overview` inside that page:

```text
Overview/
├── index.tsx
├── route.tsx
└── components/
    ├── ProjectSummary.tsx
    └── ActivityPanel/
        ├── index.tsx
        └── components/
            └── ActivityRow.tsx
```

`routing` owns the `Overview` page boundary. **file-structure** owns everything
inside it: place each component, hook, schema, or other implementation at the
narrowest boundary containing all of its consumers, and repeat that rule
recursively.

### Structural group without a route

When sibling pages need grouping but share no URL segment, guard, or layout, do
not invent a wrapper route:

```text
routes/auth/pages/PasswordRecovery/
├── route.tree.ts
└── pages/
    ├── RequestReset/
    │   ├── index.tsx
    │   └── route.tsx
    └── ResetPassword/
        ├── index.tsx
        └── route.tsx
```

Its `route.tree.ts` exports the sibling route collection for the nearest real
parent to compose. A directory is not entitled to a route merely because it
exists.

## Separate Declaration, Rendering, And Composition

Give each routing file one job:

- `route.tsx` declares only routes owned by that boundary. It imports its
  concrete parent and lazy-loads the page/layout component. It never imports or
  assembles descendant routes.
- `index.tsx` renders only the page or layout. A layout renders an `Outlet`; a
  leaf renders its screen. It does not assemble the route tree.
- `route.tree.ts` imports sibling/descendant route objects and composes them with
  their parent. It contains no screen UI, schemas, data lookup, or route-specific
  branching.
- `router.tsx` attaches top-level branch trees to the root and owns global router
  configuration.

This keeps the structural import graph flowing child declaration -> concrete
parent declaration, then composition -> children. Parent declarations never
import their children, so page components can safely import their own route
object for typed hooks.

Do not use barrels to aggregate routes. Import the exact `route` or `route.tree`
module so parentage and ownership remain visible.

## Assemble Recursively

Compose each subtree at the narrowest boundary that owns all of its children,
then pass one tree or a small route collection upward:

```text
router.tsx
└── app/route.tree.ts
    └── Projects/route.tree.ts
        ├── List/route.tsx
        └── Item/route.tree.ts
            ├── route.tsx             # optional item index redirect
            ├── Overview/route.tsx
            └── Workspace/route.tsx
```

Do not centralize every leaf in `router.tsx`. Do not declare child paths in a
parent component. Do not widen typed route collections to a generic route type
merely to make composition compile; preserve inferred route identities.

Routing-specific placement is authoritative over **file-structure** for route
branches, pages, declarations, and tree assembly. Apply **file-structure**
recursively inside the selected page or layout boundary.

## Put Behavior At The Narrowest Route Boundary

- Put a guard on the nearest ancestor whose entire subtree shares the rule.
- Put a loader on the route that owns the navigation dependency. Reuse the
  project's API query definitions and cache instead of building a second fetch
  or cache policy inside the loader.
- Put a search schema beside the leaf that reads it.
- When sibling leaves consume the same search contract, put it in a small module
  at their nearest shared boundary; do not force it into a parent declaration
  that would create a parent-child import cycle.
- Keep global router context and history selection at the router root.
- Treat platform history choices as adapters: browser history is not universally
  correct, and hash history is not universally correct.

Reuse the project's established error, auth, preload, cache, and redirect flows.
Do not invent a parallel routing policy inside one page.

## Read Route State Through The Route Contract

Prefer the route object's typed params/search hooks when the router supports
them. Avoid handwritten route ids, string casts, and generic APIs that discard
which route owns a value.

Pathless layouts can contribute internal ids without contributing URL segments.
Therefore an internal route id may differ from the visible path. Code and routed
test harnesses must preserve that distinction.

Use a loose/non-strict route-state read only for genuinely route-agnostic shared
behavior, and accept the reduced per-route typing intentionally.

## Navigate Semantically

- Use the router's `Link` for user-initiated navigation so accessibility,
  history, preloading, and modifier-click behavior remain intact.
- Use programmatic navigation for event outcomes and side-effect redirects such
  as successful submission, authentication changes, or guard resolution.
- Construct destinations with typed `to`, `params`, and `search` values rather
  than concatenating URL strings.
- Keep sidebar/header navigation separate from route registration. A valid route
  does not automatically belong in primary navigation.
- Map platform deep links into the same route contracts. Keep transport and
  operating-system event handling in the platform integration boundary instead
  of creating a second navigation tree.

## Preserve Real Routes In Tests And Stories

Pages that read route-owned params or search values need an active match with
the same effective route id and parent chain. A flat memory router around the
component is insufficient when pathless ancestors contribute ids.

Build the smallest parallel route chain that preserves the production ids, then
provide page chrome as a shell. Do not weaken production route typing or add
fallback params merely to make a story render.

## Verify The Contract

After a routing change:

1. Search for stale paths, route ids, imports, links, redirects, deep-link
   mappings, and navigation entries.
2. Typecheck the registered route tree without generic widening or casts.
3. Exercise direct entry, refresh, back/forward history, links, and
   programmatic redirects.
4. Verify valid and invalid path/search params, guards, loaders, and not-found
   behavior.
5. Run affected routed tests and stories, then the repository's required
   lint/tests/build.

Read [references/tanstack-router.md](references/tanstack-router.md) when the
project uses TanStack Router, when pathless layout ids are involved, or when a
routed Storybook/test harness must reproduce production route identity.

## Skill Boundaries

- Route loader queries and cache ownership → **api-integration**.
- Page and layout component implementation → **components**.
- Non-routing placement inside a page boundary → **file-structure**.
- Native deep-link transport and event handling → **native-integration** or
  the project's platform integration skill.
