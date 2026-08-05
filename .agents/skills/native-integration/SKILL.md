---
name: native-integration
description: Use whenever work adds, changes, reviews, or debugs desktop native integration in Electron, Electrobun, or another host/webview runtime. Trigger for Electron main-process, preload, contextBridge, ipcMain/ipcRenderer, IPC channels, Electrobun BrowserView/Electroview RPC, native modules, handler definitions, typed renderer clients, method or event registries, capability metadata or catalogs, runtime validation schemas, host registration, filesystem or OS access, deep links, secure storage, updates, and exposing native operations to automation, agents, or MCP.
---

# Native Integration

Treat Electron, Electrobun, and similar desktop runtimes as transport adapters
around the same modular native-RPC architecture:

```text
shared contract
    -> handler definitions
    -> native feature module
    -> central host registry
    -> runtime transport
    -> typed renderer client

handler definitions
    -> capability catalog
    -> optional automation, agent, or MCP consumers
```

The renderer is sandboxed. The host owns privileged work. A typed, validated,
inspectable native registry is the boundary between them.

First inspect the repository's existing native-RPC foundation and one complete
feature module. Extend that pattern. Do not introduce a parallel raw IPC system.

## Start From A Feature Module, Not A Channel

A native integration is a feature with a contract, handlers, metadata, and a
client. It is not merely an IPC string.

Examples include:

- filesystem and operating-system access;
- secure storage and keychain operations;
- windows, dialogs, notifications, and shell operations;
- deep links and application lifecycle;
- application updates;
- local services and native addons.

Each feature owns its contract and runtime implementation. The application
composes features through one registry. Transport-specific wiring must not
become the owner of feature behavior.

## Prefer Package-Owned Native Features

If a native feature can be isolated behind a coherent contract, place it in
`packages/`. This is the default, not an optimization reserved for features
already shared by multiple applications.

The package should own:

- its shared contract and method registry;
- its handler definitions and host implementation;
- its typed renderer client;
- its runtime-specific entrypoints when required.

The application should only compose and register the package. Keep a feature
inside an application only when it is genuinely inseparable from that
application.

An illustrative package may expose surfaces such as:

```text
packages/{capability}/
└── src/
    ├── index.ts
    └── native/
        ├── index.ts
        ├── client.ts
        ├── main/
        │   └── index.ts
        └── bun/
            └── index.ts
```

This is not a mandatory literal tree. Use only the runtime entrypoints the
project needs. Apply **file-structure** recursively to decide exact placement,
capability subfolders, public entrypoints, and local internals.

Shared and renderer entrypoints must never import host-only dependencies.

## Define One Shared Contract

Declare every callable method once in a feature-owned registry:

```ts
export const nativeMethods = {
  chooseDirectory: "workspace:choose-directory",
  readMetadata: "workspace:read-metadata",
} as const;
```

The contract must provide:

- a stable, feature-namespaced wire method;
- the request parameters for that method;
- the response for that method;
- runtime schemas for both request and response.

Prefer deriving TypeScript types from the schemas or another existing source of
truth. Do not separately hand-maintain method strings, DTOs, schemas, host
signatures, and renderer signatures.

Runtime validation of both parameters and responses is mandatory at the native
boundary. An exception is acceptable only when the established transport
already guarantees the exact runtime-validated contract or the value cannot
meaningfully be represented by the project's schema system. Document that
exception beside the definition. `void` input or output is still an explicit
contract, not an omitted one.

Do not create a generic `types.ts` dump. Keep each contract with the capability
that owns it.

## Define Inspectable Handlers

Every request handler definition should carry enough information to register,
validate, execute, inspect, and expose it without reconstructing knowledge
elsewhere:

- a stable name;
- its method from the shared registry;
- parameter and response schemas;
- an execution policy, including timeout behavior;
- a host-context factory or explicit dependencies;
- capability metadata.

Conceptually:

```ts
const chooseDirectory = defineNativeHandler({
  name: "chooseDirectory",
  method: nativeMethods.chooseDirectory,
  params: chooseDirectoryParams,
  response: chooseDirectoryResponse,
  execution: { timeoutMs: 30_000 },
  capability: {
    id: nativeMethods.chooseDirectory,
    title: "Choose workspace directory",
    description: "Opens the native directory picker.",
    exposure: false,
    requiresApproval: true,
  },
  createContext: createWorkspaceContext,
  handle: async ({ params, context }) => {
    // Privileged feature logic belongs here or in an injected service.
  },
});
```

Names and helper signatures are illustrative. Reuse the repository's native-RPC
primitives instead of recreating this API.

Validate at the boundary. Keep privileged logic in the handler or an injected
host service, never in preload code or renderer code.

Use bounded timeouts by default. Disable a timeout only for an operation whose
lifecycle is legitimately open-ended, such as waiting for a native user prompt,
and make that decision explicit.

## Make Capabilities Universal And Exposure Explicit

Every registered handler must include capability metadata even when its only
current consumer is the renderer.

At minimum, metadata should make these facts discoverable:

- stable capability id;
- human-readable title and description;
- safety or effect classification used by the project;
- whether explicit approval is required;
- whether the capability may be exposed outside the ordinary renderer client.

Exposure is opt-in. The default must be `false`, `none`, or the repository's
equivalent. Registration makes a handler callable by the trusted application
client; it does not automatically make it available to automation, agents, or
MCP.

Derive the capability catalog from handler definitions and their schemas. Do
not maintain a second manual registry. Automation, an agent, MCP, a command
palette, or another future consumer may read the catalog, but none of them owns
the native architecture.

