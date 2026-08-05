---
name: state-management
description: Use whenever work creates, changes, reviews, debugs, or consumes shared client state, especially Zustand stores, selectors, actions, store namespaces, feature or page stores, store factories and providers, persisted state, migrations, hydration guards, secure storage, authentication state, cross-store workflows, resets, or long-running client processes. Trigger when deciding whether state belongs in Zustand, TanStack Query, router params or search, React Hook Form, React state, or context, even if the request does not name a state-management library.
---

# State Management

Use Zustand for **shared client-owned state**, not as the default owner of every
value. Choose the owner and lifetime before choosing store syntax.

Adapt imports and storage implementations to the repository. Preserve these
ownership and security boundaries even when the local Zustand idiom differs.

## Decide The Owner First

Keep each kind of state with its real authority:

- Refetchable external or backend data belongs to the query layer. Do not copy
  query results into Zustand through `useEffect`.
- Resource identity belongs in path params. Filters, sorting, pagination, tabs,
  and other navigable state belong in search params.
- Form fields, validation, dirty state, and submission state belong to the form.
- State used by one component belongs in React state.
- State shared only by one composable subtree usually belongs in context.
- Shared client state, imperative client state, state that crosses unrelated
  React branches, and client processes that outlive one component may belong in
  Zustand.

Persistence is a separate decision. A value does not belong in Zustand merely
because it must survive a restart, and a Zustand value need not be persisted.

Read `references/ownership-and-scope.md` when choosing between these owners or
between a singleton and a scoped store.

## Build Bounded Capability Stores

Create a store around one cohesive client capability. Do not merge unrelated
state merely to reduce the number of stores, and do not split one atomic
capability into a store per field.

A module-level `create(...)` is a singleton regardless of where its file lives.
Use it only when the capability truly has one application-wide or
feature-wide lifetime. Use a `createStore` factory with context when state:

- belongs to one mounted page, editor, or component instance;
- is initialized from props;
- must reset on unmount;
- may have multiple simultaneous instances;
- must be isolated per SSR request, test, or story.

Locate the store at the narrowest boundary containing all of its consumers.
Follow **file-structure** for the concrete directory shape.

## Choose The Store Definition Deliberately

Prefer `create(combine(initialState, actions))` for a small store whose inferred
shape stays obvious. Use an explicit store type when it clarifies a factory,
public contract, complex async lifecycle, middleware stack, or process manager.
Never force `combine` merely to avoid writing a useful type.

Keep ordinary state transitions beside their state. An action defined by one
store may read and mutate that store only; it must not import another store.
Keep a reusable initial state and provide an explicit reset when the capability
has a reset lifecycle.

Do not store derived values that can be computed cheaply from current state.
Compute them in a selector or render instead of synchronizing them through an
effect.

See `references/store-patterns.md` for simple, explicit, scoped, selector, and
reset examples.

## Expose A Discoverable Namespace

Expose the store through one capability namespace:

```ts
export const preferencesStore = {
  useStore: usePreferencesStore,
}
```

Selecting an ordinary field directly is the default:

```ts
const theme = preferencesStore.useStore((state) => state.theme)
```

Do not generate one wrapper hook per field. Add a named hook only when it
expresses a meaningful derived concept, composes several stores, centralizes
equality behavior, or deliberately hides an unstable internal representation.

A namespace may also expose feature-level commands and hooks. Treat the
namespace as the public facade of the capability, not as a claim that every
member is a literal Zustand action.

## Subscribe Narrowly

- Select the narrowest field or derived primitive the consumer needs.
- Use the repository's shallow-equality helper, such as `useShallow`, when a
  selector returns an object, array, or other shallow-comparable collection.
- Avoid `useStore()` without a selector; it subscribes to every change.
- Never mutate objects, arrays, `Map`, or `Set` in place. Return a new reference.
- Inside React, subscribe through the hook. Outside React, use `getState()` or a
  public command.
- Use direct `setState()` primarily for tests, stories, framework integration,
  and controlled setup. Production mutations go through owned actions or
  commands.

## Keep Orchestration Outside Store Actions

Feature-level commands and hooks may coordinate several stores, the query
client, storage capabilities, and transports when the workflow clearly belongs
to that feature. Logout is a typical example.

Prefer a plain command for orchestration that does not require React, then wrap
it in a hook or mutation when the UI needs pending, error, or success state.
Keep navigation, toasts, and other caller-specific UX at the caller unless they
are an invariant of the workflow.

Derived hooks may subscribe to multiple stores. This is composition, not a
store-to-store dependency.

Read `references/processes-and-coordination.md` for command, logout, and
cross-store examples.

## Persist Only An Explicit Contract

Do not add `persist` by habit. For every persisted store:

