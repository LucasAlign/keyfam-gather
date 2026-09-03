import { z } from "zod";

const optionalDate = z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.date().optional());
const optionalUrl = z.union([z.literal(""), z.string().trim().url("Enter a complete URL, including https://").refine((value) => value.startsWith("https://"), "Use a secure https:// URL.")]);

const eventFields = z.object({
  name: z.string().trim().min(2, "Enter an event name.").max(120),
  description: z.string().trim().max(1200).optional(),
  eventType: z.string().trim().min(2, "Enter an event type.").max(80).default("Fundraising event"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().trim().min(1),
  venue: z.string().trim().max(160).optional(),
  address: z.string().trim().max(500).optional(),
  capacity: z.preprocess((v) => v === "" ? undefined : v, z.coerce.number().int().positive().max(100000).optional()),
  registrationOpensAt: optionalDate,
  registrationClosesAt: optionalDate,
  isPublic: z.preprocess((value) => value === "on" || value === true, z.boolean()).default(false),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid contact email.")]).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  brandingPrimaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit color.").default("#173a32"),
  brandingLogoUrl: optionalUrl.optional(),
});

function validateEventTiming(value: { startsAt: Date; endsAt: Date; timezone?: string; registrationOpensAt?: Date; registrationClosesAt?: Date }, context: z.RefinementCtx) {
  if (value.endsAt <= value.startsAt) context.addIssue({ code: "custom", message: "End time must be after start time.", path: ["endsAt"] });
  if (value.registrationOpensAt && value.registrationClosesAt && value.registrationClosesAt <= value.registrationOpensAt) context.addIssue({ code: "custom", message: "Registration must close after it opens.", path: ["registrationClosesAt"] });
  if (value.timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(value.startsAt); }
    catch { context.addIssue({ code: "custom", message: "Enter a valid IANA timezone, such as America/New_York.", path: ["timezone"] }); }
  }
}

export const eventSchema = eventFields.superRefine(validateEventTiming);
export const eventUpdateSchema = eventFields.extend({ eventId: z.string().min(1) }).superRefine(validateEventTiming);
export const eventDuplicateSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationOpensAt: optionalDate,
  registrationClosesAt: optionalDate,
}).superRefine(validateEventTiming);

export const registrationSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().min(1, "Enter a last name.").max(80),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.")]),
  phone: z.string().trim().max(30),
}).refine((value) => value.email || value.phone, { message: "Add an email or phone number so this person can be matched later.", path: ["email"] });

export const registrationUpdateSchema = registrationSchema.safeExtend({
  registrationId: z.string().min(1),
});

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

export const invitationSchema = registrationSchema.and(z.object({
  groupId: z.union([z.literal(""), z.string().min(1)]).optional().default(""),
}));

export const invitationRegistrationSchema = registrationSchema;

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Enter a group name.").max(120),
  capacity: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().positive().max(10000).optional()),
});

export const tableSchema = z.object({
  name: z.string().trim().min(1, "Enter a table name or number.").max(80),
  capacity: z.coerce.number().int().positive("Capacity must be at least 1.").max(1000),
  notes: z.string().trim().max(500).optional(),
});
export const bulkTableSchema = z.object({
  count: z.coerce.number().int().min(1).max(500),
  startingNumber: z.coerce.number().int().min(0).max(100000),
  namePattern: z.string().trim().min(1).max(60).refine((value) => value.includes("{n}"), "Include {n} where the number should appear."),
  capacity: z.coerce.number().int().positive().max(1000),
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

// Event communications center (issue #17).
export const messageTemplateSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1, "Name the template.").max(120),
  category: z.enum(["INVITATION", "CONFIRMATION", "REMINDER", "LOGISTICS", "THANK_YOU", "NO_SHOW"]),
  channel: z.enum(["EMAIL", "SMS"]),
  subject: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(200).optional()),
  body: z.string().trim().min(1, "Write the message body.").max(4000),
});

export const campaignSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1, "Name the campaign.").max(120),
  category: z.enum(["INVITATION", "CONFIRMATION", "REMINDER", "LOGISTICS", "THANK_YOU", "NO_SHOW"]),
  channel: z.enum(["EMAIL", "SMS"]),
  segment: z.enum(["active_registrations", "checked_in", "no_shows", "hosts", "underfilled_group_hosts", "invited_no_response", "sponsors"]),
  subject: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(200).optional()),
  body: z.string().trim().min(1, "Write the message body.").max(4000),
  templateId: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  scheduledFor: optionalDate,
}).refine((data) => data.channel !== "EMAIL" || (data.subject && data.subject.length > 0), { message: "Email campaigns need a subject.", path: ["subject"] });
