import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  completeInterval,
  createTimer,
  pauseTimer,
  remainingMs,
  resetInterval,
  skipInterval,
  startTimer,
  updateReadyInterval,
} from "./timer";
import {
  defaultState,
  getStatePath,
  loadState,
  saveStateAtomic,
  type PersistedState,
  type Task,
} from "./storage";
import { clearLive, getLivePath, writeLive } from "./status";
import { HomeView } from "./views/HomeView";
import { SettingsView } from "./views/SettingsView";
import { StatsView } from "./views/StatsView";
import { TasksView } from "./views/TasksView";

type Screen = "home" | "tasks" | "stats" | "settings";

interface AppState {
  data: PersistedState;
  screen: Screen;
  hydrated: boolean;
  storageHealthy: boolean;
  error: string | null;
  notice: string | null;
  addingTask: boolean;
  taskDraft: string;
  selectedTaskIndex: number;
  selectedSettingIndex: number;
  forceQuitOnNextExit: boolean;
}

type Action =
  | { type: "load-success"; data: PersistedState }
  | { type: "load-failure"; error: string }
  | { type: "navigate"; screen: Screen }
  | { type: "start-add-task" }
  | { type: "cancel-add-task" }
  | { type: "set-task-draft"; value: string }
  | { type: "add-task"; id: string }
  | { type: "select-task-index"; index: number }
  | { type: "activate-task"; taskId: string }
  | { type: "complete-selected-task" }
  | { type: "toggle-timer"; nowMs: number }
  | { type: "reset-interval" }
  | { type: "reset-cycle" }
  | { type: "skip-interval" }
  | { type: "complete-interval"; nowMs: number; sessionId: string }
  | { type: "select-setting"; index: number }
  | { type: "adjust-setting"; delta: number }
  | { type: "toggle-auto-start" }
  | { type: "toggle-notifications" }
  | { type: "save-failure"; error: string }
  | { type: "save-success" };

function currentTasks(data: PersistedState): Task[] {
  return data.tasks.filter((task) => !task.completed);
}

