import { getHttpProblemCode, type BrowserProblemCode, type ClientProblem } from "@/lib/observability/client-problem";
import { isReferenceWorthy, type ProblemSeverity } from "@/lib/observability/problem-types";

// How a Homework file transfer from the browser to storage can fail, and what the person is
// told for each (docs/cwr-error-tracking-plan.md). Pure, so it is unit-tested.

const MS_PER_SECOND = 1000;
// The upload may take as long as the file would need on a slow ~1 Mbit/s link, and never less than 2 minutes.
const SLOW_LINK_BYTES_PER_SECOND = 125_000;
const MIN_UPLOAD_TIMEOUT_MS = 2 * 60 * MS_PER_SECOND;
const MAX_RESPONSE_DETAIL = 300;
const HTTP_FAILED_MESSAGE = "The file didn't upload. Try again in a moment.";
const NETWORK_MESSAGE = "The file didn't upload. Check your connection and try again.";
const TIMEOUT_MESSAGE = "The upload took too long. Check your connection and try again.";
const ABORTED_MESSAGE = "The upload stopped before it finished. Try again.";

export type UploadProblem = Omit<ClientProblem, "action" | "shownMessage"> & { message: string };

export type TransferFailureCode = Extract<BrowserProblemCode, "network" | "timeout" | "aborted">;

const TRANSFER_MESSAGES: Record<TransferFailureCode, string> = { network: NETWORK_MESSAGE, timeout: TIMEOUT_MESSAGE, aborted: ABORTED_MESSAGE };

export function getUploadTimeoutMs(sizeBytes: number): number {
  return Math.max(MIN_UPLOAD_TIMEOUT_MS, Math.ceil(sizeBytes / SLOW_LINK_BYTES_PER_SECOND) * MS_PER_SECOND);
}

/** Storage answered but refused the file: a system fault, since the link came from our server. */
export function getHttpProblem({ status, responseText }: { status: number; responseText: string }): UploadProblem {
  return { stage: "network", severity: "error", code: getHttpProblemCode(status), message: HTTP_FAILED_MESSAGE, detail: `HTTP ${status}: ${responseText.slice(0, MAX_RESPONSE_DETAIL)}` };
}

/** The connection dropped, took too long, or was stopped before storage answered. */
export function getTransferProblem({ code, sizeBytes, timeoutMs }: { code: TransferFailureCode; sizeBytes: number; timeoutMs: number }): UploadProblem {
  return { stage: "network", severity: "warning", code, message: TRANSFER_MESSAGES[code], detail: `${sizeBytes} bytes, allowed ${timeoutMs} ms` };
}

export function getMessageWithReference({ message, severity, reference }: { message: string; severity: ProblemSeverity; reference: string | null }): string {
  return reference && isReferenceWorthy(severity) ? `${message} (Ref ${reference})` : message;
}
