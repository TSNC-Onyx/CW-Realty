import { describe, expect, it } from "vitest";

import { GUIDED_ROOT_ID, getGuidedNode, getGuidedParentId, getGuidedPauseMs, getOptionsBranchId, getQuickAnswerLeaves, getQuickAnswerTitle, getVisibleChildren, hasGuidedMenu, isGuidedLeaf, type GuidedNode } from "@/lib/chat/guided-tree";

function getAllNodes(): GuidedNode[] {
  const nodes: GuidedNode[] = [];
  const visit = (id: string) => {
    const node = getGuidedNode(id);
    if (!node) return;
    nodes.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(GUIDED_ROOT_ID);
  return nodes;
}

function getDepth(id: string): number {
  const parentId = getGuidedParentId(id);
  return parentId === null ? 0 : 1 + getDepth(parentId);
}

const EVERY_LEAF = new Set(getQuickAnswerLeaves().map((leaf) => leaf.id));

describe("the topic tree", () => {
  it("keeps every button label to 25 characters", () => {
    // Arrange / Act
    const longLabels = getAllNodes().filter((node) => node.id !== GUIDED_ROOT_ID && node.label.length > 25).map((node) => node.label);

    // Assert
    expect(longLabels).toEqual([]);
  });

  it("offers at most 4 buttons per step and goes at most 3 steps deep", () => {
    // Arrange
    const nodes = getAllNodes();

    // Act
    const widest = Math.max(...nodes.map((node) => node.children?.length ?? 0));
    const deepest = Math.max(...nodes.map((node) => getDepth(node.id)));

    // Assert
    expect({ widest, deepest }).toEqual({ widest: 4, deepest: 3 });
  });

  it("links every answer to an internal page, except the repair and emergency answers", () => {
    // Arrange / Act
    const withoutLink = getAllNodes().filter((node) => isGuidedLeaf(node) && !node.link).map((node) => node.id);
    const external = getAllNodes().filter((node) => node.link && !node.link.href.startsWith("/")).map((node) => node.id);

    // Assert
    expect({ withoutLink, external }).toEqual({ withoutLink: ["repair", "emergency"], external: [] });
  });

  it("names each answer's policy section after its button", () => {
    // Arrange
    const leaf = getGuidedNode("buying");

    // Act
    const title = leaf ? getQuickAnswerTitle(leaf) : null;

    // Assert
    expect(title).toBe("Quick answer: Buying a home");
  });
});

describe("getVisibleChildren", () => {
  it("shows a button only when its answer exists, and a branch only when something under it does", () => {
    // Arrange
    const available = new Set(["touchup-cost"]);

    // Act
    const top = getVisibleChildren(GUIDED_ROOT_ID, available).map((node) => node.id);
    const touchup = getVisibleChildren("touchup", available).map((node) => node.id);

    // Assert
    expect({ top, touchup }).toEqual({ top: ["rentals", "touchup"], touchup: ["touchup-cost"] });
  });

  it("always keeps the emergency button under I'm a tenant", () => {
    // Arrange / Act
    const tenant = getVisibleChildren("tenant", new Set()).map((node) => node.id);

    // Assert
    expect(tenant).toEqual(["emergency"]);
  });

  it("shows everything when every answer exists", () => {
    // Arrange / Act
    const top = getVisibleChildren(GUIDED_ROOT_ID, EVERY_LEAF).map((node) => node.label);

    // Assert
    expect(top).toEqual(["Buy or sell a home", "Rentals & management", "CWR TouchUp", "Something else"]);
  });
});

describe("hasGuidedMenu", () => {
  it("stays off until the policy has at least one quick answer (the emergency button alone doesn't switch it on)", () => {
    // Arrange / Act
    const results = [hasGuidedMenu(new Set()), hasGuidedMenu(new Set(["team"]))];

    // Assert
    expect(results).toEqual([false, true]);
  });
});

describe("getOptionsBranchId", () => {
  it("shows a leaf's siblings, a branch's own options, and the top for anything unknown", () => {
    // Arrange / Act
    const results = [getOptionsBranchId("buying"), getOptionsBranchId("buy-sell"), getOptionsBranchId("no-such-topic")];

    // Assert
    expect(results).toEqual(["buy-sell", "buy-sell", GUIDED_ROOT_ID]);
  });
});

describe("getGuidedPauseMs", () => {
  it("never pauses an emergency, and keeps other pauses between 0.7 and 1.5 seconds", () => {
    // Arrange
    const longText = Array.from({ length: 200 }, () => "word").join(" ");

    // Act
    const results = [getGuidedPauseMs({ text: "Call 911 first.", isEmergency: true }), getGuidedPauseMs({ text: "Hi.", isEmergency: false }), getGuidedPauseMs({ text: longText, isEmergency: false })];

    // Assert
    expect(results).toEqual([0, 700, 1500]);
  });

  it("grows with the answer's length", () => {
    // Arrange
    const words = Array.from({ length: 24 }, () => "word").join(" ");

    // Act
    const pause = getGuidedPauseMs({ text: words, isEmergency: false });

    // Assert
    expect(pause).toBe(900);
  });
});
