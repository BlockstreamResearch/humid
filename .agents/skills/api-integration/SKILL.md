---
name: api-integration
description: Use whenever client code integrates with any external data source or API, including REST, GraphQL, RPC, IPC or native bridges, SDKs, gateways, microservices, WebSockets, generated contracts, and mock or fixture data used to scaffold application data. Apply when creating or changing API clients, transport or auth middleware, api/modules boundaries, contract generation or inferred types, request functions, query keys, query or mutation registries, pagination, query balancing with TanStack Pacer, batching, cache updates or invalidation, and components or hooks that consume API data.
---

# API Integration

Treat `api/` as the client application's boundary with external sources. Keep
transport details, external contracts, server-state identities, and cache
effects behind that boundary so feature code consumes a stable, typed module
instead of speaking directly to a transport.

The architecture is independent of the transport:

```text
external contract authority
    -> generated or inferred contract
    -> typed source client
    -> source module operations
    -> key registry
    -> query and mutation registries
    -> application consumers
```

OpenAPI, GraphQL code generation, a schema registry, a typed SDK, and a native
RPC bridge are different ways to supply the first three links. They do not
change the remaining shape.

## Start by finding the real source

Before editing:

1. Identify every external source touched by the change.
2. Find the authoritative contract for each source.
3. Find how its client is constructed and where cross-cutting behavior lives.
4. Trace the existing key, query, mutation, and invalidation paths.
5. Check how generated artifacts are produced and validated.

Do not invent a second integration path because a call is small. Extend the
source module that already owns the contract and transport.

## Place integrations under `api/`

Prefer this application boundary:

```text
api/
  client.ts
  provider.tsx
  modules/
    auth/
    service-a/
    service-b/
```

- Put client-side integrations with external sources under `api/`.
- When the application has multiple sources, give each source its own
  `api/modules/<source>/` directory.
- A source may be a separately governed service, a gateway-backed service
  surface, a third-party SDK, or a native capability. The network address is
  not the boundary: multiple services behind one gateway remain separate
  modules when their contracts and ownership are separate.
- Name modules after the external source or contract authority, not after a
  screen, component, or user journey.
- Split a large source module internally by operation or resource when useful,
  but keep one public module surface.
- Keep source-neutral infrastructure such as the shared cache client and its
  provider at the `api/` root.

Feature components must not import generated transports, raw SDKs, RPC clients,
or wire contracts directly. They consume the source module.

## Derive types; do not curate DTOs

Use contract types in this order:

1. Types generated from the authoritative external contract.
2. Types inferred from runtime schemas or a typed registry.
3. Request and response types exposed by a typed SDK or RPC client.
4. Narrow aliases or projections derived from one of the above.
5. Hand-written boundary types only when no machine-readable or typed contract
   exists.

Never duplicate an external DTO by manually restating its fields. Regenerate or
re-infer it.

Do not create a hand-maintained `types.ts` dumping ground. A `types.ts` file
written by a generator is a generated artifact, not a dumping ground: mark it
as generated, never edit it manually, and make the generator its source of
truth. Genuine client-only models should be:

- inferred from a runtime schema when validation is required;
- colocated with the operation that owns them;
- named after their responsibility rather than placed in a generic type bag;
- kept outside the API contract when they are view, form, or component state.

An alias is useful when it creates a stable public name for an unreadable
generated lookup. An alias that merely duplicates another local alias is not.

## Keep mock data as scaffolding

Treat mock data as temporary display scaffolding, not as a half-built domain
layer. Keep mock-only data behind one obvious nearest boundary: prefer the
project's established API mocking or fixture boundary; otherwise colocate it
with the source module or consumer that owns it.

- Store literal display text and values directly in the fixture.
- Reuse real generated, inferred, SDK, or package contracts when the represented
  records already exist.
- Do not invent exported domain types, fake service methods, resolvers,
  registries, adapters, or parser-style utilities for functionality that does
  not exist.
- Do not normalize or transform static fixture data merely to imitate a future
  production integration.
- Remove or replace the mock boundary when the real source becomes available;
  do not let both become competing authorities.

## Make generation reproducible

When contract generation is available:

- keep the upstream contract or a deterministic contract-sync command;
- map one independently governed source to one module output;
- generate into a predictable, reviewable location;
- include a generated-file header;
- fail when required contract inputs are missing;
- detect stale outputs after sources are renamed or removed;
- expose one documented command that can be rerun locally and in CI;
- validate that regeneration leaves the worktree unchanged.

