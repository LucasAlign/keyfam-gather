import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export function buildDashboardMetrics(input: {
  registrations: Array<{ source: string; tableId: string | null; checkIn: { reversedAt: Date | null } | null }>;
  tables: Array<{ capacity: number; assigned: number }>;
}) {
  const registered = input.registrations.length;
  const checkedIn = input.registrations.filter((registration) => registration.checkIn?.reversedAt === null).length;
  return {
    registered,
    checkedIn,
    attendancePercent: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100),
    notArrived: registered - checkedIn,
    walkIns: input.registrations.filter((registration) => registration.source === "WALK_IN").length,
    unassignedGuests: input.registrations.filter((registration) => !registration.tableId).length,
    tableIssues: input.tables.filter((table) => table.assigned > table.capacity).length,
  };
}

export async function getEventDashboard(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      status: true,
      startsAt: true,
      timezone: true,
      venue: true,
      registrations: {
        select: {
          id: true,
          source: true,
          tableId: true,
          person: { select: { firstName: true, lastName: true, email: true, phone: true } },
          group: { select: { name: true } },
          checkIn: { select: { reversedAt: true } },
        },
        orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
      },
      groups: {
        select: {
          id: true,
          name: true,
          capacity: true,
          hosts: { select: { person: { select: { firstName: true, lastName: true } } } },
          _count: { select: { registrations: true } },
        },
        orderBy: { name: "asc" },
      },
      seatingTables: { select: { capacity: true, _count: { select: { registrations: true } } } },
    },
  });
  if (!event) return null;
  const access = await requireActor(event.organizationId, "event:view", event.id);
  const metrics = buildDashboardMetrics({
    registrations: event.registrations,
    tables: event.seatingTables.map((table) => ({ capacity: table.capacity, assigned: table._count.registrations })),
  });
  return { event, access, metrics };
}
