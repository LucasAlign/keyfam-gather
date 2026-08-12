"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { eventSchema, registrationSchema } from "@/lib/validation";

export type ActionState = { error?: string; fields?: Record<string, string[]> };

function entries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const parsed = eventSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };

  try {
    const { user } = await requireActor(organizationId, "event:create");
    const event = await db.$transaction(async (tx) => {
      const created = await tx.event.create({ data: { organizationId, ...parsed.data } });
      await tx.auditLog.create({ data: { organizationId, eventId: created.id, actorId: user.id, action: "event.created", entityType: "Event", entityId: created.id, newState: JSON.stringify(created) } });
      return created;
    });
    redirect(`/events/${event.id}`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "We couldn't create this event. Try again." };
  }
}

export async function registerPerson(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = registrationSchema.safeParse(entries(formData));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };

  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
    if (!event) return { error: "This event no longer exists." };
    const { user } = await requireActor(event.organizationId, "registration:create");
    const emailNormalized = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const phoneNormalized = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;

    await db.$transaction(async (tx) => {
      const matches = await tx.person.findMany({ where: { organizationId: event.organizationId, OR: [
        ...(emailNormalized ? [{ emailNormalized }] : []),
        ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ] } });
      if (matches.length > 1) throw new Error("The email and phone match different people. Ask an administrator to resolve the records.");
      const person = matches[0] ?? await tx.person.create({ data: {
        organizationId: event.organizationId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email || null,
        emailNormalized,
        phone: parsed.data.phone || null,
        phoneNormalized,
      } });
      const registration = await tx.registration.create({ data: { organizationId: event.organizationId, eventId, personId: person.id } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, actorId: user.id, action: "registration.created", entityType: "Registration", entityId: registration.id, newState: JSON.stringify({ registration, personId: person.id, personReused: Boolean(matches[0]) }) } });
    });
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}?registered=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { error: "This person is already registered for the event." };
    return { error: error instanceof Error ? error.message : "We couldn't register this person. Try again." };
  }
}
