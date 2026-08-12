import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./normalization";

describe("person contact normalization", () => {
  it("normalizes email casing and whitespace", () => expect(normalizeEmail(" Test@Example.COM ")).toBe("test@example.com"));
  it("normalizes US phone formatting", () => expect(normalizePhone("+1 (615) 555-0123")).toBe("6155550123"));
});
