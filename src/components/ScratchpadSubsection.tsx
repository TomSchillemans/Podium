/**
 * "Scratchpads" subsection for one sidebar project group — freeform notes
 * shared with agents over MCP (title only here; content editing happens in
 * the detail pane). The header "+" immediately creates a new scratchpad
 * (auto-titled) and opens it in the detail pane, since there is no text to
 * capture up front (unlike a to-do). Clicking a row opens that scratchpad; a
 * hover-revealed archive button hides it from this list (see the Archive
 * modal, opened from the header).
 */

import { useEffect, useState } from "react";

import type { ProjectId, ScratchpadId, ScratchpadInfo } from "../ipc/types";
import { useScratchpadStore } from "../state/scratchpadStore";
import { AddIcon, ArchiveIcon, ScratchpadIcon } from "./icons";
import { ScratchpadArchiveModal } from "./ScratchpadArchiveModal";
import sidebarStyles from "./Sidebar.module.css";
import styles from "./TodoSubsection.module.css";

/** Stable empty list so the selector doesn't re-render on every store set. */
const NO_SCRATCHPADS: ScratchpadInfo[] = [];

interface ScratchpadSubsectionProps {
  projectId: ProjectId;
  /** Open the scratchpad detail pane (hosted by the app work area). */
  onOpenScratchpad: (projectId: ProjectId, scratchpadId: ScratchpadId) => void;
}

export function ScratchpadSubsection({
  projectId,
  onOpenScratchpad,
}: ScratchpadSubsectionProps) {
  const scratchpads = useScratchpadStore(
    (s) => s.scratchpadsByProject[projectId] ?? NO_SCRATCHPADS,
  );
  const refresh = useScratchpadStore((s) => s.refresh);
  const addScratchpad = useScratchpadStore((s) => s.addScratchpad);
  const setScratchpadArchived = useScratchpadStore(
    (s) => s.setScratchpadArchived,
  );

  const [archiveOpen, setArchiveOpen] = useState(false);

  // Initial pull; later changes arrive via the `scratchpad:changed` refresh.
  useEffect(() => {
    void refresh(projectId);
  }, [projectId, refresh]);

  const addAndOpen = async () => {
    const info = await addScratchpad(projectId);
    if (info) onOpenScratchpad(projectId, info.id);
  };

  return (
    <div className={sidebarStyles.subsection}>
      <div className={sidebarStyles.sectionHeader}>
        <ScratchpadIcon className={sidebarStyles.panelIcon} />
        <span className={sidebarStyles.panelTitle}>Scratchpads</span>
        <button
          type="button"
          className={sidebarStyles.addBtn}
          aria-label="View archived scratchpads"
          title="Archived scratchpads"
          onClick={() => setArchiveOpen(true)}
        >
          <ArchiveIcon size={13} />
        </button>
        <button
          type="button"
          className={sidebarStyles.addBtn}
          aria-label="New scratchpad"
          title="New scratchpad"
          onClick={() => void addAndOpen()}
        >
          <AddIcon size={13} />
        </button>
      </div>
      {scratchpads.length > 0 ? (
        <div className={styles.rows}>
          {scratchpads.map((sp) => (
            <div key={sp.id} className={styles.row}>
              <div className={styles.rowMain}>
                <button
                  type="button"
                  className={styles.textToggle}
                  title={`Open "${sp.title}"`}
                  onClick={() => onOpenScratchpad(projectId, sp.id)}
                >
                  <span className={styles.text}>{sp.title}</span>
                </button>
                <button
                  type="button"
                  className={styles.action}
                  aria-label={`Archive scratchpad "${sp.title}"`}
                  title="Archive scratchpad"
                  onClick={() =>
                    void setScratchpadArchived(projectId, sp.id, true)
                  }
                >
                  <ArchiveIcon size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={sidebarStyles.placeholder}>No scratchpads yet.</div>
      )}
      <ScratchpadArchiveModal
        open={archiveOpen}
        projectId={projectId}
        onClose={() => setArchiveOpen(false)}
      />
    </div>
  );
}
