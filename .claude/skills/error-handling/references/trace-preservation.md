# Error Trace Preservation

Use this reference when a catch, wrapper, async boundary, reporter, or native
call makes a failure point to infrastructure instead of its real origin.

## Contents

- [Catch Is Not The Loss](#catch-is-not-the-loss)
- [Propagation And Wrapping](#propagation-and-wrapping)
- [Async Origins](#async-origins)
- [Process And Native Boundaries](#process-and-native-boundaries)
- [Reporting](#reporting)
- [Framework Boundaries](#framework-boundaries)
- [Verification](#verification)

## Catch Is Not The Loss

An existing `Error` normally keeps the stack captured when it was created.
Merely entering a `catch` does not replace it:

```ts
try {
  return await loadProject()
} catch (error) {
  throw error
}
```

This catch is still unnecessary when it makes no decision, but it does not by
itself reset an `Error` stack.

The destructive versions are:

```ts
catch (error) {
  throw new Error(String(error))
}

catch (error) {
  reportError(new Error("Project failed"))
}

catch (error) {
  error.stack += `\n${new Error().stack}`
}
```

They replace identity, discard typed fields or cause, or corrupt the original
stack.

## Propagation And Wrapping

Propagate the received value unchanged unless a boundary owns a real contract
translation.

When a wrapper adds essential meaning, retain the original:

```ts
try {
  await storage.open(projectId)
} catch (error) {
  throw new Error("Opening project storage failed", {
    cause: error,
  })
}
```

The wrapper stack and cause stack describe different layers. Do not concatenate
them into one string. Let the established incident provider represent the cause
chain when it supports it; otherwise retain the original cause locally and add
small safe context explicitly.

Do not create a wrapper only to change wording for a log or user message. Logger
messages and user feedback can add context without replacing the failure.

## Async Origins

An error stack describes where the failure occurred. It may not show who
scheduled the work after a timer, event, queue, Query execution, worker, or RPC
boundary.

Capture a supplemental origin synchronously before crossing that boundary:

```ts
const origin = captureTraceOrigin()

runInBackground()
  .catch(error => {
    reportError(error, {
      originStack: origin.stack,
      context: { operationId },
    })
  })
```

Keep the origin outside the error object. Capture one origin per execution so
parallel work cannot overwrite another operation's diagnostic.

Do not capture inside the later `catch` and label it as the operation origin. It
only identifies the observer.

## Process And Native Boundaries

Do not expect an `Error` instance to preserve class identity, non-enumerable
fields, cause, and stack through browser workers, Electron IPC, native modules,
or another RPC implementation.

Choose ownership before transport:

- report a host/native failure in the host/native runtime while the original
  error exists there;
- report a renderer/JavaScript failure in that runtime before sending a
  persistent log record;
- send minimal standard diagnostic strings only when another runtime must
  persist or display them;
- use a request or operation identifier to correlate the two runtime records.

Never recreate a received string as `new Error(receivedMessage)` and present its
receiver-side stack as the remote failure origin.

## Reporting

Pass the original error to the incident reporter whenever it accepts the value.
Attach safe module, operation, request, and supplemental origin information
through the provider's scope or context API.

If a reporter requires an `Error` but the thrown value is not one, create a
fallback only at that reporter boundary:

```ts
const reportable =
  error instanceof Error
    ? error
    : new Error(message, { cause: error })
```

That fallback stack identifies the conversion boundary. Do not describe it as
the original failure location.

Avoid global `Error.prepareStackTrace` overrides and stack-string rewriting.
They are engine-specific and can interfere with source-map and incident
provider processing.

An established redaction adapter is another replacement boundary. If it creates
a safe `Error` instance or record for one sink, preserve the received error in
the local flow when safe and copy its unchanged standard stack explicitly into
that sink-local diagnostic shape. A newly constructed redacted error otherwise
points to the sanitizer, which makes the privacy layer look like the failure
origin.

## Framework Boundaries

- TanStack Query cache callbacks are observers. Preserve the rejection and use
  explicit ownership metadata; read `tanstack-query.md` for exact invocation
  origins.
- Disable automatic logger-origin capture in observers that have no earlier
  operation origin. Their stack is still available when intentionally needed,
  but it must not be mislabeled as the caller.
- React error boundaries receive an error stack and a component stack. Preserve
  both as separate diagnostic fields.
- Global `error` and `unhandledrejection` listeners are terminal backstops. Use
  the supplied `Error` or rejection reason; do not replace it merely to add the
  words "Unhandled error".
- A retry is another execution, not permission to append another section to the
  same error stack.

## Verification

For each changed flow, record:

1. where the original error is created;
2. which layer first catches it;
3. which layer owns recovery or reporting;
4. which discontinuity requires a supplemental origin;
5. which runtime retains the original error;
6. how production frames map to the exact shipped artifact.

Force the same failure through retries and concurrent executions. Confirm that
the original stack remains byte-for-byte unchanged and each execution retains
its own origin.
