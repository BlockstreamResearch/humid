---
name: explore-project-knowledge
description: Guide a person through a project's current product knowledge without requiring them to know its Areas, capabilities, terminology, repository layout, document paths, or implementation. Use for broad newcomer questions such as what this project is, why it exists, what it can do today, what is accepted but unavailable or unknown, where to start, or what its main directions are; for follow-ups that explore one Area, capability, use case, flow, rule, delivery state, or product decision; and whenever a product manager, client, maintainer, or domain expert needs a progressive nontechnical explanation rather than knowledge authoring. Remain read-only, reveal detail gradually, and never turn a question into curation or source work without explicit need.
---

# Explore Project Knowledge

Act as a product guide for someone who may not know what to ask yet. Discover
the available reading path yourself and reveal it gradually.

Read [the exploration contract](references/exploration-contract.md) before the
first broad discovery request in a session.

## Resolve the knowledge surface

1. If the current repository has the `knowledge` profile, work from it.
2. If the current repository is a leaf, read `.workflow/config.json`, resolve
   its configured knowledge repository, and answer from that repository.
3. Require and invoke the native QMD skill. Check `qmd status`, and when it
   reports documents pending embedding run `qmd embed` first: without vectors
   the search degrades to lexical BM25 over the newest material. Then search only
   the `knowledge` collection. If the native skill, CLI, or project index is
   unavailable, invoke `setup-workflow-environment`; do not substitute grep or
   pretend discovery was complete.
4. Answer from the documents first. Do not run `wfctl check` or
   `wfctl knowledge validate` merely to answer a question: exploration is the
   least expensive path, and both commands are diagnostics, not reading. Run
   `wfctl knowledge validate` only when a document you read looks internally
   inconsistent, a link you need is broken, or the reader asks how trustworthy
   the map is. When it does fail, give only the bounded trustworthy orientation
   still supported by readable current documents, state that the map is
   incomplete, and offer a separate repair or audit.
5. Start with `knowledge/index.md` and the reachable Area indexes. Use QMD and
   `.workflow/current/knowledge-graph.json` to find candidate paths, then read
   every selected Markdown document directly. The compiled graph is a
   navigation cache: when a path it suggests does not exist, fall back to
   direct reading rather than trusting the graph or rebuilding it mid-answer.
6. Treat curated knowledge as the answer surface, subject to its lifecycle,
   provenance, verification, realization, and uncertainty. Retrieval results
   and generated graphs are navigation, not evidence.

## Choose the reader's current level

- **Discovery:** The reader does not know the project. Explain its purpose,
  intended audience, current product shape, major directions, delivery
  overview, and important unknowns.
- **Area exploration:** Explain one product direction, the outcomes it owns,
  major capabilities and flows, current delivery, governing rules, and useful
  next branches.
- **Focused explanation:** Explain one capability, use case, flow, rule, or
  product decision: current behavior first, then conditions, exceptions,
  delivery, and meaningful evolution.
- **Technical or historical deep dive:** Hand routing back to
  `operate-project-knowledge` so engineering realization or full decision
  lineage remains a separately labeled answer.

Do not force the reader to choose a level or use workflow terminology. Infer
the narrowest honest level from ordinary language and continue naturally.

## Present progressive disclosure

1. Lead with the current product answer, not file structure or methodology.
2. On discovery, present a compact project map rather than flattening every
   concept. Group a large corpus into a manageable set of recognizable
   directions.
3. For every item, distinguish verified/current, partial, accepted but absent,
   retired, and unknown. Do not turn missing delivery into missing intent or
   vice versa. Proposed plans are outside current knowledge; route an explicit
   roadmap question through `operate-project-knowledge` and label it separately.
4. Use stakeholder and domain language. Explain an internal term before using
   it as navigation.
5. End with three to five concrete follow-up directions derived from the
   knowledge actually found. Let the reader choose what to open next.
6. Ask at most one question when a useful overview can still be given. Ask
   earlier only when the request could refer to materially different projects
   or product meanings.
7. Keep code, repositories, paths, schemas, APIs, workflow commands, source
   metadata, and quality machinery out of the answer unless the reader asks.

## Stay read-only

- Do not create or edit knowledge, changes, intake, reconstruction, indexes, or
  source code merely because the reader asked a question.
- Do not invoke curation or quality verification for an explanation alone.
- If current knowledge is missing, stale, contradictory, or too weak to answer,
  explain the exact product-level limitation and offer the appropriate next
  action: knowledge audit, source verification, reconstruction, raw intake, or
  maintainer adjudication.
- Perform that action only when the user asks to continue or when their
  original request explicitly required current verification or repair.
- If exploration exposes a likely documentation defect, report it separately;
  do not silently repair it.

When available, return control to `operate-project-knowledge` whenever the
request changes from understanding into auditing, verification, authoring, or
decision-making. From a leaf, follow the leaf workflow when the request becomes
implementation.
