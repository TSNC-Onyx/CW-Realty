import { describe, expect, it } from "vitest";

import { DEFAULT_CHAT_LIST_STATE, getChatListHref, getChatListState, getSearchPattern, getSearchText, getSortChange, getSortLabel, MAX_SEARCH_LENGTH } from "@/lib/admin/chats/list-state";

describe("getChatListState", () => {
  it("opens newest first with no search or filter when the address has nothing", () => {
    // Arrange
    const params = {};

    // Act
    const state = getChatListState(params);

    // Assert
    expect(state).toEqual(DEFAULT_CHAT_LIST_STATE);
  });

  it("reads every setting from the address", () => {
    // Arrange
    const params = { show: "handoffs", q: "rentals", sort: "details", dir: "asc", span: "month" };

    // Act
    const state = getChatListState(params);

    // Assert
    expect(state).toEqual({ filter: "handoffs", search: "rentals", sort: "details", direction: "asc", span: "month" });
  });

  it("falls back to the defaults for edited or unknown values", () => {
    // Arrange
    const params = { show: "everything", sort: "price", dir: "up", span: "365" };

    // Act
    const state = getChatListState(params);

    // Assert
    expect(state).toEqual(DEFAULT_CHAT_LIST_STATE);
  });

  it("sorts questions A to Z when no direction is given", () => {
    // Arrange
    const params = { sort: "question" };

    // Act
    const state = getChatListState(params);

    // Assert
    expect(state.direction).toBe("asc");
  });

  it("uses the first value when a setting appears twice", () => {
    // Arrange
    const params = { q: ["first", "second"], sort: ["details", "date"] };

    // Act
    const state = getChatListState(params);

    // Assert
    expect([state.search, state.sort]).toEqual(["first", "details"]);
  });
});

describe("getSearchText", () => {
  it("trims spaces around the search", () => {
    // Arrange
    const rawSearch = "   open house  ";

    // Act
    const search = getSearchText(rawSearch);

    // Assert
    expect(search).toBe("open house");
  });

  it("removes asterisks and control characters, which can't be searched for", () => {
    // Arrange
    const rawSearch = "*rent*\u0000al\n";

    // Act
    const search = getSearchText(rawSearch);

    // Assert
    expect(search).toBe("rent  al");
  });

  it("cuts a long search to the limit", () => {
    // Arrange
    const rawSearch = "a".repeat(MAX_SEARCH_LENGTH + 50);

    // Act
    const search = getSearchText(rawSearch);

    // Assert
    expect(search).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("treats a search of only spaces or asterisks as no search", () => {
    // Arrange
    const rawSearches = ["   ", "***"];

    // Act
    const searches = rawSearches.map(getSearchText);

    // Assert
    expect(searches).toEqual(["", ""]);
  });
});

describe("getSearchPattern", () => {
  it("matches the text anywhere in a message", () => {
    // Arrange
    const search = "rent";

    // Act
    const pattern = getSearchPattern(search);

    // Assert
    expect(pattern).toBe("%rent%");
  });

  it("makes %, _ and backslash match only themselves", () => {
    // Arrange
    const search = "50%_off\\";

    // Act
    const pattern = getSearchPattern(search);

    // Assert
    expect(pattern).toBe("%50\\%\\_off\\\\%");
  });

  it("keeps commas, brackets, quotes and accents as plain text", () => {
    // Arrange
    const search = `Smith, "Jr." (café)`;

    // Act
    const pattern = getSearchPattern(search);

    // Assert
    expect(pattern).toBe(`%Smith, "Jr." (café)%`);
  });
});

describe("getChatListHref", () => {
  it("is the plain page address when everything is at its default", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const href = getChatListHref(state);

    // Assert
    expect(href).toBe("/admin/chats");
  });

  it("keeps the old Couldn't answer address working", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const href = getChatListHref(state, { filter: "handoffs" });

    // Assert
    expect(href).toBe("/admin/chats?show=handoffs");
  });

  it("carries every non-default setting, encoded safely", () => {
    // Arrange
    const state = { filter: "handoffs" as const, search: "rent & sell?", sort: "details" as const, direction: "asc" as const, span: "30" as const };

    // Act
    const href = getChatListHref(state);

    // Assert
    expect(href).toBe("/admin/chats?show=handoffs&q=rent+%26+sell%3F&sort=details&dir=asc&span=30");
  });

  it("round-trips through getChatListState", () => {
    // Arrange
    const state = { filter: "all" as const, search: "Smith, Jr.", sort: "question" as const, direction: "desc" as const, span: "month" as const };

    // Act
    const reread = getChatListState(Object.fromEntries(new URL(getChatListHref(state), "http://x").searchParams));

    // Assert
    expect(reread).toEqual(state);
  });

  it("never carries a page unless asked, so search, sort and filter changes start at page 1", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const href = getChatListHref(state, { search: "rentals" });

    // Assert
    expect(href).toBe("/admin/chats?q=rentals");
  });

  it("keeps the page when asked, and leaves out page 1", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const hrefs = [getChatListHref(state, { span: "30", page: 4 }), getChatListHref(state, { span: "30", page: 1 })];

    // Assert
    expect(hrefs).toEqual(["/admin/chats?span=30&page=4", "/admin/chats?span=30"]);
  });
});

describe("getSortChange", () => {
  it("reverses the column that is already sorted", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const change = getSortChange(state, "date");

    // Assert
    expect(change).toEqual({ sort: "date", direction: "asc" });
  });

  it("starts Question at A to Z and Details at most questions", () => {
    // Arrange
    const state = DEFAULT_CHAT_LIST_STATE;

    // Act
    const changes = [getSortChange(state, "question"), getSortChange(state, "details")];

    // Assert
    expect(changes).toEqual([
      { sort: "question", direction: "asc" },
      { sort: "details", direction: "desc" },
    ]);
  });
});

describe("getSortLabel", () => {
  it("names the current sort in words", () => {
    // Arrange
    const sort = { sort: "details" as const, direction: "asc" as const };

    // Act
    const label = getSortLabel(sort);

    // Assert
    expect(label).toBe("Fewest questions");
  });
});
