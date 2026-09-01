export type ReadinessItem = { id: string; label: string; why: string; href: string; level: "Required" | "Recommended" | "Optional"; complete: boolean };

export function eventReadiness(event: { id: string; contactEmail: string | null; contactPhone: string | null; fundraisingGoalCents: number | null; isPublic: boolean; tableCount: number; registrationCount: number; hostCount: number; sponsorshipCount: number; checkInReady: boolean }) {
  const base = `/events/${event.id}`;
  return [
    { id: "contact", label: "Add an Event contact", why: "Guests need a clear person to contact with questions.", href: `${base}/settings`, level: "Required", complete: Boolean(event.contactEmail || event.contactPhone) },
    { id: "goal", label: "Set the fundraising goal", why: "A goal makes financial progress and remaining work visible.", href: `${base}/fundraising`, level: "Recommended", complete: event.fundraisingGoalCents !== null },
    { id: "sponsors", label: "Record Sponsorships", why: "Track sponsor money, guests, and promised recognition together.", href: `${base}/fundraising`, level: "Optional", complete: event.sponsorshipCount > 0 },
    { id: "tables", label: "Create Seating Tables", why: "Tables are seating destinations; Groups describe guest context and do not reserve seats by themselves.", href: `${base}/seating`, level: "Recommended", complete: event.tableCount > 0 },
    { id: "registration", label: "Test Registration", why: "A test Registration confirms the guest questions and identity flow work as intended.", href: `${base}/register`, level: "Required", complete: event.registrationCount > 0 },
    { id: "hosts", label: "Invite Hosts", why: "A Host manages guests in one Group through a private portal.", href: `${base}/hosts/new`, level: "Optional", complete: event.hostCount > 0 },
    { id: "import", label: "Import existing lists", why: "Bring existing People and assignments in before staff re-enter them.", href: `${base}/registrations/import`, level: "Optional", complete: event.registrationCount > 0 },
    { id: "public", label: "Share public Registration", why: "Guests can only use the public link after it is enabled in Event settings.", href: `${base}/settings`, level: "Recommended", complete: event.isPublic },
    { id: "checkin", label: "Prepare check-in", why: "Confirm staff access, Tables, and guest records before Event day.", href: `${base}/check-in`, level: "Required", complete: event.checkInReady },
  ] satisfies ReadinessItem[];
}

export function friendlyEventStatus(status: string) {
  return ({ DRAFT: "Draft", REGISTRATION_OPEN: "Registration open", REGISTRATION_CLOSED: "Registration closed", EVENT_LIVE: "Event live", COMPLETED: "Completed", ARCHIVED: "Archived" } as Record<string, string>)[status] ?? status;
}

export function lifecycleConsequences(status: string) {
  return ({
    REGISTRATION_OPEN: ["Public Registration can accept guests when enabled and within its configured dates.", "Event details, questions, seating, and Hosts remain editable."],
    REGISTRATION_CLOSED: ["Public Registration stops accepting guests.", "Authorized staff can still manage Registrations and seating."],
    EVENT_LIVE: ["Check-in and walk-in operations become the primary workflow.", "Registration remains closed to the public."],
    COMPLETED: ["Attendance is treated as final for reporting and stewardship.", "Corrections remain available to authorized staff."],
    ARCHIVED: ["The Event becomes read-only.", "This forward-only transition cannot be undone from the interface."],
  } as Record<string, string[]>)[status] ?? [];
}
