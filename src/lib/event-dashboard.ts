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

export function dashboardPage(total: number, requestedPage: number, pageSize = 25) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1, 1), pageCount);
  return { page, pageSize, pageCount, skip: (page - 1) * pageSize, hasPrevious: page > 1, hasNext: page < pageCount };
}

export async function getEventDashboard(eventId: string, requestedPage = 1, pageSize = 25) {
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
      isPublic: true,
      contactEmail: true,
      contactPhone: true,
      fundraisingGoalCents: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      groups: {
        select: {
          id: true,
          name: true,
          capacity: true,
          hosts: { select: { person: { select: { firstName: true, lastName: true } } } },
          _count: { select: { registrations: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { name: "asc" },
      },
      seatingTables: { select: { capacity: true, _count: { select: { registrations: { where: { status: "ACTIVE" } } } } } },
      _count: { select: { eventHosts: true, sponsorships: true } },
    },
  });
  if (!event) return null;
  const access = await requireActor(event.organizationId, "event:view", event.id);
  const registrationWhere = { eventId, organizationId: event.organizationId, status: "ACTIVE" as const };
  const registered = await db.registration.count({ where: registrationWhere });
  const pagination = dashboardPage(registered, requestedPage, pageSize);
  const [registrations, checkedIn, walkIns, unassignedGuests] = await Promise.all([
    db.registration.findMany({
      where: registrationWhere,
      select: {
        id: true,
        source: true,
        tableId: true,
        person: { select: { firstName: true, lastName: true, email: true, phone: true } },
        group: { select: { name: true } },
        checkIn: { select: { reversedAt: true } },
      },
      orderBy: [{ person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
    db.registration.count({ where: { ...registrationWhere, checkIn: { is: { reversedAt: null } } } }),
    db.registration.count({ where: { ...registrationWhere, source: "WALK_IN" } }),
    db.registration.count({ where: { ...registrationWhere, tableId: null } }),
  ]);
  const tableIssues = event.seatingTables.filter((table) => table._count.registrations > table.capacity).length;
  const metrics = {
    registered,
    checkedIn,
    attendancePercent: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100),
    notArrived: registered - checkedIn,
    walkIns,
    unassignedGuests,
    tableIssues,
  };
  return { event: { ...event, registrations }, access, metrics, pagination };
}
