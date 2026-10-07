import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Why a test failed, in plain words, who can fix it, and which one-click fixes fit
// (docs/cwr-chat-quick-answers-and-tests-plan.md §E; NN/g error messages: what happened and
// how to fix it, next to the cause; Google PAIR: tell system errors from the user's).
// Safe in the browser: imports nothing server-only.

export type FailureKind = "safety_check" | "no_reply" | "missing_phrase" | "offered_person" | "answered_instead" | "wrong_section";

/** A one-click fix the owner can make to the question itself (each has Undo). */
export type QuestionFix = "accept_friendly_reply" | "expect_handoff" | "expect_answer" | "accept_cited_section" | "any_section";

/** How the owner can respond: change the question, open the section in the editor, or ask the test chat. */
export type FailureHelp = { kind: FailureKind; why: string; isOwnerFixable: boolean; questionFixes: QuestionFix[]; canEditSection: boolean; canTryInChat: boolean };

const WHY_TEXT: Record<FailureKind, string> = {
  safety_check: "A built-in safety check failed. This isn't something the policy text can fix. Your developer has been notified automatically.",
  no_reply: "The assistant didn't reply, usually a brief connection problem. Run the tests again. If it keeps happening, your developer is notified automatically.",
  missing_phrase: "The reply left out words you asked it to mention.",
  offered_person: "The assistant offered a person instead of answering.",
  answered_instead: "The assistant answered, but you expected it to offer a person.",
  wrong_section: "The assistant answered, but from a different section than you expected.",
};

/** The answer cited what was expected (or anything, when no section was expected). */
function hasExpectedSection(result: PolicyTestResult): boolean {
  return result.expectedSection === null || getMatchingSection(result.citedSections, result.expectedSection) !== null;
}

/** The first thing to fix: the outcome, then the section, then the phrases (each fix may clear the rest). */
function getFailureKind(result: PolicyTestResult): FailureKind {
  if (result.isBuiltIn) return "safety_check";
  if (result.outcome === null) return "no_reply";
  if (result.expectedOutcome === "answer" && result.outcome === "handoff") return "offered_person";
  if (result.expectedOutcome === "handoff" && result.outcome === "answer") return "answered_instead";
  if (result.outcome === "answer" && !hasExpectedSection(result)) return "wrong_section";
  return "missing_phrase";
}

/** The AI wrote this hand-off in its own words: accepting it as "a friendly reply is fine" makes sense. */
function isFriendlyReply(result: PolicyTestResult): boolean {
  return result.outcome === "handoff" && result.isApprovedWording === false;
}

function getQuestionFixes(result: PolicyTestResult, kind: FailureKind): QuestionFix[] {
  if (kind === "offered_person") return [...(isFriendlyReply(result) ? (["accept_friendly_reply"] as const) : []), "expect_handoff"];
  if (kind === "answered_instead") return ["expect_answer"];
  if (kind === "wrong_section") return [...(result.citedSections.length > 0 ? (["accept_cited_section"] as const) : []), "any_section"];
  return [];
}

export function getFailureHelp(result: PolicyTestResult): FailureHelp {
  const kind = getFailureKind(result);
  const isOwnerFixable = kind !== "safety_check" && kind !== "no_reply";
  const hasSection = result.expectedSection !== null || result.citedSections.length > 0;
  return { kind, why: WHY_TEXT[kind], isOwnerFixable, questionFixes: getQuestionFixes(result, kind), canEditSection: isOwnerFixable && hasSection, canTryInChat: isOwnerFixable };
}
