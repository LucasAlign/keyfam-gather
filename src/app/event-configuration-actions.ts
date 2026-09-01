"use server";

import { EventStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventFormValues } from "@/lib/event-datetime";
import { duplicateEventConfiguration, transitionEvent, updateEventConfiguration } from "@/lib/event-configuration";
import { eventDuplicateSchema, eventUpdateSchema } from "@/lib/validation";

export type EventConfigurationActionState = { error?: string; success?: string; fields?: Record<string, string[]>; values?: Record<string, string>; token?: string };
async function authorizedEvent(eventId: string) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This event no longer exists.");
  const access = await requireActor(event.organizationId, "event:manage", eventId);
  return { organizationId: event.organizationId, user: access.user };
}

// A fresh token on every return so the client can remount the configuration
// form and re-hydrate fields (React 19 resets uncontrolled inputs after a form
// action, which otherwise clears entered values on a failed save).
function configurationState(state: EventConfigurationActionState): EventConfigurationActionState {
  return { ...state, token: Math.random().toString(36).slice(2) };
}

// The raw submitted strings (as typed), so a failed save can re-render them
// instead of reverting to the last-saved values.
function submittedConfiguration(formData: FormData) {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (key !== "eventId" && typeof value === "string") values[key] = value;
  return values;
}

export async function updateEvent(_: EventConfigurationActionState, formData: FormData): Promise<EventConfigurationActionState> {
  const parsed = eventUpdateSchema.safeParse(eventFormValues(formData));
  if (!parsed.success) return configurationState({ error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors, values: submittedConfiguration(formData) });
  try {
    const { organizationId, user } = await authorizedEvent(parsed.data.eventId);
    await updateEventConfiguration({ ...parsed.data, organizationId, actorId: user.id });
    revalidatePath(`/events/${parsed.data.eventId}`);
    revalidatePath(`/events/${parsed.data.eventId}/settings`);
    return configurationState({ success: "Event configuration saved." });
  } catch (error) {
    return configurationState({ error: error instanceof Error ? error.message : "We couldn't save this event. Try again.", values: submittedConfiguration(formData) });
  }
}

export async function advanceEventStatus(_: EventConfigurationActionState, formData: FormData): Promise<EventConfigurationActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const status = String(formData.get("status") ?? "") as EventStatus;
  if (!eventId || !Object.values(EventStatus).includes(status)) return { error: "Choose a valid event status." };
  try {
    const { organizationId, user } = await authorizedEvent(eventId);
    await transitionEvent({ eventId, organizationId, actorId: user.id, status });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/settings`);
    return { success: "Event lifecycle advanced." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "We couldn't update the event status." };
  }
}

export async function duplicateEvent(_: EventConfigurationActionState, formData: FormData): Promise<EventConfigurationActionState> {
  const parsed = eventDuplicateSchema.safeParse(eventFormValues(formData));
  if (!parsed.success) return { error: "Review the duplicate event details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const { organizationId, user } = await authorizedEvent(parsed.data.eventId);
    await requireActor(organizationId, "event:create");
    const duplicate = await duplicateEventConfiguration({ ...parsed.data, organizationId, actorId: user.id });
    revalidatePath("/");
    redirect(`/events/${duplicate.id}/settings?duplicated=1`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: error instanceof Error ? error.message : "We couldn't duplicate this event." };
  }
}
