/** Top-level command palette action registry. */

export interface CommandPaletteAction {
  id: string;
  label: string;
  handler: () => void;
}

export interface CommandPaletteHandlers {
  openSettings: () => void;
}

export function createCommandPaletteActions(
  handlers: CommandPaletteHandlers,
): CommandPaletteAction[] {
  return [
    { id: "settings", label: "Instellingen", handler: handlers.openSettings },
  ];
}
