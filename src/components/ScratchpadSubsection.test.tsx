import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The stores pull in the IPC layer; jsdom has no Tauri bridge.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));

import type { ScratchpadInfo } from "../ipc/types";
import { useScratchpadStore } from "../state/scratchpadStore";
import { ScratchpadSubsection } from "./ScratchpadSubsection";

const initialScratchpad = useScratchpadStore.getState();

const PROJECT = "proj-1";

function scratchpad(id: string, title: string): ScratchpadInfo {
  return {
    id,
    projectId: PROJECT,
    title,
    content: "",
    archived: false,
    archivedAt: null,
    createdAt: "2024-04-03T12:00:00Z",
    updatedAt: "2024-04-03T12:00:00Z",
    updatedBy: "User",
    version: 1,
    tags: [],
  };
}

/** Seed the scratchpad store with a list and spy-able mutation actions. */
function seed(scratchpads: ScratchpadInfo[]) {
  const refresh = vi.fn(() => Promise.resolve());
  const addScratchpad = vi.fn(() =>
    Promise.resolve(scratchpad("new-1", "Untitled")),
  );
  const setScratchpadArchived = vi.fn(() =>
    Promise.resolve(scratchpad("a", "Scratchpad A")),
  );
  const refreshArchived = vi.fn(() => Promise.resolve());
  useScratchpadStore.setState(
    {
      ...initialScratchpad,
      scratchpadsByProject: { [PROJECT]: scratchpads },
      refresh,
      addScratchpad,
      setScratchpadArchived,
      refreshArchived,
    },
    true,
  );
  return { refresh, addScratchpad, setScratchpadArchived, refreshArchived };
}

describe("ScratchpadSubsection", () => {
  beforeEach(() => {
    useScratchpadStore.setState(initialScratchpad, true);
  });

  it("renders_scratchpad_list_for_project", () => {
    seed([scratchpad("a", "Scratchpad A"), scratchpad("b", "Scratchpad B")]);
    render(
      <ScratchpadSubsection projectId={PROJECT} onOpenScratchpad={vi.fn()} />,
    );

    expect(screen.getByText("Scratchpad A")).toBeInTheDocument();
    expect(screen.getByText("Scratchpad B")).toBeInTheDocument();
  });

  it("clicking_add_creates_scratchpad_and_opens_detail", async () => {
    const { addScratchpad } = seed([]);
    const onOpenScratchpad = vi.fn();
    render(
      <ScratchpadSubsection
        projectId={PROJECT}
        onOpenScratchpad={onOpenScratchpad}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New scratchpad" }));

    expect(addScratchpad).toHaveBeenCalledWith(PROJECT);
    await waitFor(() =>
      expect(onOpenScratchpad).toHaveBeenCalledWith(PROJECT, "new-1"),
    );
  });

  it("opens a scratchpad on row click", () => {
    seed([scratchpad("a", "Scratchpad A")]);
    const onOpenScratchpad = vi.fn();
    render(
      <ScratchpadSubsection
        projectId={PROJECT}
        onOpenScratchpad={onOpenScratchpad}
      />,
    );

    fireEvent.click(screen.getByText("Scratchpad A"));
    expect(onOpenScratchpad).toHaveBeenCalledWith(PROJECT, "a");
  });

  it("shows the empty hint when there are no scratchpads", () => {
    seed([]);
    render(
      <ScratchpadSubsection projectId={PROJECT} onOpenScratchpad={vi.fn()} />,
    );

    expect(screen.getByText("No scratchpads yet.")).toBeInTheDocument();
  });

  it("archives a scratchpad via its row action", () => {
    const { setScratchpadArchived } = seed([scratchpad("a", "Scratchpad A")]);
    render(
      <ScratchpadSubsection projectId={PROJECT} onOpenScratchpad={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Archive scratchpad "Scratchpad A"'));
    expect(setScratchpadArchived).toHaveBeenCalledWith(PROJECT, "a", true);
  });

  it("opens the archive modal from the header button", async () => {
    const { refreshArchived } = seed([scratchpad("a", "Scratchpad A")]);
    render(
      <ScratchpadSubsection projectId={PROJECT} onOpenScratchpad={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("View archived scratchpads"));
    await waitFor(() => expect(refreshArchived).toHaveBeenCalledWith(PROJECT));
    expect(screen.getByText("Archived scratchpads")).toBeInTheDocument();
  });
});
