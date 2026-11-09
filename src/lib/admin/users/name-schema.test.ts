import { describe, expect, it } from "vitest";

import { getDisplayName, getInviteMessage, parseInviteNames, personNameSchema } from "@/lib/admin/users/name-schema";

// The same cases as 623's supabase/functions/_shared/owner-names_test.ts: [input, saved value or null].
const NAME_CASES: [string, string | null][] = [
  ["José", "José"],
  ["Smith-Jones", "Smith-Jones"],
  ["O'Neil", "O'Neil"],
  [" Ann ", "Ann"],
  ["Ann\t", "Ann"],
  [" Ann\n", "Ann"],
  [" Ann", "Ann"],
  ["a".repeat(100), "a".repeat(100)],
  ["𝒜".repeat(100), "𝒜".repeat(100)],
  ["", null],
  ["   ", null],
  ["\t", null],
  ["a".repeat(101), null],
  ["𝒜".repeat(101), null],
  ["A\nB", null],
  ["A\tB", null],
  ["A\u0085B", null],
];

describe("personNameSchema", () => {
  it.each(NAME_CASES)("reads %j as %j", (input, expected) => {
    // Arrange / Act
    const result = personNameSchema.safeParse(input);

    // Assert
    expect(result.success ? result.data : null).toBe(expected);
  });
});

describe("parseInviteNames", () => {
  it("gives both names trimmed when both follow the rule", () => {
    // Arrange / Act
    const parsed = parseInviteNames({ firstName: " Ann ", lastName: "Lee" });

    // Assert
    expect(parsed).toEqual({ isValid: true, names: { firstName: "Ann", lastName: "Lee" } });
  });

  it("names the first-name field when only it is wrong", () => {
    // Arrange / Act
    const parsed = parseInviteNames({ firstName: "  ", lastName: "Lee" });

    // Assert
    expect(parsed).toEqual({ isValid: false, fieldErrors: { firstName: "Enter a first name of up to 100 characters." } });
  });

  it("names the last-name field when it is missing", () => {
    // Arrange / Act
    const parsed = parseInviteNames({ firstName: "Ann" });

    // Assert
    expect(parsed).toEqual({ isValid: false, fieldErrors: { lastName: "Enter a last name of up to 100 characters." } });
  });

  it("names both fields when both are wrong", () => {
    // Arrange / Act
    const parsed = parseInviteNames({ firstName: "", lastName: "a".repeat(101) });

    // Assert
    expect(parsed).toEqual({
      isValid: false,
      fieldErrors: { firstName: "Enter a first name of up to 100 characters.", lastName: "Enter a last name of up to 100 characters." },
    });
  });
});

describe("getDisplayName", () => {
  it("joins the parts it has with one space", () => {
    // Arrange / Act
    const names = [getDisplayName({ first_name: "Ann", last_name: "Lee" }), getDisplayName({ first_name: " Ann ", last_name: "  " }), getDisplayName({}), getDisplayName(null)];

    // Assert
    expect(names).toEqual(["Ann Lee", "Ann", "", ""]);
  });
});

describe("getInviteMessage", () => {
  it("keeps today's message for a new login whose name was saved", () => {
    // Arrange / Act
    const message = getInviteMessage({ email: "a@b.co", isNew: true, keptName: null, isNameSaved: true });

    // Assert
    expect(message).toBe("Invite sent to a@b.co.");
  });

  it("keeps today's message for an existing login whose name was filled", () => {
    // Arrange / Act
    const message = getInviteMessage({ email: "a@b.co", isNew: false, keptName: null, isNameSaved: true });

    // Assert
    expect(message).toBe("a@b.co already had an account and now has access.");
  });

  it("says which name was kept", () => {
    // Arrange / Act
    const message = getInviteMessage({ email: "a@b.co", isNew: false, keptName: "Ann Lee", isNameSaved: true });

    // Assert
    expect(message).toBe("a@b.co already had an account and now has access. Their name stays as Ann Lee.");
  });

  it("says when the name couldn't be saved", () => {
    // Arrange / Act
    const message = getInviteMessage({ email: "a@b.co", isNew: true, keptName: null, isNameSaved: false });

    // Assert
    expect(message).toBe("Invite sent to a@b.co. Their name couldn't be saved; use Add name in the list.");
  });
});
