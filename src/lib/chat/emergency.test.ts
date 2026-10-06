import { describe, expect, it } from "vitest";

import { getEmergencyReply, isEmergencyMessage } from "@/lib/chat/emergency";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";

describe("isEmergencyMessage", () => {
  it.each([
    "There's a gas leak at my rental. What do I do?",
    "I smell gas in the kitchen",
    "it smells like gas",
    "My house is on fire",
    "There's a fire in the garage",
    "smoke is coming from the outlet",
    "the room is full of smoke",
    "Our carbon monoxide alarm keeps going off",
    "CO detector is beeping loud",
    "The basement is flooding",
    "A pipe burst under the sink",
    "water is pouring through the ceiling",
    "The outlet is sparking",
    "I have an emergency",
    "should I call 911?",
  ])("flags %s", (text) => {
    // Arrange / Act
    const isFlagged = isEmergencyMessage(text);

    // Assert
    expect(isFlagged).toBe(true);
  });

  it.each([
    "Does the house have a gas stove?",
    "Is gas included in the rent?",
    "Does it have a fireplace?",
    "Is there a fire pit in the backyard?",
    "Do I need fire insurance?",
    "Can I fire my property manager?",
    "Is the home in a flood zone?",
    "Do I need flood insurance?",
    "Is this a smoke-free building?",
    "How much should I keep in an emergency fund before buying?",
    "When are you open?",
  ])("allows %s", (text) => {
    // Arrange / Act
    const isFlagged = isEmergencyMessage(text);

    // Assert
    expect(isFlagged).toBe(false);
  });
});

describe("getEmergencyReply", () => {
  it("cites the policy's Emergencies section when it has one", () => {
    // Arrange
    const sections = ["Office hours", "Emergencies"];

    // Act
    const reply = getEmergencyReply(sections);

    // Assert
    expect(reply).toEqual({ outcome: "answer", text: EMERGENCY_TEXT, citedSections: ["Emergencies"] });
  });

  it("still gives the fixed reply without an Emergencies section", () => {
    // Arrange / Act
    const reply = getEmergencyReply([]);

    // Assert
    expect(reply).toEqual({ outcome: "answer", text: EMERGENCY_TEXT, citedSections: [] });
  });
});
