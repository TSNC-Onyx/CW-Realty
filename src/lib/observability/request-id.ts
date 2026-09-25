export const REQUEST_ID_HEADER = "x-request-id";

const TRUSTED_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function getRequestId(incomingRequestId: string | null): string {
  if (incomingRequestId && TRUSTED_REQUEST_ID_PATTERN.test(incomingRequestId)) {
    return incomingRequestId;
  }
  return crypto.randomUUID();
}
