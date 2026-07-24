import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The project store pulls in the IPC layer; jsdom has no Tauri bridge.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));

import type { ProjectInfo } from "../ipc/types";
import { createCommandPaletteActions } from "../lib/commandPaletteActions";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
import { useProjectStore } from "../state/projectStore";
import { useThemeStore } from "../state/themeStore";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a dialog with a search input when open=true", () => {
    render(<CommandPalette open onClose={() => undefined} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a command…")).toHaveFocus();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});

describe("CommandPalette — actions", () => {
  function renderWithSettingsAction() {
    const openSettings = vi.fn();
    const actions = createCommandPaletteActions({ openSettings });
    render(<CommandPalette open onClose={() => undefined} actions={actions} />);
    return { openSettings };
  }

  it('typing "inst" keeps the Instellingen action visible', () => {
    renderWithSettingsAction();

    fireEvent.change(screen.getByPlaceholderText("Type a command…"), {
      target: { value: "inst" },
    });

    expect(screen.getByText("Instellingen")).toBeInTheDocument();
  });

  it('typing "xyz" filters it out', () => {
    renderWithSettingsAction();

    fireEvent.change(screen.getByPlaceholderText("Type a command…"), {
      target: { value: "xyz" },
    });

    expect(screen.queryByText("Instellingen")).not.toBeInTheDocument();
  });

  it("selecting an action runs its handler and calls onClose", () => {
    const onClose = vi.fn();
    const handler = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        actions={[{ id: "settings", label: "Instellingen", handler }]}
      />,
    );

    fireEvent.click(screen.getByText("Instellingen"));

    expect(handler).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CommandPalette — history", () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandPaletteHistoryStore.setState({ entries: [] }, false);
  });

  it('executing "Instellingen" records it in the history store', () => {
    const openSettings = vi.fn();
    const actions = createCommandPaletteActions({ openSettings });
    render(<CommandPalette open onClose={() => undefined} actions={actions} />);

    fireEvent.click(screen.getByText("Instellingen"));

    expect(useCommandPaletteHistoryStore.getState().entries).toEqual([
      { actionId: "settings" },
    ]);
  });

  it("with an empty query, the most recently used action appears first in the list", () => {
    useCommandPaletteHistoryStore.getState().recordUsed("b");
    const actions = [
      { id: "a", label: "Alpha", handler: () => undefined },
      { id: "b", label: "Beta", handler: () => undefined },
    ];

    render(<CommandPalette open onClose={() => undefined} actions={actions} />);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Beta");
    expect(options[1]).toHaveTextContent("Alpha");
  });

  it("a history entry referencing a since-removed action id is silently skipped when rendering", () => {
    useCommandPaletteHistoryStore.getState().recordUsed("ghost");
    const actions = [
      { id: "a", label: "Alpha", handler: () => undefined },
      { id: "b", label: "Beta", handler: () => undefined },
    ];

    render(<CommandPalette open onClose={() => undefined} actions={actions} />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Alpha");
    expect(options[1]).toHaveTextContent("Beta");
  });
});

describe("CommandPalette — new terminal project sub-list", () => {
  it('selecting "Nieuw terminal/process starten" with 1 open project still shows a project sub-list', () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [{ id: "p1", label: "Project One" }],
    });
    render(<CommandPalette open onClose={() => undefined} actions={actions} />);

    fireEvent.click(screen.getByText("Nieuw terminal/process starten"));

    expect(screen.getByText("Project One")).toBeInTheDocument();
  });

  it("with no open project, the sub-list shows workspace projects instead", () => {
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      openProjects: [],
      workspaceProjects: [{ id: "/tmp/proj", label: "Proj" }],
    });
    render(<CommandPalette open onClose={() => undefined} actions={actions} />);

    fireEvent.click(screen.getByText("Nieuw terminal/process starten"));

    expect(screen.getByText("Proj")).toBeInTheDocument();
  });
});

