# Maintainer review

OKF records provenance, trust, and lifecycle; it does not provide an approval
process. Follow the project review protocol in `PROJECT_WORKFLOW.md`.

Require an explicit maintainer decision before:

- choosing a workflow route when significance is ambiguous;
- starting raw processing, whole-project reconstruction, durable external
  research, semantic curation, or broad direction shaping when the maintainer
  did not already request that outcome;
- implementing a significant spec whose outcome, scope, exclusions, acceptance
  criteria, or material decisions have not already been explicitly accepted;
- writing anything into `knowledge/`, which is the project speaking about itself;
- selecting current truth when evidence cannot resolve chronology or authority;
- closing work whose delivery no longer matches the framing they approved;
- recording `verified` by a `human:<id>` actor.

Do not request review for freezing a clean Git raw scope, file accounting, QMD
refresh, index or log maintenance, or source-backed drafts that keep their
trust state honest. Raw intake itself never counts as evidence.

Reading is never a decision. Accounting for what each bound repository declares
about itself, running Graphify in every bound root, checking curated knowledge
before settling meaning — a gate refusing until those are done is telling the
agent to go and do them, not handing the agent a question. Nothing about them
reaches the maintainer: not as a request, not as a status line, and not as an
apology for the delay. The one thing that does reach them is a product
consequence found while reading — a rule in one repository that makes the
proposed route impossible there is a decision, and it is put to them as what the
product must do instead, never as the file it was found in.

Record approve, correct, or defer. Silence is not approval.

## Write for someone who was not watching

The maintainer did not see the tool calls, the gate that refused, or the file
you fixed on the way. They hold no identifier you generated and no count from
your last turn. Every message is read cold, by a person deciding about their
product, and one that catches them up first buries what it came to say.

A message carries three things in this order, and stops:

1. **What is true now** that was not true before. One or two lines.
2. **What you need from them**, if anything. One question, one recommendation.
3. **What happens next without them.** One line.

Everything else goes in the record, which already has a place for each kind of
it: the discovery ledger for what you learned, the checkpoint for where the work
stands, review receipts for what you read, the blocker for what you are waiting
on. Sending it instead is not thoroughness. It moves the reading onto the person
least able to do it, and the record still ends up empty.

The message is finished when cutting any remaining sentence would change what
the maintainer does next. Cut one and check. If nothing changes, it was written
for you.

A structured document is the common way to fail this, because it looks like
care. Four hundred reports written while this rule was already in force:
sixty-three per cent carried a table and twelve per cent ended in a question. A
table compares things the reader already cares about. Reached for before there
is a question, it is a log with borders. Write the three lines first, and add a
table only when the answer turns on a comparison.

**Sentences.** Use the active voice. Give one idea per sentence and keep it to
twenty words. Use simple past, present, and future. Use the same word for the
same thing every time; a synonym reads as a second thing. Drop idioms, slang,
and internal vocabulary. Keep paragraphs to six sentences.

**Keep technical items exact.** A path, a symbol, a version, a price, or a count
is reproduced character for character or left out. Never paraphrase one into
approximate prose: "about five thousand" and "the pricing worker" cannot be
checked, and being unable to check it is the cost the shortening was supposed to
avoid. What decides whether it appears at all is the reader test below.

## Ask one thing, and make it cheap to answer

Give the answer a shape they can hit. Name the options, or say what a bare yes
changes. A question with no stub gets answered with a paragraph you then have to
interpret, which is a second decision you made on their behalf.

Say plainly that "I do not know" is an answer you can record. A recorded gap is
worth more than a preference guessed from a polite reply and then treated as
settled.

**Write their reply before you send the message.** Draft the answer you expect,
in their voice, one line. If nothing fits — if the only reply available is
"which one?" or "what specifically?" — then what you wrote is a status line and
the question is still missing.

Saying that something waits is the common way to fail this, and it fails because
it describes your queue rather than their decision. "Three records are ready and
all three are waiting on you" passes every other rule here: it names no count
alone, it can carry a table, it reads as brevity. It still leaves them to work
out what they are being asked. So does a category — "the boundaries", "a decision
about the deck", "your word on the shape" — which names the subject and withholds
the question. What passes is an alternative with its consequence: "delete the
twenty-two explanations, or give the row a note field; the note is my
recommendation, and it costs one migration."

This is a test rather than a list of phrases to avoid, because the failure is the
same in every language and rewords faster than any list can be kept. Apply it to
each sentence that puts something to them, including a blocker, a status line,
and the last line of a report.

## Find their answer before asking for it again

Run `wfctl knowledge decided "<subject>"` before putting anything to them. It
reads the four places an answer lands — a promoted decision page, the bundle that
asked the question, a resolved Wayfinder map, and a capture — and reports what it
finds with the date, their own words, and whether a curated page carries it. On a
bundle, `--record <id>` writes the result into the framing, and the framing gate
holds until it has.

