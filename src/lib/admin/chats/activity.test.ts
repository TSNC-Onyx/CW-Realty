import { describe, expect, it } from "vitest";

import { getActivityFigures, getActivitySpan, getAnsweredRate, getSpanRanges, type ActivityCounts, type ChatActivity } from "@/lib/admin/chats/activity";
import { getLoaded, getLoadFailure } from "@/lib/admin/load-result";

const COUNTS: ActivityCounts = { chats: 12, sentToInbox: 3, typedReplies: 20, typedAnswers: 17 };

function getIsoRanges(ranges: ReturnType<typeof getSpanRanges>) {
  return {
    current: [ranges.current.from.toISOString(), ranges.current.to.toISOString()],
    previous: [ranges.previous.from.toISOString(), ranges.previous.to.toISOString()],
  };
}

describe("getActivitySpan", () => {
  it("reads each known span", () => {
    // Arrange
    const rawSpans = ["7", "30", "90", "month"];

    // Act
    const spans = rawSpans.map(getActivitySpan);

    // Assert
    expect(spans).toEqual(["7", "30", "90", "month"]);
  });

  it("falls back to 7 days for a missing or edited span", () => {
    // Arrange
    const rawSpans = [undefined, "", "14", "MONTH"];

    // Act
    const spans = rawSpans.map(getActivitySpan);

    // Assert
    expect(spans).toEqual(["7", "7", "7", "7"]);
  });
});

describe("getSpanRanges", () => {
  it("compares the last 7 days with the 7 days before them", () => {
    // Arrange
    const now = new Date("2026-10-22T19:15:00Z");

    // Act
    const ranges = getIsoRanges(getSpanRanges("7", now));

    // Assert
    expect(ranges).toEqual({
      current: ["2026-10-15T19:15:00.000Z", "2026-10-22T19:15:00.000Z"],
      previous: ["2026-10-08T19:15:00.000Z", "2026-10-15T19:15:00.000Z"],
    });
  });

  it("compares 90 days with the 90 days before them", () => {
    // Arrange
    const now = new Date("2026-10-22T19:15:00Z");

    // Act
    const ranges = getIsoRanges(getSpanRanges("90", now));

    // Assert
    expect(ranges.previous).toEqual(["2026-04-25T19:15:00.000Z", "2026-07-24T19:15:00.000Z"]);
  });

  it("compares this month so far with last month up to the same day and time, in Eastern time", () => {
    // Arrange
    const now = new Date("2026-10-22T19:15:00Z"); // 3:15 PM Eastern

    // Act
    const ranges = getIsoRanges(getSpanRanges("month", now));

    // Assert
    expect(ranges).toEqual({
      current: ["2026-10-01T04:00:00.000Z", "2026-10-22T19:15:00.000Z"],
      previous: ["2026-09-01T04:00:00.000Z", "2026-09-22T19:15:00.000Z"],
    });
  });

  it("keeps the same wall-clock time when daylight saving ended in between", () => {
    // Arrange
    const now = new Date("2026-11-15T20:00:00Z"); // 3 PM Eastern standard time

    // Act
    const ranges = getIsoRanges(getSpanRanges("month", now));

    // Assert
    expect(ranges).toEqual({
      current: ["2026-11-01T04:00:00.000Z", "2026-11-15T20:00:00.000Z"],
      previous: ["2026-10-01T04:00:00.000Z", "2026-10-15T19:00:00.000Z"],
    });
  });

  it("uses all of a shorter last month when today's date is past its end", () => {
    // Arrange
    const now = new Date("2027-03-31T16:00:00Z");

    // Act
    const ranges = getIsoRanges(getSpanRanges("month", now));

    // Assert
    expect(ranges.previous).toEqual(["2027-02-01T05:00:00.000Z", "2027-03-01T05:00:00.000Z"]);
  });

  it("compares January with December of the year before", () => {
    // Arrange
    const now = new Date("2027-01-10T17:00:00Z");

    // Act
    const ranges = getIsoRanges(getSpanRanges("month", now));

    // Assert
    expect(ranges.previous).toEqual(["2026-12-01T05:00:00.000Z", "2026-12-10T17:00:00.000Z"]);
  });

  it("counts the first Eastern evening of a month in the new month, though UTC is a day ahead", () => {
    // Arrange
    const now = new Date("2026-11-01T02:00:00Z"); // Oct 31, 10 PM Eastern

    // Act
    const ranges = getIsoRanges(getSpanRanges("month", now));

    // Assert
    expect(ranges.current[0]).toBe("2026-10-01T04:00:00.000Z");
  });
});

