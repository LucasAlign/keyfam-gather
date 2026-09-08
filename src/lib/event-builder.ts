export type EventBuildProposal = {
  name: string; eventType: string; startsAt: string; endsAt: string; timezone: string; capacity: number | null;
  venue: string; address: string; registrationOpensAt: string; registrationClosesAt: string; isPublic: boolean;
  contactName: string; contactEmail: string; contactPhone: string; tableCount: number | null; seatsPerTable: number | null;
  assumptions: string[]; missingRequired: string[]; suggestedQuestions: Array<{ key: string; label: string; type: "TEXTAREA" }>; communicationPlan: string[];
};

const months = new Map([["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6], ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12]]);

function localDateTime(month: string, day: string, year: string, hour = "00", minute = "00", meridiem?: string) {
  let hours = Number(hour);
  if (meridiem?.toLowerCase() === "pm" && hours < 12) hours += 12;
  if (meridiem?.toLowerCase() === "am" && hours === 12) hours = 0;
  return `${year}-${String(months.get(month.toLowerCase())).padStart(2, "0")}-${day.padStart(2, "0")}T${String(hours).padStart(2, "0")}:${minute}`;
}

function eventDate(text: string) {
  const match = /\b(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,)?\s+(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text);
  return match ? { value: localDateTime(match[1], match[2], match[3], match[4], match[5] ?? "00", match[6]), year: match[3], match } : null;
}

function registrationDate(text: string, verb: "open" | "close", year: string | null) {
  if (!year) return "";
  const expression = verb === "open" ? /\bopen(?:s|ing)?(?:\s+publicly)?\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i : /\bclose(?:s|ing)?\s+(?:on\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i;
  const match = expression.exec(text);
  return match ? localDateTime(match[1], match[2], match[3] ?? year) : "";
}

export function proposeEventBuild(description: string): EventBuildProposal {
  const text = description.trim();
  const capacity = Number(/(?:for|capacity(?: of)?)\s+(\d{1,6})\s+(?:people|guests|attendees)/i.exec(text)?.[1] ?? 0) || null;
  const tableMatch = /(\d{1,4})\s+tables?\s+(?:of|with|seating)\s+(\d{1,3})/i.exec(text);
  const tableCount = tableMatch ? Number(tableMatch[1]) : null; const seatsPerTable = tableMatch ? Number(tableMatch[2]) : null;
  const eventType = /banquet/i.test(text) ? "Fundraising banquet" : /gala/i.test(text) ? "Fundraising gala" : /fundrais/i.test(text) ? "Fundraising event" : "Community event";
  const nameMatch = /\b(?:holding|hosting|planning)\s+(?:the\s+)?(.+?)(?=,\s+(?:an?\s+)?(?:fundraising|community|charity|gala|banquet)|\s+for\s+\d)/i.exec(text);
  const name = nameMatch?.[1].trim() || eventType.replace(/\b\w/g, (letter) => letter.toUpperCase());
  const start = eventDate(text);
  const endMatch = start ? /\b(?:to|until)\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(text.slice((start.match.index ?? 0) + start.match[0].length)) : null;
  const endsAt = start && endMatch ? localDateTime(start.match[1], start.match[2], start.year, endMatch[1], endMatch[2] ?? "00", endMatch[3]) : "";
  const venueMatch = /\b(?:AM|PM)\s+at\s+(.+?)\s+in\s+(.+?)(?=\.|\s+Registration\b|$)/i.exec(text);
  const contactMatch = /\bcontact\s+is\s+(.+?)\s+at\s+([^\s,;]+@[^\s,;]+)/i.exec(text);
  const phoneMatch = /(?:phone|call)\s+(?:is\s+|at\s+)?(\+?[\d(][\d\s().-]{6,}\d)/i.exec(text);
  const assumptions = [tableCount && seatsPerTable && capacity && tableCount * seatsPerTable === capacity ? `${tableCount} Tables of ${seatsPerTable} exactly cover the ${capacity}-guest capacity.` : tableCount && seatsPerTable && capacity ? `Table seats total ${tableCount * seatsPerTable}, which differs from Event capacity ${capacity}; staff should review.` : "Table layout was not fully specified.", "The Event starts as a Draft; review the proposed public registration window before advancing it.", "Host Groups use the same numbering as Tables but do not reserve seats by themselves."];
  return { name, eventType, startsAt: start?.value ?? "", endsAt, timezone: "America/New_York", capacity, venue: venueMatch?.[1].trim() ?? "", address: venueMatch?.[2].trim() ?? "", registrationOpensAt: registrationDate(text, "open", start?.year ?? null), registrationClosesAt: registrationDate(text, "close", start?.year ?? null), isPublic: /\bpublic(?:ly)?\b/i.test(text), contactName: contactMatch?.[1].trim() ?? "", contactEmail: contactMatch?.[2].replace(/[.]$/, "") ?? "", contactPhone: phoneMatch?.[1].trim() ?? "", tableCount, seatsPerTable, assumptions, missingRequired: [!text && "Event description", !start && "Start date and time", !endsAt && "End date and time"].filter(Boolean) as string[], suggestedQuestions: [{ key: "dietary_needs", label: "Dietary needs", type: "TEXTAREA" }, { key: "accessibility_needs", label: "Accessibility or seating accommodations", type: "TEXTAREA" }], communicationPlan: ["Registration opening announcement", "Registration reminder", "Event-week details", "Post-Event thank-you"] };
}
