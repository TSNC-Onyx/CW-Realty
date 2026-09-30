import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Admin, job, and Worker code records problems through the problem log, never bare console
  // lines (docs/cwr-error-tracking-plan.md); only the recorder itself writes to the console.
  {
    files: ["src/lib/admin/**", "src/components/admin/**", "app/admin/**", "src/lib/jobs/**", "worker.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-console": "error" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    "docs/**",
    "supabase/**",
    "playwright-report/**",
    "test-results/**",
    "public/photo-encoder/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
