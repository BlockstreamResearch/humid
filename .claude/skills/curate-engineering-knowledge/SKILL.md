---
name: curate-engineering-knowledge
description: Author or materially update engineering-facing current knowledge from verified implementation and reviewed product authority. Use when a completed change, source-first reconstruction, or explicit implementation-drift repair is ready to record architecture, repository ownership, contracts, data or control flow, runtime behavior, operations, or technical constraints. Do not use merely because an engineer asks how existing code works; answer that read-only question through knowledge navigation and Graphify. Keep product meaning in linked product documents and never infer intended behavior from code alone.
---

# Curate Engineering Knowledge

Write the technical realization of current project truth without duplicating or
silently redefining product meaning.

Read [the engineering writing contract](references/engineering-writing-contract.md)
before first-time promotion. Use
[the engineering concept template](assets/engineering-concept.md) for a new
document.

## Establish the implementation

1. Identify the owning Area, product concepts, repository, and exact clean
   source revision.
2. Invoke `analyze-with-graphify` for navigation and relationship coverage.
3. Directly inspect source, tests, contracts, configuration, and runtime
   evidence at the pinned revision.
4. Distinguish implemented behavior, architectural rationale, ownership,
   contract, policy, history, and external claims. Apply the authority required
   by each class.
5. Treat code as implementation authority only. Link accepted product meaning;
   never derive it from code.

## Author the engineering view

1. Declare `view: engineering`, `purpose: technical-realization`, and include
   `engineer` or `operator` in `audience`.
2. Explain responsibility, current implementation, ownership boundaries, data
   and control flow, contracts and invariants, failure behavior, operations,
   and verification.
3. Name exact code surfaces only when they help maintenance or verification.
   Pin material claims to repository, commit, path, and optional symbol.
4. Link the product concept that gives the implementation meaning. Keep
   product behavior in that product document and describe only the technical
   consequence here.
5. Record partial, absent, accidental, retired, unknown, or drifted delivery
   honestly. Do not repair intent by rewriting it to match code.
6. Keep cross-Area architecture at `knowledge/architecture/`, repository
   ownership at `knowledge/repositories/`, and Area-owned implementation at
   `knowledge/areas/<area>/implementation/`.

## Verify before stable

1. Invoke `verify-knowledge-quality` after the body and evidence are complete.
2. Resolve gaps in source coverage, product linkage, failure behavior, and
   claims that exceed their evidence.
3. Run `wfctl knowledge hash --concept <path>` and bind the quality receipt and
   normal verification to that hash.
4. Run `wfctl knowledge validate`, `wfctl knowledge build`, and `qmd update`.
5. Do not report completion while any gate fails.
