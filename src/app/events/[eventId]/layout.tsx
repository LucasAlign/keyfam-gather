import { AuthorizationError, getActorAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Capability } from "@/lib/permissions";
import { EventWorkspace, type WorkspaceCategory } from "@/components/event-workspace";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { name: true, organizationId: true } });
  if (!event) return children;
  let access;
  try { access = await getActorAccess(event.organizationId, eventId); }
  catch (error) { if (error instanceof AuthorizationError) return children; throw error; }
  // Public registration remains accessible without a staff workspace.
  if (!access.can("event:view")) return children;
  const base = `/events/${eventId}`;
  const tool = (label: string, path: string, group: string, capability: Capability) => access.can(capability) ? [{ label, href: `${base}${path}`, group }] : [];
  const categories: WorkspaceCategory[] = [
    { label: "Overview", tools: [
      ...tool("Dashboard", "", "At a glance", "event:view"),
      ...tool("Reports & exports", "/reports", "Insights", "event:manage"),
      ...tool("Stewardship", "/stewardship", "Insights", "event:manage"),
    ] },
    { label: "Guests", tools: [
      ...tool("Guest list", "/registrations", "Registration", "registration:manage"),
      ...tool("Add guest", "/register", "Registration", "registration:create"),
      ...tool("Import guests", "/registrations/import", "Registration", "registration:manage"),
      ...tool("Duplicate review", "/registrations/duplicates", "Registration", "person:resolve"),
      ...tool("Invitations", "/invitations", "Outreach", "invitation:manage"),
      ...tool("Communications", "/communications", "Outreach", "invitation:manage"),
      ...tool("Hosts & groups", "/hosts/new", "Hosts", "host:manage"),
      ...tool("Host activity", "/hosts/health", "Hosts", "host:manage"),
    ] },
    { label: "Event day", tools: [
      ...tool("Check-in", "/check-in", "Welcome desk", "checkin:manage"),
      ...tool("Missing guests", "/check-in/missing", "Welcome desk", "checkin:manage"),
      ...tool("Name tags", "/name-tags", "Welcome desk", "nametag:manage"),
      ...tool("Live command center", "/command-center", "Operations", "checkin:manage"),
      ...tool("Tables & seating", "/seating", "Operations", "seating:manage"),
      ...tool("Staffing", "/staffing", "Operations", "event:manage"),
    ] },
    { label: "Planning", tools: [
      ...tool("Event settings", "/settings", "Setup", "event:manage"),
      ...tool("Budget & documents", "/planning", "Resources", "event:manage"),
      ...tool("Fundraising", "/fundraising", "Resources", "fundraising:manage"),
      ...(access.can("event:manage") ? tool("Roll over event", "/rollover", "Next event", "event:create") : []),
    ] },
  ].filter((category) => category.tools.length > 0);
  return <EventWorkspace eventName={event.name} categories={categories}>{children}</EventWorkspace>;
}