function createInitialAppState(data?: PersistedState): AppState {
  return {
    data: data ?? defaultState(),
    screen: "home",
    hydrated: data !== undefined,
    storageHealthy: true,
    error: null,
    notice: null,
    addingTask: false,
    taskDraft: "",
    selectedTaskIndex: 0,
    selectedSettingIndex: 0,
    forceQuitOnNextExit: false,
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "load-success": {
      const tasks = currentTasks(action.data);
      const activeIndex = tasks.findIndex((task) => task.id === action.data.activeTaskId);
      return {
        ...state,
        data: action.data,
        hydrated: true,
        storageHealthy: true,
        error: null,
        selectedTaskIndex: Math.max(0, activeIndex),
      };
    }
    case "load-failure":
      return {
        ...state,
        hydrated: true,
        storageHealthy: false,
        error: action.error,
      };
    case "navigate":
      return {
        ...state,
        screen: action.screen,
        addingTask: false,
        taskDraft: "",
        notice: null,
      };
    case "start-add-task":
      return { ...state, addingTask: true, taskDraft: "", notice: null };
    case "cancel-add-task":
      return { ...state, addingTask: false, taskDraft: "" };
    case "set-task-draft":
      return { ...state, taskDraft: action.value };
    case "add-task": {
      const title = state.taskDraft.trim();
      if (!title) return { ...state, notice: "Enter a task name first." };

      const task: Task = { id: action.id, title, completed: false };
      const data = {
        ...state.data,
        tasks: [...state.data.tasks, task],
        activeTaskId: task.id,
      };
      return {
        ...state,
        data,
        addingTask: false,
        taskDraft: "",
        selectedTaskIndex: currentTasks(state.data).length,
        notice: "Task added and selected.",
      };
    }
    case "select-task-index": {
      const tasks = currentTasks(state.data);
      return {
        ...state,
        selectedTaskIndex: Math.max(0, Math.min(action.index, tasks.length - 1)),
      };
    }
    case "activate-task": {
      const task = state.data.tasks.find(
        (candidate) => candidate.id === action.taskId && !candidate.completed,
      );
      if (!task) return state;
      return {
        ...state,
        data: { ...state.data, activeTaskId: task.id },
        notice: `Selected: ${task.title}`,
      };
    }
    case "complete-selected-task": {
      const task = currentTasks(state.data)[state.selectedTaskIndex];
      if (!task) return state;

      const tasks = state.data.tasks.map((candidate) =>
        candidate.id === task.id ? { ...candidate, completed: true } : candidate,
      );
      const remainingTasks = tasks.filter((candidate) => !candidate.completed);
      return {
        ...state,
        data: {
          ...state.data,
          tasks,
          activeTaskId:
            state.data.activeTaskId === task.id ? null : state.data.activeTaskId,
        },
        selectedTaskIndex: Math.min(
          state.selectedTaskIndex,
          Math.max(0, remainingTasks.length - 1),
        ),
        notice: `Completed: ${task.title}`,
      };
    }
    case "toggle-timer": {
      const startingNewFocus =
        state.data.timer.status !== "running" &&
        state.data.timer.phase === "focus" &&
        state.data.timer.startedAtMs === null;
      return {
        ...state,
        data: {
          ...state.data,
          timer:
            state.data.timer.status === "running"
              ? pauseTimer(state.data.timer, action.nowMs)
              : startTimer(state.data.timer, action.nowMs),
          sessionTaskId: startingNewFocus
            ? state.data.activeTaskId
            : state.data.sessionTaskId,
        },
        notice: null,
      };
    }
    case "skip-interval":
      return {
        ...state,
        data: {
          ...state.data,
          timer: skipInterval(state.data.timer, state.data.settings),
          sessionTaskId: null,
        },
        notice: "Interval skipped.",
      };
    case "reset-interval":
      return {
        ...state,
        data: {
          ...state.data,
          timer: resetInterval(state.data.timer, state.data.settings),
          sessionTaskId: null,
        },
        notice: "Interval reset.",
      };
    case "reset-cycle":
      return {
        ...state,
        data: {
          ...state.data,
          timer: createTimer(state.data.settings),
          sessionTaskId: null,
        },
        notice: "Focus cycle reset.",
      };
    case "complete-interval": {
      const result = completeInterval(
        state.data.timer,
        state.data.settings,
        action.nowMs,
      );
      if (result.timer === state.data.timer) return state;

      const sessions = result.completedFocus
        ? [
            ...state.data.sessions,
            {
              id: action.sessionId,
              startedAtMs: result.completedFocus.startedAtMs,
              endedAtMs: result.completedFocus.endedAtMs,
              durationMs: result.completedFocus.durationMs,
              taskId: state.data.sessionTaskId,
            },
          ]
        : state.data.sessions;
      const nextFocusAutoStarted =
        result.timer.phase === "focus" && result.timer.status === "running";

      return {
        ...state,
        data: {
          ...state.data,
          timer: result.timer,
          sessions,
          sessionTaskId: nextFocusAutoStarted ? state.data.activeTaskId : null,
        },
        notice: result.completedFocus ? "Focus complete · session saved." : "Break complete.",
      };
    }
    case "select-setting":
      return {
        ...state,
        selectedSettingIndex: Math.max(0, Math.min(action.index, 5)),
      };
    case "adjust-setting": {
      const settings = { ...state.data.settings };
      switch (state.selectedSettingIndex) {
        case 0:
          settings.focusMinutes = Math.max(
            1,
            Math.min(180, settings.focusMinutes + action.delta),
          );
          break;
        case 1:
          settings.shortBreakMinutes = Math.max(
            1,
            Math.min(120, settings.shortBreakMinutes + action.delta),
          );
          break;
        case 2:
          settings.longBreakMinutes = Math.max(
            1,
            Math.min(120, settings.longBreakMinutes + action.delta),
          );
          break;
        case 3:
          settings.longBreakEvery = Math.max(
            1,
            Math.min(12, settings.longBreakEvery + action.delta),
          );
          break;
        case 4:
          settings.autoStartNext = !settings.autoStartNext;
          break;
        case 5:
          settings.notificationsEnabled = !settings.notificationsEnabled;
          break;
      }

      return {
        ...state,
        data: {
          ...state.data,
          settings,
          timer: updateReadyInterval(state.data.timer, settings),
        },
      };
    }
    case "toggle-auto-start": {
      const settings = {
        ...state.data.settings,
        autoStartNext: !state.data.settings.autoStartNext,
      };
      return {
        ...state,
        data: {
          ...state.data,
          settings,
          timer: updateReadyInterval(state.data.timer, settings),
        },
      };
    }
    case "toggle-notifications": {
      const settings = {
        ...state.data.settings,
        notificationsEnabled: !state.data.settings.notificationsEnabled,
      };
      return {
        ...state,
        data: {
          ...state.data,
          settings,
          timer: updateReadyInterval(state.data.timer, settings),
        },
      };
    }
    case "save-failure":
      return {
        ...state,
        error: action.error,
        forceQuitOnNextExit: true,
      };
    case "save-success":
      return {
        ...state,
        error: state.storageHealthy ? null : state.error,
        forceQuitOnNextExit: false,
      };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AppProps {
  statePath?: string;
  initialData?: PersistedState;
  persist?: boolean;
}

function App({ statePath = getStatePath(), initialData, persist = true }: AppProps) {
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const [state, dispatch] = useReducer(reducer, initialData, createInitialAppState);
  const [nowMs, setNowMs] = useState(Date.now());
  const stateRef = useRef(state);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const notifiedInterval = useRef<string | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    loadState(statePath).then(
      (data) => {
        if (!cancelled) dispatch({ type: "load-success", data });
      },
      (error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "load-failure", error: errorMessage(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [initialData, statePath]);

  const enqueueSave = useCallback(
    (data: PersistedState, saveAtMs: number): Promise<void> => {
      const snapshot: PersistedState = {
        ...data,
        timer: pauseTimer(data.timer, saveAtMs),
      };
      const nextSave = saveQueue.current
        .catch(() => undefined)
        .then(() => saveStateAtomic(statePath, snapshot, saveAtMs));
      saveQueue.current = nextSave;
      return nextSave;
    },
    [statePath],
  );

  useEffect(() => {
    if (!persist || !state.hydrated || !state.storageHealthy) return;

    void enqueueSave(state.data, Date.now()).then(
      () => dispatch({ type: "save-success" }),
      (error: unknown) =>
        dispatch({
          type: "save-failure",
          error: `Could not save local data: ${errorMessage(error)}`,
        }),
    );
  }, [enqueueSave, persist, state.data, state.hydrated, state.storageHealthy]);

  const livePath = useMemo(() => getLivePath(statePath), [statePath]);

  useEffect(() => {
    if (!persist) return;
    const cleanup = () => clearLive(livePath);
    process.once("exit", cleanup);
    return () => {
      process.off("exit", cleanup);
      cleanup();
    };
  }, [livePath, persist]);

  useEffect(() => {
    if (persist && state.hydrated) writeLive(livePath, state.data.timer);
  }, [livePath, persist, state.data.timer, state.hydrated]);

  const exit = useCallback(async () => {
    const current = stateRef.current;
    if (current.forceQuitOnNextExit) {
      renderer.destroy();
      return;
    }

    if (current.hydrated && current.storageHealthy) {
      try {
        await enqueueSave(current.data, Date.now());
      } catch (error) {
        dispatch({
          type: "save-failure",
          error: `Could not save before quitting: ${errorMessage(error)}. Press Q again to quit without saving.`,
        });
        return;
      }
    }

    renderer.destroy();
  }, [enqueueSave, renderer]);

  // Keeps the header clock ticking even while the timer is idle.
  useEffect(() => {
    const clock = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(clock);
  }, []);

  const timer = state.data.timer;
  const activeTaskId = state.data.activeTaskId;

  useEffect(() => {
    if (
      !state.hydrated ||
      timer.status !== "running" ||
      timer.endsAtMs === null
    ) {
      return;
    }

    const tick = () => {
      const currentTime = Date.now();
      setNowMs(currentTime);
      if (timer.endsAtMs !== null && currentTime >= timer.endsAtMs) {
        const notificationKey = `${timer.phase}:${timer.endsAtMs}`;
        if (notifiedInterval.current !== notificationKey) {
          notifiedInterval.current = notificationKey;
          const message = timer.phase === "focus"
            ? "Focus session complete"
            : "Break is over";
          if (!stateRef.current.data.settings.notificationsEnabled) {
            // Disabled in settings.
          } else if (process.env.HERDR_ENV === "1") {
            // herdr doesn't forward OSC notifications from panes, so use its own API.
            spawn(process.env.HERDR_BIN_PATH || "herdr", ["notification", "show", "Pomodoro", "--body", message], {
              stdio: "ignore",
            }).on("error", () => undefined);
          } else if (renderer.capabilities?.notifications) {
            try {
              renderer.triggerNotification(message, "Pomodoro");
            } catch {
              // Notification support is best-effort; the in-app completion notice remains.
            }
          }
        }
        dispatch({
          type: "complete-interval",
          nowMs: currentTime,
          sessionId: randomUUID(),
        });
      }
    };

    const interval = setInterval(tick, 1_000);
    tick();
    return () => clearInterval(interval);
  }, [renderer, state.hydrated, timer.endsAtMs, timer.phase, timer.status]);

  useKeyboard((key) => {
    if (key.eventType !== "press") return;
    const current = stateRef.current;
    const isEnter = key.name === "enter" || key.name === "return";

    if (key.ctrl && key.name === "c") {
      void exit();
      return;
    }
    if (key.name === "q" && !current.addingTask) {
      void exit();
      return;
    }
    if (key.name === "escape") {
      if (current.addingTask) dispatch({ type: "cancel-add-task" });
      else if (current.screen !== "home") dispatch({ type: "navigate", screen: "home" });
      return;
    }

    if (current.addingTask) {
      return;
    }

    if (current.screen === "home") {
      if (key.name === "space") {
        const currentTime = Date.now();
        setNowMs(currentTime);
        dispatch({ type: "toggle-timer", nowMs: currentTime });
      } else if (key.name === "n") {
        dispatch({ type: "skip-interval" });
      } else if (key.name === "r") {
        dispatch({ type: key.shift ? "reset-cycle" : "reset-interval" });
      } else if (key.name === "t") {
        const tasks = currentTasks(current.data);
        const activeIndex = tasks.findIndex((task) => task.id === current.data.activeTaskId);
        dispatch({ type: "select-task-index", index: Math.max(0, activeIndex) });
        dispatch({ type: "navigate", screen: "tasks" });
      } else if (key.name === "s") {
        dispatch({ type: "navigate", screen: "stats" });
      } else if (key.name === ",") {
        dispatch({ type: "navigate", screen: "settings" });
      }
      return;
    }

    if (current.screen === "tasks") {
      if (key.name === "a") dispatch({ type: "start-add-task" });
      else if (key.name === "c") dispatch({ type: "complete-selected-task" });
      else if (key.name === "up") {
        dispatch({ type: "select-task-index", index: current.selectedTaskIndex - 1 });
      } else if (key.name === "down") {
        dispatch({ type: "select-task-index", index: current.selectedTaskIndex + 1 });
      } else if (isEnter) {
        const selectedTask = currentTasks(current.data)[current.selectedTaskIndex];
        if (selectedTask) {
          dispatch({ type: "activate-task", taskId: selectedTask.id });
        }
      }
      return;
    }

    if (current.screen === "settings") {
      if (key.name === "up") {
        dispatch({ type: "select-setting", index: current.selectedSettingIndex - 1 });
      } else if (key.name === "down") {
        dispatch({ type: "select-setting", index: current.selectedSettingIndex + 1 });
      } else if (key.name === "left") {
        dispatch({ type: "adjust-setting", delta: -1 });
      } else if (key.name === "right") {
        dispatch({ type: "adjust-setting", delta: 1 });
      } else if (key.name === "space") {
        if (current.selectedSettingIndex === 4) {
          dispatch({ type: "toggle-auto-start" });
        } else if (current.selectedSettingIndex === 5) {
          dispatch({ type: "toggle-notifications" });
        }
      }
    }
  });

  const todaySessions = useMemo(() => {
    const today = new Date(nowMs).toDateString();
    return state.data.sessions.filter(
      (session) => new Date(session.endedAtMs).toDateString() === today,
    );
  }, [nowMs, state.data.sessions]);
  const todayFocusMs = todaySessions.reduce(
    (total, session) => total + session.durationMs,
    0,
  );
  const hasStartedFocus = timer.phase === "focus" && timer.startedAtMs !== null;
  const homeTaskId = hasStartedFocus ? state.data.sessionTaskId : activeTaskId;
  const activeTask = state.data.tasks.find((task) => task.id === homeTaskId);

  if (!state.hydrated) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text>Loading Pomodoro…</text>
      </box>
    );
  }

  const errorText =
    state.error && state.screen !== "home"
      ? state.error.length > Math.max(12, width - 4)
        ? `${state.error.slice(0, Math.max(9, width - 7))}…`
        : state.error
      : null;

  return (
    <box width="100%" height="100%" flexDirection="column">
      {errorText && (
        <box paddingX={1} height={1}>
          <text fg="#C87968">{errorText}</text>
        </box>
      )}
      <box flexGrow={1}>
        {state.screen === "home" && (
          <HomeView
            timer={timer}
            nowMs={nowMs}
            settings={state.data.settings}
            activeTask={activeTask}
            todayFocusMs={todayFocusMs}
            todaySessionCount={todaySessions.length}
            notice={state.notice}
            error={state.error}
            width={width}
            height={height}
          />
        )}
        {state.screen === "tasks" && (
          <TasksView
            tasks={state.data.tasks}
            activeTaskId={activeTaskId}
            selectedIndex={state.selectedTaskIndex}
            addingTask={state.addingTask}
            taskDraft={state.taskDraft}
            width={width}
            height={height}
            onTaskDraftChange={(value) => dispatch({ type: "set-task-draft", value })}
            onSubmitTask={() => dispatch({ type: "add-task", id: randomUUID() })}
          />
        )}
        {state.screen === "stats" && (
          <StatsView
            sessions={state.data.sessions}
            tasks={state.data.tasks}
            todayFocusMs={todayFocusMs}
            todaySessionCount={todaySessions.length}
            height={height}
            width={width}
          />
        )}
        {state.screen === "settings" && (
          <SettingsView
            settings={state.data.settings}
            selectedIndex={state.selectedSettingIndex}
            width={width}
          />
        )}
      </box>
    </box>
  );
}

export { App };
