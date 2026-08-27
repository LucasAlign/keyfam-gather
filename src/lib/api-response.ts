import { NextResponse } from "next/server";
import { ApiError } from "@/lib/invitation-service";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function fail(status: number, error: string, fields?: Record<string, string[] | undefined>) {
  return NextResponse.json({ error, ...(fields ? { fields } : {}) }, { status, headers: NO_STORE });
}

// Maps a thrown error onto a JSON response: ApiError keeps its status/message,
// anything else becomes a 500 without leaking internals.
export function mapError(error: unknown) {
  if (error instanceof ApiError) return fail(error.status, error.message, error.fields);
  console.error("Unhandled invitation API error", error);
  return fail(500, "Something went wrong. Please try again.");
}

// Convenience for handlers that just return the service result verbatim.
export async function run(handler: () => Promise<unknown>, successStatus = 200) {
  try {
    return ok(await handler(), successStatus);
  } catch (error) {
    return mapError(error);
  }
}

export async function readJson(request: Request) {
  return request.json().catch(() => null);
}
