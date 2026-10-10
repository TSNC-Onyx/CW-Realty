// Admin portal URLs, shared by pages, server actions, and the middleware.

export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_LOGIN_PATH = "/admin/login";
// The old authenticator-code pages forward to the dashboard (codes removed 2026-10-09).
export const ADMIN_MFA_PATH = "/admin/mfa";
export const ADMIN_MFA_SETUP_PATH = "/admin/mfa/setup";
export const ADMIN_SET_PASSWORD_PATH = "/admin/set-password";
export const ADMIN_FORGOT_PASSWORD_PATH = "/admin/forgot-password";
export const ADMIN_CONFIRM_PATH = "/admin/auth/confirm";
export const ADMIN_LOGOUT_PATH = "/admin/logout";
// Browsers report problems here, including from the sign-in pages (it checks the caller itself).
export const ADMIN_PROBLEM_REPORT_PATH = "/admin/problems/report";

export type SignOutReason = "timeout" | "signed-out" | "no-access";

// Pages reachable without a session (they start or finish signing in).
const PUBLIC_ADMIN_PATHS = new Set([ADMIN_LOGIN_PATH, ADMIN_FORGOT_PASSWORD_PATH, ADMIN_CONFIRM_PATH, ADMIN_LOGOUT_PATH, ADMIN_PROBLEM_REPORT_PATH]);

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_HOME_PATH || pathname.startsWith(`${ADMIN_HOME_PATH}/`);
}

export function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.has(pathname);
}

/** Only same-site admin paths are allowed as "next" targets (no open redirects). */
export function getSafeAdminPath(next: string | null | undefined): string {
  if (!next || !isAdminPath(next) || next.startsWith("//") || next.includes("\\")) return ADMIN_HOME_PATH;
  return next;
}

export function getLogoutPath(reason: SignOutReason): string {
  return `${ADMIN_LOGOUT_PATH}?reason=${reason}`;
}
