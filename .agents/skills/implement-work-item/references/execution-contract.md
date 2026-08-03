# Work-item execution contract

## Workspace invariants

- The central bundle is the record workspace.
- Each `Code root` from `wfctl work status` is an implementation workspace.
- A linked worktree is a distinct root even when it shares Git objects.
- Never infer a checkout from branch name, repository name, sibling paths, or
  the location of `change.md`.
- Re-run status after directory changes, compaction, branch changes, and before
  verification.

## Progress invariants

- Work exactly one claimed issue.
- Keep the issue current after requirements, evidence, scope, or the next
  action changes.
- Keep parent acceptance and decisions in `change.md`; link rather than copy.
- A fresh session resumes from `wfctl work context`, the full files it lists,
  and the exact claim—not from chat memory.

## Verification invariants

- Inspect the production path, not only tests or generated graph output.
- Prefer behavior checks at stable public seams.
- Run focused checks during development and the broader relevant suite before
  resolution.
- Separate verified facts, inference, and unverified limitations.
- Passing checks do not excuse an acceptance criterion that was never traced.
