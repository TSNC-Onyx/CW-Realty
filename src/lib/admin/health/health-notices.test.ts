import { describe, expect, it } from "vitest";

import { getHealthNotices, type HealthCheck } from "@/lib/admin/health/health-notices";

const NOW = new Date("2026-09-27T18:00:00Z");

function getCheck(overrides: Partial<HealthCheck> & Pick<HealthCheck, "name">): HealthCheck {
  return { last_run_at: null, last_ok_at: null, last_error: null, last_error_at: null, created_at: "2026-09-01T00:00:00Z", ...overrides };
}

describe("getHealthNotices", () => {
  it("stays quiet when every check ran recently", () => {
    // Arrange
    const checks = [
      getCheck({ name: "problem_alerts", last_run_at: "2026-09-27T17:55:00Z" }),
      getCheck({ name: "scheduled_jobs", last_run_at: "2026-09-27T17:30:00Z" }),
      getCheck({ name: "photo_cleanup", last_ok_at: "2026-09-27T03:00:00Z" }),
    ];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices).toEqual([]);
  });

  it("warns when problem emails haven't been checked for over 20 minutes", () => {
    // Arrange
    const checks = [getCheck({ name: "problem_alerts", last_run_at: "2026-09-27T17:39:00Z" })];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices.map((notice) => notice.title)).toEqual(["Problem emails aren't being checked"]);
  });

  it("warns when the database clean-up checks haven't run for over 45 minutes", () => {
    // Arrange
    const checks = [getCheck({ name: "scheduled_jobs", last_run_at: "2026-09-27T17:14:00Z" })];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices.map((notice) => notice.title)).toEqual(["Database clean-up checks aren't running"]);
  });

  it("warns when the photo clean-up never finished and the check is over 36 hours old", () => {
    // Arrange
    const checks = [getCheck({ name: "photo_cleanup", last_run_at: "2026-09-27T03:00:00Z", created_at: "2026-09-26T05:00:00Z" })];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices.map((notice) => notice.title)).toEqual(["The nightly photo clean-up hasn't finished"]);
  });

  it("shows the last error when the problem log's last write failed after its last success", () => {
    // Arrange
    const checks = [getCheck({ name: "problem_log_writes", last_ok_at: "2026-09-27T10:00:00Z", last_error_at: "2026-09-27T11:00:00Z", last_error: "connection refused" })];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices[0]?.body).toContain("connection refused");
  });

  it("stays quiet when the problem log recovered after its last error", () => {
    // Arrange
    const checks = [getCheck({ name: "problem_log_writes", last_ok_at: "2026-09-27T12:00:00Z", last_error_at: "2026-09-27T11:00:00Z", last_error: "connection refused" })];

    // Act
    const notices = getHealthNotices({ checks, now: NOW });

    // Assert
    expect(notices).toEqual([]);
  });
});
