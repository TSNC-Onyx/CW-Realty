import { z } from "zod";

// Sign-in field rules. Passwords match the Supabase Auth policy in supabase/config.toml:
// at least 12 characters with lowercase, uppercase, and a number.

export const MIN_PASSWORD_LENGTH = 12;

export const emailSchema = z.string().trim().min(1, "Enter your email address").pipe(z.email("Enter a full email address, like name@example.com"));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const mfaCodeSchema = z
  .string()
  .trim()
  .transform((code) => code.replace(/\s/g, ""))
  .pipe(z.string().regex(/^[0-9]{6}$/, "Enter the 6-digit code from your authenticator app"));

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The two passwords don't match",
    path: ["confirmPassword"],
  });

export function getFieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]).reverse());
}
