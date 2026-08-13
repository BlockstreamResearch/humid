---
name: verify-project-work
description: Verify a change against its contract and its real production path before anyone calls it done. Use when claiming work complete, before promoting what it established into knowledge, or when auditing an implementation against the framing that was approved.
---

# Verify Project Work

A green build proves the build is green. Completion is a claim about what the
product now does, and it holds only because someone looked.

The tool refuses an incomplete accounting on its own: a stale receipt, an open
issue, an unapproved framing, a dirty checkout, an unaccounted decision. It cannot
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

## Write what the project now knows

Decide whether verified durable truth changed, and write the pages while the
understanding is fresh. Route product behaviour and engineering realization
through their separate curation skills and run the two-axis quality gate — but
write each page under the bundle's `promotion/` directory, at the exact path it
will occupy inside `knowledge/` — spelled with or without a leading `knowledge/`,
which name the same page. Nothing enters the corpus here.

A concept promoted from a bundle in a project with no reconstructed baseline has
the same shape as one established by whole-project reading and a far narrower
footing: it came from whatever this task happened to touch. Say so in its
`maintainer-decision` source — name the bundle, state that no reconstruction has
covered this subject — so a later baseline re-derives it instead of trusting it.
Draft it anyway. Knowledge grown from real work beats none, and the shortcut
costs something only while it stays unwritten.

Account for every answer the maintainer gave with `wfctl work decisions <id>`. A
resolved Wayfinder map is the checklist the accounting is held against, and the
promotion gate holds until every answer has a home.

Then record what is waiting:

```sh
wfctl work promotion <id>                  # from what is on disk
wfctl work promotion <id> --none "<why>"   # nothing the project says changed
```

## Close it yourself

Closure asks whether the work matches the framing that was approved, and every
part of that answer is in the record already: verified criteria, passed receipts,
pinned revisions, terminal issues. Do not put it to the maintainer. One night
spent waiting on that question cost seven hours and fifty-four minutes and two of
four approved bundles.

Finish in this order, because each step invalidates the one before it. Every
semantic edit to `change.md` first. Then `wfctl work checkpoint <id> --stage
review`, before the final hash receipt — a checkpoint edit changes the file's
hash, so a receipt taken ahead of it is stale on arrival. Then re-read
`change.md` and everything else the review changed, and refresh those receipts.
Then:

```sh
wfctl work verify <id>
wfctl work close <id> --outcome completed|partial|abandoned
```

Use the honest outcome. `partial` and `abandoned` are results, and a `completed`
that had to be argued for is the one worth doubting.

One refusal here is a real question rather than an errand: delivery no longer
matches the approved framing, because the acceptance criteria were reworded since
they agreed to them, or work left the route as a dropped issue. That is the one
thing at the end they alone can settle. Render it with `wfctl work ask <id>
--stage completion` and record their answer with `wfctl work approve <id> --stage
completion --attested "<what they said>"`.

## Then ask the one question that is theirs

A closed bundle holding pages waits in the promotion queue rather than the
archive, and the pages wait with it.

```sh
wfctl work ask <id> --stage promotion
```

That packet is the pages themselves, in full, saying of each whether it replaces
something the project already claims. It is the decision that compounds: a
completion receipt is read by an auditor once, and a page is read first by every
session that touches this part of the project.

The render is only as honest as what it reads. A page that says nothing is shown
as empty, and a draft still carrying its template's words is shown as written.
Repair the page rather than the packet.

Their word writes it:

```sh
wfctl work promote <id> --by human:<maintainer-id> --attested "<what they said>" \
  --session "<where they said it>"
```

That copies every page into `knowledge/`, validates them, and archives the
bundle. If validation refuses, nothing is written and the bundle stays in the
queue — so fix the page and ask again rather than leaving the corpus half-taught.
