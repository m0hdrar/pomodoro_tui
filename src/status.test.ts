import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statusLine, writeLive } from "./status";
import { createTimer, pauseTimer, startTimer } from "./timer";

const config = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
};
const directory = mkdtempSync(join(tmpdir(), "pomodoro_tui-status-"));
const path = join(directory, "live.json");

afterEach(() => rmSync(path, { force: true }));

test("status counts down a running timer from its end time", () => {
  writeLive(path, startTimer(createTimer(config), 0));
  expect(statusLine(path, 60_000)).toBe("Focus 24:00");
});

test("status marks a paused timer", () => {
  writeLive(path, pauseTimer(startTimer(createTimer(config), 0), 90_000));
  expect(statusLine(path, 500_000)).toBe("Focus 23:30 (paused)");
});

test("status is empty when the app isn't running", () => {
  expect(statusLine(path)).toBe("");
  writeFileSync(path, JSON.stringify({ pid: 999_999, timer: createTimer(config) }));
  expect(statusLine(path)).toBe("");
});
