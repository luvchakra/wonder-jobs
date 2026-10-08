import { z } from "zod";
import { assist } from "./assist";

export interface RankInput {
  profile: Record<string, unknown>;
  jobs: { id: string; title: string; company: string; location: string; level: string; excerpt: string }[];
}

const Reply = z.object({ scores: z.array(z.object({ id: z.string().max(200), score: z.number().min(0).max(100), reason: z.string().max(200) })).max(40) });

/**
 * A model's fit score for each posting against the candidate's own profile. Only ids it was given come
 * back, scores are clamped by the schema, and the caller blends them into the rule-based match within a
 * fixed band (domain/jobs/aiFit.ts). Null when no model is configured or the call fails.
 */
export async function aiRankJobs(input: RankInput): Promise<{ id: string; score: number; reason: string }[] | null> {
  const jobs = input.jobs.slice(0, 30);
  if (!jobs.length) return null;
  const reply = await assist({
    task: "rank_jobs",
    instructions:
      'Score how well each job posting fits this candidate\'s wanted role, level, skills and locations, 0–100 (90+ = squarely the role they want at their level; 60–89 = a close, credible fit; 30–59 = adjacent; under 30 = a different field or level). Judge the work the posting describes, not keyword overlap, and read titles by meaning ("IAM", "identity governance", "access management" are one field). The reason is one short sentence a candidate would find useful, naming the deciding factor, with no invented facts. Shape: {"scores":[{"id":"<job id>","score":<0-100>,"reason":"<sentence>"}]}.',
    data: JSON.stringify({ candidate: input.profile, jobs }),
    schema: Reply,
    maxTokens: 2500,
    timeoutMs: 15000,
  });
  if (!reply) return null;
  const ids = new Set(jobs.map((j) => j.id));
  return reply.scores.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, score: Math.round(s.score), reason: s.reason.trim().slice(0, 200) }));
}
