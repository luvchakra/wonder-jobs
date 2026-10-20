/**
 * My Saved Skills (owner, 2026-10-20): skills and certifications the candidate chose to learn, and how far they
 * say they've got. The level is the candidate's own rating — Wonder never sets it — and once it's high enough
 * the skill is ready to go on their Career Profile and résumé, where it's only ever added on their press.
 */
export type SavedKind = "skill" | "certification";
export type SavedLevel = 0 | 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<SavedKind, readonly [string, string, string, string, string]> = {
  skill: ["Not started", "Learning", "Practising", "Confident", "Expert"],
  certification: ["Not started", "Studying", "Practice tests", "Exam booked", "Earned"],
};

export interface SavedItem {
  name: string;
  kind: SavedKind;
  level: SavedLevel;
}

/** Ready for the résumé: a skill the candidate is Confident in or better, a certification they've Earned. */
export function readyForResume(item: SavedItem): boolean {
  return item.kind === "skill" ? item.level >= 3 : item.level === 4;
}

/** The Career Profile's 1–5 skill level for a tracked one: Confident is 4, Expert 5. */
export function profileLevel(level: SavedLevel): 1 | 2 | 3 | 4 | 5 {
  return (Math.max(1, level + 1) as 1 | 2 | 3 | 4 | 5);
}

/** How far along a saved item is, 0–100, for its bar. */
export function percent(level: SavedLevel): number {
  return level * 25;
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, "");

/** Whether the Career Profile already shows it, so the résumé would too. */
export function onProfile(item: SavedItem, profile: { skills: string[]; certifications: string[] }): boolean {
  const k = key(item.name);
  const list = item.kind === "skill" ? profile.skills : profile.certifications;
  return list.some((x) => {
    const h = key(x);
    return h === k || h.includes(k) || k.includes(h);
  });
}

export interface ProgressSummary {
  saved: number;
  /** Ready for the résumé but not yet on the profile. */
  toAdd: number;
  /** The average of the items' progress, 0–100. */
  average: number;
}

export function summarize(items: SavedItem[], profile: { skills: string[]; certifications: string[] }): ProgressSummary {
  if (!items.length) return { saved: 0, toAdd: 0, average: 0 };
  return {
    saved: items.length,
    toAdd: items.filter((i) => readyForResume(i) && !onProfile(i, profile)).length,
    average: Math.round(items.reduce((n, i) => n + percent(i.level), 0) / items.length),
  };
}
