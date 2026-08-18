const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function partsAt(value: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}

export function eventLocalDateTime(value: Date | null, timeZone: string) {
  if (!value) return "";
  const parts = partsAt(new Date(value), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function eventInstant(value: FormDataEntryValue | Date | null | undefined, timeZone: string) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || value === "") return value;
  const match = dateTimePattern.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = partsAt(new Date(instant), timeZone);
    const shownAsUtc = Date.UTC(Number(shown.year), Number(shown.month) - 1, Number(shown.day), Number(shown.hour), Number(shown.minute));
    instant -= shownAsUtc - target;
  }
  const result = new Date(instant);
  return eventLocalDateTime(result, timeZone) === value ? result : new Date(Number.NaN);
}

export function eventFormValues(formData: FormData) {
  const values: Record<string, FormDataEntryValue | Date> = Object.fromEntries(formData.entries());
  const timezone = String(values.timezone ?? "");
  for (const field of ["startsAt", "endsAt", "registrationOpensAt", "registrationClosesAt"] as const) {
    if (values[field]) {
      try { values[field] = eventInstant(values[field], timezone) as Date; }
      catch { values[field] = new Date(Number.NaN); }
    }
  }
  return values;
}
