#!/usr/bin/env node
// Stop hook. A turn that ends on a stated next action is the most common way
// autonomous work dies: nothing is blocked, nothing failed, and the transcript
// simply stops. Instructions do not fix it — the managed agent block already
// says "announce it and continue" and is ignored. What fixes it is costing the
// model another turn, because inside that turn the announced action is the
// cheapest thing to do.
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
const MAX_REENTRIES = 6;

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
      // State that keeps moving for reasons unrelated to this turn would
      // otherwise re-enter forever. Observed live: a stub whose counter
      // advanced on every read kept a blocked agent restating the same refusal
      // thirteen times before the ceiling ended it.
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

function memoryPath(cwd) {
  return join(cwd, ".workflow/current/stop-guard.json");
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
    "If that text stated a next action that was not taken, take it now.",
    "Continue while there is work you can do without the maintainer; this check",
    "keeps returning as long as each turn moves the repository, and releases on",
    "the first turn that does not.",
    "",
    "If the outstanding work genuinely needs the maintainer, say what you need",
    "from them in one line and end. Do not acknowledge this check, agree with",
    "it, explain yourself, or answer with an empty turn.",
  ].join("\n");
}

main();
