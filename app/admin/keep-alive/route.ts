// Called by the open admin tab while someone is actively working, so the server's
// 30-minute idle clock (updated by the middleware on every admin request) stays current.
export function POST() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
