import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getStatePath } from "./storage";
import { formatDuration, remainingMs, type TimerSnapshot } from "./timer";

// The saved state always holds a paused timer, so the running app also
// publishes its live timer here for `pomodoro status` (e.g. herdr's tab bar).
export function getLivePath(statePath = getStatePath()): string {
  return join(dirname(statePath), "live.json");
}

export function writeLive(path: string, timer: TimerSnapshot): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: process.pid, timer }));
  } catch {
    // Best-effort: the status line just goes blank.
  }
}

export function clearLive(path: string): void {
  rmSync(path, { force: true });
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const LABELS = { focus: "Focus", "short-break": "Break", "long-break": "Long break" };

// Empty when the app isn't running, so status bars hide the entry.
export function statusLine(path = getLivePath(), nowMs = Date.now()): string {
  let live: { pid: number; timer: TimerSnapshot };
  try {
    live = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return "";
  }
  if (!isRunning(live.pid)) return "";

  const { timer } = live;
  const suffix = timer.status === "running" ? "" : ` (${timer.status})`;
  return `${LABELS[timer.phase]} ${formatDuration(remainingMs(timer, nowMs))}${suffix}`;
}
