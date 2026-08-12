import { z } from "zod";

export const eventSchema = z.object({
  name: z.string().trim().min(2, "Enter an event name.").max(120),
  description: z.string().trim().max(1200).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().trim().min(1),
  venue: z.string().trim().max(160).optional(),
  capacity: z.preprocess((v) => v === "" ? undefined : v, z.coerce.number().int().positive().max(100000).optional()),
}).refine((value) => value.endsAt > value.startsAt, { message: "End time must be after start time.", path: ["endsAt"] });

export const registrationSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.")]),
  phone: z.string().trim().max(30),
}).refine((value) => value.email || value.phone, { message: "Add an email or phone number so this person can be matched later.", path: ["email"] });
