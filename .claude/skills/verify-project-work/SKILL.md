---
name: verify-project-work
description: Verify a significant project change against every file in its central bundle, every stable acceptance ID, and every exact bound source revision without hiding gaps. Use before claiming a bounded change, slice, multi-repository delivery, project-only decision, or architecture change complete; before knowledge promotion; or when auditing an implementation against its approved contract.
---

# Verify Project Work

Completion is a claim supported by complete accounting and fresh semantic
evidence. Structural green output is never proof by itself.

Read [the completion gate](references/completion-gate.md) before recording final
receipts.

## Account for the whole bundle

1. Run `wfctl work status <id>` and stop on any checkout, branch, worktree, or
   binding mismatch.
2. Run `wfctl work context <id> --stage review`.
3. Read every required file completely, including long issue tails and every
   artifact that informs the result. Mark only a genuinely irrelevant
   supporting artifact `irrelevant`, with a reason.
4. After each read, record `wfctl work review file <id> <path>`. Re-read and
   refresh a receipt whenever the file changes.
5. Run `wfctl work review status <id>` and require zero unseen,
   changed-after-review, or invalid files.

## Review on independent axes

**Contract axis:** map every stable acceptance ID to non-dropped issues,
production behavior, direct evidence, and a verification receipt. Find missing
requirements, partial behavior, scope creep, and implementation that appears
present but contradicts the contract.

**Engineering axis:** inspect the real diff and production path in every exact
code root. Invoke Graphify-first analysis, then open actual source, callers,
boundaries, state, errors, and consumers. Check project standards, architecture,
security, operations, and maintainability independently of whether the spec was
followed.

Run focused behavior checks and the broader relevant test, build, type, lint,
and runtime checks. Expected values must come from the contract or an
independent authority, not the implementation. Look adversarially for disabled
paths, placeholders, mocks, fixtures, temporary compatibility code, unhandled
branches, and silently deferred work.

Record one exact repository/revision/worktree receipt per bound leaf. Require a
clean commit containing the reviewed implementation; obtain normal maintainer
authorization before committing. For project-only work, verify decisions,
knowledge, and links without inventing code evidence.

## Promote and close

Decide whether verified durable truth changed. If yes, route product behavior
and engineering realization through their separate curation skills, run the
two-axis knowledge quality gate, validate every changed concept, and list exact
concepts under `knowledge_promotion`. Otherwise record a concrete no-update
reason.

A concept promoted from a bundle in a project with no reconstructed baseline
carries the same shape as one established by whole-project reading and a much
narrower footing: it was derived from whatever this task happened to touch. Say
so in its `maintainer-decision` source — name the bundle and state that no
reconstruction has covered this subject — so a later baseline knows to re-derive
it rather than treat it as already settled. Promote it anyway: knowledge grown
from real work is better than none, and the cost of the shortcut is only hidden
when nobody writes it down.

Present acceptance results, engineering findings, checks, deviations, risks,
and knowledge delta as one completion review packet. It is maintainer-facing:
the reader test in `maintainer-review` applies, so acceptance is named by what
was asked for rather than by criterion id, and a deviation by what changed for
the product rather than by which file moved. Record the maintainer's
explicit decision through the approval command; never write the receipt by
hand:

```sh
wfctl work approve <id> --stage completion \
  --by human:<maintainer-id> \
  --note "<what the maintainer accepted>"
```

Record what they answered with `--attested "<their words>" --session
"<where>"`; a typed confirmation and a `--token` matching `WFCTL_APPROVAL_TOKEN`
remain for a stronger record. `wfctl work verify` rejects a receipt with no
matching approval record. Finish all semantic edits to `change.md`, then refresh its
checkpoint in review stage **before** recording the final hash receipt:

```sh
wfctl work checkpoint <id> \
  --actor "agent:<identity>" \
  --stage review \
  --state "Final verification and maintainer decision are recorded." \
  --last "Reconciled acceptance, implementation, and knowledge promotion." \
  --next "Re-read changed bundle files, refresh their receipts, and run the completion gate."
```

Re-read `change.md` completely after that command and refresh its receipt, plus
every other file changed by the review. Require a current checkpoint and zero
unseen, changed-after-review, or invalid files. Then run:

```sh
wfctl work verify <id>
wfctl work close <id> --outcome completed|partial|abandoned
```

Use the honest outcome. Completed closure fails on open issues or claims,
unresolved Wayfinder state, acceptance gaps, stale file receipts, dirty or
mismatched source revisions, a stale checkpoint, missing evidence, or
incomplete promotion. Closing the bundle makes its checkpoint terminal; do not
create a capture for this completed session state.
