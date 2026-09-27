import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createTimer, pauseTimer, type TimerConfig, type TimerSnapshot } from "./timer";

export interface Settings extends TimerConfig {
  notificationsEnabled: boolean;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export interface FocusSession {
  id: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  taskId: string | null;
}

export interface PersistedState {
  schemaVersion: 1;
  settings: Settings;
  tasks: Task[];
  activeTaskId: string | null;
  sessionTaskId: string | null;
  sessions: FocusSession[];
  timer: TimerSnapshot;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
  notificationsEnabled: true,
};

export function getStatePath(): string {
  return join(homedir(), "Library", "Application Support", "pomodoro_tui", "state.json");
}

export function defaultState(): PersistedState {
  const settings = { ...DEFAULT_SETTINGS };

  return {
    schemaVersion: 1,
    settings,
    tasks: [],
    activeTaskId: null,
    sessionTaskId: null,
    sessions: [],
    timer: createTimer(settings),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) return false;
  const notificationsEnabled =
    value.notificationsEnabled === undefined ? true : value.notificationsEnabled;

  return (
    Number.isInteger(value.focusMinutes) &&
    Number(value.focusMinutes) >= 1 &&
    Number(value.focusMinutes) <= 180 &&
    Number.isInteger(value.shortBreakMinutes) &&
    Number(value.shortBreakMinutes) >= 1 &&
    Number(value.shortBreakMinutes) <= 120 &&
    Number.isInteger(value.longBreakMinutes) &&
    Number(value.longBreakMinutes) >= 1 &&
    Number(value.longBreakMinutes) <= 120 &&
    Number.isInteger(value.longBreakEvery) &&
    Number(value.longBreakEvery) >= 1 &&
    Number(value.longBreakEvery) <= 12 &&
    typeof value.autoStartNext === "boolean" &&
    typeof notificationsEnabled === "boolean"
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    value.title.length <= 80 &&
    typeof value.completed === "boolean"
  );
}

function isFocusSession(value: unknown): value is FocusSession {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isFiniteNumber(value.startedAtMs) &&
    isFiniteNumber(value.endedAtMs) &&
    value.endedAtMs >= value.startedAtMs &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs > 0 &&
    (value.taskId === null || typeof value.taskId === "string")
  );
}

function isTimerSnapshot(value: unknown): value is TimerSnapshot {
  if (!isRecord(value)) return false;

  const validPhase =
    value.phase === "focus" ||
    value.phase === "short-break" ||
    value.phase === "long-break";
  const validStatus = value.status === "ready" || value.status === "paused";

  return (
    validPhase &&
    validStatus &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs > 0 &&
    isFiniteNumber(value.remainingMs) &&
    value.remainingMs >= 0 &&
    value.remainingMs <= value.durationMs &&
    value.endsAtMs === null &&
    (value.startedAtMs === null || isFiniteNumber(value.startedAtMs)) &&
    Number.isInteger(value.completedFocusCount) &&
    Number(value.completedFocusCount) >= 0
  );
}

function parseState(value: unknown, path: string): PersistedState {
  if (!isRecord(value)) {
    throw new Error(`Invalid Pomodoro state at ${path}: expected a JSON object.`);
  }
  if (value.schemaVersion !== 1) {
    throw new Error(`Unsupported Pomodoro state version at ${path}.`);
  }
  if (!isSettings(value.settings)) {
    throw new Error(`Invalid settings in Pomodoro state at ${path}.`);
  }
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) {
    throw new Error(`Invalid tasks in Pomodoro state at ${path}.`);
  }
  if (
    value.activeTaskId !== null &&
    (typeof value.activeTaskId !== "string" ||
      !value.tasks.some((task) => task.id === value.activeTaskId && !task.completed))
  ) {
    throw new Error(`Invalid active task in Pomodoro state at ${path}.`);
  }
  const sessionTaskId = value.sessionTaskId === undefined ? null : value.sessionTaskId;
  if (
    sessionTaskId !== null &&
    (typeof sessionTaskId !== "string" ||
      !value.tasks.some((task) => task.id === sessionTaskId))
  ) {
    throw new Error(`Invalid focus task in Pomodoro state at ${path}.`);
  }
  if (!Array.isArray(value.sessions) || !value.sessions.every(isFocusSession)) {
    throw new Error(`Invalid session history in Pomodoro state at ${path}.`);
  }
  if (!isTimerSnapshot(value.timer)) {
    throw new Error(`Invalid paused timer in Pomodoro state at ${path}.`);
  }

  const rawSettings = value.settings as unknown as Record<string, unknown>;
  const settings = {
    ...rawSettings,
    notificationsEnabled:
      rawSettings.notificationsEnabled === undefined
        ? true
        : rawSettings.notificationsEnabled,
  } as Settings;

  return { ...value, settings, sessionTaskId } as unknown as PersistedState;
}

async function readStateFile(path: string): Promise<PersistedState | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read Pomodoro state at ${path}: ${message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in Pomodoro state at ${path}; the file was left unchanged.`);
  }

  return parseState(value, path);
}

export async function loadState(path = getStatePath()): Promise<PersistedState> {
  return (await readStateFile(path)) ?? defaultState();
}

export async function saveStateAtomic(
  path: string,
  state: PersistedState,
  nowMs = Date.now(),
): Promise<void> {
  const stateToSave: PersistedState = {
    ...state,
    sessionTaskId: state.sessionTaskId ?? null,
    timer: pauseTimer(state.timer, nowMs),
  };
  parseState(stateToSave, path);

  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await mkdir(directory, { recursive: true });
    await Bun.write(temporaryPath, `${JSON.stringify(stateToSave, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not save Pomodoro state at ${path}: ${message}`);
  }
}
