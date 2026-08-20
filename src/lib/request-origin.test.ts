import { describe, expect, it } from "vitest";
import { configuredAppOrigin } from "./request-origin";

describe("configured app origin", () => {
  it("normalizes a configured HTTP(S) origin", () => {
    expect(configuredAppOrigin("https://gather.example.org/")).toBe("https://gather.example.org");
    expect(configuredAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects unsafe or malformed values", () => {
    expect(configuredAppOrigin("javascript:alert(1)")).toBeNull();
    expect(configuredAppOrigin("https://user:pass@gather.example.org")).toBeNull();
    expect(configuredAppOrigin("not a URL")).toBeNull();
  });
});
