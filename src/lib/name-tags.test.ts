import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createNameTags, parseNameTagAudience, renderNameTagsPdf, type NameTagRecord } from "./name-tags";

const records: NameTagRecord[] = [
  { registrationId: "2", firstName: "Grace", lastName: "Hopper", table: "Table 2", group: "Navy", organization: "Gather", role: "Host", groupId: "g1", tableId: "t2", checkedIn: true },
  { registrationId: "1", firstName: "Ada", lastName: "Lovelace", table: null, group: "Analytical", organization: "Gather", role: "Guest", groupId: "g2", tableId: null, checkedIn: false },
  { registrationId: "3", firstName: "Katherine", lastName: "Johnson", table: "Table 1", group: null, organization: "Gather", role: "Walk-in", groupId: null, tableId: "t1", checkedIn: true },
];

describe("name-tag module interface", () => {
  it("selects checked-in guests and sorts labels by last name", () => {
    expect(createNameTags(records, { kind: "CHECKED_IN" }).map((tag) => tag.fullName)).toEqual(["Grace Hopper", "Katherine Johnson"]);
  });

  it("scopes group and table audiences to their selected identifier", () => {
    expect(createNameTags(records, { kind: "GROUP", id: "g2" }).map((tag) => tag.registrationId)).toEqual(["1"]);
    expect(createNameTags(records, { kind: "TABLE", id: "t1" }).map((tag) => tag.registrationId)).toEqual(["3"]);
  });

  it("does not accept a missing group or table identifier", () => {
    expect(createNameTags(records, parseNameTagAudience({ audience: "GROUP" }))).toEqual([]);
  });

  it("generates an Avery 5395-compatible PDF with one sheet per eight tags", async () => {
    const bytes = await renderNameTagsPdf("Fall Banquet", Array.from({ length: 9 }, (_, index) => ({ ...createNameTags(records, { kind: "ALL" })[0], registrationId: String(index) })));
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
