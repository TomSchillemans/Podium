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

/** One project offered by the "Nieuw terminal/process starten" sub-list. */
export interface ProjectPickerEntry {
  id: string;
  label: string;
}

export interface CommandPaletteHandlers {
  openSettings: () => void;
  /** Absent in tests that don't exercise the "Nieuwe agent starten" action. */
  onNewAgentProject?: (choice: NewAgentProjectChoice) => void;
  /** Currently open projects — the "Nieuw terminal/process starten" sub-list's
   *  primary source, always shown (even with just one entry). */
  openProjects?: ProjectPickerEntry[];
  /** Shown instead when no project is open, so the user can open one first. */
  workspaceProjects?: ProjectPickerEntry[];
  /** Create+start a terminal in an already-open project. */
  onNewTerminalInProject?: (projectId: string) => void;
  /** Open a not-yet-open (workspace) project, then create+start a terminal in it. */
  onNewTerminalInWorkspaceProject?: (path: string) => void;
}

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "Licht",
  dark: "Donker",
  retro: "Retro",
};

function setTheme(mode: ThemeMode): void {
  useThemeStore.getState().setTheme(mode);
}

// Shared by every "pick a project" sub-list (#13's "Nieuwe agent starten",
// #14's "Nieuw terminal/process starten"): show the primary (open-project)
// entries when there's at least one — even just one — otherwise fall back to
// the workspace entries so the user can open a project first. `primary` and
// `fallback` can carry different shapes (e.g. `ProjectInfo` vs. a recent
// workspace entry), hence the two separate mapping functions.
function projectPickerItems<P, F>(
  primary: P[],
  fallback: F[],
  fromPrimary: (entry: P) => CommandPaletteAction,
  fromFallback: (entry: F) => CommandPaletteAction,
): CommandPaletteAction[] {
  return primary.length > 0
    ? primary.map(fromPrimary)
    : fallback.map(fromFallback);
}

// The project sub-list always shows the open projects (even just one); with
// none open it falls back to the workspace's recent projects so the user can
// open one first.
function newAgentProjectItems(
  onNewAgentProject: CommandPaletteHandlers["onNewAgentProject"],
): CommandPaletteAction[] {
  const { projects, recents } = useProjectStore.getState();
  return projectPickerItems(
    projects,
    recents,
    (p) => ({
      id: `new-agent-project-${p.id}`,
      label: p.name,
      handler: () => onNewAgentProject?.({ projectId: p.id }),
    }),
    (r) => ({
      id: `new-agent-workspace-${r.path}`,
      label: r.name,
      handler: () => onNewAgentProject?.({ path: r.path }),
    }),
  );
}

function newTerminalAction(
  handlers: CommandPaletteHandlers,
): CommandPaletteAction {
  return {
    id: "new-terminal",
    label: "Nieuw terminal/process starten",
    items: projectPickerItems(
      handlers.openProjects ?? [],
      handlers.workspaceProjects ?? [],
      (project) => ({
        id: project.id,
        label: project.label,
        handler: () => handlers.onNewTerminalInProject?.(project.id),
      }),
      (project) => ({
        id: project.id,
        label: project.label,
        handler: () => handlers.onNewTerminalInWorkspaceProject?.(project.id),
      }),
    ),
  };
}

export function createCommandPaletteActions(
  handlers: CommandPaletteHandlers,
): CommandPaletteAction[] {
  return [
    { id: "settings", label: "Instellingen", handler: handlers.openSettings },
    newTerminalAction(handlers),
    {
      id: "open-project",
      label: "Project openen",
      // The sub-list is data-driven (live workspace projects, plus "Add
      // project…"), so `items` here is just the "has a sub-list" marker —
      // CommandPalette.tsx builds the real list from the project store.
      items: [],
    },
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
