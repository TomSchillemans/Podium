import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCommandPaletteHistoryStore } from "./commandPaletteHistoryStore";

const STORAGE_KEY = "podium.commandPaletteHistory";

describe("commandPaletteHistoryStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandPaletteHistoryStore.setState({ entries: [] }, false);
  });

  it("recordUsed adds a new entry to the front", () => {
    const { recordUsed } = useCommandPaletteHistoryStore.getState();
    recordUsed("settings");
    recordUsed("todos");

    const ids = useCommandPaletteHistoryStore
      .getState()
      .entries.map((e) => e.actionId);
    expect(ids).toEqual(["todos", "settings"]);
  });

  it("recordUsed on an existing (actionId, subChoiceId) pair moves it to the front instead of duplicating", () => {
    const { recordUsed } = useCommandPaletteHistoryStore.getState();
    recordUsed("theme", "dark");
    recordUsed("todos");
    recordUsed("theme", "dark");

    const entries = useCommandPaletteHistoryStore.getState().entries;
    expect(entries).toEqual([
      { actionId: "theme", subChoiceId: "dark" },
      { actionId: "todos" },
    ]);
  });

  it("history is capped at 20 entries, oldest evicted first", () => {
    const { recordUsed } = useCommandPaletteHistoryStore.getState();
    for (let i = 0; i < 25; i++) recordUsed(`action-${i}`);

    const entries = useCommandPaletteHistoryStore.getState().entries;
    expect(entries).toHaveLength(20);
    expect(entries[0].actionId).toBe("action-24");
    expect(entries[entries.length - 1].actionId).toBe("action-5");
  });

  it('persists to localStorage under "podium.commandPaletteHistory" and reloads on next store creation', async () => {
    useCommandPaletteHistoryStore.getState().recordUsed("settings");

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual([{ actionId: "settings" }]);

    vi.resetModules();
    const reloaded = await import("./commandPaletteHistoryStore");

    expect(reloaded.useCommandPaletteHistoryStore.getState().entries).toEqual(
      [{ actionId: "settings" }],
    );
  });

  it("corrupt/missing localStorage value falls back to an empty history", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    vi.resetModules();
    const reloaded = await import("./commandPaletteHistoryStore");

    expect(reloaded.useCommandPaletteHistoryStore.getState().entries).toEqual(
      [],
    );

    localStorage.removeItem(STORAGE_KEY);
    vi.resetModules();
    const reloadedMissing = await import("./commandPaletteHistoryStore");

    expect(
      reloadedMissing.useCommandPaletteHistoryStore.getState().entries,
    ).toEqual([]);
  });
});
