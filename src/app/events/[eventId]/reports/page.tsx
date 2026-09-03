import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { getEventReportWorkspace } from "@/lib/event-report-workspace";
import type { ReportKind } from "@/lib/reporting";

export const dynamic = "force-dynamic";

const exports: Array<{ kind: ReportKind; label: string; description: string }> = [
  { kind: "registrations", label: "Registrations", description: "Canonical guest, source, group, table, and attendance data." },
  { kind: "cancellations", label: "Cancellations", description: "Cancelled registrations and their original event assignments." },
  { kind: "attendance", label: "Attendance", description: "Guests with an active check-in and its timestamp." },
  { kind: "no-shows", label: "No-shows", description: "Registered guests who have not arrived." },
  { kind: "walk-ins", label: "Walk-ins", description: "Event-night registrations and their attendance state." },
  { kind: "hosts", label: "Hosts", description: "Event hosts and the groups they manage." },
  { kind: "groups", label: "Groups", description: "Capacity, registration, and attendance totals by group." },
  { kind: "tables", label: "Tables", description: "Capacity, assignments, attendance, and overages by table." },
  { kind: "invitations", label: "Invitations", description: "Invitation contact, status, lifecycle, and conversion data." },
  { kind: "invitation-conversion", label: "Invitation conversion", description: "Funnel totals and conversion rates." },
];

export default async function ReportsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const workspace = await getEventReportWorkspace(eventId);
  if (!workspace) notFound();
  const { event, report } = workspace;
  const funnel = report.invitationConversion;
  return <>
    <LiveRefresh />
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Dashboard & reporting</p><h1>Reports & exports</h1><p>Monitor attendance, spot seating exceptions, and export canonical event data.</p><small className="live-note">Live report · refreshes every 5 seconds</small></div></div>
    <section className="metrics dashboard-metrics"><div><strong>{report.metrics.registered}</strong><span>Registered</span></div><div><strong>{report.metrics.checkedIn}</strong><span>Checked in</span></div><div><strong>{report.metrics.attendancePercent}%</strong><span>Attendance</span></div><div><strong>{report.metrics.notArrived}</strong><span>Not arrived</span></div><div><strong>{report.metrics.walkIns}</strong><span>Walk-ins</span></div><div className={report.metrics.unassignedGuests ? "metric-attention" : ""}><strong>{report.metrics.unassignedGuests}</strong><span>Unassigned guests</span></div><div className={report.metrics.tableIssues ? "metric-attention" : ""}><strong>{report.metrics.tableIssues}</strong><span>Table issues</span></div></section>
    <div className="report-grid">
      <section className="report-panel"><div className="section-heading"><h2>Attendance</h2><span>{report.metrics.registered}</span></div><div className="report-bars"><div><span>Checked in</span><strong>{report.metrics.checkedIn}</strong><i style={{ width: `${report.metrics.attendancePercent}%` }} /></div><div><span>Not arrived</span><strong>{report.metrics.notArrived}</strong><i style={{ width: `${100 - report.metrics.attendancePercent}%` }} /></div></div></section>
      <section className="report-panel"><div className="section-heading"><h2>Invitation conversion</h2><span>{funnel.total}</span></div><div className="funnel-row"><div><strong>{funnel.delivered}</strong><span>Sent</span></div><div><strong>{funnel.opened}</strong><span>Opened</span></div><div><strong>{funnel.converted}</strong><span>Registered</span></div></div><p className="form-hint">{funnel.openRate}% open rate · {funnel.conversionRate}% registration conversion</p></section>
    </div>
    <section className="event-section"><div className="section-heading"><h2>Table health</h2><span>{report.tables.length}</span></div>{report.tables.length === 0 ? <div className="empty compact"><h3>No tables created</h3><p>Create tables in the seating workspace to monitor capacity.</p></div> : <div className="report-table"><div className="report-table-head"><span>Table</span><span>Assigned</span><span>Checked in</span><span>Status</span></div>{report.tables.map((table) => <div key={table.name}><strong>{table.name}</strong><span>{table.assigned} / {table.capacity}</span><span>{table.checkedIn}</span><span className={table.overBy ? "issue-text" : "ok-text"}>{table.overBy ? `${table.overBy} over capacity` : `${table.remaining} seats left`}</span></div>)}</div>}</section>
    <section><div className="section-heading"><h2>CSV exports</h2><span>{exports.length}</span></div><p className="lede">Exports are generated from current event data and open in Excel, Numbers, or Google Sheets.</p><div className="export-grid">{exports.map((item) => <article key={item.kind}><div><h3>{item.label}</h3><p>{item.description}</p></div><a className="button secondary" href={`/events/${eventId}/reports/export?report=${item.kind}`}>Download CSV</a></article>)}</div></section>
  </>;
}
