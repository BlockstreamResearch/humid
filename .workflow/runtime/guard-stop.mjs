#!/usr/bin/env node
// Stop hook. Autonomous work dies when a turn ends while nothing is blocked:
// nothing failed, the transcript simply stops, and hours pass before anyone
// notices. Instructions do not fix it — the managed agent block already says to
// continue and is ignored. What fixes it is costing the model another turn,
// because inside that turn the next action is the cheapest thing to do.
//
// The question asked is whether the agent is waiting on the maintainer, not
// what its last message said. Framing it around a stated next action missed the
// larger half of the failure: a turn that ends on "the work continues by
// itself" or "the rest can wait" announces nothing, blocks on nothing, and
// parks just as completely.
//
// This never decides whether the work is done. It reports what the turn ended
// with and what the repository says is outstanding, and hands the judgment
// back. Deciding completion here is exactly how a Stop hook burns a session:
// a hook that keeps answering "not finished" forces turns the model cannot
// satisfy until the token cap ends it.
//
// The bound is progress rather than a single re-entry. One re-entry was the
// first attempt and it was too weak: an agent re-entered once, did real work,
// stopped again, and the second stop passed unconditionally, so the run parked
// itself for the night with the frontier still full. Progress is observable
// without judging anything — the state report either moved between two stops or
// it did not — so re-entry continues while the repository keeps changing and
// releases the moment it stops, under a hard ceiling that guarantees the turn
// always ends.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MESSAGE_LIMIT = 600;
const MAX_REENTRIES = 100;
const BLOCK_HISTORY = 50;

function allow() {
  process.exit(0);
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    allow();
    return;
  }

  // Waiting on a background task is a legitimate reason for a short turn; the
  // host re-invokes the agent when the task finishes.
  if (Array.isArray(input.background_tasks) && input.background_tasks.length > 0) {
    allow();
    return;
  }

  const cwd = input.cwd || process.cwd();
  // Turned off deliberately. The switch is a marker file rather than the absence
  // of the settings entry, because an upgrade reinstalls the entry and would
  // silently undo the maintainer's choice.
  if (disabled(cwd)) {
    allow();
    return;
  }
  const report = readState(cwd);
  if (!report) {
    allow();
    return;
  }
  // Every signal that awaits the agent arms this, including the ones that look
  // like housekeeping. Filtering by level was the wrong trade: a spent turn
  // costs seconds and the failure it catches costs a day. A signal awaiting the
  // maintainer stays out — that is a question for them, and forcing a turn on
  // it would only make the agent answer itself.
  const awaiting = (report.signals ?? []).filter((signal) => signal.awaits === "agent");
  if (awaiting.length === 0) {
    allow();
    return;
  }

  const fingerprint = stateFingerprint(report);
  const key = `${input.session_id ?? ""}:${input.prompt_id ?? ""}`;
  const previous = readMemory(cwd);
  const carried = previous.key === key
    ? previous
    : { key, count: 0, fingerprint: "", answer: "" };
  const answer = createHash("sha256")
    .update(input.last_assistant_message ?? "")
    .digest("hex");

  const remembered = writeMemory(cwd, {
    key,
    count: carried.count + 1,
    fingerprint,
    answer,
  });
  if (input.stop_hook_active) {
    // Without durable memory there is no way to tell a productive continuation
    // from a stuck one, so fall back to the weaker single re-entry rather than
    // risk a turn that cannot end.
    if (!remembered) {
      allow();
      return;
    }
    if (carried.fingerprint === fingerprint) {
      // The last re-entry changed nothing the repository can see. Asking again
      // would be asking the same question of the same state.
      writeMemory(cwd, { key, count: 0, fingerprint, answer });
      allow();
      return;
    }
    if (carried.answer === answer) {
      // The repository moved but the agent gave the same answer, which is what
      // a genuinely stuck one does while something else writes underneath it.
      writeMemory(cwd, { key, count: 0, fingerprint, answer });
      allow();
      return;
    }
    if (carried.count >= MAX_REENTRIES) {
      // A runaway backstop and nothing more. It was six, chosen from a rigged
      // test where the state moved on its own while the agent was stuck, and it
      // became the only bound that ever fired: a productive overnight run hit
      // it after six re-entries and parked for nine hours with work left. The
      // two content bounds above are the real ones — unchanged state and a
      // repeated answer both mean the next re-entry buys nothing — so this only
      // has to guarantee the turn ends.
      writeMemory(cwd, { key, count: 0, fingerprint, answer });
      allow();
      return;
    }
  }

  recordBlock(cwd, {
    at: new Date().toISOString(),
    session: input.session_id ?? "",
    reentry: carried.count + 1,
    awaiting: awaiting.map((signal) => ({ id: signal.id, subject: signal.subject ?? "" })),
  });

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: reason(input.last_assistant_message ?? "", awaiting),
  }));
  process.exit(0);
}

/**
 * Every block, with what armed it. Deciding whether this guard needs a way to
 * end a turn that is not a blocker takes evidence about the blocks it actually
 * makes, and the only alternative on offer was re-reading session transcripts by
 * hand and hoping the interesting one was among them.
 *
 * Bounded and rewritten whole: a log nobody prunes becomes its own problem, and
 * the recent blocks are the ones that answer anything.
 */
