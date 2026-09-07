import { describe, expect, it } from "vitest";
import { guestContext, GUEST_CONTEXT_LABELS } from "./guest-context";

describe("guestContext", () => {
  it("treats a host as a host regardless of their group's roles", () => {
    expect(guestContext({ isHost: true, groupHosted: true, groupSponsored: true })).toBe("host");
  });

  it("prefers the sponsor allotment over a general host-guest role", () => {
    expect(guestContext({ isHost: false, groupHosted: true, groupSponsored: true })).toBe("sponsor_guest");
  });

  it("labels a guest in a hosted group a host guest", () => {
    expect(guestContext({ isHost: false, groupHosted: true, groupSponsored: false })).toBe("host_guest");
  });

  it("falls back to individual when no relationship exists", () => {
    expect(guestContext({ isHost: false, groupHosted: false, groupSponsored: false })).toBe("individual");
  });

  it("has a human label for every context", () => {
    expect(GUEST_CONTEXT_LABELS.host).toBe("Host");
    expect(GUEST_CONTEXT_LABELS.sponsor_guest).toBe("Sponsor guest");
  });
});
