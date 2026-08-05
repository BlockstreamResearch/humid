# Query Balancing with TanStack Pacer

Use a query balancer when many independent callers request different data from
the same batch-capable source operation. The balancer coalesces nearby requests,
executes one transport call, and routes each result back to the promise created
for its original caller.

## Contents

- Purpose and ownership
- Minimal implementation
- Source-module integration
- Contract and lifecycle rules
- Verification

## Purpose and ownership

This is temporal request balancing, not server load balancing:

```text
query A ─┐                    ┌─ result A -> query A
query B ─┼─ short queue ─ batch call ─ result B -> query B
query C ─┘                    └─ result C -> query C
```

TanStack Query and TanStack Pacer have different jobs:

- TanStack Query caches results, deduplicates identical query keys, and manages
  query lifecycle.
- TanStack Pacer groups distinct requests that arrive close together and
  controls when the group executes.
- The source module owns the batch endpoint and the one-to-one mapping between
  queued requests and returned results.

Keep one long-lived balancer per batch-capable source operation. Do not create a
batcher per component or per query invocation.

## Minimal implementation

Use the core Pacer class for a non-React service. If the repository exposes the
same class through its framework package, follow the established import.

```ts
import { AsyncBatcher } from "@tanstack/pacer";

type PendingRequest<TRequest, TResponse> = {
  request: TRequest;
  resolve: (response: TResponse) => void;
  reject: (reason: unknown) => void;
};

type QueryBatcherOptions<TRequest, TResponse> = {
  key: string;
  maxSize: number;
  wait: number;
  execute: (
    requests: readonly TRequest[],
  ) => Promise<readonly TResponse[]>;
};

export function createQueryBatcher<TRequest, TResponse>({
  key,
  maxSize,
  wait,
  execute,
}: QueryBatcherOptions<TRequest, TResponse>) {
  const batcher = new AsyncBatcher<
    PendingRequest<TRequest, TResponse>
  >(
    async (pending) => {
      const responses = await execute(
        pending.map(({ request }) => request),
      );

      if (responses.length !== pending.length) {
        throw new Error(
          `Batch response count mismatch: expected ${pending.length}, received ${responses.length}`,
        );
      }

      pending.forEach(({ resolve }, index) => {
        resolve(responses[index]!);
      });
    },
    {
      key,
      maxSize,
      wait,
      onError: (error, pending) => {
        pending.forEach(({ reject }) => {
          reject(error);
        });
      },
      throwOnError: false,
    },
  );

  return {
    request(request: TRequest): Promise<TResponse> {
      return new Promise<TResponse>((resolve, reject) => {
        void batcher.addItem({ request, resolve, reject });
      });
    },
    async flush(): Promise<void> {
      await batcher.flush();
    },
  };
}
```

The wrapper is intentionally thin:

- Pacer owns collection, timing, `maxSize`, execution, and observable state.
- The wrapper owns only the caller promise and result demultiplexing.
- `throwOnError: false` prevents the ignored `addItem` promise from producing
  an unhandled rejection; `onError` rejects the real caller promises with the
  original error.
- The cardinality error represents a broken batch contract. It does not wrap or
  convert a transport error.

## Source-module integration

Construct the balancer once inside the source module:

```ts
type AccountRequest = {
  id: string;
};

const accountDetailBatcher = createQueryBatcher<
  AccountRequest,
  AccountResponse
>({
  key: "accounts.detail",
  maxSize: 50,
  wait: 20,
  execute: (requests) => accountsSource.getMany(requests),
});

export function getAccount(id: string) {
  return accountDetailBatcher.request({ id });
}

export const accountsQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: accountsKeys.detail(id),
      enabled: Boolean(id),
      queryFn: () => getAccount(id),
    }),
};
```

Concurrent components, route loaders, and prefetches now use the same
`accountsQueries.detail` definition. They do not know whether their request was
sent alone or as part of a batch.

If the transport returns a per-item failure envelope, deliver that envelope to
the matching caller unchanged. Let the source operation apply the project's
existing direct error handling. Do not make the generic balancer understand
domain statuses or invent a common error type.

## Contract and lifecycle rules

### Batch only compatible work

All items in one batch must share:

- source and batch operation;
- base URL or transport channel;
- authentication and tenant context;
- locale or headers that affect the response;
- retry, timeout, and consistency semantics.

Close these dependencies over the batcher's `execute` function. Do not store a
client, session, processor, or options on every item and then use the first
item's values for the entire batch.

### Preserve correlation

Use positional routing only when the source guarantees response order. Do not
sort or reprioritize queued items in that case.

When ordering is not guaranteed, send an existing correlation identifier and
route responses through a lookup:

```ts
const pendingById = new Map(
  pending.map((item) => [item.request.requestId, item]),
);

for (const response of responses) {
  pendingById.get(response.requestId)?.resolve(response);
}
```

Reject unmatched requests as a batch-contract violation. Never guess which
caller owns a response.

### Preserve error identity

- Reject every item with the original error when the entire batch call fails.
- Preserve each transport-provided per-item error or failure envelope.
- Do not serialize, normalize, or wrap errors in the balancer.
- Use an existing project-wide error flow only when the project already
  requires it.

### Keep cancellation collective

An in-flight transport batch belongs to several callers. Aborting it because
one component unmounted would cancel unrelated queries. Do not wire an
individual query signal directly to the batcher's shared abort signal.

If individual cancellation is required, mark or remove only that pending item
before execution and settle its promise with the original abort reason. If
exposing `cancel`, `clear`, or `reset`, settle every removed caller first;
otherwise their promises remain pending forever.

### Retry only safe batches

Pacer can retry a failed batch, but retrying repeats every item. Enable it only
when the whole operation is idempotent and the source defines safe retry
semantics. Keep retries off by default for mutations and mixed-effect batches.

### Separate query balancing from write batching

Query balancing is most useful for independent reads. A write batch has
additional atomicity, ordering, partial-success, idempotency, and invalidation
requirements. Do not send mutations through a query balancer merely because the
transport accepts an array.

## Verification

Test the balancer with deterministic test executors:

- several requests inside the window produce one batch call;
- reaching `maxSize` flushes immediately;
- each caller receives the response at its own position or correlation id;
- a batch-level error rejects every caller with the same error object;
- a per-item failure reaches only its matching caller;
- a response-count or correlation mismatch settles every affected promise;
- a later batch cannot resolve promises from an earlier batch;
- explicit `flush` settles all currently queued requests;
- cancellation or clearing, when exposed, leaves no promise pending;
- retries occur only when the operation is explicitly idempotent.
