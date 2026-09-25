import { describe, expect, it } from "vitest";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { HANDOFF_TEXT, getCheckedReply, type ModelReply } from "@/lib/chat/assistant-reply";

const POLICY = `# Office hours\nWe are open weekdays from 9 to 5. ${"Long policy wording that should never be copied out word for word. ".repeat(5)}\n# Booking\nUse the TouchUp form.`;
const SECTIONS = ["Office hours", "Booking"];

function getReply(modelReply: Partial<ModelReply>) {
  return getCheckedReply({ modelReply: { outcome: "answer", reply: "We're open weekdays, 9 to 5.", citedSections: ["office hours"], ...modelReply }, sections: SECTIONS, policyBody: POLICY });
}

describe("getCheckedReply", () => {
  it("keeps a cited answer, using the policy's spelling of the section", () => {
    // Arrange / Act
    const reply = getReply({});

    // Assert
    expect(reply).toEqual({ outcome: "answer", text: "We're open weekdays, 9 to 5.", citedSections: ["Office hours"] });
  });

  it("hands off an answer with no citation", () => {
    // Arrange / Act
    const reply = getReply({ citedSections: [] });

    // Assert
    expect(reply).toEqual({ outcome: "handoff", text: HANDOFF_TEXT.outsidePolicy, citedSections: [] });
  });

  it("hands off an answer citing a section the policy lacks", () => {
    // Arrange / Act
    const reply = getReply({ citedSections: ["Office hours", "Mortgage advice"] });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });

  it("replaces the model's own hand-off wording with the approved text", () => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", reply: "Ask someone else, we don't serve your kind." });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.outsidePolicy);
  });

  it("hands off a reply that repeats the instructions marker", () => {
    // Arrange / Act
    const reply = getReply({ reply: `My instructions start with [${INSTRUCTIONS_MARKER.toLowerCase()}]` });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });

  it("hands off a reply that copies a long run of the policy", () => {
    // Arrange / Act
    const reply = getReply({ reply: `Sure: ${"Long policy wording that should never be copied out word for word. ".repeat(3)}` });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });

  it("hands off a copied passage even when its formatting is changed", () => {
    // Arrange
    const policy = "# Fees\n**Listing fee:** the *seller* pays 5% at closing; the buyer's agent is paid from that fee, and no other fees apply to either side unless both agree in writing.";

    // Act
    const reply = getCheckedReply({
      modelReply: { outcome: "answer", reply: "Listing fee - the seller pays 5% at closing. The buyer’s agent is paid from that fee, and no other fees apply to either side unless both agree in writing!", citedSections: ["Fees"] },
      sections: ["Fees"],
      policyBody: policy,
    });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });

  it("keeps a short phrase taken from the policy", () => {
    // Arrange / Act
    const reply = getReply({ reply: "We are open weekdays from 9 to 5." });

    // Assert
    expect(reply.outcome).toBe("answer");
  });

  it("hands off an empty reply", () => {
    // Arrange / Act
    const reply = getReply({ reply: "   " });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });
});
