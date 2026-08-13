---
name: curate-product-knowledge
description: Author or materially update stakeholder-facing current product knowledge after its claims have independent authority. Use when an approved change, reviewed reconstruction, confirmed intake candidate, source audit, or explicit maintainer decision is ready to create or correct an Area, capability, use case, product flow, domain concept, product rule, vision statement, delivery summary, or evolution summary. Do not use for ordinary explanation, discovery, brainstorming, review-only requests, or unverified raw ideas. Separate accepted intent from observed delivery and keep implementation details in linked engineering documents.
---

# Curate Product Knowledge

Write the product view of verified project truth. Make it understandable to a
client or product manager without requiring source code, API, architecture, or
repository knowledge.

Read [the product writing contract](references/product-writing-contract.md)
before authoring or materially rewriting a product document. Use
[the product concept template](assets/product-concept.md) for a new concept.

## Establish authority

1. Work from the knowledge root and identify the primary Area.
2. Read the relevant Area index, product concepts, current decisions, and
   linked engineering concepts in full.
3. Separate:
   - accepted intent and product meaning;
   - currently observed delivery;
   - alignment or drift between them;
   - planned, rejected, superseded, and unknown claims.
4. Require explicit maintainer authority for intent, product meaning, rules,
   normative ownership, and product decisions.
5. Require pinned source and fresh checks for delivery claims. Invoke
   `analyze-with-graphify` in every relevant exact leaf before direct source
   and test inspection.
6. Never use raw, intake, search results, a compiled graph, or agent prose as
   authority.

## Author the product view

1. Declare `view: product`, `purpose: current-behavior`, and include
   `stakeholder` in `audience`.
2. State the current answer first. Explain what the product provides, who it
   serves, observable behavior, rules, outcomes, boundaries, exceptions,
   delivery state, examples, and meaningful evolution.
3. Use the vocabulary a domain expert or client would use. Explain necessary
   domain terms on first use.
   For a `Domain Concept`, explicitly record the canonical term, concise
   definition, contextual boundary, accepted aliases, and names to avoid.
   During unresolved discussion, keep proposed terms in the active change
   record rather than silently changing current vocabulary.
4. Describe outcomes and behavior, not classes, functions, endpoints, schemas,
   storage, messages, packages, repositories, or source paths.
5. Keep `Engineering details` link-only. Put technical explanations in a
   document authored with `curate-engineering-knowledge`.
6. Use present tense only for behavior supported by the declared delivery
   state. Say plainly when a capability is absent, partial, retired, unknown,
   or accepted but not yet available. Never present planned or uncertain
   behavior as currently available.
7. Preserve material exceptions and conditions. Plain language may simplify
   wording but must not simplify away meaning.
8. Keep current truth at one stable path. When a decision changes, update the
   current product explanation and link the decision lineage; do not copy the
   whole Area into version folders.
9. Attribute every material claim to an authoritative source with matching
   source IDs and footnotes. Do not expose machine-local paths.

## Area indexes

Treat `knowledge/areas/<area>/index.md` as the primary stakeholder page for an
Area. Use the Area template owned by `curate-project-knowledge`. Keep it
product-first and bounded:

- summarize rather than flatten every child document;
- link capabilities, use cases, rules, current decisions, and evolution;
- show delivery honestly;
- keep `Engineering details` as links with short nontechnical labels.

The path a page occupies is where it will live, whichever route it takes to get
there. Work from a change bundle writes it under that bundle's `promotion/`
directory at exactly that path, and the maintainer's word is what copies it into
`knowledge/`. Work from a reconstruction or intake case writes it into
`knowledge/` directly, because that promotion is what its closure waits for.

## Verify before stable

1. Invoke `verify-knowledge-quality` after the substantive body is complete.
2. Resolve every failed or uncertain rubric item.
3. Run `wfctl knowledge hash --concept <path>` and bind both the semantic
   quality receipt and normal verification to that content hash.
4. Use `status: stable` only after the quality receipt is current, all
   authority requirements pass, and normative claims have human verification.
5. Run `wfctl knowledge validate`, `wfctl knowledge build`, and `qmd update`.
6. Do not report completion while any gate fails.