Their answer is usually not on a page. Twenty-two of twenty-six recorded
decisions in one project had never been promoted, so a search of curated
knowledge truthfully found nothing and read exactly like a question nobody had
answered. Work already delivered counts the same way: a completed issue that
recorded a consequence as theirs to settle has answered the question once
already, and asking again spends their turn on their own bookkeeping.

Cite the page when there is one and the record when there is not, and say which.
A decision reachable only through an archive is one the corpus has not been
taught, and saying so is what eventually teaches it.

## Re-establish the subject before asking about it

A claim is the unit of record. It is not the unit of a question. Recorded
atomically, a claim keeps only what distinguishes it from its neighbors, which
is exactly what a reader who was not there cannot reconstruct: a packet built
straight from one carries a difference with no thing attached to it. "This is
one colour on one side and another on the other side — was that intended?" is a
complete atomic claim and an unanswerable question.

Before the packet is written, re-establish four things and put them above the
question:

- **What it is**, named as the product names it, and where a person using or
  operating the product meets it.
- **Where it came from** — which sources say this, and when they said it.
- **What turns on it** — the flow it sits in and what changes downstream if the
  answer goes either way.
- **What is true right now.** Go back to the pinned source and the current
  implementation and check. The candidate was extracted at reading time, before
  later findings, and other candidates recorded since may already contradict or
  settle it. A packet that repeats a days-old record without re-reading is
  asking the maintainer to adjudicate the agent's memory.

Ask about the subject and list its atomic claims underneath, rather than asking
about each claim. Several claims about one capability are one question; one
claim touching several capabilities is still one question, about the one thing
that has to be decided.

Translate rather than cite. A term that exists only in the implementation gets
replaced by what it does for the product, with the original in parentheses at
most once. A subject that cannot be described at all without file paths or
symbol names is a finding to record — the capability has no product-level
description yet — and never a licence to send the identifiers instead.

## The line, and how to tell which side you are on

| | Written for the record | Written for the maintainer |
| --- | --- | --- |
| Reader | The next agent, the compiler, an auditor | A person deciding about their product |
| Addresses | **Required.** A claim without its pointer is unverifiable | **None.** An address is something to look up, not something to read |
| Vocabulary | Whatever is exact | Whatever the product itself uses |
| Failure | A missing pointer | A sentence that cannot be answered without opening something |

Apply one test to every sentence before it reaches the maintainer:

> Would they have to look something up to understand this?

If yes, it is an address, whatever form it takes — a file, a symbol, a record id,
a ledger code, a commit, a section number, a milestone or tier code, a schema
value printed as a category, or a term that exists only inside the
implementation. It is a test rather than a list because it reads the reader, not
the shape of the string or the language it is written in.

Two failure modes, and over-correcting the first produces the second:

- **Addressed prose.** "The check in the catalog store was narrowed because the
  gate validates on publish." Every noun is something to look up.
- **Emptied prose.** "A check was narrowed for a reason that turned out to be
  wrong." Nothing to look up and nothing to decide on either.

What is wanted is neither: say what the thing does for the product, and say it
with enough substance to be judged. "The client stopped checking anything but the
shape of a record, on the belief that publishing would catch the rest — and
publishing does not." The pointer to the file stays in the record, and is brought
out when the maintainer asks to audit rather than to decide.

An address is never deleted to satisfy this. It moves. A finding whose evidence
was dropped to keep a sentence clean has been made worse, not better.

Where a packet can be generated from records rather than composed, generate it.
A renderer that never reads an address cannot print one, which is worth more than
care taken one message at a time. Where it must be composed — most places — the
test above is the whole rule, and it is the agent's to apply.

One decision per packet. Several stacked in one message read as a status report
and get answered as none of them.

Report waiting decisions by name and subject, or do not report them. Never by
count. "Eleven cases are gate-clean and none can close without your decision"
is accurate, reads as brevity, and works as concealment: it says nothing about
what the eleven contain, and the longer the queue the more it hides. Name each
one and what it turns on, one at a time; if that is too long for a single
message, that is a fact about the backlog, not a reason to compress it into a
number.

Confirming a written record is the exception, and it is one decision rather than
many. When the material already carries the maintainer's own dated decisions,
ask whether they still stand — once for the record, with named exceptions —
instead of reopening each from scratch. Recovering intent that was never written
and confirming intent that was are different questions, and asking the harder
one when the easier one applies is how a body of accepted work becomes an
unanswered queue.

## Where the two gates are, and why closure is not one

A maintainer decides two things about a piece of work. What it is, before it
starts. What the project says about itself afterwards. Everything between those
is the agent's, including the moment the work finishes.

**Put the framing decision before implementation.** `wfctl work issue claim`
refuses a delivery issue whose framing is unapproved, which is the moment to
present it: the bundle has been read, nothing is in flight, and the maintainer's
absence blocks nothing yet. Approving edits the change record, so refresh its
checkpoint and re-read it before claiming.

