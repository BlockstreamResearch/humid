---
name: shape-project-direction
description: Run deliberate Wayfinder for a consequential project initiative whose destination is visible but route, product meaning, or architecture remains too foggy for one honest specification or agent session. Use only when the maintainer explicitly requests Wayfinder or accepts the router's recommendation. Do not use for ordinary brainstorming, a bounded large feature, current-project explanation, or product-code implementation.
---

# Shape Project Direction

Wayfinder finds a route; it does not build the destination. It stores one
low-resolution map and bounded question issues inside the same central bundle
that later becomes the delivery specification.

Read [the Wayfinder contract](references/direction-shaping-contract.md) before
charting or resuming.

## Chart the map

1. Reuse the initiative's active bundle or start one with `wfctl work start
   <slug> --title "<destination>" --mode wayfinder`. Bind only already-known
   evidence leaves; unknown future implementation repositories are not guessed.
2. Run `wfctl work context <id> --stage wayfind` and `wfctl work status <id>`.
   Do not edit product source during this phase.
3. Name the destination first: what a finished map will make specifiable, for
   whom, and the boundary it must not cross.
4. Explore breadth-first. Put a precise answerable question into a Wayfinder
   issue. Put only still-unphraseable in-scope uncertainty into `map.md` fog.
   Put ruled-out work under out of scope.
5. Create currently visible blockers before their dependants with `wfctl work
   issue create --phase wayfinding --type
   research|prototype|grilling|task`. Use `wfctl work issue block|unblock` when
   later evidence changes an edge. Stop charting; do not resolve a normal issue
   in the same session.

If breadth-first exploration reveals no meaningful fog and the whole route fits
one session, stop and recommend ordinary `specify-project-change` instead.

## Work one frontier question

Run `wfctl work map status <id>`. Without a named issue, choose the first
frontier item. Read the map, selected issue, parent change, blockers, and
referenced artifacts completely; record current hash receipts. Claim before
work:

```sh
wfctl work issue claim <id> <issue-id> --actor "agent:<identity>"
```

- `research` discovers an external or project fact without supplying product
  authority;
- `prototype` creates a cheap artifact for a real human to react to;
- `grilling` resolves one product/domain decision with the maintainer, one
  evidence-backed question at a time;
- `task` performs a prerequisite that makes a later decision possible.

Ask one focused question at a time. Persist the answer before selecting another.

Never answer the human side of a human-in-the-loop issue yourself. Complete at
most one non-research issue per session. Record the full answer and evidence in
the issue, then run `wfctl work issue complete`. The CLI adds only a named gist
to the map. Update newly visible issues and remove the corresponding fog so one
fact never lives in two competing places.

## Hand off to specification

The route is clear only when every Wayfinder issue is completed or explicitly
dropped, no in-scope fog remains, and the next bounded change can be specified
without guessing. Invoke `specify-project-change`: it must read all resolved
issues, synthesize stable acceptance criteria into `change.md`, obtain review,
and run `wfctl work map finish`.

Do not jump from a map directly into implementation. The retained `map.md` is
decision lineage, while `change.md` becomes the current delivery contract.
