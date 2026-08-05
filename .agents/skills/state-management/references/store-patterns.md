# Store Patterns

Use this reference for ordinary store definitions, namespaces, selectors, and
reset behavior.

## Contents

- [Simple Inferred Store](#simple-inferred-store)
- [Explicit Store Contract](#explicit-store-contract)
- [Namespace And Selectors](#namespace-and-selectors)
- [Immutable Updates](#immutable-updates)
- [Reset](#reset)

## Simple Inferred Store

Use `combine` when inference keeps a small store clearer:

```ts
import { create } from "zustand"
import { combine } from "zustand/middleware"

const initialState = {
  selectedId: null as string | null,
  expandedIds: [] as string[],
}

const useNavigationStore = create(
  combine(initialState, (set) => ({
    select: (selectedId: string | null) => set({ selectedId }),
    expand: (id: string) =>
      set((state) => ({
        expandedIds: state.expandedIds.includes(id)
          ? state.expandedIds
          : [...state.expandedIds, id],
      })),
    reset: () => set({ ...initialState, expandedIds: [] }),
  })),
)

export const navigationStore = {
  useStore: useNavigationStore,
}
```

Do not use state replacement with an inferred `combine` store. Replacing only
the initial-state shape can remove its actions.

## Explicit Store Contract

Use an explicit contract when it documents a factory, async lifecycle, public
package surface, or complex store better than inference:

```ts
type UploadState = {
  status: "idle" | "uploading" | "completed" | "failed"
  progress: number
  error: unknown
}

type UploadActions = {
  setProgress: (progress: number) => void
  fail: (error: unknown) => void
  complete: () => void
  reset: () => void
}

type UploadStore = UploadState & UploadActions

const initialUploadState: UploadState = {
  status: "idle",
  progress: 0,
  error: null,
}

const useUploadStore = create<UploadStore>()((set) => ({
  ...initialUploadState,
  setProgress: (progress) => set({ status: "uploading", progress }),
  fail: (error) => set({ status: "failed", error }),
  complete: () => set({ status: "completed", progress: 1 }),
  reset: () => set(initialUploadState),
}))
```

Keep useful types beside the capability. Do not move them into a generic
`types.ts` file.

## Namespace And Selectors

Expose one discoverable namespace:

```ts
const useStore = create(/* ... */)

export const workspaceStore = {
  useStore,
}
```

Select ordinary fields directly:

```tsx
const selectedId = workspaceStore.useStore((state) => state.selectedId)
const select = workspaceStore.useStore((state) => state.select)
```

Select several fields with shallow equality:

```tsx
const { status, progress } = uploadStore.useStore(
  useShallow((state) => ({
    status: state.status,
    progress: state.progress,
  })),
)
```

Do not subscribe to the whole store:

```tsx
// Avoid: rerenders for every store change.
const store = uploadStore.useStore()
```

Create a named hook when it owns meaningful logic:

```ts
const useCanCancelUpload = () =>
  uploadStore.useStore(
    (state) => state.status === "uploading" && state.progress < 1,
  )
```

A named hook may compose stores without creating a dependency between their
state creators:

```ts
const useCanOpenWorkspace = () => {
  const isAuthenticated = sessionStore.useStore(
    (state) => state.status === "authenticated",
  )
  const projectId = projectStore.useStore((state) => state.selectedId)

  return isAuthenticated && projectId !== null
}
```

Outside React, prefer a public command or use `getState()`:

```ts
workspaceStore.useStore.getState().select(projectId)
```

## Immutable Updates

Return new references:

```ts
set((state) => ({
  items: [...state.items, item],
}))
```

Create new `Map` and `Set` instances:

```ts
set((state) => ({
  selectedIds: new Set(state.selectedIds).add(id),
}))
```

Never mutate and return the existing reference:

```ts
// Wrong: subscribers may not observe a change.
set((state) => {
  state.selectedIds.add(id)
  return { selectedIds: state.selectedIds }
})
```

## Reset

Model reset as an owned action:

```ts
const createInitialState = (): NavigationState => ({
  selectedId: null,
  expandedIds: new Set(),
})

const useNavigationStore = create<NavigationState & NavigationActions>()(
  (set) => ({
    ...createInitialState(),
    reset: () => set(createInitialState()),
  }),
)
```

Use a factory when initial state contains mutable collections so reset never
reuses a previously mutated reference.

Direct `setState()` is acceptable for tests and stories:

```ts
beforeEach(() => {
  useNavigationStore.setState(createInitialState())
})
```

Do not replace state with a state-only object because that removes actions.
Reset through the owned action when it represents the public test contract.
