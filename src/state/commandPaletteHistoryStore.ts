/** Command palette usage history: most-recently-used first, persisted to
 *  localStorage so it survives a restart (a pure UI preference, not shared
 *  with MCP agents). */

import { create } from "zustand";

export interface CommandPaletteHistoryEntry {
  actionId: string;
  subChoiceId?: string;
}

const STORAGE_KEY = "podium.commandPaletteHistory";
const MAX_ENTRIES = 20;

function isEntry(value: unknown): value is CommandPaletteHistoryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CommandPaletteHistoryEntry).actionId === "string"
  );
}

function load(): CommandPaletteHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

function save(entries: CommandPaletteHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

interface CommandPaletteHistoryState {
  entries: CommandPaletteHistoryEntry[];
  recordUsed: (actionId: string, subChoiceId?: string) => void;
}

export const useCommandPaletteHistoryStore =
  create<CommandPaletteHistoryState>((set, get) => ({
    entries: load(),
    recordUsed: (actionId, subChoiceId) => {
      const withoutDuplicate = get().entries.filter(
        (e) => !(e.actionId === actionId && e.subChoiceId === subChoiceId),
      );
      const entries = [
        subChoiceId ? { actionId, subChoiceId } : { actionId },
        ...withoutDuplicate,
      ].slice(0, MAX_ENTRIES);
      save(entries);
      set({ entries });
    },
  }));
