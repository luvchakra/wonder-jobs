/**
 * Release notes, newest first (owner, 2026-10-19). A new entry is added only when the owner confirms a version
 * is live, and it covers, at a high level and in the app's own words, every user-facing change merged since the
 * previous entry — the pull requests after that entry's `through`. Shown in the help guide's Release notes section.
 */
export interface ReleaseNote {
  /** The day the owner confirmed it live (YYYY-MM-DD). */
  date: string;
  title: string;
  /** The last pull request this entry covers; the next entry starts after it. */
  through: number;
  /** One line per change, what it does for the candidate. */
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-10-18",
    title: "Job types, Analytics and Apply for this job",
    through: 222,
    items: [
      "Job types: every job shows whether it's Full-time, Part-time, Contract, an Internship, Short-term or a Gig — as the source lists it, or as the title says. Refine has a Job type filter, and typing “part time” or “freelance” in the search box picks the type.",
      "New sources for part-time and gig work: Himalayas part-time, Adzuna India part-time and Freelancer.com gigs.",
      "Analytics, in the sidebar (the account menu on a phone): your applications, replies, the funnel from start to offer, fit and sources — with a date range from 4 weeks to all time, and numbered charts.",
      "Search words read better: “high paying jobs” searches your own roles with the best-paid first, and the mic now fills the search box on every phone browser.",
      "Find is tidier: one compact Looking for card with Change and a pencil Career Profile button, Hide Pipeline beside an icon-only Refine (remembered on every device), and Back to Find searches again when you change your Career Profile.",
      "Apply for this job fills the employer's form in the background, follows a job board's Apply link to the employer, can sign in to or create the employer's portal account for you, and submits only when you press Submit this application. Progress opens while Wonder works, with a folded list of the form's fields.",
      "Jobs are saved only when you press Save, postings older than two weeks are left out, and closed board postings drop out of your list.",
      "Your account: add a profile photo, and on a phone the round ••• button above the bottom bar opens the account menu.",
      "Company logos come from a daily company refresh, and the browser helper (0.3.6) shows the company's logo in its side panel.",
    ],
  },
];
