/** Top-level command palette action registry. */

export interface CommandPaletteAction {
  id: string;
  label: string;
  handler: () => void;
}

// Most-recently-used actions first, oldest-to-newest ties broken by the
// caller's original order; a history entry for an action that no longer
// exists (e.g. a removed adapter) is dropped rather than rendered.
export function orderByHistory(
  actions: CommandPaletteAction[],
  history: { actionId: string }[],
): CommandPaletteAction[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const recent: CommandPaletteAction[] = [];
  for (const entry of history) {
    if (seen.has(entry.actionId)) continue;
    const action = byId.get(entry.actionId);
    if (!action) continue;
    recent.push(action);
    seen.add(entry.actionId);
  }
  return [...recent, ...actions.filter((a) => !seen.has(a.id))];
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
