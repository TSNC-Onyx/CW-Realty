import { describe, expect, it, vi } from "vitest";

import { fetchAssistantReply, getRepairedTurnReply, type AnswerModel } from "@/lib/chat/answer-question";
import { HANDOFF_TEXT, getHandoffReply } from "@/lib/chat/assistant-reply";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";

const POLICY = "# Office hours\nWe are open weekdays from 9 to 5.";

function getFakeModel(reply: Awaited<ReturnType<AnswerModel>>) {
  return vi.fn<AnswerModel>().mockResolvedValue(reply);
}

describe("fetchAssistantReply", () => {
  it("returns the model's checked answer", async () => {
    // Arrange
    const model = getFakeModel({ outcome: "answer", handoffKind: "needs_person", reply: "Weekdays, 9 to 5.", citedSections: ["Office hours"] });

    // Act
    const reply = await fetchAssistantReply({ policyBody: POLICY, turns: [{ role: "visitor", body: "When are you open?" }], model });

    // Assert
    expect(reply).toEqual({ outcome: "answer", text: "Weekdays, 9 to 5.", citedSections: ["Office hours"] });
  });

  it("never sends a restricted number to the model", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: POLICY, turns: [{ role: "visitor", body: "My SSN is 123-45-6789" }], model });

    // Assert
    expect({ text: reply.text, calls: model.mock.calls.length }).toEqual({ text: HANDOFF_TEXT.restrictedNumber, calls: 0 });
  });

  it("gives the fixed emergency reply without asking the model", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: `${POLICY}\n# Emergencies\nCall 911 first.`, turns: [{ role: "visitor", body: "I smell gas in my kitchen" }], model });

    // Assert
    expect({ reply, calls: model.mock.calls.length }).toEqual({ reply: { outcome: "answer", text: EMERGENCY_TEXT, citedSections: ["Emergencies"] }, calls: 0 });
  });

  it("gives the policy and section list to the model in its instructions", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    await fetchAssistantReply({ policyBody: POLICY, turns: [{ role: "visitor", body: "Hi" }], model });

    // Assert
    expect(model.mock.calls[0]?.[0].systemPrompt).toContain("- Office hours\n\n<policy>\n# Office hours");
  });

  it("hands off when the model declines", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: POLICY, turns: [{ role: "visitor", body: "Hi" }], model });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.needsPerson);
  });

  it("hands off without calling the model when the policy has no sections", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: "No headings here.", turns: [{ role: "visitor", body: "Hi" }], model });

    // Assert
    expect({ text: reply.text, calls: model.mock.calls.length }).toEqual({ text: HANDOFF_TEXT.unavailable, calls: 0 });
  });

  it("never gives the model a private section's text or heading", async () => {
    // Arrange
    const model = getFakeModel(null);
    const policy = "# Office hours\nWeekdays.\n# Margins (private)\nKeep 2 percent.";

    // Act
    await fetchAssistantReply({ policyBody: policy, turns: [{ role: "visitor", body: "What are your margins?" }], model });

    // Assert
    const systemPrompt = model.mock.calls[0]?.[0].systemPrompt ?? "";
    expect({ hasPrivateText: systemPrompt.includes("Keep 2 percent"), hasPrivateHeading: systemPrompt.includes("Margins") }).toEqual({ hasPrivateText: false, hasPrivateHeading: false });
  });

  it("hands off without calling the model when every section is private", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: "# Notes (private)\nInternal.", turns: [{ role: "visitor", body: "Hi" }], model });

    // Assert
    expect({ text: reply.text, calls: model.mock.calls.length }).toEqual({ text: HANDOFF_TEXT.unavailable, calls: 0 });
  });
});

describe("getRepairedTurnReply", () => {
  it("rewords a repeated fixed line that isn't a miss (the small-talk fallback)", () => {
    // Arrange
    const turns = [
      { role: "visitor" as const, body: "Hi" },
      { role: "assistant" as const, body: HANDOFF_TEXT.conversation },
      { role: "visitor" as const, body: "Hello again" },
    ];

    // Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.conversation), turns });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.conversationAgain);
  });

  it("keeps the first miss as the plain hand-off line", () => {
    // Arrange
    const turns = [{ role: "visitor" as const, body: "Do you sell trucks?" }];

    // Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.needsPerson), turns });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.needsPerson);
  });

  it("leaves the model's own wording alone even when it matches the last reply", () => {
    // Arrange
    const text = "Happy to help! What would you like to know?";
    const turns = [{ role: "assistant" as const, body: text }, { role: "visitor" as const, body: "Hi" }];

    // Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(text), turns });

    // Assert
    expect(reply.text).toBe(text);
  });
});

describe("getRepairedTurnReply (bug 16)", () => {
  function getTurnsAfter(previousText: string) {
    return [
      { role: "visitor" as const, body: "Do you sell boats?" },
      { role: "assistant" as const, body: previousText },
      { role: "visitor" as const, body: "But it's a real estate question" },
    ];
  }

  it("says what the chat can do after two misses in a row", () => {
    // Arrange / Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.needsPerson), turns: getTurnsAfter(HANDOFF_TEXT.needsPersonAgain) });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.repair);
  });

  it("takes the other repair line when the last reply was already a repair", () => {
    // Arrange / Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.needsPerson), turns: getTurnsAfter(HANDOFF_TEXT.repair) });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.repairAgain);
  });

  it("never apologizes to a lead: a lead after a lead takes the other lead line", () => {
    // Arrange / Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.lead), turns: getTurnsAfter(HANDOFF_TEXT.lead) });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.leadAgain);
  });

  it.each([HANDOFF_TEXT.restrictedNumber, HANDOFF_TEXT.unavailable])("leaves the safety and outage lines as they are: %s", (text) => {
    // Arrange / Act
    const reply = getRepairedTurnReply({ reply: getHandoffReply(text), turns: getTurnsAfter(HANDOFF_TEXT.needsPerson) });

    // Assert
    expect(reply.text).toBe(text);
  });
});

describe("fetchAssistantReply lead guard (bug 15)", () => {
  it("a lead hand-off uses the approved lead line", async () => {
    // Arrange
    const model = getFakeModel({ outcome: "handoff", handoffKind: "lead", reply: "", citedSections: [] });

    // Act
    const reply = await fetchAssistantReply({ policyBody: POLICY, turns: [{ role: "visitor", body: "I want to sell my house" }], model });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.lead);
  });

  it("downgrades a lead on steering words, even when they were in an earlier message", async () => {
    // Arrange
    const model = getFakeModel({ outcome: "handoff", handoffKind: "lead", reply: "", citedSections: [] });
    const turns = [
      { role: "visitor" as const, body: "We're Muslim and want to buy" },
      { role: "assistant" as const, body: HANDOFF_TEXT.lead },
      { role: "visitor" as const, body: "Where should we look?" },
    ];

    // Act
    const reply = await fetchAssistantReply({ policyBody: POLICY, turns, model });

    // Assert
    expect({ text: reply.text, handoffReason: reply.handoffReason }).toEqual({ text: HANDOFF_TEXT.needsPerson, handoffReason: "lead_downgraded" });
  });
});
