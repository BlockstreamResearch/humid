---
name: align-project-knowledge
description: Align a significant task's shaping spec with current project purpose, Areas, capabilities, flows, architecture, decisions, repository responsibilities, and known uncertainties. Use after the shaping record exists and before choosing a design, approving framing, changing a contract or flow, or making assumptions about why the project behaves as it does.
---

# Align Project Knowledge

Do not design from code and memory alone. Establish the project's current intent before proposing a solution.

## Procedure

1. Read `.workflow/config.json` and resolve the configured knowledge repository.
2. Inspect the current session skill catalog and require the official native
   `qmd` skill. Invoke it before retrieval. If it is absent, stop and ask to
   invoke `setup-workflow-environment` to repair or reinstall the selected
   project/user skills, then ask only for the unavoidable agent-session
   restart. An on-disk file alone does not prove the running agent loaded it.
3. Run QMD from that knowledge root. Require `qmd status`; if it reports
   documents pending embedding, run `qmd embed` before relying on vector or
   hybrid retrieval — indexing and embedding are separate, `qmd update` only
   marks what needs vectors, and searching without them silently degrades to
   lexical BM25 over exactly the material most recently written. If QMD or the
   project-local `.qmd/index.yml` is missing, stop and report the broken
   workflow environment.
4. Run `wfctl knowledge build --target <knowledge-root>`. Stop alignment if
   validation, knowledge-graph compilation, or claim-ledger compilation fails;
   do not silently reason over broken navigation. The generated
   `.workflow/current/knowledge-graph.json` is disposable knowledge navigation.
   `.workflow/current/claim-ledger.json` is disposable explicit candidate
   lineage. Neither is authority or an edit target.
5. Start at `knowledge/index.md`, then use `qmd search ... -c knowledge` for
   exact terms or a structured `qmd query` with authored `intent:`, `lex:`,
   `vec:`, and when useful `hyde:` fields for hybrid retrieval.
   If QMD MCP is available, use `query` with
   `collections: ["knowledge"]`. Open the returned concepts directly and use
   directory indexes for progressive disclosure. Retrieval ranking is not
   authority.
6. Expand the QMD candidates through explicit incoming and outgoing edges in
   the compiled graph. Follow material typed relationships, Area ownership,
   decision lineage, and human-authored links so lexical similarity does not
   define the task boundary.
7. Open only concepts relevant to the work, including:
   - vision and non-goals,
   - the relevant Area index, capabilities, concepts, rules, and flows,
   - architectural boundaries,
   - current and superseded decisions,
   - repository responsibilities,
   - recorded uncertainties.
8. Inspect `status`, `generated`, `verified.content_hash`, `stale_after`, and
   `sources` before treating a concept as authoritative. `wfctl knowledge
   validate` must prove that at least one verification matches the current
   material content.
9. Follow links to predecessor decisions and supporting sources when the proposed work depends on them.
10. Compare the proposed behavior with both code evidence and curated intent.
11. Treat only `knowledge/` as the default current-knowledge surface. Do not
   consult `raw/` or `intake/` to fill a gap.
12. Record QMD queries, graph-expanded concept paths, directly reviewed
    concept paths, constraints, and any conflict in the central change bundle.

When a bundle already exists, run `wfctl work status <id>` and stage-specific
`wfctl work context <id>` first. Read curated knowledge from its `Knowledge
root`, update only the returned bundle files, and inspect implementation only
from exact `Code roots`. Do not treat the knowledge repository as the
implementation checkout.

## When there is no baseline yet

An existing project installed into this workflow starts with an empty or barely
populated `knowledge/`, and that is a supported state, not an error. A
reconstruction is expensive enough that nobody runs one before their first fix,
so most first tasks in a real repository run without one.

Report absence rather than a clean result. "No conflicts with curated knowledge"
is literally true against an empty corpus and tells the reader nothing, while
reading exactly like a completed check. Record instead that no curated concept
covers this work, that the contract is therefore unaligned by absence rather
than by verification, and what the alignment rested on instead — pinned source,
tests, maintainer statements. The same applies to a populated corpus that simply
has nothing about this Area: coverage is per-subject, not per-repository.

Recommend a reconstruction when the gap is material and say what it would
establish, then proceed if the maintainer declines. It is a recommendation, and
it never becomes a precondition for doing the work.

## Conflicts

- `raw/` is neither evidence nor current truth. It is an untrusted clue source
  used only through `process-raw-intake`.
- A later timestamp does not automatically make a source authoritative.
- `status: stable` is valid only with a matching current content hash; normative
  claims additionally require human verification.
- A timestamp without a matching content hash does not prove the current text
  was reviewed.
- When sources or code disagree and the correct intent cannot be established, ask the maintainer.
- Preserve unresolved uncertainty explicitly. Do not create a spec that silently selects one interpretation.
