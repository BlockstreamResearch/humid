---
type: Decision
title: "<decision title>"
description: "<current decision in one sentence>"
status: draft
view: decision
purpose: decision-history
audience:
  - maintainer
  - domain-expert
  - engineer
decision_id: "<stable-lowercase-id>"
effective_at: "<ISO-8601>"
area: "<primary-area>"
capabilities: []
authority:
  - decision
generated:
  by: "<producer>/<version>"
  at: "<ISO-8601>"
verified: []
supersedes: []
superseded_by: ""
x-wf:
  relations: []
  quality:
    status: pending
sources:
  - id: "<maintainer-decision-id>"
    kind: maintainer-decision
    resource: "project-change:<change-id>#decision"
    title: "<reviewed decision>"
    author: "human:<reviewer-id>"
---

# Context and problem

Explain only the context needed to understand why this durable decision
exists.[^maintainer-decision-id]

# Product decision

State the exact stakeholder-visible choice and its boundaries in plain
language.

# Rationale

Explain why this option was chosen.

# Alternatives

List only alternatives that were seriously considered and why they were not
selected. State `None recorded` rather than inventing options.

# Consequences and tradeoffs

State benefits, costs, risks, constraints, and accepted tradeoffs. Link
engineering knowledge for technical consequences instead of embedding an
implementation walkthrough.

# Affected knowledge

Link every materially affected Area, capability, use case, rule, engineering
concept, or contract. Record non-lineage semantic edges in `x-wf.relations`
with the same target and meaningful context.

# Transition and migration

Explain the product transition and link separate engineering migration detail,
or state `Not applicable`.

# Unresolved questions

List only questions left open by this decision, or state `None`.

# Evolution

Explain what this changes relative to each predecessor. Use project-relative
`knowledge/...` paths in `supersedes` and `superseded_by`; keep reciprocal
links accurate and include matching links to every predecessor and successor.

[^maintainer-decision-id]: Explicit maintainer approval in the linked decision receipt.

Before changing `status` to `stable`, invoke `verify-knowledge-quality`, run
`wfctl knowledge hash --concept knowledge/.../<decision>.md`, and bind both
the passed quality receipt and human verification to the returned hash.
