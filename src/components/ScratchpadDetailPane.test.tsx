import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The stores pull in the IPC layer; jsdom has no Tauri bridge.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));

import type { ScratchpadInfo } from "../ipc/types";
import { useLayoutStore } from "../state/layoutStore";
import { useScratchpadStore } from "../state/scratchpadStore";
import { ScratchpadDetailPane } from "./ScratchpadDetailPane";

const initialScratchpad = useScratchpadStore.getState();
const initialLayout = useLayoutStore.getState();

const PROJECT = "proj-1";
const SCRATCHPAD = "sp-1";

function scratchpad(overrides: Partial<ScratchpadInfo> = {}): ScratchpadInfo {
  return {
    id: SCRATCHPAD,
    projectId: PROJECT,
    title: "Untitled scratchpad",
    content: "",
    archived: false,
    archivedAt: null,
    createdAt: "2024-04-03T12:00:00Z",
    updatedAt: "2024-04-03T12:00:00Z",
    updatedBy: "User",
    version: 1,
    tags: [],
    ...overrides,
  };
}

/** Seed the scratchpad store with one scratchpad and spy-able actions. */
function seed(overrides: Partial<ScratchpadInfo> = {}) {
  const updateContent = vi.fn((_projectId, _id, content: string) =>
    Promise.resolve(scratchpad({ ...overrides, content, version: 2 })),
  );
  const updateTitle = vi.fn((_projectId, _id, title: string) =>
    Promise.resolve(scratchpad({ ...overrides, title })),
  );
  const addTag = vi.fn((_projectId, _id, tag: string) =>
    Promise.resolve(scratchpad({ ...overrides, tags: [tag] })),
  );
  const removeTag = vi.fn(() =>
    Promise.resolve(scratchpad({ ...overrides, tags: [] })),
  );
  const setScratchpadArchived = vi.fn(() =>
    Promise.resolve(scratchpad({ ...overrides, archived: true })),
  );
  const refresh = vi.fn(() => Promise.resolve());
  useScratchpadStore.setState(
    {
      ...initialScratchpad,
      scratchpadsByProject: { [PROJECT]: [scratchpad(overrides)] },
      updateContent,
      updateTitle,
      addTag,
      removeTag,
      setScratchpadArchived,
      refresh,
    },
    true,
  );
  return {
    updateContent,
    updateTitle,
    addTag,
    removeTag,
    setScratchpadArchived,
    refresh,
  };
}

