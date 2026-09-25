import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRedirectDecision, getTeamMemberSlug, isRedirectCandidate } from "@/lib/redirects/lookup";
import { SupabaseQueryError, getPublicClient, type PublicClient } from "@/lib/supabase/public-client";

vi.mock("@/lib/supabase/public-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/public-client")>()),
  getPublicClient: vi.fn(),
}));

type StubResults = {
  redirect?: { target_path: string; status_code: 301 | 308 } | null;
  tenant?: { id: string } | null;
  isHidden?: boolean;
  error?: { message: string };
};

// A stand-in for the Supabase client that records which tables and functions were asked.
function getStubClient(results: StubResults): { calls: string[]; client: PublicClient } {
  const calls: string[] = [];
  const getRows = (table: string) => (table === "redirects" ? results.redirect : results.tenant) ?? null;
  const getQuery = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: results.error ? null : getRows(table), error: results.error ?? null }),
    };
    return query;
  };
  const client = {
    from: (table: string) => {
      calls.push(table);
      return getQuery(table);
    },
    rpc: async (name: string) => {
      calls.push(name);
      return { data: results.isHidden ?? false, error: null };
    },
  };
  return { calls, client: client as unknown as PublicClient };
}

function useStubClient(results: StubResults): string[] {
  const { calls, client } = getStubClient(results);
  vi.mocked(getPublicClient).mockReturnValue(client);
  return calls;
}

describe("isRedirectCandidate", () => {
  it.each([
    ["/faq", true],
    ["/copy-of-russell-casey", true],
    ["/team/charlie-ward", true],
    ["/about", false],
    ["/admin/listings", false],
    ["/brand/cwr-logo-120.webp", false],
    ["/Upper-Case", false],
    [`/${"a".repeat(200)}`, false],
  ])("%s → %s", (path, expected) => {
    // Arrange
    const candidate = path;

    // Act
    const isCandidate = isRedirectCandidate(candidate);

    // Assert
    expect(isCandidate).toBe(expected);
  });
});

describe("getTeamMemberSlug", () => {
  it("reads the slug from a team member path only", () => {
    // Arrange
    const paths = ["/team/charlie-ward", "/team", "/team/charlie-ward/extra"];

    // Act
    const slugs = paths.map(getTeamMemberSlug);

    // Assert
    expect(slugs).toEqual(["charlie-ward", null, null]);
  });
});

describe("fetchRedirectDecision", () => {
  beforeEach(() => {
    vi.mocked(getPublicClient).mockReset();
  });

  it("never asks the database about a known page", async () => {
    // Arrange
    const calls = useStubClient({});

    // Act
    const decision = await fetchRedirectDecision("/contact");

    // Assert
    expect({ decision, calls }).toEqual({ decision: null, calls: [] });
  });

  it("returns a stored redirect", async () => {
    // Arrange
    useStubClient({ redirect: { target_path: "/resources", status_code: 301 } });

    // Act
    const decision = await fetchRedirectDecision("/faq");

    // Assert
    expect(decision).toEqual({ targetPath: "/resources", status: 301 });
  });

  it("sends a hidden team member's page to /team with a temporary 302", async () => {
    // Arrange
    useStubClient({ redirect: null, tenant: { id: "tenant-1" }, isHidden: true });

    // Act
    const decision = await fetchRedirectDecision("/team/jane-smith");

    // Assert
    expect(decision).toEqual({ targetPath: "/team", status: 302 });
  });

  it("serves a visible team member's page", async () => {
    // Arrange
    useStubClient({ redirect: null, tenant: { id: "tenant-1" }, isHidden: false });

    // Act
    const decision = await fetchRedirectDecision("/team/charlie-ward");

    // Assert
    expect(decision).toBeNull();
  });

  it("checks only the redirect table for pages outside /team", async () => {
    // Arrange
    const calls = useStubClient({ redirect: null });

    // Act
    await fetchRedirectDecision("/no-such-page");

    // Assert
    expect(calls).toEqual(["redirects"]);
  });

  it("reports a database error as a typed error", async () => {
    // Arrange
    useStubClient({ error: { message: "connection refused" } });

    // Act
    const lookup = fetchRedirectDecision("/faq");

    // Assert
    await expect(lookup).rejects.toBeInstanceOf(SupabaseQueryError);
  });

  it("skips lookups when the site has no database settings", async () => {
    // Arrange
    vi.mocked(getPublicClient).mockReturnValue(null);

    // Act
    const decision = await fetchRedirectDecision("/faq");

    // Assert
    expect(decision).toBeNull();
  });
});
