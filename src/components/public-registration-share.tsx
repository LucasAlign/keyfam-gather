"use client";

import { useState } from "react";

export function PublicRegistrationShare({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/events/${eventId}/public-register`;
  async function copy() {
    await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
    setCopied(true);
  }
  return <div className="button-row"><a className="button secondary" href={path} target="_blank" rel="noreferrer">Preview registration</a><button className="button secondary" type="button" onClick={copy}>{copied ? "Copied" : "Copy registration link"}</button><a className="button secondary" href={`/events/${eventId}/public-registration-qr`} target="_blank" rel="noreferrer">Registration QR</a></div>;
}
