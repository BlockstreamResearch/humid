---
name: verify-project-work
description: Verify a change against its contract and its real production path before anyone calls it done. Use when claiming work complete, before promoting what it established into knowledge, or when auditing an implementation against the framing that was approved.
---

# Verify Project Work

A green build proves the build is green. Completion is a claim about what the
product now does, and it holds only because someone looked.

The tool refuses an incomplete accounting on its own: a stale receipt, an open
issue, a missing approval, a dirty checkout, an unaccounted decision. It cannot
tell reading from recording, a check that proves something from one that merely
passes, or a criterion nobody exercised from one that failed. Those are yours,
and they are what this skill is for.

Read [the completion gate](references/completion-gate.md) when a refusal names a
requirement you have not met, or when deciding what a partial closure must say.

## Read what the review stage names

`wfctl work context <id> --stage review` lists what must be accounted for, and
`wfctl work review file` records each one at its current hash.

A receipt proves accounting. Comprehension has no receipt, which is why reading
is the step and recording is the residue. Read each file to its end: a long issue
tail is where deferred work gets written down, and it is the part a skim reaches
last. Mark a supporting artifact `irrelevant` only when you can say what makes it
irrelevant to this result.

A receipt binds to the bytes it was taken over, so any file the review itself
edits comes back as changed-after-review and needs reading again. Expect that of
`change.md` in particular: the review is what changes it.

## Review the contract

Take each thing that was asked for and find three things: the production
behaviour that delivers it, the evidence that it does, and the path a person
using or operating the product reaches it by.

Expect the gaps to be quiet. A requirement nothing implements. A behaviour that
stops halfway. Work that arrived unasked. An implementation that looks present
and does the opposite of what was agreed.

Expected values come from the contract or an independent authority. An expected
value read off the implementation confirms the implementation to itself.

## Review the engineering

Invoke Graphify-first analysis, then open the real diff and the production path
in every bound code root: source, callers, boundaries, state, errors, consumers.
Judge project standards, architecture, security, operations and maintainability
on their own, whether or not the spec was followed. Run the focused behaviour
checks and the broader test, build, type, lint and runtime checks.

Hunt what a passing suite hides — a disabled path, a placeholder, a mock standing
in for the thing, a fixture doing the work, temporary compatibility code, an
unhandled branch, work quietly deferred. `evidence-first` says what each of those
proves and what it does not; here the point is that a review which never went
looking will not find one.

Ask before you commit. Closure requires a clean checkout whose recorded commit
contains the reviewed implementation, and the gate cannot see whether anyone
agreed to the commit that made it clean.

For project-only work, verify decisions, knowledge and links, and let code
evidence stay absent rather than invented.

## Decide what the project now knows

Decide whether verified durable truth changed. When it did, route product
behaviour and engineering realization through their separate curation skills, run
the two-axis quality gate, and validate every changed concept. When it did not,
say concretely why.

A concept promoted from a bundle in a project with no reconstructed baseline has
the same shape as one established by whole-project reading and a far narrower
footing: it came from whatever this task happened to touch. Say so in its
`maintainer-decision` source — name the bundle, state that no reconstruction has
covered this subject — so a later baseline re-derives it instead of trusting it.
Promote it anyway. Knowledge grown from real work beats none, and the shortcut
costs something only while it stays unwritten.

Account for every answer the maintainer gave with `wfctl work decisions <id>`.
Closure is the last moment an answer can reach a page instead of an archive, and
a resolved Wayfinder map is the checklist the accounting is held against.

This asks them nothing — they decided already. What reaches them is one
confirmation that the drafted pages are faithful to their own words: once, with
named exceptions, as `maintainer-review` requires of confirming written records.

## Put the decision, then close

Render it with `wfctl work ask <id> --stage completion`, which carries the four
things accepting one fixes and reads them from the record.

The render is only as honest as what it reads. An unresolved risk nobody wrote
down stays invisible, and a criterion left `pending` because nobody checked reads
exactly like one that failed. Repair the record and render again; a packet edited
by hand is composed again, and composed is what put file paths and criterion ids
in front of them.

Record their decision with `wfctl work approve <id> --stage completion`, passing
their own answer through `--attested`. A hand-written receipt fails verification.

Then finish in this order, because each step invalidates the one before it.
Every semantic edit to `change.md` first. Then `wfctl work checkpoint <id>
--stage review`, before the final hash receipt — a checkpoint edit changes the
file's hash, so a receipt taken ahead of it is stale on arrival. Then re-read
`change.md` and everything else the review changed, and refresh those receipts.
Then:

```sh
wfctl work verify <id>
wfctl work close <id> --outcome completed|partial|abandoned
```

Use the honest outcome. `partial` and `abandoned` are results, and a `completed`
that had to be argued for is the one worth doubting. Closing makes the bundle's
checkpoint terminal; the session state it holds is finished rather than captured.
