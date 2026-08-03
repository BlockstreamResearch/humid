---
type: "<Product Capability|Product Rule|Use Case|Product Flow|Domain Concept>"
title: "<human product title>"
description: "<one-sentence current product meaning>"
status: draft
view: product
purpose: current-behavior
audience:
  - stakeholder
  - maintainer
  - domain-expert
area: "<primary-area>"
capabilities: []
authority:
  - product-meaning
  - implementation
generated:
  by: "<producer>/<version>"
  at: "<ISO-8601>"
verified: []
realization:
  intent: "<accepted|superseded>"
  delivery: "<absent|partial|implemented|verified|retired|unknown>"
  alignment: "<aligned|drifted|unknown>"
  assessed_at: "<ISO-8601>"
x-wf:
  relations: []
  quality:
    status: pending
sources:
  - id: "<maintainer-source-id>"
    kind: maintainer-decision
    resource: "<project-change or project-reconstruction decision>"
    title: "<reviewed product authority>"
    author: "human:<reviewer-id>"
  - id: "<delivery-source-id>"
    kind: source-code
    resource: "git:<repository>@<40-character-commit>#<path>[:<symbol>]"
    title: "<pinned delivery evidence>"
---

# What this provides

Explain the recognizable product outcome and why it matters.[^maintainer-source-id]

# Who it serves

Name the people, roles, or neighboring capabilities that rely on it.

# Domain language

Define terms introduced or owned by this concept. For a `Domain Concept`,
state the canonical term, its contextual boundary, accepted aliases, and names
to avoid. Otherwise state `No new terms` when the document introduces none.

# Current behavior

Explain what happens now in observable product terms. Keep accepted intent and
observed delivery distinct when they differ.[^delivery-source-id]

# Rules and outcomes

State the decisions, state changes, and outcomes that govern the behavior.

# Boundaries and exceptions

Preserve material limits, conditions, exceptions, and explicit non-goals.

# Delivery

Say plainly whether the behavior is available, partial, absent, retired, or
uncertain, and what that means for the reader.

# Examples

Give one or more concrete domain examples. Do not use code or API examples.

# Evolution

Summarize only meaningful changes needed to understand the current behavior.
Link full decision records for rationale and lineage.

# Related knowledge

Link the parent Area, related capabilities, rules, use cases, flows, and
current decisions. Mirror material semantic links in `x-wf.relations`.

# Engineering details

Link separately authored engineering documents. Do not summarize their
implementation here.

[^maintainer-source-id]: Explicit reviewed product authority.
[^delivery-source-id]: Direct pinned evidence for current delivery.

Before changing `status` to `stable`, invoke `verify-knowledge-quality`, then
run `wfctl knowledge hash --concept knowledge/.../<concept>.md`. Replace
`x-wf.quality` with a passed receipt containing `by`, `at`, `content_hash`, and
all required checks. Add a current `verified` event with the same hash.
