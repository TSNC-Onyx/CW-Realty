import { createHash } from "node:crypto";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnstileField } from "@/components/forms/turnstile-field";
import type { BotCheck } from "@/components/forms/use-bot-check";
import { getContentSecurityPolicy } from "@/lib/security/content-security-policy";
import { TURNSTILE_CONTAINER_STYLE, TURNSTILE_CONTAINER_STYLE_HASH } from "@/lib/security/turnstile-style";

// The Quick Check library writes one fixed style on its container. The security policy allows
// exactly that style by its hash, and a class cancels its 300px minimum, so the layout stays as
// before (docs/visitor-audit-fixes-plan.md step 3.5, owner decision D4). If a library update
// changes the style, these tests fail before anything goes live.

const NONCE = "dGVzdC1ub25jZQ==";
const IGNORE = () => undefined;

function buildBotCheck(): BotCheck {
  const handlers = { onSuccess: IGNORE, onExpire: IGNORE, onError: IGNORE, onUnsupported: IGNORE, onTimeout: IGNORE, onBeforeInteractive: IGNORE, onAfterInteractive: IGNORE, onScriptError: IGNORE };
  return { siteKey: "1x00000000000000000000AA", status: "checking", isHolding: false, widgetKey: "0:0", handlers, retry: IGNORE, handleSubmitAttempt: () => true };
}

function getContainerAttribute(markup: string, attribute: "style" | "class"): string | undefined {
  const container = markup.match(/<div[^>]*id="cf-turnstile-[^"]*"[^>]*>/)?.[0] ?? "";
  return container.match(new RegExp(`${attribute}="([^"]*)"`))?.[1];
}

describe("Quick Check container style", () => {
  it("has a hash that matches the allowed style exactly", () => {
    // Act
    const hash = `'sha256-${createHash("sha256").update(TURNSTILE_CONTAINER_STYLE).digest("base64")}'`;

    // Assert
    expect(hash).toBe(TURNSTILE_CONTAINER_STYLE_HASH);
  });

  it("is the style the library writes on the server-rendered container", () => {
    // Act
    const markup = renderToStaticMarkup(createElement(TurnstileField, { action: "contact", botCheck: buildBotCheck() }));

    // Assert
    expect(getContainerAttribute(markup, "style")).toBe(TURNSTILE_CONTAINER_STYLE);
  });

  it("is paired with a class that cancels the library's 300px minimum", () => {
    // Act
    const markup = renderToStaticMarkup(createElement(TurnstileField, { action: "contact", botCheck: buildBotCheck() }));

    // Assert
    expect(getContainerAttribute(markup, "class")?.split(" ")).toContain("min-w-0!");
  });

  it("is allowed by hash in production", () => {
    // Act
    const policy = getContentSecurityPolicy({ nonce: NONCE, isDevelopment: false });

    // Assert
    expect(policy.split("; ")).toContain(`style-src-attr 'unsafe-hashes' ${TURNSTILE_CONTAINER_STYLE_HASH}`);
  });

  it("needs no attribute rule in development, which already allows inline styles", () => {
    // Act
    const policy = getContentSecurityPolicy({ nonce: NONCE, isDevelopment: true });

    // Assert
    expect(policy).not.toContain("style-src-attr");
  });
});
