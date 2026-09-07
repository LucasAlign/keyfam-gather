"use client";

import { useActionState, useState } from "react";
import { issueAdditionalHostAccess, recoverHostAccess, resendHostAccess, revokeHostAccess, rotateHostAccess, type HostAccessActionState } from "@/app/host-actions";
import { SubmitButton } from "@/components/submit-button";

const initial: HostAccessActionState = {};

export type HostAccessCardData = {
  eventId: string;
  eventHostId: string;
  hostName: string;
  groupName: string;
  status: "active" | "expired" | "revoked" | "none";
  tokenId: string | null;
  rotatableTokenId: string | null;
  expiresAt: string | Date | null;
  lastUsedAt: string | Date | null;
  canRecover: boolean;
  canResend: boolean;
};

const when = (value: string | Date) => new Date(value).toLocaleString();

export function HostAccessCard({ host }: { host: HostAccessCardData }) {
  const [recoverState, recover] = useActionState(recoverHostAccess, initial);
  const [resendState, resend] = useActionState(resendHostAccess, initial);
  const [copied, setCopied] = useState(false);
  // The reveal block only renders after a client-side recover action, so window
  // is available here; no server render of this branch means no hydration gap.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = recoverState.path ? `${origin}${recoverState.path}` : null;

  const statusLabel = host.status === "active" ? "Active" : host.status === "revoked" ? "Revoked" : host.status === "expired" ? "Expired" : "No link";

  return <article className="host-access-card">
    <div className="host-access-head">
      <div><strong>{host.hostName}</strong><p>{host.groupName}</p></div>
      <span className={`invitation-status${host.status === "active" ? "" : " is-muted"}`}>{statusLabel}</span>
    </div>
    <p className="form-hint">
      {host.status === "active" && host.expiresAt ? `Expires ${when(host.expiresAt)}` : host.status === "revoked" ? "This link was revoked" : host.status === "expired" ? "This link has expired" : "No active link yet"}
      {` · ${host.lastUsedAt ? `Last used ${when(host.lastUsedAt)}` : "Not used yet"}`}
    </p>

    {host.status === "active" && <div className="host-access-actions">
      {host.canRecover && <form action={recover}>
        <input type="hidden" name="eventId" value={host.eventId} />
        <input type="hidden" name="tokenId" value={host.tokenId ?? ""} />
        <SubmitButton pendingText="Retrieving…">Show current link</SubmitButton>
      </form>}
      {host.canResend && <form action={resend}>
        <input type="hidden" name="eventId" value={host.eventId} />
        <input type="hidden" name="tokenId" value={host.tokenId ?? ""} />
        <SubmitButton pendingText="Sending…">Resend to host</SubmitButton>
      </form>}
      <form action={revokeHostAccess} onSubmit={(event) => { if (!window.confirm("Revoke this host link now? Anyone using it will immediately lose access.")) event.preventDefault(); }}>
        <input type="hidden" name="eventId" value={host.eventId} />
        <input type="hidden" name="tokenId" value={host.tokenId ?? ""} />
        <button type="submit">Revoke</button>
      </form>
    </div>}

    {host.status === "active"
      ? <form action={rotateHostAccess} className="host-access-rotate" onSubmit={(event) => { if (!window.confirm("Rotate replaces the current link with a new one. The existing link will stop working immediately and must be re-shared. Continue?")) event.preventDefault(); }}>
          <input type="hidden" name="eventId" value={host.eventId} />
          <input type="hidden" name="tokenId" value={host.rotatableTokenId ?? ""} />
          <button type="submit" className="button secondary" disabled={!host.rotatableTokenId}>Rotate link</button>
          <small className="form-hint">Rotating invalidates the current link — only use it if the link may be compromised.</small>
        </form>
      : <form action={issueAdditionalHostAccess} className="host-access-rotate">
          <input type="hidden" name="eventId" value={host.eventId} />
          <input type="hidden" name="eventHostId" value={host.eventHostId} />
          <button type="submit" className="button secondary">Create shareable link</button>
          <small className="form-hint">Issues a fresh host portal link to share.</small>
        </form>}

    {link && <div className="access-card revealed" role="status">
      <p>Share this private link. It works like a password.</p>
      <div className="host-access-link"><input readOnly value={link} aria-label="Host portal link" onFocus={(event) => event.currentTarget.select()} /><button type="button" className="button secondary" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? "Copied" : "Copy"}</button></div>
      <a className="portal-link" href={recoverState.path!}>Open host portal</a>
    </div>}
    {recoverState.error && <div className="alert" role="alert">{recoverState.error}</div>}
    {resendState.success && <div className="success" role="status">{resendState.success}</div>}
    {resendState.error && <div className="alert" role="alert">{resendState.error}</div>}
  </article>;
}
