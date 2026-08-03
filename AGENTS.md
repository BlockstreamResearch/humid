<!-- wfctl:begin -->
## Project workflow

This block is managed by `wfctl`. Read `.workflow/config.json` and all files under `.workflow/rules/` before project work. Use `PROJECT_WORKFLOW.md` as the maintainer-facing contract for review gates.

- Invoke `analyze-with-graphify` before inspecting, searching, planning,
  changing, debugging, reviewing, or verifying source code, even when the
  maintainer does not mention Graphify.
- Require that skill to confirm and invoke the official native `graphify` skill
  exposed in the current session before project analysis continues.
- Treat Graphify as the primary source-code navigation tool; text search is
  supplementary and direct source inspection is authoritative.
- Do not use Graphify as the primary analyzer for Markdown intake or curated
  knowledge.
- Use QMD from the knowledge repository for Markdown retrieval. Treat its
  index, ranking, and snippets as navigation only; verify by direct reading and
  authoritative sources.
- Present bounded review packets and require explicit maintainer decisions at the gates defined by the workflow.
- Record framing and completion approvals with `wfctl work approve`, never by
  editing `maintainer_review`. The maintainer confirms in their own terminal;
  a hand-written approval receipt fails verification.
- Ask one material question at a time, include a recommendation, and update
  the durable record before continuing.
- Preserve uncertainty and report missing evidence instead of guessing.
- Execute required `wfctl` commands yourself when tool access permits. Do not
  delegate routine CLI operation, spec editing, or record maintenance to the
  maintainer; ask them for decisions, approval, or missing authority.
- Treat the maintainer's natural-language request as the user interface.
  Outside bootstrap or explicit troubleshooting, never require them to know a
  subcommand, record ID, generated path, QMD query, Graphify invocation, or
  structured-file schema. Resolve those mechanics yourself.
- When internal state offers one safe valid continuation, announce it and
  continue in the same turn. Ending a turn on a stated next action is the
  announcement without the continuation: take the action, or record why it
  cannot be taken. A written report is progress and never the finish line;
  completion is the terminal status of the required records. This holds while
  executing accepted work and not while shaping or specifying, where asking is
  the work. When several materially different choices remain, present their
  human meaning, evidence, and recommendation; after the maintainer chooses,
  execute the corresponding commands yourself.
- For significant multi-turn work, create the central bundle early. After every
  material maintainer turn or agent investigation cycle, preserve
  consequential new understanding in the owning record's broad `Discovery
  ledger`, update the affected semantic state, and refresh its structured
  checkpoint last. The preservation trigger is consequence of information
  loss, not a fixed category of findings.
- Run `wfctl brief --json` before anything else in a session, unless a session
  brief was already delivered as context, in which case use that one. It is the
  authoritative current state of this repository: signals are observed facts and
  capabilities are derived from them. Do not rediscover that state by scanning
  records, and do not read the list back to the maintainer. Compose one short
  orientation from it — what exists, what is in progress, what waits on them —
  and offer the operations reported available. For a blocked capability, name
  what would unblock it instead of starting it. The brief never starts work; a
  signal with `awaits: maintainer` is a question for them, not a task for you.
- On resume, compaction, or a clean-session start, run `wfctl work context
  --stage resume` without an ID. Auto-select only when exactly one active record
  is bound to the current checkout. If several exist, inspect `wfctl work
  status` and ask the maintainer which human outcome to resume; never guess.
  Read every required file and discovery entry completely, then recover from
  the bundle, current checkpoint, and exact claim rather than conversation
  memory.
- Use `changes/inbox/` only for pending captures that have no active or curated
  owner. Resolve each capture to existing destinations or discard it with a
  reason; never duplicate active progress there.
- Do not create a competing leaf-local spec or issue tracker. Claim one central
  frontier issue from the exact bound checkout before implementation. Before
  completion, account for every bundle file at its current hash; a receipt
  proves accounting, not comprehension.
- Treat the maintainer/product and engineering roads as linked, first-class
  views of the same project, never one blended document and never one derived
  from the other. Product pages explain current behavior to stakeholders;
  engineering pages explain implementation to engineers and operators.
  Decision lineage connects both roads rather than forming a third flat view.
- Route broad project discovery, newcomer onboarding, Area exploration, and
  focused product-understanding questions to `explore-project-knowledge`.
  Exploration is read-only: answer progressively from curated knowledge
  without requiring the user to know Areas, capability names, or file paths.
- Route product authoring to `curate-product-knowledge`, technical authoring to
  `curate-engineering-knowledge`, and every material knowledge edit through
  `verify-knowledge-quality` before it becomes stable. Keep authority/truth
  and reader communication as separate semantic passes.

This is a leaf repository. Its project knowledge is located at `../knowledge-humid`.

Classify work with the installed `manage-project-work` skill before changing
implementation state. For significant work, create the central bundle first,
then invoke `analyze-with-graphify` and `align-project-knowledge` before
implementation.

If a consequential initiative has several unresolved dependent product or
architecture choices and cannot yet support honest acceptance criteria,
recommend `shape-project-direction`. Start its Wayfinder map only after
maintainer agreement, and do not edit code until the map has been synthesized
into a reviewed bounded specification.

For read-only questions about what the project is, what it currently provides,
or how one product direction works, invoke `explore-project-knowledge` against
the configured knowledge repository. Do not require the user to name an Area,
capability, or knowledge path. A product explanation alone does not create a
work record or authorize code changes.

Run QMD from the configured knowledge repository for knowledge retrieval. Do
not query `raw/` or `intake/` to fill gaps in current project truth.

After `wfctl work start`, run `wfctl work status <id>` and the stage-specific
`wfctl work context <id>` before any code edit, after changing directories,
and before verification or close. On a clean session or unspecified resume,
start with `wfctl work context --stage resume` without an ID; it may select only
one bound active record and otherwise requires a maintainer choice.
Use only the reported `Code roots` for their respective code operations and
the reported `Spec` only for record updates. Refresh the owning change or issue
checkpoint after every material edit. A worktree is a distinct
code root; never infer another checkout from repository name, branch, or spec
location. A branch/worktree mismatch requires explicit `wfctl work rebind`
before any code edit.

Keep one canonical change bundle in the knowledge repository. `change.md` owns
the parent contract, optional `map.md` owns Wayfinder lineage, and `issues/`
owns bounded progress. After material discussion or investigation, preserve
consequential new understanding in the current owner's `Discovery ledger`,
update its semantic state, and refresh that record's checkpoint last. Claim one
frontier issue from the exact leaf before implementation. Verify the whole
bundle with `verify-project-work`,
promote durable truth separately, then archive the directory intact.

During promotion, keep linked product and engineering views separate. Invoke
`curate-product-knowledge` for stakeholder-facing behavior,
`curate-engineering-knowledge` for technical realization, and
`verify-knowledge-quality` before a materially changed concept becomes stable.
The quality gate keeps authority/truth and reader communication as independent
passes.
<!-- wfctl:end -->
