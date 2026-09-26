import { describe, expect, it } from "vitest";

import { getEditorToday, getGreeting, getStaffToday, getWaitingText, type EditorCounts } from "@/lib/admin/dashboard-figures";

const EDITOR_COUNTS: EditorCounts = {
  unread: 3,
  oldestNewAt: "2026-09-25T16:00:00Z",
  activeRecipients: 2,
  liveListings: 6,
  draftListings: 1,
  shownMembers: 8,
  hiddenMembers: 1,
  trashItems: 0,
  people: 1,
  weekChats: 14,
  policySummary: "Version 1 is live",
  closedDeals: 0,
  trackingSummary: "Off — no tracking on the website",
};

describe("getGreeting", () => {
  it("says good afternoon at 2 PM in North Carolina", () => {
    // Arrange
    const now = new Date("2026-09-25T18:00:00Z");

    // Act
    const greeting = getGreeting(now);

    // Assert
    expect(greeting).toBe("Good afternoon");
  });

  it("says good evening at 9 PM in North Carolina even though it is the next day in UTC", () => {
    // Arrange
    const now = new Date("2026-09-26T01:00:00Z");

    // Act
    const greeting = getGreeting(now);

    // Assert
    expect(greeting).toBe("Good evening");
  });
});

describe("getWaitingText", () => {
  it("names how long the oldest new request has waited", () => {
    // Arrange
    const now = new Date("2026-09-25T18:30:00Z");

    // Act
    const text = getWaitingText({ oldestNewAt: "2026-09-25T16:00:00Z", now });

    // Assert
    expect(text).toBe("Oldest waiting 2 hours");
  });

  it("says nothing is waiting when no new request is open", () => {
    // Arrange
    const now = new Date("2026-09-25T18:30:00Z");

    // Act
    const text = getWaitingText({ oldestNewAt: null, now });

    // Assert
    expect(text).toBe("Nothing waiting");
  });
});

describe("getEditorToday", () => {
  it("flags new messages as needing action", () => {
    // Arrange
    const now = new Date("2026-09-25T18:30:00Z");

    // Act
    const figures = getEditorToday({ counts: EDITOR_COUNTS, now });

    // Assert
    expect(figures.find((figure) => figure.key === "inbox")?.isActionNeeded).toBe(true);
  });

  it("flags an empty alert list as needing action", () => {
    // Arrange
    const now = new Date("2026-09-25T18:30:00Z");

    // Act
    const figures = getEditorToday({ counts: { ...EDITOR_COUNTS, activeRecipients: 0 }, now });

    // Assert
    expect(figures.find((figure) => figure.key === "notifications")).toMatchObject({ isActionNeeded: true, detail: "Nobody gets alerts yet" });
  });
});

describe("getStaffToday", () => {
  it("shows staff only their own two inbox figures", () => {
    // Arrange
    const counts = { waitingReply: 2, assignedOpen: 5 };

    // Act
    const figures = getStaffToday(counts);

    // Assert
    expect(figures.map((figure) => figure.value)).toEqual([2, 5]);
  });
});
