/// <reference types="bun-types" />

// Makes `bun:test` resolvable to `tsc`, which the test files import from. Same
// arrangement, and the same reason, as `apps/extension/src/bun-test-env.d.ts`:
// `@types/bun` re-exports `bun-types` and is supposed to be picked up automatically,
// but is not under this project's configuration.
//
// It exists because until the packages were typechecked at all, nothing needed it.

export {};
