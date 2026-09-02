# Fixtures

Documents the tests read rather than construct. A test that builds its own manifest inline is a
test of the shape that test's author had in mind; these are documents in the shapes the format
actually appears in.

`p2pk.manifest.json` and `p2pk.simf` are the published p2pk protocol at txmanifest-wallet
`7d56516a1a1e44a586f25d45a34619c3953758dd`, unmodified.

`vaultlet.manifest.json` and `current/vaultlet.manifest.json` are one synthetic protocol written
twice, in the two container generations the corpus carries: `classes.<name>.methods` with a
`deploy` flag, and `contract_templates.<name>.actions` with `is_constructor`. Nothing derived
from either may differ from the other, which is most of what makes the pair worth having. Between
them they exercise a class method reading a deployment's fields, a covenant wired to a bare value,
a covenant hash that depends on another covenant hash, and the deprecated `compile_params.`
reference namespace.

`mutual.manifest.json` declares two covenant hashes each built from the other. No published
protocol does this and none should: it is here so that the refusal for a set of hashes that never
settles is a refusal about a real document rather than about a contrived one.

`contracts/` holds the synthetic SimplicityHL sources those two name. They are never compiled
here — every test supplies a substitute for the compiler, because this package holds none.
