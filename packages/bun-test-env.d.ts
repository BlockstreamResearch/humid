/// <reference types="bun-types" />

// Makes `bun:test` resolvable to `tsc`, which the test files import from. `@types/bun`
// re-exports `bun-types` and is supposed to be picked up automatically, but is not under
// this project's configuration.
