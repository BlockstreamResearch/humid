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
12. Ask whether this was already decided, and search `changes` for it — the QMD
    collection covering active and archived change records, selected with
    `-c changes`. A decision the maintainer made is recorded verbatim in the
    bundle that asked for it, and until that bundle's closure promotes it to a
    page, the archive is the only place it exists. Nothing in curated knowledge
    will say so, because a search of an empty decisions road truthfully finds
    nothing and reads exactly like a question nobody has answered. A resolved
    Wayfinder map lists them under `resolved`, one entry per answer. Cite the
    promoted page when there is one and the change record when there is not,
    and say which — a decision reached only through an archive is a decision the
    corpus has not yet been taught.
13. Record QMD queries, graph-expanded concept paths, directly reviewed
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

## Recorded drift is work nobody has claimed

`realization.alignment: drifted` on a curated page means the project accepted an
intent its implementation does not deliver. That row is a faithful record and
nothing more: reconstruction never edits source, so the gap it names outlives
the case that found it. `wfctl brief` reports `corpus.intent-delivery-drift`
with the pages by name, and a body of debt that only ever appears there is the
same as no record at all.

Read those pages whenever work touches their Area, and treat each one as a
candidate the current task either resolves, widens, or leaves untouched. Say
which, in the alignment record, so the next reader knows the drift was seen
rather than missed.

Drift becomes work through the ordinary route and never by direct promotion.
Group the drifted pages by the outcome that would close them — several rows are
usually one initiative — and put that outcome to the maintainer as one decision
with three honest answers: shape it now, accept the gap and record the intent as
superseded so the drift disappears truthfully, or defer it with a reason. Only
the first creates a bundle, through `shape-project-direction` when the route is
foggy and `specify-project-change` when it is not.

Never resolve drift by editing the page to match the code. That erases an
accepted intent to make a check pass, and the record of what the project meant
is the only thing that made the gap visible.

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
