import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Browser-only module: a document that records every cookie write and a fetch the test answers
// stand in. Each test loads a fresh copy so a call in flight never leaks between tests.

const ACCEPT = "cwr_consent=accept; Path=/";
const REJECT = "cwr_consent=reject; Path=/";

type PendingCall = { body: string; cookieAtCall: string; answer: () => void; fail: () => void };

let cookieWrites: string[] = [];
let pendingCalls: PendingCall[] = [];

async function loadConsentSync() {
  vi.resetModules();
  return import("@/lib/tracking/consent-sync");
}

function stubBrowser(): void {
  const fakeDocument = {
    get cookie() {
      return cookieWrites.at(-1) ?? "";
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  };
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", { sessionStorage: { getItem: () => null }, dispatchEvent: () => true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          pendingCalls.push({ body: String(init.body), cookieAtCall: fakeDocument.cookie, answer: () => resolve(new Response(null, { status: 204 })), fail: () => reject(new TypeError("offline")) });
        }),
    ),
  );
}

/** Lets the sync loop reach its next call. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  cookieWrites = [];
  pendingCalls = [];
  stubBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendConsentToServer", () => {
  it("sends the newest choice last when the choice changes during a call", async () => {
    // Arrange
    const { sendConsentToServer } = await loadConsentSync();
    const sending = sendConsentToServer({ cookieString: ACCEPT });
    await settle();

    // Act
    void sendConsentToServer({ cookieString: REJECT });
    pendingCalls[0]?.answer();
    await settle();
    pendingCalls[1]?.answer();
    await sending;

    // Assert
    expect(pendingCalls.map((call) => call.cookieAtCall)).toEqual([ACCEPT, REJECT]);
  });

  it("makes one call for one choice", async () => {
    // Arrange
    const { sendConsentToServer } = await loadConsentSync();

    // Act
    const sending = sendConsentToServer({ cookieString: ACCEPT });
    await settle();
    pendingCalls[0]?.answer();
    await sending;

    // Assert
    expect({ calls: pendingCalls.length, body: pendingCalls[0]?.body }).toEqual({ calls: 1, body: JSON.stringify({ attribution: "" }) });
  });

  it("keeps the browser's own cookie when the call fails", async () => {
    // Arrange
    const { sendConsentToServer } = await loadConsentSync();
    cookieWrites.push(ACCEPT);

    // Act
    const sending = sendConsentToServer({ cookieString: ACCEPT });
    await settle();
    pendingCalls[0]?.fail();
    await sending;

    // Assert
    expect(cookieWrites.at(-1)).toBe(ACCEPT);
  });

  it("a page-load call never rewrites the consent cookie", async () => {
    // Arrange
    const { sendConsentToServer } = await loadConsentSync();

    // Act
    const sending = sendConsentToServer();
    await settle();
    pendingCalls[0]?.answer();
    await sending;

    // Assert
    expect({ calls: pendingCalls.length, cookieWrites }).toEqual({ calls: 1, cookieWrites: [] });
  });

  it("stops waiting after 3 seconds in total", async () => {
    // Arrange
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const { sendConsentToServer } = await loadConsentSync();
    const sending = sendConsentToServer({ cookieString: ACCEPT });
    await settle();
    void sendConsentToServer({ cookieString: REJECT });
    pendingCalls[0]?.answer();
    await settle();

    // Act
    deadline.abort(new DOMException("Timed out", "TimeoutError"));
    await sending;

    // Assert
    expect({ deadlines: timeout.mock.calls, calls: pendingCalls.length }).toEqual({ deadlines: [[3000]], calls: 2 });
  });
});
