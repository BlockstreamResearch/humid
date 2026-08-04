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

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: reason(input.last_assistant_message ?? "", awaiting),
  }));
  process.exit(0);
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
  return [
    "Automatic turn check from wfctl. The maintainer did not write this.",
    "",
    "The turn ended with this text:",
    tail,
    "",
    "The repository reports work awaiting the agent:",
    outstanding,
    "",
    "Ending a turn hands control to the maintainer, so the question is not what",
    "your last message said. It is whether you are waiting on them. If you are",
    "not, you have not finished: take the next action you can take alone. That",
    "includes an action you named, and equally one you never mentioned.",
    "",
    "If you are waiting on them, name in one line what you need and end. \"The",
    "work continues by itself\" is not that line — nothing continues once the",
    "turn is over.",
    "",
    "This check returns while each turn moves the repository and releases on the",
    "first turn that does not. Do not acknowledge it, agree with it, explain",
    "yourself, or answer with an empty turn.",
  ].join("\n");
}

main();
