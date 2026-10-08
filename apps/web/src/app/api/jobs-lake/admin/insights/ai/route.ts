import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json, send } from "@/server/jobslake/http";
import { err } from "@/server/jobslake/service";
import { insightsView } from "@/server/jobslake/views";
import { aiInsightSuggestions } from "@/server/jobslake/insightsAi";
import { rateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** AI suggestions for the insights page — proposals checked against the page's own facts; nothing is changed. */
export async function GET(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  if (!rateLimit(`jl:insights-ai:${a.actor}`, { capacity: 6, refillPerSec: 0.05 }).ok) return send(err(429, "RATE_LIMITED", "Too many AI requests. Try again shortly."));
  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  return json({ suggestions: await aiInsightSuggestions(await insightsView(days)) });
}
