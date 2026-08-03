---
name: curate-project-knowledge
description: Orchestrate promotion of independently verified claims into a workflow project's current OKF knowledge bundle. Use when a completed change, reconstruction case, raw-intake candidate, source audit, external source, or maintainer decision is ready to update durable product knowledge, engineering knowledge, decision lineage, Area navigation, or project history. Route stakeholder-facing content to curate-product-knowledge, technical realization to curate-engineering-knowledge, and every material document through verify-knowledge-quality. Never copy raw input into knowledge or let code define product intent.
---

# Curate Project Knowledge

Coordinate the promotion boundary. Do not author product and engineering views
as one blended document.

Read [the knowledge model](references/knowledge-model.md) before first-time
promotion, a new Area, or decision migration.

## Accepted inputs

A promotion may start from:

- a completed and maintainer-reviewed archived change;
- confirmed raw-intake candidate IDs with independent authority;
- confirmed source-first reconstruction candidate IDs;
- directly inspected source and tests at an exact Git revision;
- a primary external source;
- an explicit current maintainer decision.

`raw/`, intake prose, QMD results, compiled graphs, Graphify output, and
agent-written summaries are never authority.

## Route each durable claim

Classify claims before selecting files:

| Durable concern | View and owner |
| --- | --- |
| Current product purpose, capability, use case, flow, domain concept, rule, delivery summary, or Area evolution | Invoke `curate-product-knowledge` |
| Current implementation, architecture, repository ownership, contract, data/control flow, runtime, or operations | Invoke `curate-engineering-knowledge` |
| Durable choice that is hard to reverse, surprising without context, or resolves a real tradeoff | Use the decision template, then invoke `verify-knowledge-quality` |
| Primary external context | Use `view: reference`, preserve the primary source, then verify |
| Trusted unresolved current question | Use `view: uncertainty`, state missing authority, then verify |
| Proposed, rejected, or unadopted behavior | Keep outside `knowledge/` in changes, intake, or reconstruction |

A significant product change normally updates both a product concept and its
linked engineering concept. A refactor with unchanged product behavior may
update engineering knowledge only. Do not create an empty counterpart merely
for symmetry.

## Promotion procedure

1. Work from the knowledge root. Require and invoke the native QMD skill, use
   QMD to locate candidates, and read every selected document directly.
2. Identify the smallest primary Area. Use root product flows, architecture,
   repositories, or decisions only when ownership genuinely crosses Areas.
3. Inspect existing lifecycle, provenance, realization, quality receipt,
   verification, and decision lineage.
4. When implementation matters, invoke `analyze-with-graphify` in each exact
   leaf, then inspect pinned source, tests, contracts, and runtime evidence.
5. Separate accepted intent, observed delivery, alignment, technical
   realization, decision history, and uncertainty. Ask the maintainer only for
   missing product authority, chronology, ownership, or a material decision.
6. Route product and engineering documents to their specialized skills. Never
   reuse one body for both audiences.
7. For a new Area, create its product-facing index from
   [the Area template](assets/area-index.md). Add only the typed sibling
   collections needed now: `capabilities/`, `use-cases/`, `concepts/`,
   `rules/`, `implementation/`, `decisions/`, and `log.md`.
8. Give every concept explicit `view`, `purpose`, and `audience`. Attribute
   every material claim with an authoritative source ID and matching footnote.
9. Declare only material semantic edges in `x-wf.relations`; include a
   meaningful context and a matching human-visible Markdown link.
10. Create a standalone decision only when the choice is hard to reverse,
    surprising without context, or resolves a real tradeoff. Routine
    implementation choices and minor wording changes belong in the owning
    concept, change ledger, or Area evolution. Author durable decisions from
    [the decision template](assets/decision.md). Keep one stable current
    decision per lineage; make supersession reciprocal and acyclic. Preserve
    approved predecessor bodies.
11. Update the product-facing Area index and its Evolution section when
    current behavior changes. Append detailed chronology to the local log.
12. Invoke `verify-knowledge-quality` for every new or materially changed
    concept. Do not self-approve a failed, uncertain, unread, or blocked check.
13. Finish content before hashing. Bind the passed quality receipt and normal
    verification to the same `wfctl knowledge hash --concept <path>` output.
    Normative claims require human verification.
14. Run `wfctl knowledge validate`, `wfctl knowledge build`, and `qmd update`.
    Rebuild embeddings only when semantic retrieval is needed.
15. Return to the originating intake, reconstruction, or change workflow and
    record exact promoted paths. Do not report completion while any gate fails.

## Authority rules

- Product intent, meaning, rules, and normative decisions require explicit
  maintainer authority.
- Existing implementation requires pinned source and direct inspection.
  Runtime claims require a fresh receipt when static code is insufficient.
- An absent delivery claim may use a reviewed whole-scope reconstruction
  receipt because nonexistent code cannot be pinned.
- Architectural rationale, ownership, contracts, and policy require
  maintainer review and contradiction checks against current implementation.
- Historical implementation requires pinned version-control history plus a
  reviewed archive or reconstruction receipt.
- External facts require primary sources.

A rejected proposal remains case-only by default. When repeated proposals
reveal a durable product boundary, ask the maintainer whether the boundary
itself is an accepted non-goal or negative rule. Only that explicitly accepted
rule may become current product knowledge or a decision; the rejected proposal
and its raw origin still remain outside the trust boundary.

If a concept mixes authority classes, attribute each material claim to the
correct source. A quality receipt checks the writing and evidence match; it
does not create authority.
