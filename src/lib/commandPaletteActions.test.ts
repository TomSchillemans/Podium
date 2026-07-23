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
