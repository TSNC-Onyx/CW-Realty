import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SAFETY_CHECKS_VERSION } from "@/lib/admin/chat-policy/test-verdict";
import { getSystemPrompt } from "@/lib/chat/assistant-prompt";
import { modelReplySchema } from "@/lib/chat/assistant-reply";
import { CHAT_EFFORT, CHAT_FALLBACKS, CHAT_MODEL, CHAT_THINKING, FALLBACK_BETA, MAX_REPLY_TOKENS } from "@/lib/chat/claude-model";

// docs/cwr-chatbot-alignment-plan.md, Part 2 A4: a change to the assistant's instructions,
// model or request settings must come with a new SAFETY_CHECKS_VERSION, so every policy is
// re-tested before it can publish again. Made-up policy: the real one never goes in the repo.

vi.mock("server-only", () => ({}));

const FIXTURE_POLICY = "# Office hours\nWe are open weekdays.\n# Booking\nUse the Contact page.";
const FIXTURE_SECTIONS = ["Office hours", "Booking"];

const PINNED = { version: "2026-10-05", fingerprint: "93115d2bfdaa218e46137f6942d1a8d85cc598cbfaa0493255830184a0ea9265" };

const BUMP_MESSAGE =
  "The assistant's instructions, model or settings changed: bump SAFETY_CHECKS_VERSION in test-verdict.ts and update this fingerprint. (A zod or SDK upgrade can also change the hash: bump the version only if model-facing behaviour changed, otherwise just re-pin.)";

function getFingerprint(): string {
  const settings = {
    prompt: getSystemPrompt({ policyBody: FIXTURE_POLICY, sections: FIXTURE_SECTIONS }),
    CHAT_MODEL,
    CHAT_EFFORT,
    CHAT_THINKING,
    CHAT_FALLBACKS,
    FALLBACK_BETA,
    MAX_REPLY_TOKENS,
    schema: z.toJSONSchema(modelReplySchema),
  };
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}

describe("assistant fingerprint", () => {
  it("matches the pinned safety-checks version", () => {
    // Arrange / Act
    const current = { version: SAFETY_CHECKS_VERSION, fingerprint: getFingerprint() };

    // Assert
    expect(current, BUMP_MESSAGE).toEqual(PINNED);
  });
});
