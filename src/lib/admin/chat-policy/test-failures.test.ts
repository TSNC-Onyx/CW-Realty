import { describe, expect, it } from "vitest";

import { getFailureHelp } from "@/lib/admin/chat-policy/test-failures";
import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

const OWNER_RESULT: PolicyTestResult = { question: "Am I talking to a real person?", expectedOutcome: "answer", expectedSection: "About this chat assistant", isBuiltIn: false, outcome: "handoff", reply: "No, I'm an AI helper.", citedSections: [], isPassed: false, isApprovedWording: false };

describe("getFailureHelp", () => {
  it("offers to accept a friendly reply the AI wrote, or to expect a person instead", () => {
    // Arrange / Act
    const help = getFailureHelp(OWNER_RESULT);

    // Assert
    expect({ kind: help.kind, fixes: help.questionFixes, isOwnerFixable: help.isOwnerFixable }).toEqual({ kind: "offered_person", fixes: ["accept_friendly_reply", "expect_handoff"], isOwnerFixable: true });
  });

  it("offers no friendly-reply fix when the assistant used the approved 'a person will help' line", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, isApprovedWording: true });

    // Assert
    expect(help.questionFixes).toEqual(["expect_handoff"]);
  });

  it("offers to accept the section the answer used, or any section", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, outcome: "answer", citedSections: ["Our team"] });

    // Assert
    expect({ kind: help.kind, fixes: help.questionFixes }).toEqual({ kind: "wrong_section", fixes: ["accept_cited_section", "any_section"] });
  });

  it("names a missing phrase when the answer is otherwise right, with no question fix", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, outcome: "answer", citedSections: ["About this chat assistant"], missingPhrases: ["AI"] });

    // Assert
    expect({ kind: help.kind, fixes: help.questionFixes, canEditSection: help.canEditSection }).toEqual({ kind: "missing_phrase", fixes: [], canEditSection: true });
  });

  it("never lets the owner change a built-in safety check, and says the developer was notified", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, isBuiltIn: true });

    // Assert
    expect({ kind: help.kind, isOwnerFixable: help.isOwnerFixable, fixes: help.questionFixes, mentionsDeveloper: help.why.includes("developer has been notified") }).toEqual({ kind: "safety_check", isOwnerFixable: false, fixes: [], mentionsDeveloper: true });
  });

  it("treats a missing reply as a connection problem, not the owner's to fix", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, outcome: null });

    // Assert
    expect({ kind: help.kind, isOwnerFixable: help.isOwnerFixable }).toEqual({ kind: "no_reply", isOwnerFixable: false });
  });

  it("names the wrong outcome first when the reply also left out a phrase", () => {
    // Arrange / Act
    const help = getFailureHelp({ ...OWNER_RESULT, missingPhrases: ["AI"] });

    // Assert
    expect({ kind: help.kind, hasFixes: help.questionFixes.length > 0 }).toEqual({ kind: "offered_person", hasFixes: true });
  });
});

