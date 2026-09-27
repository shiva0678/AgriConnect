import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .refine((value) => {
    const normalized = value.replace(/[\s-]/g, "");
    return /^(?:\+91|91)?[6-9]\d{9}$/.test(normalized);
  }, "Enter a valid 10-digit Indian phone number.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Full name is required.")
  .min(3, "Full name must be at least 3 characters.");

export const farmerProfileSchema = z.object({
  name: nameSchema,
  farm: z.string().trim().min(1, "Farm name is required."),
  phone: phoneSchema,
  email: emailSchema,
  location: z.string().trim().min(1, "Farm location is required."),
});

export const buyerProfileSchema = z.object({
  name: nameSchema,
  company: z.string().trim().min(1, "Company name is required."),
  phone: phoneSchema,
  email: emailSchema,
  location: z.string().trim().min(1, "Operating region is required."),
});