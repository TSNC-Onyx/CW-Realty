import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("email-worker Deno settings", () => {
  it("uses the same Supabase library version as the site", () => {
    // Arrange
    const site = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    const worker = JSON.parse(readFileSync("supabase/functions/email-worker/deno.json", "utf8")) as { imports: Record<string, string> };

    // Assert
    expect(worker.imports["@supabase/supabase-js"]).toBe(`npm:@supabase/supabase-js@${site.dependencies["@supabase/supabase-js"]}`);
  });
});
