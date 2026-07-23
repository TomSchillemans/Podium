/** The command palette: a searchable list of app-wide actions (Cmd/Ctrl+Shift+P). */

import { Command } from "cmdk";
import { useEffect, useRef, useState } from "react";

import type { CommandPaletteAction } from "../lib/commandPaletteActions";
import { orderByHistory } from "../lib/commandPaletteActions";
import { MOTION, usePresence } from "../lib/motion";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions?: CommandPaletteAction[];
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

  // A breadcrumb stack of sub-lists pushed by selecting an action with
  // `items` (cmdk's "pages" pattern); empty means the root list is showing.
  const [pageStack, setPageStack] = useState<CommandPaletteAction[][]>([]);
  // Only the root list is reordered by recency — a pushed sub-list keeps its
  // declared order.
  const currentActions =
    pageStack.length > 0
      ? pageStack[pageStack.length - 1]
      : orderByHistory(actions, history);

  useEffect(() => {
    if (open) return;
    setPageStack([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pageStack.length > 0) {
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
      setPageStack((prev) => [...prev, action.items!]);
      return;
    }
    action.handler?.();
    useCommandPaletteHistoryStore.getState().recordUsed(action.id);
    onClose();
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
        <Command className={styles.command} label="Command Palette">
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
