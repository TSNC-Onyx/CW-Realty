import { describe, expect, it } from "vitest";

import { isOutsideBrowserError } from "@/lib/observability/browser-noise";

function getNamedError({ name, message }: { name: string; message: string }): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("which browser crashes don't mean the site is broken", () => {
  it.each([
    ["old code after an update (webpack)", getNamedError({ name: "ChunkLoadError", message: "Loading chunk 123 failed." }), true],
    ["old code after an update (Turbopack)", new Error("Failed to load chunk /_next/static/chunks/abc.js from module 42"), true],
    ["a translator changing the page", getNamedError({ name: "NotFoundError", message: "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node." }), true],
    ["a real bug in our code", new TypeError("Cannot read properties of undefined (reading 'id')"), false],
    ["some other NotFoundError", getNamedError({ name: "NotFoundError", message: "The object can not be found here." }), false],
    ["something thrown that isn't an Error", "boom", false],
  ])("decides for %s", (_label, error, expected) => {
    // Act
    const isOutside = isOutsideBrowserError(error);

    // Assert
    expect(isOutside).toBe(expected);
  });
});
