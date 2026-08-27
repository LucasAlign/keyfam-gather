import { describe, expect, it } from "vitest";
import { normalizeAddress, normalizeName, suggestSimilarNames } from "./person-resolution";

describe("person resolution module interface", () => {
  it("normalizes names and structured addresses deterministically", () => {
    expect(normalizeName(" José  O’Neil ")).toBe("jose o neil");
    expect(normalizeAddress({ firstName: "A", lastName: "B", addressLine1: "12 Main St.", city: "Nashville", region: "TN", postalCode: "37201" })).toBe("12 main st nashville tn 37201");
  });
  it("keeps fuzzy names suggestions-only and conservatively bounded", () => {
    const people = [{ id: "near", firstName: "Katherine", lastName: "Johnson" }, { id: "far", firstName: "Grace", lastName: "Hopper" }];
    expect(suggestSimilarNames({ firstName: "Kathrine", lastName: "Johnson" }, people)).toEqual(["near"]);
    expect(suggestSimilarNames({ firstName: "Al", lastName: "Li" }, people)).toEqual([]);
  });
});
