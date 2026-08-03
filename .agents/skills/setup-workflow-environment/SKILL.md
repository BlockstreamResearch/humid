---
name: setup-workflow-environment
description: Install, update, repair, or explain the shared project workflow environment in a clean or initialized knowledge repository or leaf source repository. Use when a maintainer asks to bootstrap wfctl, connect a repository to project knowledge, update workflow rules or skills, preserve existing AGENTS.md or CLAUDE.md instructions, or diagnose a broken workflow installation.
---

# Setup Workflow Environment

Install through deterministic `wfctl` operations while preserving all unowned consumer content.

## Command ownership

Run `wfctl init`, `wfctl upgrade`, and `wfctl check` yourself when terminal
access permits. Ask the maintainer for repository kind, paths, skill targets,
scope, and conflict decisions, not routine command execution. Provide a manual
command only when bootstrapping without `wfctl`, missing authority, or tool
access prevents execution; state that blocker explicitly.

Treat `wfctl init knowledge`, `wfctl init leaf`, and repository-local `wfctl
upgrade` as the normal optional maintainer-facing CLI entry points, and all may
be delegated to this skill. `--target`, `check`, `knowledge`, `work`, QMD, and
Graphify operations belong to the agent unless the maintainer explicitly
requests manual or automation-oriented instructions.

## Procedure

1. Confirm that Bun and `wfctl` are available. If `wfctl` is missing, stop and
   tell the maintainer how to install or link the canonical Bun package.
2. Confirm `qmd --version` reports at least `2.5.3`. If it is missing or old,
   ask for installation authority and run
   `bun install -g @tobilu/qmd@2.5.3`. QMD is the supported knowledge
   retrieval engine; do not substitute a custom indexer.
3. Before leaf initialization, require both the `graphify` CLI and the official
   native Graphify skill in the current session. Do not require either for a
   knowledge repository that is not inspecting source. If the CLI is absent,
   ask for user-level installation authority and run `uv tool install
   graphifyy`. If the native skill is absent, ask for authority and run
   `graphify install --platform <agent>` once for every selected agent
   platform. Then tell the maintainer to restart the agent and stop: an on-disk
   skill is not active in the current session. After restart, verify both
   requirements and repeat `wfctl init leaf`. Knowledge retrieval and raw
   intake use QMD, not Graphify.
4. Identify whether the target is a `knowledge` or `leaf` repository.
   A knowledge target may be a new directory without Git: ask the maintainer
   for authority to initialize it and pass `--init-git`. In an interactive
   terminal, `wfctl` asks this itself. A leaf must already be an existing Git
   repository; never use `--init-git` to turn an arbitrary leaf path into one.
5. For a leaf repository, obtain the local knowledge-repository path. Do not guess it.
6. Inspect existing `AGENTS.md`, `CLAUDE.md`, `.claude/rules`, `.agents/skills`, and `.claude/skills`, including symlink targets.
7. Run `wfctl init <knowledge|leaf> --target <path>` with `--knowledge <path>`
   for a leaf. Use the default project skill scope unless the maintainer chooses
   user scope or no skill installation. The dependency preflight must pass
   before the command writes files. A successful leaf initialization must also
   run `graphify update .` from the exact target checkout; do not accept a
   checkout whose local graph was never built. Preserve the existing root
   `.gitignore` while ensuring it excludes `graphify-out/`. Successful leaf
   init must also register durable repository identity in knowledge and add
   this exact worktree to ignored local state. It must not change that
   repository's active reconstruction selection.
8. Review the preview before confirming. For each conflict, preserve the
   existing content, accept the offered per-file backup and replacement, or
   stop. Never invent a blanket overwrite.
9. Let `wfctl` update managed instruction and guide blocks. If their markers
   are malformed or duplicated, stop and repair them with the maintainer rather
   than replacing the whole file. Use `wfctl init <kind>
   --print-instructions agents|guide` to obtain the exact managed text.
10. Confirm that `PROJECT_WORKFLOW.md` preserves pre-existing text outside the
   managed block.
11. Confirm the installed skills include the version-matched official `qmd`
    skill from `qmd skills path qmd` for every selected agent. New skills are
    not active in the current session automatically; tell the maintainer to
    restart the agent session before knowledge-dependent work.
    Confirm `explore-project-knowledge` is installed for both profiles so
    project discovery works identically from knowledge and leaf sessions.
    Confirm `shape-project-direction`, `specify-project-change`,
    `split-project-change`, and `implement-work-item` are installed for both
    profiles. For a knowledge profile, also confirm
    `research-project-context` is installed.
12. For a knowledge profile, confirm that `.qmd/index.yml` defines separate
    `knowledge`, `changes`, `intake`, `reconstruction`, and `raw` collections.
    Confirm that `reconstruction/active` and `reconstruction/archive` exist and
    `reconstruct-project-knowledge` is installed. `wfctl init`
    builds `.workflow/current/knowledge-graph.json` plus
    `.workflow/current/claim-ledger.json` and runs `qmd update`, so explicit
    knowledge navigation, claim-lineage audit, and BM25 retrieval must be
    ready immediately. Treat
    `qmd-models` and `qmd-embeddings` warnings as optional semantic setup, not
    as lexical-index success. Ask before `qmd pull` or `qmd embed`; the current
    model set is roughly 2 GB.
13. Run `wfctl check --target <path>` and report every failure and warning. For
    a leaf, confirm `graphify-graph` passes and refers to this checkout, not a
    sibling repository or another worktree, and confirm `graphify-ignore`
    passes. Confirm `repository-connection` identifies this exact known
    checkout and reports whether it is selected as the default, awaiting
    selection, or registered as an alternative for reconstruction.
    For a knowledge repository, report registered repositories, known
    worktrees, and explicit default reconstruction selections. Deferred
    selection is healthy during setup and must not be reported as a warning.
    Do not select during
    initialization; `reconstruct-project-knowledge` owns contextual selection
    when reconstruction is actually requested.
14. For a knowledge profile, run `wfctl knowledge validate` and
    `wfctl knowledge build`; do not create a raw intake case unless intake
    processing was requested.
15. Point the maintainer to `PROJECT_WORKFLOW.md`; it defines their review
    responsibilities for both profiles.

Use `wfctl upgrade` for an existing installation. A workflow 0.3 knowledge
repository requires a content migration after the generated assets upgrade:

1. inventory every existing curated concept without changing its meaning;
2. route stakeholder current behavior to `curate-product-knowledge`;
3. route technical realization to `curate-engineering-knowledge`;
4. split any mixed concept and connect the two views with explicit links;
5. preserve decision lineage, provenance, delivery state, and uncertainty;
6. invoke `verify-knowledge-quality` and record fresh quality plus normal
   verification receipts for the final content hash;
7. run `wfctl knowledge validate` and `wfctl knowledge build`.

Never infer a view, audience, or product meaning merely to silence an upgrade
error. Leave the concept draft and ask the maintainer when authority is
missing. Read [the installation contract](references/install-contract.md) when
handling unusual files or symlinks.

## Safety

- Preserve text outside `wfctl` markers.
- Never replace an existing file or directory with a symlink.
- Treat local edits to owned generated files as conflicts.
- Do not claim Codex consumes `.claude/rules`; Codex receives the routing contract through `AGENTS.md`.
- Let the pinned `skills` CLI install both workflow skills and QMD's
  version-matched native skill for the selected agent targets and scope. Do not
  hand-copy skills around it.
