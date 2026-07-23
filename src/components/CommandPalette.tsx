/** The command palette: a searchable list of app-wide actions (Cmd/Ctrl+Shift+P). */

import { Command } from "cmdk";
import { useEffect, useRef } from "react";

import { MOTION, usePresence } from "../lib/motion";
import styles from "./CommandPalette.module.css";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the dialog mounted while it animates closed (see `usePresence`).
  const { mounted, state } = usePresence(open, MOTION.base);

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
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
