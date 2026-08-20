import { headers } from "next/headers";

// Best-effort absolute origin for the current request, derived from proxy
// headers the same way rate-limit-request.ts derives the client IP. Used only
// to build an absolute link for outbound delivery messages (email/SMS
// recipients are off-site); in-app links continue to use relative paths.
export async function requestOrigin(): Promise<string | null> {
  const list = await headers();
  const host = list.get("host");
  if (!host) return null;
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
