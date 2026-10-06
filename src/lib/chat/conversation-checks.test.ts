import { describe, expect, it } from "vitest";

import { hasPolicyName, hasPolicyOverlap, hasSlang } from "@/lib/chat/conversation-checks";
import { HANDOFF_TEXT } from "@/lib/chat/handoff-text";

// Made-up policy: the real one never goes in the repo. It holds every word the approved
// small-talk replies use, so the checks prove they never block the owner's own wording.
const FIXTURE_POLICY = [
  "# About this chat assistant",
  "The CWR Assistant is an AI. Tap Talk to a Person anytime. Charlie Ward Realty serves Greensboro, High Point, Winston-Salem, Durham and the Triad in North Carolina.",
  "# Our team",
  "Charlie Ward Sr. is our broker in charge. Mary Lane and Sam Ortiz help buyers and sellers every day of the week.",
].join("\n");

// Owner-approved style examples (assistant-prompt.ts) and small-talk fallback lines.
const APPROVED_REPLIES = [
  "Yes, I'm the CWR Assistant, an AI helper for Charlie Ward Realty. I'm happy to answer questions about buying, selling, renting, or property management in the Triad. And whenever you'd like to speak with someone on our team, just tap \"Talk to a person.\"",
  "I'll have to leave the football talk to our team! I'm here to help with buying, selling, renting, or property management in the Triad. Is there anything I can help you with today?",
  HANDOFF_TEXT.conversation,
  HANDOFF_TEXT.conversationAgain,
];

describe("conversation checks", () => {
  it.each(APPROVED_REPLIES)("never block an approved small-talk reply: %s", (text) => {
    // Arrange / Act
    const problems = { overlap: hasPolicyOverlap({ text, publicPolicy: FIXTURE_POLICY }), name: hasPolicyName({ text, publicPolicy: FIXTURE_POLICY }), slang: hasSlang(text) };

    // Assert
    expect(problems).toEqual({ overlap: false, name: false, slang: false });
  });

  it("catches a small-talk reply that names the team from the policy", () => {
    // Arrange / Act
    const isNamed = hasPolicyName({ text: "Great question! We have Charlie Ward Sr. and Mary on the team.", publicPolicy: FIXTURE_POLICY });

    // Assert
    expect(isNamed).toBe(true);
  });

  it("catches a small-talk reply that copies six words in a row from the policy", () => {
    // Arrange / Act
    const isCopied = hasPolicyOverlap({ text: "Sure! They help buyers and sellers every day, you know.", publicPolicy: FIXTURE_POLICY });

    // Assert
    expect(isCopied).toBe(true);
  });

  it("allows five shared words, which ordinary sentences share by chance", () => {
    // Arrange / Act
    const isCopied = hasPolicyOverlap({ text: "We help buyers and sellers too!", publicPolicy: FIXTURE_POLICY });

    // Assert
    expect(isCopied).toBe(false);
  });

  it.each(["Our folks would love to help!", "Y’all come back now!", "We're gonna find it."])("catches slang, including with a curly apostrophe: %s", (text) => {
    // Arrange / Act
    const isSlang = hasSlang(text);

    // Assert
    expect(isSlang).toBe(true);
  });

  it("doesn't count a word inside a longer word as slang", () => {
    // Arrange / Act
    const isSlang = hasSlang("Folksy charm aside, how can I help?");

    // Assert
    expect(isSlang).toBe(false);
  });
});
