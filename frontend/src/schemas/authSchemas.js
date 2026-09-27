import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required.")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Full name is required.")
      .min(3, "Full name must be at least 3 characters."),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .min(1, "Phone number is required.")
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number."),
    password: z
      .string()
      .min(1, "Password is required.")
      .min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
    role: z.enum(["farmer", "buyer"], {
      error: "Choose Farmer or Buyer.",
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });