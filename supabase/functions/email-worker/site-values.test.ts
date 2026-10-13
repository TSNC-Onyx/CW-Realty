import { describe, expect, it } from "vitest";

import { SITE_URL as SITE_SITE_URL } from "@/lib/site/navigation";
import { getDisplayPhone as getSiteDisplayPhone, type E164Phone } from "@/lib/site/phone";
import { REPLY_PROMISE as SITE_REPLY_PROMISE } from "@/lib/site/reply-promise";

import { getDisplayPhone, REPLY_PROMISE, SITE_URL } from "./site-values.ts";

describe("email-worker site values match the website", () => {
  it("uses the same site address", () => {
    // Assert
    expect(SITE_URL).toBe(SITE_SITE_URL);
  });

  it("makes the same reply promise", () => {
    // Assert
    expect(REPLY_PROMISE).toBe(SITE_REPLY_PROMISE);
  });

  it.each<E164Phone>(["+13367080560", "+19195550123", "+1336"])("shows %s the same way", (phone) => {
    // Assert
    expect(getDisplayPhone(phone)).toBe(getSiteDisplayPhone(phone));
  });
});
