# State Ownership And Scope

Use this reference when deciding whether state belongs in Zustand and whether a
store should be a module singleton or a scoped instance.

## Contents

- [Ownership Matrix](#ownership-matrix)
- [Do Not Duplicate Query State](#do-not-duplicate-query-state)
- [Singleton Stores](#singleton-stores)
- [Scoped Store Factories](#scoped-store-factories)
- [Context Without Zustand](#context-without-zustand)

## Ownership Matrix

| State | Default owner |
| --- | --- |
| Refetchable backend or external data | Query layer |
| Resource identity | Route path params |
| Filters, sorting, pagination, tabs, view options | Route search params |
| Form values, validation, dirty and submit state | Form library |
| One component | React state or reducer |
| One composable subtree | React context |
| Shared client-owned state | Zustand |
| Long-running client process | Process store or dedicated client capability |
| Restart-surviving subset | Explicit persistence boundary |

These are ownership defaults, not library prohibitions. Change one only when the
value has a different real authority, and document that authority.

## Do Not Duplicate Query State

Do not copy query data into a store:

```ts
const query = useQuery(projectQueryOptions(projectId))
const setProject = projectStore.useStore((state) => state.setProject)

useEffect(() => {
  if (query.data) setProject(query.data)
}, [query.data, setProject])
```

Read the query directly. Keep only genuine client state in Zustand:

```ts
const query = useQuery(projectQueryOptions(projectId))
const selectedPanel = projectWorkspaceStore.useStore(
  (state) => state.selectedPanel,
)
```

An offline editor, local draft authority, or client process may intentionally
own a snapshot. Make that ownership explicit; do not create it merely to avoid
reading the query cache.

## Singleton Stores

A module-level store is appropriate for a true singleton:

```ts
const usePreferencesStore = create(
  combine(
    { theme: "system" as ThemePreference },
    (set) => ({
      setTheme: (theme: ThemePreference) => set({ theme }),
    }),
  ),
)

export const preferencesStore = {
  useStore: usePreferencesStore,
}
```

Typical singleton capabilities include application preferences, one active
session, and one application-wide background queue.

Colocating this file with a page narrows its ownership but does not change its
runtime lifetime. It remains a module singleton.

## Scoped Store Factories

Use a factory when each mounted owner needs an independent instance:

```tsx
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useState,
} from "react"
import { createStore, useStore } from "zustand"

type ProjectWorkspaceStore = {
  projectId: string
  selectedNodeId: string | null
  selectNode: (nodeId: string | null) => void
}

const createProjectWorkspaceStore = (projectId: string) =>
  createStore<ProjectWorkspaceStore>()((set) => ({
    projectId,
    selectedNodeId: null,
    selectNode: (selectedNodeId) => set({ selectedNodeId }),
  }))

type ProjectWorkspaceStoreApi = ReturnType<
  typeof createProjectWorkspaceStore
>

const ProjectWorkspaceStoreContext =
  createContext<ProjectWorkspaceStoreApi | null>(null)

export function ProjectWorkspaceStoreProvider({
  projectId,
  children,
}: PropsWithChildren<{ projectId: string }>) {
  const [store] = useState(() => createProjectWorkspaceStore(projectId))

  return (
    <ProjectWorkspaceStoreContext.Provider value={store}>
      {children}
    </ProjectWorkspaceStoreContext.Provider>
  )
}

export function useProjectWorkspaceStore<T>(
  selector: (state: ProjectWorkspaceStore) => T,
) {
  const store = useContext(ProjectWorkspaceStoreContext)

  if (!store) {
    throw new Error(
      "useProjectWorkspaceStore must be used within ProjectWorkspaceStoreProvider",
    )
  }

  return useStore(store, selector)
}
```

Create the store once for that provider instance. Do not recreate it on every
render. Key or remount the owner deliberately when its identity changes.

Use the same pattern for SSR request isolation. Never share a mutable
module-level store between server requests.

## Context Without Zustand

Do not add Zustand merely because several compound components share state:

```tsx
const SelectionContext = createContext<SelectionContextValue | null>(null)
```

Prefer plain context when:

- all consumers live under one obvious provider;
- no imperative access outside React is needed;
- update frequency and provider scope are controlled;
- the state should disappear with that subtree.

Use a scoped Zustand store when selector-based subscriptions, imperative access,
or a substantial state transition model materially improves that subtree.
