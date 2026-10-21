import "server-only";

// Meta Conversions API (Features §3): the server confirms a lead to Meta with the same event ID
// the Pixel uses, so Meta counts it once. Only standard fields are sent, never location, age,
// or gender (housing ad rules, plan decision 13).

const GRAPH_API_URL = "https://graph.facebook.com/v26.0";
const REQUEST_TIMEOUT_MS = 5000;
// Meta's error answers are short; reading more could only hold an unexpected large body.
const ERROR_BODY_LIMIT_BYTES = 4096;
const WEBSITE_ACTION_SOURCE = "website";

export type MetaEventName = "Lead" | "Schedule";

export type MetaServerEvent = {
  event_name: MetaEventName;
  event_time: number;
  event_id: string;
  action_source: typeof WEBSITE_ACTION_SOURCE;
  event_source_url: string;
  user_data: {
    em?: string[];
    ph?: string[];
    fbc?: string;
    fbp?: string;
    client_ip_address?: string;
    client_user_agent: string;
  };
};

export type MetaEventInput = {
  eventName: MetaEventName;
  eventId: string;
  occurredAt: Date;
  sourceUrl: string;
  emailHash: string | null;
  phoneHash: string | null;
  fbc: string | null;
  fbp: string | null;
  clientIp: string | null;
  userAgent: string;
};

/** metaErrorCode: Meta's numeric error code (190 = invalid or expired token), when it sent one. */
export class MetaConversionsError extends Error {
  constructor(message: string, readonly context: { status: number | null; metaErrorCode: number | null }) {
    super(message);
    this.name = "MetaConversionsError";
  }
}

function getOptionalFields(input: MetaEventInput): Partial<MetaServerEvent["user_data"]> {
  const entries = [
    ["em", input.emailHash ? [input.emailHash] : null],
    ["ph", input.phoneHash ? [input.phoneHash] : null],
    ["fbc", input.fbc],
    ["fbp", input.fbp],
    ["client_ip_address", input.clientIp],
  ] as const;
  return Object.fromEntries(entries.filter(([, value]) => value !== null));
}

export function getMetaServerEvent(input: MetaEventInput): MetaServerEvent {
  return {
    event_name: input.eventName,
    event_time: Math.floor(input.occurredAt.getTime() / 1000),
    event_id: input.eventId,
    action_source: WEBSITE_ACTION_SOURCE,
    event_source_url: input.sourceUrl,
    user_data: { ...getOptionalFields(input), client_user_agent: input.userAgent },
  };
}

/** Sends one event. Throws MetaConversionsError when Meta does not accept it. */
export async function sendMetaServerEvent({ pixelId, accessToken, event }: { pixelId: string; accessToken: string; event: MetaServerEvent }): Promise<void> {
  const response = await fetch(`${GRAPH_API_URL}/${encodeURIComponent(pixelId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ data: [event] }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new MetaConversionsError("Meta did not accept the event", { status: response.status, metaErrorCode: await readMetaErrorCode(response) });
}

async function readTextStart(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (size < ERROR_BODY_LIMIT_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    size += value.byteLength;
  }
  await reader.cancel();
  return text.slice(0, ERROR_BODY_LIMIT_BYTES);
}

function getMetaErrorCode(text: string): number | null {
  const code: unknown = (JSON.parse(text) as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "number" ? code : null;
}

async function readMetaErrorCode(response: Response): Promise<number | null> {
  if (!response.body) return null;
  try {
    return getMetaErrorCode(await readTextStart(response.body));
  } catch {
    // An unreadable or non-JSON answer: the HTTP status alone still describes the refusal.
    return null;
  }
}
