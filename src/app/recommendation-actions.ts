"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { decideRecommendation } from "@/lib/event-copilot";

const decisionSchema = z.object({ eventId: z.string().min(1), dedupeKey: z.string().min(1), sourceFingerprint: z.string().length(64), decision: z.enum(["APPROVE", "DISMISS", "SNOOZE"]), snoozeDays: z.coerce.number().int().min(1).max(30).optional() });

export async function updateRecommendation(formData: FormData) {
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Review the recommendation decision.");
  const event = await db.event.findUnique({ where: { id: parsed.data.eventId }, select: { organizationId: true } });
  if (!event) throw new Error("This Event no longer exists.");
  const { user } = await requireActor(event.organizationId, "event:manage", parsed.data.eventId);
  const result = await decideRecommendation({ ...parsed.data, organizationId: event.organizationId, actorId: user.id, snoozedUntil: parsed.data.decision === "SNOOZE" ? new Date(Date.now() + (parsed.data.snoozeDays ?? 1) * 86_400_000) : undefined });
  revalidatePath(`/events/${parsed.data.eventId}`);
  if (result.href) redirect(result.href);
}