- give the storage key one stable owner;
- whitelist the minimal persisted shape with `partialize`;
- exclude actions, hydration state, in-flight state, caches, runtime handles,
  access tokens, and other transient values;
- establish a version before the persisted contract ships;
- validate persisted `unknown` input rather than trusting a cast;
- define migrations for breaking shape changes;
- define a custom merge when nested defaults require more than Zustand's
  shallow merge;
- use the repository's storage adapter rather than reading or parsing
  Zustand's serialized value elsewhere.

Choose failure behavior by data class. A disposable cache may reset explicitly.
A decrypt, corruption, or migration failure for credentials, user-created
offline data, or another critical store must surface as an error and must not
silently become “no saved state.”

Do not rely on `await set(...)` as a portable persistence-completion contract.
When the next operation requires durable completion, put that guarantee behind
a dedicated, tested persistence capability.

## Model Hydration As A Prerequisite

Synchronous and asynchronous adapters hydrate differently. Do not add a
hydration gate when no consumer depends on it, and do not assume all persisted
stores hydrate asynchronously.

For critical asynchronous state, model at least:

```ts
type HydrationState =
  | { status: "hydrating"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: unknown }
```

Use ordered guards when application regions depend on persisted state:

```tsx
<SecureStoresGuard>
  <SessionGuard>
    <AccessGuard>
      <CriticalDataGuard>{children}</CriticalDataGuard>
    </AccessGuard>
  </SessionGuard>
</SecureStoresGuard>
```

Each guard owns one prerequisite and either renders its loading, error,
blocked, or retry state or passes `children`. Outer guards establish the
invariants assumed by inner guards. Never interpret pre-hydration defaults as
logout, missing credentials, or permission denial.

Read `references/persistence-and-security.md` before changing persistence,
hydration, authentication storage, encryption, or guards.

## Keep Secrets Out Of Zustand When Possible

Secure storage protects data at rest; it does not protect plaintext after a
secret is returned to renderer JavaScript.

- Keep reactive session metadata in Zustand: status, account identity,
  expiration, lock state, and hydration state.
- Keep a short-lived access token in private auth-client memory only when the
  renderer must perform authenticated requests. It rarely needs reactivity.
- Keep refresh tokens in an OS-backed native vault or an HttpOnly backend
  session where the platform permits.
- Keep private keys non-exportable behind a native or platform capability.
  Expose operations such as `sign`, `decrypt`, or `refreshSession`, not
  `getSecret` or `getPrivateKey`.
- Never call an adapter `secure` when it is only `localStorage`, ordinary
  filesystem storage, or another unprotected backend.
- A storage read returns `null` only when data is genuinely absent. Decryption
  or key-access failure must remain an error.

If architecture forces a raw secret into JavaScript, keep it out of global
reactive state, persistence, devtools, logs, and long-lived strings. Limit it to
the narrowest operation and treat buffer clearing as best effort, not a
security guarantee.

Follow **native-integration** for capability and RPC boundaries and
**logging** for keeping secrets out of diagnostic records and
**error-handling** for safe incident context.

## Allow Explicit Process Stores

A Zustand store may manage a long-running client process when the process:

- outlives one component or route;
- needs imperative start, cancel, retry, resume, or reattach operations;
- publishes progress to unrelated consumers;
- has a client-owned lifecycle rather than query-owned server state.

Model explicit status transitions and reject duplicate or stale work. Keep
`AbortController`, streams, sockets, and other runtime handles outside
observable state when consumers do not need them. Never persist those handles;
persist only a deliberate resume record through its owning storage capability.

When transitions become complex, use an explicit reducer or state machine
inside the capability rather than hiding an implicit state machine in scattered
booleans.

Read `references/processes-and-coordination.md` before creating a process store.

## Verify The Boundary

Before finishing state-management work:

1. Confirm each value still has one owner.
2. Confirm URL, form, and query state were not duplicated into Zustand.
3. Confirm singleton versus scoped lifetime is intentional.
4. Inspect every React subscription for unnecessary breadth.
5. Exercise reset, logout, remount, and concurrent-operation behavior.
6. For persistence, test migration, corrupted input, missing data, hydration
   failure, retry, and durable-write ordering where relevant.
7. For secrets, verify what crosses into renderer memory and whether a narrower
   capability can keep it out.

## Related Skills

- **api-integration** owns external operations, server state, query identities,
  mutations, invalidation, and auth transport behavior.
- **routing** owns path and search state with navigation meaning.
- **forms** owns form values, validation, submission, and field errors.
- **components** owns React-local state, context, composition, and effect
  avoidance.
- **file-structure** owns the concrete placement of store files and private
  implementation.
- **native-integration** owns OS-backed storage, cryptography, privileged
  capabilities, and renderer bridges.
- **logging** owns diagnostic records and the rule that secrets never enter
  them.
- **error-handling** owns incident-reporting policy and safe reporting context.
