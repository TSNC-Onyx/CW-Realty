import { describe, expect, it } from "vitest";

import { getCookieDomains, getTrackerCookieNames } from "@/lib/tracking/tracker-cookies";

describe("getTrackerCookieNames", () => {
  it("finds Google and Meta cookies and leaves the site's own alone", () => {
    // Arrange
    const cookieHeader = "cwr_consent=x; _ga=1; _ga_ABC=2; _gcl_au=3; _fbp=4; _fbc=5; sb-auth=6";

    // Act
    const names = getTrackerCookieNames(cookieHeader);

    // Assert
    expect(names).toEqual(["_ga", "_ga_ABC", "_gcl_au", "_fbp", "_fbc"]);
  });
});

describe("getCookieDomains", () => {
  it("covers the host and its parent domain, where tags usually set cookies", () => {
    // Arrange / Act
    const domains = getCookieDomains("www.charliewardrealty.com");

    // Assert
    expect(domains).toEqual(["www.charliewardrealty.com", ".www.charliewardrealty.com", ".charliewardrealty.com"]);
  });
});
