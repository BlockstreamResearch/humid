# Fixtures

Documents the tests read rather than construct. A test that builds its own manifest inline is a
test of the shape that test's author had in mind; these are documents in the shapes the format
actually appears in.

`p2pk.manifest.json`, `dex`, `last_will`, `lending`, `lending_v2`, `lending_v3` and `zeroconf`
are the seven published example manifests from `stringhandler/txmanifest-wallet` at
`7d56516a1a1e44a586f25d45a34619c3953758dd`, vendored byte for byte, together with `p2pk.simf`.
They are here rather than fetched because a test that reaches the network fails for reasons
unrelated to the code, and because a corpus that can change under a pinned expectation is not a
fixture. Three generations of the lending protocol coexist in them, which is the point: the
format changed faster than its own specification, and a runtime that reads only the newest
generation reads two of the three wrong.

`current/` holds the same protocols rewritten in the container spelling the corpus uses now —
`contract_templates.<name>.actions` where the older files write `classes.<name>.methods`.
Nothing this runtime derives from one may differ from the other.

`p2pk-grouped.manifest.json` is not published. It is the p2pk protocol rewritten in the oldest
spellings — grouped classes and `compose_version` — because no legacy twin of a published
manifest exists to compare against, and the two declaration shapes have to be shown to converge
somewhere.

The contract sources these manifests reference are not published alongside them. In production
they arrive with the request.

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
