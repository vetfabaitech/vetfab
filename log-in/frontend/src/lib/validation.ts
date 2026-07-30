import { z } from "zod";

/** Login form schema. Messages are the actual copy shown inline under each
 * field -- kept here rather than scattered through the component so the
 * wording stays consistent and easy to audit in one place. */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
  remember: z.boolean().default(false),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Complete-profile (onboarding) form schema. Mirrors the backend's
 * validation in ../../../backend/app/utils/username.py -- kept in sync by
 * hand since this is a small, stable rule set; the backend is still the
 * source of truth (this is a UX nicety, not the security boundary). */
export const profileSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .min(4, "Username must be at least 4 characters")
    .max(30, "Username must be 30 characters or fewer")
    .regex(/^[a-z]/, "Username must start with a letter")
    .regex(/^[a-z0-9_-]+$/, "Only lowercase letters, numbers, underscores, and hyphens"),
  displayName: z.string().min(1, "Display name is required").max(100, "Display name is too long"),
  bio: z.string().max(160, "Bio must be 160 characters or fewer").optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  preferredHdl: z.enum(["verilog", "systemverilog", "vhdl", "mixed"]),
  theme: z.enum(["light", "dark", "system"]),
  defaultVisibility: z.enum(["private", "public"]),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
