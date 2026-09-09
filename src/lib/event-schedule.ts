// Wall-clock schedule helpers for the event forms. Everything here operates on
// the "YYYY-MM-DDTHH:mm" strings that <input type="datetime-local"> produces —
// no timezone math — so the same string the coordinator sees is what we reason
// about. The event's IANA timezone is applied later, on the server, by
// eventInstant in event-datetime.ts.

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const DEFAULT_DURATION_HOURS = 2;

// Duration quick-picks offered under the time inputs. All-day is a full 8-hour
// working span rather than 24h, which is what "all day" means for an event.
export const DURATION_PRESETS: Array<{ label: string; hours: number }> = [
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "3 hours", hours: 3 },
  { label: "All day", hours: 8 },
];

function parseLocal(value: string): Date | null {
  const match = LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  // Build in UTC so the parts are preserved exactly (no local-timezone shift);
  // we only ever read them back as wall-clock parts.
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}T${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`;
}

// Suggest an end time `hours` after the given start, preserving the wall-clock
// value and rolling across day/month/year boundaries. Returns "" for an
// unparseable start so callers can leave the field untouched.
export function suggestEndLocal(startLocal: string, hours: number = DEFAULT_DURATION_HOURS): string {
  const start = parseLocal(startLocal);
  if (!start) return "";
  return formatLocal(new Date(start.getTime() + hours * 60 * 60 * 1000));
}

// Whole-minute duration between two local values, or null if either is
// unparseable or end is not after start.
export function durationMinutes(startLocal: string, endLocal: string): number | null {
  const start = parseLocal(startLocal);
  const end = parseLocal(endLocal);
  if (!start || !end) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return minutes > 0 ? minutes : null;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

// A friendly one-line summary of the chosen window for a live preview under the
// inputs, e.g. "Sat, Oct 10, 2027 · 6:00 – 8:00 PM · 2 hr". Same-day windows
// show the date once; windows that span days show both dates. Returns null when
// the start is unparseable so the caller renders nothing.
export function scheduleSummary(startLocal: string, endLocal: string): string | null {
  const start = parseLocal(startLocal);
  if (!start) return null;
  const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const end = parseLocal(endLocal);
  if (!end || end.getTime() <= start.getTime()) return `${dateFmt.format(start)} · ${timeFmt.format(start)}`;

  const sameDay = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth() && start.getUTCDate() === end.getUTCDate();
  const window = sameDay
    ? `${dateFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`
    : `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${dateFmt.format(end)}, ${timeFmt.format(end)}`;
  const minutes = durationMinutes(startLocal, endLocal);
  return minutes ? `${window} · ${formatDuration(minutes)}` : window;
}
