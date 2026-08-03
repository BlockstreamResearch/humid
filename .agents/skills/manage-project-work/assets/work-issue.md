---
workflow_version: 3
kind: work-issue
id: "{{ISSUE_ID}}"
title: "{{TITLE}}"
phase: delivery
type: delivery
status: draft
blocked_by: []
satisfies: []
repositories: []
artifacts: []
claim: null
resolution: null
created_at: "{{CREATED_AT}}"
updated_at: "{{CREATED_AT}}"
checkpoint_version: 1
checkpoint:
  status: ready
  stage: implement
  actor: system:wfctl
  current_state: Issue is ready but unclaimed.
  last_completed: Issue record created.
  next_action: Read the required context and claim the issue.
  blockers: []
  updated_at: "{{CREATED_AT}}"
  basis_sha256: "{{CHECKPOINT_BASIS}}"
---

# Outcome

State the complete behavior, decision, or fact this issue must deliver. Keep it
small enough for one fresh agent session when possible.

# Acceptance contribution

Explain how this issue contributes to its `satisfies` acceptance IDs. For a
Wayfinder issue, state the precise question it resolves instead.

# Constraints and boundaries

Record relevant project knowledge, approved decisions, repository scope, and
explicit exclusions. Do not copy the parent specification.

# Discovery ledger

Preserve newly learned information when losing it could make a future session
repeat material investigation, choose differently, misunderstand the work, or
act unsafely. Do not use this as a chronological activity log or restrict it to
a predefined class of findings.

Append one durable block per discovery, replacing the placeholders:

```markdown
## DISC-NNN — Concise title

- **Observation:** What was learned and its uncertainty.
- **Evidence:** Direct basis or missing evidence.
- **Implication:** What this changes.
- **Scope:** Where and for how long it applies.
- **Disposition:** Its current owner or next destination in plain language.
```

Preserve an invalidated entry and update its disposition rather than deleting
it.

# Verification

Record direct source inspection, executable checks, outcomes, and limitations.
Graph or search output is navigation evidence, not implementation proof.
