import { headers } from "next/headers";

export function configuredAppOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Outbound bearer links must use an operator-controlled origin in production;
// deriving them from Host/X-Forwarded-* would let a spoofed request redirect an
// invitation to an attacker-controlled site. Local development keeps a
// request-header fallback so `npm run dev` works without extra configuration.
export async function requestOrigin(): Promise<string | null> {
  const configured = configuredAppOrigin(process.env.APP_ORIGIN);
  if (configured || process.env.NODE_ENV === "production") return configured;
  const list = await headers();
  const host = list.get("host");
  if (!host) return null;
  const proto = list.get("x-forwarded-proto") === "https" ? "https" : "http";
  return configuredAppOrigin(`${proto}://${host}`);
}
