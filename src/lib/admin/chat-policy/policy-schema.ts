import { z } from "zod";

import { getPolicySections, getPublicSections } from "@/lib/chat/policy-sections";

// Policy file and test-question rules, shared by the editor and its server actions.

export const MAX_POLICY_LENGTH = 200_000;
const MAX_TEST_QUESTION_LENGTH = 2000;
export const MAX_MENTION_PHRASES = 3;
const MAX_MENTION_PHRASE_LENGTH = 60;

/** What the assistant should do: answer; answer or reply in its own words; or offer a person. */
export const TEST_EXPECTATIONS = ["answer", "answer_or_friendly", "handoff"] as const;

export type TestExpectation = (typeof TEST_EXPECTATIONS)[number];

export const policyBodySchema = z
  .string()
  .trim()
  .min(1, "Write or upload the policy before saving")
  .max(MAX_POLICY_LENGTH, `Keep the policy under ${MAX_POLICY_LENGTH.toLocaleString("en-US")} characters`)
  .refine((body) => getPolicySections(body).length > 0, "Add at least one section heading: a line starting with # and a title, like “# Office hours”")
  .refine((body) => getPolicySections(body).length === 0 || getPublicSections(body).length > 0, "Add at least one section without (private): the assistant needs something it may share.");

const expectationSchema = z.enum(TEST_EXPECTATIONS, "Choose what the assistant should do");

const expectedSectionSchema = z.string().trim().max(200, "Keep the section title under 200 characters");

/** "Should mention": phrases separated by commas, each found in the reply ignoring case. */
const mustMentionSchema = z
  .string()
  .max(MAX_MENTION_PHRASES * (MAX_MENTION_PHRASE_LENGTH + 2), "Keep the phrases shorter")
  .transform((text) => text.split(",").map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 0))
  .pipe(z.array(z.string().max(MAX_MENTION_PHRASE_LENGTH, `Keep each phrase under ${MAX_MENTION_PHRASE_LENGTH} characters`)).max(MAX_MENTION_PHRASES, `Add up to ${MAX_MENTION_PHRASES} phrases, separated by commas`));

export const policyTestSchema = z.object({
  question: z.string().trim().min(1, "Enter a question a visitor might ask").max(MAX_TEST_QUESTION_LENGTH, `Keep the question under ${MAX_TEST_QUESTION_LENGTH} characters`),
  expectation: expectationSchema,
  expectedSection: expectedSectionSchema,
  mustMention: mustMentionSchema,
});

/** A one-click fix to a failed question: its expectation and section only (docs/cwr-chat-quick-answers-and-tests-plan.md §E). */
export const policyTestFixSchema = z.object({
  testId: z.uuid(),
  expectation: expectationSchema,
  expectedSection: expectedSectionSchema,
});

export type PolicyTestFixInput = z.input<typeof policyTestFixSchema>;

export type PolicyTestInput = z.input<typeof policyTestSchema>;

/** The stored columns for an expectation. */
export function getExpectationColumns(expectation: TestExpectation): { expected_outcome: "answer" | "handoff"; allows_friendly_reply: boolean } {
  return { expected_outcome: expectation === "handoff" ? "handoff" : "answer", allows_friendly_reply: expectation === "answer_or_friendly" };
}

export function getTestExpectation({ expectedOutcome, allowsFriendlyReply }: { expectedOutcome: "answer" | "handoff"; allowsFriendlyReply: boolean }): TestExpectation {
  if (expectedOutcome === "handoff") return "handoff";
  return allowsFriendlyReply ? "answer_or_friendly" : "answer";
}
