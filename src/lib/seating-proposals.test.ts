import { describe, expect, it } from "vitest";
import { proposeSeating, type SeatingTableFact } from "./seating-proposals";

describe("seating proposals", () => {
  const tables: SeatingTableFact[] = [{ id: "t1", name: "Table 1", capacity: 4, occupied: 1, groupCounts: { g1: 1 } }, { id: "t2", name: "Table 2", capacity: 2, occupied: 0, groupCounts: {} }];
  it("keeps parties together and prefers established Group context", () => expect(proposeSeating([{ id: "r1", name: "A", partyId: "p1", partyName: "A Party", groupId: "g1", groupName: "Hosts", accessibilitySensitive: false }, { id: "r2", name: "B", partyId: "p1", partyName: "A Party", groupId: "g1", groupName: "Hosts", accessibilitySensitive: false }], tables).proposals[0]).toMatchObject({ tableId: "t1", registrationIds: ["r1", "r2"], seatsRequired: 2 }));
  it("leaves ties and accessibility needs for staff judgment", () => {
    expect(proposeSeating([{ id: "r1", name: "A", partyId: null, partyName: null, groupId: null, groupName: null, accessibilitySensitive: false }], tables).ambiguous[0].reason).toMatch(/No Group/);
    expect(proposeSeating([{ id: "r2", name: "B", partyId: null, partyName: null, groupId: "g1", groupName: "Hosts", accessibilitySensitive: true }], tables).ambiguous[0].reason).toMatch(/Accessibility/);
  });
  it("never proposes a capacity overflow", () => expect(proposeSeating([{ id: "r1", name: "A", partyId: "p1", partyName: "Party", groupId: "g1", groupName: "G", accessibilitySensitive: false }, { id: "r2", name: "B", partyId: "p1", partyName: "Party", groupId: "g1", groupName: "G", accessibilitySensitive: false }, { id: "r3", name: "C", partyId: "p1", partyName: "Party", groupId: "g1", groupName: "G", accessibilitySensitive: false }, { id: "r4", name: "D", partyId: "p1", partyName: "Party", groupId: "g1", groupName: "G", accessibilitySensitive: false }], tables).proposals).toEqual([]));
});
