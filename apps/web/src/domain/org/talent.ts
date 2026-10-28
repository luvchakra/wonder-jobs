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

/**
 * Suggested for a job (the way recruiting tools suggest candidates for an opening): opted-in profiles that have at
 * least one of the job's skills, most skills first. An on-site or hybrid job suggests only people who listed its
 * city; a remote job, anyone. Only what each candidate chose to show is compared.
 */
export function suggestTalent(profiles: TalentProfile[], job: { skills: string[]; location: string; workMode: "remote" | "hybrid" | "onsite" }): TalentMatch[] {
  const wanted = [...new Set(job.skills.map((s) => s.trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
  const city = norm(job.location.split(",")[0] ?? "");
  const out: TalentMatch[] = [];
  for (const p of profiles) {
    if (job.workMode !== "remote" && city && !p.locations.some((l) => norm(l).includes(city))) continue;
    const have = p.skills.map(norm);
    const matchedSkills = wanted.filter((w) => have.includes(norm(w)));
    if (matchedSkills.length) out.push({ profile: p, score: matchedSkills.length, matchedSkills });
  }
  return out.sort((a, b) => b.score - a.score || b.profile.updatedAt.localeCompare(a.profile.updatedAt));
}
