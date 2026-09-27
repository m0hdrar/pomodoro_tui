import type { Task } from "../storage";

const ACCENT = "#6F9F78";
const MUTED = "#8A9690";

interface TasksViewProps {
  tasks: Task[];
  activeTaskId: string | null;
  selectedIndex: number;
  addingTask: boolean;
  taskDraft: string;
  width: number;
  height: number;
  onTaskDraftChange: (value: string) => void;
  onSubmitTask: () => void;
}

export function TasksView({
  tasks,
  activeTaskId,
  selectedIndex,
  addingTask,
  taskDraft,
  width,
  height,
  onTaskDraftChange,
  onSubmitTask,
}: TasksViewProps) {
  const activeTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed).slice(-3);
  const visibleTaskCount = Math.max(1, height - (addingTask ? 12 : 9));
  const startIndex = Math.max(
    0,
    Math.min(selectedIndex, activeTasks.length - visibleTaskCount),
  );
  const visibleTasks = activeTasks.slice(startIndex, startIndex + visibleTaskCount);

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
        <strong>TASKS</strong>
      </text>
      <text fg={MUTED}>Choose the task for your next focus session.</text>

      {activeTasks.length > 0 ? (
        <box flexDirection="column" gap={0}>
          {visibleTasks.map((task, index) => {
            const absoluteIndex = startIndex + index;
            const selected = absoluteIndex === selectedIndex;
            return (
              <text key={task.id} fg={selected ? ACCENT : undefined}>
                {selected ? "›" : " "} {task.id === activeTaskId ? "●" : "○"}{" "}
                {selected ? <strong>{task.title}</strong> : task.title}
              </text>
            );
          })}
        </box>
      ) : (
        <text>No open tasks yet.</text>
      )}

      {addingTask && (
        <box flexDirection="column" gap={1}>
          <text>New task</text>
          <input
            value={taskDraft}
            onChange={onTaskDraftChange}
            placeholder="What are you working on?"
            onSubmit={onSubmitTask}
            focused
            maxLength={80}
            width={Math.max(12, Math.min(48, width - 4))}
          />
          <text fg={MUTED}>Enter saves · Esc cancels</text>
        </box>
      )}

      {completedTasks.length > 0 && (
        <box flexDirection="column" gap={0}>
          <text fg={MUTED}>Recently completed</text>
          {completedTasks.map((task) => (
            <text key={task.id} fg={MUTED}>
              ✓ {task.title}
            </text>
          ))}
        </box>
      )}

      <box flexGrow={1} />
      {!addingTask &&
        (width < 64 ? (
          <box flexDirection="column" gap={0}>
            <text fg={MUTED}>[↑/↓] Browse · [A] Add</text>
            <text fg={MUTED}>[Enter] Select · [C] Complete · [Esc] Back</text>
          </box>
        ) : (
          <text fg={MUTED}>
            [↑/↓] Browse · [A] Add · [Enter] Select · [C] Complete · [Esc] Back
          </text>
        ))}
    </box>
  );
}
