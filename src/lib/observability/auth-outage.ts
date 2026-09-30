import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

// Tells a real sign-in service outage apart from an ordinary signed-out session
// (docs/cwr-error-tracking-plan.md, Auth). Only an outage is alarming: it needs a real
// failed response from Supabase, which a visitor cannot fake. An expired, revoked, or
// forged session is simply signed out, exactly as before.

const SERVER_ERROR_STATUS = 500;

export function isAuthOutage(error: unknown): boolean {
  if (!isAuthError(error)) return false;
  if (isAuthRetryableFetchError(error)) return true;
  if (error.name === "AuthUnknownError") return true;
  return (error.status ?? 0) >= SERVER_ERROR_STATUS;
}

/** The auth error's code when it has one, else its class name. */
export function getAuthErrorCode(error: unknown): string {
  if (isAuthError(error)) return error.code ?? error.name;
  return error instanceof Error ? error.name : "NonError";
}
