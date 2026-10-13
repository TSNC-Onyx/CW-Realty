import { createClient } from "@supabase/supabase-js";

import type { EmailSender } from "./sender.ts";

// Background email jobs (Infra §3). Shared by the email-worker (Supabase, Deno) and, until the
// Cloudflare Queue path is removed, the site's queue consumer (worker.ts), so it imports only
// relative .ts files and @supabase/supabase-js (mapped for Deno in deno.json).

export const ALERT_QUEUE_BINDING = "CWR_ALERTS";
export const ALERT_DEAD_LETTER_QUEUE = "cwr-alerts-dlq";

export type AlertJob =
  | { kind: "new_request"; threadId: string }
  | { kind: "reply"; messageId: string }
  | { kind: "test"; tenantId: string; runId: string }
  | { kind: "retry"; deliveryId: string };

// Service-role database access for jobs, created by whoever runs them (the Next.js server
// or the queue consumer Worker) after its own checks.
export function createJobDatabase({ url, serviceRoleKey }: { url: string; serviceRoleKey: string }) {
  return createClient(url, serviceRoleKey, { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
}

export type JobDatabase = ReturnType<typeof createJobDatabase>;

/** A problem worth recording; each runner passes its own recorder (the site's or the email-worker's). */
export type JobProblem = {
  action: string;
  stage: string;
  severity: "info" | "warning" | "error" | "critical";
  origin: "job";
  code: string | null;
  tenantId?: string | null;
  detail: string;
};

export type JobDependencies = { db: JobDatabase; sendEmail: EmailSender; siteUrl: string; recordProblem: (problem: JobProblem) => Promise<void> };

export class RetryableJobError extends Error {
  constructor(readonly context: { job: AlertJob; failedCount: number }) {
    super(`${context.failedCount} email(s) failed and will be retried`);
    this.name = "RetryableJobError";
  }
}

/** A temporary problem (database or network): the queue should try again. */
export class TransientJobError extends Error {
  constructor(message: string, readonly context: { operation: string; cause?: unknown }) {
    super(message);
    this.name = "TransientJobError";
  }
}

/** The job points at something that no longer exists: retrying cannot help. */
export class JobDataError extends Error {
  constructor(message: string, readonly context: { job: AlertJob }) {
    super(message);
    this.name = "JobDataError";
  }
}
