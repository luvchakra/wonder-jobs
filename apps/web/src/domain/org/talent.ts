import type { CareerDNA } from "@/domain/career/types";
import type { TalentProfile } from "./types";

/**
 * What a job seeker shows recruiters, built from their Career Profile when they turn on "Open to recruiters" —
 * their first name and last initial, never an email, phone, address or employer history. They see exactly this
 * before it's shown, and it changes only when they press Update.
 */
export function displayName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Candidate";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export function talentProfileFrom(dna: CareerDNA, summary: string): Omit<TalentProfile, "tenantId" | "updatedAt"> {
  return {
    displayName: displayName(dna.name),
    headline: dna.headline.trim().slice(0, 160),
    seniority: dna.seniority,
    yearsExperience: Math.max(0, Math.min(60, Math.round(dna.yearsExperience || 0))),
    skills: dna.skills.map((s) => s.name.trim()).filter(Boolean).slice(0, 30),
    locations: dna.preferredLocations.slice(0, 10),
    workModes: dna.workModes,
    summary: summary.trim().slice(0, 600),
  };
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().split(" ").filter((w) => w.length > 1);

export interface TalentMatch {
  profile: TalentProfile;
  /** How many of the searched words the profile has, and which skills matched. */
  score: number;
  matchedSkills: string[];
}

/**
 * Recruiter search over opted-in profiles: every word typed must appear in the headline, skills or summary;
 * a place, when given, must be one of theirs (or they're open to remote). Ranked by how many words hit skills.
 */
export function searchTalent(profiles: TalentProfile[], query: string, place = ""): TalentMatch[] {
  const q = words(query);
  const where = place.trim().toLowerCase();
  const out: TalentMatch[] = [];
  for (const p of profiles) {
    const skillText = ` ${p.skills.join(" ").toLowerCase()} `;
    const all = ` ${[p.headline, p.summary, p.skills.join(" ")].join(" ").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ")} `;
    if (q.some((w) => !all.includes(` ${w} `))) continue;
    if (where && !p.locations.some((l) => l.toLowerCase().includes(where)) && !p.workModes.includes("remote")) continue;
    const matchedSkills = p.skills.filter((s) => q.some((w) => ` ${s.toLowerCase()} `.includes(` ${w} `)));
    out.push({ profile: p, score: q.filter((w) => skillText.includes(` ${w} `)).length, matchedSkills });
  }
  return out.sort((a, b) => b.score - a.score || b.profile.updatedAt.localeCompare(a.profile.updatedAt));
}
