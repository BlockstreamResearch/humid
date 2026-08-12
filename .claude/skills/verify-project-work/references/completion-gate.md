# Completion gate

A completed record requires:

- every plan and acceptance checkbox resolved;
- the change and every relevant issue have a current structured checkpoint;
- every stable acceptance ID marked verified and paired with passed evidence;
- every bundle file except the review ledger accounted for at its current hash;
- no unseen, changed-after-review, or invalid bundle file;
- every work issue completed or explicitly dropped, with no active claim;
- every acceptance ID covered by a non-dropped delivery issue when issues are used;
- no issue dependency cycle or completed issue with an unresolved blocker;
- any retained Wayfinder map resolved, with no remaining fog;
- at least one relevant Graphify query recorded for code-scoped work;
- `acceptance_reviewed: true`;
- `implementation_reviewed: true` for code-scoped work, or
  `knowledge_reviewed: true` for project-only work;
- `maintainer_review.framing.status: approved` with a human actor and timestamp;
- `knowledge_promotion.status: pending` with the pages drafted under the bundle's
  `promotion/` directory, `applied` with validated concept paths, or `not-needed`
  with a concrete reason;
- delivery that still matches the approved framing. Where the acceptance criteria
  have been reworded since the approval, or an issue was dropped from the route,
  closure additionally requires `maintainer_review.completion.status: approved` —
  it is the one case at the end where what was approved is not what was built;
- one or more fresh checks with commands and outcomes;
- `verification.result: passed`;
- no unresolved item without an explicit accepted disposition;
- a deviations section that says `None` or names every remaining gap.
- every bound source checkout clean so each recorded commit actually contains
  its verified implementation;
- a matching revision, worktree ID, and checks receipt for every bound
  repository. Single-leaf work may use the top-level verification fields;
  multi-repository work uses `verification.repositories`.

Update semantic records first, refresh the owning checkpoint last, then re-read
the changed record and record its final file receipt. A checkpoint edit changes
the file hash; recording the receipt before the checkpoint would immediately
make that receipt stale.

Nothing here needs the maintainer. Every item is something the record either
carries or does not, which is why closure is the agent's: a person asked to
confirm this list is signing arithmetic they cannot check better than the tool.
What is theirs is the framing before the work and the pages after it.

The CLI validates the bundle graph, file hashes, record structure, exact source
bindings, and any promoted concept files. It cannot prove that a conversation
occurred, that semantic evidence is correct, or that no material claim was
omitted. The agent must record a maintainer approval only after an explicit
decision, and the maintainer remains responsible for that decision.

If a requirement is intentionally dropped, update scope and record who accepted the change. Do not merely check it off.
