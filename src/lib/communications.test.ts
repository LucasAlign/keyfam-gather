import { describe, expect, it } from "vitest";
import { type AudienceCandidate, buildAudience, matchesSegment, renderTemplate } from "./communications";

const candidate = (overrides: Partial<AudienceCandidate>): AudienceCandidate => ({
  personId: "p1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "615-555-0100",
  optOut: false, isRegistered: false, isCheckedIn: false, isHost: false, isUnderfilledGroupHost: false,
  invitationPending: false, isSponsorContact: false, ...overrides,
});

describe("matchesSegment", () => {
  it("classifies no-shows as registered but not checked in", () => {
    expect(matchesSegment(candidate({ isRegistered: true, isCheckedIn: false }), "no_shows")).toBe(true);
    expect(matchesSegment(candidate({ isRegistered: true, isCheckedIn: true }), "no_shows")).toBe(false);
    expect(matchesSegment(candidate({ isRegistered: true, isCheckedIn: true }), "checked_in")).toBe(true);
  });
  it("routes hosts, underfilled hosts, invited, and sponsors to their segments", () => {
    expect(matchesSegment(candidate({ isHost: true }), "hosts")).toBe(true);
    expect(matchesSegment(candidate({ isUnderfilledGroupHost: true }), "underfilled_group_hosts")).toBe(true);
    expect(matchesSegment(candidate({ invitationPending: true }), "invited_no_response")).toBe(true);
    expect(matchesSegment(candidate({ isSponsorContact: true }), "sponsors")).toBe(true);
  });
});

describe("buildAudience", () => {
  const people = [
    candidate({ personId: "reg-email", isRegistered: true, phone: null }),
    candidate({ personId: "reg-optout", isRegistered: true, optOut: true }),
    candidate({ personId: "reg-nophone", isRegistered: true, email: null, phone: null }),
    candidate({ personId: "host-only", isHost: true }),
  ];
  it("returns reachable recipients and counts opt-outs and unreachable separately", () => {
    const result = buildAudience(people, "active_registrations", "EMAIL");
    expect(result.recipients.map((r) => r.personId)).toEqual(["reg-email"]);
    expect(result.optedOut).toBe(1);
    expect(result.unreachable).toBe(1); // reg-nophone has no email
  });
  it("switches contact by channel", () => {
    const smsResult = buildAudience([candidate({ personId: "p", isRegistered: true, email: null, phone: "615-555-0100" })], "active_registrations", "SMS");
    expect(smsResult.recipients[0]?.recipient).toBe("615-555-0100");
  });
  it("does not duplicate a person who matches twice", () => {
    const dupe = candidate({ personId: "same", isRegistered: true });
    expect(buildAudience([dupe, { ...dupe }], "active_registrations", "EMAIL").recipients).toHaveLength(1);
  });
});

describe("renderTemplate", () => {
  it("substitutes known placeholders and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{firstName}}, see you at {{eventName}} on {{eventDate}}. {{mystery}}", { firstName: "Ada", eventName: "Spring Gala", eventDate: "Oct 10" }))
      .toBe("Hi Ada, see you at Spring Gala on Oct 10. ");
  });
  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("Hello {{ firstName }}", { firstName: "Grace" })).toBe("Hello Grace");
  });
});
