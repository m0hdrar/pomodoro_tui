import { describe, expect, test } from "bun:test";
import {
  completeInterval,
  createTimer,
  formatDuration,
  pauseTimer,
  remainingMs,
  resetInterval,
  skipInterval,
  startTimer,
  type TimerConfig,
} from "./timer";

const config: TimerConfig = {
  focusMinutes: 1,
  shortBreakMinutes: 1,
  longBreakMinutes: 2,
  longBreakEvery: 4,
  autoStartNext: false,
};

function finish(timer: ReturnType<typeof createTimer>, nowMs: number) {
  const running = startTimer(timer, nowMs);
  const endedAt = running.endsAtMs ?? nowMs;
  return completeInterval(running, config, endedAt);
}

describe("timer transitions", () => {
  test("starts ready and measures a running interval from its deadline", () => {
    const ready = createTimer(config);
    expect(ready.status).toBe("ready");
    expect(ready.remainingMs).toBe(60_000);

    const running = startTimer(ready, 10_000);
    expect(running.status).toBe("running");
    expect(remainingMs(running, 25_000)).toBe(45_000);
  });

  test("pause and resume preserve remaining time and the original focus start", () => {
    const running = startTimer(createTimer(config), 10_000);
    const paused = pauseTimer(running, 25_000);

    expect(paused.status).toBe("paused");
    expect(paused.remainingMs).toBe(45_000);
    expect(paused.endsAtMs).toBeNull();

    const resumed = startTimer(paused, 50_000);
    expect(resumed.endsAtMs).toBe(95_000);
    expect(resumed.startedAtMs).toBe(10_000);
  });

  test("reset returns the current phase to its full ready duration without changing cadence", () => {
    const running = startTimer(
      { ...createTimer(config), completedFocusCount: 2 },
      10_000,
    );
    const reset = resetInterval(running, config);

    expect(reset.phase).toBe("focus");
    expect(reset.status).toBe("ready");
    expect(reset.durationMs).toBe(60_000);
    expect(reset.remainingMs).toBe(60_000);
    expect(reset.completedFocusCount).toBe(2);
    expect(reset.endsAtMs).toBeNull();
    expect(reset.startedAtMs).toBeNull();
  });

  test("a completed focus interval records the session and selects a short break", () => {
    const running = startTimer(createTimer(config), 0);
    const result = completeInterval(running, config, 60_000);

    expect(result.completedFocus).toEqual({
      startedAtMs: 0,
      endedAtMs: 60_000,
      durationMs: 60_000,
    });
    expect(result.timer.phase).toBe("short-break");
    expect(result.timer.status).toBe("ready");
    expect(result.timer.completedFocusCount).toBe(1);
  });

  test("selects a long break after four completed focus intervals and resets after it", () => {
    let timer = createTimer(config);
    let nowMs = 0;

    for (let count = 1; count <= 4; count += 1) {
      const focusResult = finish(timer, nowMs);
      nowMs += 60_000;
      expect(focusResult.completedFocus).toBeDefined();
      timer = focusResult.timer;

      if (count < 4) {
        expect(timer.phase).toBe("short-break");
        const breakResult = finish(timer, nowMs);
        nowMs += 60_000;
        timer = breakResult.timer;
      }
    }

    expect(timer.phase).toBe("long-break");
    expect(timer.completedFocusCount).toBe(4);

    const longBreakResult = finish(timer, nowMs);
    expect(longBreakResult.timer.phase).toBe("focus");
    expect(longBreakResult.timer.completedFocusCount).toBe(0);
  });

  test("auto-start begins the next interval immediately after completion", () => {
    const autoConfig = { ...config, autoStartNext: true };
    const running = startTimer(createTimer(autoConfig), 0);
    const result = completeInterval(running, autoConfig, 60_000);

    expect(result.timer.phase).toBe("short-break");
    expect(result.timer.status).toBe("running");
    expect(result.timer.endsAtMs).toBe(120_000);
  });

  test("skip advances without recording or incrementing a skipped focus", () => {
    const focus = { ...createTimer(config), completedFocusCount: 3 };
    const next = skipInterval(focus, config);

    expect(next.phase).toBe("short-break");
    expect(next.completedFocusCount).toBe(3);
    expect(next.status).toBe("ready");
    expect(skipInterval(next, config).phase).toBe("focus");
  });

  test("skipping a long break preserves the completed-focus cadence", () => {
    const longBreak = {
      ...createTimer(config),
      phase: "long-break" as const,
      completedFocusCount: 4,
    };
    const next = skipInterval(longBreak, config);

    expect(next.phase).toBe("focus");
    expect(next.completedFocusCount).toBe(4);
  });

  test("formats time without showing negative values", () => {
    expect(formatDuration(60_000)).toBe("1:00");
    expect(formatDuration(1)).toBe("0:01");
    expect(formatDuration(-1)).toBe("0:00");
  });
});
