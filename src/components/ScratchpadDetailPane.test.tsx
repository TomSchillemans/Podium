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
    createdAt: "2024-04-03T12:00:00Z",
    updatedAt: "2024-04-03T12:00:00Z",
    updatedBy: "User",
    version: 1,
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
  useScratchpadStore.setState(
    {
      ...initialScratchpad,
      scratchpadsByProject: { [PROJECT]: [scratchpad(overrides)] },
      updateContent,
      updateTitle,
    },
    true,
  );
  return { updateContent, updateTitle };
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

    expect(updateTitle).toHaveBeenCalledWith(PROJECT, SCRATCHPAD, "Renamed");
  });
});