Do not edit generated output to make a consumer compile. Fix the authority,
generator, or adapter.

## Construct clients at the boundary

Put shared transport concerns in an API client factory or a source-specific
client:

- base URL or channel selection;
- authentication and refresh coordination;
- protocol-required request and response payload encoding;
- retry and timeout policy;
- transport-level logging;
- middleware or interceptors.

Create a dedicated client when a source needs different middleware, such as an
authentication endpoint that must not invoke its own refresh interceptor.

Do not put query keys, cache invalidation, navigation, toasts, or component
state in the transport client. The client moves typed messages; the source
module owns server-state semantics.

## Give every cached source a stable public module surface

For a TanStack Query integration, prefer this top-to-bottom order:

1. Intentional public aliases derived from the contract, if needed.
2. The typed source client.
3. Plain transport operations, when reuse or focused testing warrants them.
4. `<source>Keys`.
5. `<source>Queries`.
6. `<source>Mutations`.
7. Source-local helpers.

The registries are plain values and factories outside React. Components choose
`useQuery`, `useSuspenseQuery`, `useMutation`, prefetching, or route loading;
the API module supplies the canonical options.

If the repository uses another server-state library, preserve the same
separation: stable identities, reusable read definitions, reusable write
definitions, and explicit post-write cache effects.

## Build a hierarchical key registry

Export one key registry per source module.

- Start with an immutable `all` namespace key.
- Derive narrower keys by spreading their parent key.
- Include every argument that changes the response.
- Put stable labels before dynamic values.
- Keep key values serializable and deterministic.
- Use the same registry for queries, mutations, prefetching, cache writes, and
  invalidation.
- Design useful prefixes for broad invalidation, list invalidation, and exact
  entity invalidation.

There is no arbitrary maximum key depth. The hierarchy should describe cache
identity and invalidation boundaries, not satisfy a visual limit.

```ts
export const accountsKeys = {
  all: ["accounts"] as const,
  lists: () => [...accountsKeys.all, "list"] as const,
  list: (filters: AccountFilters) => [...accountsKeys.lists(), filters] as const,
  details: () => [...accountsKeys.all, "detail"] as const,
  detail: (id: string) => [...accountsKeys.details(), id] as const,
  mutations: () => [...accountsKeys.all, "mutation"] as const,
};
```

## Export query definitions as a registry

Query factories own the canonical relationship between a key and its fetch:

```ts
export const accountsQueries = {
  list: (filters: AccountFilters) =>
    queryOptions({
      queryKey: accountsKeys.list(filters),
      queryFn: () => listAccounts(filters),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: accountsKeys.detail(id),
      enabled: Boolean(id),
      queryFn: () => getAccount(id),
    }),
};
```

- Use `queryOptions` or the repository's equivalent so consumers share one
  definition.
- Gate a query when required identity is unavailable.
- Keep UI effects out of query functions.
- Return contract data or an intentional boundary normalization, not a
  component-shaped view model.
- For pagination, make the cursor or offset part of the query definition and
  implement a real exhaustion condition.

Plain transport functions are optional. Keep them when multiple query
definitions reuse an operation, non-React code calls it, or focused tests need
the transport boundary. Otherwise a typed client call may live directly in the
query function.

## Export mutation definitions and declare cache effects

Define reusable mutation option factories outside React:

```ts
export const accountsMutations = {
  rename: () =>
    mutationOptions({
      mutationKey: [...accountsKeys.mutations(), "rename"] as const,
      mutationFn: renameAccount,
      onSettled: (_data, _error, variables) => {
        void queryClient.invalidateQueries({ queryKey: accountsKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: accountsKeys.detail(variables.id),
        });
      },
    }),
};
```

Every write must make its cache effects explicit:

- invalidate the exact entity when only that entity can change;
- invalidate a list prefix when membership or ordering can change;
- invalidate the source root only when the effect is genuinely broad;
- invalidate other source modules when the write changes their data;
- update cache directly only when the returned contract data is sufficient to
  do so without guessing;
- state intentionally when a mutation has no cached read effect.

Prefer `onSettled` when the server may have changed state despite an error or
when this is the repository convention. Use `onSuccess` when the protocol
guarantees no state change on failure and avoiding a failed-write refetch is
important. Correctness determines the callback, not habit.

Consumers own UI effects such as navigation, notifications, dialog state, and
form reset. They must not replace the module's cache lifecycle accidentally.
Prefer per-call callbacks or explicitly compose handlers when adding local
behavior.

