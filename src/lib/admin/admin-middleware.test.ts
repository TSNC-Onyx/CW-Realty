import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { middleware } from "../../../middleware";
import { checkAdminSession, type AdminSessionCheck } from "@/lib/admin/session-middleware";
import { fetchRedirectDecision } from "@/lib/redirects/lookup";

vi.mock("@/lib/redirects/lookup", () => ({ fetchRedirectDecision: vi.fn() }));
vi.mock("@/lib/admin/session-middleware", () => ({ checkAdminSession: vi.fn() }));

const SITE = "https://www.charliewardrealty.com";

function useSession(session: Partial<AdminSessionCheck>): void {
  vi.mocked(checkAdminSession).mockResolvedValue({ isSignedIn: false, isExpired: false, applyCookies: () => undefined, ...session });
}

describe("admin middleware", () => {
  beforeEach(() => {
    vi.mocked(fetchRedirectDecision).mockResolvedValue(null);
  });

  it("sends signed-out visitors to sign in and remembers where they were going", async () => {
    // Arrange
    useSession({ isSignedIn: false });

    // Act
    const response = await middleware(new NextRequest(`${SITE}/admin/listings?x=1`));

    // Assert
    expect(response.headers.get("location")).toBe(`${SITE}/admin/login?next=%2Fadmin%2Flistings%3Fx%3D1`);
  });

  it("ends an expired session with a timeout explanation", async () => {
    // Arrange
    useSession({ isSignedIn: true, isExpired: true });

    // Act
    const response = await middleware(new NextRequest(`${SITE}/admin/team`));

    // Assert
    expect(response.headers.get("location")).toBe(`${SITE}/admin/login?reason=timeout`);
  });

  it("lets the sign-in page load without a session and never caches admin pages", async () => {
    // Arrange
    useSession({ isSignedIn: false });

    // Act
    const response = await middleware(new NextRequest(`${SITE}/admin/login`));

    // Assert
    expect([response.headers.get("x-middleware-next"), response.headers.get("cache-control")]).toEqual(["1", "no-store"]);
  });

  it("allows WebAssembly (the photo converter) on admin pages only", async () => {
    // Arrange
    useSession({ isSignedIn: true });

    // Act
    const [adminResponse, publicResponse] = await Promise.all([middleware(new NextRequest(`${SITE}/admin`)), middleware(new NextRequest(`${SITE}/about`))]);

    // Assert
    const policies = [adminResponse, publicResponse].map((response) => response.headers.get("content-security-policy") ?? "");
    expect(policies.map((policy) => policy.includes("'wasm-unsafe-eval'"))).toEqual([true, false]);
  });
});
