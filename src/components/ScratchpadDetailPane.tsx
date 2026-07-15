/**
 * Work-area pane for an opened scratchpad: a header with an inline-editable
 * title and a close button, over a plain content textarea (Tiptap rich text
 * lands in Phase 2) with debounced autosave, and a footer showing when it
 * was last touched. Scratchpads are shared with agents over MCP, so the pane
 * reads the live scratchpad from the store by id and reflects
 * `scratchpad:changed` refreshes while open — external edits are only
 * adopted when there is no unsaved local change pending, so an agent's edit
 * never clobbers text the user is mid-typing.
 */

import { useEffect, useRef, useState } from "react";

import type { ProjectId, ScratchpadId, ScratchpadInfo } from "../ipc/types";
import { formatUpdatedAt } from "../lib/dateFormat";
import { useLayoutStore } from "../state/layoutStore";
import { useScratchpadStore } from "../state/scratchpadStore";
import { CloseIcon, ScratchpadIcon } from "./icons";
import styles from "./ScratchpadDetailPane.module.css";

const NO_SCRATCHPADS: ScratchpadInfo[] = [];

/** Autosave debounce: fires this long after the last keystroke. */
const AUTOSAVE_DELAY_MS = 600;

export function ScratchpadDetailPane({
  projectId,
  scratchpadId,
}: {
  projectId: ProjectId;
  scratchpadId: ScratchpadId;
}) {
  const scratchpad = useScratchpadStore((s) =>
    (s.scratchpadsByProject[projectId] ?? NO_SCRATCHPADS).find(
      (sp) => sp.id === scratchpadId,
    ),
  );
  const updateContent = useScratchpadStore((s) => s.updateContent);
  const updateTitle = useScratchpadStore((s) => s.updateTitle);
  const clearOpenScratchpad = useLayoutStore((s) => s.clearOpenScratchpad);

  const [title, setTitle] = useState(scratchpad?.title ?? "");
  const [content, setContent] = useState(scratchpad?.content ?? "");
  // The last value we know is in sync with the store (either what we last
  // saved, or the last value pulled in from it) — comparing against this
  // (rather than the live state) is what lets an external refresh update the
  // field without a dependency cycle back through the state it's comparing.
  const savedTitleRef = useRef(scratchpad?.title ?? "");
  const savedContentRef = useRef(scratchpad?.content ?? "");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest content the textarea holds, kept in a ref (not just closed
  // over by the debounce timer) so the unmount flush below can always save
  // the current value instead of a stale one from an earlier render.
  const latestContentRef = useRef(scratchpad?.content ?? "");
  const projectIdRef = useRef(projectId);
  const scratchpadIdRef = useRef(scratchpadId);
  // Whether the scratchpad still exists in the store, tracked in a ref (not
  // just the closed-over `scratchpad` variable) so the unmount flush below
  // sees the latest answer even though its effect only runs once.
  const existsRef = useRef(scratchpad !== undefined);
  projectIdRef.current = projectId;
  scratchpadIdRef.current = scratchpadId;
  existsRef.current = scratchpad !== undefined;

  // Adopt an external title change (e.g. an agent rename) only when the
  // field has no unsaved local edit pending.
  useEffect(() => {
    if (scratchpad === undefined) return;
    if (scratchpad.title === savedTitleRef.current) return;
    setTitle((current) =>
      current === savedTitleRef.current ? scratchpad.title : current,
    );
    savedTitleRef.current = scratchpad.title;
  }, [scratchpad]);

  // Same for content — an agent's edit is adopted only while the user isn't
  // mid-typing an unsaved change; otherwise it arrives on the next autosave.
  useEffect(() => {
    if (scratchpad === undefined) return;
    if (scratchpad.content === savedContentRef.current) return;
    setContent((current) =>
      current === savedContentRef.current ? scratchpad.content : current,
    );
    savedContentRef.current = scratchpad.content;
  }, [scratchpad]);

  // The open scratchpad vanished (removed here or by an agent): close the pane.
  useEffect(() => {
    if (scratchpad === undefined) clearOpenScratchpad();
  }, [scratchpad, clearOpenScratchpad]);

  // Flush a pending debounced autosave on unmount (closing the pane, or
  // switching to another pane/process) instead of just cancelling it — the
  // debounce timer resets on every keystroke, so a user who types
  // continuously and then immediately closes the pane would otherwise lose
  // the entire unsaved edit. Uses refs (not the closed-over `content`/props)
  // so it always saves the latest value even though this effect only runs
  // once. Skipped if the scratchpad was removed out from under us (e.g. the
  // project closed) — saving would just fail with "not found"; a pending
  // edit is lost in that case (known Phase 1 limitation).
  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      if (!existsRef.current) return;
      void updateContent(
        projectIdRef.current,
        scratchpadIdRef.current,
        latestContentRef.current,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (scratchpad === undefined) return null;

  const handleContentChange = (value: string) => {
    setContent(value);
    latestContentRef.current = value;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      savedContentRef.current = value;
      void updateContent(projectId, scratchpadId, value).then((info) => {
        if (info) savedContentRef.current = info.content;
      });
    }, AUTOSAVE_DELAY_MS);
  };

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed === scratchpad.title) return;
    savedTitleRef.current = trimmed;
    void updateTitle(projectId, scratchpadId, trimmed).then((info) => {
      if (info) {
        savedTitleRef.current = info.title;
        setTitle(info.title);
      }
    });
  };

  return (
    <div className={styles.pane}>
      <header className={styles.header}>
        <ScratchpadIcon className={styles.kindIcon} />
        <input
          className={styles.titleInput}
          value={title}
          aria-label="Scratchpad title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
          }}
        />
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close scratchpad"
          title="Close"
          onClick={clearOpenScratchpad}
        >
          <CloseIcon />
        </button>
      </header>

      <div className={styles.body}>
        <textarea
          className={styles.content}
          value={content}
          aria-label="Scratchpad content"
          placeholder="Click to type. Notes, research, or handoff details. Markdown supported."
          onChange={(e) => handleContentChange(e.target.value)}
        />
      </div>

      <footer className={styles.footer}>
        Updated {formatUpdatedAt(scratchpad.updatedAt)} · by{" "}
        {scratchpad.updatedBy} · V{scratchpad.version}
      </footer>
    </div>
  );
}
