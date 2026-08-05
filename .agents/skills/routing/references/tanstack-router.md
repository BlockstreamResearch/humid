# TanStack Router Patterns

Use these examples only when the project uses TanStack Router. The directory and
ownership rules remain applicable with other routers, but their APIs will differ.

## Contents

- Root and top-level branches
- Pathless guarded branches
- Recursive route layouts
- Direct subpage layouts and landing redirects
- Typed leaf state
- Recursive composition
- Shared search contracts
- Routed Storybook and tests

## Root And Top-Level Branches

Keep the root route, router creation, and branch assembly at `src/routes/`:

```tsx
// routes/__root.tsx
export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

// routes/router.tsx
const routeTree = rootRoute.addChildren([appTree, authTree, catchAllRoute])

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

The exact router options are project decisions. For example, a desktop
application loaded from a file protocol may need hash history, while a hosted
web application normally uses browser history. Copy the boundary, not another
project's platform choice.

## Pathless Guarded Branch

An authenticated application branch may be pathless:

```tsx
// routes/app/route.tsx
export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: requireAuthenticated,
  component: lazyRouteComponent(() => import('./index')),
})

export const appIndexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/Home')),
})
```

```tsx
// routes/app/index.tsx
export default function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
```

The `app` id participates in internal route identity but not in the visible URL.
Do not assume the route id of `/projects/$projectId` is equal to that visible
path when it descends from the pathless branch.

## Recursive Route Layouts

Give `/projects` a layout route when both its list and selected item are child
routes:

```tsx
// routes/app/pages/Projects/route.tsx
export const projectsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/projects',
  component: lazyRouteComponent(() => import('./index')),
})

// routes/app/pages/Projects/pages/List/route.tsx
export const Route = createRoute({
  getParentRoute: () => projectsRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./index')),
})

// routes/app/pages/Projects/pages/Item/route.tsx
export const projectItemRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectId',
  component: lazyRouteComponent(() => import('./index')),
})

export const projectItemIndexRoute = createRoute({
  getParentRoute: () => projectItemRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/projects/$projectId/overview',
      params,
    })
  },
})
```

```tsx
// routes/app/pages/Projects/index.tsx
export default function ProjectsLayout() {
  return <Outlet />
}

// routes/app/pages/Projects/pages/Item/index.tsx
import { projectItemRoute } from './route'

export default function ProjectLayout() {
  const { projectId } = projectItemRoute.useParams()

  return (
    <ProjectProvider projectId={projectId}>
      <Outlet />
    </ProjectProvider>
  )
}
```

`Projects` owns the `/projects` segment and shared project-area layout. `List`
is its index child. `Item` owns `$projectId` and becomes another layout because
it has `Overview` and `Workspace` children. If `Item` has no child pages, omit
its `route.tree.ts` and `pages/`; its `index.tsx` is then the leaf screen.

An item index may render `Overview` at path `/`, or redirect
`/projects/$projectId` to an explicit `overview` child. Choose one canonical URL
and define that index behavior in the item route boundary.

## Direct Subpage Layouts And Landing Redirects

Omit collection/item layers when the route is an ordinary page with direct
subpages:

```tsx
// routes/app/pages/Project/route.tsx
export const projectRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/project',
  component: lazyRouteComponent(() => import('./index')),
})

export const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('./index'),
    'ProjectIndexForwarder',
  ),
})
```

```tsx
// routes/app/pages/Project/index.tsx
export default function ProjectLayout() {
  return <Outlet />
}

export function ProjectIndexForwarder() {
  const canOpenWorkspace = useCanOpenWorkspace()

  return (
    <Navigate
      replace
      to={canOpenWorkspace ? '/project/workspace' : '/project/overview'}
    />
  )
}
```

```tsx
// routes/app/pages/Project/route.tree.ts
import { Route as projectOverviewRoute } from './pages/Overview/route'
import { Route as projectSettingsRoute } from './pages/Settings/route'
import { Route as projectWorkspaceRoute } from './pages/Workspace/route'
import { projectIndexRoute, projectRoute } from './route'

