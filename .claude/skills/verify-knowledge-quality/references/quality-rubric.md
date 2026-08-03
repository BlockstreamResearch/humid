# Knowledge quality rubric

Every item is `passed`, `failed`, `uncertain`, or `blocked`. Only an all-passed
review may create a quality receipt.

Run the common truth checks as the `authority-truth` axis and the view-specific
checks as the `reader-communication` axis. Bind both results to the same
unchanged content hash. Deterministic validation is a separate structural
gate.

## Authority-truth axis

### Factuality

- Every material current claim has matching authority.
- Sources were read directly and match the exact revision.
- Raw, intake, retrieval snippets, generated graphs, and agent prose are not
  treated as authority.
- Conflicting evidence and uncertainty are visible.
- Claims do not exceed the scope of their evidence.

### Delivery state

- Accepted intent, observed delivery, and alignment are independent.
- Present tense does not imply unavailable behavior.
- `absent`, `partial`, `implemented`, `verified`, `retired`, and `unknown`
  match the actual evidence.
- Planned and rejected behavior remains outside current knowledge.

### Completeness

- Important rules, outcomes, boundaries, exceptions, non-goals, failure modes,
  and affected relationships were not dropped.
- The document is the smallest coherent unit, not a fragment that hides a
  material condition.
- Current decisions and supersession lineage are linked.

### Freshness and lineage

- `generated.at`, sources, realization assessment, and linked decisions refer
  to the same current state.
- Historical explanation is clearly historical.
- A changed decision updates the current view and preserves predecessor
  lineage.

## Reader-communication axis

### Product-view checks

### Audience fit

- A product manager or client can understand the main answer without
  engineering knowledge.
- Domain terms are explained.
- The document leads with product outcome and observable behavior.
- Examples are domain examples, not code or API examples.

### Abstraction

- No code, identifiers, paths, endpoints, schemas, protocols, storage
  mechanisms, package names, or implementation walkthroughs appear.
- `Engineering details` is link-only.
- Replacing the implementation without changing behavior would not require
  rewriting the product explanation.
- Simplification did not erase a rule or exception.

### Engineering-view checks

### Audience fit

- An engineer or operator can locate ownership, implementation, flow,
  contracts, failure behavior, and verification.
- Technical terms are precise and useful for maintenance.

### Abstraction

- Product meaning is linked, not reconstructed from code.
- The document explains implementation rather than duplicating product prose.
- Technical detail is proportional to maintenance and verification needs.
- Repository, revision, paths, tests, and runtime evidence are pinned where
  material.

### Decision-view checks

- Context, exact decision, rationale, consequences, affected knowledge, and
  lineage are present.
- Alternatives, transition, and unresolved questions are concise and honest
  when material; the document does not invent ceremonial content.
- Product effect is understandable without implementation detail.
- Technical consequences link to engineering knowledge.
- Supersession is reciprocal, acyclic, and leaves one stable current record.

## Evaluation discipline

This rubric follows agent-evaluation practice: inspect both outcome and
process, combine deterministic checks with semantic and human review, and test
real failure cases rather than relying on self-assessment.

- Anthropic agent evals:
  https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic skill creation and baseline comparison:
  https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
