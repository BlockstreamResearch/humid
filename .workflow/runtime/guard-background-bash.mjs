#!/usr/bin/env node
// PreToolUse hook: put a stall watch around every shell command.
//
// A background command has no deadline and no stall detection, so one that
// stops progressing is never heard from again. Foreground commands are not
// exempt: the host moves one to the background once it runs long enough, and
// the watch has to be in place before that happens rather than after. Wrapping
// everything is also what keeps this free of guesses about which commands are
// worth watching.
//
// The watch does not judge the command; it reports so the agent can check.
//
// This runs before every tool call, so it must never fail and never block:
// any unexpected input produces no decision and the call proceeds unchanged.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "idle-guard.sh");
// Must stay under the host's foreground limit; see idle-guard.sh for why equal
// values silence the watch entirely.
const IDLE_SECONDS = process.env.WFCTL_IDLE_GUARD_SECONDS || "240";

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (payload?.tool_name !== "Bash") {
    return;
  }
  const input = payload.tool_input;
  if (!input) {
    return;
  }
  const command = typeof input.command === "string" ? input.command : "";
  if (!command.trim() || command.includes("idle-guard.sh")) {
    return;
  }

  process.stdout.write(`${
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          ...input,
          command: `IDLE=${IDLE_SECONDS} bash ${shellQuote(GUARD)} --shell ${
            shellQuote(command)
          }`,
        },
      },
    })
  }\n`);
}

try {
  main();
} catch {
  // A hook that fails is worse than a hook that abstains.
}
process.exit(0);
