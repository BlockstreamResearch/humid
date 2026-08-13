<!-- wfctl:begin -->
# Project Workflow

This is the maintainer-facing operating guide installed by `wfctl`.

- Profile: `leaf`
- Project knowledge: `../knowledge-humid`

The workflow is a project partnership system. It keeps the maintainer and agent
inside one shared project model from product intent to verified delivery. The
maintainer can recover and navigate that model directly; the agent uses the
same model to investigate, implement, verify, and maintain continuity.

It provides two linked, first-class roads:

- the **maintainer/product road** explains purpose, capabilities, behavior,
  rules, delivery, and evolution in human language;
- the **engineering road** explains architecture, ownership, source
  realization, contracts, operations, and verification.

Neither road is derived from the other. Shared Areas, changes, and decision
history keep them aligned. The agent inventories and verifies evidence,
maintains records, and presents bounded decisions. The maintainer supplies
product intent, resolves authority conflicts, and approves material
commitments.

## What the maintainer operates

Your normal interface is conversation. Describe the outcome in project
language; the agent chooses and runs `wfctl`, QMD, Graphify, Git inspection,
and record-maintenance operations. You do not need command syntax, record IDs,
generated paths, or structured-file schemas.

The normal optional manual CLI entry points are `wfctl init knowledge`, `wfctl
init leaf`, and `wfctl upgrade` from the repository being upgraded; the setup
agent can run them too. `--target` and other commands remain available for
agents, automation, diagnostics, recovery, and workflow contributors. You
review framing, missing authority, material choices, completion, and current
knowledge claims.

## Installed skill lineage

The leaf delivery flow directly reuses and modifies selected MIT-licensed
skills from `mattpocock/skills`: Wayfinder, To Spec, To Tickets, Implement,
TDD, and Code Review. `wfctl` integrates them into its own central bundle,
worktree claims, knowledge alignment, and completion gates; it does not install
the original suite or a second tracker beside them.

Project-scope copies live under `.agents/skills/` and/or `.claude/skills/` and
are recorded by `skills-lock.json`. These are generated consumer copies: update
the canonical `wfctl` package, then run `wfctl upgrade` here instead of editing
them locally. The canonical distribution keeps one third-party provenance
record and one upstream license instead of repeating them in every skill.
User-scope locations follow the selected agent convention.

After initialization, ask in ordinary language: “help me understand this
project,” “process raw,” “reconstruct the baseline,” “explain this Area,”
“shape this broad direction,” “research this external constraint,” “implement
this change,” or “check the workflow.” The installed skills translate those
requests into the complete internal procedure. You do not need to invoke a
skill by name.

## Trust boundary

| Surface | Purpose | Trust |
| --- | --- | --- |
| `raw/` | Continuous append-only dumps and source material | Untrusted clue source; never evidence |
| `intake/` | Git-frozen raw review cases | Operational audit trail; never cited by knowledge |
| `reconstruction/` | Source-first project baselines and audits | Qualified review records; opt-in, not default truth |
| `changes/active/` | One change bundle per significant outcome: parent contract, structured checkpoints, optional map, bounded issues, artifacts, and review ledger | Current execution agreement |
| `changes/archive/` | Closed change bundles plus resolved capture receipts | Historical record qualified by outcome and reviews |
| `changes/inbox/` | Pending captures with no active or curated owner yet | Non-authoritative queue awaiting explicit routing or discard |
| `knowledge/` | Curated OKF concepts | Default current project knowledge |
| source repositories | Executable implementation | Implementation authority at an exact revision |

Raw text can tell the agent what to investigate. It cannot support a claim,
even when several raw files agree. A trusted derivative must cite the
maintainer decision, pinned code, runtime receipt, closed change, or
primary external source that independently established the claim.

## Multiple inputs, one promotion gate

Raw dumps, source reconstruction, and ongoing work stay separate until
verification:

1. A bounded `raw/` scope is frozen to exact Git blobs in `intake/`.
   QMD helps locate relationships; the agent then reads every frozen file and
   extracts candidate claims.
2. A bounded reconstruction binds exact clean leaf revisions, uses Graphify
   plus direct source, creates repository dossiers, and separates observed
   implementation from accepted intent.
3. Significant ongoing work produces a central bundle under `changes/active/`
   with stable acceptance, bounded issue progress, complete file accounting,
   and fresh implementation receipts.