describe("ScratchpadDetailPane", () => {
  beforeEach(() => {
    useScratchpadStore.setState(initialScratchpad, true);
    useLayoutStore.setState(initialLayout, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("typing_in_textarea_triggers_debounced_autosave", () => {
    vi.useFakeTimers();
    const { updateContent } = seed();
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "Some notes" },
    });

    expect(updateContent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);

    expect(updateContent).toHaveBeenCalledWith(
      PROJECT,
      SCRATCHPAD,
      "Some notes",
      "2024-04-03T12:00:00Z",
    );
  });

  it("flushes a pending debounced save on unmount instead of dropping it", () => {
    vi.useFakeTimers();
    const { updateContent } = seed();
    const { unmount } = render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    // Simulate continuous typing: the debounce timer keeps resetting, so no
    // save has fired yet when the pane closes.
    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "Some notes tha" },
    });
    vi.advanceTimersByTime(200);
    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "Some notes that never paused" },
    });

    expect(updateContent).not.toHaveBeenCalled();

    unmount();

    expect(updateContent).toHaveBeenCalledWith(
      PROJECT,
      SCRATCHPAD,
      "Some notes that never paused",
      "2024-04-03T12:00:00Z",
    );
  });

  it("does not flush on unmount when there is no pending save", () => {
    vi.useFakeTimers();
    const { updateContent } = seed();
    const { unmount } = render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    unmount();

    expect(updateContent).not.toHaveBeenCalled();
  });

  it("does not flush on unmount once the scratchpad has been removed (e.g. project closed)", () => {
    vi.useFakeTimers();
    const { updateContent } = seed();
    const { unmount } = render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    // A pending edit exists...
    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "unsaved edit" },
    });
    expect(updateContent).not.toHaveBeenCalled();

    // ...but the scratchpad vanishes from the store before the pane unmounts
    // (e.g. the project closed): the pending save must not be flushed, since
    // it would just fail with "not found".
    act(() => {
      useScratchpadStore.setState({
        scratchpadsByProject: { [PROJECT]: [] },
      });
    });
    unmount();

    expect(updateContent).not.toHaveBeenCalled();
  });

  it("footer_shows_author_and_version_from_store", () => {
    seed({ updatedBy: "claude-code", version: 3 });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    expect(screen.getByText(/by claude-code/)).toBeInTheDocument();
    expect(screen.getByText(/V3/)).toBeInTheDocument();
  });

  it("renders_placeholder_when_content_empty", () => {
    seed({ content: "" });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    expect(
      screen.getByPlaceholderText(
        "Click to type. Notes, research, or handoff details. Markdown supported.",
      ),
    ).toBeInTheDocument();
  });

  it("auto_closes_when_scratchpad_is_removed_from_store", () => {
    const clearOpenScratchpad = vi.fn();
    useScratchpadStore.setState(
      { ...initialScratchpad, scratchpadsByProject: { [PROJECT]: [] } },
      true,
    );
    useLayoutStore.setState({ clearOpenScratchpad });
    const { container } = render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(clearOpenScratchpad).toHaveBeenCalled();
  });

  it("closes the pane via the close button", () => {
    const clearOpenScratchpad = vi.fn();
    seed();
    useLayoutStore.setState({ clearOpenScratchpad });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.click(screen.getByLabelText("Close scratchpad"));
    expect(clearOpenScratchpad).toHaveBeenCalled();
  });

  it("commits a title change on blur", () => {
    const { updateTitle } = seed();
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    const input = screen.getByLabelText("Scratchpad title");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);

    expect(updateTitle).toHaveBeenCalledWith(
      PROJECT,
      SCRATCHPAD,
      "Renamed",
      "2024-04-03T12:00:00Z",
    );
  });

  it("archives via the archive button", () => {
    const { setScratchpadArchived } = seed();
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.click(screen.getByLabelText("Archive scratchpad"));
    expect(setScratchpadArchived).toHaveBeenCalledWith(
      PROJECT,
      SCRATCHPAD,
      true,
    );
  });

  it("renders existing tags and adds a new one", () => {
    const { addTag } = seed({ tags: ["urgent"] });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    expect(screen.getByText("urgent")).toBeInTheDocument();

    const input = screen.getByLabelText("Add tag");
    fireEvent.change(input, { target: { value: "backend" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(addTag).toHaveBeenCalledWith(PROJECT, SCRATCHPAD, "backend");
  });

  it("blank tag submission is a no-op", () => {
    const { addTag } = seed();
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    const input = screen.getByLabelText("Add tag");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(addTag).not.toHaveBeenCalled();
  });

  it("removes a tag via its chip button", () => {
    const { removeTag } = seed({ tags: ["urgent"] });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.click(screen.getByLabelText("Remove tag urgent"));
    expect(removeTag).toHaveBeenCalledWith(PROJECT, SCRATCHPAD, "urgent");
  });

  it("shows a conflict banner and reload discards the local edit", async () => {
    vi.useFakeTimers();
    const updateContent = vi.fn(() =>
      Promise.resolve({ conflict: true as const }),
    );
    const refresh = vi.fn(() => Promise.resolve());
    seed();
    useScratchpadStore.setState({ updateContent, refresh });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "my stale edit" },
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      // Let the resolved promise's `.then` run under fake timers.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledWith(PROJECT);

    fireEvent.click(screen.getByText("Reload"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      (screen.getByLabelText("Scratchpad content") as HTMLTextAreaElement)
        .value,
    ).toBe("");
  });

  it("force save retries the update with the current updatedAt", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const updateContent = vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ conflict: true as const });
      return Promise.resolve(scratchpad({ content: "my edit", version: 2 }));
    });
    const refresh = vi.fn(() => Promise.resolve());
    seed();
    useScratchpadStore.setState({ updateContent, refresh });
    render(
      <ScratchpadDetailPane projectId={PROJECT} scratchpadId={SCRATCHPAD} />,
    );

    fireEvent.change(screen.getByLabelText("Scratchpad content"), {
      target: { value: "my edit" },
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Force save"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateContent).toHaveBeenLastCalledWith(
      PROJECT,
      SCRATCHPAD,
      "my edit",
      "2024-04-03T12:00:00Z",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
