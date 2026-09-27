import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act } from "react";
import { setRendererCapabilities } from "@opentui/core/testing";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { defaultState } from "./storage";
import { createTimer, startTimer } from "./timer";

type TestSetup = Awaited<ReturnType<typeof testRender>>;

const setups: TestSetup[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await act(async () => {
    for (const setup of setups.splice(0)) setup.renderer.destroy();
  });
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function renderApp(
  width = 80,
  height = 24,
  initialData = defaultState(),
  readyText = "25:00",
): Promise<TestSetup> {
  const directory = await mkdtemp(join(tmpdir(), "pomodoro_tui-ui-test-"));
  temporaryDirectories.push(directory);
  const setup = await testRender(
    <App
      statePath={join(directory, "state.json")}
      initialData={initialData}
      persist={false}
    />,
    { width, height },
  );
  setups.push(setup);
  await act(async () => {
    await setup.waitForFrame((frame) => frame.includes(readyText));
    await setup.flush();
  });
  return setup;
}

async function press(setup: TestSetup, name: string): Promise<void> {
  await act(async () => {
    switch (name) {
      case "space":
        setup.mockInput.pressKey(" ");
        break;
      case "enter":
        setup.mockInput.pressEnter();
        break;
      case "escape":
        setup.mockInput.pressEscape();
        await new Promise((resolve) => setTimeout(resolve, 40));
        break;
      case "up":
      case "down":
      case "left":
      case "right":
        setup.mockInput.pressArrow(name);
        break;
      default:
        setup.mockInput.pressKey(name);
    }
    await setup.flush();
  });
}

async function typeText(setup: TestSetup, text: string): Promise<void> {
  await act(async () => {
    await setup.mockInput.typeText(text);
    await setup.flush();
  });
}

test("home starts ready and Space starts/pauses the focus timer", async () => {
  const setup = await renderApp();
  expect(setup.captureCharFrame()).toContain("POMODORO");
  expect(setup.captureCharFrame()).toContain("No task selected");

  await press(setup, "space");
  await setup.waitForFrame((frame) => frame.includes("IN PROGRESS"));

  await press(setup, "space");
  await setup.waitForFrame((frame) => frame.includes("PAUSED"));
});

test("R resets an in-progress interval to ready without logging it", async () => {
  const setup = await renderApp();
  await press(setup, "space");
  await setup.waitForFrame((frame) => frame.includes("IN PROGRESS"));

  await press(setup, "r");
  const frame = await setup.waitForFrame((currentFrame) => currentFrame.includes("READY"));

  expect(frame).toContain("25:00");
  expect(frame).toContain("0 of 4 focus sessions");
});

test("keyboard navigation reaches tasks, stats, and settings", async () => {
  const setup = await renderApp();

  await press(setup, "t");
  await setup.waitForFrame((frame) => frame.includes("TASKS"));

  await press(setup, "escape");
  await setup.waitForFrame((frame) => frame.includes("25:00"));

  await press(setup, "s");
  await setup.waitForFrame((frame) => frame.includes("TODAY'S POMODORO"));

  await press(setup, "escape");
  await press(setup, ",");
  await setup.waitForFrame((frame) => frame.includes("SETTINGS"));
});

test("task input adds and selects a task without treating its text as shortcuts", async () => {
  const setup = await renderApp();

  await press(setup, "t");
  await setup.waitForFrame((frame) => frame.includes("TASKS"));
  await press(setup, "a");
  await setup.waitForFrame((frame) => frame.includes("New task"));

  await typeText(setup, "Draft plan");
  await press(setup, "enter");

  await setup.waitForFrame((frame) => frame.includes("Draft plan"));
  await press(setup, "escape");
  await setup.waitForFrame((frame) => frame.includes("Draft plan"));

  await press(setup, "t");
  await press(setup, "c");
  await setup.waitForFrame((frame) => frame.includes("Recently completed"));
  await press(setup, "escape");
  await setup.waitForFrame((frame) => frame.includes("No task selected"));
});

test("settings adjust durations and toggle auto-start-next", async () => {
  const setup = await renderApp();

  await press(setup, ",");
  await press(setup, "right");
  await setup.waitForFrame((frame) => frame.includes("26 min"));

  for (let index = 0; index < 4; index += 1) {
    await press(setup, "down");
  }
  await press(setup, "space");
  await setup.waitForFrame((frame) => frame.includes("Auto-start next  On"));

  await press(setup, "down");
  await press(setup, "space");
  await setup.waitForFrame((frame) => frame.includes("Desktop notifications  Off"));
});

test("a focus session keeps the task selected when it started", async () => {
  const initialData = defaultState();
  const startedAtMs = Date.now() - 60_000;
  initialData.settings.focusMinutes = 1;
  initialData.tasks = [
    { id: "original-task", title: "Original task", completed: false },
    { id: "new-task", title: "New task", completed: false },
  ];
  initialData.activeTaskId = "new-task";
  initialData.sessionTaskId = "original-task";
  initialData.timer = startTimer(createTimer(initialData.settings), startedAtMs);

  const setup = await renderApp(80, 24, initialData, "SHORT BREAK");
  await press(setup, "s");
  const frame = await setup.waitForFrame((currentFrame) =>
    currentFrame.includes("Original task"),
  );

  expect(frame).toContain("Original task");
  expect(frame).not.toContain("New task");
});

test("naturally completed focus intervals send one supported desktop notification", async () => {
  const initialData = defaultState();
  const startedAtMs = Date.now() - 900;
  initialData.settings.focusMinutes = 1;
  initialData.timer = {
    ...startTimer(createTimer(initialData.settings), startedAtMs),
    durationMs: 1_000,
    remainingMs: 100,
    endsAtMs: Date.now() + 100,
  };

  const setup = await renderApp(80, 24, initialData, "FOCUS");
  setRendererCapabilities(setup.renderer, { notifications: true });
  const notifications: string[] = [];
  setup.renderer.triggerNotification = (message, title) => {
    notifications.push(`${title}: ${message}`);
    return true;
  };

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await setup.flush();
  });

  expect(notifications).toEqual(["Pomodoro: Focus session complete"]);
});

test("disabled notifications suppress desktop delivery", async () => {
  const initialData = defaultState();
  initialData.settings.notificationsEnabled = false;
  const startedAtMs = Date.now() - 900;
  initialData.settings.focusMinutes = 1;
  initialData.timer = {
    ...startTimer(createTimer(initialData.settings), startedAtMs),
    durationMs: 1_000,
    remainingMs: 100,
    endsAtMs: Date.now() + 100,
  };

  const setup = await renderApp(80, 24, initialData, "FOCUS");
  setRendererCapabilities(setup.renderer, { notifications: true });
  const notifications: string[] = [];
  setup.renderer.triggerNotification = (message, title) => {
    notifications.push(`${title}: ${message}`);
    return true;
  };

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await setup.flush();
  });

  expect(notifications).toEqual([]);
  expect(setup.captureCharFrame()).toContain("Focus complete");
});

test("home content remains visible in a narrow terminal", async () => {
  const setup = await renderApp(40, 12);
  const frame = setup.captureCharFrame();

  expect(frame).toContain("25:00");
  expect(frame).toContain("[Space]");
  expect(frame).toContain("[R] Reset");
  expect(frame).toContain("[T]");
});

test("notification setting fits in compact settings", async () => {
  const setup = await renderApp(40, 12);
  await press(setup, ",");
  const frame = await setup.waitForFrame((currentFrame) =>
    currentFrame.includes("Desktop notifications"),
  );

  expect(frame).toContain("Desktop notifications");
  expect(frame).toContain("[Space] Toggle");
});
