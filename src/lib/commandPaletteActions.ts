/** Top-level command palette action registry. */

import type { ProjectId } from "../ipc/types";
import { useProjectStore } from "../state/projectStore";
import { useThemeStore, type ThemeMode } from "../state/themeStore";

export interface CommandPaletteAction {
  id: string;
  label: string;
  /** Absent when the action only opens a sub-list (see `items`). */
  handler?: () => void;
  /** A sub-list shown when this action is selected, instead of running a handler. */
  items?: CommandPaletteAction[];
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

/** A project chosen from the "Nieuwe agent starten" sub-list — already open
 *  (has a `projectId`) or picked from the workspace fallback (a `path` to
 *  open first). */
export type NewAgentProjectChoice = { projectId: ProjectId } | { path: string };

export interface CommandPaletteHandlers {
  openSettings: () => void;
  /** Absent in tests that don't exercise the "Nieuwe agent starten" action. */
  onNewAgentProject?: (choice: NewAgentProjectChoice) => void;
}

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "Licht",
  dark: "Donker",
  retro: "Retro",
};

function setTheme(mode: ThemeMode): void {
  useThemeStore.getState().setTheme(mode);
}

// The project sub-list always shows the open projects (even just one); with
// none open it falls back to the workspace's recent projects so the user can
// open one first.
function newAgentProjectItems(
  onNewAgentProject: CommandPaletteHandlers["onNewAgentProject"],
): CommandPaletteAction[] {
  const { projects, recents } = useProjectStore.getState();
  if (projects.length > 0) {
    return projects.map((p) => ({
      id: `new-agent-project-${p.id}`,
      label: p.name,
      handler: () => onNewAgentProject?.({ projectId: p.id }),
    }));
  }
  return recents.map((r) => ({
    id: `new-agent-workspace-${r.path}`,
    label: r.name,
    handler: () => onNewAgentProject?.({ path: r.path }),
  }));
}

export function createCommandPaletteActions(
  handlers: CommandPaletteHandlers,
): CommandPaletteAction[] {
  return [
    { id: "settings", label: "Instellingen", handler: handlers.openSettings },
    {
      id: "theme",
      label: "Thema wisselen",
      items: (["light", "dark", "retro"] as ThemeMode[]).map((mode) => ({
        id: mode,
        label: THEME_LABELS[mode],
        handler: () => setTheme(mode),
      })),
    },
    {
      id: "new-agent",
      label: "Nieuwe agent starten",
      items: newAgentProjectItems(handlers.onNewAgentProject),
    },
  ];
}
