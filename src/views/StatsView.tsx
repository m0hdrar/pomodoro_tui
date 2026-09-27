import type { FocusSession, Task } from "../storage";

const ACCENT = "#6F9F78";
const MUTED = "#8A9690";

interface StatsViewProps {
  sessions: FocusSession[];
  tasks: Task[];
  todayFocusMs: number;
  todaySessionCount: number;
  height: number;
  width: number;
}

function formatTotal(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

export function StatsView({
  sessions,
  tasks,
  todayFocusMs,
  todaySessionCount,
  height,
  width,
}: StatsViewProps) {
  const taskNames = new Map(tasks.map((task) => [task.id, task.title]));
  const history = [...sessions].sort((a, b) => b.endedAtMs - a.endedAtMs);
  const listHeight = Math.max(3, height - 9);

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      gap={1}
      paddingX={width < 64 ? 1 : 2}
      paddingY={1}
    >
      <text fg={ACCENT}>
        <strong>TODAY'S POMODORO</strong>
      </text>
      <box flexDirection="row" gap={3}>
        <text>
          <strong>{formatTotal(todayFocusMs)}</strong> focused
        </text>
        <text>
          <strong>{todaySessionCount}</strong> sessions
        </text>
      </box>
      <text fg={MUTED}>Completed focus sessions</text>

      {history.length > 0 ? (
        <scrollbox height={listHeight} focused>
          {history.map((session) => {
            const time = new Date(session.endedAtMs).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            });
            const taskName = session.taskId
              ? taskNames.get(session.taskId) ?? "Completed task"
              : "Unassigned";

            return (
              <text key={session.id}>
                {time} · {formatTotal(session.durationMs)} · {taskName}
              </text>
            );
          })}
        </scrollbox>
      ) : (
        <text fg={MUTED}>Complete a focus interval to start your history.</text>
      )}

      <box flexGrow={1} />
      <text fg={MUTED}>[↑/↓] Browse history · [Esc] Back</text>
    </box>
  );
}
