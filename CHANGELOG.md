# Changelog

## [2.0.0]

### Breaking

- Contract actions follow Tx Manifest 0.3.1 only. Manifests in older formats are refused.
- Contract transactions pay exactly the fee the confirmation shows, priced and finalized by Simplex 0.3.0.
- Pages reach the wallet only through a dedicated extension port. Window messaging is removed.
- Dapps can add only regtest chains, over https except on loopback.
- `signIdentity` signs a 32-byte digest for any identity other than SSH.
- The AppKit adapter names accounts by id. Dapps read Liquid addresses with `getAddress`.

### Added

- Tx Manifest 0.3.1 coverage: change policy, unused witnesses, per-input sequences, issuance and reissuance from the wallet and from programs, payments to other addresses, taproot keys and burns, blinded program inputs and outputs with chosen blinding factors, and computed and wallet-sourced parameters.
- Redesigned approval screens with a fee choice, full inputs and outputs, marks on every value the dapp wrote, and a receipt once sent.
- An Activity tab with pending, signed-but-not-sent and confirmed transactions, labeled by the dapp that made them.
- `getUTXOs` returns the confidential commitments of each output, and `processConfidentialTransaction` returns the issuances it creates.
- `@humid/wallet-rpc`, the dapp-facing RPC contract as types.
- Contract presets in the web app, end-to-end tests on a local regtest, and Storybook play tests in CI.

### Changed

- Moved to Simplex 0.3.0 and upstream LWK.
- Transactions are broadcast through LWK, and a refused transaction shows the node's reason.
- Spending requests run one at a time, and sent or signed transactions stay held until a scan shows them.
- Change is blinded as the protocol asks, and also when a single blinded output would otherwise reveal its amount.
- Assets without registry metadata show as an unknown asset in raw units, with the full asset id.
- A locked wallet answers pre-approved reads with an error instead of opening a prompt.

### Security

Fixes from the November 2026 audit:

- Approvals count only when they come from the wallet's own window, and a page's origin is fixed when the page connects.
- `signPset` refuses inputs the wallet does not own, ignores dapp-supplied derivations, enforces the declared sighash types and lists issuances and unverifiable outputs.
- Contract reviews match programs to inputs and outputs by id, show issuances and show full recipient addresses.
- Revealing the recovery phrase needs the password, and a reset needs RESET typed out.
- Unlock attempts are throttled across restarts, and passwords need at least 8 characters.
- WalletConnect telemetry is off, and CI pins every action to a commit and builds releases without caches.
