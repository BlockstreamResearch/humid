# TanStack Query Failure Flow

Use this reference when changing query or mutation error propagation,
reporting, retry, feedback, or Error Boundary behavior.

## Keep The Query Function Honest

Let a query or mutation function reject with the original transport or domain
error. Do not resolve a failure as ordinary data and do not convert every error
into a generic application type.

The API module owns transport behavior and canonical cache effects. It does not
own page-specific feedback.

## Choose One Reporting Observer

`QueryCache` and `MutationCache` callbacks can provide one application-wide
diagnostic observer:

```ts
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error, query) {
      if (isExpectedCancellation(error)) return

      reportError(error, {
        captureOrigin: false,
        module: "query",
        context: {
          queryFamily: String(query.queryKey[0] ?? "unknown"),
        },
      })
    },
  }),
})
```

This is a policy option, not a mandatory pattern. Reporting every cache error
without classification creates noise from cancellation, background refetch,
offline behavior, and expected authorization or domain outcomes.

`captureOrigin: false` is deliberate in a declarative Query observer: the
query's rejection stack is primary, while a newly captured cache-callback stack
only identifies observation. A Mutation observer may instead receive an
earlier `originStack` captured per execution as shown below.

Do not serialize an entire query key, mutation variables, or transport payload
into reporting context. Select only the safe identifiers needed for diagnosis.

When cache-level reporting exists, do not report the same failure again from a
component merely because it also presents feedback.

### Do Not Forge A Combined Stack

A Query or Mutation error stack usually identifies the transport or domain
failure but may not identify the component or interaction that started the
operation. Keep those facts separate.

Do not mutate the shared error:

```ts
// Avoid: retries, observers, and reporters now see a modified error object.
error.stack += `\n--- used in ---\n${callSite}`
```

If a consumer origin matters, capture it before the asynchronous execution and
pass it as diagnostic metadata:

```ts
const origin = captureTraceOrigin()

try {
  await updateProject.mutateAsync(input)
} catch (error) {
  reportError(error, {
    originStack: origin.stack,
    context: { projectId },
  })
}
```

This call-site owner replaces cache-level reporting for that same failure; the
cache may still own retry and canonical mutation lifecycle. Do not create two
incident reports.

`meta` is suitable for stable mutation ownership or a registration stack
captured when options or a hook are created. That identifies the consumer
definition, not necessarily the later `mutate()` or `mutateAsync()` invocation.
Name it honestly, for example `registrationStack`, and do not present it as the
exact invocation stack.

If an application requires one global MutationCache reporter with the actual
`mutate()` or `mutateAsync()` invocation chain, capture synchronously in the
global `onMutate` callback and associate the origin with that Mutation instance:

```ts
const mutationOrigins = new WeakMap<object, TraceOrigin>()

const mutationCache = new MutationCache({
  onMutate(_variables, mutation) {
    mutationOrigins.set(mutation, captureTraceOrigin())
  },
  onError(error, _variables, _onMutateResult, mutation) {
    reportError(error, {
      originStack: mutationOrigins.get(mutation)?.stack,
      context: {
        mutationFamily: String(
          mutation.options.mutationKey?.[0] ?? "unknown",
        ),
      },
    })
  },
  onSettled(
    _data,
    _error,
    _variables,
    _onMutateResult,
    mutation,
  ) {
    mutationOrigins.delete(mutation)
  },
})
```

Capture at the start of `onMutate`, before returning or awaiting anything. In
current TanStack Query execution, that callback is entered from the imperative
mutation call before mutation work crosses its asynchronous boundary, so its
raw stack still includes the consumer chain. The WeakMap keeps concurrent
Mutation instances isolated and releases settled entries.

Verify this behavior against the installed TanStack Query version because
callback signatures and execution details are library contracts that may
change. A restored or resumed persisted mutation has no live caller origin; do
not invent one.

Do not put the origin in mutation variables, use one mutable "latest origin"
slot, mutate the error, or parse a fixed number of stack lines.

## Separate Background Failure From Empty Failure

A background refetch may fail while usable cached data remains visible. Do not
replace that data with a full error screen or emit a global toast automatically.
Choose a subtle stale or retry indication when the product needs one.

An initial query with no usable data may render an inline error region with a
retry action. Follow the async rendering waterfall from **components** and the
presentation rules from **user-feedback**.

## Understand Mutation Control Flow

`mutateAsync()` returns a promise and rejects when `mutationFn` rejects. An
ordinary `try`/`catch` can therefore classify a submit or action failure:

```ts
try {
  await updateProject.mutateAsync({ projectId, name })
  showSuccess("Project updated")
} catch (error) {
  showError(error, {
    fallbackMessage: "Unable to update the project",
  })
}
```

`throwOnError` controls whether a stored mutation error is propagated during
render to an Error Boundary. It is not required for `mutateAsync()` to reject.

The callback-based `mutate()` does not return an awaitable failure. Use its
callbacks when that style already owns the interaction; do not wrap it in
`try`/`catch` and expect the asynchronous error there.

## Keep Lifecycle Ownership Stable

- Keep canonical invalidation and cache updates in reusable mutation options
  owned by **api-integration**.
- Keep interaction-specific success and failure feedback at the call site.
- Do not spread mutation options and silently replace their lifecycle
  callbacks.
- Do not duplicate retry between TanStack Query, a transport interceptor, and
  the component.
- Use Error Boundary propagation only for failures the local interaction
  cannot or should not recover from.

## Test The Policy

Cover at least:

- initial failure without data;
- background failure with cached data;
- expected cancellation;
- mutation rejection handled at the call site;
- repeated or concurrent mutations without origin cross-contamination;
- retry without repeated mutation of the same error stack;
- one technical report for one failure;
- retry exhaustion and recovery.
