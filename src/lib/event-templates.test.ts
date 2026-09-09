import { describe, expect, it } from "vitest";
import { EVENT_TEMPLATES, getEventTemplate, templateFormDefaults } from "./event-templates";

describe("event templates", () => {
  it("offers a non-empty catalog with unique slugs", () => {
    expect(EVENT_TEMPLATES.length).toBeGreaterThan(0);
    const slugs = EVENT_TEMPLATES.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every template a positive suggested duration", () => {
    for (const template of EVENT_TEMPLATES) {
      expect(template.durationHours).toBeGreaterThan(0);
    }
  });

  it("looks templates up by slug and returns undefined for misses", () => {
    expect(getEventTemplate("fundraiser")?.label).toBe("Fundraising Gala");
    expect(getEventTemplate("does-not-exist")).toBeUndefined();
    expect(getEventTemplate(undefined)).toBeUndefined();
  });

  it("maps a template to form defaults keyed by the form's input names", () => {
    const gala = getEventTemplate("fundraiser")!;
    const defaults = templateFormDefaults(gala);
    expect(defaults.name).toBe("Fundraising Gala");
    expect(defaults.eventType).toBe("Fundraising event");
    expect(defaults.capacity).toBe("150");
    expect(defaults.isPublic).toBe("on");
  });

  it("encodes a private template's visibility as an unchecked checkbox", () => {
    const breakfast = getEventTemplate("pastors-breakfast")!;
    expect(templateFormDefaults(breakfast).isPublic).toBe("");
  });
});
