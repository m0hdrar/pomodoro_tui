import type { Settings } from "../storage";

const ACCENT = "#6F9F78";
const MUTED = "#8A9690";

interface SettingsViewProps {
  settings: Settings;
  selectedIndex: number;
  width: number;
}

const settingNames = [
  "Focus length",
  "Short break",
  "Long break",
  "Long break every",
  "Auto-start next",
  "Desktop notifications",
];

export function SettingsView({
  settings,
  selectedIndex,
  width,
}: SettingsViewProps) {
  const compact = width < 64;
  const values = [
    `${settings.focusMinutes} min`,
    `${settings.shortBreakMinutes} min`,
    `${settings.longBreakMinutes} min`,
    `${settings.longBreakEvery} focus sessions`,
    settings.autoStartNext ? "On" : "Off",
    settings.notificationsEnabled ? "On" : "Off",
  ];

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      gap={compact ? 0 : 1}
      paddingX={width < 64 ? 1 : 2}
      paddingY={compact ? 0 : 1}
    >
      <text fg={ACCENT}>
        <strong>SETTINGS</strong>
      </text>
      {!compact && <text fg={MUTED}>Adjust the work/break rhythm.</text>}
      <box flexDirection="column" gap={compact ? 0 : 1}>
        {settingNames.map((name, index) => (
          <box key={name} flexDirection="row" gap={2}>
            <text fg={index === selectedIndex ? ACCENT : undefined}>
              {index === selectedIndex ? "›" : " "} {name}
            </text>
            <text>
              <strong>{values[index]}</strong>
            </text>
          </box>
        ))}
      </box>
      <box flexGrow={1} />
      {compact ? (
        <>
          <text fg={MUTED}>[↑/↓] Choose · [←/→] Adjust</text>
          <text fg={MUTED}>[Space] Toggle · [Esc] Back</text>
        </>
      ) : (
        <>
          <text fg={MUTED}>[↑/↓] Choose · [←/→] Adjust · [Space] Toggle · [Esc] Back</text>
          <text fg={MUTED}>Focus 1–180 min · Breaks 1–120 min · Cadence 1–12 sessions</text>
        </>
      )}
    </box>
  );
}
