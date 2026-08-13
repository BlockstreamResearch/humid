# Execution continuity

This applies while executing accepted work: a claimed issue, an approved scope,
a frozen frontier. It does not apply while shaping, specifying, or grilling a
decision with the maintainer. There the question count should be high, one
focused question at a time is correct, and stopping to ask is the work itself.

Ending a turn is an act, not a default. The whole corpus says how to ask the
maintainer and nothing says when not to, so an unowned pause reads as safe when
it is only cheap. While accepted work remains, hold three lines.

**Find it before asking it.** Locate the question in the accepted material —
the specification, the issue, the discovery ledger, the parent bundle's
decisions, the case record — and quote the line that answers it. A question the
material already answers is not a question. Absence of a quote is not permission
to ask; it is evidence the search was not done.

**A report is not the finish line.** Completion is defined by the issue's
acceptance criteria and proven by its terminal status. A finished plan item, a
written summary, a passing subtask, and a refreshed checkpoint are progress.

**Check that a stop would lose nothing, rather than believing it.** `wfctl
resumable` answers that from the repository: a checkpoint describing a record
that has since changed, an open record that never had one, and work on disk no
checkpoint describes and no commit preserves are three different losses, and the
last is the one a basis digest structurally cannot see. A non-zero exit is not a
finding to report onward — refresh the checkpoint or commit, then end. The
maintainer asking you to wrap up is the failure this replaces.

**End a turn only when you are waiting on the maintainer.** Ending one hands
control to them, so the test is what you are waiting for and not what you
wrote. Announcing a next action and stopping is the visible half of this; the
larger half announces nothing — "the work continues by itself", "the rest can
wait for the next boundary", a status report that names no blocker — and parks
just as completely, because nothing continues once the turn is over. If you are
not waiting on the maintainer, take the next action you can take alone.

**Finishing a unit is not finishing.** Completing an issue releases its claim,
so the bundle is left holding ready issues that nobody has claimed — which is
what every long run looks like between units, and the moment a turn is most
likely to end on "next I will do X" and then not. There is no boundary there.
The next unit is available work, and available work is yours.

**Say why you are stopping, in the record, when you stop.** Prose is not state:
a turn that explains itself and ends has explained itself to nobody, because the
explanation goes with the session. Two sentences end a turn, and they are
different sentences.

- The maintainer is what the work is missing. Record a blocker on the owning
  checkpoint — `--status blocked --blocker "<what you need from them>"` — which
  puts the work in their queue and takes it off yours.
- Nothing is missing except this session: the context is spent, or the next unit
  will not fit in what is left of it. Record `--handoff "<why this session stops
  here>"`, which tells the next session and asks them nothing. It is cleared by
  the next checkpoint, so it explains one stop rather than every stop after it.

A blocker for the second case is a lie that costs them a turn, and silence for
either is what the workflow returns you to.

**Never wait for a background command by spinning.** A command that outruns its
foreground limit is moved to the background and announces its own completion;
waiting for it is not your job and doing so costs more than it saves. A loop
that polls a file without pausing consumes a whole core, and it takes that core
from the build it is waiting for — a Rust suite was watched this way twice in
one session, for five hundred seconds each, against a compile competing for the
same processor, and the second watch timed out having learned nothing. If you
genuinely must wait on something the host does not announce, pause between
checks rather than spinning, and prefer doing unrelated accepted work.

**A discovery is not a stop.** Material that contradicts what was accepted is an
entry in the discovery ledger, and the work continues. Stop only when the
decision is irreversible beyond the current bundle, or when no unblocked work
remains — repeated identical failure, unavailable authority, a blocked source.
Discomfort and uncertainty are not on that list. Record the uncertainty as
uncertainty and keep going.

Questions that genuinely need the maintainer accumulate and are presented at the
frontier, the batch boundary, or review. Adjudication is a recorded claim
awaiting authority, not a halt: continue with every unit that does not depend on
the answer.

Do not answer this rule with agreement, restate it, or confirm that it is
correct. Apply it and take the next action.
