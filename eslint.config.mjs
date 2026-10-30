import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Admin, job, and Worker code records problems through the problem log, never bare console
  // lines (docs/cwr-error-tracking-plan.md); only the recorder itself writes to the console.
  {
    files: ["src/lib/admin/**", "src/components/admin/**", "app/admin/**", "src/lib/jobs/**", "worker.ts", "supabase/functions/**"],
    ignores: ["**/*.test.ts", "supabase/functions/email-worker/problems.ts"],
    rules: { "no-console": "error" },
  },
  // The email-worker runs on Supabase Edge Functions (Deno) — docs/cwr-email-outbox-plan.md.
  {
    files: ["supabase/functions/**"],
    languageOptions: { globals: { Deno: "readonly", EdgeRuntime: "readonly" } },
  },
  globalIgnores([
    ".next/**",
    ".release-maps/**",
    "out/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    "docs/**",
    // Everything under supabase/ except the email-worker's code (Edge Functions).
    "supabase/*",
    "!supabase/functions/",
    "playwright-report/**",
    "test-results/**",
    "public/photo-encoder/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