describe("CommandPalette — nested pages", () => {
  function parentAction() {
    return {
      id: "parent",
      label: "Open sub-list",
      items: [
        { id: "child-a", label: "Child A", handler: vi.fn() },
        { id: "child-b", label: "Child B", handler: vi.fn() },
      ],
    };
  }

  it("selecting an action with a sub-list pushes a page and shows the sub-list items", () => {
    render(<CommandPalette open onClose={() => undefined} actions={[parentAction()]} />);

    fireEvent.click(screen.getByText("Open sub-list"));

    expect(screen.getByText("Child A")).toBeInTheDocument();
    expect(screen.getByText("Child B")).toBeInTheDocument();
    expect(screen.queryByText("Open sub-list")).not.toBeInTheDocument();
  });

  it("Escape inside a sub-list pops back to the previous page (root), palette stays open", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} actions={[parentAction()]} />,
    );
    fireEvent.click(screen.getByText("Open sub-list"));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByText("Open sub-list")).toBeInTheDocument();
    expect(screen.queryByText("Child A")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape on the root page closes the palette", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} actions={[parentAction()]} />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});

describe("CommandPalette — theme preview", () => {
  // Zustand's `set` shallow-merges into a new state object on every update,
  // so a spy installed on `getState().setTheme` gets copied into every
  // later state object too — `vi.restoreAllMocks()` alone can't undo that.
  // Keep the pristine closure around and put it back after each test.
  const realSetTheme = useThemeStore.getState().setTheme;

  afterEach(() => {
    vi.restoreAllMocks();
    useThemeStore.setState({ setTheme: realSetTheme });
    realSetTheme("dark");
  });

  function renderThemeActions() {
    const onClose = vi.fn();
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
    });
    render(<CommandPalette open onClose={onClose} actions={actions} />);
    return { onClose };
  }

  function openThemeSubList() {
    fireEvent.click(screen.getByText("Thema wisselen"));
    fireEvent.keyDown(screen.getByPlaceholderText("Type a command…"), {
      key: "ArrowDown",
    });
  }

  it("highlighting a theme option calls the DOM-only applyTheme preview, not themeStore.setTheme", () => {
    useThemeStore.getState().setTheme("dark");
    renderThemeActions();

    openThemeSubList();

    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "light",
    );
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("pressing Enter on a highlighted theme calls themeStore.setTheme(candidate) exactly once, commits it, and closes the palette", () => {
    useThemeStore.getState().setTheme("dark");
    const setTheme = vi.spyOn(useThemeStore.getState(), "setTheme");
    const { onClose } = renderThemeActions();

    openThemeSubList();
    fireEvent.keyDown(screen.getByPlaceholderText("Type a command…"), {
      key: "Enter",
    });

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("light");
    expect(useThemeStore.getState().mode).toBe("light");
    expect(onClose).toHaveBeenCalled();
  });

  it("pressing Escape without Enter calls applyTheme(original) to restore the DOM, without ever having called themeStore.setTheme", () => {
    useThemeStore.getState().setTheme("dark");
    const setTheme = vi.spyOn(useThemeStore.getState(), "setTheme");
    renderThemeActions();

    openThemeSubList();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(setTheme).not.toHaveBeenCalled();
    expect(screen.getByText("Thema wisselen")).toBeInTheDocument();
  });

  it("dismissing via an overlay mousedown (not Escape) while previewing also reverts the DOM to the original theme, without ever calling themeStore.setTheme", () => {
    useThemeStore.getState().setTheme("dark");
    const setTheme = vi.spyOn(useThemeStore.getState(), "setTheme");
    const onClose = vi.fn();
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
    });
    const { container } = render(
      <CommandPalette open onClose={onClose} actions={actions} />,
    );

    openThemeSubList();
    const overlay = container.querySelector('[role="presentation"]');
    if (!overlay) throw new Error("overlay element not found");
    fireEvent.mouseDown(overlay);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(setTheme).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("committing a theme via Enter clears the preview-revert state first, so it is never undone by the close that follows", () => {
    useThemeStore.getState().setTheme("dark");
    renderThemeActions();

    openThemeSubList();
    fireEvent.keyDown(screen.getByPlaceholderText("Type a command…"), {
      key: "Enter",
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("the palette closing via any other `open` flip (not Escape, not the overlay) also reverts an uncommitted theme preview", () => {
    useThemeStore.getState().setTheme("dark");
    const setTheme = vi.spyOn(useThemeStore.getState(), "setTheme");
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
    });
    const { rerender } = render(
      <CommandPalette open onClose={() => undefined} actions={actions} />,
    );

    openThemeSubList();
    rerender(
      <CommandPalette
        open={false}
        onClose={() => undefined}
        actions={actions}
      />,
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(setTheme).not.toHaveBeenCalled();
  });
});

describe("CommandPalette — new agent project sub-list", () => {
  const initialProjectState = useProjectStore.getState();

  afterEach(() => {
    useProjectStore.setState(initialProjectState, true);
  });

  function project(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
    return {
      id: "proj-1",
      name: "Webshop",
      root: "/fake/webshop",
      iconInitials: "WS",
      configError: null,
      renamed: false,
      ...overrides,
    };
  }

  function renderWithNewAgentAction() {
    const onNewAgentProject = vi.fn();
    const actions = createCommandPaletteActions({
      openSettings: () => undefined,
      onNewAgentProject,
    });
    render(<CommandPalette open onClose={() => undefined} actions={actions} />);
    return { onNewAgentProject };
  }

  it('selecting "Nieuwe agent starten" with 1 open project still shows a project sub-list', () => {
    useProjectStore.setState({ projects: [project()] });
    renderWithNewAgentAction();

    fireEvent.click(screen.getByText("Nieuwe agent starten"));

    expect(screen.getByText("Webshop")).toBeInTheDocument();
  });

  it('selecting "Nieuwe agent starten" with 3 open projects shows all 3 in the sub-list', () => {
    useProjectStore.setState({
      projects: [
        project({ id: "proj-1", name: "Alpha" }),
        project({ id: "proj-2", name: "Beta" }),
        project({ id: "proj-3", name: "Gamma" }),
      ],
    });
    renderWithNewAgentAction();

    fireEvent.click(screen.getByText("Nieuwe agent starten"));

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("with no open project, the sub-list shows workspace projects instead", () => {
    useProjectStore.setState({
      projects: [],
      recents: [{ path: "/fake/archive", name: "Archive", lastOpenedAt: 0 }],
    });
    renderWithNewAgentAction();

    fireEvent.click(screen.getByText("Nieuwe agent starten"));

    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("selecting an open project calls onNewAgentProject with its projectId", () => {
    useProjectStore.setState({ projects: [project()] });
    const { onNewAgentProject } = renderWithNewAgentAction();

    fireEvent.click(screen.getByText("Nieuwe agent starten"));
    fireEvent.click(screen.getByText("Webshop"));

    expect(onNewAgentProject).toHaveBeenCalledExactlyOnceWith({
      projectId: "proj-1",
    });
  });

  it("selecting a workspace (not-yet-open) project calls onNewAgentProject with its path", () => {
    useProjectStore.setState({
      projects: [],
      recents: [{ path: "/fake/archive", name: "Archive", lastOpenedAt: 0 }],
    });
    const { onNewAgentProject } = renderWithNewAgentAction();

    fireEvent.click(screen.getByText("Nieuwe agent starten"));
    fireEvent.click(screen.getByText("Archive"));

    expect(onNewAgentProject).toHaveBeenCalledExactlyOnceWith({
      path: "/fake/archive",
    });
  });
});
