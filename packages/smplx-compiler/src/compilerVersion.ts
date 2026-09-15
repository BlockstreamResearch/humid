/**
 * The SimplicityHL compiler version the shipped signing module compiles contracts with.
 *
 * This is the wallet's fact rather than the SDK's. A protocol declares which compiler its
 * contracts were built with, and the wallet refuses one it cannot reproduce — so the value
 * exists to be compared against a manifest, which is a wallet concern the SDK has no reason
 * to carry. It lived in the fork as a constant, then as a build script reading the workspace
 * manifest, and upstream asked for both to go; keeping the fact on this side rather than
 * defending it in someone else's crate is the smaller fork and the more honest home.
 *
 * It has a package of its own because two surfaces compare a protocol's declared version
 * against it: the extension, when it decides whether to build an action, and the dapp's
 * manifest inspector, which tells a protocol author what this wallet would make of their
 * document. The inspector cannot reach inside the extension, and a second copy written down
 * for it would be a second thing to keep true. Deliberately not inside the package that reads
 * manifests: that one is wallet-agnostic and takes this version as an argument precisely so it
 * never has to know one.
 *
 * Written down rather than derived at runtime because there is nothing to derive it from: the
 * module is a wasm blob and the version is a Rust dependency of the crate that built it. What
 * makes a written constant safe is that its drift is caught — `compilerVersion.test.ts` reads
 * the pinned version out of the submodule's own manifest and fails when the two disagree, and
 * this repository runs its tests on every push. That check is the whole reason this is not a
 * number somebody has to remember.
 */
export const SMPLX_COMPILER_VERSION = "0.6.0";
