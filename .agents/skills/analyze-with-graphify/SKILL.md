---
name: analyze-with-graphify
description: Mandatory Graphify routing gate for every source-code-dependent task. Use before locating, reading, explaining, planning, changing, debugging, reviewing, or verifying code; tracing callers, dependencies, data or control flow; estimating impact; or checking an implementation claim against a repository, even when the user does not mention Graphify. Check the current session for the official native graphify skill and any more specific Graphify skills, invoke them first, then inspect the actual source. Do not use Graphify as the primary parser, search engine, or authority for raw Markdown or curated knowledge files.
---

# Require Graphify First

This skill owns mandatory workflow routing. The official native `graphify`
skill supplied by Graphify owns tool-specific execution.

## Mandatory trigger

Invoke this skill before any source-code-dependent understanding or change,
including implementation, investigation, planning, review, verification,
debugging, navigation, impact analysis, architecture work, and verification of
knowledge claims against code. Do not wait for the maintainer to mention
Graphify.

Do not invoke it merely to read or reconcile Markdown, specs, raw intake,
curated concepts, prose documentation, or workflow configuration. Those use
QMD retrieval plus direct reading and their native structure. Invoke Graphify
when that work crosses the boundary into a source repository.

## Session skill gate

1. Inspect the skills exposed in the current session before source-code
   navigation.
2. Require the official native skill named `graphify`, or a provider-namespaced
   equivalent whose metadata identifies the official Graphify skill. Do not
   count this `analyze-with-graphify` routing skill as the native skill.
3. Identify any additional Graphify-specific skills in the session and invoke
   the most specific relevant one after loading the native skill.
4. Treat the current session catalog as authoritative. A skill file present on
   disk may require an agent restart before it becomes active.
5. Invoke the native `graphify` skill and follow its complete procedure before
   continuing the project task.

If the native skill is absent, stop repository analysis:

- If the `graphify` CLI is also absent, offer:

  ```sh
  uv tool install graphifyy
  graphify install --platform <agent>
  ```

- If the CLI exists, offer only the matching
  `graphify install --platform <agent>` command. Use `graphify install --help`
  to resolve the current platform name instead of guessing it.
- Tell the maintainer to restart the agent session after installation.
- Do not install user-level tooling without authority and do not silently fall
  back to a partial hand-written Graphify procedure.

## Project obligations

1. Use the native skill to query an existing `graphify-out/graph.json`
   immediately or build/update the graph when required.
2. Trace source-code relationships through the graph before drawing
   conclusions.
3. Open and inspect the actual source locations returned by Graphify. The
   source at the recorded Git revision, not the graph, is implementation
   authority.
4. Only then use `rg` or equivalent text search for exact tokens, literals,
   generated artifacts, or gaps not represented in the graph.
5. Record relevant queries, paths, and source locations in the active spec or
   curation record.

## Honesty

- Distinguish extracted edges from inferred or ambiguous edges.
- Do not turn a missing graph result into proof that code does not exist.
- State when the graph is stale and update it before relying on changed sources.
- Do not substitute grep output for relationship analysis.
- Do not cite `graphify-out/` as proof in curated knowledge. Cite pinned source
  locations and fresh checks reached through Graphify.
