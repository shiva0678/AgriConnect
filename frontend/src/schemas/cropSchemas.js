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

export const placeOrderSchema = z.object({
  quantity: positiveNumberString("Quantity"),
});

export const addCropSchema = z.object({
  name: z.string().trim().min(1, "Crop name is required."),
  category: z
    .string()
    .min(1, "Category is required.")
    .refine(
      (value) => ["Vegetables", "Fruits", "Grains", "Spices"].includes(value),
      "Choose a valid category.",
    ),
  quantity: positiveNumberString("Quantity"),
  price: positiveNumberString("Price"),
  harvestDate: z.string().min(1, "Harvest date is required."),
  region: z.string().trim().min(1, "Region is required."),
  description: z
    .string()
    .trim()
    .max(1000, "Description must be 1000 characters or fewer."),
});