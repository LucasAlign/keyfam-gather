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

export const hostSchema = registrationSchema.and(z.object({
  groupMode: z.enum(["create", "existing"]),
  groupId: z.string().trim().optional(),
  groupName: z.string().trim().max(120).optional(),
  capacity: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().max(10000).optional()),
})).superRefine((value, context) => {
  if (value.groupMode === "create" && !value.groupName) context.addIssue({ code: "custom", path: ["groupName"], message: "Enter a group name." });
  if (value.groupMode === "existing" && !value.groupId) context.addIssue({ code: "custom", path: ["groupId"], message: "Choose a group." });
});

export const hostGuestSchema = registrationSchema;

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Enter a group name.").max(120),
  capacity: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().max(10000).optional()),
});

export const tableSchema = z.object({
  name: z.string().trim().min(1, "Enter a table name or number.").max(80),
  capacity: z.coerce.number().int().positive("Capacity must be at least 1.").max(1000),
  notes: z.string().trim().max(500).optional(),
});

export const partySchema = z.object({
  name: z.string().trim().min(1, "Enter a party name.").max(120),
  registrationIds: z.array(z.string().min(1)).min(1, "Choose at least one person."),
});

export const seatingMoveSchema = z.object({
  sourceType: z.enum(["registration", "group", "party"]),
  sourceId: z.string().min(1),
  tableId: z.union([z.literal(""), z.string().min(1)]),
  overrideCapacity: z.preprocess((value) => value === "on" || value === true, z.boolean()),
});

export const checkInSchema = z.object({
  registrationId: z.string().min(1),
  deviceId: z.string().trim().min(1).max(120),
});

export const walkInSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.")]),
  phone: z.string().trim().max(30),
  groupId: z.union([z.literal(""), z.string().min(1)]),
  tableId: z.union([z.literal(""), z.string().min(1)]),
  deviceId: z.string().trim().min(1).max(120),
  overrideCapacity: z.preprocess((value) => value === "on" || value === true, z.boolean()),
});
