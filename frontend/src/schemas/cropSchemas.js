import { z } from "zod";

const positiveNumberString = (label) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => Number.isFinite(Number(value)) && Number(value) > 0,
      `${label} must be greater than 0.`,
    )
    .transform(Number);

const nonNegativeNumberString = (label) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
      `${label} must be zero or greater.`,
    )
    .transform(Number);

export const placeOrderSchema = z.object({
  quantity: positiveNumberString("Quantity"),
});

export const addCropSchema = z.object({
  name: z.string().trim().min(1, "Crop name is required."),
  unit: z
    .string()
    .trim()
    .min(1, "Unit is required.")
    .max(20, "Unit must be 20 characters or fewer."),
  category: z
    .string()
    .min(1, "Category is required.")
    .refine(
      (value) => ["Vegetables", "Fruits", "Grains", "Spices"].includes(value),
      "Choose a valid category.",
    ),
  quantity: z
    .string()
    .trim()
    .min(1, "Quantity is required.")
    .refine(
      (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
      "Quantity must be zero or greater.",
    )
    .transform(Number),
  price: nonNegativeNumberString("Price"),
  harvestDate: z
    .string()
    .min(1, "Harvest date is required.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid harvest date."),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid expiry date.")
    .or(z.literal("")),
  region: z.string().trim().min(1, "Region is required."),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be 1000 characters or fewer."),
}).refine(
  ({ harvestDate, expiryDate }) => !expiryDate || expiryDate >= harvestDate,
  {
    message: "Expiry date cannot be earlier than harvest date.",
    path: ["expiryDate"],
  },
);