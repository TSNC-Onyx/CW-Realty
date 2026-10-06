import { describe, expect, it, vi } from "vitest";

import { getUndoOption, type UndoOption } from "@/lib/admin/quick-undo";

type Restored = { status: "success" | "error"; message: string; didReplace?: boolean };

const UNDO: UndoOption<Restored> = { label: "Undo", problemAction: "chat_policy.save_draft", onRun: vi.fn(), isOffered: (result) => result.didReplace === true };

describe("getUndoOption", () => {
  it("offers Undo after a restore that replaced the open draft", () => {
    // Arrange / Act
    const option = getUndoOption({ result: { status: "success", message: "Copied.", didReplace: true }, undo: UNDO });

    // Assert
    expect(option).toBe(UNDO);
  });

  it("offers no Undo when the restore started a new draft instead", () => {
    // Arrange / Act
    const option = getUndoOption({ result: { status: "success", message: "Copied.", didReplace: false }, undo: UNDO });

    // Assert
    expect(option).toBeUndefined();
  });

  it("offers no Undo after a failure", () => {
    // Arrange / Act
    const option = getUndoOption({ result: { status: "error", message: "Failed." }, undo: UNDO });

    // Assert
    expect(option).toBeUndefined();
  });

  it("keeps offering Undo for actions that don't decide per result", () => {
    // Arrange
    const plainUndo: UndoOption<Restored> = { label: "Undo", problemAction: "chat_policy.save_draft", onRun: vi.fn() };

    // Act
    const option = getUndoOption({ result: { status: "success", message: "Hidden." }, undo: plainUndo });

    // Assert
    expect(option).toBe(plainUndo);
  });
});
