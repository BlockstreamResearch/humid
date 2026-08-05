---
name: error-handling
description: Use whenever work adds, changes, reviews, or debugs thrown errors, rejected promises, catch or finally blocks, retries, cancellation, fallbacks, recovery, error stacks, cause chains, lost call sites, async or RPC origins, source maps, global error listeners, React or route error boundaries, TanStack Query failure policy, incident reporting, expected domain outcomes, or decides which layer owns a failure. Trigger even when the request only mentions an unhandled rejection, swallowed error, duplicate report, misleading stack trace, crash fallback, mutation failure, background refetch failure, Sentry or OpenReplay exception capture, or whether an error should propagate.
---

# Error Handling

Handle a failure once, at the narrowest boundary that can make the required
decision. Keep propagation, reporting, recovery, and user presentation separate
so that one failure does not become several logs, incidents, and messages.

Error handling is a control-flow concern. Logging records diagnostic facts;
user feedback presents an outcome. Neither one automatically means the failure
was handled.

## Trace The Existing Flow First

Before changing an error path:

1. Find where the value originates and whether it is thrown, rejected, or
   returned as a typed result.
2. Trace every layer that catches, logs, reports, retries, converts, or presents
   it.
3. Inspect global listeners, error boundaries, and TanStack Query cache
   callbacks that may already observe it.
4. Identify the boundary that owns recovery and the boundary that owns user
   feedback.
5. Preserve the repository's established reporter and provider integrations.

Do not add a local `catch` until this trace proves what decision belongs there.

## Classify The Outcome Before Handling It

Do not treat every non-happy path as the same failure:

- a successful value needs no error path;
- an expected domain outcome should remain a typed result when the contract
  models it as one;
- cancellation or superseded work usually needs cleanup, not an incident;
- recoverable degradation may justify a warning and fallback;
- an operation failure may need local recovery, reporting, or both;
- an unrecoverable render or initialization failure needs a recovery boundary.

Do not invent an `Error` subclass merely to represent a non-failure such as
`pending`, `queued`, or `requiresApproval`. Prefer the generated or
schema-derived discriminated result. Preserve an existing typed-error control
flow when the project deliberately uses one, but do not generalize it into a
new application-wide convention.

## Give Each Boundary One Job

Low-level transports, API functions, and reusable utilities normally preserve
and propagate failures. They do not choose toast copy, navigation, or a page
fallback.

A boundary may catch when it can:

- recover or select a fallback;
- retry with an explicit policy;
- translate a known domain outcome into another established contract;
- attach context required by an incident reporter;
- present feedback owned by that interaction;
- perform cleanup in `finally`;
- terminate propagation intentionally.

If none applies, let the failure propagate.

## Avoid Catch, Log, And Rethrow

Do not catch only to log and rethrow:

```ts
// Avoid: the caller, query cache, or global boundary may report it again.
try {
  return await loadWorkspace(workspaceId)
} catch (error) {
  log.error("Workspace load failed", error, { workspaceId })
  throw error
}
```

Prefer direct propagation:

```ts
return loadWorkspace(workspaceId)
```

Catch and rethrow only when adding information that cannot be supplied at a
higher boundary. Prefer `cause` or the repository's established typed contract;
do not flatten the original value into a generic message.

Never swallow silently. An intentionally ignored failure must be demonstrably
expected. Add a short comment or a `warn` with safe context when the reason is
not obvious.

## Preserve The Failure Origin

A `try`/`catch` does not erase an existing error stack by itself. The origin is
usually lost when code replaces the value with a new error, converts it to a
string, mutates its stack, reports only the catch location, or crosses an
async/process boundary without carrying diagnostic origin separately.

- Rethrow the same value when no new contract is required.
- If a new error genuinely adds boundary meaning, preserve the received value
  as `cause`; do not pretend the wrapper stack is the original failure stack.
- Never append consumer or call-site text to `error.stack`. Keep
  `errorStack`, `cause`, and an optional `originStack` as separate facts.
- Capture an origin before starting work whose later stack cannot lead back
  across a timer, event, Query execution, worker, native module, or RPC call.
- Report native or host failures in the runtime where the original error still
  exists. Correlate runtimes with safe request or operation identifiers instead
  of reconstructing an error in the receiving runtime.
- Treat source maps and symbolication as part of the production error path, not
  optional build decoration.

Read `references/trace-preservation.md` whenever changing catches, wrappers,
async scheduling, global reporting, native boundaries, or stack diagnostics.

## Preserve Errors As Received

Keep transport and domain error identity, status, code, details, and cause
available to the owner that understands them.

