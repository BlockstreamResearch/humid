# The simplicity-lending contracts

The five SimplicityHL sources the `lending`, `lending_v2` and `lending_v3` manifests
reference, from `BlockstreamResearch/simplicity-lending` at
`d0d46ffaf82c333d5e0650609969557100dc00d9`, vendored byte for byte.

They are here because the manifests do not ship them — in production they arrive with
the request — and without them nothing can check that this wallet derives the addresses
a deployed protocol actually uses rather than merely deriving *some* address
reproducibly.

`lending.simf` is the case the fixed point exists for: four of its thirteen parameters
are other covenants' script hashes, two of them the finalised form of the same vaults.

None of the five declares a `simc` directive, so the compiler-version refusal has
nothing to check them against and they proceed.
