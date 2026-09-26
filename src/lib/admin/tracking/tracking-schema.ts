import { z } from "zod";

// "Ads & analytics" fields (plan decision 6): both optional; blank switches that part off.

const optionalId = ({ pattern, message }: { pattern: RegExp; message: string }) =>
  z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || pattern.test(value), message)
    .transform((value) => (value === "" ? null : value));

export const trackingSettingsSchema = z.object({
  gtmContainerId: optionalId({ pattern: /^GTM-[A-Z0-9]{4,12}$/, message: "Enter the container ID from Google Tag Manager, like GTM-AB12CD3" }),
  metaPixelId: optionalId({ pattern: /^[0-9]{10,20}$/, message: "Enter the Pixel ID from Meta Events Manager: 10 to 20 digits, no spaces" }),
});

export type TrackingSettingsInput = z.infer<typeof trackingSettingsSchema>;
