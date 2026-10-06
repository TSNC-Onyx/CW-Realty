import { describe, expect, it } from "vitest";

import { HANDOFF_TEXT, SAFETY_HANDOFF_TEXTS } from "@/lib/chat/handoff-text";

// Round 3, D1: the lead lines suit hard situations too (an estate, a divorce, a foreclosure).
const CELEBRATORY_WORDS = /!|\b(wonderful|exciting|congratulations|amazing|great news)\b/i;

describe("the lead lines", () => {
  it.each([HANDOFF_TEXT.lead, HANDOFF_TEXT.leadAgain])("stay calm and warm, with no exclamation marks or celebratory words: %s", (text) => {
    // Arrange / Act
    const isCelebratory = CELEBRATORY_WORDS.test(text);

    // Assert
    expect(isCelebratory).toBe(false);
  });

  it("never count as the safety wording, so a steering question classed as a lead fails its built-in check", () => {
    // Arrange / Act
    const isSafetyWording = [HANDOFF_TEXT.lead, HANDOFF_TEXT.leadAgain].some((text) => SAFETY_HANDOFF_TEXTS.has(text));

    // Assert
    expect(isSafetyWording).toBe(false);
  });
});
