# Pomodoro

A keyboard-first terminal Pomodoro timer built with Bun and OpenTUI.

## Install

```sh
brew install m0hdrar/tap/pomodoro
pomodoro
```

macOS only (Apple Silicon and Intel).

## Build from source

### Requirements

- Bun 1.3 or newer
- Zig when building OpenTUI's native components from source

### Run

```sh
bun install
bun run start
```

For watch mode during development:

```sh
bun run dev
```

## Controls

### Home

| Key | Action |
| --- | --- |
| `Space` | Start, pause, or resume the current interval |
| `N` | Skip the current interval |
| `R` | Reset the current interval to its full duration, ready to start |
| `T` | Open tasks |
| `S` | Open today's stats and session history |
| `,` | Open settings |
| `Q` or `Ctrl+C` | Save and quit |

### Tasks

| Key | Action |
| --- | --- |
| `↑` / `↓` | Browse open tasks |
| `A` | Add a task |
| `Enter` | Select the highlighted task |
| `C` | Complete the highlighted task |
| `Esc` | Return home |

### Settings

| Key | Action |
| --- | --- |
| `↑` / `↓` | Choose a setting |
| `←` / `→` | Adjust durations/cadence or toggle the selected boolean setting |
| `Space` | Toggle auto-start-next or desktop notifications when selected |
| `Esc` | Return home |

## Defaults and local data

The default rhythm is 25 minutes focus, a 5-minute short break, and a 15-minute long break after four completed focus sessions. Auto-start-next is off by default. A fresh timer waits for `Space`; a running timer is saved paused when you quit cleanly. A focus session stays associated with the task selected when that interval started, even if you change tasks while it runs.

Settings, tasks, and completed focus sessions are stored locally at:

```text
~/Library/Application Support/pomodoro_tui/state.json
```

Existing saved data was migrated to this location during the app rename.

No account, cloud sync, audio, or iOS integrations are included. If the state file is invalid, Pomodoro reports an error and leaves it unchanged. Recovery after a crash or forced kill is not guaranteed in v1.

When a focus or break interval ends naturally, Pomodoro sends a desktop notification through OSC 9/777/99 when the terminal supports it; the in-app completion notice always remains. Use Settings → Desktop notifications to turn external notifications off or on (on by default). In tmux, enable passthrough with `set -g allow-passthrough on`. Set `OPENTUI_NOTIFICATIONS=0` to disable notifications.

## Checks

```sh
bun test
bun run typecheck
```

## Releasing

```sh
scripts/release.sh 0.2.0
```

Builds macOS binaries, publishes a GitHub release, and updates the formula in [m0hdrar/homebrew-tap](https://github.com/m0hdrar/homebrew-tap).

## License

MIT
