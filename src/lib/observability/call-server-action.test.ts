import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import { callQuickAction, getCallFailure } from "@/lib/observability/call-server-action";

const { reportClientProblem } = vi.hoisted(() => ({ reportClientProblem: vi.fn(async () => null) }));

vi.mock("@/lib/observability/report-client-problem", () => ({ reportClientProblem }));

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
