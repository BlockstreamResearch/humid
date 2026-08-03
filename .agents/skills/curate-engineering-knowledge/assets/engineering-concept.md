---
type: "<Implementation|Architecture|Repository|Contract|Operational Concept>"
title: "<technical title>"
description: "<one-sentence current technical responsibility>"
status: draft
view: engineering
purpose: technical-realization
audience:
  - engineer
  - operator
  - maintainer
area: "<primary-area when Area-owned>"
capabilities: []
authority:
  - implementation
generated:
  by: "<producer>/<version>"
  at: "<ISO-8601>"
verified: []
x-wf:
  relations: []
  quality:
    status: pending
sources:
  - id: "<source-id>"
    kind: source-code
    resource: "git:<repository>@<40-character-commit>#<path>[:<symbol>]"
    title: "<pinned implementation evidence>"
---

# Responsibility

State the technical responsibility and its maintenance boundary.[^source-id]

# Current implementation

Explain how the responsibility is implemented at the pinned revision.

# Boundaries and ownership

Name repositories, components, dependencies, and ownership transitions.

# Data and control flow

Trace material inputs, state changes, outputs, and asynchronous boundaries.

# Contracts and invariants

State interfaces, schemas, protocols, invariants, and compatibility constraints.

# Failure and operational behavior

Explain failure modes, recovery, observability, security, and operational
constraints, or state why a concern does not apply.

# Verification

Link the source, tests, runtime checks, and limitations that support this
document.

# Product knowledge

Link the stakeholder-facing product concepts that explain why this
implementation exists. Do not duplicate their product explanation.

# Relationships

Link the parent Area and related engineering concepts. Mirror material
semantic links in `x-wf.relations`.

[^source-id]: Direct pinned source evidence.

Before changing `status` to `stable`, invoke `verify-knowledge-quality`, then
run `wfctl knowledge hash --concept knowledge/.../<concept>.md`. Replace
`x-wf.quality` with a passed receipt containing `by`, `at`, `content_hash`, and
all required checks. Add a current `verified` event with the same hash.
