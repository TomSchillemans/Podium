import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the IPC command layer so the store talks to fixtures, not Tauri.
vi.mock("../ipc/commands", () => ({
  scratchpadList: vi.fn(() => Promise.resolve([])),
  scratchpadAdd: vi.fn(),
  scratchpadUpdateContent: vi.fn(),
  scratchpadUpdateTitle: vi.fn(),
  toIpcError: (e: unknown) => ({
    kind: "io",
    message: e instanceof Error ? e.message : String(e),
  }),
}));

// Swallow toasts (no DOM assertions here).
vi.mock("./toastStore", () => ({ toastError: vi.fn() }));

import type { ScratchpadInfo } from "../ipc/types";
import {
  scratchpadAdd,
  scratchpadList,
  scratchpadUpdateContent,
  scratchpadUpdateTitle,
} from "../ipc/commands";
import { toastError } from "./toastStore";
import { useScratchpadStore } from "./scratchpadStore";

const scratchpadListMock = vi.mocked(scratchpadList);
const scratchpadAddMock = vi.mocked(scratchpadAdd);
const scratchpadUpdateContentMock = vi.mocked(scratchpadUpdateContent);
const scratchpadUpdateTitleMock = vi.mocked(scratchpadUpdateTitle);
const toastErrorMock = vi.mocked(toastError);

/** A fictitious scratchpad snapshot for store fixtures. */
function scratchpad(
  id: string,
  overrides: Partial<ScratchpadInfo> = {},
): ScratchpadInfo {
  return {
    id,
    projectId: "proj-a",
    title: "07-14-09-30 Scratchpad",
    content: "",
    archived: false,
    createdAt: "2026-07-14T09:30:00Z",
    updatedAt: "2026-07-14T09:30:00Z",
    updatedBy: "User",
    version: 1,
    ...overrides,
  };
}

describe("scratchpadStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScratchpadStore.setState({ scratchpadsByProject: {} }, false);
  });

  it("refresh_populates_scratchpads_by_project", async () => {
    scratchpadListMock.mockResolvedValue([scratchpad("sp-1")]);

    await useScratchpadStore.getState().refresh("proj-a");

    expect(scratchpadListMock).toHaveBeenCalledWith("proj-a");
    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toEqual([scratchpad("sp-1")]);
  });

  it("add_scratchpad_eagerly_updates_state", async () => {
    scratchpadAddMock.mockResolvedValue(scratchpad("sp-1"));

    const result = await useScratchpadStore.getState().addScratchpad("proj-a");

    expect(scratchpadAddMock).toHaveBeenCalledWith("proj-a");
    expect(result).toEqual(scratchpad("sp-1"));
    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toEqual([scratchpad("sp-1")]);
  });

  it("update_content_eagerly_updates_state", async () => {
    useScratchpadStore.setState(
      { scratchpadsByProject: { "proj-a": [scratchpad("sp-1")] } },
      false,
    );
    const updated = scratchpad("sp-1", { content: "hello", version: 2 });
    scratchpadUpdateContentMock.mockResolvedValue(updated);

    const result = await useScratchpadStore
      .getState()
      .updateContent("proj-a", "sp-1", "hello");

    expect(scratchpadUpdateContentMock).toHaveBeenCalledWith(
      "proj-a",
      "sp-1",
      "hello",
    );
    expect(result).toEqual(updated);
    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toEqual([updated]);
  });

  it("update_title_eagerly_updates_state", async () => {
    useScratchpadStore.setState(
      { scratchpadsByProject: { "proj-a": [scratchpad("sp-1")] } },
      false,
    );
    const updated = scratchpad("sp-1", { title: "My Notes" });
    scratchpadUpdateTitleMock.mockResolvedValue(updated);

    const result = await useScratchpadStore
      .getState()
      .updateTitle("proj-a", "sp-1", "My Notes");

    expect(scratchpadUpdateTitleMock).toHaveBeenCalledWith(
      "proj-a",
      "sp-1",
      "My Notes",
    );
    expect(result).toEqual(updated);
    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toEqual([updated]);
  });

  it("refresh_handles_command_failure_via_toast_error", async () => {
    scratchpadListMock.mockRejectedValue(new Error("disk full"));

    await useScratchpadStore.getState().refresh("proj-a");

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to list scratchpads",
      "disk full",
    );
    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toBeUndefined();
  });

  it("drop_project_removes_the_projects_cached_list", () => {
    useScratchpadStore.setState(
      { scratchpadsByProject: { "proj-a": [scratchpad("sp-1")] } },
      false,
    );

    useScratchpadStore.getState().dropProject("proj-a");

    expect(
      useScratchpadStore.getState().scratchpadsByProject["proj-a"],
    ).toBeUndefined();
  });
});
