/** The command palette: a searchable list of app-wide actions (Cmd/Ctrl+Shift+P). */

import { Command } from "cmdk";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectInfo } from "../ipc/types";
import type { CommandPaletteAction } from "../lib/commandPaletteActions";
import { orderByHistory } from "../lib/commandPaletteActions";
import { MOTION, usePresence } from "../lib/motion";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
import { useProjectStore } from "../state/projectStore";
import { applyTheme, useThemeStore, type ThemeMode } from "../state/themeStore";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions?: CommandPaletteAction[];
}

/** A pushed sub-list, remembering which action opened it (see `THEME_PAGE_ID`). */
interface Page {
  id: string;
  items: CommandPaletteAction[];
}

// The "Thema wisselen" action's id — the one page that gets a live DOM-only
// theme preview on highlight, committed on Enter and reverted on Escape.
const THEME_PAGE_ID = "theme";

// The "Project openen" action's id — its sub-list isn't the static `items`
// on the action (always `[]`, see `commandPaletteActions.ts`); it's built
// live from the workspace here so it always reflects the current project
// list, plus a trailing "Add project…" item.
const OPEN_PROJECT_PAGE_ID = "open-project";

function buildOpenProjectPage(projects: ProjectInfo[]): CommandPaletteAction[] {
  return [
    ...projects.map((project) => ({
      id: project.id,
      label: project.name,
      handler: () => void useProjectStore.getState().openProject(project.root),
    })),
    {
      id: "add-project",
      label: "Add project…",
      handler: () => void useProjectStore.getState().openProjectDialog(),
    },
  ];
}

export function CommandPalette({
  open,
  onClose,
  actions = [],
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the dialog mounted while it animates closed (see `usePresence`).
  const { mounted, state } = usePresence(open, MOTION.base);
  const history = useCommandPaletteHistoryStore((s) => s.entries);
  const projects = useProjectStore((s) => s.projects);

  // A breadcrumb stack of sub-lists pushed by selecting an action with
  // `items` (cmdk's "pages" pattern); empty means the root list is showing.
  const [pageStack, setPageStack] = useState<Page[]>([]);
  const currentPage = pageStack[pageStack.length - 1];
  // Only the root list is reordered by recency — a pushed sub-list keeps its
  // declared order. The "Project openen" page is the one exception: its
  // items come from live workspace state, not the page's declared `items`.
  const currentActions = currentPage
    ? currentPage.id === OPEN_PROJECT_PAGE_ID
      ? buildOpenProjectPage(projects)
      : currentPage.items
    : orderByHistory(actions, history);

  // The highlighted cmdk item's value, controlled so we get notified of
  // arrow-key/pointer highlight changes (see `onHighlightChange`).
  const [highlighted, setHighlighted] = useState("");
  // The theme active when the "Thema wisselen" sub-list was entered, so
  // leaving without confirming (Escape, or dismissing the palette any other
  // way) can restore it. Non-null exactly while an uncommitted preview is
  // live; `leaveThemePreview` is the single idempotent place that clears it.
  const themeOnEnterRef = useRef<ThemeMode | null>(null);

  // Reverts any live DOM-only theme preview back to the theme active when
  // the "Thema wisselen" sub-list was entered. Idempotent — safe to call
  // from every exit path (Escape, overlay dismiss, future close paths) and
  // a no-op once a commit (Enter) or an earlier call has cleared the ref.
  const leaveThemePreview = useCallback(() => {
    const previous = themeOnEnterRef.current;
    themeOnEnterRef.current = null;
    if (previous !== null) applyTheme(previous);
  }, []);

  // The single path every "close the palette" trigger must go through, so
  // an uncommitted theme preview is never left applied to the DOM.
  const closePalette = useCallback(() => {
    leaveThemePreview();
    onClose();
  }, [leaveThemePreview, onClose]);

  useEffect(() => {
    if (open) return;
    // Backstop for `open` flipping to false through any path other than
    // Escape or the overlay dismiss (both already route through
    // `closePalette`/`leaveThemePreview` themselves) — e.g. a future
    // programmatic close. Idempotent, so this is a no-op in those cases.
    leaveThemePreview();
    setPageStack([]);
  }, [open, leaveThemePreview]);

  useEffect(() => {
    setHighlighted("");
  }, [pageStack]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pageStack.length > 0) {
        leaveThemePreview();
        setPageStack((prev) => prev.slice(0, -1));
      } else {
        closePalette();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePalette, leaveThemePreview, pageStack]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!mounted) return null;

  function runAction(action: CommandPaletteAction) {
    if (action.items) {
      if (action.id === THEME_PAGE_ID) {
        themeOnEnterRef.current = useThemeStore.getState().mode;
      }
      setPageStack((prev) => [...prev, { id: action.id, items: action.items! }]);
      return;
    }
    // Clear first: this is a commit, so the close that follows must never
    // revert the theme it just applied.
    themeOnEnterRef.current = null;
    action.handler?.();
    // Record against the root action's id (recognised by orderByHistory's
    // root-level reorder), not the leaf's own id — a leaf inside a pushed
    // sub-list (a project id, a theme name, ...) never matches a root action.
    if (currentPage) {
      useCommandPaletteHistoryStore.getState().recordUsed(currentPage.id, action.id);
    } else {
      useCommandPaletteHistoryStore.getState().recordUsed(action.id);
    }
    closePalette();
  }

  // Controlled highlight (see cmdk's pages example): lets us preview the
  // "Thema wisselen" sub-list's highlighted theme via the DOM-only
  // `applyTheme`, without ever touching the store.
  function onHighlightChange(value: string) {
    setHighlighted(value);
    if (currentPage?.id !== THEME_PAGE_ID) return;
    const candidate = currentPage.items.find((item) => item.label === value);
    if (candidate) applyTheme(candidate.id as ThemeMode);
  }

  return (
    <div
      className={styles.overlay}
      data-state={state}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        className={styles.card}
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        <Command
          className={styles.command}
          label="Command Palette"
          value={highlighted}
          onValueChange={onHighlightChange}
        >
          <Command.Input
            ref={inputRef}
            className={styles.input}
            placeholder="Type a command…"
          />
          <Command.List className={styles.list}>
            <Command.Empty className={styles.empty}>
              No matching commands.
            </Command.Empty>
            {currentActions.map((action) => (
              <Command.Item
                key={action.id}
                value={action.label}
                className={styles.item}
                onSelect={() => runAction(action)}
              >
                {action.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
