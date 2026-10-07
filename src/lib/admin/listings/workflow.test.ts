import { describe, expect, it } from "vitest";

import { canUndoStatusMove, getStatusMoves } from "@/lib/admin/listings/workflow";

describe("listing status moves", () => {
  it.each([
    ["coming_soon", ["for_sale", "under_contract", "sold"]],
    ["for_sale", ["coming_soon", "under_contract", "sold"]],
    ["under_contract", ["for_sale", "sold"]],
    ["sold", ["for_sale"]],
  ] as const)("offers the moves the database allows from %s", (status, expectedMoves) => {
    // Arrange: the database move table (supabase/migrations/20261007000200)

    // Act
    const moves = getStatusMoves(status);

    // Assert
    expect(moves).toEqual(expectedMoves);
  });

  it("offers Undo when the reverse move is allowed", () => {
    // Arrange: a deal falls through, so Under Contract goes back to For Sale

    // Act
    const isUndoable = canUndoStatusMove("for_sale", "under_contract");

    // Assert
    expect(isUndoable).toBe(true);
  });

  it("offers no Undo when the reverse move is not allowed", () => {
    // Arrange: Sold can only go back to For Sale, never to Coming Soon

    // Act
    const isUndoable = canUndoStatusMove("coming_soon", "sold");

    // Assert
    expect(isUndoable).toBe(false);
  });
});
