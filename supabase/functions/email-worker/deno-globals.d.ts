// For the site's type check (tsc) only: the parts of Deno's built-in API the email-worker uses.
// Deno itself never loads this file (nothing imports it) and has its own full types.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};
