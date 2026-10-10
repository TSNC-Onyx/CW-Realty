import { AuthApiError, AuthRetryableFetchError, AuthUnknownError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  getEmailLinkOutcome,
  getOutcomeMessage,
  getPasswordResetOutcome,
  getSetPasswordOutcome,
  getSignInOutcome,
  PASSWORD_NOT_SAVED_MESSAGE,
  RESET_LINK_SENT_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
  type AuthOutcome,
} from "@/lib/admin/auth-outcomes";

const OUTAGE = new AuthRetryableFetchError("fetch failed", 0);
const SERVER_ERROR = new AuthApiError("Internal error", 503, "unexpected_failure");
const UNREADABLE_REPLY = new AuthUnknownError("Auth failed", new SyntaxError("Unexpected token <"));

describe("sign-in password step", () => {
  it.each([
    ["a wrong password", new AuthApiError("Invalid login credentials", 400, "invalid_credentials"), "invalid_credentials", "That email and password don't match an account. Check them and try again."],
    ["too many attempts", new AuthApiError("Too many requests", 429, "over_request_rate_limit"), "over_request_rate_limit", "Too many attempts. Wait a few minutes, then try again."],
    ["a failed bot check", new AuthApiError("captcha protection: request disallowed", 400, "captcha_failed"), "captcha_failed", "The quick check didn't go through. Try again. If it happens again, tap Refresh page."],
    ["an expired bot check", new AuthApiError("captcha protection: request disallowed (timeout-or-duplicate)", 400, "captcha_failed"), "captcha_expired", "The quick check didn't go through. Try again. If it happens again, tap Refresh page."],
  ])("treats %s as the person's to fix, with its usual wording", (_label, error, code, shownMessage) => {
    // Act
    const outcome = getSignInOutcome(error);

    // Assert
    expect(outcome).toEqual({ severity: "info", code, shownMessage });
  });

  it("names a rate limit without a code by the rate-limit code", () => {
    // Arrange
    const error = new AuthApiError("Too many requests", 429, undefined);

    // Act
    const outcome = getSignInOutcome(error);

    // Assert
    expect(outcome.code).toBe("over_request_rate_limit");
  });

  it.each([
    ["a network failure", OUTAGE],
    ["an upstream server error", SERVER_ERROR],
    ["an unreadable reply", UNREADABLE_REPLY],
    ["an unexpected refusal", new AuthApiError("Email not confirmed", 400, "email_not_confirmed")],
  ])("treats %s as sign-in not working", (_label, error) => {
    // Act
    const outcome = getSignInOutcome(error);

    // Assert
    expect(outcome).toMatchObject({ severity: "critical", shownMessage: SIGN_IN_UNAVAILABLE_MESSAGE });
  });
});

describe("password reset request", () => {
  it.each([
    ["too many requests", new AuthApiError("Too many requests", 429, "over_email_send_rate_limit"), "info", "over_request_rate_limit"],
    ["a failed bot check", new AuthApiError("captcha protection: request disallowed", 400, "captcha_failed"), "info", "captcha_failed"],
    ["an outage", SERVER_ERROR, "error", "unexpected_failure"],
    ["an unexpected refusal", new AuthApiError("Email address is invalid", 400, "email_address_invalid"), "error", "email_address_invalid"],
  ])("records %s at the right level", (_label, error, severity, code) => {
    // Act
    const outcome = getPasswordResetOutcome(error);

    // Assert
    expect(outcome).toMatchObject({ severity, code });
  });

  it("always shows the same screen", () => {
    // Act
    const outcome = getPasswordResetOutcome(SERVER_ERROR);

    // Assert
    expect(outcome.shownMessage).toBe(RESET_LINK_SENT_MESSAGE);
  });
});

describe("choosing a new password", () => {
  it("treats a reused password as the person's to fix", () => {
    // Arrange
    const error = new AuthApiError("New password should be different from the old password.", 422, "same_password");

    // Act
    const outcome = getSetPasswordOutcome(error);

    // Assert
    expect(outcome).toMatchObject({ severity: "info", code: "same_password", shownMessage: "Choose a password you haven't used here before." });
  });

  it("treats a weak password as the person's to fix", () => {
    // Arrange
    const error = new AuthWeakPasswordError("Password is known to be weak", 422, ["pwned"]);

    // Act
    const outcome = getSetPasswordOutcome(error);

    // Assert
    expect(outcome).toMatchObject({ severity: "info", code: "weak_password", fieldErrors: { password: "Choose a stronger password" } });
  });

  it("explains an old sign-in code that still blocks the change, so the owner can remove it", () => {
    // Arrange
    const error = new AuthApiError("AAL2 session is required to update email or password when MFA is enabled.", 401, "insufficient_aal");

    // Act
    const outcome = getSetPasswordOutcome(error);

    // Assert
    expect(outcome).toMatchObject({ severity: "warning", code: "insufficient_aal", shownMessage: "This account still has an old sign-in code from the authenticator app. Ask the site owner to remove it, then try again." });
  });

  it("treats an outage as critical", () => {
    // Act
    const outcome = getSetPasswordOutcome(OUTAGE);

    // Assert
    expect(outcome).toMatchObject({ severity: "critical", shownMessage: PASSWORD_NOT_SAVED_MESSAGE });
  });

  it("does not blame the password for any other refusal", () => {
    // Arrange
    const error = new AuthApiError("User not found", 404, "user_not_found");

    // Act
    const outcome = getSetPasswordOutcome(error);

    // Assert
    expect(outcome).toEqual({ severity: "error", code: "user_not_found", shownMessage: PASSWORD_NOT_SAVED_MESSAGE });
  });
});

describe("opening an invite or reset link", () => {
  it.each([
    ["an expired or used link", new AuthApiError("Email link is invalid or has expired", 403, "otp_expired"), "info"],
    ["another refused link", new AuthApiError("Bad request", 400, "validation_failed"), "info"],
    ["an outage", SERVER_ERROR, "error"],
    ["an unreadable reply", UNREADABLE_REPLY, "error"],
  ])("records %s at the right level", (_label, error, severity) => {
    // Act
    const outcome = getEmailLinkOutcome(error);

    // Assert
    expect(outcome.severity).toBe(severity);
  });
});

describe("shown message", () => {
  const record = { reference: "CWR-AAA-BBB", stored: true, isSuppressed: false };

  it("leaves a mistake the person can fix without a reference", () => {
    // Arrange
    const outcome: AuthOutcome = { severity: "info", code: "invalid_credentials", shownMessage: "Check them." };

    // Act
    const message = getOutcomeMessage({ outcome, record });

    // Assert
    expect(message).toBe("Check them.");
  });

  it("adds the reference to a problem on our side", () => {
    // Arrange
    const outcome: AuthOutcome = { severity: "critical", code: "unexpected_failure", shownMessage: SIGN_IN_UNAVAILABLE_MESSAGE };

    // Act
    const message = getOutcomeMessage({ outcome, record });

    // Assert
    expect(message).toBe(`${SIGN_IN_UNAVAILABLE_MESSAGE} (Ref CWR-AAA-BBB)`);
  });
});
