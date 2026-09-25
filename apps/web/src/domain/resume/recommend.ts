/**
 * Which template Wonder recommends, and why (spec §5, §68). Deterministic rules over the candidate's
 * own Career Profile; every reason names the fact it rests on. No score is shown or implied.
 */
import type { CareerDNA } from "@/domain/career/types";
import { historyOf, sortExperience } from "@/domain/career/history";
import { groupSkills } from "./document";

export interface TemplateRecommendation {
  templateId: string;
  /** Why, each tied to something in the Career Profile. */
  reasons: string[];
  /** One line for the card. */
  pitch: string;
}

const LEADER = /\b(director|head|vp|vice president|chief|cxo|cto|ciso|cio|ceo|coo|principal|lead|manager of managers)\b/i;
const TECH = /\b(engineer|developer|architect|devops|sre|security|cyber|iam|identity|data|cloud|platform|infrastructure|ml|machine learning)\b/i;
const CREATIVE = /\b(product|design|designer|ux|ui|marketing|brand|content|creative|growth)\b/i;
const PEOPLE = /\b(team|people|hiring|mentor|coach|stakeholder|transformation|program|practice)\b/i;

const FAMILY: [string, RegExp][] = [
  ["security", /\b(security|iam|identity|cyber)\b/i],
  ["data", /\b(data|analytics|analyst|scientist|ml)\b/i],
  ["engineering", /\b(engineer|developer|architect|devops|sre)\b/i],
  ["product", /\b(product manager|product owner|product lead|product)\b/i],
  ["design", /\b(design|designer|ux|ui)\b/i],
  ["marketing", /\b(marketing|growth|brand|content)\b/i],
  ["sales", /\b(sales|account|business development)\b/i],
  ["operations", /\b(operations|program|project|supply)\b/i],
];
const familyOf = (s: string) => FAMILY.find(([, re]) => re.test(s))?.[0];

export function recommendTemplate(dna: CareerDNA): TemplateRecommendation {
  const h = historyOf(dna);
  const latest = sortExperience(h.experience)[0];
  const titles = h.experience.map((e) => e.title).join(" ");
  const goalFamily = familyOf(dna.careerGoal);
  const currentFamily = familyOf(latest?.title ?? dna.headline);
  const techGroups = groupSkills(dna.skills.map((s) => s.name)).filter((g) => g.name !== "Other" && g.name !== "Skills");

  if (h.publications.length || h.researchInterests.length) {
    const reasons = [h.publications.length ? `${h.publications.length} publication${h.publications.length === 1 ? "" : "s"} in your profile` : "", h.researchInterests.length ? "Research interests in your profile" : ""].filter(Boolean);
    return { templateId: "academic-v1", reasons, pitch: "Leads with your research and publications, with conventional headings an ATS reads cleanly." };
  }
  if (goalFamily && currentFamily && goalFamily !== currentFamily) {
    return {
      templateId: "career-shift-v1",
      reasons: [`Your goal points to ${goalFamily} roles`, `Your current role is in ${currentFamily}`, "Transferable skills and selected achievements go first"],
      pitch: "Puts your transferable skills and strongest achievements ahead of job titles.",
    };
  }
  const senior = dna.seniority === "director" || dna.seniority === "lead" || LEADER.test(titles) || LEADER.test(dna.headline);
  if (senior) {
    const reasons = [dna.seniority === "director" || dna.seniority === "lead" ? `${dna.seniority[0].toUpperCase()}${dna.seniority.slice(1)}-level profile` : "Leadership titles in your history"];
    if (dna.yearsExperience >= 10) reasons.push(`${dna.yearsExperience} years of experience`);
    if (h.experience.length >= 3) reasons.push(`${h.experience.length} roles to present`);
    const leadership = dna.strengths.some((s) => PEOPLE.test(s)) || PEOPLE.test(dna.careerGoal);
    if (leadership) return { templateId: "leadership-v1", reasons: [...reasons, "People and transformation leadership in your strengths"], pitch: "Gives your leadership scope and highlights room, while keeping the document ATS-friendly." };
    if (LEADER.test(dna.careerGoal)) reasons.push("Leadership-focused target role");
    return { templateId: "executive-v1", reasons, pitch: "This layout gives your leadership experience more room while keeping the document ATS-friendly." };
  }
  const techRole = TECH.test(dna.headline) || TECH.test(latest?.title ?? "");
  if (!techRole && (CREATIVE.test(dna.headline) || CREATIVE.test(latest?.title ?? "") || CREATIVE.test(dna.careerGoal))) {
    return { templateId: "creative-modern-v1", reasons: ["Product, design or marketing focus in your profile", "Modern look that stays ATS-friendly"], pitch: "A contemporary design for product and creative roles — decorative, never at the cost of readability." };
  }
  // A technical role, or a skill set that is mostly technical (not a PM who lists SQL).
  if (techRole || techGroups.length >= 3) {
    return {
      templateId: "technical-v1",
      reasons: [techGroups.length ? `Skills in ${techGroups.map((g) => g.name.toLowerCase()).join(", ")}` : "Technical role in your profile", "Skills grouped near the top, compact layout"],
      pitch: "Puts your technical skills first, grouped the way hiring teams scan them.",
    };
  }
  return { templateId: "modern-minimal-v1", reasons: ["Works across roles and industries", "Clean single column with standard headings"], pitch: "A clean, contemporary layout that suits most applications." };
}
