# Proven Platform Patterns

Use these compact shapes when adapting the logging foundation to a concrete
client runtime. They are examples of the same contract, not four competing
logger designs.

## Web

Place a reusable facade in a package when several workspace modules or
applications can consume it. Keep browser persistence application-owned:

```text
packages/logger
    -> contract, factory, console transport

apps/web/core/logger
    -> configured web root
    -> IndexedDB transport
```

The IndexedDB transport owns batching, retention, queries, export, and mapping
between the current common record and any legacy stored schema.

New errors should receive the transport's minimal string fallback before JSONL
export. Preserve an actual error stack and any separately captured origin stack.
Other non-cloneable context still fails best effort; do not add a recursive
common serializer.

## React Native

In a single-application repository, prefer an application module over an
artificial workspace package:

```text
core/logging/index.ts
    -> facade and process-local root

core/logging/transports/native-file.ts
    -> buffer, JSONL, rotation, native filesystem
```

Initialize once before application features start. Register a best-effort flush
when the established app lifecycle leaves the active state. Skip the native
file transport on web.

Keep the original `Error` for console and incident providers. Persist its
standard stack separately from a facade- or operation-captured origin. Release
and OTA-update traces require their matching Hermes source maps. Include stable
release correlation in the root scope, such as the application version,
runtime version, and update identifier; an OTA stack without its exact update
identity cannot be matched reliably to an artifact.

Keep filesystem behavior inside the transport and test the installed API
version. In particular, determine whether move/rename operations mutate the
source object before using them for rotation.

## Electron

Use one package with explicit runtime entrypoints:

```text
logger
├── index.ts
├── native/client.ts
├── native/main/index.ts
└── preload.ts
```

- `index.ts` is Electron-free.
- `native/client.ts` configures renderer console plus bounded batch RPC.
- `native/main/index.ts` configures main console plus file persistence and
  registers `writeBatch`.
- `preload.ts` owns a console-only process-local root.

The renderer transport should only be installed when the preload bridge exists,
so browser previews and Storybook remain valid consumers. The main handler
writes received records straight to the file transport, including renderer
error and origin stacks.

Choose one incident policy.

```ts
// Diagnostic logger and explicit incident reporter are separate.
log.error("Workspace load failed", error, { workspaceId })
reporting.captureException(error)
```

Use that shape when some error logs are diagnostic-only. Ensure one owner calls
both operations once; do not add a second global observer for the same failure.

Alternatively, a repository may define every error record as incident-worthy:

```text
reportError(error)
    -> one logger.error record
        -> console and file transports
        -> incident-provider transport
```

In that policy, the provider transport owns `captureException` and receives the
original local `Error`. Application reporting code must not also call the
provider SDK. If only selected errors are incidents, add an explicit record kind
or call option rather than deriving intent from text.

When the renderer also uses OpenReplay or another session provider, keep its
event adapter in that provider package:

```text
feature logger.event(...)
    -> renderer logger
        -> console and file transports
        -> OpenReplay event transport
```

The provider transport always forwards explicit event records. Under the
repository's incident policy it may also forward eligible error records,
preserving the original `Error`, scope, context, and separate `originStack`.
Create a fallback `Error` only inside the provider boundary when its SDK
requires one and the record contains a non-Error value.

Initialization, identity, consent, and reset remain provider control operations;
they are not log transports.

## Electrobun

Use the same package split, replacing Electron entrypoints with the repository's
Electrobun native-module conventions:

```text
renderer logger
    -> console
    -> bounded writeBatch client

Bun handler registry
    -> validate batch
    -> host file transport
```

Register `writeBatch` in the native handler/module registry. If the repository
also derives agent capabilities from handler definitions, leave logging
unexposed unless it has explicit capability metadata.

The host file transport may resolve its own application-data location or
receive a public resolver from the composition root. Do not reach into another
package's private filesystem implementation.

## Shared Proof Obligations

Across all four variants, verify:

- shallow scope and context snapshots;
- original local error identity before a boundary;
- boundary-local error text and standard stack without domain conversion;
- origin stacks kept separate from error stacks;
- bounded async queues and deterministic flush;
- independent transport failures;
- stable persisted schemas or explicit adapters;
- no native requests when the native bridge is absent;
- no host re-logging of renderer records.
- matching source maps or symbols for production releases and updates;
- explicit event identity preserved across transports;
- no accidental promotion of ordinary `info` logs into remote events.
