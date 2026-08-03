# Specification contract

The specification states what must become true and why. It is not a transcript,
an issue list, or an implementation diary.

## Required synthesis

- Explain the problem from the affected actor's perspective.
- Explain the outcome from that actor's perspective.
- Preserve the project's accepted domain language.
- Separate product behavior from engineering decisions without losing the link.
- Prefer existing high-level test seams; propose a new seam only when current
  interfaces cannot prove the behavior safely.
- Record out-of-scope boundaries and known risks explicitly.
- Make every acceptance criterion observable, independently referencable, and
  falsifiable.

Do not include volatile source paths or large code snippets as the contract.
Exact source evidence belongs in progress and verification. A concise schema,
state machine, or type shape from a prototype may be retained when prose would
lose a settled decision; identify it as prototype-derived.

## Wayfinder collapse

The map is an index. Each completed issue owns the detailed answer. Synthesis
therefore requires reading all resolved issues, not expanding the one-line map
gists into guesses. Keep the map as lineage, carry accepted conclusions into
`change.md`, keep deferred questions visible, and do not create delivery issues
until this collapse is reviewed.
