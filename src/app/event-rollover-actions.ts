"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventFormValues } from "@/lib/event-datetime";
import { performEventRollover } from "@/lib/event-rollover-service";
import { eventRolloverSchema } from "@/lib/validation";

export type EventRolloverActionState = { error?: string; fields?: Record<string, string[]> };

export async function rolloverEvent(_: EventRolloverActionState, formData: FormData): Promise<EventRolloverActionState> {
  const parsed = eventRolloverSchema.safeParse(eventFormValues(formData));
  if (!parsed.success) return { error: "Review the rollover details.", fields: parsed.error.flatten().fieldErrors };

  // Selections arrive as repeated hidden fields; getAll preserves them where the
  // schema (built from Object.fromEntries) would collapse to the last value.
  const selectedPersonIds = formData.getAll("personId").map(String).filter(Boolean);
  const selectedSponsorIds = formData.getAll("sponsorId").map(String).filter(Boolean);

  try {
    const event = await db.event.findUnique({ where: { id: parsed.data.eventId }, select: { organizationId: true } });
    if (!event) throw new Error("This event no longer exists.");
    // Copying configuration is an event:create action; drafting renewal outreach
    // is invitation:manage on the source Event.
    const access = await requireActor(event.organizationId, "invitation:manage", parsed.data.eventId);
    await requireActor(event.organizationId, "event:create");

    const result = await performEventRollover({
      eventId: parsed.data.eventId,
      organizationId: event.organizationId,
      actorId: access.user.id,
      name: parsed.data.name,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      registrationOpensAt: parsed.data.registrationOpensAt,
      registrationClosesAt: parsed.data.registrationClosesAt,
      selectedPersonIds,
      selectedSponsorIds,
    });
    revalidatePath("/");
    redirect(`/events/${result.event.id}/settings?rolledover=1&drafted=${result.draftedInvitations}&skipped=${result.skipped}`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "We couldn't roll this event over." };
  }
}
