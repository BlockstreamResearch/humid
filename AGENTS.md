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
- Approving a framing settles what the work is, never that it begins. When the
  maintainer approves and says starting is premature — including approving only
  to clear their queue — record both: `wfctl work approve ... --park "<why>"`.
  A parked bundle refuses every delivery claim, and only `wfctl work release
  --attested "<their words>"` starts it. Never infer a release from an answer to
  a different question, and never from the reconstruction or blocker that held
  it having since cleared: the condition ending is not the same as being told to
  go.
- Put both gates to the maintainer with `wfctl work ask`, which renders the four
  things each decision fixes and nothing else from a record written for you. A
  framing: what gets done, what deliberately does not, what makes it finished, in
  what order. A completion, with `--stage completion`: what the work does now,
  what it still does not do, what closing it takes on, what the project now says
  that it did not. When a render reads wrong, repair the record it read; a packet
  edited by hand is composed again, and composed is what put file paths and
  criterion ids in front of them.
- Record framing and completion approvals with `wfctl work approve`, never by
  editing `maintainer_review`; a hand-written receipt fails verification. Pass
  `--attested "<their answer, word for word>" --session "<where they said it>"`
  when they answered in the session, which is the ordinary case. Do not send them
  to a second terminal: retyping a generated bundle id, a stage name and their
  own identity records no decision the attestation does not. A typed confirmation
  or `--token` remains available and is theirs to ask for, never your default.
- Ask one material question at a time, include a recommendation, and update
  the durable record before continuing.
- Write to a maintainer who was not watching. They did not see the tool calls,
  the gate that refused, or the file you fixed on the way. One message carries
  three things and stops: what is true now, what you need from them, what
  happens next without them. Proof that the work happened goes in the record —
  discovery ledger, checkpoint, review receipts, blocker. Cut any remaining
  sentence and ask whether it changes what they do next. A table is for an
  answer that turns on a comparison, and is not the shape of a status report.
  Keep every such message in the product's own language, a blocker and a status
  line included. Identifiers the workflow generated mean nothing outside the
  records that define them — acceptance criteria, issue and discovery numbers,
  workstream and packet names, candidate ids, record slugs. Name the thing first
  and attach the identifier after it, if at all: "the approval gate the tests
  cannot open (AC-04)", never "blocked on AC-04".
- Preserve uncertainty and report missing evidence instead of guessing.
- Execute required `wfctl` commands yourself when tool access permits. Do not
  delegate routine CLI operation, spec editing, or record maintenance to the
  maintainer; ask them for decisions, approval, or missing authority.
- Treat the maintainer's natural-language request as the user interface.
  Outside bootstrap or explicit troubleshooting, never require them to know a
  subcommand, record ID, generated path, QMD query, Graphify invocation, or
  structured-file schema. Resolve those mechanics yourself.
- End a turn only when you are waiting on the maintainer. Ending one hands
  control to them, so the test is not whether you announced anything: a turn
  that closes with "the work continues" or "the rest can wait" parks just as
  completely as one that names a next step and abandons it. If you are not
  waiting on them, take the next action you can take alone, in the same turn.
  When you are waiting, say in one line what you need. A written report is
  progress and never the finish line; completion is the terminal status of the
  required records. This holds while executing accepted work and not while
  shaping or specifying, where asking is the work. When several materially
  different choices remain, present their human meaning, evidence, and
  recommendation; after the maintainer chooses, execute the corresponding
  commands yourself.
- Before ending a turn, run `wfctl resumable`. It answers, from the repository
  rather than from your memory of it, whether stopping now would lose anything:
  a checkpoint describing a record that has since changed, an open record that
  never had one, or work on disk no checkpoint describes and no commit preserves.
  A non-zero exit is not a report to pass on — refresh the checkpoint or commit,
  then end. The maintainer should never have to ask you to wrap up.
- For significant multi-turn work, create the central bundle early. After every
  material maintainer turn or agent investigation cycle, preserve
  consequential new understanding in the owning record's broad `Discovery
  ledger`, update the affected semantic state, and refresh its structured
  checkpoint last. The preservation trigger is consequence of information
  loss, not a fixed category of findings. Small jobs noticed along the way go in
  the checkpoint's own list — `--todo-add`, cleared with `--todo-drop` — which is
  neither a blocker nor the next action, survives a checkpoint that says nothing
  about it, and reaches the next session through the brief. Anything you intend
  to "come back to" and leave only in prose is lost with the context holding it.
- Run `wfctl brief --json` before anything else in a session, unless a session
  brief was already delivered as context, in which case use that one — after
  checking it arrived whole. A brief grows with the number of open records and
  is delivered truncated once it passes what a session accepts, as a preview and
  a path to the rest. Read that path before using it. The preview is the first
  bytes rather than the important ones, and a session opened on it starts from a
  fraction of the state while reading exactly like a complete one. It is the
  authoritative current state of this repository: signals are observed facts and
  capabilities are derived from them. Do not rediscover that state by scanning
  records, and do not read the list back to the maintainer. Every open record
  carries a `*.resume` signal holding where its work stopped and the next action
  it named; that is the resume state, so read it rather than reconstructing one.
  Compose one short orientation from it — what exists, what is in progress, what waits on them —
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
  reason; never duplicate active progress there. The brief names every pending
  capture, so an unresolved one is not unknown to you — a queue that grows
  without anyone opening it is the same as no queue. A capture only the
  maintainer can settle is created with `--awaits maintainer` and presented to
  them as one decision at a time, not listed as a backlog.
- After `wfctl upgrade`, commit the files it names in a commit of their own
  before continuing. They are tracked project files, and folding them into the
  next unrelated commit hides what the upgrade changed. The new agent block and
  rules reach a session only at its start, so say plainly that a restart is
  needed rather than acting as if the new instructions are already loaded.
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
