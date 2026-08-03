---
name: split-project-change
description: Split one approved central change specification into dependency-aware tracer-bullet issues inside the same knowledge bundle. Use when the maintainer explicitly asks to create the execution breakdown, when delivery spans several safe agent sessions, or when parallel work needs an explicit frontier. Do not use before framing approval, for an unresolved Wayfinder map, or to create an external or leaf-local competing tracker.
---

# Split Project Change

Create bounded execution units without fragmenting the specification or losing
acceptance coverage.

Read [the issue-design contract](references/issue-design-contract.md) before
proposing the graph.

## Read the approved contract

1. Run `wfctl work context <id> --stage shape` and `wfctl work status <id>`.
2. Read `change.md` completely and confirm that framing is approved, the mode
   is `full` or `slice`, and stable acceptance IDs exist.
3. Reuse current source and knowledge understanding. If the proposed breakdown
   depends on implementation facts not yet checked, invoke Graphify-first
   analysis in the exact relevant code roots before publishing tickets.

## Draft the graph

Prefer narrow complete tracer bullets: one issue produces independently
reviewable behavior across every necessary layer and fits in one fresh session.
Do not split work into database/API/UI horizontal layers merely because the
repository does.

For each proposed issue show the maintainer:

- a human-readable title;
- the complete behavior or decision it delivers;
- stable acceptance IDs it contributes to;
- exact repository identities it may touch;
- genuine blocking issues;
- whether it is small enough for one fresh context.

Use expand-migrate-contract for a wide mechanical refactor that cannot keep the
system valid as independent vertical slices. Keep each migration batch bounded
by blast radius and make final contraction depend on every migration.

Ask whether the granularity and dependency edges are right. Publish only the
approved graph.

## Publish centrally

Create issues in dependency order so blocker IDs already exist:

```sh
wfctl work issue create <change-id> <slug> \
  --title "<title>" \
  --phase delivery \
  --type delivery \
  --satisfies AC-01 \
  --repository <repository-id> \
  --blocked-by ISSUE-001
```

Repeat options as needed. Each issue receives its own ready checkpoint; never
create a second issue or progress file in a leaf. Run `wfctl work issue list
<change-id>` and confirm every acceptance ID is covered, the graph is acyclic,
and the frontier matches the intended concurrency. Refresh the parent
checkpoint last with the first executable frontier action.

Do not implement during this skill. Hand a frontier issue to
`implement-work-item` in a fresh context.
