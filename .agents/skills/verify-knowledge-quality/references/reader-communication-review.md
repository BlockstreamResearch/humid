# Reader communication review

Review whether the intended reader can recover the correct meaning without
hidden context. Do not accept a document merely because its evidence is strong.

## Product view

Evaluate as a product manager, client, maintainer, or domain expert:

- the purpose and current behavior are clear before history;
- canonical domain terms are defined and used consistently;
- actors, rules, outcomes, boundaries, exceptions, and delivery are visible;
- examples are recognizable domain scenarios;
- technical details do not leak into the explanation;
- planned, partial, absent, retired, and unknown behavior cannot be mistaken
  for available behavior;
- links provide optional depth without being required to understand the main
  answer.

## Engineering view

Evaluate as an engineer or operator:

- product meaning is linked rather than re-invented;
- ownership, entrypoints, flow, contracts, state, failures, operations, and
  verification can be located;
- terminology and boundaries are precise;
- implementation detail is proportional to maintenance needs;
- evidence and revision scope are clear.

## Decision, reference, and uncertainty views

- a decision explains the durable choice, rationale, consequences, and
  lineage without ceremonial padding;
- a reference distinguishes external fact from project choice;
- an uncertainty states the live question, impact, known facts, and required
  authority or evidence.

Return `passed`, `failed`, `uncertain`, or `blocked` per check. Identify the
smallest wording or structural correction, but do not silently change facts.