4. Every lane verifies each claim against its proper authority.
5. The maintainer adjudicates intent, normative decisions, and unresolved
   conflicts.
6. Only then does the agent update `knowledge/` and run the strict validator.

Unresolved raw candidates remain in intake. `knowledge/uncertainties/` is only
for live questions supported by trusted current evidence.

## Graphify boundary

Graphify is mandatory for source-code navigation and relationship analysis.
The routing skill checks that the official native `graphify` skill is active,
invokes any more specific Graphify skills, and stops code work if they are
missing. The agent then directly inspects the actual source and checks at the
bound Git revision; Graphify output itself is not authority.

Graphify is not the analyzer for Markdown, raw intake, or OKF concepts. QMD
provides BM25, semantic, and hybrid retrieval for those surfaces; direct file
reading, Git coverage, provenance, and validation remain authoritative.

## Compiled knowledge and claim graphs

`wfctl knowledge build` validates `knowledge/` and compiles only authored
Markdown links, typed `x-wf.relations`, Area ownership, and decision lineage
into `.workflow/current/knowledge-graph.json`. The ignored file is a
rebuildable navigation artifact: it adds no inferred truth and is never edited
or cited as authority.

The same build writes `.workflow/current/claim-ledger.json` from intake and
reconstruction cases. It contains atomic claim states and only explicit
supersession, contradiction, refinement, implementation, and derivation
relations. It helps trace adjudication and chronology, but never decides truth
or compensates for a relation the agent failed to record.

QMD discovers candidate documents by meaning. The compiled graph expands those
candidates through explicit reviewed relationships. The claim ledger traces
operational lineage. Graphify handles source code. In every case, the agent
reads the selected source documents directly.

## QMD retrieval boundary

`wfctl` installs a project-local `.qmd/index.yml` in the knowledge repository.
Its collections are intentionally separated:

- `knowledge` is the only default search surface;
- `changes`, `intake`, `reconstruction`, and `raw` require explicit collection
  selection.

The QMD index is disposable. Search rank and snippets help navigation but prove
neither corpus coverage nor truth. The agent runs QMD from the knowledge root,
updates the index after content changes, and reads selected files directly.
The official native `qmd` skill must be active in the current agent session;
installation on disk requires a session restart before it counts.

`wfctl check` distinguishes two readiness levels:

- BM25 lexical readiness is required and depends on a healthy project-local
  index refreshed by `qmd update`;
- semantic/hybrid readiness depends on local models and current embeddings.

Missing models or embeddings are warnings while BM25 remains healthy. Model
download and embedding work happen only when semantic retrieval is needed.

## OKF and the stricter workflow profile