## Preserve transport errors

Propagate the transport's original error value unchanged by default. Prefer the
transport's own error primitives and handling mechanisms, such as an
`AxiosError`, a Fetch `Response` or rejection, or an SDK/RPC error type.

Do not serialize, deserialize, normalize, wrap, map, clone, or reconstruct an
error merely to create a uniform API shape. In particular:

- do not replace a transport error with a generic `Error`;
- do not invent `ApiError`, `toApiError`, error-code maps, registries, or
  conversion helpers;
- do not discard the original prototype, status, headers, body, code, cause,
  retry metadata, or transport-specific guards;
- do not mutate errors while logging them;
- when a protocol returns a typed failure value rather than throwing, propagate
  it as-is; throw that value directly when the query or mutation boundary
  requires a rejection.

If the project already has a specialized error registry, adapter, serializer,
or application-wide error flow, use it exactly as designed. Verify that it is
the established integration path before relying on it. Do not create or extend
such an abstraction just for the current API integration unless the task
explicitly requires changing the project's error architecture.

Keep presentation outside the API module: components or the existing
application error flow own translated messages, toasts, and recovery UX.

## Balance compatible queries through one batch client

When many independent query functions target the same batch-capable source
operation, place one source-owned query balancer between them and the transport.
Let TanStack Query continue to own caching and identical-key deduplication. Let
TanStack Pacer collect distinct, temporally adjacent requests and flush them as
one transport batch.

- Create one batcher per compatible source operation and auth, tenant, locale,
  or routing context. Never choose transport context from the first queued item.
- Let every enqueue return its own promise. Preserve its `resolve` and `reject`
  callbacks until the batch result is routed back to that caller.
- Flush after a short coalescing delay or when `maxSize` is reached. Treat
  `maxSize` as a batch trigger, not as queue-capacity rejection.
- Route responses by array position only when the transport contract guarantees
  stable ordering. Otherwise correlate them by an existing request identifier.
- Reject every affected caller with the original batch-level transport error.
  Deliver per-item failure values to their matching callers unchanged.
- Keep results in TanStack Query's cache, not in the batcher.
- Avoid priority reordering unless correlation is explicit.
- Do not connect one query consumer's abort signal to a shared batch abort.
- Do not enable retries for writes or non-idempotent reads without an explicit
  source guarantee.
- Expose `flush` only when a latency-sensitive caller genuinely needs it.

Use atomic or manually constructed write batches only when the source contract
defines their ordering, partial-failure, and idempotency semantics. Invalidate
all affected cache prefixes after a successful or potentially applied write.

Read `references/query-balancing.md` before implementing Pacer-based batching.
It contains a thin generic implementation and the lifecycle invariants that
prevent lost, crossed, or permanently pending query promises.

## Verification

Before finishing an API change, verify:

- external calls remain behind `api/`;
- each source has one clear module owner;
- generated artifacts reproduce from their authority;
- no external DTO was manually duplicated;
- no hand-maintained generic `types.ts` was introduced;
- mock-only data stays behind one explicit boundary and does not introduce a
  parallel domain model or fake integration layer;
- keys contain every response-changing input;
- query and mutation definitions are reusable outside components;
- each mutation's cache effects are explicit and tested;
- cross-source invalidation is covered;
- query batchers preserve one-to-one result routing and leave no caller promise
  pending after success, failure, flush, or exposed cancellation;
- transport errors remain unchanged unless an existing project-wide error flow
  explicitly owns their conversion;
- no new error wrapper, converter, serializer, or registry was invented;
- auth, retry, and error behavior is tested at the client boundary;
- typecheck, focused tests, and contract-generation drift checks pass.

## References

- Read `references/module-pattern.md` for a neutral source-module skeleton.
- Read `references/query-balancing.md` when multiple query functions can share
  a source batch operation or when using TanStack Pacer.
- Read `references/transport-examples.md` when choosing how generated,
  schema-inferred, SDK, or RPC contracts feed the same module architecture.

## Related skills

- Client state that does not mirror an external source: `state-management`.
- Query or mutation failure propagation, reporting, retry, and duplicate
  suppression: `error-handling`. The no-invention rule above remains binding.
- User-visible query and mutation outcomes: `user-feedback`.
- Wiring mutations to form submission: `forms`.
- Broader source-tree ownership decisions: `file-structure`.
- Rendering loading, error, empty, and data states from an API query:
  `components`.
