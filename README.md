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

## Routes

- `#/auth/intro` - unauthenticated intro page
- `#/auth/create` - secret key creation page
- `#/app` - authenticated app area

Authentication is currently template-level only. A non-empty `secretKey` value in the Zustand `auth` store is treated as an authenticated state.

## Page Provider

The content script injects a page provider at `window.humid`.

```js
const response = await window.humid.request({
  method: "ping",
  data: { hello: "world" },
});

console.log(response);
```
