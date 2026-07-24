import { afterEach, describe, expect, it } from "vitest";

import { applyTheme, useThemeStore } from "./themeStore";

describe("applyTheme", () => {
  afterEach(() => {
    applyTheme(useThemeStore.getState().mode);
  });

  it("sets the data-theme attribute without touching the store's mode or localStorage", () => {
    const modeBefore = useThemeStore.getState().mode;
    const storedBefore = localStorage.getItem("podium.theme");

    applyTheme("retro");

    expect(document.documentElement.getAttribute("data-theme")).toBe("retro");
    expect(useThemeStore.getState().mode).toBe(modeBefore);
    expect(localStorage.getItem("podium.theme")).toBe(storedBefore);
  });
});
