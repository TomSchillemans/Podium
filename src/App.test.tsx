import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// App wires up IPC on mount; jsdom has no Tauri bridge, so stub it out.
// `invoke` resolves per-command fixtures (all list commands — including
// `workspace_list` — return arrays) and `listen` resolves a no-op unlisten.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) =>
    Promise.resolve(
      cmd === "adapters_list"
        ? [{ id: "claude-code", displayName: "Claude Code", available: true }]
        : [],
    ),
  ),
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));

import App from "./App";

describe("App", () => {
  it("renders the shell with the brand and the empty sidebar state", () => {
    render(<App />);

    expect(screen.getByText("Podium")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Podium")).toBeInTheDocument();
    expect(
      screen.getByText("No projects yet. Add one to get started."),
    ).toBeInTheDocument();
  });

  it("shows the add-project affordances while the workspace is empty", () => {
    render(<App />);

    expect(screen.getByText("Add Project…")).toBeInTheDocument();
    expect(screen.getByText("Add project…")).toBeInTheDocument();
  });
});

describe("App — command palette shortcut", () => {
  it("Cmd/Ctrl+Shift+P opens the command palette", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "P", metaKey: true, shiftKey: true });

    expect(
      screen.getByRole("dialog", { name: "Command Palette" }),
    ).toBeInTheDocument();
  });

  it("does nothing when focus is inside a .xterm element", () => {
    render(<App />);
    const xtermHost = document.createElement("div");
    xtermHost.className = "xterm";
    const focusTarget = document.createElement("textarea");
    xtermHost.appendChild(focusTarget);
    document.body.appendChild(xtermHost);
    focusTarget.focus();

    fireEvent.keyDown(window, { key: "P", metaKey: true, shiftKey: true });

    expect(
      screen.queryByRole("dialog", { name: "Command Palette" }),
    ).not.toBeInTheDocument();

    document.body.removeChild(xtermHost);
  });

  it("Escape while open closes the palette without reopening Settings", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "P", metaKey: true, shiftKey: true });
    expect(
      screen.getByRole("dialog", { name: "Command Palette" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Command Palette" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("selecting Instellingen in the palette opens SettingsModal and closes the palette", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "P", metaKey: true, shiftKey: true });

    fireEvent.click(screen.getByText("Instellingen"));

    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Command Palette" }),
      ).not.toBeInTheDocument(),
    );
  });
});
