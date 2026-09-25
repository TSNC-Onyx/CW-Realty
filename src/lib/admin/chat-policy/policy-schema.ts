import { z } from "zod";

import { getPolicySections } from "@/lib/chat/policy-sections";

// Policy file and test-question rules, shared by the editor and its server actions.

export const MAX_POLICY_LENGTH = 200_000;
const MAX_TEST_QUESTION_LENGTH = 2000;

export const policyBodySchema = z
  .string()
  .trim()
  .min(1, "Write or upload the policy before saving")
  .max(MAX_POLICY_LENGTH, `Keep the policy under ${MAX_POLICY_LENGTH.toLocaleString("en-US")} characters`)
  .refine((body) => getPolicySections(body).length > 0, "Add at least one section heading: a line starting with # and a title, like “# Office hours”");

export const policyTestSchema = z.object({
  question: z.string().trim().min(1, "Enter a question a visitor might ask").max(MAX_TEST_QUESTION_LENGTH, `Keep the question under ${MAX_TEST_QUESTION_LENGTH} characters`),
  expectedOutcome: z.enum(["answer", "handoff"], "Choose what the assistant should do"),
  expectedSection: z.string().trim().max(200, "Keep the section title under 200 characters"),
});

export type PolicyTestInput = z.input<typeof policyTestSchema>;
