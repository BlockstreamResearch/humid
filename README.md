![](https://github.com/user-attachments/assets/02f2aa4c-53ce-4f72-aaf8-c911150b8153)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Community](https://img.shields.io/endpoint?color=neon&logo=telegram&label=Chat&url=https%3A%2F%2Ftg.sumanjay.workers.dev%2Fsimplicity_community)](https://t.me/simplicity_community)

# Humid

**Simplicity-first browser extension wallet for Liquid.**

## Overview

Humid is a PoC wallet that acts as a playground for various user-facing Simplicity experiments. It may never become a standalone product as its main focus is to showcase what Simplicity UX may look like.

> [!WARNING]
> This is experimental software, use at your own risk.

## Goals

Here are the core goals the Humid wallet pursues:

- Neat, fast, and minimalistic browser extension.
- Privacy-oriented functionality limiting what dApps can see without explicit user approvals.
- Generic dApp <> wallet communication interface via [Wallet RPC ELIP](https://github.com/ElementsProject/ELIPs/pull/36).
- Building and signing of Simplicity transactions via [Tx Manifest ELIP](https://github.com/ElementsProject/ELIPs/pull/41).
- Display exactly what transcations are doing via [Simplicity Clear Signing ELIP](https://github.com/ElementsProject/ELIPs/pull/40).
- Wallet Connect infrastructure for establishing a dApp <> wallet connection.

## dApp approvals

- Requested read-only permissions start selected; signing and spending still require approval.
- Confirmations are queued and shown one at a time in the same notification window. Requests that need the wallet while it is locked wait behind a single unlock prompt, which goes ahead of queued confirmations; once unlocked, each request continues to its own confirmation. Dismissing the prompt (closing the window or its five-minute timeout) rejects them with `4900` "Wallet is locked". Unlocking from the popup also releases them.
- Generic signing approvals show the requester, method and signing contents. Their amounts use base units and include asset identifiers. Contract actions retain their separate manifest-based review.
- PSET review blinds the transaction once, then inspects fees, wallet balance changes, outputs and effective sighashes. After approval, signing uses the exact reviewed PSET without blinding again. Effective sighashes are separate from requested allowances, with a mismatch warning.
- Each method's confirmation policy can set `timeoutMs`: five minutes for `processConfidentialTransaction`, otherwise the existing 30-second default. The unlock prompt defines its own five minutes in `unlockConfirmation.ts`.

## Contributing

We are open to any contributions that drive these goals forward! Please take a look at our [contributing guidelines](CONTRIBUTING.md) to get involved.

## License

The wallet is released under the MIT License.