Operations with destructive effects, external side effects, sensitive data, or
arbitrary native-tool execution should require approval according to the
project's policy.

## Build A Native Feature Module

A native module aggregates the feature boundary:

- module name;
- method registry;
- request map;
- handler loader or handler map;
- handler definitions and capability metadata;
- typed renderer client.

The module must not know which application will register it. Host-only handlers
may load lazily to keep native dependencies out of shared and renderer bundles.

Registration should fail clearly for duplicate methods, missing handlers, or a
contract that cannot be validated. Do not silently allow incomplete modules.

## Keep One Reviewable Host Registry

The host application should have one central registry that composes all native
modules. Adding an isolated feature should require one obvious registry entry,
not edits across unrelated switches and transport files.

The registry should be able to:

- combine request contracts;
- load and dispatch handlers by method;
- enumerate handler definitions and capability metadata;
- detect duplicate or missing registrations.

Register the complete host surface before the renderer or webview can call it.
Application-owned registry code is wiring only; feature logic remains in its
package.

## Generate A Thin Renderer Client

Build the renderer client from the same request map and method registry used by
the host.

The renderer:

- imports a client-safe entrypoint such as `native/client`;
- calls feature methods, not raw transport channels;
- never imports host entrypoints, native addons, or `node:*`;
- never repeats method strings or request/response types;
- guards native-only access when the project also runs in a browser, test, or
  Storybook environment.

Keep transport errors in their native form unless the project already defines a
specialized error registry or conversion flow. Follow that established flow
when it exists. Never invent a new normalization layer inside a feature client.

## Adapt Only The Transport

The feature module and contract remain conceptually the same across runtimes.
Only the adapter changes.

| Runtime | Host adapter | Renderer boundary |
| --- | --- | --- |
| Electron | Register the combined request map through `ipcMain.handle` or the repository's wrapper | Expose one narrow preload bridge through `contextBridge`; the typed feature client invokes it |
| Electrobun | Register the combined schema and handlers through the project's BrowserView RPC wrapper | Construct the typed client through Electroview RPC or the repository's wrapper |

For Electron, prefer one shared bridge surface over a new `window.*` global for
every feature. Preload forwards validated typed calls; it contains no feature
business logic.

For Electrobun, keep Bun-only handlers behind the Bun runtime entrypoint and
webview-safe client code behind the client entrypoint.

Follow the exact runtime API and versions already installed in the repository.
Do not make feature packages depend on transport details that belong in the
adapter.

## Treat Requests And Events As Separate Contracts

Request-response is the default for commands and queries: send typed parameters
and receive one typed result.

Events are first-class for host-pushed information such as:

- deep-link navigation;
- update or download progress;
- native lifecycle changes;
- long-running operation progress;
- notifications produced outside a renderer request.

Define a typed event registry and payload map rather than scattering event
strings. Every renderer subscription must return an unsubscribe function that
removes the exact listener it registered.

Do not emulate request-response with ad hoc event pairs. Do not emulate a native
event stream with polling or repeated invokes.

How a component subscribes and manages its lifecycle remains a React concern;
follow **components**, including its strict guidance on avoiding `useEffect`.

## Preserve The Privilege Boundary

- The renderer never accesses the filesystem, OS, native addons, keychain, or
  host lifecycle directly.
- Validate untrusted request parameters before privileged work and validate the
  result before returning it across the boundary.
- Prefer narrow operations over arbitrary primitives: for example, a specific
  trusted URL operation instead of unrestricted shell execution.
- Inject host context such as windows, services, paths, and application metadata
  rather than importing ambient global state throughout handlers.
- Follow the project's existing logging and error policy. Do not leak secrets,
  sensitive native details, or arbitrary host error payloads across the bridge.

## Implementation Workflow

1. Inspect the native-RPC foundation, central registry, and one complete native
   feature already present in the repository.
2. Decide whether the feature can be isolated into a package. Prefer a package
   whenever it can.
3. Define the method registry, request map, and runtime schemas.
4. Implement handler definitions with execution policy, host context, and
   capability metadata.
5. Aggregate them into a native feature module.
6. Derive or build the typed renderer client from the same contract.
7. Add one explicit entry to the central host registry.
8. Add a typed event contract only when the host must push information.
9. Test contract validation, handler behavior, registry completeness, client
   typing, and subscription cleanup as applicable.
10. Run the repository's focused formatting, linting, type-checking, tests, and
    native build checks.

## Avoid

- scattered raw `ipcMain`, `ipcRenderer`, or RPC method strings;
- a separate preload global for every feature;
- duplicate request/response types on opposite sides of the boundary;
- handlers without parameter or response validation;
- registered handlers without capability metadata;
- exposing registered handlers to agents, MCP, or automation by default;
- large application-level switches that own feature dispatch;
- renderer imports from host runtime entrypoints;
- host imports leaking into shared or client bundles;
- keeping an isolatable native feature in an application instead of `packages/`;
- a generic native, handlers, or types dumping ground.

## Related Skills

- Exact package and feature-internal placement, visibility, and entrypoints →
  **file-structure**.
- Native client errors and external-service access → **api-integration**.
- Secure persisted state consuming a native provider → **state-management**.
- Native deep links entering the route tree → **routing**.
- Host and renderer diagnostic delivery → **logging**.
- Native failure propagation, exception reporting, and runtime boundaries →
  **error-handling**.
- Native-originated user notifications and recovery presentation →
  **user-feedback**.
- Formatting, linting, type-checking, tests, and native build checks →
  **code-quality**.
