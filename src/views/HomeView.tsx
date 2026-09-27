import { formatDuration, remainingMs, type TimerSnapshot } from "../timer";
import type { Task } from "../storage";

const ACCENT = "#6F9F78";
const MUTED = "#8A9690";

interface HomeViewProps {
  timer: TimerSnapshot;
  nowMs: number;
  settings: {
    longBreakEvery: number;
  };
  activeTask?: Task;
  todayFocusMs: number;
  todaySessionCount: number;
  notice: string | null;
  error: string | null;
  width: number;
  height: number;
}

function formatTotal(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

function phaseName(phase: TimerSnapshot["phase"]): string {
  switch (phase) {
    case "focus":
      return "FOCUS";
    case "short-break":
      return "SHORT BREAK";
    case "long-break":
      return "LONG BREAK";
  }
}

export function HomeView({
  timer,
  nowMs,
  settings,
  activeTask,
  todayFocusMs,
  todaySessionCount,
  notice,
  error,
  width,
  height,
}: HomeViewProps) {
  const compact = width < 64 || height < 18;
  const veryCompact = width < 46 || height < 13;
  const timeLeft = remainingMs(timer, nowMs);
  const progress =
    timer.durationMs > 0 ? 1 - timeLeft / timer.durationMs : 0;
  const barWidth = width < 46 ? 10 : 18;
  const filled = Math.max(0, Math.min(barWidth, Math.round(progress * barWidth)));
  const progressBar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const status =
    timer.status === "running"
      ? "IN PROGRESS"
      : timer.status === "paused"
        ? "PAUSED"
        : "READY";
  const action = timer.status === "running" ? "Pause" : "Start";
  const today = new Date(nowMs).toLocaleDateString(undefined, {
    weekday: compact ? undefined : "short",
    month: "short",
    day: "numeric",
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      paddingX={compact ? 1 : 2}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        border={compact ? false : ["bottom"]}
        paddingBottom={compact ? 0 : 1}
      >
        <text fg={ACCENT}>
          <strong>POMODORO</strong>
        </text>
        <text fg={MUTED}>{today}</text>
      </box>

      {error && (
        <text fg="#C87968">
          {error.length > Math.max(12, width - 4)
            ? `${error.slice(0, Math.max(9, width - 7))}…`
            : error}
        </text>
      )}

      <box flexGrow={1} justifyContent="center" alignItems="center">
        <box
          flexDirection="column"
          alignItems="center"
          gap={height < 14 ? 0 : 1}
          maxWidth={60}
        >
          <text fg={ACCENT}>
            <strong>{phaseName(timer.phase)}</strong>
          </text>
          <text>
            <strong>{formatDuration(timeLeft)}</strong>
          </text>
          <text fg={ACCENT}>{progressBar}</text>
          <text>{activeTask ? activeTask.title : "No task selected"}</text>
          {!veryCompact && (
            <text fg={MUTED}>
              {timer.completedFocusCount} of {settings.longBreakEvery} focus sessions
            </text>
          )}
          {!veryCompact && notice && <text fg={ACCENT}>{notice}</text>}
          {!veryCompact && <text fg={MUTED}>{status}</text>}
        </box>
      </box>

      <box
        flexDirection="column"
        gap={veryCompact ? 0 : 1}
        border={height < 14 ? false : ["top"]}
        paddingTop={height < 14 ? 0 : 1}
      >
        {!veryCompact && (
          <text fg={MUTED}>
            Today {formatTotal(todayFocusMs)} · {todaySessionCount} sessions
          </text>
        )}
        {compact ? (
          <>
            <text>[Space] {action} · [N] Skip · [R] Reset</text>
            <text>[T] Tasks · [S] Stats</text>
            <text>[,] Settings · [Q] Quit</text>
          </>
        ) : (
          <>
            <text>[Space] {action} · [N] Skip · [R] Reset</text>
            <text>[T] Tasks · [S] Stats · [,] Settings · [Q] Quit</text>
          </>
        )}
      </box>
    </box>
  );
}
