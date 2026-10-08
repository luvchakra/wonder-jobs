import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { assist } from "@/server/ai/assist";
import { checkedAiIntent, WONDER_INTENT_TYPES } from "@/domain/wonder/intent";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().trim().min(1).max(200) });
const Reply = z.object({ type: z.string().max(40), subject: z.string().max(200) });

const MEANING: Record<string, string> = {
  today_priorities: "what to focus on or do today",
  application_progress: "how their applications are going",
  missing_skills: "skills they lack for the jobs they want",
  applications_attention: "applications that need a follow-up or action",
  career_headline: "improving their headline or LinkedIn summary",
  create_schedule: "searching automatically on a schedule (subject: the role to search)",
  change_preferences: "changing location, salary, work mode or other preferences",
  find_opportunities: "running a new job search (subject: the role or words to search)",
  explain_why_not_shown: "why a job or company isn't shown (subject: that job or company)",
  explain_job: "why a job is a good match (subject: that job or company)",
  prepare_strongest: "preparing applications for their best matches",
  prepare_application: "preparing an application for one job (subject: that job or company)",
  search_jobs: "anything else — a plain job search (subject: the search words)",
};

/**
 * Ask Wonder, read by a model when the rules didn't recognise the request. The model may only name one
 * of Ask Wonder's own actions and quote words the candidate typed; the app then resolves that action
 * against the candidate's real data exactly as for the rules. No free-text reply, no action of its own.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`intent:${session.tenantId}`, { capacity: 20, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ intent: null }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ intent: null }, { status: 400 });
  const text = parsed.data.text;
  const reply = await assist({
    task: "ask_wonder",
    instructions: `A job seeker typed a request into a job-search app. Choose the one action it asks for, from: ${WONDER_INTENT_TYPES.map((t) => `"${t}" (${MEANING[t]})`).join("; ")}. The subject is the exact words from the request that name the role, job or company, copied verbatim, or "" when there are none. Shape: {"type":"<action>","subject":"<verbatim words or empty>"}.`,
    data: text,
    schema: Reply,
    maxTokens: 120,
    timeoutMs: 5000,
  });
  return NextResponse.json({ intent: checkedAiIntent(text, reply) }, { headers: { "cache-control": "no-store" } });
}
