import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a dialog with a search input when open=true", () => {
    render(<CommandPalette open onClose={() => undefined} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a command…")).toHaveFocus();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