export const projectTree = projectRoute.addChildren([
  projectIndexRoute,
  projectOverviewRoute,
  projectWorkspaceRoute,
  projectSettingsRoute,
])
```

The index route is mandatory when the layout route itself has no screen. The
destination is not prescribed: select an existing child from local business
rules. Use an inline redirect or route lifecycle function when the choice is
static or available before render. Use a named index-forwarder component when
the choice requires React state or hooks. In both cases, keep the redirect
explicit and keep `route.tree.ts` limited to composition.

## Typed Leaf State

Keep each leaf route object at module level and let its component import it:

```tsx
// routes/app/pages/Projects/pages/Item/pages/Overview/route.tsx
const searchSchema = z.object({
  tab: z.enum(['summary', 'history']).optional().catch('summary'),
})

export const Route = createRoute({
  getParentRoute: () => projectItemRoute,
  path: 'overview',
  validateSearch: searchSchema,
  component: lazyRouteComponent(() => import('./index')),
})
```

```tsx
// routes/app/pages/Projects/pages/Item/pages/Overview/index.tsx
import { Route } from './route'

export default function ProjectOverviewPage() {
  const { projectId } = Route.useParams()
  const { tab } = Route.useSearch()

  return <ProjectOverview projectId={projectId} tab={tab} />
}
```

Do not replace this with `getRouteApi('<guessed-id>')`,
`useParams({ from: '<guessed-id>' })`, or a cast. A pathless ancestor can make a
guessed id wrong at runtime even when weakened types let it compile.

`useSearch({ strict: false })` is acceptable only in route-agnostic shared code
such as a generic URL-filter hook. It trades route-specific guarantees for
portability.

## Recursive Composition

A route declaration imports its concrete parent. A tree module imports children:

```tsx
// routes/app/pages/Projects/pages/Item/route.tree.ts
import { Route as overviewRoute } from './pages/Overview/route'
import { Route as workspaceRoute } from './pages/Workspace/route'
import { projectItemIndexRoute, projectItemRoute } from './route'

export const projectItemTree = projectItemRoute.addChildren([
  projectItemIndexRoute,
  overviewRoute,
  workspaceRoute,
])
```

```tsx
// routes/app/pages/Projects/route.tree.ts
import { projectItemTree } from './pages/Item/route.tree'
import { Route as projectListRoute } from './pages/List/route'
import { projectsRoute } from './route'

export const projectsTree = projectsRoute.addChildren([
  projectListRoute,
  projectItemTree,
])
```

For an organizational group with no route of its own, export the leaves as a
collection and spread them into the real parent:

```tsx
// routes/auth/pages/PasswordRecovery/route.tree.ts
export const passwordRecoveryRoutes = [
  requestResetRoute,
  resetPasswordRoute,
]

// routes/auth/route.tree.ts
export const authTree = authRoute.addChildren([
  signInRoute,
  ...passwordRecoveryRoutes,
])
```

Do not annotate these values as `AnyRoute[]`. Generic widening erases the route
tree information that powers typed ids, params, search, links, and navigation.
Let inference preserve the concrete tuple/array types.

Avoid generic factories such as
`createProjectRoutes<TParentRoute extends AnyRoute>(parent)`. They obscure the
real parent and make route identity easier to widen accidentally. Import the
concrete parent route instead.

## Shared Search Contracts

A search schema belongs to the route that reads it. If two sibling routes share
the same external query contract, place it in a sibling module:

```text
routes/auth/
├── search-schema.ts
└── pages/
    ├── AcceptInvite/route.tsx
    └── SignUp/route.tsx
```

Both leaves import the schema. The parent `route.tsx` does not import from its
children, so the route graph stays acyclic.

Validate search values from external URLs and deep links as untrusted input.
Choose strict, coercing, defaulting, or catch behavior according to the actual
contract; do not silently normalize values merely because another project did.

## Routed Storybook And Tests

`Route.useParams()` and `Route.useSearch()` resolve against the active match's
effective id. When the production page is below `id: 'app'`, a flat test route
with only the visible path does not provide the same match.

Create a minimal parallel chain:

```text
test root
└── pathless layout (id: app)
    └── leaf (same visible full path)
```

The route objects need not be identical; the effective route-id chain must
match. Render shared application chrome around the routed outlet as test/story
shell content. This preserves production page code and its typed hooks.
