import { describe, expect, it } from "vitest";

import { getAssistantStatus, type AssistantStatusInput } from "@/lib/chat/assistant-status";

const ON: AssistantStatusInput = { isSwitchOn: true, liveVersion: 2, hasPublicSections: true, isConfigured: true };

describe("getAssistantStatus", () => {
  it("says visitors get answers when everything is set up", () => {
    // Arrange / Act
    const status = getAssistantStatus(ON);

    // Assert
    expect(status).toEqual({ state: "on", text: "On: visitors get answers from version 2." });
  });

  it("names the published version that the switch has turned off", () => {
    // Arrange / Act
    const status = getAssistantStatus({ ...ON, isSwitchOn: false });

    // Assert
    expect(status.text).toBe("Off: every visitor is offered a person. Version 2 is published but not in use.");
  });

  it("says nothing is published when the switch is off before any publish", () => {
    // Arrange / Act
    const status = getAssistantStatus({ ...ON, isSwitchOn: false, liveVersion: null });

    // Assert
    expect(status.text).toBe("Off: every visitor is offered a person. Nothing is published yet.");
  });

  it("says the chat isn't answering yet when nothing is published", () => {
    // Arrange / Act
    const status = getAssistantStatus({ ...ON, liveVersion: null });

    // Assert
    expect(status.state).toBe("not_published");
  });

  it("explains that a live version with only private sections can't answer", () => {
    // Arrange / Act
    const status = getAssistantStatus({ ...ON, hasPublicSections: false });

    // Assert
    expect(status.text).toBe("Not answering: version 2 has no public sections, so every visitor is offered a person.");
  });

  it("says the AI isn't connected when the key is missing", () => {
    // Arrange / Act
    const status = getAssistantStatus({ ...ON, isConfigured: false });

    // Assert
    expect(status.state).toBe("not_connected");
  });

  it.each([
    [{ isSwitchOn: false, liveVersion: null, hasPublicSections: false, isConfigured: false }, "off"],
    [{ isSwitchOn: true, liveVersion: null, hasPublicSections: false, isConfigured: false }, "not_published"],
    [{ isSwitchOn: true, liveVersion: 1, hasPublicSections: false, isConfigured: false }, "no_public_sections"],
    [{ isSwitchOn: true, liveVersion: 1, hasPublicSections: true, isConfigured: false }, "not_connected"],
  ])("follows the order a visitor's question meets the checks (%o)", (input, state) => {
    // Arrange / Act
    const status = getAssistantStatus(input);

    // Assert
    expect(status.state).toBe(state);
  });
});