**Closure is arithmetic, so close it.** Whether the acceptance criteria are met,
the receipts carry evidence, every issue is terminal and the revisions are pinned
is what the completion gate itself checks. A maintainer asked to confirm that is
being asked to sign a sum they cannot check better than the tool, and the cost is
not theoretical: four bundles were framed and approved for one unattended night,
two were delivered in sixty-two minutes and stopped at that gate, the other two
were never started, and seven hours and fifty-four minutes passed before anyone
could say the word. Nothing about those two bundles was in doubt.

**Closure returns to them when delivery drifted from the framing.** That is the
one case at the end where something is genuinely undecided, because what was
approved is not what was built. Two things raise it, both observable: the
acceptance criteria have been reworded, added to or cut since the approval, or
work left the route as a dropped issue. The tool names which, and the completion
approval it then asks for is the same command it always was — now the exception
rather than the toll.

**Promotion is the gate that compounds.** Approving a completion writes a receipt
an auditor may read once. Approving a page writes what every future session reads
first and what the next framing is aligned against. Draft the pages under the
bundle's `promotion/` directory before closing, record them with `wfctl work
promotion <id>`, and put them to the maintainer with `wfctl work ask <id> --stage
promotion`, which shows the pages themselves rather than a list of paths. Their
word, through `wfctl work promote <id>`, is what writes them into `knowledge/`.

A bundle closed with pages waiting sits in the promotion queue instead of the
archive, and nothing running is held by it — the code shipped, the issues are
terminal. What it does hold is the next framing approval in the same Area, on the
ground that aligning new work against knowledge already known to be behind is the
alignment telling them something the project has stopped believing.

The packet ends by telling them a wrong page gets rewritten rather than argued
for, and that is a working sentence: rewrite the draft where it sits in the
queue, reseal it, refresh its review receipt, and run `wfctl work promotion <id>`
again. Their answer is never lost by correcting what it was about.

Approval and permission to start are different decisions and the record holds
them separately. A maintainer who approves a framing and says the work is not to
begin yet — including one approving only so the bundle stops cluttering their
queue — is parking it: `wfctl work approve ... --park "<why>"`, or `wfctl work
park` afterwards. A parked bundle refuses every delivery claim before any other
gate is even read. Only `wfctl work release --attested "<their words>"` starts
it, and a release is never inferred: not from a truthful answer to an unrelated
question, and not from the condition that held it having cleared. The last time
one was inferred, six commits landed in three source repositories.

Render every gate with `wfctl work ask <id> [--stage promotion|completion]`
rather than composing one. A framing carries what gets done, what deliberately
does not, what will make it finished, and in what order. A promotion carries the
pages themselves, in full, and says of each whether it replaces something the
project already claims. A completion — asked only where delivery drifted —
carries what the work does now, what it still does not do, what closing it takes
on, and what the project now says that it did not. Nothing else from a record
written for an agent reaches any of them. A section still holding the shipped
template's own words is reported as unwritten rather than read out as scope. A
render is only as honest as the record behind it: repair the record rather than
the packet, because a packet edited by hand is composed again.

Record a framing with `wfctl work approve <id> --stage framing --by
human:<maintainer-id>`, and a promotion with `wfctl work promote <id> --by
human:<maintainer-id>`, which writes the pages in the same act as the receipt.
Both write the `maintainer_review` entry and the durable approval record the
gates check. A framing approval also digests the acceptance criteria it settled,
which is what later tells a reworded contract from the one they agreed to.

Pass `--attested "<their answer, word for word>" --session "<where they said
it>"`. That is the ordinary path, because the ordinary case is a maintainer who
already answered in conversation, and sending them to a second terminal to
retype a generated bundle id, a stage name and their own identity relocates the
same answer to a less convenient channel while recording no more than the
attestation does. A typed confirmation and an out-of-band `--token` matching
`WFCTL_APPROVAL_TOKEN` both remain, unequal and recorded as such: they prove a
command ran outside your own writing, which is a stronger record and the
maintainer's to ask for, never your default. Never hand-write
`maintainer_review.status`, `by`, `at`, `method`, or `receipt`: a hand-written
receipt fails verification. Existing explicit maintainer instructions may
satisfy the framing decision, but still record it through the command; do not
ask for the same decision twice. Reopen the gate when the approved framing
changes materially — and where the acceptance criteria are what changed, the tool
reopens it for you at closure rather than trusting anyone to notice.

Approving edits the change record, so re-read it, refresh its review receipt,
and refresh the checkpoint afterwards.

A checkpoint blocker is the one sentence written for the maintainer rather than
for the next agent, and the only one that reaches them across a session
boundary. That makes a stale blocker worse than a missing one: a missing blocker
makes the next session look, and a stale blocker makes it act — reopening a
decision already made, or recommending an option since proved impossible. When
an answer, a discovery, or a change removes what a record was waiting for,
rewrite its blocker in the same turn. Nothing validates blocker text against the
record it hangs on; only the person changing the record can keep it true.

After every material maintainer turn, update the spec's mutable current state
and append the decision/discussion ledger before continuing. Preserve proposed,
approved, rejected, deferred, and superseded outcomes without copying the
conversation transcript.
