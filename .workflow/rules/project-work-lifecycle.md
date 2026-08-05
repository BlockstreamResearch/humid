# Leaf project work lifecycle

This checkout is an implementation surface. Its configured knowledge
repository owns significant-work bundles and current project knowledge.

1. Route the request with `manage-project-work`.
2. For significant work, create or reuse one central bundle and run `wfctl work
   status` plus the stage-specific `wfctl work context`.
3. Use `specify-project-change` for a bounded contract or
   `shape-project-direction` only for explicit Wayfinder.
4. Align the contract with curated knowledge and analyze source Graphify-first.
   An empty or uncovering corpus is a supported state in an existing project:
   report that nothing curated covers this work and what the alignment rested on
   instead, rather than reporting no conflicts. Recommend a reconstruction when
   the gap is material; never treat one as a precondition for the work.
5. Record explicit framing approval before code edits.
6. Use `split-project-change` for multi-session work. It creates central issues,
   never leaf-local tickets.
7. Use `implement-work-item` for one frontier issue. Read every required file,
   record current receipts, and claim the issue from this exact checkout before
   implementation.
8. After material discussion or investigation, preserve consequential new
   understanding in the owning record's broad `Discovery ledger`, update the
   affected semantic state, then refresh its structured checkpoint last. Never
   copy active progress into the inbox.
9. Verify behavior through direct production-path inspection and fresh checks.
10. Preserve implementation in the exact clean Git commit only with normal
    maintainer authorization.
11. Run `verify-project-work` across the whole bundle and every bound source
    revision, obtain completion approval, then promote verified durable truth
    and close honestly. That order is not a preference: a curated page cites the
    change as its authority, and that citation resolves only once the change is
    receipt-ready, which requires the recorded completion approval. Drafting the
    pages earlier is useful and costs nothing; writing them into `knowledge/`
    earlier leaves the corpus invalid so that progress can look further along
    than it is.

On a clean session or resume, run `wfctl work context --stage resume` without an
ID. It may auto-select only one bound active record; multiple records require a
maintainer choice. Read its complete required-file set and discovery ledgers,
then verify status. Before code edits, after any directory or branch change,
after compaction, and before verification, re-run work status. Every reported
code root is an exact workspace. The returned bundle/spec path is for records
only. A worktree is not interchangeable with another checkout of the same
repository.

Do not claim completion with unseen or stale bundle files, open issues or
claims, uncovered acceptance IDs, unresolved Wayfinder fog, dirty checkouts, or
missing evidence. Use partial or abandoned outcomes instead of relabeling gaps.
