import { describe, expect, it, vi } from "vitest";

import { createCommandPaletteActions } from "./commandPaletteActions";

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
    settings?.handler();

    expect(openSettings).toHaveBeenCalledOnce();
  });
});
