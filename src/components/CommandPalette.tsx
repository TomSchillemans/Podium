/** The command palette: a searchable list of app-wide actions (Cmd/Ctrl+Shift+P). */

import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";

import type { CommandPaletteAction } from "../lib/commandPaletteActions";
import { orderByHistory } from "../lib/commandPaletteActions";
import { MOTION, usePresence } from "../lib/motion";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
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

export function CommandPalette({
  open,
  onClose,
  actions = [],
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the dialog mounted while it animates closed (see `usePresence`).
  const { mounted, state } = usePresence(open, MOTION.base);
  const history = useCommandPaletteHistoryStore((s) => s.entries);

  // A breadcrumb stack of sub-lists pushed by selecting an action with
  // `items` (cmdk's "pages" pattern); empty means the root list is showing.
  const [pageStack, setPageStack] = useState<Page[]>([]);
  const currentPage = pageStack[pageStack.length - 1];
  // Only the root list is reordered by recency — a pushed sub-list keeps its
  // declared order.
  const currentActions = currentPage
    ? currentPage.items
    : orderByHistory(actions, history);

  // The highlighted cmdk item's value, controlled so we get notified of
  // arrow-key/pointer highlight changes (see `onHighlightChange`).
  const [highlighted, setHighlighted] = useState("");
  // The theme active when the "Thema wisselen" sub-list was entered, so
  // Escape-without-Enter can restore it.
  const themeOnEnterRef = useRef<ThemeMode | null>(null);

  useEffect(() => {
    if (open) return;
    setPageStack([]);
  }, [open]);

  useEffect(() => {
    setHighlighted("");
  }, [pageStack]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pageStack.length > 0) {
        const top = pageStack[pageStack.length - 1];
        if (top.id === THEME_PAGE_ID && themeOnEnterRef.current) {
          applyTheme(themeOnEnterRef.current);
        }
        setPageStack((prev) => prev.slice(0, -1));
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, pageStack]);

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
    action.handler?.();
    useCommandPaletteHistoryStore.getState().recordUsed(action.id);
    onClose();
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
        if (e.target === e.currentTarget) onClose();
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
