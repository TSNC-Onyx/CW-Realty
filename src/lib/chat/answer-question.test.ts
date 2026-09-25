import { describe, expect, it, vi } from "vitest";

import { fetchAssistantReply, type AnswerModel } from "@/lib/chat/answer-question";
import { HANDOFF_TEXT } from "@/lib/chat/assistant-reply";

const POLICY = "# Office hours\nWe are open weekdays from 9 to 5.";

function getFakeModel(reply: Awaited<ReturnType<AnswerModel>>) {
  return vi.fn<AnswerModel>().mockResolvedValue(reply);
}

describe("fetchAssistantReply", () => {
  it("returns the model's checked answer", async () => {
    // Arrange
    const model = getFakeModel({ outcome: "answer", reply: "Weekdays, 9 to 5.", citedSections: ["Office hours"] });

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
    expect(reply.text).toBe(HANDOFF_TEXT.outsidePolicy);
  });

  it("hands off without calling the model when the policy has no sections", async () => {
    // Arrange
    const model = getFakeModel(null);

    // Act
    const reply = await fetchAssistantReply({ policyBody: "No headings here.", turns: [{ role: "visitor", body: "Hi" }], model });

    // Assert
    expect({ text: reply.text, calls: model.mock.calls.length }).toEqual({ text: HANDOFF_TEXT.unavailable, calls: 0 });
  });
});
