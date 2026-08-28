# The published txManifest corpus

The seven example manifests from `stringhandler/txmanifest-wallet` at
`7d56516a1a1e44a586f25d45a34619c3953758dd`, vendored byte for byte. They are here
rather than fetched because a test that reaches the network is a test that fails
for reasons unrelated to the code, and because a corpus that can change under a
pinned expectation is not a fixture.

Three generations of the lending protocol coexist in it, which is the point: the
format changed faster than its own specification, and a runtime that only reads
the newest generation reads two of these three wrong.

`p2pk-grouped.manifest.json` is not published. It is the p2pk protocol rewritten in
the older spellings — grouped classes and `compose_version` — because no legacy
twin of a published manifest exists to compare against, and the two declaration
shapes have to be shown to converge somewhere.

The contract sources these manifests reference — `./lending.simf`,
`./asset_auth.simf`, `./issuance_factory.simf`, `./script_auth.simf`,
`./asset_auth_vault.simf` — are not published alongside them. In production they
arrive with the request.
