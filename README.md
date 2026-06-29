# Humid

Browser extension template for Humid.

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

The extension uses Vite and `vite-plugin-web-extension`. Build output is emitted to `dist/`.

## WalletConnect

Humid uses WalletConnect Wallet SDK through `@reown/walletkit`.

Create a WalletConnect project ID in the WalletConnect Dashboard and add it to your local env:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

`VITE_WALLETCONNECT_RELAY_URL` is optional. If it is not set, WalletKit uses its default relay.

WalletConnect runtime is initialized in the extension background, not in the popup or content script. Chain support is intentionally registry-based and empty in this template. Until a concrete CAIP namespace adapter is registered, session proposals are rejected with a standard WalletConnect unsupported-namespace error instead of pretending to support a default chain.

## Routes

- `#/auth/intro` - unauthenticated intro page
- `#/auth/create` - local vault creation flow
- `#/local-auth` - local vault unlock page
- `#/app` - authenticated app area

Authentication is based on the local encrypted vault status. Users without a vault go to Auth, locked vaults go to LocalAuth, and unlocked vaults can enter App.

## Page Provider

The content script injects a page provider at `window.humid`.

```js
const response = await window.humid.request({
  method: "ping",
  data: { hello: "world" },
});

console.log(response);
```

WalletConnect session state is controlled from the extension popup through background RPC methods:

```ts
import { getWalletConnectStatus, pairWalletConnectUri } from "@/core/walletconnect";

const status = await getWalletConnectStatus();
await pairWalletConnectUri({ uri: "wc:..." });
```
