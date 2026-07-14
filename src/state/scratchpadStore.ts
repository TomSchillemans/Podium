/**
 * Per-project scratchpad lists, keyed by project id.
 *
 * Mutations apply eagerly from the command's return value; the backend's
 * `scratchpad:changed` event (which also fires when an agent edits
 * scratchpads over MCP) triggers a `refresh` that reconciles.
 */

import { create } from "zustand";

import {
  scratchpadAdd,
  scratchpadList,
  scratchpadUpdateContent,
  scratchpadUpdateTitle,
  toIpcError,
} from "../ipc/commands";
import type { ProjectId, ScratchpadId, ScratchpadInfo } from "../ipc/types";
import { toastError } from "./toastStore";

interface ScratchpadState {
  scratchpadsByProject: Record<ProjectId, ScratchpadInfo[]>;
  /** Re-pull one project's active list (initial load + `scratchpad:changed`). */
  refresh: (projectId: ProjectId) => Promise<void>;
  /** Returns the new scratchpad (or `null` on failure) so callers can open it. */
  addScratchpad: (projectId: ProjectId) => Promise<ScratchpadInfo | null>;
  /** Returns the updated snapshot (or `null` on failure). */
  updateContent: (
    projectId: ProjectId,
    id: ScratchpadId,
    content: string,
  ) => Promise<ScratchpadInfo | null>;
  /** Returns the updated snapshot (or `null` on failure). */
  updateTitle: (
    projectId: ProjectId,
    id: ScratchpadId,
    title: string,
  ) => Promise<ScratchpadInfo | null>;
  /** Event applier for `project:closed` — drops the cached list. */
  dropProject: (projectId: ProjectId) => void;
}

export const useScratchpadStore = create<ScratchpadState>((set) => ({
  scratchpadsByProject: {},

  refresh: async (projectId) => {
    try {
      const scratchpads = await scratchpadList(projectId);
      set((s) => ({
        scratchpadsByProject: {
          ...s.scratchpadsByProject,
          [projectId]: scratchpads,
        },
      }));
    } catch (e) {
      toastError("Failed to list scratchpads", toIpcError(e).message);
    }
  },

  addScratchpad: async (projectId) => {
    try {
      const info = await scratchpadAdd(projectId);
      set((s) => {
        const current = s.scratchpadsByProject[projectId] ?? [];
        if (current.some((sp) => sp.id === info.id)) return s;
        return {
          scratchpadsByProject: {
            ...s.scratchpadsByProject,
            [projectId]: [...current, info],
          },
        };
      });
      return info;
    } catch (e) {
      toastError("Could not add scratchpad", toIpcError(e).message);
      return null;
    }
  },

  updateContent: async (projectId, id, content) => {
    try {
      const info = await scratchpadUpdateContent(projectId, id, content);
      set((s) => ({
        scratchpadsByProject: {
          ...s.scratchpadsByProject,
          [projectId]: (s.scratchpadsByProject[projectId] ?? []).map((sp) =>
            sp.id === id ? info : sp,
          ),
        },
      }));
      return info;
    } catch (e) {
      toastError("Could not update scratchpad", toIpcError(e).message);
      return null;
    }
  },

  updateTitle: async (projectId, id, title) => {
    try {
      const info = await scratchpadUpdateTitle(projectId, id, title);
      set((s) => ({
        scratchpadsByProject: {
          ...s.scratchpadsByProject,
          [projectId]: (s.scratchpadsByProject[projectId] ?? []).map((sp) =>
            sp.id === id ? info : sp,
          ),
        },
      }));
      return info;
    } catch (e) {
      toastError("Could not rename scratchpad", toIpcError(e).message);
      return null;
    }
  },

  dropProject: (projectId) =>
    set((s) => {
      const next = { ...s.scratchpadsByProject };
      delete next[projectId];
      return { scratchpadsByProject: next };
    }),
}));
