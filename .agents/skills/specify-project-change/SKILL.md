---
name: specify-project-change
description: Synthesize an already-discussed bounded change, or a resolved Wayfinder map, into the one central project specification. Use when the maintainer explicitly asks to write or refresh the spec, when a direction map is ready to become delivery work, or before splitting approved work into issues. Do not use to discover a huge unresolved direction, implement code, or create a second specification outside the active knowledge bundle.
---

# Specify Project Change

Turn the context already earned through discussion, curated knowledge, and
source inspection into one buildable contract. Do not restart an interview or
discard decisions merely because a fresh template would be easier.

Read [the specification contract](references/specification-contract.md) before
editing the bundle.

## Bind and read

1. Resolve the active change ID. If no significant-work bundle exists, invoke
   `manage-project-work` to classify and start it first.
2. Run `wfctl work context <id> --stage shape`. For a resolved Wayfinder map,
   run `--stage review` so every map issue and artifact is enumerated.
3. Read every required file completely, including content below long tables or
   headings. Run `wfctl work review file <id> <path>` only after the whole file
   has been read and reconciled.
4. Run `wfctl work status <id>`. Treat `Spec` as the only editable
   specification and every `Code root` as an exact evidence workspace, never
   as a path inferred from repository name.

## Synthesize, do not invent

Use the current discussion without asking the maintainer to repeat it. Reconcile
it with relevant curated knowledge and verified source reality. If code informs
the contract, invoke `analyze-with-graphify` in every relevant bound root, then
open the actual source locations. Invoke `align-project-knowledge` before
settling product or architecture meaning.

Update `change.md` with:

- the problem and intended observable outcome;
- actors, current behavior, constraints, and explicit exclusions;
- approved product and engineering decisions with rationale;
- stable acceptance entries `AC-01`, `AC-02`, ... in frontmatter;
- the highest practical test seams and what behavior each seam proves;
- unresolved authority or facts, without guessing them away;
- the current ledger and structured resumable checkpoint.

Acceptance criteria describe observable outcomes and boundary behavior, not a
file-by-file implementation plan. Preserve an ID when wording improves without
changing meaning. Retire or supersede changed meaning explicitly.

Ask at most one blocking question at a time. Include verified facts, the
decision it unlocks, viable choices, and a recommendation. Persist the answer
before continuing. After each material edit or maintainer answer, refresh the
bundle checkpoint with `wfctl work checkpoint <id>`; run it last so its hash
binds the current `change.md` rather than an earlier draft.

## Review and continue

Present a compact framing packet: outcome, scope, exclusions, decisions,
acceptance IDs, test seams, risks, and unresolved work. Record only explicit
maintainer approval, and record it through the approval command rather than by
editing the receipt:

```sh
wfctl work approve <id> --stage framing \
  --by human:<maintainer-id> \
  --note "<what was approved>"
```

The command requires an interactive terminal, or `--token` matching
`WFCTL_APPROVAL_TOKEN` in unattended use. A hand-written
`maintainer_review.framing` receipt fails verification. Approving rewrites
`change.md`, so re-read it, refresh its review receipt, and refresh the
checkpoint afterwards.

For Wayfinder, read every resolved issue in full, collapse its linked detail
into the specification, clear all legitimate fog, review every current bundle
file, then run:

```sh
wfctl work map finish <id> --mode full|slice
```

The map remains as history; it is not copied into a parallel strategy file.
After approval, invoke `split-project-change` when the work needs multiple
fresh sessions. A small bounded change may remain entirely in `change.md`.
