import { describe, expect, it } from "vitest";
import { createInvitationToken, hashInvitationToken, invitationCanOpen, invitationCanRespond, invitationStatusLabel, openedStatus } from "./invitations";

describe("invitation lifecycle", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  const future = new Date("2026-08-14T12:00:00Z");
  const past = new Date("2026-08-12T12:00:00Z");

  it("issues opaque tokens and stores only deterministic hashes", () => {
    const issued = createInvitationToken(now);
    expect(issued.token).not.toBe(issued.tokenHash);
    expect(hashInvitationToken(issued.token)).toBe(issued.tokenHash);
    expect(issued.expiresAt).toEqual(new Date("2026-09-12T12:00:00Z"));
  });

  it("opens only active sent invitations", () => {
    expect(invitationCanOpen("SENT", future, now)).toBe(true);
    expect(invitationCanOpen("DRAFT", future, now)).toBe(false);
    expect(invitationCanOpen("CANCELLED", future, now)).toBe(false);
    expect(invitationCanOpen("SENT", past, now)).toBe(false);
  });

  it("prevents a second terminal response", () => {
    expect(invitationCanRespond("OPENED", future, now)).toBe(true);
    expect(invitationCanRespond("REGISTERED", future, now)).toBe(false);
    expect(invitationCanRespond("DECLINED", future, now)).toBe(false);
  });

  it("records the first open and formats funnel labels", () => {
    expect(openedStatus("SENT")).toBe("OPENED");
    expect(openedStatus("REGISTERED")).toBe("REGISTERED");
    expect(invitationStatusLabel("NO_RESPONSE")).toBe("No response");
  });
});
