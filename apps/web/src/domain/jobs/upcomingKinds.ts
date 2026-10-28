/**
 * The kinds of listings Find's menu says are coming (owner, 2026-10-25), shown disabled under "Coming soon" below
 * Full Time Jobs, Part Time Jobs and Internships (built 2026-10-28, WJ-413). They are not Find modes: `FindMode`, `FIND_MODE_PATCH`, search, filters and the
 * stores don't know them, and nothing here ever lists a job or a sample — until one is built for real, it is a
 * label and a line. Each can be hidden or shown by a platform admin (Admin → Settings → Menus → Find menu).
 */
export const UPCOMING_KINDS = [
  { id: "teaching", label: "Teaching", hint: "School and college teachers" },
  { id: "cofounders", label: "Co-founders", hint: "Find someone to build with" },
  { id: "talent_services", label: "Talent & Services", hint: "Hire or offer a skill" },
  { id: "therapists", label: "Therapists", hint: "Licensed counsellors near you" },
  { id: "events_social", label: "Events & Social", hint: "Meetups and things to do" },
  { id: "buy_sell_rent", label: "Buy, Sell & Rent", hint: "Pre-used items" },
] as const;

export type UpcomingKindId = (typeof UPCOMING_KINDS)[number]["id"];
