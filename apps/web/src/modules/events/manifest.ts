import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** An event's own page (components/EventPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/events/listing/${encodeURIComponent(id)}`;

/**
 * Events & Social's manifest (docs/WONDERWORKS_PLATFORM.md §4, step 8). Organisers post events with a time, a place or
 * "online", and a capacity; people RSVP, and are waitlisted when it's full. Free events only for now. The one source is
 * WonderWorks' own events (server/events/sources.ts); no outside listing is read. RSVPs: domain.ts, server/events/rsvp.ts.
 */
export const eventsManifest: ModuleManifest = {
  id: "events",
  label: "Events & Social",
  hint: "Meetups and things to do",
  icon: "CalendarDays",
  accent: "pink",
  status: "live",
  menuId: "events_social",
  routes: shellRoutes("events"),
  persona: [
    { key: "interests", label: "Interests", type: "list" },
    { key: "city", label: "City", type: "text" },
  ],
  listing: [
    { key: "startsAt", label: "When", type: "date", facet: true },
    { key: "place", label: "Where", type: "text", facet: true },
    { key: "capacity", label: "Capacity", type: "number" },
    { key: "price", label: "Price", type: "money", facet: true },
  ],
  response: { verb: "rsvp", questions: false, states: ["going", "waitlist", "attended", "no_show"], capability: "events.rsvp" },
  pipeline: { label: "My events", icon: "CalendarHeart", stages: stagesOf("Going", "Waitlist", "Attended"), sections: ["Calendar"] },
  ownerSide: { workspace: "person" },
  trust: { reviews: "off" },
  compliance: ["minors"],
};
