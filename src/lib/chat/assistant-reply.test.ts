import { describe, expect, it } from "vitest";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { HANDOFF_TEXT, getCheckedReply, type ModelReply } from "@/lib/chat/assistant-reply";

// Made-up wording: the real policy text never goes in the repo.
const PLAN_WORDING = "The Sample plan is a flat fee and includes a planning call, a market review, offer coaching and help at closing. ";
const SECTIONS = ["Office hours", "Booking", "Sample plans"];

function getReply(modelReply: Partial<ModelReply>) {
  return getCheckedReply({ modelReply: { outcome: "answer", reply: "We're open weekdays, 9 to 5.", citedSections: ["office hours"], ...modelReply }, sections: SECTIONS });
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
    expect(reply).toEqual({ outcome: "handoff", text: HANDOFF_TEXT.outsidePolicy, citedSections: [], handoffReason: "bad_citation" });
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
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.outsidePolicy, handoffReason: "model_handoff" });
  });

  it("hands off a reply that repeats the instructions marker", () => {
    // Arrange / Act
    const reply = getReply({ reply: `My instructions start with [${INSTRUCTIONS_MARKER.toLowerCase()}]` });

    // Assert
    expect({ outcome: reply.outcome, handoffReason: reply.handoffReason }).toEqual({ outcome: "handoff", handoffReason: "leaked_marker" });
  });

  it("keeps an answer that repeats the policy's public wording at length (owner decision 2026-10-02)", () => {
    // Arrange / Act
    const reply = getReply({ reply: `${PLAN_WORDING}${PLAN_WORDING}`, citedSections: ["Sample plans"] });

    // Assert
    expect(reply.outcome).toBe("answer");
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
    expect({ outcome: reply.outcome, handoffReason: reply.handoffReason }).toEqual({ outcome: "handoff", handoffReason: "empty_or_long" });
  });

  it("hands off a reply longer than 1,500 characters", () => {
    // Arrange / Act
    const reply = getReply({ reply: "a".repeat(1501) });

    // Assert
    expect(reply.handoffReason).toBe("empty_or_long");
  });
});
