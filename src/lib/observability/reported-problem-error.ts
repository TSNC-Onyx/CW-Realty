// Thrown after a problem has already been recorded, so boundaries show its message (which
// carries the reference code) without recording it a second time.
export class ReportedProblemError extends Error {
  constructor(message: string, readonly context: { reference: string }) {
    super(message);
    this.name = "ReportedProblemError";
  }
}
