# Wayfinder contract

## Entry test

Use Wayfinder only when all are true:

- the initiative can materially change product meaning, architecture,
  ownership, or several Areas;
- the destination can be named, but multiple dependent choices still hide the
  route;
- one honest specification cannot yet fit in a single well-reasoned session;
- the maintainer explicitly selected or accepted this mode.

A large but bounded feature, migration, audit, or refactor belongs to ordinary
significant work. Brainstorming remains conversational until durable shaping is
actually wanted.

## Map roles

`map.md` is an index, not the store of every answer:

- `destination` fixes what the route is finding and therefore its scope;
- `notes` holds standing domain and process context;
- `resolved` points by issue name to full issue resolutions;
- `fog` holds in-scope uncertainty that cannot yet be phrased precisely;
- `out_of_scope` holds work beyond the destination that never graduates.

A precise unanswered question is an issue, even when blocked. A vague suspected
question remains fog. When resolution makes fog precise, create the new issue
and remove that fog item.

## Issue roles

- **Research (agent-driven):** establishes a fact from primary or project
  sources. It cannot establish product authority.
- **Prototype (human-in-the-loop):** creates a cheap disposable artifact to
  make a design question concrete.
- **Grilling (human-in-the-loop):** resolves a product, domain, or architecture
  choice one focused question at a time.
- **Task (agent- or human-driven):** performs a prerequisite that exposes facts
  needed by later decisions; it does not deliver the destination.

The frontier contains ready, unclaimed issues whose blockers are completed.
Claim before work. Resolve one non-research issue per session. The full answer
and evidence live in that issue; the map stores only a gist and pointer.

## Exit test

Wayfinder is ready for specification only when:

- destination and out-of-scope boundaries are explicit;
- every issue is completed or deliberately dropped with a reason;
- no in-scope fog remains;
- accepted language and decisions are distinguishable from proposals;
- the next bounded change can be specified without guessing.

`specify-project-change` then reads the complete map bundle, synthesizes
`change.md`, and finishes the map into `full` or `slice`. It preserves `map.md`
as lineage and never bypasses specification into implementation.
