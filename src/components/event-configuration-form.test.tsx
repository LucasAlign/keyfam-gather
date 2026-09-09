import { EventStatus } from "@prisma/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventConfigurationForm } from "./event-configuration-form";
import type { EventConfigurationActionState } from "@/app/event-configuration-actions";

vi.mock("@/app/event-configuration-actions", () => ({
  updateEvent: vi.fn(),
  advanceEventStatus: vi.fn(),
  duplicateEvent: vi.fn(),
}));
import { updateEvent } from "@/app/event-configuration-actions";

const event = {
  budgetCents: null,
  id: "event-1",
  organizationId: "org-1",
  name: "Spring Gala",
  description: null,
  eventType: "Fundraising event",
  status: EventStatus.DRAFT,
  startsAt: new Date("2026-10-10T22:00:00Z"),
  endsAt: new Date("2026-10-11T02:00:00Z"),
  timezone: "America/New_York",
  venue: null,
  address: null,
  capacity: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  isPublic: false,
  contactEmail: "saved@example.test",
  contactName: "Saved Name",
  contactPhone: null,
  brandingPrimaryColor: "#173a32",
  brandingLogoUrl: null,
  currency: "USD",
  fundraisingGoalCents: null,
  attendanceGoal: null,
  rolledOverFromEventId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EventConfigurationForm contact persistence (issue #8)", () => {
  it("renders saved contact values", () => {
    render(<EventConfigurationForm event={event} nextStatus={EventStatus.REGISTRATION_OPEN} canDuplicate={false} />);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("saved@example.test");
    expect(screen.getByRole("textbox", { name: "Contact name" })).toHaveValue("Saved Name");
  });

  it("refreshes contact values when a lifecycle revalidation returns newer Event data", () => {
    const { rerender } = render(<EventConfigurationForm event={{ ...event, contactEmail: null, contactPhone: null }} nextStatus={EventStatus.COMPLETED} canDuplicate={false} />);
    rerender(<EventConfigurationForm event={{ ...event, contactEmail: "fresh@example.test", contactPhone: "615-555-0199", updatedAt: new Date(event.updatedAt.getTime() + 1) }} nextStatus={EventStatus.ARCHIVED} canDuplicate={false} />);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("fresh@example.test");
    expect(screen.getByRole("textbox", { name: "Phone" })).toHaveValue("615-555-0199");
  });

  it("keeps the coordinator's entered contact values after a failed save", async () => {
    const failure: EventConfigurationActionState = {
      error: "Review the highlighted details.",
      fields: { contactEmail: ["Enter a valid contact email."] },
      values: { name: "Spring Gala", eventType: "Fundraising event", timezone: "America/New_York", contactName: "Jamie Lee", contactEmail: "jamie@newmail.test", contactPhone: "212-555-0100" },
      token: "round-1",
    };
    vi.mocked(updateEvent).mockResolvedValue(failure);
    const { container } = render(<EventConfigurationForm event={event} nextStatus={null} canDuplicate={false} />);

    fireEvent.submit(container.querySelector("form.configuration-form")!);

    expect(await screen.findByText("Enter a valid contact email.")).toBeInTheDocument();
    // The values just typed survive the failed save instead of reverting to the
    // saved event (their uniqueness makes these queries unambiguous).
    expect(await screen.findByDisplayValue("Jamie Lee")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("jamie@newmail.test")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("212-555-0100")).toBeInTheDocument();
    // And the previously-saved contact values are no longer shown.
    expect(screen.queryByDisplayValue("saved@example.test")).toBeNull();
  });
});
