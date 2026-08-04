# Evidence-first reasoning

Treat claims, plans, existing documents, and prior agent output as unverified until checked.

For any task that depends on understanding, locating, changing, debugging,
reviewing, or verifying source code:

1. Invoke `analyze-with-graphify` before reading or searching source code, even
   when the maintainer does not mention Graphify.
2. Require it to inspect the current session skill catalog and invoke the
   official native `graphify` skill.
3. Stop and tell the maintainer when either the Graphify CLI or native session
   skill is unavailable. Offer the supported installation and session-restart path.
4. Use text search only after graph traversal, as a supplementary precision tool.
5. Inspect the actual source reached through the graph and record the query,
   pinned revision, paths, symbols, and checks in the active change or curation
   record. Graphify output is navigation, not authority.

Do not use Graphify as the primary analyzer for raw or curated Markdown.
Use QMD for Markdown retrieval and the generated knowledge graph for explicit
relationship expansion. Use the generated claim ledger only for explicit
intake/reconstruction lineage. Neither graph is evidence; read selected files
directly. Before
knowledge-dependent work, require the official native `qmd` skill in the
current session and invoke it. An on-disk skill installed after session start
does not count; stop and request installation or a session restart instead of
inventing a partial QMD procedure. Raw coverage comes from Git-frozen intake
sources and explicit full-file review. Existing-project coverage comes from
exact clean source revisions, Graphify traversal, direct source and test
inspection, Git history review, repository dossiers, cross-repository
reconciliation, and maintainer adjudication. Curated trust comes from OKF
metadata, authoritative provenance, and current verification. QMD rank,
snippets, and its index are never authority.

Assume no source is in good condition. Documents may reference deleted paths,
specifications may have been rewritten without supersession, notes meant to be
temporary may be the only written intent, and history may record file moves
rather than decisions. Judge each source as it actually is in this project, not
as its kind is supposed to be.

When a source turns out to be unreliable, that narrows what it can establish and
widens nothing else. Do not answer it by electing a replacement authority: every
source stays a witness, and reconciling them is the work. Keep reading the
degraded source for terminology, chronology, and leads. Where it contradicts
itself over time, reconcile by chronology rather than choosing a version.

When no source can establish something, say so and record it as unknown. An
honest unknown is a result; a plausible answer assembled from the least-bad
source available is a guess the maintainer can no longer see through.

Never establish that work is progressing by checking that a process exists, and
never identify a process by matching its name: the pattern matches the shell
doing the checking, so a command that is waiting on itself reports as running.
Ask the data instead — the counters, records, or files the job writes. When a
background command is reported silent, that is a prompt to check, not a finding.
Compare consumed CPU time against elapsed time, read what the job has written,
and only then decide. Do not agree that something is broken because it was
reported, and do not restart healthy work; that costs more than waiting.

Do not turn mocks, fixtures, fakes, stories, showcase pages, benchmark
harnesses, placeholders, disabled checks, or partial wiring into production
completion claims. Behavior that exists only inside a demonstration surface is
not delivered, and behavior whose only caller is a test is implemented but not
verified — a green suite proves the test passed. Which of the two holds is a
question about what reaches the code, so it takes graph traversal and a recorded
query rather than a file listing. Name missing evidence and unfinished work
directly.
