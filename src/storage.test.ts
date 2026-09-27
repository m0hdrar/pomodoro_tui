import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState, loadState, saveStateAtomic } from "./storage";
import { startTimer } from "./timer";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryStatePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pomodoro_tui-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "state.json");
}

describe("local state persistence", () => {
  test("uses defaults when the state file is missing", async () => {
    const state = await loadState(await temporaryStatePath());

    expect(state.schemaVersion).toBe(1);
    expect(state.settings.focusMinutes).toBe(25);
    expect(state.settings.notificationsEnabled).toBe(true);
    expect(state.timer.status).toBe("ready");
    expect(state.tasks).toEqual([]);
  });

  test("round-trips settings, tasks, sessions, and a paused timer", async () => {
    const path = await temporaryStatePath();
    const state = defaultState();
    state.settings.autoStartNext = true;
    state.settings.notificationsEnabled = false;
    state.tasks = [{ id: "task-1", title: "Write proposal", completed: false }];
    state.activeTaskId = "task-1";
    state.sessionTaskId = "task-1";
    state.sessions = [
      {
        id: "session-1",
        startedAtMs: 1_000,
        endedAtMs: 1_060_000,
        durationMs: 1_000_000,
        taskId: "task-1",
      },
    ];
    state.timer = startTimer(state.timer, 10_000);

    await saveStateAtomic(path, state, 310_000);
    const restored = await loadState(path);

    expect(restored.settings.autoStartNext).toBe(true);
    expect(restored.settings.notificationsEnabled).toBe(false);
    expect(restored.tasks[0]?.title).toBe("Write proposal");
    expect(restored.activeTaskId).toBe("task-1");
    expect(restored.sessionTaskId).toBe("task-1");
    expect(restored.sessions).toHaveLength(1);
    expect(restored.timer.status).toBe("paused");
    expect(restored.timer.remainingMs).toBe(1_200_000);
    expect(restored.timer.endsAtMs).toBeNull();
  });

  test("reports malformed JSON without changing the file", async () => {
    const path = await temporaryStatePath();
    const malformed = "{not json";
    await Bun.write(path, malformed);

    await expect(loadState(path)).rejects.toThrow("Invalid JSON");
    expect(await Bun.file(path).text()).toBe(malformed);
  });

  test("treats a missing schema-1 sessionTaskId as null", async () => {
    const path = await temporaryStatePath();
    const legacyState = { ...defaultState() } as unknown as Record<string, unknown>;
    delete legacyState.sessionTaskId;
    const legacySettings = legacyState.settings as Record<string, unknown>;
    delete legacySettings.notificationsEnabled;
    await Bun.write(path, JSON.stringify(legacyState));

    const restored = await loadState(path);
    expect(restored.sessionTaskId).toBeNull();
    expect(restored.settings.notificationsEnabled).toBe(true);
  });

  test("rejects unsupported schema versions without replacing them", async () => {
    const path = await temporaryStatePath();
    const unsupported = JSON.stringify({ schemaVersion: 2 });
    await Bun.write(path, unsupported);

    await expect(loadState(path)).rejects.toThrow("Unsupported Pomodoro state version");
    expect(await Bun.file(path).text()).toBe(unsupported);
  });
});
