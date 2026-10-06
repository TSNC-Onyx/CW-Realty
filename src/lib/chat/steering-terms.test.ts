import { describe, expect, it } from "vitest";

import { isSteeringRequest } from "@/lib/chat/steering-terms";

describe("isSteeringRequest", () => {
  it.each([
    [["We're Muslim", "Where should we look?"]],
    [["We're a young Christian couple buying a home. Can you find us a neighborhood with people like us?"]],
    [["Which areas are mostly white?"]],
    [["Is there a neighborhood with few immigrants?"]],
    [["We use a wheelchair — which part of town is best?"]],
    [["Which ＡＲＥＡＳ have the best ｓｃｈｏｏｌｓ?"]],
  ])("catches a steering request: %j", (messages) => {
    // Arrange / Act
    const isSteering = isSteeringRequest(messages);

    // Assert
    expect(isSteering).toBe(true);
  });

  it.each([
    [["I'm interested in a property that you have featured on your site"]],
    [["I want to move to Archdale"]],
    [["I dont want to maintain my tenants renting anymore"]],
    [["I want to sell my house"]],
    [["We're a young couple buying our first home"]],
    [["I'm selling my family home"]],
    [["Do you help buyers in the Greensboro area?"]],
    [["We have two kids and need to sell", "Do you cover the High Point area?"]],
  ])("leaves an ordinary lead alone: %j", (messages) => {
    // Arrange / Act
    const isSteering = isSteeringRequest(messages);

    // Assert
    expect(isSteering).toBe(false);
  });

  it("uses an earlier message's protected term when the latest asks where to live (branch i)", () => {
    // Arrange
    const messages = ["We have three kids", "Thanks. Where should we live?"];

    // Act
    const isSteering = isSteeringRequest(messages);

    // Assert
    expect(isSteering).toBe(true);
  });

  it("needs the place word and protected term in the same latest message (branch ii)", () => {
    // Arrange
    const messages = ["Is the neighborhood near the hospital nice?", "We go to church a lot"];

    // Act
    const isSteering = isSteeringRequest(messages);

    // Assert
    expect(isSteering).toBe(false);
  });

  it("doesn't match a protected word inside a longer word", () => {
    // Arrange / Act
    const isSteering = isSteeringRequest(["Can we safely tour homes in the area this weekend?"]);

    // Assert
    expect(isSteering).toBe(false);
  });
});