describe("getAnsweredRate", () => {
  it("is the whole-number percent of typed replies that answered", () => {
    // Arrange
    const counts = { ...COUNTS, typedReplies: 3, typedAnswers: 2 };

    // Act
    const rate = getAnsweredRate(counts);

    // Assert
    expect(rate).toBe(67);
  });

  it("is null when there were no typed replies", () => {
    // Arrange
    const counts = { ...COUNTS, typedReplies: 0, typedAnswers: 0 };

    // Act
    const rate = getAnsweredRate(counts);

    // Assert
    expect(rate).toBeNull();
  });
});

describe("getActivityFigures", () => {
  it("shows each figure with its change from the previous span in words", () => {
    // Arrange
    const activity: ChatActivity = { current: COUNTS, previous: { chats: 9, sentToInbox: 3, typedReplies: 10, typedAnswers: 9 } };

    // Act
    const figures = getActivityFigures({ activity: getLoaded(activity), span: "7" });

    // Assert
    expect(figures.map(({ value, change }) => [value, change])).toEqual([
      ["12", "Up 3 from the previous 7 days"],
      ["85%", "Down 5 points from the previous 7 days"],
      ["3", "Same as the previous 7 days"],
    ]);
  });

  it("names last month for the This month span", () => {
    // Arrange
    const activity: ChatActivity = { current: COUNTS, previous: { ...COUNTS, chats: 13 } };

    // Act
    const figures = getActivityFigures({ activity: getLoaded(activity), span: "month" });

    // Assert
    expect(figures[0]?.change).toBe("Down 1 from the same days last month");
  });

  it("says one point, not one points", () => {
    // Arrange
    const activity: ChatActivity = { current: { ...COUNTS, typedReplies: 100, typedAnswers: 81 }, previous: { ...COUNTS, typedReplies: 100, typedAnswers: 80 } };

    // Act
    const figures = getActivityFigures({ activity: getLoaded(activity), span: "30" });

    // Assert
    expect(figures[1]?.change).toBe("Up 1 point from the previous 30 days");
  });

  it("shows a dash when no one typed a question in the span", () => {
    // Arrange
    const activity: ChatActivity = { current: { ...COUNTS, typedReplies: 0, typedAnswers: 0 }, previous: COUNTS };

    // Act
    const figures = getActivityFigures({ activity: getLoaded(activity), span: "7" });

    // Assert
    expect([figures[1]?.value, figures[1]?.change]).toEqual(["—", "No typed questions"]);
  });

  it("says so when the previous span had no typed questions to compare with", () => {
    // Arrange
    const activity: ChatActivity = { current: COUNTS, previous: { ...COUNTS, typedReplies: 0, typedAnswers: 0 } };

    // Act
    const figures = getActivityFigures({ activity: getLoaded(activity), span: "90" });

    // Assert
    expect([figures[1]?.value, figures[1]?.change]).toEqual(["85%", "No typed questions in the previous 90 days"]);
  });

  it("shows dashes, never zeros, when the figures didn't load", () => {
    // Arrange
    const activity = getLoadFailure("chat activity", { message: "timeout" });

    // Act
    const figures = getActivityFigures({ activity, span: "7" });

    // Assert
    expect(figures.map(({ value, change }) => [value, change])).toEqual([
      ["—", "Didn't load — refresh to try again"],
      ["—", "Didn't load — refresh to try again"],
      ["—", "Didn't load — refresh to try again"],
    ]);
  });
});
