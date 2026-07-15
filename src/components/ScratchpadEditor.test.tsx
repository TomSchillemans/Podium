import type { Editor } from "@tiptap/react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SCRATCHPAD_PLACEHOLDER, ScratchpadEditor } from "./ScratchpadEditor";

/**
 * Drives the real Tiptap/ProseMirror editor in jsdom. jsdom has no layout
 * engine, so `src/test/setup.ts` shims `Range.prototype.getClientRects`/
 * `getBoundingClientRect` — without it, `focus()`/`scrollIntoView()` throw
 * from inside prosemirror-view's `coordsAtPos`.
 */

function waitForEditor(onEditorReady: ReturnType<typeof vi.fn>) {
  return waitFor(() => {
    const editor = latestEditor(onEditorReady);
    expect(editor).not.toBeNull();
    return editor as Editor;
  });
}

function latestEditor(onEditorReady: ReturnType<typeof vi.fn>): Editor | null {
  const calls = onEditorReady.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const [editor] = calls[i] as [Editor | null];
    if (editor) return editor;
  }
  return null;
}

describe("ScratchpadEditor", () => {
  it("renders the placeholder when content is empty", async () => {
    const onEditorReady = vi.fn();
    const { container } = render(
      <ScratchpadEditor
        content=""
        onChange={vi.fn()}
        onEditorReady={onEditorReady}
      />,
    );

    await waitForEditor(onEditorReady);

    const empty = container.querySelector("[data-placeholder]");
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute("data-placeholder")).toBe(
      SCRATCHPAD_PLACEHOLDER,
    );
  });

  it("initializes from a markdown content prop", async () => {
    const onEditorReady = vi.fn();
    render(
      <ScratchpadEditor
        content="# Heading\n\nSome **bold** text"
        onChange={vi.fn()}
        onEditorReady={onEditorReady}
      />,
    );

    const editor = await waitForEditor(onEditorReady);
    expect(editor.getText()).toContain("Some bold text");
  });

  it("emits markdown on change", async () => {
    const onChange = vi.fn();
    const onEditorReady = vi.fn();
    render(
      <ScratchpadEditor
        content=""
        onChange={onChange}
        onEditorReady={onEditorReady}
      />,
    );
    const editor = await waitForEditor(onEditorReady);

    act(() => {
      editor.chain().focus().insertContent("Hello world").run();
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining("Hello world"),
      );
    });
  });

  it("adopts an external content change without emitting an update", async () => {
    const onChange = vi.fn();
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <ScratchpadEditor
        content="Original"
        onChange={onChange}
        onEditorReady={onEditorReady}
      />,
    );
    const editor = await waitForEditor(onEditorReady);
    expect(editor.getText()).toBe("Original");

    rerender(
      <ScratchpadEditor
        content="Updated externally"
        onChange={onChange}
        onEditorReady={onEditorReady}
      />,
    );

    await waitFor(() => {
      expect(editor.getText()).toBe("Updated externally");
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reset content or emit when re-rendered with equivalent markdown", async () => {
    const onChange = vi.fn();
    const onEditorReady = vi.fn();
    const { rerender } = render(
      <ScratchpadEditor
        content="Same content"
        onChange={onChange}
        onEditorReady={onEditorReady}
      />,
    );
    const editor = await waitForEditor(onEditorReady);
    const setContentSpy = vi.spyOn(editor.commands, "setContent");

    rerender(
      <ScratchpadEditor
        content="Same content"
        onChange={onChange}
        onEditorReady={onEditorReady}
      />,
    );

    expect(setContentSpy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  describe("markdown round-trip", () => {
    async function roundTrip(markdown: string) {
      const onEditorReady = vi.fn();
      render(
        <ScratchpadEditor
          content={markdown}
          onChange={vi.fn()}
          onEditorReady={onEditorReady}
        />,
      );
      const editor = await waitForEditor(onEditorReady);
      return editor.storage.markdown.getMarkdown();
    }

    it("round-trips bold, italic, and strikethrough", async () => {
      const out = await roundTrip("**bold** _italic_ ~~struck~~");
      expect(out).toContain("**bold**");
      expect(out).toMatch(/[_*]italic[_*]/);
      expect(out).toContain("~~struck~~");
    });

    it("round-trips headings", async () => {
      const out = await roundTrip("## H2\n\n### H3");
      expect(out).toContain("## H2");
      expect(out).toContain("### H3");
    });

    it("round-trips bullet and numbered lists", async () => {
      const out = await roundTrip("- one\n- two\n\n1. first\n2. second");
      expect(out).toMatch(/[-*] one/);
      expect(out).toMatch(/[-*] two/);
      expect(out).toContain("1. first");
      expect(out).toContain("2. second");
    });

    it("round-trips a checklist", async () => {
      const out = await roundTrip("- [ ] todo\n- [x] done");
      expect(out).toMatch(/\[ ] todo/);
      expect(out).toMatch(/\[x] done/i);
    });

    it("round-trips a blockquote", async () => {
      const out = await roundTrip("> quoted text");
      expect(out).toContain("> quoted text");
    });

    it("round-trips a code block", async () => {
      const out = await roundTrip("```\nconst x = 1;\n```");
      expect(out).toContain("```");
      expect(out).toContain("const x = 1;");
    });

    it("round-trips a horizontal rule", async () => {
      const out = await roundTrip("above\n\n---\n\nbelow");
      expect(out).toContain("---");
    });

    it("round-trips a link", async () => {
      const out = await roundTrip("[Podium](https://example.com)");
      expect(out).toContain("[Podium](https://example.com)");
    });
  });
});
