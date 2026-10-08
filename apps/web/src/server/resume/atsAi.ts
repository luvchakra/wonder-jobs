import { z } from "zod";
import type { AtsFinding, AtsReport } from "@/domain/resume/ats/check";
import { assist } from "@/server/ai/assist";

/**
 * What a model may point out in a résumé beyond the fixed ATS rules. The wording and the fix are the app's;
 * the model only picks a kind and quotes the résumé. These findings carry no points: the ATS score stays
 * the rules' alone (domain/resume/ats/check.ts), and each is marked as found by AI.
 */
export const AI_ATS_KINDS = {
  duties_not_results: { title: "Bullets describe duties, not results", fix: "Lead each bullet with what changed because of you — a number, a scale or an outcome." },
  unclear_title: { title: "A job title an ATS may not recognise", fix: "Use the title recruiters search for, with the internal one in brackets if it matters." },
  date_gap_or_overlap: { title: "Dates that don't add up", fix: "Check the start and end dates of these roles so the timeline reads cleanly." },
  spelling: { title: "Spelling or typing slips", fix: "Correct these — an ATS keyword search won't match a misspelt word." },
  buzzwords: { title: "Phrases that say little", fix: "Replace these with the specific skill, tool or result they stand for." },
} as const;
type Kind = keyof typeof AI_ATS_KINDS;

const Reply = z.object({ findings: z.array(z.object({ kind: z.string().max(40), quotes: z.array(z.string().max(200)).max(4) })).max(8) });

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** A model's findings, kept only for a known kind with at least one quote really in the résumé. */
export function checkedAtsFindings(raw: { kind: string; quotes: string[] }[] | undefined, text: string): AtsFinding[] {
  const body = norm(text);
  const out: AtsFinding[] = [];
  for (const r of raw ?? []) {
    if (!(r.kind in AI_ATS_KINDS) || out.some((f) => f.id === `ai_${r.kind}`)) continue;
    const quotes = r.quotes.map((q) => q.replace(/\s+/g, " ").trim()).filter((q) => q.length >= 4 && body.includes(norm(q))).slice(0, 3);
    if (!quotes.length) continue;
    const k = AI_ATS_KINDS[r.kind as Kind];
    out.push({ id: `ai_${r.kind}`, category: "content", title: k.title, status: "warn", severity: "tip", earned: 0, possible: 0, detail: "Found by AI — not part of the score.", evidence: quotes, fix: { where: "file", text: k.fix } });
  }
  return out;
}

/** The rules' report plus what AI found, if anything; the score and categories are left as the rules made them. */
export async function withAiAtsFindings(report: AtsReport, text: string): Promise<AtsReport> {
  if (report.score === 0 || text.trim().length < 200) return report;
  const reply = await assist({
    task: "ats_review",
    instructions: `Review this résumé text for problems an applicant-tracking system or recruiter would trip on, only of these kinds: ${Object.entries(AI_ATS_KINDS)
      .map(([k, v]) => `"${k}" (${v.title.toLowerCase()})`)
      .join("; ")}. For each problem found, quote up to 3 short passages copied exactly from the résumé. Report only clear problems; an empty list is fine. Shape: {"findings":[{"kind":"<kind>","quotes":["<exact words>"]}]}.`,
    data: text.slice(0, 12000),
    schema: Reply,
    maxTokens: 900,
    timeoutMs: 12000,
  });
  const ai = checkedAtsFindings(reply?.findings, text);
  return ai.length ? { ...report, findings: [...report.findings, ...ai] } : report;
}
