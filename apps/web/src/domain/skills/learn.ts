/**
 * Where to learn a skill or earn a credential (owner, 2026-10-20). These are the platforms' own search pages
 * for the exact term — links, not claims about particular courses; what each platform lists is its own.
 */
export interface LearnPlatform {
  id: string;
  name: string;
  href: (term: string) => string;
}

const enc = encodeURIComponent;

export const LEARN_PLATFORMS: LearnPlatform[] = [
  { id: "coursera", name: "Coursera", href: (t) => `https://www.coursera.org/search?query=${enc(t)}` },
  { id: "udemy", name: "Udemy", href: (t) => `https://www.udemy.com/courses/search/?q=${enc(t)}` },
  { id: "edx", name: "edX", href: (t) => `https://www.edx.org/search?q=${enc(t)}` },
  { id: "linkedin", name: "LinkedIn Learning", href: (t) => `https://www.linkedin.com/learning/search?keywords=${enc(t)}` },
  { id: "youtube", name: "YouTube", href: (t) => `https://www.youtube.com/results?search_query=${enc(`${t} course`)}` },
];

/** The term a search should use for a credential: its short name, without the long form in brackets. */
export function searchTerm(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
