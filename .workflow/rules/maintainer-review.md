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

After every material maintainer turn, update the spec's mutable current state
and append the decision/discussion ledger before continuing. Preserve proposed,
approved, rejected, deferred, and superseded outcomes without copying the
conversation transcript.
