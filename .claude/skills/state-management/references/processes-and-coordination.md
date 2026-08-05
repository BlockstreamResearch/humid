# Process Stores And Coordination

Use this reference for long-running client processes, cross-store workflows,
logout, and feature-level commands.

## Contents

- [Process Store](#process-store)
- [Runtime Handles](#runtime-handles)
- [Stale Work And Reattachment](#stale-work-and-reattachment)
- [Cross-Store Commands](#cross-store-commands)
- [Hook Adapters](#hook-adapters)

## Process Store

Use a process store when work must continue independently of one component:

```ts
type ExportProcessState = {
  status: "idle" | "running" | "completed" | "failed"
  progress: number
  error: unknown
}

type ExportProcessActions = {
  start: (input: ExportInput) => Promise<void>
  cancel: () => void
  reset: () => void
}

type ExportProcessStore = ExportProcessState & ExportProcessActions

const initialState: ExportProcessState = {
  status: "idle",
  progress: 0,
  error: null,
}

let activeController: AbortController | null = null

const useExportProcessStore = create<ExportProcessStore>()((set, get) => ({
  ...initialState,

  start: async (input) => {
    if (get().status === "running") return

    const controller = new AbortController()
    activeController = controller
    set({ status: "running", progress: 0, error: null })

    try {
      await exportClient.run(input, {
        signal: controller.signal,
        onProgress: (progress) => set({ progress }),
      })

      if (activeController !== controller || controller.signal.aborted) return

      set({ status: "completed", progress: 1 })
    } catch (error) {
      if (activeController !== controller || controller.signal.aborted) return

      set({ status: "failed", error })
    } finally {
      if (activeController === controller) activeController = null
    }
  },

  cancel: () => {
    activeController?.abort()
    activeController = null
    set(initialState)
  },

  reset: () => {
    if (get().status === "running") return
    set(initialState)
  },
}))

export const exportProcessStore = {
  useStore: useExportProcessStore,
}
```

The identity check prevents a late completion from an older operation from
overwriting a newer run.

## Runtime Handles

Keep runtime handles outside observable state unless consumers genuinely need
them:

- `AbortController`;
- sockets and streams;
- timers;
- imperative clients;
- native resource handles;
- promises and async iterators.

They are implementation details, are usually non-serializable, and must never
enter persisted state.

If the process must survive a renderer restart, persist a deliberate resume
record through the process's storage capability:

```ts
type ResumeRecord = {
  runId: string
  resourceId: string
  startedAt: string
}
```

Do not persist the controller, stream, client, or accumulated implementation
object graph.

## Stale Work And Reattachment

Long-running stores must define:

- what happens when `start` is called twice;
- how cancellation settles state;
- whether a finished result may update a newer run;
- whether restart means reattach, resume, reconcile, or fail;
- who owns any persisted resume record;
- when retry is allowed.

Prefer explicit status or transition models over independent booleans:

```ts
type ProcessStatus =
  | { type: "idle" }
  | { type: "running"; runId: string }
  | { type: "resumable"; runId: string }
  | { type: "completed" }
  | { type: "failed"; error: unknown }
```

Use a reducer or state machine when valid transitions are no longer obvious
from a small store.

## Cross-Store Commands

A store action owns only its own state:

```ts
const useSessionStore = create(
  combine(sessionInitialState, (set) => ({
    clear: () => set(sessionInitialState),
  })),
)
```

Do not import peer stores into that state creator. Coordinate them in a
feature-level command:

```ts
export async function logout() {
  await queryClient.cancelQueries()
  queryClient.clear()

  sessionStore.useStore.getState().clear()
  userStore.useStore.getState().clear()
  notificationsStore.useStore.getState().clear()

  await sessionVault.clearSession()
}
```

The explicit list is intentional. Avoid a generic reset registry until several
real workflows prove that it improves ownership rather than hiding it.

The command may live in the session capability and appear in its namespace:

```ts
export const sessionStore = {
  useStore: useSessionStore,
  logout,
}
```

This is allowed because the namespace is a feature facade. `logout` is not
pretending to be an action inside the Zustand state creator.

If several stores must always change atomically, reconsider their boundary.
They may be slices of one capability rather than independent stores.

## Hook Adapters

Wrap a plain command when React needs mutation lifecycle:

```ts
function useLogoutMutation() {
  return useMutation({
    mutationKey: ["session", "logout"],
    mutationFn: logout,
  })
}

export const sessionStore = {
  useStore: useSessionStore,
  logout,
  useLogoutMutation,
}
```

Keep caller-specific navigation and feedback at the caller:

```ts
const logoutMutation = sessionStore.useLogoutMutation()

const handleLogout = async () => {
  await logoutMutation.mutateAsync()
  await router.invalidate()
}
```

A feature-level hook may compose multiple stores reactively:

```ts
function useCanStartExport() {
  const projectId = projectStore.useStore((state) => state.selectedId)
  const processStatus = exportProcessStore.useStore(
    (state) => state.status,
  )

  return projectId !== null && processStatus === "idle"
}
```

This is allowed. The state creators remain independent; the hook owns the
composition.
