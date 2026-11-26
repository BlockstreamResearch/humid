# Local regtest

A Liquid regtest for trying the wallet end to end. Requires the [Simplex](https://github.com/BlockstreamResearch/smplx) CLI with `elementsd` and `electrs` (`simplexup` installs all three).

```bash
bun run regtest
```

- Starts Elements (RPC `127.0.0.1:18443`, user and password `humid`) and Esplora (`127.0.0.1:3000`).
- Sends 1,000 L-BTC to the first address of the test mnemonic `abandon … about`. Restore the wallet from that mnemonic and pick the **Local regtest** chain.
- Mines a block whenever transactions are waiting.

The mnemonic is public. Never use it outside regtest.
