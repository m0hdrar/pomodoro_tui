export type IntervalKind = "focus" | "short-break" | "long-break";
export type TimerStatus = "ready" | "running" | "paused";

export interface TimerConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  autoStartNext: boolean;
}

export interface TimerSnapshot {
  phase: IntervalKind;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAtMs: number | null;
  startedAtMs: number | null;
  completedFocusCount: number;
}

export interface CompletedFocus {
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
}

export interface TimerTransition {
  timer: TimerSnapshot;
  completedFocus?: CompletedFocus;
}

const MINUTE_MS = 60_000;

function durationFor(phase: IntervalKind, config: TimerConfig): number {
  const minutes = {
    focus: config.focusMinutes,
    "short-break": config.shortBreakMinutes,
    "long-break": config.longBreakMinutes,
  }[phase];

  return minutes * MINUTE_MS;
}

function readyInterval(
  phase: IntervalKind,
  completedFocusCount: number,
  config: TimerConfig,
): TimerSnapshot {
  const durationMs = durationFor(phase, config);

  return {
    phase,
    status: "ready",
    durationMs,
    remainingMs: durationMs,
    endsAtMs: null,
    startedAtMs: null,
    completedFocusCount,
  };
}

export function createTimer(config: TimerConfig): TimerSnapshot {
  return readyInterval("focus", 0, config);
}

export function updateReadyInterval(
  timer: TimerSnapshot,
  config: TimerConfig,
): TimerSnapshot {
  if (timer.status !== "ready") return timer;
  return readyInterval(timer.phase, timer.completedFocusCount, config);
}

export function resetInterval(
  timer: TimerSnapshot,
  config: TimerConfig,
): TimerSnapshot {
  return readyInterval(timer.phase, timer.completedFocusCount, config);
}

export function remainingMs(timer: TimerSnapshot, nowMs: number): number {
  if (timer.status === "running" && timer.endsAtMs !== null) {
    return Math.max(0, timer.endsAtMs - nowMs);
  }

  return Math.max(0, timer.remainingMs);
}

export function startTimer(timer: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (timer.status === "running") return timer;

  const remaining = remainingMs(timer, nowMs);

  return {
    ...timer,
    status: "running",
    remainingMs: remaining,
    endsAtMs: nowMs + remaining,
    startedAtMs:
      timer.phase === "focus" ? (timer.startedAtMs ?? nowMs) : null,
  };
}

export function pauseTimer(timer: TimerSnapshot, nowMs: number): TimerSnapshot {
  if (timer.status !== "running") return timer;

  return {
    ...timer,
    status: "paused",
    remainingMs: remainingMs(timer, nowMs),
    endsAtMs: null,
  };
}

export function completeInterval(
  timer: TimerSnapshot,
  config: TimerConfig,
  nowMs: number,
): TimerTransition {
  if (
    timer.status !== "running" ||
    timer.endsAtMs === null ||
    nowMs < timer.endsAtMs
  ) {
    return { timer };
  }

  let completedFocusCount = timer.completedFocusCount;
  let nextPhase: IntervalKind;
  let completedFocus: CompletedFocus | undefined;

  if (timer.phase === "focus") {
    completedFocusCount += 1;
    nextPhase =
      completedFocusCount % Math.max(1, config.longBreakEvery) === 0
        ? "long-break"
        : "short-break";

    if (timer.startedAtMs !== null) {
      completedFocus = {
        startedAtMs: timer.startedAtMs,
        endedAtMs: timer.endsAtMs,
        durationMs: timer.durationMs,
      };
    }
  } else {
    nextPhase = "focus";
    if (timer.phase === "long-break") completedFocusCount = 0;
  }

  let nextTimer = readyInterval(nextPhase, completedFocusCount, config);
  if (config.autoStartNext) nextTimer = startTimer(nextTimer, nowMs);

  return { timer: nextTimer, completedFocus };
}

export function skipInterval(
  timer: TimerSnapshot,
  config: TimerConfig,
): TimerSnapshot {
  if (timer.phase === "focus") {
    const longBreakDue =
      timer.completedFocusCount > 0 &&
      timer.completedFocusCount % Math.max(1, config.longBreakEvery) === 0;

    return readyInterval(
      longBreakDue ? "long-break" : "short-break",
      timer.completedFocusCount,
      config,
    );
  }

  return readyInterval("focus", timer.completedFocusCount, config);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
