if (process.argv[2] === "status") {
  // One status line for status bars; skips loading the UI.
  const { statusLine } = await import("./status");
  console.log(statusLine());
} else {
  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const { App } = await import("./App");

  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(<App />);
}
