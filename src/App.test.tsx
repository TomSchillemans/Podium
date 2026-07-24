import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// App wires up IPC on mount; jsdom has no Tauri bridge, so stub it out.
// `invoke` resolves per-command fixtures (all list commands — including
// `workspace_list` — return arrays) and `listen` resolves a no-op unlisten.
// `project_list` and `recents_list` read from these fixtures so individual
// tests can seed "already open" vs. "not yet open" projects; both default to
// empty (the pre-existing empty-workspace behaviour).
const fixtures = vi.hoisted(() => ({
  projectList: [] as unknown[],
  recentsList: [] as unknown[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "adapters_list":
        return Promise.resolve([
          { id: "claude-code", displayName: "Claude Code", available: true },
        ]);
      case "project_list":
        return Promise.resolve(fixtures.projectList);
      case "recents_list":
        return Promise.resolve(fixtures.recentsList);
      case "project_open": {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        return Promise.resolve({
          id: `opened-${path}`,
          name: "Opened Project",
          root: path,
          iconInitials: "OP",
          configError: null,
          renamed: false,
        });
      }
      default:
        return Promise.resolve([]);
    }
  }),
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

import { useProcessStore } from "./state/processStore";
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

describe("App — command palette new agent dispatch", () => {
  // Stub the store action itself (rather than letting a real spawn
  // succeed): a successful spawn focuses the new process, which would mount
  // a real xterm.js terminal — unsupported in jsdom (no canvas/matchMedia).
  // Same shallow-merge caveat as the theme-preview spies above: a `set()`
  // elsewhere copies whatever `spawnAgent` currently is into the next state
  // object, so this must be restored after every test, not just spied on.
  const realSpawnAgent = useProcessStore.getState().spawnAgent;

  afterEach(() => {
    fixtures.projectList = [];
    fixtures.recentsList = [];
    useProcessStore.setState({ spawnAgent: realSpawnAgent });
  });

  function openNewAgentSubList() {
    fireEvent.keyDown(window, { key: "P", metaKey: true, shiftKey: true });
    fireEvent.click(screen.getByText("Nieuwe agent starten"));
    return within(screen.getByRole("dialog", { name: "Command Palette" }));
  }

  async function submitNewAgentForm(spawnAgent: ReturnType<typeof vi.fn>) {
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "New agent" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start agent" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Start agent" }));

    await waitFor(() => expect(spawnAgent).toHaveBeenCalledOnce());
  }

  it('choosing a project after "Nieuwe agent starten" opens NewAgentModal scoped to that project', async () => {
    fixtures.projectList = [
      {
        id: "proj-1",
        name: "Webshop",
        root: "/fake/webshop",
        iconInitials: "WS",
        configError: null,
        renamed: false,
      },
    ];
    const spawnAgent = vi.fn(() => Promise.resolve(null));
    useProcessStore.setState({ spawnAgent });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Webshop")).toBeInTheDocument(),
    );

    const palette = openNewAgentSubList();
    fireEvent.click(palette.getByText("Webshop"));

    await submitNewAgentForm(spawnAgent);

    expect(spawnAgent).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ adapterId: "claude-code" }),
    );
  });

  it("choosing a project that is not yet open first opens it, then opens NewAgentModal", async () => {
    fixtures.recentsList = [
      { path: "/fake/newproj", name: "New Project", lastOpenedAt: 0 },
    ];
    const spawnAgent = vi.fn(() => Promise.resolve(null));
    useProcessStore.setState({ spawnAgent });

    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByText("No projects yet. Add one to get started."),
      ).toBeInTheDocument(),
    );

    const palette = openNewAgentSubList();
    fireEvent.click(palette.getByText("New Project"));

    await submitNewAgentForm(spawnAgent);

    expect(spawnAgent).toHaveBeenCalledWith(
      "opened-/fake/newproj",
      expect.objectContaining({ adapterId: "claude-code" }),
    );
  });
});
