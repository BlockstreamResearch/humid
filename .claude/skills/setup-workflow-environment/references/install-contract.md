# Installation contract

## Instruction files

- Create `AGENTS.md` when absent.
- Update only the block between `<!-- wfctl:begin -->` and `<!-- wfctl:end -->`.
- When `CLAUDE.md` is absent, link it to `AGENTS.md`.
- When `CLAUDE.md` is a regular file, preserve it and maintain a separate marked block.
- Treat malformed, duplicated, broken, or externally targeted managed symlinks as conflicts.

## Skills

- Delegate skill placement to the pinned `skills` CLI.
- Use the installer's copy mode for every selected agent. Do not create
  cross-agent symlinks between `.agents/skills` and `.claude/skills`.
- Default to project scope; use user scope or no installation only when the
  maintainer chooses it.
- Install `setup-workflow-environment`, `analyze-with-graphify`, and the
  version-matched official `qmd` skill for both profiles.
- Install `operate-project-knowledge` only for the knowledge profile as the
  default router for explanation, history, audit, navigation, contradiction,
  and triage requests.
- Install `explore-project-knowledge` for both profiles. It gives knowledge and
  leaf sessions the same read-only progressive product-discovery path through
  the configured knowledge repository without requiring user knowledge of
  Areas, capabilities, or files.
- Install `process-raw-intake` only for the knowledge profile.
- Install `reconstruct-project-knowledge` only for the knowledge profile.
- Install `research-project-context` only for the knowledge profile.
- Install `shape-project-direction` for both profiles so an unbounded
  significant initiative can resolve its Wayfinder map inside the same central
  bundle before implementation starts.
- Install `specify-project-change`, `split-project-change`, and
  `implement-work-item` for both profiles so specification synthesis,
  dependency-aware issue creation, and exact-worktree execution are explicit
  reusable modes rather than hidden conventions.
- Install `curate-project-knowledge` for both profiles because a leaf agent
  must promote durable truth before closing significant work.
- Install `curate-product-knowledge`, `curate-engineering-knowledge`, and
  `verify-knowledge-quality` for both profiles. The orchestrator depends on
  them to keep stakeholder and technical views separate and to bind independent
  authority/truth and reader-communication review to the current content hash.
- Install alignment, work management, and verification skills for both
  profiles. Knowledge needs them for project-only and multi-repository bundles;
  a project-only bundle has no implementation checkout.
- Select Codex, Claude, or both explicitly.
- Let the pinned installer update an already owned selected skill in
  non-interactive mode. Remove only obsolete project-scope workflow skills
  whose lock entry still identifies this package; never remove an unowned
  skill by name.

The workflow skill `analyze-with-graphify` is a routing and policy gate, not a
copy of Graphify's native skill. Require the `graphify` CLI and the official
native `graphify` skill supplied by that tool whenever source code must be
analyzed. Verify native-skill availability against the current session
catalog; an on-disk file alone does not prove the running agent loaded it.
When the CLI is absent, ask for user-level installation authority and run
`uv tool install graphifyy`. Install the native skill with `graphify install
--platform <agent>` for every selected platform, then restart the session.
`graphify install --help` is the authority for currently supported platform
names. Do not report setup success until the restarted session exposes the
native skill.
Do not require Graphify for Markdown intake or OKF curation that does not inspect
source code.

Run `graphify update .` from the exact leaf checkout after applying an
initialization or upgrade. This graph is worktree-local evidence infrastructure:
do not reuse a sibling checkout's `graphify-out`, and do not report setup
success when the update command fails or the resulting graph has no nodes.
Maintain a `# wfctl:begin` / `# wfctl:end` block in the root `.gitignore` when
no existing exact `graphify-out/` rule already covers the artifact. Preserve
every pre-existing ignore rule.

The QMD skill is not maintained as a workflow copy. Resolve its source with
`qmd skills path qmd`, then let the same pinned `skills` CLI copy it to the
selected Codex and Claude targets. This preserves agent-target and scope
semantics while keeping the skill matched to the installed QMD version.

## Knowledge retrieval

- Require QMD `>=2.5.3` for both profiles because leaf alignment reads the
  linked knowledge repository and skill discovery depends on
  `qmd skills path qmd`.
- Install the supported baseline through Bun when authorized:
  `bun install -g @tobilu/qmd@2.5.3`.
- For a knowledge profile, let `wfctl` own `.qmd/index.yml` and
  `.qmd/.gitignore`.
- Keep QMD's database and model cache out of Git. The index is disposable and
  rebuildable from repository content.
- Include only `knowledge` in unscoped searches. Require explicit collection
  selection for `changes`, `intake`, `reconstruction`, and `raw`.
- Run QMD from the knowledge root so it uses the project-local index.
- Run `qmd update` during knowledge initialization and upgrade so lexical BM25
  retrieval is ready before success is reported.
- Diagnose `qmd status` and `qmd doctor` separately. A working lexical index is
  required. Missing models or stale embeddings are warnings until semantic or
  hybrid retrieval is needed.

## Knowledge and claim relationship graphs

- Compile authored Markdown links and workflow relation metadata with
  `wfctl knowledge build`; do not infer semantic relationships.
- Store the generated knowledge artifact at
  `.workflow/current/knowledge-graph.json` and the explicit intake/
  reconstruction claim ledger at `.workflow/current/claim-ledger.json`; both
  are already ignored.
- Build both during a valid knowledge initialization or upgrade.
- Make `wfctl check` fail when either artifact is missing, invalid, or stale.
- Keep QMD responsible for retrieval and Graphify responsible for source-code
  structure. The compiled graphs only represent authored knowledge links and
  explicit claim lineage.

## Rules

- Install readable copies under `.workflow/rules`.
- Mirror namespaced rule files under `.claude/rules`.
- Route Codex to `.workflow/rules` through the managed `AGENTS.md` block.

## Maintainer guide

- Install `PROJECT_WORKFLOW.md` as a managed, visible root document for both
  profiles, using a managed block that preserves text outside the markers.
- Render profile-specific content and the configured knowledge path.
- Treat malformed or duplicated managed markers as a conflict.
- Stop for maintainer-controlled repair when markers cannot be updated safely.
  Obtain the exact block with `wfctl init <kind> --print-instructions guide`.

## Ownership

`.workflow/state.json` records the hash of every installed owned file. Update an owned file only when the on-disk hash still matches the prior installed hash. Equal content is safe to adopt. Any other pre-existing content is a conflict.
When a later release removes an owned file, delete it only if its hash still
matches the recorded installed hash. Back it up first. A locally modified
obsolete file remains an explicit conflict.

`.workflow/repositories.json` is a dynamic, Git-tracked project source
registry, not a generated asset. It stores repository identity without local
paths. `.workflow/current/repositories.json` is ignored and stores any number
of known local worktrees per repository plus one explicit active selection
used only by default reconstruction. Leaf initialization adds a known worktree
but never changes an existing selection.
