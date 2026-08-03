# Workflow routing

Classify work before changing product or implementation state. Creating a
`shaping` record is safe recordkeeping, not implementation.

A read-only question about the project, its current capabilities, or one
product direction is not implementation work. Invoke
`explore-project-knowledge` against the configured knowledge repository and
answer progressively. Do not create a shaping record unless the conversation
turns into a proposed decision or change.

Use the full workflow when work may change observable behavior, domain meaning, interfaces, data or control flow, persistent state, security, reliability, architecture, operational behavior, or coordination across components or repositories.

Skip the full workflow only when the change is clearly local and preserves behavior and contracts, such as presentation-only polish, copy edits, formatting, or a mechanical correction with no design choice.

If classification is uncertain, explain the possible impact and ask the maintainer whether to use the full workflow. Recommend one answer. If the maintainer declines, proceed lightly and offer a pending capture only when a reusable finding has no existing owner. Use `wfctl work capture add`; never duplicate active work in `changes/inbox/` or present the capture as authoritative history.

Never use task size alone as the classifier. A one-line contract change can be significant; a large mechanical rewrite can be lightweight.

Once work is classified as significant, create its central change bundle before
extended discussion so requirements, issues, decisions, and progress survive
session compaction.

When a consequential initiative is too uncertain to define acceptance criteria
without guessing across several dependent choices, recommend
`shape-project-direction`. Start Wayfinder only after maintainer agreement,
keep its map and issues in the same central bundle, and do not edit code until
the resolved route has been synthesized into a bounded specification.
