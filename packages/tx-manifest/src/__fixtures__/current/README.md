# The same protocols, as their authors publish them now

The five example manifests from `stringhandler/txmanifest-wallet` at
`1cbb5101833f35156f3581a9666a4b12236cd5d2`, fetched 2026-08-07 and vendored byte
for byte.

They are the same protocols as four of the documents beside them, and they are
here **as well as** rather than instead of. The container that holds a contract's
actions was renamed between the two — `classes.methods` became
`contract_templates.actions` — and the wallet was blind to every one of these
documents until it was told the new name. A check that only ever ran against the
newer generation would hide the next rename exactly as the frozen copies hid this
one, and a check that only ran against the older one already did.

`zeroconf` carries no actions in either generation. It is here because a protocol
that declares nothing is the smallest real document there is, and because it is
the first of these five the wallet refuses nothing about.
