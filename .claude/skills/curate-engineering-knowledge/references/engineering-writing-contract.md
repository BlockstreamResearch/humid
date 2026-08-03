# Engineering writing contract

## Reader contract

Write for engineers and operators who already understand the product concept
or can follow its link. Let them answer:

1. What technical responsibility does this surface own?
2. Where and how is it implemented at the pinned revision?
3. How do data and control move through it?
4. Which contracts, invariants, and ownership boundaries apply?
5. How does it fail and how is it operated?
6. What evidence verifies the claims?

## Separation rules

- Link product meaning; do not restate it as technical prose.
- Never infer accepted intent, correctness, or rationale from code alone.
- Keep repository and symbol details out of product documents.
- Keep implementation detail here only when it helps understand, change,
  operate, or verify the system.
- State uncertainty and drift explicitly.
- Separate current implementation from historical implementation and rejected
  alternatives.

## Required sections

- `Responsibility`
- `Current implementation`
- `Boundaries and ownership`
- `Data and control flow`
- `Contracts and invariants`
- `Failure and operational behavior`
- `Verification`
- `Product knowledge`
- `Relationships`

Use `Not applicable` with a reason when a section genuinely does not apply.

## Method basis

- C4 uses explicit abstraction levels for different audiences:
  https://c4model.com/introduction
- arc42 separates stakeholder goals from hierarchical technical building
  blocks:
  https://docs.arc42.org/section-1/
- Spec Kit separates product what/why from implementation how:
  https://github.github.com/spec-kit/reference/agentic-sdd.html
- Architecture Decision Records preserve rationale and supersession separately
  from current implementation:
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
