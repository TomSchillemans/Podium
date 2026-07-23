import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCommandPaletteActions } from "../lib/commandPaletteActions";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
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
