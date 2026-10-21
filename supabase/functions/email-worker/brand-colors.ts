// Email colors (Style §11.15 email exception, owner approved 2026-10-08). Email apps cannot
// read the website's CSS variables, so the values are repeated here; brand-colors.test.ts
// fails if any one drifts from its token in app/globals.css.

export const EMAIL_COLORS = {
  page: "#faf8f3",
  surface: "#ffffff",
  ink: "#141414",
  muted: "#4d4a44",
  line: "#d9d3c7",
  dark: "#121212",
  "dark-alt": "#1e1e1e",
  "on-dark": "#ffffff",
  "on-dark-muted": "#cfcfcf",
  gold: "#e6bd35",
} as const;
