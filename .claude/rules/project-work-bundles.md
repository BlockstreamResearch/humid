# Central project work bundles

The agent owns routine `wfctl work` commands and structured records. The
maintainer supplies intent, corrections, authority, and explicit review
decisions; do not make them operate the tracker.

For significant work, create exactly one bundle under
`changes/active/<change-id>/` before extended discussion. `change.md` is the
parent contract, `map.md` is optional Wayfinder lineage, `issues/` contains
bounded work, `artifacts/` contains referenced support, and `review.md` records
full-file accounting. A leaf stores only an ignored binding pointer.

After every material maintainer turn or agent investigation cycle, preserve any
new information whose loss could cause repeated material investigation, a
different choice, misunderstanding, or unsafe action. Append it to the owning
change or issue `Discovery ledger` with observation, evidence, implication,
scope, and disposition. The ledger is not a fixed taxonomy or activity log.
Then update current state, decisions, acceptance, progress, and evidence, and
run `wfctl work checkpoint` last. A stale checkpoint blocks later gates.

After interruption, compaction, or a clean-session start, run `wfctl work
context --stage resume` without an ID. Auto-select only when exactly one active
record is bound here; when several exist, inspect `wfctl work status` and ask
the maintainer rather than guessing. Inspect the reported checkpoint, read
every required file and discovery entry completely, verify the exact claim and
code roots, and resume from the bundle rather than conversation memory.

Use `changes/inbox/` only for pending captures that have no active or curated
owner. Never duplicate active progress there. Resolve each capture to existing
destinations or discard it with a reason so the inbox remains a real queue.

Before claiming an issue, record a current review receipt for every required
context file. Claim from the exact bound leaf before code work. Never infer a
worktree from repository name, branch, sibling paths, or bundle location.

Wayfinder is deliberate and planning-only. It resolves precise question issues
and fog into a reviewed specification before any delivery issue or product-code
implementation begins.

Before completed closure, enumerate the entire bundle with `wfctl work context
--stage review`, re-read every file, refresh stale receipts, reconcile every
stable acceptance ID against direct evidence, promote durable truth separately,
and obtain explicit maintainer completion approval.
