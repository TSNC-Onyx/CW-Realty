import { describe, expect, it, vi } from "vitest";

import { fetchAssistantReply, getUnrepeatedTurnReply, type AnswerModel } from "@/lib/chat/answer-question";
import { HANDOFF_TEXT, getHandoffReply } from "@/lib/chat/assistant-reply";

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

describe("getUnrepeatedTurnReply", () => {
  it("rewords the fixed hand-off line when the assistant's last reply was the same line", () => {
    // Arrange
    const turns = [
      { role: "visitor" as const, body: "Do you sell boats?" },
      { role: "assistant" as const, body: HANDOFF_TEXT.needsPerson },
      { role: "visitor" as const, body: "Do you sell cars?" },
    ];

    // Act
    const reply = getUnrepeatedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.needsPerson), turns });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.needsPersonAgain);
  });

  it("goes back to the first wording after the alternate was used", () => {
    // Arrange
    const turns = [
      { role: "assistant" as const, body: HANDOFF_TEXT.needsPersonAgain },
      { role: "visitor" as const, body: "Do you sell trucks?" },
    ];

    // Act
    const reply = getUnrepeatedTurnReply({ reply: getHandoffReply(HANDOFF_TEXT.needsPerson), turns });

    // Assert
    expect(reply.text).toBe(HANDOFF_TEXT.needsPerson);
  });

  it("leaves the model's own wording alone even when it matches the last reply", () => {
    // Arrange
    const text = "Happy to help! What would you like to know?";
    const turns = [{ role: "assistant" as const, body: text }, { role: "visitor" as const, body: "Hi" }];

    // Act
    const reply = getUnrepeatedTurnReply({ reply: getHandoffReply(text), turns });

    // Assert
    expect(reply.text).toBe(text);
  });
});