Do not introduce:

- a universal application error class;
- recursive error normalization or serialization;
- registries that must change for every new error type;
- message-string matching when a typed field exists;
- catch-all conversion merely to satisfy a local helper.

Create an `Error` fallback only at a boundary that requires an actual `Error`
instance, such as an exception-reporting SDK or render boundary, and retain the
original value as `cause` when useful.

An established privacy or redaction adapter may need a safe representation for
one specific sink. Keep it at that sink. If legacy code must produce a redacted
replacement `Error`, verify that it does not replace the only surviving failure
stack: retain the original locally when safe and carry its unchanged standard
stack explicitly in the sink-local error or record. Do not promote that
exception into a generic error conversion pipeline.

## Make Incident Reporting Explicit

Reporting means sending a failure to an incident or diagnostic backend. It is
not synonymous with logging or showing feedback.

- Report once, at the boundary with the best safe diagnostic context.
- Keep provider SDKs behind the repository's reporting facade or
  provider-owned logger transport.
- Do not turn every `logger.error()` into an incident unless the repository
  explicitly defines the error level that way. When it does, reporting emits
  one logger record and must not call the provider separately.
- Do not make `showError()` secretly report through a boolean option.
- Avoid reporting expected cancellation, validation failures, authorization
  outcomes, or other explicitly handled states unless project policy requires
  it.
- Keep identifiers and operational metadata; exclude secrets, credentials,
  raw payloads, and unnecessary personal data.

When both local logging and incident capture are needed, ensure they represent
one intentional flow rather than two independent observers reporting the same
failure.

## Use Global Boundaries As Backstops

Initialize global rejection and uncaught-error listeners once at the runtime
composition root. They catch failures that escaped normal ownership; they are
not a replacement for local recovery.

Treat these listeners as terminal observers. Pass the supplied error or
rejection reason into the configured logger with automatic origin capture
disabled. When an incident provider is a logger transport, this one record must
fan out to both persistence and incident capture; do not call the provider
again from the listener.

Use React, route, or application error boundaries to:

- report otherwise-unhandled render failures;
- replace a broken subtree with stable fallback UI;
- offer an appropriate reset, retry, reload, or navigation action;
- isolate the smallest useful region when recovery can remain local.

Do not use an error boundary for event-handler or awaited action failures that
the interaction boundary can handle directly.

## Treat Retry As Product Behavior

Retry only when the operation is safe to repeat and the policy is explicit.
Consider idempotency, attempt limits, delay, cancellation, offline behavior,
and whether the user should remain in control.

Do not add retries merely to hide an unknown failure. Do not combine automatic
retry at several layers. One owner must decide when attempts stop and what
recovery becomes visible.

## Coordinate TanStack Query Deliberately

TanStack Query can observe a failure at the query or mutation function, cache,
hook, call site, and error boundary. Choose one technical reporting path and one
presentation owner.

Read `references/tanstack-query.md` whenever work touches Query or Mutation
failure behavior, `mutateAsync`, cache callbacks, background errors,
`throwOnError`, retry, or duplicate reporting.

## Keep User Presentation Separate

After handling policy is decided, delegate presentation to **user-feedback**:

- field or form errors;
- inline region errors;
- toasts, banners, dialogs, and alerts;
- success, warning, and informational outcomes;
- retry or recovery controls visible to the user.

The same catch boundary may call the reporter and the feedback layer when it
truly owns both decisions, but the helpers themselves remain independent.

## Verify The Result

Before finishing:

- trace one failure from origin to its terminal owner;
- confirm it is not logged or reported twice;
- confirm expected cancellation and domain outcomes are not incidents;
- confirm low-level code does not own product copy or UI;
- confirm the original typed error remains available where needed;
- confirm no catch, wrapper, reporter, or transport overwrites the original
  error stack;
- confirm any async or cross-runtime origin was captured before the boundary and
  kept separately;
- confirm production stack artifacts match the exact release or update;
- confirm retry has one owner and a stop condition;
- confirm global listeners and boundaries initialize once;
- confirm incident context contains no secrets;
- confirm the user receives one appropriate presentation, if any.

## Related Skills

- External transports, generated error contracts, and query or mutation
  ownership → **api-integration**.
- Diagnostic records, child context, persistence, and telemetry transports →
  **logging**.
- Toasts, inline messages, dialogs, fallbacks, and recovery copy →
  **user-feedback**.
- Form validation and server field errors → **forms**.
- Component and async-region rendering → **components**.
- Native exception boundaries and privileged provider wiring →
  **native-integration**.
- Placement of reporting modules and boundaries → **file-structure**.
