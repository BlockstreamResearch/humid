/// <reference types="bun-types" />

// Makes `bun:test` resolvable to `tsc`, which the test files import from.
//
// `@types/bun` re-exports `bun-types` and is supposed to be picked up automatically,
// but it is not under this project's configuration, so the reference is stated once
// here rather than repeated at the top of every test file — the same arrangement
// `vite-env.d.ts` already uses for Vite's ambient types.
//
// No `export {}` below, deliberately: this file is a declaration script rather than a
// module, which is what a bare triple-slash reference wants to be. An empty export would
// make it a module whose only statement exports nothing.
//
// Side effect worth knowing: the reference makes Bun's globals visible to application
// code, which does not run under Bun. Reach for a browser or extension API there,
// not `Bun.*`.
