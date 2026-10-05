import { describe, expect, it } from "vitest";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { HANDOFF_TEXT, getCheckedReply, getReplyWithoutRejectedText, getUnrepeatedReply, type ModelReply } from "@/lib/chat/assistant-reply";

// Made-up wording: the real policy text never goes in the repo.
const PLAN_WORDING = "The Sample plan is a flat fee and includes a planning call, a market review, offer coaching and help at closing. ";
const SECTIONS = ["Office hours", "Booking", "Sample plans"];

function getReply(modelReply: Partial<ModelReply>) {
  return getCheckedReply({ modelReply: { outcome: "answer", handoffKind: "needs_person", reply: "We're open weekdays, 9 to 5.", citedSections: ["office hours"], ...modelReply }, sections: SECTIONS });
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
    expect(reply).toEqual({ outcome: "handoff", text: HANDOFF_TEXT.needsPerson, citedSections: [], handoffReason: "bad_citation" });
  });

  it("hands off an answer citing a section the policy lacks", () => {
    // Arrange / Act
    const reply = getReply({ citedSections: ["Office hours", "Mortgage advice"] });

    // Assert
    expect(reply.outcome).toBe("handoff");
  });

  it("replaces the model's wording with the approved text on a hand-off that needs a person", () => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", handoffKind: "needs_person", reply: "Ask someone else, we don't serve your kind." });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.needsPerson, handoffReason: "model_handoff" });
  });

  it("keeps the model's own short, kind reply to small talk (owner decision D1)", () => {
    // Arrange
    const text = "I'll have to leave the football talk to our team! How can I help with buying or selling today?";

    // Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: text, citedSections: ["Office hours"] });

    // Assert
    expect(reply).toEqual({ outcome: "handoff", text, citedSections: [], handoffReason: "model_handoff" });
  });

  it("uses the approved small-talk line when a small-talk reply runs longer than 400 characters", () => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: "a".repeat(401) });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.conversation, handoffReason: "empty_or_long" });
  });

  it("uses the approved small-talk line when a small-talk reply repeats the instructions marker", () => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: `Sure: [${INSTRUCTIONS_MARKER}]` });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.conversation, handoffReason: "leaked_marker" });
  });

  it.each([
    ["an ASCII digit", "We're here 24/7 for you!"],
    ["a fullwidth digit", "Happy to help, call １ of us anytime!"],
    ["a dollar sign", "Homes start around $ a lot!"],
    ["a fullwidth dollar sign", "Homes from ＄ are lovely!"],
    ["an at sign", "Write to us @ the office!"],
    ["a percent sign", "We're 100 percent here, % sure!"],
    ["a link", "See https: our site!"],
    ["www", "Visit www.example for more!"],
    ["fullwidth www", "Visit ＷＷＷ．ｘ．ｃｏｍ today!"],
    ["a .com domain", "Visit cwrealty.com today!"],
    ["a .homes domain", "Visit cwrealty.homes today!"],
    ["a .realty domain", "Visit charlie.realty today!"],
    ["an .app domain", "Try our.app today!"],
  ])("replaces an AI-written small-talk reply containing %s with the approved small-talk line", (_label, text) => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: text });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason, rejectedText: reply.rejectedText }).toEqual({ text: HANDOFF_TEXT.conversation, handoffReason: "unsafe_conversation", rejectedText: text });
  });

  it("keeps a friendly small-talk reply that only mentions U.S. homes", () => {
    // Arrange
    const text = "We love U.S. homes, especially here in the Triad! How can I help today?";

    // Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: text });

    // Assert
    expect(reply.text).toBe(text);
  });

  it("alternates the approved small-talk lines instead of repeating one", () => {
    // Arrange
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: "Call 555 anytime!" });

    // Act
    const unrepeated = getUnrepeatedReply({ reply, previousText: HANDOFF_TEXT.conversation });

    // Assert
    expect(unrepeated.text).toBe(HANDOFF_TEXT.conversationAgain);
  });

  it("drops the rejected text before a reply leaves the server", () => {
    // Arrange
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: "Call 555 anytime!" });

    // Act
    const shareable = getReplyWithoutRejectedText(reply);

    // Assert
    expect(shareable).toEqual({ outcome: "handoff", text: HANDOFF_TEXT.conversation, citedSections: [], handoffReason: "unsafe_conversation" });
  });

  it("uses the approved small-talk line for an empty small-talk reply", () => {
    // Arrange / Act
    const reply = getReply({ outcome: "handoff", handoffKind: "conversation", reply: "  " });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.conversation, handoffReason: "empty_or_long" });
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