`knowledge/` follows
[Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
OKF is a portable Markdown format, not an approval workflow. This project adds
a stricter profile:

- explicit `status`, `generated`, provenance, and current verification;
- explicit `view`, `purpose`, and `audience` so product and engineering
  knowledge cannot silently collapse into one document;
- explicit authority classes so deterministic validation can distinguish
  normative, implementation, historical, and external claims;
- explicit intent, delivery, and alignment state for product-bearing concepts;
- claim-level source IDs joined to Markdown footnotes;
- pinned repository revision and path for code sources;
- human verification for intent and normative decisions;
- explicit supersession or deprecation reason;
- reciprocal acyclic decision lineages with one stable current record;
- a semantic quality receipt with independent authority/truth and
  reader-communication axes bound to the current content hash;
- stakeholder sections and a no-code boundary for product documents;
- technical coverage and linked product meaning for engineering documents;
- no raw path, source, link, or footnote in current knowledge.

`stable` is lifecycle, not automatic truth. A material edit updates
`generated.at` and changes the deterministic knowledge content hash. Older
verification and quality receipts no longer match. The agent runs the semantic
quality reviews and records fresh axis plus verification receipts only after computing
`wfctl knowledge hash --concept <path>`.

## Choose the work route

Use the full workflow when work may change observable behavior, domain meaning,
interfaces, schemas, protocols, data or control flow, persistent state,
security, reliability, operations, architecture, ownership, or coordination
across components or repositories.

Use the lightweight path only when behavior and contracts clearly remain
unchanged. Size is not the classifier. When ambiguous, the agent explains the
impact, recommends a route, and asks you. A pending capture may preserve a
useful lightweight result without imposing the full gate, but only when no
active change or curated concept already owns it.

Accepted unowned material enters `changes/inbox/` through `wfctl work capture
add`. Leaf captures retain exact source/worktree metadata; knowledge captures
retain project-only intake/reconstruction proposals and their claim references.
The knowledge agent lists and reads pending captures, creates real destinations,
then resolves each as routed or discarded. Resolved receipts move to
`changes/archive/captures/`; they never become authority by themselves.

Active work never uses the inbox for session state. The owning change or issue
contains one structured checkpoint. The agent refreshes it after material
edits, and `wfctl work context` rejects a stale hash while still requiring the
underlying files to be read completely.

Read-only explanation, history, ownership, and health questions run
automatically. Raw processing, whole-project reconstruction, durable external
research, semantic curation, and broad direction shaping are deliberate:
unless you already requested the outcome, the agent explains the gap and asks
one focused confirmation before starting.

For a consequential initiative whose route is too unclear for one honest
specification session, the agent may recommend deliberate Wayfinder. One map
stores the destination, standing context, fog, and named resolution pointers;
precise questions become dependency-aware issues. When the route clears, the
agent reads every issue, synthesizes the ordinary change specification, and
only then starts delivery. It never builds the destination from an unresolved
map or creates a parallel strategy source.

## Review gates

1. **Routing** — only when significance is ambiguous.
2. **Framing** — outcome, scope, exclusions, acceptance criteria, and new
   decisions before significant implementation. Clear existing instructions
   can satisfy this; material re-scoping reopens it.
3. **Authority** — whenever evidence cannot establish current intent,
   chronology, or which source governs.
4. **Knowledge** — material claims about vision, product meaning, architecture,
   ownership, contracts, policy, decisions, supersession, or accepted risk.
5. **Promotion** — the pages the work would write into `knowledge/`, in full,
   and what each of them replaces.

You are not asked whether finished work is finished. Whether the criteria are
met, the receipts carry evidence and the revisions are pinned is what the tool
checks, and it checks it better than a summary of it can. The exception is
delivery that no longer matches the framing you approved — reworded criteria, or
work dropped from the route — and there the agent comes back to you.

An approval is explicit. Silence and continued conversation are not approval.
You never edit YAML manually.

Approvals are recorded by you: `wfctl work approve <change-id> --stage framing
--by human:<your-id>` for a framing, and `wfctl work promote <change-id> --by
human:<your-id>` for the pages, which writes them in the same act. Ordinarily the
agent records the answer you already gave in conversation, word for word. You can
ask instead for a typed confirmation, or for automation to use a `--token`
matching a `WFCTL_APPROVAL_TOKEN` you set out of band; a receipt written into the
record by hand fails verification either way.

This records provenance, not identity. It shows the approval came from a
deliberate separate step, not that a specific person typed it. Every other
review decision the agent records as a stable `human:<reviewer-id>` and
timestamp after you answer.

## Review packet

Each request should contain:

1. **Decision** — the exact claim, framing, or outcome.
2. **Evidence** — pinned sources and fresh verification.
3. **Conflicts** — contrary evidence, gaps, deviations, or risk.
4. **Recommendation** — the agent's preferred answer and reasoning.
5. **Requested response** — approve, correct, or defer.

Deferral is valid. The agent preserves uncertainty instead of guessing.
When several decisions are needed, the agent asks one at a time and updates
the living record before continuing.

## Significant-work loop

1. Classify the task.
2. Immediately create and bind a central bundle with `wfctl work start`.
3. Use `wfctl work status` to distinguish every exact implementation `Code
   root` from the central bundle. Use stage-specific `wfctl work context` to
   enumerate every file the agent must read. Project-only work has no code root.
4. Record the current request, constraints, open questions, and next action.
5. Analyze source code through Graphify and direct inspection in every bound
   repository; skip this only when the record has no code scope.
6. Align with current `knowledge/`.
7. Resolve blocking authority questions and obtain framing approval.
8. Set the change active. For multi-session work, create dependency-aware
   issues whose acceptance coverage and repository scope are explicit.
9. Read and claim one frontier issue from the exact bound leaf. Implement only
   there while keeping issue progress and the parent contract current.
10. Reconcile every stable criterion against the actual implementation.
11. With normal maintainer authorization, preserve the implementation
    in the bound Git commit; `wfctl` never commits automatically.
12. Run final checks against every clean commit and record one revision and
    worktree receipt per repository.
13. Enumerate and read the complete bundle, refresh every content-hash receipt,
    and reject unseen, changed, malformed, or silently dropped work.
14. Draft the pages this work changes under the bundle's `promotion/` directory,
    at the path each will occupy inside `knowledge/`, and record them with
    `wfctl work promotion <change-id>` — or `--none "<why>"` when nothing the
    project says about itself changed.
15. Run `wfctl knowledge build --target <Knowledge root>` to prove links,
    authored relationships, and stable-concept reachability.
16. Run `wfctl work verify`, and archive the honest outcome with
    `wfctl work close`. A bundle holding pages waits in the promotion queue
    rather than the archive.
17. Put the pages to you with `wfctl work ask <change-id> --stage promotion`, and
    write them on your word with `wfctl work promote <change-id>`. That copies
    them into `knowledge/`, validates them, and archives the bundle.

A material turn may come from discussion or investigation. It changes a
requirement, constraint, alternative, decision, scope, evidence, risk,
question, next action, or consequential understanding. The agent preserves new
information in the owning `Discovery ledger` when losing it could cause
repeated material investigation, a different choice, misunderstanding, or
unsafe action; then it updates mutable state and any decision lineage. After
interruption, compaction, or a clean-session start, it runs `wfctl work context
--stage resume` without an ID, accepts automatic selection only for one bound
record, reads every required bundle file completely, and resumes from recorded
state instead of chat memory.

Partial or abandoned outcomes are valid historical records. They must never be
relabeled as completed. A completed close also requires a clean bound checkout,
so the archived revision actually contains the verified implementation; the
workflow never commits automatically.

## Routine health

Ask the agent to “check the workflow environment” or “upgrade the workflow.”
It runs diagnostics or previews the upgrade, explains conflicts in human
terms, and requests only the decisions needed. Generated assets with local
edits become explicit conflicts and are never silently overwritten.

## Leaf repository practice

The curated project knowledge for this repository is at
`../knowledge-humid`.

At the start of significant work, the agent first creates a central bundle so
the discussion cannot disappear after compaction. It then performs Graphify
code analysis and QMD-assisted current-knowledge alignment before presenting
the framing packet. QMD runs from the configured knowledge root and searches
only its `knowledge` collection by default. At the end, you are shown the pages
the work would write into project knowledge, in full, and nothing enters until
you say so.

Describe the desired change in ordinary language. The agent owns creation,
status checks, verification, closure, and archival of the work record; you never
need its ID or commands. It asks you only for ambiguous routing, framing,
product authority, commit authorization, and what the project now says about
itself.

You may also ask read-only product questions here:

> I am new to this project. What is it for and what can it do today?

The agent reads the configured knowledge repository and progressively explains
the product without creating a work record or changing this checkout.

The canonical bundle remains under `changes/active/<change-id>/` in the
knowledge repository. `change.md` holds the parent contract, optional `map.md`
holds Wayfinder lineage, and `issues/` holds bounded work. Each active owner has
one structured checkpoint. This leaf stores
only ignored binding and claim pointers in `.workflow/current/`.

`wfctl work status` reports intentionally different paths:

- `Code roots`: one or more exact leaf checkouts or linked worktrees where
  their respective implementation may be read and modified.
- `Spec`: the parent `change.md`; stage-specific `wfctl work context` lists
  every additional map, issue, blocker, or artifact the agent must read.

The agent must never infer another checkout from repository name, branch, Git
common directory, or spec location. A worktree or branch mismatch blocks
verification and close until an explicit `wfctl work rebind`.

During discussion or investigation, every material change and every newly
learned fact whose loss could cause repeated work, a different decision,
misunderstanding, or unsafe action is written to the owning bundle record. The
record's `Discovery ledger` accepts any consequential observation with its
basis, implication, scope, and destination; it is not restricted to named
categories. The checkpoint is refreshed last. On resume, the agent discovers
the one active binding when unambiguous, inspects its checkpoint, and reads
every file and discovery entry listed by the current context rather than
relying on remembered chat.

When the completed change updates durable knowledge, review two separate
results when both changed: the stakeholder-facing product behavior and the
engineering realization. The product view should be understandable without
code; the engineering view should pin the actual implementation. A semantic
quality receipt with independent authority/truth and reader-communication
passes, plus strict structural validation, must pass before either is called
stable.
<!-- wfctl:end -->
