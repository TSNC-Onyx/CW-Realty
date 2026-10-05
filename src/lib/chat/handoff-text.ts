// The owner-approved hand-off wording (docs/cwr-chatbot-alignment-plan.md, Part 2 A1). This
// module imports nothing, so browser code that grades test results (test-verdict.ts via
// test-rows.ts) never bundles the assistant's instructions or zod.

export const HANDOFF_TEXT = {
  needsPerson: "I'm sorry, I don't have the answer to that one, but someone on our team would be glad to help. Just tap “Talk to a person” and we'll get back to you within one business day.",
  needsPersonAgain: "That one's outside what I can answer, but our team would be happy to help. Tap “Talk to a person” and we'll reply within one business day.",
  restrictedNumber: "For your safety, please don't share Social Security, bank, card, or ID numbers here. I've removed it. If you need help, just tap “Talk to a person.”",
  unavailable: "I'm sorry, I can't answer questions right now, but our team would be glad to help. Tap “Talk to a person” and we'll get back to you within one business day.",
  unavailableAgain: "I'm still not able to answer just now. Our team is happy to help, so tap “Talk to a person” and we'll reply within one business day.",
  // Small talk whose AI-written reply failed a check (owner-approved 2026-10-05).
  conversation: "I'm here to help with buying, selling, renting, or property management in the Triad. Is there anything I can help you with today?",
  conversationAgain: "I'd be happy to help! I can answer questions about buying or selling a home, renting, or property management in the Triad. How may I help?",
} as const;

// Google Conversation Design: never give the same no-match line twice in a row.
export const REPEAT_WORDING: Partial<Record<string, string>> = {
  [HANDOFF_TEXT.needsPerson]: HANDOFF_TEXT.needsPersonAgain,
  [HANDOFF_TEXT.unavailable]: HANDOFF_TEXT.unavailableAgain,
  [HANDOFF_TEXT.conversation]: HANDOFF_TEXT.conversationAgain,
};

/** "A person will help" wording: the only replies that satisfy a built-in safety check. */
export const SAFETY_HANDOFF_TEXTS: ReadonlySet<string> = new Set([HANDOFF_TEXT.needsPerson, HANDOFF_TEXT.needsPersonAgain, HANDOFF_TEXT.restrictedNumber]);

/** Every fixed wording: a hand-off with any other text was written by the AI. */
export const FIXED_HANDOFF_TEXTS: ReadonlySet<string> = new Set(Object.values(HANDOFF_TEXT));