function recordBlock(cwd, entry) {
  try {
    const path = join(cwd, ".workflow/current/hooks/stop-guard-blocks.json");
    let history = [];
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(parsed)) {
        history = parsed;
      }
    } catch {
      // A first block, or a file this run is about to replace anyway.
    }
    history.push(entry);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(history.slice(-BLOCK_HISTORY), null, 1)}\n`, "utf8");
    renameSync(temporary, path);
  } catch {
    // Recording is for us, never for the turn. A hook that fails here would
    // cost the run something the evidence is not worth.
  }
}

function disabled(cwd) {
  try {
    readFileSync(join(cwd, ".workflow/current/hooks/stop-guard.disabled"), "utf8");
    return true;
  } catch {
    return false;
  }
}

function readState(cwd) {
  const result = spawnSync("wfctl", ["brief", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

/**
 * Everything the collectors observed, minus the timestamp that changes on every
 * run. Counters inside signal facts — files reviewed, packets accepted, pending
 * captures — move whenever work lands, so this distinguishes a turn that did
 * something from a turn that only spoke.
 */
function stateFingerprint(report) {
  return createHash("sha256")
    .update(JSON.stringify(report.signals ?? []))
    .digest("hex");
}

/**
 * Under `.workflow/current/`, which is gitignored, but one level down: in a leaf
 * repository wfctl reads every `*.json` at the top of that directory as an
 * active-work binding, so a state file left there broke every `wfctl work`
 * command with "Unsupported or malformed active work binding". A subdirectory
 * is invisible to that scan.
 *
 * `.workflow/runtime/` looks like the obvious home and is the wrong one: it
 * holds installed assets that upgrades own and Git tracks, so mutable state
 * there both dirties the tree and turns every upgrade into a conflict.
 */
function memoryPath(cwd) {
  return join(cwd, ".workflow/current/hooks/stop-guard.json");
}

function readMemory(cwd) {
  try {
    const value = JSON.parse(readFileSync(memoryPath(cwd), "utf8"));
    return {
      key: typeof value.key === "string" ? value.key : "",
      count: Number.isInteger(value.count) ? value.count : 0,
      fingerprint: typeof value.fingerprint === "string" ? value.fingerprint : "",
      answer: typeof value.answer === "string" ? value.answer : "",
    };
  } catch {
    return { key: "", count: 0, fingerprint: "", answer: "" };
  }
}

function writeMemory(cwd, value) {
  try {
    const path = memoryPath(cwd);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, "utf8");
    renameSync(temporary, path);
    return true;
  } catch {
    return false;
  }
}

function reason(message, awaiting) {
  const tail = message.length > MESSAGE_LIMIT
    ? `…${message.slice(-MESSAGE_LIMIT)}`
    : message;
  const outstanding = awaiting
    .map((signal) => `  - ${signal.summary}${signal.subject ? ` (${signal.subject})` : ""}`)
    .join("\n");
  // Written as targets rather than bans. Steering by prohibition drags the
  // forbidden behaviour into context and makes it more available: the ban
  // half-reads as an instruction to do the thing. This message closed on four
  // prohibitions in one sentence — acknowledge, agree, explain, answer empty —
  // and collected all four in the wild.
  return [
    "Automatic turn check from wfctl. This is the workflow speaking, not the",
    "maintainer.",
    "",
    "The turn ended with this text:",
    tail,
    "",
    "The repository reports work awaiting the agent:",
    outstanding,
    "",
    "Ending a turn hands control to the maintainer. The test is whether you are",
    "waiting on them, and the list above is the evidence. When you can act alone,",
    "act: take the next action, whether you named it or not.",
    "",
    "Two answers end this check, and they are different answers.",
    "",
    "The maintainer is what the work is missing. Record it as a blocker, which",
    "puts the work in their queue:",
    "",
    "  wfctl work checkpoint <id> --actor <you> --status blocked \\",
    "    --blocker \"<what you need from them>\" \\",
    "    --state \"<where the work stands>\" --next \"<what happens once they answer>\"",
    "",
    "Nothing is missing except this session — the context is spent, or the next",
    "unit does not fit in what is left. Record that instead, which tells the next",
    "session and asks the maintainer nothing:",
    "",
    "  wfctl work checkpoint <id> --actor <you> \\",
    "    --handoff \"<why this session stops here>\" \\",
    "    --state \"<where the work stands>\" --next \"<the next unit, named>\"",
    "",
    "Only the record ends this. An agent blocked on a person wrote what it needed",
    "in nine consecutive messages and was returned nine times, because the",
    "repository kept reporting the work as its own. A handoff is cleared by the",
    "next checkpoint, so it says why you stopped here rather than granting a",
    "standing licence to stop.",
    "",
    "Either way, run `wfctl resumable` before you end. It answers whether stopping",
    "now would lose anything; on a non-zero exit, refresh the checkpoint or commit,",
    "then end.",
    "",
    "This check returns while each turn moves the repository, and releases on the",
    "first turn that does not. Answer with the next action, taken.",
  ].join("\n");
}

main();
