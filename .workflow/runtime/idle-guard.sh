#!/usr/bin/env bash
# Report a background command that has gone silent. Never decide for the agent.
#
# Duration is the wrong test: a talkative hour-long build is healthy and a
# silent loop is not. Silence only means nobody can tell from out here, so this
# reports and exits while the child keeps running. Exiting is the point — a
# finished background task is the only channel that reaches a working agent.
#
# The child writes to a regular file, never to a pipe. A stalled writer on a
# pipe blocks whoever reads it, which is how an earlier version of this script
# hung in exactly the way it exists to catch.

set -u
IDLE="${IDLE:-600}"
SELF=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
POLL="${IDLE_GUARD_POLL:-2}"

usage() {
  echo "usage: idle-guard.sh --shell <command-string>" >&2
  echo "       idle-guard.sh --watch <pid> --log <path>" >&2
  exit 64
}

# Progress is the two streams together; they stay separate everywhere else,
# because merging them would change what the caller sees on a healthy run.
log_size() {
  local total=0 file
  for file in "$@"; do
    total=$(( total + $(wc -c <"$file" 2>/dev/null | tr -d ' ' || echo 0) ))
  done
  printf '%s' "$total"
}

# Consumed CPU in seconds. A process that prints a heartbeat while blocked looks
# healthy to a silence test and stalled to this one.
cpu_seconds() {
  local raw
  raw=$(ps -o time= -p "$1" 2>/dev/null | tr -d ' ') || return 1
  [ -n "$raw" ] || return 1
  printf '%s' "$raw" | awk -F: '{s=0; for(i=1;i<=NF;i++) s=s*60+$i; printf "%d", s}'
}

# Fast commands must not pay for the watch, long ones must not spin: start
# tight, relax once it is clear this is not a quick command.
poll_interval() {
  local ran="$1"
  [ -n "$POLL" ] && { printf '%s' "$POLL"; return; }
  if   [ "$ran" -lt 5 ];  then printf '0.1'
  elif [ "$ran" -lt 30 ]; then printf '1'
  else                         printf '5'
  fi
}

report() {
  local pid="$1" started="$2" log="$3" command="$4" trigger="$5"
  local err="${log}.err"
  local elapsed=$(( $(date +%s) - started ))
  {
    echo "idle-guard: ${trigger} — this is a prompt to check, not a verdict."
    echo "  command    : ${command}"
    echo "  pid        : ${pid}   still running, untouched"
    echo "  elapsed    : ${elapsed}s"
    ps -o time=,%cpu=,state= -p "$pid" 2>/dev/null \
      | sed 's/^ *//' | sed 's/^/  cpu,%,state: /'
    echo "  full log   : ${log} (stderr: ${err})"
    echo "  last output:"
    tail -n 5 "$log" "$err" 2>/dev/null | grep -v '^==>' | sed 's/^/    | /'
    echo
    echo "  Silence is not evidence of failure. Do NOT kill or restart on this"
    echo "  report alone, and do NOT agree that something is wrong because it was"
    echo "  reported. Establish it: compare cpu time against elapsed, then check"
    echo "  the data the job writes. Never check by matching a process name — a"
    echo "  pattern matches the checking shell too, which is how silent waiting"
    echo "  gets mistaken for progress. Restarting healthy work is the more"
    echo "  expensive mistake."
    echo
    echo "  re-arm : IDLE=${IDLE} bash \"${SELF}\" --watch ${pid} --log ${log} &"
    echo "  abandon: kill -KILL ${pid}"
  } >&2
}

watch_pid() {
  local pid="$1" log="$2" command="$3" started="$4"
  local last size cpu_last cpu_at now quiet stalled
  last=$(date +%s); cpu_at=$last
  size=$(log_size "$log" "${log}.err"); cpu_last=$(cpu_seconds "$pid" || echo 0)
  while kill -0 "$pid" 2>/dev/null; do
    sleep "$(poll_interval $(( $(date +%s) - started )))"
    now=$(log_size "$log" "${log}.err")
    if [ "$now" != "$size" ]; then size="$now"; last=$(date +%s); fi
    stalled=$(cpu_seconds "$pid" || echo "$cpu_last")
    if [ "$stalled" != "$cpu_last" ]; then cpu_last="$stalled"; cpu_at=$(date +%s); fi

    quiet=$(( $(date +%s) - last ))
    if [ "$quiet" -ge "$IDLE" ]; then
      report "$pid" "$started" "$log" "$command" "no output for ${quiet}s"
      return 125
    fi
    # A CPU stall was tried as a second trigger and dropped: I/O-bound work —
    # downloads, network waits, a shell loop around sleep — consumes almost no
    # CPU while progressing perfectly well, so it fired on healthy commands.
    # Consumed CPU stays in the report, where it tells the agent whether a
    # silent process is waiting or working. It is evidence, not a verdict.
  done
  return 0
}

case "${1:-}" in
--shell)
  [ $# -eq 2 ] || usage
  command="$2"
  log="${TMPDIR:-/tmp}/idle-guard.$$.log"
  : >"$log"
  : >"${log}.err"
  # Bash hands a background job /dev/null unless stdin is redirected explicitly,
  # which would silently starve any command that reads it.
  if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL bash -c "$command" >"$log" 2>"${log}.err" <&0 &
  else
    bash -c "$command" >"$log" 2>"${log}.err" <&0 &
  fi
  child=$!
  tail -n +1 -f "$log" 2>/dev/null &
  streamer=$!
  tail -n +1 -f "${log}.err" >&2 2>/dev/null &
  streamer_err=$!
  disown "$streamer_err" 2>/dev/null || true
  # Drop it from the job table so terminating it does not print job-control
  # noise into the output the agent reads.
  disown "$streamer" 2>/dev/null || true
  started=$(date +%s)
  watch_pid "$child" "$log" "$command" "$started"
  stalled=$?
  kill "$streamer" "$streamer_err" 2>/dev/null
  if [ "$stalled" -eq 125 ]; then
    # Leave the child and its log in place: the agent decides, and --watch
    # re-arms onto the same pair without losing a second of work.
    exit 125
  fi
  wait "$child"
  code=$?
  rm -f "$log" "${log}.err"
  exit "$code"
  ;;
--watch)
  [ $# -eq 4 ] && [ "$3" = "--log" ] || usage
  pid="$2"
  log="$4"
  started=$(date +%s)
  watch_pid "$pid" "$log" "(re-armed watch on pid $pid)" "$started"
  stalled=$?
  [ "$stalled" -eq 125 ] && exit 125
  echo "idle-guard: pid ${pid} finished; its output is in ${log}" >&2
  exit 0
  ;;
*)
  usage
  ;;
esac
