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

For significant work, record framing and completion decisions with `wfctl work
approve <id> --stage framing|completion --by human:<maintainer-id>`. That
command needs an interactive terminal, or an out-of-band `--token` matching
`WFCTL_APPROVAL_TOKEN`; it writes both the `maintainer_review` receipt and the
durable approval record the completion gate checks. Never hand-write
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
