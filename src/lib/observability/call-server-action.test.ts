import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import { IDLE_ACTION_STATE, type ActionState } from "@/lib/admin/action-state";
import { callQuickAction, getCallFailure, withCallReporting, withCallReportingFor } from "@/lib/observability/call-server-action";

const { reportClientProblem, reportVisitorClientProblem } = vi.hoisted(() => ({
  reportClientProblem: vi.fn(async (): Promise<string | null> => null),
  reportVisitorClientProblem: vi.fn(async () => undefined),
}));

vi.mock("@/lib/observability/report-client-problem", () => ({ reportClientProblem, reportVisitorClientProblem }));

const STALE_ACTION_ERROR = new Error('Failed to find Server Action "abc123". This request might be from an older or newer deployment.');

function getFormData(): FormData {
  const formData = new FormData();
  formData.set("email", "staff@example.com");
  return formData;
}

function getThrowingAction<State = ActionState>(error: unknown): (state: State, formData: FormData) => Promise<State> {
  return async () => {
    throw error;
  };
}

describe("failed server action calls", () => {
  it("recognise a page left open across a site update", () => {
    // Act
    const failure = getCallFailure(new Error('Failed to find Server Action "abc123". This request might be from an older or newer deployment.'));

    // Assert
    expect(failure.code).toBe("stale_page");
  });

  it("recognise a dropped connection", () => {
    // Act
    const failure = getCallFailure(new TypeError("Failed to fetch"));

    // Assert
    expect(failure.code).toBe("network");
  });

  it("treat anything else as a system fault", () => {
    // Act
    const failure = getCallFailure(new Error("Unexpected response"));

    // Assert
    expect(failure.severity).toBe("error");
  });
});

describe("calling a one-click action", () => {
  it("lets a redirect (such as to sign-in) through instead of recording it as a problem", async () => {
    // Act
    const call = callQuickAction("homework.move", async () => redirect("/admin/login"));

    // Assert
    await expect(call).rejects.toThrow("NEXT_REDIRECT");
  });

  it("turns a dropped connection into a message", async () => {
    // Act
    const result = await callQuickAction("homework.move", async () => {
      throw new TypeError("Failed to fetch");
    });

    // Assert
    expect(result).toEqual({ status: "error", message: "Connection problem. Check your internet and try again." });
  });
});

// Pins today's behaviour of the admin wrapper (docs/cwr-stale-quick-check-addendum.md §2):
// every admin form relies on it staying exactly the same.
describe("an admin form call that fails", () => {
  it("shows an error with the reference code when one comes back", async () => {
    // Arrange
    reportClientProblem.mockResolvedValueOnce("CWR-ABC-123");
    const action = withCallReporting("listings.update", getThrowingAction(new Error("Unexpected response")));

    // Act
    const state = await action(IDLE_ACTION_STATE, getFormData());

    // Assert
    expect(state.message).toBe("That didn't work. Refresh the page and try again. (Ref CWR-ABC-123)");
  });

  it("keeps what was typed", async () => {
    // Arrange
    const action = withCallReporting("listings.update", getThrowingAction(new TypeError("Failed to fetch")));

    // Act
    const state = await action(IDLE_ACTION_STATE, getFormData());

    // Assert
    expect(state.values).toEqual({ email: "staff@example.com" });
  });

  it("keeps the site-updated message for a page left open across a release", async () => {
    // Arrange
    const action = withCallReporting("listings.update", getThrowingAction(STALE_ACTION_ERROR));

    // Act
    const state = await action(IDLE_ACTION_STATE, getFormData());

    // Assert
    expect(state).toMatchObject({ status: "error", message: "The site was just updated. Refresh the page, then try again." });
  });

  it("never asks the page to refresh itself", async () => {
    // Arrange
    const action = withCallReporting("listings.update", getThrowingAction(STALE_ACTION_ERROR));

    // Act
    const state = await action(IDLE_ACTION_STATE, getFormData());

    // Assert
    expect(state.recovery).toBeUndefined();
  });

  it("lets a redirect through instead of recording it", async () => {
    // Arrange
    const action = withCallReporting("listings.update", async () => redirect("/admin/login"));

    // Act
    const call = action(IDLE_ACTION_STATE, getFormData());

    // Assert
    await expect(call).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("a website visitor's form call that fails", () => {
  it("hands the failure to the form without a reference code", async () => {
    // Arrange
    const action = withCallReportingFor({ action: "site.contact_form", mode: "visitor", onFailure: (failure) => failure.message }, getThrowingAction<string>(STALE_ACTION_ERROR));

    // Act
    const message = await action("", getFormData());

    // Assert
    expect(message).toBe("The site was just updated. Refresh the page, then try again.");
  });

  it("records it as a visitor report, never under a team member", async () => {
    // Arrange
    reportClientProblem.mockClear();
    const action = withCallReportingFor({ action: "site.contact_form", mode: "visitor", onFailure: (failure) => failure.code }, getThrowingAction<string>(new TypeError("Failed to fetch")));

    // Act
    await action("", getFormData());

    // Assert
    expect(reportClientProblem).not.toHaveBeenCalled();
  });
});
