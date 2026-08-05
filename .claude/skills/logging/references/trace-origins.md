# Trace Origins Across Client Runtimes

Use this reference when logs or reported errors point to logger internals,
catch blocks, Query callbacks, queue flushes, RPC handlers, or minified bundles
instead of the code that initiated the operation.

## Contents

- [Keep Three Locations Distinct](#keep-three-locations-distinct)
- [Capture An Origin Portably](#capture-an-origin-portably)
- [Choose A Capture Policy](#choose-a-capture-policy)
- [Preserve Origins In Records](#preserve-origins-in-records)
- [Async And Framework Boundaries](#async-and-framework-boundaries)
- [Web](#web)
- [React Native](#react-native)
- [Electron And Electrobun](#electron-and-electrobun)
- [Production Symbolication](#production-symbolication)
- [Verification](#verification)

## Keep Three Locations Distinct

One diagnostic flow can contain three legitimate locations:

1. **Failure stack**: where an `Error` was created or thrown.
2. **Operation origin**: where the caller initiated work that later crossed an
   async, framework, worker, or RPC boundary.
3. **Observation location**: where a cache callback, reporter, transport, or
   host received the result.

The failure and operation origin are useful. The observation location is
usually infrastructure noise. Do not overwrite the first two with the third.

For an ordinary log without an error, the operation origin is the logger call
site. For an error log, the original error stack remains primary and the logger
origin is supplemental.

## Capture An Origin Portably

`Error.stack` exists across common client engines, but its exact string format
and frame names differ. V8 exposes `Error.captureStackTrace`; Hermes and
JavaScriptCore compatibility must not be assumed.

Use feature detection and keep the raw stack:

```ts
export interface TraceOrigin {
  readonly stack?: string
}

type ErrorWithStack = {
  stack?: string
}

type ErrorConstructorWithCapture = ErrorConstructor & {
  captureStackTrace?(
    target: ErrorWithStack,
    constructor?: (...args: never[]) => unknown,
  ): void
}

export function captureTraceOrigin(): TraceOrigin {
  const target: ErrorWithStack = {}
  const ErrorRuntime = Error as ErrorConstructorWithCapture

  if (typeof ErrorRuntime.captureStackTrace === "function") {
    ErrorRuntime.captureStackTrace(target, captureTraceOrigin)
    return { stack: target.stack }
  }

  return {
    stack: new Error("Operation origin").stack,
  }
}
```

The fallback may retain the helper frame. That is better than deleting a fixed
number of lines and corrupting another engine's format. If a repository already
has a tested engine-specific frame filter, keep it at the presentation boundary,
not in the stored record.

Capture before the discontinuity:

```ts
const origin = captureTraceOrigin()

queueMicrotask(() => {
  runJob().catch(error => {
    reportError(error, { originStack: origin.stack })
  })
})
```

Capturing inside `catch`, a queue flush, or an RPC handler only records that
observer.

## Choose A Capture Policy

Stack capture and source-map lookup have a cost. Do not add it blindly to every
high-volume production record.

A practical starting policy is:

- development: capture origins for every enabled level;
- production: capture for `warn`, `error`, and explicitly traced operations;
- error records: always preserve the original error object locally, regardless
  of the origin policy;
- sampled or high-volume events: prefer stable scope and correlation identifiers
  unless a measured investigation needs stacks.

Make the policy configurable at the runtime composition root. Feature code must
not contain environment checks solely to decide whether a logger captures its
call site.

The method-level options should also support an explicit opt-out:

```ts
interface LogCallOptions {
  readonly captureOrigin?: boolean
  readonly originStack?: string
}
```

Use `captureOrigin: false` for infrastructure observers that have no genuine
earlier operation origin, such as a declarative Query cache callback, a global
error listener, an RPC ingestion handler, or a file writer. Their local stack
is an observation location, not a useful substitute for the caller.

## Preserve Origins In Records

Keep the record shape explicit:

```ts
interface LogRecord {
  readonly timestamp: number
  readonly level: LogLevel
  readonly message: string
  readonly scope: LogFields
  readonly context?: LogFields
  readonly error?: unknown
  readonly originStack?: string
}
```

Capture `originStack` at the public facade call, not inside `dispatch()` or a
transport. Allow an established reporter or operation wrapper to provide an
earlier origin captured before an async boundary.

The distinction includes private facade helpers. If a public method delegates
automatic capture to a generic `emit()` or `resolveOrigin()` helper, that helper
becomes the leading frame. Capture directly while executing the public method,
then pass the raw stack into the private emitter. Do not trim the helper by a
fixed line count.

Do not concatenate:

```ts
// Avoid
error.stack += `\n--- called from ---\n${originStack}`
```

That mutates a potentially shared error, makes retries duplicate frames, and
produces a string that incident SDKs and source-map processors may parse
incorrectly.

Local console and telemetry transports should receive the original `Error`.
At a serialization boundary, preserve only the standard diagnostic fields
needed by that boundary:

```ts
interface WireLogRecord {
  readonly errorText?: string
  readonly errorStack?: string
  readonly originStack?: string
}

function toWireError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorText: `${error.name}: ${error.message}`,
      errorStack: error.stack,
    }
  }

  return {
    errorText: stringifyUnknownAtBoundary(error),
  }
}
```

This is not a domain error serializer. Do not traverse causes, discover custom
properties, or maintain an error-class registry in logging infrastructure.
When extending a stored or wire schema, keep legacy fields readable until the
transport performs an explicit migration; new records can populate
`errorText`, `errorStack`, and `originStack` without rewriting old data.

## Async And Framework Boundaries

Modern engines can retain useful frames across some `await` chains, but timers,
event emitters, task queues, cache execution, workers, and RPC create real
discontinuities. Do not rely on one engine's current async-stack behavior as an
application contract.

- Capture before scheduling a timer, background task, or queued callback when
  the initiating caller matters.
- Give concurrent operations separate origins. Never store the latest origin in
  one module-level or hook-level mutable variable.
- For TanStack Query, keep the rejection's original error. A stack captured
  while defining a hook identifies registration, not necessarily the later
  mutation invocation. A global MutationCache can capture synchronously in
  `onMutate` and associate the origin with the Mutation instance; read the
  TanStack Query reference below.
- For a React render failure, keep both the thrown error stack and React's
  component stack; they answer different questions.
- Use safe operation or request identifiers to correlate logs across runtimes.

Read `../../error-handling/references/tanstack-query.md` for reporting ownership
and mutation invocation details.

## Web

Pass an original `Error` as a value to the console transport instead of only
printing its message or preformatted stack string. Browser DevTools can then
inspect the actual error.

The clickable location of a wrapped `console.*` call may still point to the
transport. Use the record's separately captured `originStack` when the facade
call site matters. Do not depend on DevTools-specific console formatting as the
only persisted diagnostic.

Production bundles require source maps available to the chosen incident or log
inspection path. If public source maps are unacceptable, upload them privately
to the provider and remove or withhold deployed `.map` files according to the
build system's supported flow.

## React Native

Keep the original `Error` for the local console and incident SDK. Do not replace
it with `error.stack` before reporting; that turns the error into plain text and
can make the logger call look like the origin.

React Native development tools and LogBox are development aids, not production
symbolication. Avoid private LogBox or Metro APIs for trimming or
symbolicating stacks inside application code.

Hermes release stacks need the matching JavaScript/Hermes source maps. An OTA
update has a different JavaScript artifact from the embedded application build;
upload and identify maps for each update as well as each native build.

## Electron And Electrobun

Treat renderer and host stacks as separate runtime evidence.

Renderer logging should send:

- the renderer record and timestamp;
- renderer scope and safe correlation identifiers;
- minimal `errorText` and `errorStack`;
- the separately captured renderer `originStack`.

The host persists those fields unchanged. It must not re-log the record and
replace the renderer origin with the ingestion handler.

If a native handler itself fails, report the original failure in the host while
the host `Error` still exists. A renderer-facing RPC failure is a separate,
lossy contract and must not pretend to contain the host stack. Correlate both
sides with a safe request identifier when diagnosis needs the full path.

For Electron main or another Node-based host, enable the runtime's supported
source-map integration before application modules load. Do not globally replace
`Error.prepareStackTrace` or rewrite stack strings unless the repository already
has a tested requirement for it.

## Production Symbolication

A captured stack is only an address list until it maps to the exact shipped
code.

Verify:

- source maps are generated for every minified or transpiled runtime;
- the release, build, distribution, and OTA update identifiers match the
  uploaded artifacts;
- source maps are uploaded before using a synthetic production failure as a
  test;
- private maps are not unintentionally published;
- a real test event resolves to original file, line, and function names;
- persisted raw stacks retain enough generated file, line, and column data for
  later symbolication.

Do not claim trace preservation is complete after a development-only console
test.

## Verification

Test at least:

1. a synchronous thrown `Error`;
2. a caught and rethrown identical error;
3. a wrapper error with `cause`;
4. a rejection after an `await`;
5. a timer or queued task with a captured origin;
6. concurrent mutations or tasks with different origins;
7. a renderer record persisted by the host;
8. a host handler failure correlated with its renderer request;
9. a production or preview build symbolicated with its exact artifacts.

Assert that the original error stack never gains appended sections after
retries, repeated logging, or transport delivery.
