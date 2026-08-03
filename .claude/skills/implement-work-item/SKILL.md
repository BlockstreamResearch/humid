---
name: implement-work-item
description: Claim and implement exactly one ready issue from a central project change bundle in its exact bound leaf checkout or worktree. Use when the maintainer explicitly asks to implement a named or next frontier issue, or when resuming its existing claim. Do not use for an unresolved Wayfinder issue, unapproved shaping, lightweight unrelated edits, or work in an inferred checkout.
---

# Implement Work Item

Build one bounded unit from a fresh, explicit context. The issue tracks local
progress; `change.md` remains the parent contract.

Read [the execution contract](references/execution-contract.md) before the
first claim in a repository.

## Load before claiming

1. Run `wfctl work issue show <change-id> <issue-id>` from the exact intended
   leaf. If no issue was named, run `wfctl work issue list <change-id>` and
   choose only a frontier issue.
2. Read every listed required file completely. This includes the parent spec,
   selected issue, transitive blockers, and referenced artifacts.
3. After each complete read, run `wfctl work review file <change-id> <path>`.
   Do not record a receipt after reading only headings, summaries, or excerpts.
4. Run `wfctl work status <change-id>` and verify the current Git root equals
   the reported code root exactly.
5. Claim before analysis or edits:

```sh
wfctl work issue claim <change-id> <issue-id> --actor "agent:<identity>"
```

The claim records repository, branch, revision, and worktree identity. Stop on
any mismatch instead of choosing a sibling checkout.

## Implement one tracer bullet

Invoke `analyze-with-graphify` in every repository this issue legitimately
touches, then inspect the actual source. Recheck relevant curated knowledge
with `align-project-knowledge`. Search may supplement the graph; it does not
replace it.

Implement the smallest complete behavior that satisfies this issue. Prefer a
high public seam and work one behavior cycle at a time:

1. add one externally meaningful failing check;
2. confirm it fails for the intended reason;
3. make the minimum production change that passes it;
4. run the focused check;
5. repeat, then run broader relevant checks.

Tests must derive expected behavior from the approved contract or an
independent authority, never from the implementation they are meant to test.
Do not over-mock the behavior under review.

After every material maintainer turn or meaningful investigation cycle, apply
the preservation test from `manage-project-work`: if losing newly learned
information could cause repeated material investigation, a different choice,
misunderstanding, or unsafe action in a fresh session, append a complete entry
to the issue's `Discovery ledger`. Record observation, evidence, implication,
scope, and disposition without forcing it into a predefined finding category.
Update evidence and current understanding next, then refresh the issue's single
structured checkpoint last:

```sh
wfctl work checkpoint <change-id> --issue <issue-id> \
  --actor "agent:<identity>" \
  --state "<current state>" \
  --last "<last completed action>" \
  --next "<exact next action>"
```

Use `--status blocked --blocker "<reason>"` when progress genuinely cannot
continue. Record deviations in the parent `change.md` when they affect approved
scope, acceptance, or decisions; refresh the parent checkpoint and reopen
framing review before continuing materially different work.

The checkpoint may identify the latest discovery and its effect on the next
action, but the full information stays in the semantic record or a linked
artifact. Never hide a discovery only in checkpoint prose, command output, or
conversation memory.

## Resolve honestly

Inspect the real diff and production path. Record commands, direct source
evidence, limitations, placeholders, and unresolved risk. With normal
maintainer authorization, preserve code in the exact bound Git commit; `wfctl`
never commits automatically.

Resolve only this issue:

```sh
wfctl work issue complete <change-id> <issue-id> \
  --summary "<delivered outcome>" \
  --evidence "<direct inspection or command result>"
```

If interrupted, refresh the claimed issue checkpoint before stopping. A fresh
session begins with `wfctl work context --stage resume`, reads every required
file and discovery entry completely, and resumes the existing exact claim; it
does not infer another issue, actor, checkout, or code root. If
deliberately giving the issue back, run `wfctl work issue release`; it resets
the issue checkpoint to ready. Completion makes the issue checkpoint terminal;
then refresh the parent checkpoint with the next frontier action. Do not mark a
partial outcome completed. Final change-wide review, knowledge promotion, and
archival belong to `verify-project-work` after every required issue is terminal.
