import Link from "next/link";
import { notFound } from "next/navigation";
import { issueRegistrationQrCode, reissueRegistrationQrCode, revokeRegistrationQrCode } from "@/app/checkin-token-actions";
import { PrintButton } from "@/components/print-button";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderCheckInQrSvg } from "@/lib/qr-code";

export const dynamic = "force-dynamic";

export default async function RegistrationQrPage({ params, searchParams }: {
  params: Promise<{ eventId: string; registrationId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { eventId, registrationId } = await params;
  const { token } = await searchParams;
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: { person: true, event: { select: { id: true, organizationId: true, name: true } }, group: true, table: true },
  });
  if (!registration || registration.eventId !== eventId) notFound();
  await requireActor(registration.event.organizationId, "checkin:manage", eventId);
  const active = await db.checkInToken.findFirst({ where: { registrationId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  const svg = token ? await renderCheckInQrSvg(token) : null;

  return <div className="narrow">
    <Link className="back" href={`/events/${eventId}/registrations`}>← Manage registrants</Link>
    <div className="page-heading"><div><p className="eyebrow">Check-in</p><h1>QR check-in code</h1><p>{registration.person.firstName} {registration.person.lastName}{registration.group ? ` · ${registration.group.name}` : ""}{registration.table ? ` · ${registration.table.name}` : ""}</p></div></div>

    {svg && <section className="access-card qr-print" role="status">
      <h2>Save or print this now</h2>
      <p>For security, Gather stores only a digest of this code. It will not be shown again — save or print it before leaving this page.</p>
      <div className="qr-image" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>{registration.person.firstName} {registration.person.lastName} · {registration.event.name}</p>
      <PrintButton>Print this badge</PrintButton>
    </section>}

    {!svg && active && <section className="access-card">
      <h2>A QR code is active</h2>
      <p>{active.lastUsedAt ? `Last scanned ${active.lastUsedAt.toLocaleString()}.` : "Not scanned yet."} The code itself is only shown once, right after it is issued or reissued.</p>
      <div className="invitation-actions">
        <form action={reissueRegistrationQrCode}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="registrationId" value={registrationId} /><button type="submit">Reissue (invalidates the old badge)</button></form>
        <form action={revokeRegistrationQrCode}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="registrationId" value={registrationId} /><button type="submit">Revoke</button></form>
      </div>
    </section>}

    {!svg && !active && <section className="access-card">
      <h2>No QR code yet</h2>
      <p>Generate a secure QR code for this registration. Manual search will keep working whether or not a QR code is issued.</p>
      <form action={issueRegistrationQrCode}><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="registrationId" value={registrationId} /><button className="button" type="submit">Generate QR code</button></form>
    </section>}
  </div>;
}
