/** The command palette: a searchable list of app-wide actions (Cmd/Ctrl+Shift+P). */

import { Command } from "cmdk";
import { useEffect, useRef } from "react";

import type { CommandPaletteAction } from "../lib/commandPaletteActions";
import { MOTION, usePresence } from "../lib/motion";
import { useCommandPaletteHistoryStore } from "../state/commandPaletteHistoryStore";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions?: CommandPaletteAction[];
}

// Most-recently-used actions first, oldest-to-newest ties broken by the
// caller's original order; a history entry for an action that no longer
// exists (e.g. a removed adapter) is dropped rather than rendered.
function orderByHistory(
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

export function CommandPalette({
  open,
  onClose,
  actions = [],
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the dialog mounted while it animates closed (see `usePresence`).
  const { mounted, state } = usePresence(open, MOTION.base);
  const history = useCommandPaletteHistoryStore((s) => s.entries);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!mounted) return null;

  function runAction(action: CommandPaletteAction) {
    action.handler();
    useCommandPaletteHistoryStore.getState().recordUsed(action.id);
    onClose();
  }

  const orderedActions = orderByHistory(actions, history);

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
            {orderedActions.map((action) => (
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
