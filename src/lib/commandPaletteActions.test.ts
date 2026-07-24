import { describe, expect, it, vi } from "vitest";

import { createCommandPaletteActions, orderByHistory } from "./commandPaletteActions";

describe("createCommandPaletteActions", () => {
  it('includes a "Instellingen" action', () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
    });

    expect(actions).toContainEqual(
      expect.objectContaining({ id: "settings", label: "Instellingen" }),
    );
  });

  it("wires the Instellingen action's handler to openSettings", () => {
    const openSettings = vi.fn();
    const actions = createCommandPaletteActions({ openSettings });

    const settings = actions.find((a) => a.id === "settings");
    settings?.handler?.();

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('includes a "Thema wisselen" root action with 3 sub-items (Licht/Donker/Retro)', () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
    });

    const theme = actions.find((a) => a.id === "theme");

    expect(theme?.label).toBe("Thema wisselen");
    expect(theme?.items?.map((item) => item.label)).toEqual([
      "Licht",
      "Donker",
      "Retro",
    ]);
  });

  it('includes a "Nieuw terminal/process starten" action whose sub-list is the open projects', () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [
        { id: "p1", label: "Project One" },
        { id: "p2", label: "Project Two" },
      ],
    });

    const newTerminal = actions.find((a) => a.id === "new-terminal");

    expect(newTerminal?.label).toBe("Nieuw terminal/process starten");
    expect(newTerminal?.items?.map((item) => item.label)).toEqual([
      "Project One",
      "Project Two",
    ]);
  });

  it("still shows a project sub-list with only 1 open project", () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [{ id: "p1", label: "Project One" }],
    });

    const newTerminal = actions.find((a) => a.id === "new-terminal");

    expect(newTerminal?.items).toHaveLength(1);
  });

  it("falls back to the workspace projects when no project is open", () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [],
      workspaceProjects: [{ id: "/tmp/proj", label: "Proj" }],
    });

    const newTerminal = actions.find((a) => a.id === "new-terminal");

    expect(newTerminal?.items?.map((item) => item.label)).toEqual(["Proj"]);
  });

  it("selecting an open project calls onNewTerminalInProject with its id", () => {
    const onNewTerminalInProject = vi.fn();
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [{ id: "p1", label: "Project One" }],
      onNewTerminalInProject,
    });

    actions
      .find((a) => a.id === "new-terminal")
      ?.items?.find((item) => item.id === "p1")
      ?.handler?.();

    expect(onNewTerminalInProject).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("selecting a workspace project calls onNewTerminalInWorkspaceProject with its path", () => {
    const onNewTerminalInWorkspaceProject = vi.fn();
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [],
      workspaceProjects: [{ id: "/tmp/proj", label: "Proj" }],
      onNewTerminalInWorkspaceProject,
    });

    actions
      .find((a) => a.id === "new-terminal")
      ?.items?.find((item) => item.id === "/tmp/proj")
      ?.handler?.();

    expect(onNewTerminalInWorkspaceProject).toHaveBeenCalledExactlyOnceWith(
      "/tmp/proj",
    );
  });
});

describe("orderByHistory", () => {
  const a = { id: "a", label: "Alpha", handler: () => undefined };
  const b = { id: "b", label: "Beta", handler: () => undefined };
  const c = { id: "c", label: "Gamma", handler: () => undefined };

  it("puts the most recently used action first", () => {
    const ordered = orderByHistory([a, b, c], [{ actionId: "b" }]);

    expect(ordered.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("orders multiple history entries most-recent-first, then the rest", () => {
    const ordered = orderByHistory(
      [a, b, c],
      [{ actionId: "c" }, { actionId: "a" }],
    );

    expect(ordered.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("skips a history entry whose action no longer exists", () => {
    const ordered = orderByHistory([a, b], [{ actionId: "ghost" }]);

    expect(ordered.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("is a no-op with an empty history", () => {
    const ordered = orderByHistory([a, b, c], []);

    expect(ordered).toEqual([a, b, c]);
  });
});
