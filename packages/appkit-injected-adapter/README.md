# @humid/appkit-injected-adapter

A [Reown AppKit](https://reown.com/appkit) adapter for an **injected wallet provider** that speaks
CAIP-25 (session authorization) + CAIP-27 (method invocation) — a ready-to-use **HUMID Liquid** preset
on top of an agnostic, fully-configurable core.

The wallet does not expose raw chain RPC methods on the page. A dapp authorizes a session with
`wallet_createSession`, then invokes every method through `wallet_invokeMethod`, scoped to a chain.
This package wraps that envelope and plugs it into AppKit as a normal injected connector.

## HUMID: zero config

Connecting to the HUMID extension is a one-liner — the preset carries every default (connector
identity, `window.humid`, the ELIP-1 method set, ecdsa signMessage), and the networks ship with it:

```ts
import { createAppKit } from "@reown/appkit/react";
import { HumidAdapter, liquidNetworks } from "@humid/appkit-injected-adapter";

createAppKit({
	adapters: [new HumidAdapter()],
	networks: liquidNetworks,
	projectId: "YOUR_PROJECT_ID",
});
```

Override any default by passing options, e.g. `new HumidAdapter({ methods: [...] })`.

## Any injected CAIP-25 wallet

The agnostic core works for any such wallet — supply the specifics instead of the HUMID preset:

```ts
import { InjectedCaipAdapter } from "@humid/appkit-injected-adapter";

const adapter = new InjectedCaipAdapter({
	namespace: "bip122",
	connector: { id: "my-wallet", name: "My Wallet", rdns: "com.example.wallet" },
	getProvider: () => window.myWallet,
	methods: ["getBalance", "signMessage"],
});
```

## Exports

- `HumidAdapter` — the HUMID-preset adapter (zero config).
- `InjectedCaipAdapter` — the agnostic core adapter.
- `liquid` / `liquidTestnet` / `liquidNetworks` — Liquid chains built with AppKit's `defineChain`.
- `LIQUID_*`, `liquidWalletRpcMethods`, `HUMID_CONNECTOR` — the underlying definitions.
- `createSession` / `getSession` / `invokeMethod` / `revokeSession` / `CAIP25_METHODS` — raw CAIP-25/27
  RPC helpers against any provider with a `request` method.
- `createInjectedProvider` / `waitForProvider` — the AppKit-compatible provider bridge.
- Types: `InjectedCaipAdapterOptions`, `HumidAdapterOptions`, `Caip25Scopes`, `RawInjectedProvider`, …
