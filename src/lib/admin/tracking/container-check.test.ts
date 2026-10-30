import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchContainerStatus, getContainerCheckOrigin, reportContainerStatus } from "@/lib/admin/tracking/container-check";

const reportProblem = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));

function stubGoogleAnswer(status: number) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Answers only when the request is cancelled, like a Google that never replies.
function stubSilentGoogle() {
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => (init.signal?.aborted ? Promise.reject(init.signal.reason) : new Promise(() => undefined))));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  reportProblem.mockReset();
});

describe("fetchContainerStatus", () => {
  it("treats a 200 answer as a published container", async () => {
    // Arrange
    stubGoogleAnswer(200);

    // Act
    const status = await fetchContainerStatus("GTM-AB12CD3");

    // Assert
    expect(status).toBe("published");
  });

  it("treats a 404 answer as a container Google can't find", async () => {
    // Arrange
    stubGoogleAnswer(404);

    // Act
    const status = await fetchContainerStatus("GTM-AB12CD3");

    // Assert
    expect(status).toBe("not_found");
  });

  it("treats any other answer as unknown", async () => {
    // Arrange
    const answers = [500, 403, 302];

    // Act
    const statuses = [];
    for (const httpStatus of answers) {
      stubGoogleAnswer(httpStatus);
      statuses.push(await fetchContainerStatus("GTM-AB12CD3"));
    }

    // Assert
    expect(statuses).toEqual(["unknown", "unknown", "unknown"]);
  });

  it("reports unknown when Google doesn't answer in time", async () => {
    // Arrange
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("Timed out", "TimeoutError")));
    stubSilentGoogle();

    // Act
    const status = await fetchContainerStatus("GTM-AB12CD3");

    // Assert
    expect({ status, limitMs: timeout.mock.calls[0]?.[0] }).toEqual({ status: "unknown", limitMs: 3000 });
  });

  it("asks Google's script address with the ID encoded", async () => {
    // Arrange
    const fetchMock = stubGoogleAnswer(200);

    // Act
    await fetchContainerStatus("GTM-A&B");

    // Assert
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-A%26B");
  });
});

describe("getContainerCheckOrigin", () => {
  it("uses a check address only when it is on this computer", () => {
    // Arrange
    const values = [undefined, "http://127.0.0.1:9", "http://localhost:4000/path", "https://evil.example.com", "http://127.0.0.1.example.com", "not an address"];

    // Act
    const origins = values.map(getContainerCheckOrigin);

    // Assert
    expect(origins).toEqual([
      "https://www.googletagmanager.com",
      "http://127.0.0.1:9",
      "http://localhost:4000",
      "https://www.googletagmanager.com",
      "https://www.googletagmanager.com",
      "https://www.googletagmanager.com",
    ]);
  });
});

describe("reportContainerStatus", () => {
  it("records a warning when Google can't find the container", async () => {
    // Act
    await reportContainerStatus({ action: "tracking.save", status: "not_found" });

    // Assert
    expect(reportProblem).toHaveBeenCalledWith({ action: "tracking.save", stage: "external", severity: "warning", code: "container_not_published" });
  });

  it("records nothing for a published container", async () => {
    // Act
    await reportContainerStatus({ action: "tracking.load", status: "published" });

    // Assert
    expect(reportProblem).not.toHaveBeenCalled();
  });
});
