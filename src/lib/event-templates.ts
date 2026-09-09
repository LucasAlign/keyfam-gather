// Prefab event templates surfaced on the home screen so coordinators can start
// from a familiar shape instead of a blank form. A template only seeds the
// new-event form's defaults (name, type, description, capacity, visibility, and
// a suggested duration for the auto-end); the coordinator still picks the date
// and can change anything before creating the event.

export type EventTemplate = {
  slug: string;
  label: string;
  emoji: string;
  tagline: string;
  eventType: string;
  description: string;
  durationHours: number;
  suggestedCapacity?: number;
  isPublic: boolean;
};

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    slug: "fundraiser",
    label: "Fundraising Gala",
    emoji: "🎗️",
    tagline: "An evening to rally supporters toward your goal.",
    eventType: "Fundraising event",
    description: "An evening gathering to share your mission, thank supporters, and raise toward this year's goal.",
    durationHours: 3,
    suggestedCapacity: 150,
    isPublic: true,
  },
  {
    slug: "awareness",
    label: "Awareness Night",
    emoji: "📣",
    tagline: "Share your mission and grow your community.",
    eventType: "Awareness event",
    description: "An informational evening to introduce new friends to your work and invite them to get involved.",
    durationHours: 2,
    suggestedCapacity: 100,
    isPublic: true,
  },
  {
    slug: "summit",
    label: "3-Day Summit",
    emoji: "🗓️",
    tagline: "A multi-day conference with sessions across three days.",
    eventType: "Summit",
    description: "A three-day conference with sessions, workshops, and networking. Adjust the end time to match your final day.",
    durationHours: 72,
    suggestedCapacity: 250,
    isPublic: true,
  },
  {
    slug: "pastors-breakfast",
    label: "Pastors Breakfast",
    emoji: "🍳",
    tagline: "A morning gathering to connect with ministry leaders.",
    eventType: "Breakfast",
    description: "A relaxed morning breakfast to connect with local pastors and ministry leaders over shared vision.",
    durationHours: 2,
    suggestedCapacity: 40,
    isPublic: false,
  },
  {
    slug: "volunteer-dinner",
    label: "Volunteer Dinner",
    emoji: "🍽️",
    tagline: "Thank the people who make your work possible.",
    eventType: "Appreciation dinner",
    description: "A dinner to celebrate and thank the volunteers who make your work possible throughout the year.",
    durationHours: 3,
    suggestedCapacity: 80,
    isPublic: false,
  },
  {
    slug: "workshop",
    label: "Community Workshop",
    emoji: "🛠️",
    tagline: "A hands-on session to teach and equip attendees.",
    eventType: "Workshop",
    description: "A hands-on session to teach a skill and equip attendees, with time for questions and practice.",
    durationHours: 4,
    suggestedCapacity: 60,
    isPublic: true,
  },
];

export function getEventTemplate(slug: string | undefined | null): EventTemplate | undefined {
  if (!slug) return undefined;
  return EVENT_TEMPLATES.find((template) => template.slug === slug);
}

// The subset of a template that seeds the new-event form. Keys match the form's
// input names so they slot straight into EventForm's `defaults`, and isPublic is
// encoded as the checkbox's "on"/"" so `defaults.isPublic === "on"` reads true.
export function templateFormDefaults(template: EventTemplate): Record<string, string> {
  return {
    name: template.label,
    eventType: template.eventType,
    description: template.description,
    capacity: template.suggestedCapacity ? String(template.suggestedCapacity) : "",
    isPublic: template.isPublic ? "on" : "",
  };
}
