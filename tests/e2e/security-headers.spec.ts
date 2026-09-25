import { expect, test } from "@playwright/test";

const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "cross-origin-opener-policy",
  "permissions-policy",
];

test("home page sends every required security header", async ({ request }) => {
  // Arrange
  const path = "/";

  // Act
  const response = await request.get(path);

  // Assert
  const headers = response.headers();
  expect(REQUIRED_HEADERS.filter((name) => !headers[name])).toEqual([]);
});

test("strict CSP uses a fresh nonce on every request", async ({ request }) => {
  // Arrange
  const getNonce = (policy: string) => /'nonce-([^']+)'/.exec(policy)?.[1];

  // Act
  const first = await request.get("/");
  const second = await request.get("/");

  // Assert
  const firstNonce = getNonce(first.headers()["content-security-policy"] ?? "");
  const secondNonce = getNonce(second.headers()["content-security-policy"] ?? "");
  expect(firstNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
});

test("page scripts carry the CSP nonce", async ({ request }) => {
  // Arrange
  const response = await request.get("/");
  const nonce = /'nonce-([^']+)'/.exec(response.headers()["content-security-policy"] ?? "")?.[1];

  // Act
  const html = await response.text();

  // Assert
  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scriptTags.length).toBeGreaterThan(0);
  expect(scriptTags.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);
});

test("request ID is echoed back so logs can be traced end to end", async ({ request }) => {
  // Arrange
  const requestId = "e2e-trace-0001";

  // Act
  const response = await request.get("/", { headers: { "x-request-id": requestId } });

  // Assert
  expect(response.headers()["x-request-id"]).toBe(requestId);
});

test("page loads with no CSP violations", async ({ page }) => {
  // Arrange
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });

  // Act
  await page.goto("/");

  // Assert
  expect(violations).toEqual([]);
});
