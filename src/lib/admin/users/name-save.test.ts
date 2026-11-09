import { describe, expect, it, vi } from "vitest";

import type { AdminContext } from "@/lib/admin/require-admin";
import { saveName, type UpdateUser } from "@/lib/admin/users/name-save";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const VALID = { userId: USER_ID, firstName: " Ann ", lastName: "Lee" };

type Lookup = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

/** A memberships query that records its filters and answers with `lookup`. */
function getFakeSupabase(lookup: Lookup) {
  const filters: [string, string][] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      filters.push([column, value]);
      return query;
    },
    then: (resolve: (value: Lookup) => unknown) => Promise.resolve(lookup).then(resolve),
  };
  const supabase = { from: vi.fn(() => query) } as unknown as AdminContext["supabase"];
  return { supabase, filters };
}

function getUpdateUser(error: { name: string; message: string } | null = null) {
  return vi.fn<UpdateUser>(() => Promise.resolve({ error }));
}

const MEMBER: Lookup = { data: [{ id: "m-1" }], error: null };

describe("saveName", () => {
  it("saves the trimmed name, sending only the two keys", async () => {
    // Arrange
    const { supabase } = getFakeSupabase(MEMBER);
    const updateUser = getUpdateUser();

    // Act
    const result = await saveName({ supabase, tenantId: TENANT_ID, updateUser }, VALID);

    // Assert
    expect(result).toEqual({ status: "success", message: "Name saved." });
    expect(updateUser).toHaveBeenCalledWith(USER_ID, { user_metadata: { first_name: "Ann", last_name: "Lee" } });
  });

  it("checks the membership in this tenant for that person", async () => {
    // Arrange
    const { supabase, filters } = getFakeSupabase(MEMBER);

    // Act
    await saveName({ supabase, tenantId: TENANT_ID, updateUser: getUpdateUser() }, VALID);

    // Assert
    expect(filters).toEqual([["tenant_id", TENANT_ID], ["user_id", USER_ID]]);
  });

  it("refuses someone with no access here and saves nothing", async () => {
    // Arrange
    const { supabase } = getFakeSupabase({ data: [], error: null });
    const updateUser = getUpdateUser();

    // Act
    const result = await saveName({ supabase, tenantId: TENANT_ID, updateUser }, VALID);

    // Assert
    expect(result).toEqual({ status: "error", message: "That person no longer has access here." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses a name that breaks the rule and saves nothing", async () => {
    // Arrange
    const { supabase } = getFakeSupabase(MEMBER);
    const updateUser = getUpdateUser();

    // Act
    const result = await saveName({ supabase, tenantId: TENANT_ID, updateUser }, { ...VALID, lastName: "A\nB" });

    // Assert
    expect(result).toEqual({ status: "error", message: "Enter a first and last name of up to 100 characters." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("says plainly when the sign-in service refuses the save", async () => {
    // Arrange
    const { supabase } = getFakeSupabase(MEMBER);

    // Act
    const result = await saveName({ supabase, tenantId: TENANT_ID, updateUser: getUpdateUser({ name: "AuthApiError", message: "down" }) }, VALID);

    // Assert
    expect(result).toEqual({ status: "error", message: "The name couldn't be saved. Try again." });
  });

  it("reports a failed membership lookup instead of saving", async () => {
    // Arrange
    const { supabase } = getFakeSupabase({ data: null, error: { code: "XX000", message: "down" } });
    const updateUser = getUpdateUser();

    // Act
    const result = await saveName({ supabase, tenantId: TENANT_ID, updateUser }, VALID);

    // Assert
    expect(result.status).toBe("error");
    expect(updateUser).not.toHaveBeenCalled();
  });
});
