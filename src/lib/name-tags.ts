import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

export const nameTagAudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALL") }),
  z.object({ kind: z.literal("CHECKED_IN") }),
  z.object({ kind: z.literal("NOT_CHECKED_IN") }),
  z.object({ kind: z.literal("WALK_INS") }),
  z.object({ kind: z.literal("HOSTS") }),
  z.object({ kind: z.literal("GROUP"), id: z.string().min(1) }),
  z.object({ kind: z.literal("TABLE"), id: z.string().min(1) }),
]);

export type NameTagAudience = z.infer<typeof nameTagAudienceSchema>;
export type NameTagRecord = {
  registrationId: string;
  firstName: string;
  lastName: string;
  table: string | null;
  group: string | null;
  organization: string;
  role: "Host" | "Guest" | "Walk-in";
  groupId: string | null;
  tableId: string | null;
  checkedIn: boolean;
};

export type NameTag = NameTagRecord & { fullName: string; detail: string };

export function parseNameTagAudience(input: { audience?: string; groupId?: string; tableId?: string }): NameTagAudience {
  if (input.audience === "CHECKED_IN" || input.audience === "NOT_CHECKED_IN" || input.audience === "WALK_INS" || input.audience === "HOSTS") return { kind: input.audience };
  if (input.audience === "GROUP") return { kind: "GROUP", id: input.groupId ?? "" };
  if (input.audience === "TABLE") return { kind: "TABLE", id: input.tableId ?? "" };
  return { kind: "ALL" };
}

export function createNameTags(records: NameTagRecord[], audience: NameTagAudience): NameTag[] {
  return records
    .filter((record) => {
      switch (audience.kind) {
        case "ALL": return true;
        case "CHECKED_IN": return record.checkedIn;
        case "NOT_CHECKED_IN": return !record.checkedIn;
        case "WALK_INS": return record.role === "Walk-in";
        case "HOSTS": return record.role === "Host";
        case "GROUP": return record.groupId === audience.id;
        case "TABLE": return record.tableId === audience.id;
      }
    })
    .map((record) => ({ ...record, fullName: `${record.firstName} ${record.lastName}`, detail: record.table ?? record.group ?? record.role }))
    .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const BADGE_WIDTH = 243;
const BADGE_HEIGHT = 168;
const LEFT_MARGIN = 63;
const TOP_MARGIN = 60;

function fit(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, preferred: number, maximumWidth: number) {
  let size = preferred;
  while (size > 12 && font.widthOfTextAtSize(text, size) > maximumWidth) size -= 1;
  return size;
}

export async function renderNameTagsPdf(eventName: string, tags: NameTag[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = Math.max(1, Math.ceil(tags.length / 8));
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    for (let slot = 0; slot < 8; slot += 1) {
      const tag = tags[pageIndex * 8 + slot];
      if (!tag) continue;
      const column = slot % 2;
      const row = Math.floor(slot / 2);
      const x = LEFT_MARGIN + column * BADGE_WIDTH;
      const y = PAGE_HEIGHT - TOP_MARGIN - (row + 1) * BADGE_HEIGHT;
      const center = x + BADGE_WIDTH / 2;
      const nameSize = fit(tag.fullName, bold, 25, BADGE_WIDTH - 28);
      const nameWidth = bold.widthOfTextAtSize(tag.fullName, nameSize);
      page.drawText(tag.fullName, { x: center - nameWidth / 2, y: y + 88, size: nameSize, font: bold, color: rgb(0.09, 0.23, 0.2) });
      const detail = tag.detail.slice(0, 42);
      const detailSize = fit(detail, regular, 14, BADGE_WIDTH - 30);
      page.drawText(detail, { x: center - regular.widthOfTextAtSize(detail, detailSize) / 2, y: y + 61, size: detailSize, font: regular, color: rgb(0.25, 0.34, 0.31) });
      const event = eventName.slice(0, 48);
      const eventSize = fit(event, regular, 9, BADGE_WIDTH - 30);
      page.drawText(event, { x: center - regular.widthOfTextAtSize(event, eventSize) / 2, y: y + 28, size: eventSize, font: regular, color: rgb(0.4, 0.46, 0.43) });
    }
  }
  pdf.setTitle(`${eventName} name tags`);
  pdf.setSubject("Avery 5395-compatible name tags");
  return pdf.save();
}
