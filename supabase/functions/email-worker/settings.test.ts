import { describe, expect, it } from "vitest";

import { getWorkerSettings, WorkerSettingsError } from "./settings.ts";

function getReader(values: Record<string, string>) {
  return (name: string) => values[name];
}

describe("email-worker settings", () => {
  it("sends through MailerSend for the live site by default", () => {
    // Act
    const settings = getWorkerSettings(getReader({ MAILERSEND_API_KEY: "key", ALERT_FROM_EMAIL: "alerts@example.com" }));

    // Assert
    expect([settings.siteUrl, settings.email.transport]).toEqual(["https://www.charliewardrealty.com", "mailersend"]);
  });

  it("uses the pre-launch address for links and the logo", () => {
    // Act
    const settings = getWorkerSettings(getReader({ EMAIL_SITE_URL: "https://cw-realty.builtfor.workers.dev/" }));

    // Assert
    expect(settings.siteUrl).toBe("https://cw-realty.builtfor.workers.dev");
  });

  it("refuses an address that doesn't serve the site", () => {
    // Act
    const reading = () => getWorkerSettings(getReader({ EMAIL_SITE_URL: "https://phish.example" }));

    // Assert
    expect(reading).toThrow(WorkerSettingsError);
  });

  it.each(["mailpit", "log"])("refuses %s for the live site", (transport) => {
    // Act
    const reading = () => getWorkerSettings(getReader({ EMAIL_TRANSPORT: transport, EMAIL_SITE_URL: "https://www.charliewardrealty.com" }));

    // Assert
    expect(reading).toThrow(WorkerSettingsError);
  });

  it("allows the test inbox for the local site", () => {
    // Act
    const settings = getWorkerSettings(getReader({ EMAIL_TRANSPORT: "mailpit", EMAIL_SITE_URL: "http://127.0.0.1:3100" }));

    // Assert
    expect(settings.email.transport).toBe("mailpit");
  });
});
