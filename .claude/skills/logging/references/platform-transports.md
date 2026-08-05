# Platform Transports

Use this reference when adding or changing transport registration, browser or
native persistence, Electron or Electrobun renderer-to-host delivery, batching,
flushing, or teardown.

## Contents

- [Transport Contract](#transport-contract)
- [Early Logging](#early-logging)
- [Transport Failure](#transport-failure)
- [Web](#web)
- [React Native](#react-native)
- [Electron And Electrobun](#electron-and-electrobun)
- [File Persistence](#file-persistence)
- [Stack And Origin Preservation](#stack-and-origin-preservation)
- [Telemetry](#telemetry)
- [Tests](#tests)

## Transport Contract

Keep the caller-facing logger synchronous. An asynchronous transport owns its
queue and lifecycle:

```ts
interface LogTransport {
  write(record: LogRecord): void
  flush?(): Promise<void>
  dispose?(): Promise<void>
}
```

Register transports at the runtime composition root:

```ts
const logging = createLogging({
  scope: {
    runtime: "web",
  },
  transports: [createConsoleTransport()],
})

const removePersistence = logging.addTransport(
  createBrowserPersistenceTransport(),
)
```

`addTransport()` should return a removal function or another clear lifecycle
handle. Prevent duplicate registration during HMR, repeated bootstrap, tests,
or remounting.

## Early Logging

Make the configured facade importable before optional services initialize.
Keep a console transport available from the start.

Do not add an unbounded hidden queue for records emitted before persistence or
RPC is ready. It is acceptable for early records to reach only the console.

If an application must retain early records, make that bounded bootstrap buffer
an explicit project decision with a clear ownership and flush point.

## Transport Failure

One transport failure must not:

- throw through the logger call;
- prevent another transport from receiving the record;
- recursively invoke the same logger;
- retry forever;
- grow an unbounded queue.

A transport may emit one guarded, rate-limited `console.warn` describing its
own failure. Do not route that warning through the logger it is servicing.

## Web

A web runtime may compose:

- a developer console transport;
- IndexedDB or another browser persistence transport;
- a remote logging or telemetry transport.

Browser persistence should own its batching, retention, querying, export, and
cleanup behavior. Do not place IndexedDB knowledge in the logger facade.

Treat an existing persisted schema as a compatibility contract. If the common
record changes from fields such as `t` and `tags` to `timestamp`, `scope`, and
`context`, adapt new records inside the persistence transport or perform an
explicit database migration. Do not silently make old IndexedDB records
unreadable.

Treat page shutdown flushes as best effort. Use the repository's established
page lifecycle integration rather than claiming that every queued record is
durable.

## React Native

React Native usually presents one JavaScript runtime to application code, even
when persistence ultimately crosses a native module.

Hide that bridge inside the React Native transport:

```text
application logger
    -> React Native transport
    -> native logging or file capability
```

Feature code still imports the common configured facade. It must not call the
native persistence module directly for ordinary logging.

Flush buffered records on the project's established application-background or
shutdown lifecycle when useful, without blocking user-visible transitions.

Verify the filesystem API's relocation semantics before implementing rotation.
For example, APIs in which `move` mutates the source `File` object's URI can
accidentally make subsequent writes target the backup. Copying to the backup
and truncating the current file may be safer for that API. This is a
transport-specific decision, not logger-core behavior.

## Electron And Electrobun

Treat the privileged host and renderer as separate runtimes:

```text
renderer feature
    -> renderer logger facade
        -> renderer console transport
        -> bounded RPC transport
            -> host logging handler
                -> host-owned file transport

host feature
    -> host logger facade
        -> host console transport
        -> host-owned file transport
```

The host owns file paths, file creation, rotation, retention, reading, and
export. Do not grant the renderer filesystem access merely for logging.

Use the repository's existing native-RPC foundation. The RPC client belongs
inside the renderer transport; feature modules do not import it.

Only install the native transport when the bridge is actually available.
Storybook, browser previews, tests, or SSR may import the same configured
facade without a desktop host; those runtimes should retain console logging
without repeatedly failing native requests.

### Batch Contract

Prefer one ingestion method carrying a batch of structured records:

```ts
const loggingMethods = {
  writeBatch: "logging.writeBatch",
} as const

interface WriteLogBatchParams {
  records: RendererLogRecord[]
}
```

Reuse the repository's contract and validation system. Do not hand-maintain
parallel request shapes when a source of truth already exists.

Register the method as ordinary native infrastructure. Do not expose log
ingestion to an agent or user-facing capability catalog unless a separate,
explicit product requirement calls for it.

The wire record should preserve `originStack` and, for an actual error, a
minimal `errorText` and `errorStack`. Keep them as separate fields. Do not send
an `Error` instance, concatenate stacks, or introduce a generic domain error
serializer.

The transport may apply the smallest wire-only representation change required
by the RPC implementation. Do not place that conversion in the core logger or
reuse it as a general application error model.

### Renderer Queue

The renderer RPC transport should:

- preserve record order within a batch;
- cap its queue;
- flush on a short interval or batch-size threshold;
- avoid one RPC request per ordinary record;
- prefer dropping old `debug` records before more important records when full;
- expose a best-effort `flush()`;
- stop timers and reject new persistence work after `dispose()`;
- keep console logging available when RPC is unavailable.

Exact batch sizes and intervals depend on the application. Keep them
configurable beside the transport rather than spreading constants through
feature code.

### Host Ingestion

The host handler receives records from the renderer and sends them directly to
the host-owned persistence sink.

Do not call the host root logger again:

```ts
// Avoid: creates a host record from a renderer record.
mainLogger.info(record.message, record.context)

// Prefer: preserve the received renderer record.
fileTransport.write(record)
```

Re-logging can:

- replace the renderer runtime with the host runtime;
- assign a second timestamp;
- duplicate console output;
- apply level filtering twice;
- create a loop when transports are composed incorrectly.

The host's own application logs continue through its host root logger.

### Infrastructure Failures

Native RPC may itself need logging. Do not make successful delivery through the
same RPC channel the only way to diagnose its failure.

Keep direct guarded console output available inside the logging and native-RPC
infrastructure. Avoid a cycle where an RPC failure logs through the failing RPC
transport indefinitely.

## File Persistence

The file transport owns:

- record formatting, such as JSONL or readable text;
- file location;
- append and flush behavior;
- rotation and retention;
- file read/export capabilities;
- platform-specific filesystem errors.

Reuse a public application-data path provider when one exists. Do not import a
different package's private runtime helper. When no public provider exists,
keep a minimal platform resolver inside the host transport or inject one from
the host composition root.

Keep the stored representation stable enough for inspection, but do not turn
the file transport into a universal object or error serializer.

Errors need a small boundary representation. Preserve the standard text and
stack of an actual `Error`; use the established small string fallback for other
values. Preserve an existing `originStack` independently. Scope and context
should already contain plain diagnostic values; if they are circular or
unsupported by the wire, dropping that record is preferable to adding a
recursive sanitizer to the shared logger.

## Stack And Origin Preservation

The transport must not invent a later origin:

- a browser persistence transport keeps the facade-captured origin;
- a React Native native-file transport keeps the JavaScript error and origin
  strings without depending on private LogBox or Metro APIs;
- a renderer RPC transport keeps renderer stacks;
- a desktop host writes received renderer stacks directly instead of replacing
  them with handler or file-writer frames;
- a host-side failure remains a separate host error correlated by a safe request
  identifier.

Production persistence is useful only when the corresponding web, Node,
Hermes, or native source maps and symbols can be matched to the exact release
or OTA update. Read `trace-origins.md` for the capture helper, platform details,
symbolication, and verification matrix.

## Telemetry

A telemetry breadcrumb transport may receive ordinary structured records.
Apply the SDK's established filtering and lifecycle at that boundary.

An application-event transport should receive only records explicitly marked
as events:

```ts
const openReplayTransport: LogTransport = {
  write(record) {
    if (record.kind !== "event") return

    tracker.event(record.message, {
      ...record.scope,
      ...record.context,
      level: record.level,
      timestamp: new Date(record.timestamp).toISOString(),
    })
  },
}
```

Keep this transport in the provider integration package and register it at the
runtime composition root. Provider initialization, user identity, consent, and
reset remain explicit provider operations rather than logger methods.

Do not automatically translate every `error` record into an exception incident.
Exception capture has different semantics and belongs to error reporting.

Do not derive counters, timings, or analytics events from ordinary log messages
or levels. Use explicit typed instruments or event records.

## Tests

Use an in-memory transport to assert records without mocking the console:

```ts
function createMemoryTransport() {
  const records: LogRecord[] = []

  return {
    records,
    write(record: LogRecord) {
      records.push(record)
    },
  }
}
```

Verify:

- child scopes merge without mutating their parents;
- one method call creates one record;
- one broken transport does not block another;
- registration and removal are deterministic;
- queue limits and drop policy are enforced;
- flush sends the remaining batch;
- host ingestion preserves renderer metadata and timestamps.
- original error stacks remain unchanged after repeated transport delivery;
- origin stacks survive queues and renderer-to-host delivery as separate data;
- telemetry transports ignore ordinary records unless their policy explicitly
  includes them;
- event identity survives any RPC or persistence boundary.
