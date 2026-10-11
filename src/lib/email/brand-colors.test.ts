import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EMAIL_COLORS } from "@/lib/email/brand-colors";

const TOKEN_FILE = "app/globals.css";

function getTokenColor(css: string, name: string): string | undefined {
  return css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i"))?.[1]?.toLowerCase();
}

describe("email colors", () => {
  it.each(Object.entries(EMAIL_COLORS))("%s matches the website token", (name, value) => {
    // Arrange
    const css = readFileSync(TOKEN_FILE, "utf8");

    // Act
    const tokenColor = getTokenColor(css, name);

    // Assert
    expect(tokenColor).toBe(value);
  });
});
