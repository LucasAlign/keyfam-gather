export type PublicRegistrationEvent = { isPublic: boolean; status: string; registrationOpensAt: Date | null; registrationClosesAt: Date | null };

export function publicRegistrationAvailability(event: PublicRegistrationEvent, now = new Date()) {
  if (!event.isPublic) return { available: false as const, message: "Public registration is not available for this event." };
  if (event.status !== "REGISTRATION_OPEN") return { available: false as const, message: event.status === "DRAFT" || event.status === "REGISTRATION_CLOSED" ? "Registration is not open right now." : "Registration for this event has ended." };
  if (event.registrationOpensAt && event.registrationOpensAt > now) return { available: false as const, message: `Registration opens ${event.registrationOpensAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.` };
  if (event.registrationClosesAt && event.registrationClosesAt < now) return { available: false as const, message: "Registration for this event has closed." };
  return { available: true as const, message: null };
}
