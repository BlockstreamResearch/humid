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
- selecting current truth when evidence cannot resolve chronology or authority;
- accepting material re-scoping, unresolved risk, or a completion claim;
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

Present a compact review packet containing the exact decision, evidence,
conflicts, recommendation, and requested response. Record approve, correct, or
defer. Ask one focused question at a time. Silence is not approval.

## Write the decision for the product owner

The maintainer decides what the product should be. They are not reading to
check the investigation, and they do not hold the file layout, the type names,
or yesterday's discovery numbering in their head. A packet written as if they
do forces them to reconstruct the product meaning out of engineering artifacts
before they can answer, and the usual outcome is not a wrong decision but no
decision at all.

Order the packet so the decision is answerable from the top:

1. **What happens today**, in the words a person using or operating the product
   would use. No file paths, no symbol names, no identifiers the product's own
   language does not contain.
2. **What is in doubt**, stated as a product question rather than an
   implementation observation.
3. **What each answer means** — what gets recorded, what changes, what does not.
   Reconstruction never edits source, so say plainly that no answer here fixes
   anything by itself.
4. **The recommendation**, one option named, with its cost.
5. **The evidence**, last and clearly separable, addressed by claim or discovery
   id for anyone who wants to audit it.

Detail is not the problem and must not be dropped; its position is. Depth that
arrives before the question buries it, and the same depth below a stated
question supports it.

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

If the subject cannot be described without file paths or symbol names, that is a
finding to record — the capability has no product-level description yet — and
not a licence to send the identifiers instead.

Translate rather than cite. A term that exists only in the implementation gets
replaced by what it does for the product, with the original in parentheses at
most once. If a decision genuinely cannot be stated without engineering
vocabulary, that is a finding rather than a licence: the capability has no
product-level description yet, and recording that gap is part of the answer.

## The line, and how to tell which side you are on

Everything this workflow produces is written for one of two readers, and the two
are not styles of the same text. They are different texts.

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
implementation. The test does not depend on the shape of the string or on the
language anything is written in, which is why it is the test and not a list.

Two failure modes, and the second is the one that follows from over-correcting
the first:

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

Put the framing decision before implementation, not before closure. `wfctl work
issue claim` refuses a delivery issue whose framing is unapproved, which is the
moment to present it: the bundle has been read, nothing is in flight, and the
maintainer's absence blocks nothing yet. Discovering the same gate at completion
parks finished work behind a decision that could have been made on day one.
Approving edits the change record, so refresh its checkpoint and re-read it
before claiming.

Approval and permission to start are different decisions and the record holds
them separately. A maintainer who approves a framing and says the work is not to
begin yet — including one approving only so the bundle stops cluttering their
queue — is parking it: `wfctl work approve ... --park "<why>"`, or `wfctl work
park` afterwards. A parked bundle refuses every delivery claim before any other
gate is even read. Only `wfctl work release --attested "<their words>"` starts
it, and a release is never inferred: not from a truthful answer to an unrelated
question, and not from the condition that held it having cleared. The last time
one was inferred, six commits landed in three source repositories.

Render the framing with `wfctl work ask <id>` rather than composing one. It
carries the four things approval fixes — what gets done, what deliberately does
not, what will make it finished, and in what order — and nothing else from a
record written for an agent. A section still holding the shipped template's own
words is reported as unwritten rather than read out as scope.

For significant work, record framing and completion decisions with `wfctl work
approve <id> --stage framing|completion --by human:<maintainer-id>`. It writes
both the `maintainer_review` receipt and the durable approval record the
completion gate checks.

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
changes materially.

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
