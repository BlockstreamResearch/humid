# Logger Facade And Records

Use this reference when defining or changing the public logger, record shape,
child behavior, message conventions, levels, or error argument.

## Contents

- [Minimal Contract](#minimal-contract)
- [Root And Child Loggers](#root-and-child-loggers)
- [Scope And Context](#scope-and-context)
- [Stable Messages](#stable-messages)
- [Explicit Application Events](#explicit-application-events)
- [Level Semantics](#level-semantics)
- [Error Values](#error-values)
- [Diagnostic Origins](#diagnostic-origins)
- [Transport Dispatch](#transport-dispatch)

## Minimal Contract

Adapt names to the repository, but preserve the separation between stable scope
and event-specific context:

```ts
type LogLevel = "debug" | "info" | "warn" | "error"
type LogKind = "log" | "event"

type LogScope = Record<string, unknown>
type LogContext = Record<string, unknown>

interface LogRecord {
  timestamp: number
  kind: LogKind
  level: LogLevel
  message: string
  scope: LogScope
  context?: LogContext
  error?: unknown
  originStack?: string
}

interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: unknown, context?: LogContext): void
  event(name: string, context?: LogContext): void
  child(scope: LogScope): Logger
}
```

This is illustrative rather than a mandatory literal type. Reuse an established
contract when it represents the same behavior.

## Root And Child Loggers

Create one root logger for each runtime:

```ts
const logging = createLogging({
  scope: {
    runtime: "electron-renderer",
    applicationVersion,
    sessionId,
  },
  transports: [consoleTransport],
})

export const logger = logging.logger
```

Runtime metadata belongs to the root configuration. Feature code should not
repeat it.

A child creates another immutable facade with merged scope:

```ts
const moduleLog = logger.child({
  module: "projects",
})

const operationLog = moduleLog.child({
  operation: "open-project",
  requestId,
})
```

Creating a child must not create another transport registry, queue, timer, or
file handle. All descendants dispatch through the same runtime logging
instance.

Snapshot the supplied root and child scope objects shallowly. Otherwise a
caller can mutate an object after creating the logger and silently rewrite the
scope observed by a delayed transport:

```ts
const scope = { module: "projects" }
const log = logger.child(scope)

scope.module = "unrelated" // Must not alter `log`.
```

Use a child when several records share the value:

```ts
const syncLog = logger.child({
  module: "sync",
  operationId,
})

syncLog.info("Synchronization started")
syncLog.debug("Synchronization batch received", { itemCount })
syncLog.info("Synchronization completed", { durationMs })
```

Do not create a child merely to emit one line:

```ts
logger.info("Project opened", { projectId })
```

## Scope And Context

Typical scope fields include:

- runtime;
- module or capability;
- component or process;
- operation;
- request, correlation, session, or task identifier.

Keep scope values small and suitable for transport. Do not attach service
clients, stores, React values, request objects, whole entities, or arbitrary
class instances.

Context belongs to one record:

```ts
log.info("Workspace loaded", {
  workspaceId,
  projectCount,
  durationMs,
})
```

The logging core should merge scope and preserve context without walking,
normalizing, or enriching their values. Take a shallow snapshot of event
context when creating the record because an asynchronous transport may flush
later. This only protects the top-level record fields; do not deep-clone nested
objects.

## Stable Messages

Keep messages readable and stable:

```ts
// Avoid: every id produces a different message.
log.info(`Workspace ${workspaceId} loaded in ${durationMs}ms`)

// Prefer: the message groups naturally; values remain queryable.
log.info("Workspace loaded", {
  workspaceId,
  durationMs,
})
```

Do not require a second machine event name for every log. Metrics and analytics
events must not be inferred by parsing log messages.

## Explicit Application Events

When an application sends stable domain events to OpenReplay or another
telemetry provider, the configured logger may expose a distinct `event`
operation:

```ts
const log = logger.child({ module: "mtls" })

log.event("mtls_provision", {
  method: "jwt",
})
```

The resulting record must retain `kind: "event"` across asynchronous queues and
renderer-to-host boundaries. Console and file transports may store it alongside
ordinary logs. A telemetry transport can forward it without guessing from the
message or level.

Do not forward every `info` record as analytics. That silently changes
diagnostic text into a remote data contract, increases telemetry volume, and
makes harmless message edits alter dashboards.

## Level Semantics

### Debug

Use for high-volume details needed while investigating behavior:

```ts
log.debug("Request batch scheduled", {
  requestCount,
  delayMs,
})
```

Debug records may be disabled, sampled, or dropped by a transport.

### Info

Use for meaningful lifecycle and business-operation milestones:

```ts
log.info("Workspace opened", { workspaceId })
```

Do not log every render, selector, helper call, or successful network request.

### Warn

Use when the application continued despite unexpected or degraded behavior:

```ts
log.warn("Cached configuration unavailable; defaults applied", {
  configurationId,
})
```

A warning should communicate what degraded or what fallback was selected.

### Error

Use for a failed operation or diagnostic error event:

```ts
log.error("Workspace synchronization failed", error, {
  workspaceId,
  operationId,
})
```

This call records a failure. It does not mean the failure was handled, shown to
the user, retried, or reported as an incident.

## Error Values

Keep the public error parameter `unknown`. Do not require errors to inherit from
one application base class.

The core logger passes the value to local transports unchanged. If a transport
must encode it, keep the fallback local and deliberately small:

```ts
function stringifyError(error: unknown): string | undefined {
  if (error === undefined) {
    return undefined
  }

  try {
    const serialized = JSON.stringify(error)
    return serialized && serialized !== "{}" ? serialized : String(error)
  } catch {
    try {
      return String(error)
    } catch {
      return "[unserializable error]"
    }
  }
}
```

`JSON.stringify(new Error("failed"))` commonly produces `{}` because standard
error fields are not enumerable. Falling back to `String(error)` in that case
preserves the basic message without introducing a universal serializer,
middleware chain, or error registry.

When a field is important and the caller knows its semantics, provide it
explicitly:

```ts
log.error("Request failed", error, {
  requestId,
  status,
})
```

Do not teach the logger to discover `status`, `details`, response bodies, or
domain-specific properties from arbitrary errors.

## Diagnostic Origins

An optional `originStack` belongs to the record itself, not ordinary event
context. It describes where the facade was called or where later asynchronous
work was initiated.

Capture it in the public method before dispatch:

```ts
function error(
  message: string,
  error?: unknown,
  context?: LogContext,
  options?: LogCallOptions,
): void {
  const captureOrigin =
    options?.captureOrigin ?? captureOriginForConfiguredPolicy("error")
  const originStack =
    options?.originStack ??
    (captureOrigin ? captureTraceOrigin().stack : undefined)

  dispatch({
    timestamp: Date.now(),
    kind: "log",
    level: "error",
    message,
    scope,
    ...(context === undefined ? {} : { context: { ...context } }),
    ...(error === undefined ? {} : { error }),
    ...(originStack === undefined ? {} : { originStack }),
  })
}
```

Do not capture inside `dispatch()` or `transport.write()`: the first meaningful
frame will already be logging infrastructure. Do not concatenate the result
with `error.stack`.

Do not hide the capture in a generic private emitter or origin resolver either:
that helper becomes the leading frame. An observer with no real operation
origin passes `{ captureOrigin: false }`; ordinary feature calls rely on the
configured runtime policy.

Keep capture policy at bootstrap so development can retain more detail than a
high-volume production runtime. Read `trace-origins.md` for portable capture,
async origins, native boundaries, and source-map requirements.

## Transport Dispatch

The core behavior can remain conceptually small:

```ts
function emit(
  level: LogLevel,
  message: string,
      context?: LogContext,
      error?: unknown,
): void {
  const record: LogRecord = {
    timestamp: Date.now(),
    kind: "log",
    level,
    message,
    scope,
    ...(context === undefined ? {} : { context: { ...context } }),
    ...(error === undefined ? {} : { error }),
  }

  for (const transport of transports) {
    try {
      transport.write(record)
    } catch {
      reportTransportFailureOnce()
    }
  }
}
```

Do not copy this literally when the repository already owns the facade. The
important properties are one record, one fan-out step, independent transports,
and no generic processor chain between them.
