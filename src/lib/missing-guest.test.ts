import { describe, expect, it } from "vitest";
import { rankMissingGuestContexts } from "./missing-guest";

describe("missing guest context search", () => {
  it("prioritizes an existing Registration over creating a Person", () => {
    const results = rankMissingGuestContexts("Sam Lee", [{ id: "p", kind: "PERSON", label: "Sam Lee", detail: "Person", searchText: "Sam Lee" }, { id: "r", kind: "REGISTRATION", label: "Sam Lee", detail: "Registered", searchText: "Sam Lee Smith Group" }]);
    expect(results[0].kind).toBe("REGISTRATION");
  });
  it("searches Group, Party, and Table context", () => expect(rankMissingGuestContexts("Smith", [{ id: "g", kind: "GROUP", label: "Smith Group", detail: "Group", searchText: "Smith Group" }, { id: "p", kind: "PARTY", label: "Smith Party", detail: "Party", searchText: "Smith Party" }, { id: "t", kind: "TABLE", label: "Smith Table", detail: "2 seats open", searchText: "Smith Table", availableSeats: 2 }]).map(({ kind }) => kind).sort()).toEqual(["GROUP", "PARTY", "TABLE"]));
});
