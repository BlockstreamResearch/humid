---
workflow_version: 5
id: "{{WORK_ID}}"
title: "{{TITLE}}"
mode: "{{MODE}}"
status: shaping
scope: leaf
created_at: "{{CREATED_AT}}"
updated_at: "{{CREATED_AT}}"
checkpoint_version: 1
checkpoint:
  status: active
  stage: shape
  actor: system:wfctl
  current_state: Initial framing is pending.
  last_completed: Central work bundle created.
  next_action: Persist the first agreed framing and refresh this checkpoint.
  blockers: []
  updated_at: "{{CREATED_AT}}"
  basis_sha256: "{{CHECKPOINT_BASIS}}"
repositories: []
acceptance: []
direction:
  status: bounded
  map: ""
  resolved_at: ""
knowledge_alignment:
  reviewed: []
  conflicts: []
graph_evidence:
  queries: []
knowledge_promotion:
  status: pending
  concepts: []
  reason: ""
maintainer_review:
  framing:
    status: pending
    by: ""
    at: ""
    notes: []
  completion:
    status: pending
    by: ""
    at: ""
    notes: []
verification:
  result: pending
  revision: ""
  worktree_id: ""
  repositories: []
  acceptance: []
  acceptance_reviewed: false
  implementation_reviewed: false
  knowledge_reviewed: false
  checks: []
  unresolved: []
---

# Summary

State the intended outcome and why it matters.

# Current state

Maintain the latest agreed problem, desired outcome, constraints, scope,
assumptions, and risks. Rewrite this section whenever the current understanding
changes; keep resumable execution state only in the structured checkpoint.

# Direction map

For a broad initiative, record the destination, current landscape, affected
Areas and actors, constraints, success signals, and explicit non-goals. For a
bounded task, state `Not required — bounded change` with a short reason.

# Domain language

Record proposed canonical terms, definitions, accepted aliases, names to
avoid, and their resolution state. Keep unresolved vocabulary here; promote it
to current knowledge only after approval.

# Decision frontier

List only unresolved choices whose answers can materially change product
meaning, scope, architecture, ownership, or the next safe action. Rank them by
leverage. For a bounded task with no frontier, state `None`.

# Uncertainty and fog

Record unknown facts, missing authority, contradictions, dependencies, and
risks. For each item, state its impact and what would resolve it.

# Open questions

- Record unresolved questions that can change the solution, authority, or scope.

# Discussion and decision ledger

Append one concise entry after every material maintainer turn. Preserve rejected,
deferred, and superseded directions instead of rewriting history.

| At | Status | Subject | Outcome and rationale |
| --- | --- | --- | --- |
| {{CREATED_AT}} | proposed | Initial framing | Awaiting discussion. |

# Current behavior and evidence

Record Graphify queries, the source locations they led to, and direct inspection
of the actual code. Graph output is navigation evidence, never the authority for
an implementation claim. Add supplementary text-search findings only after
graph analysis.

# Discovery ledger

Preserve newly learned information when losing it could make a future session
repeat material investigation, choose differently, misunderstand the work, or
act unsafely. This is an information-acquisition ledger, not an activity log and
not a closed list of "findings" categories.

Append one durable block per discovery, replacing the placeholders:

```markdown
## DISC-NNN — Concise title

- **Observation:** What was learned, including uncertainty when unverified.
- **Evidence:** Direct basis, or the evidence that is still missing.
- **Implication:** What this changes for understanding or action.
- **Scope:** Where it applies and any lifetime or invalidation condition.
- **Disposition:** What now owns it or must happen next, in plain language.
```

Preserve superseded or disproven entries and update their disposition instead
of deleting the path by which the team learned.

# Knowledge alignment

List relevant vision, product, architecture, decision, repository, and uncertainty concepts. Record conflicts and maintainer resolutions.

# Scope

## In

- Define included behavior.

## Out

- Define explicit exclusions.

# Decisions

- Record the current approved decisions with enough rationale to guide
  implementation. Link each entry to its ledger history when it evolved.

# Plan and progress

- [ ] Add concrete implementation and validation steps.

# Acceptance criteria

- [ ] Add observable, testable completion criteria.

# Verification evidence

Record fresh commands, results, directly inspected code at the bound revision,
and criterion-by-criterion inspection. A passing test suite or Graphify result
alone is not complete evidence.

# Knowledge promotion

List the curated concepts updated by this change, or explain why the completed
change does not alter durable project intent, meaning, decisions, contracts,
boundaries, ownership, or operational knowledge. Promote only claims verified
against authoritative sources; untrusted raw intake is never provenance.

# Deviations and unresolved work

State deviations, remaining risks, placeholders, mocks, follow-ups, or `None`.
