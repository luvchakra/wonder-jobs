import { NextResponse } from "next/server";
import { z } from "zod";
import { HELP_FAQ, HELP_SECTIONS, searchHelp } from "@/content/help";
import { rateLimit } from "@/server/rateLimit";
import { platformAI } from "@/server/providers/platform";
import { getServerProvider } from "@/server/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ question: z.string().trim().min(2).max(500) });

/**
 * Help assistant. Retrieval over the user guide always works; when the
 * deployment has a platform model it writes the answer from the matched
 * sections and cites one. Public (rate-limited by address), so the model
 * only ever sees guide text plus the question.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`help:${ip}`, { capacity: 20, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many questions in a row. Give it a minute." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a short question." }, { status: 400 });
  const question = parsed.data.question;
  const hits = searchHelp(question, 3);
  if (!hits.length) return NextResponse.json({ answer: "I couldn't find that in the guide. Try different words, or browse the sections below.", sectionId: null, sectionTitle: null, source: "guide" });
  const best = hits[0].section;
  const faq = HELP_FAQ.find((f) => f.section === best.id && f.q.toLowerCase().split(" ").filter((w) => question.toLowerCase().includes(w)).length >= 3);
  const fallback = { answer: faq ? faq.a : best.summary + " " + best.body[0], sectionId: best.id, sectionTitle: best.title, source: "guide" as const };

  const platform = platformAI();
  if (!platform) return NextResponse.json(fallback);
  try {
    const context = hits.map(({ section }) => `## ${section.title} (id: ${section.id})\n${section.body.join("\n")}`).join("\n\n");
    const faqs = HELP_FAQ.filter((f) => hits.some((h) => h.section.id === f.section)).map((f) => `Q: ${f.q}\nA: ${f.a} (id: ${f.section})`).join("\n");
    const result = await getServerProvider("anthropic")!.complete(platform.apiKey, {
      model: platform.model,
      system: "You are the WonderJobs help assistant. Answer only from the guide excerpts provided. Be concrete and brief (2–4 sentences). If the guide does not cover it, say so and suggest the closest section. Reply as JSON: {\"answer\": string, \"sectionId\": one of the provided ids}.",
      prompt: `GUIDE EXCERPTS\n${context}\n\nFAQ\n${faqs}\n\nQUESTION\n${question}`,
      maxTokens: 400,
    });
    const m = result.text.match(/\{[\s\S]*\}/);
    const json = m ? (JSON.parse(m[0]) as { answer?: string; sectionId?: string }) : null;
    const sectionId = json?.sectionId && HELP_SECTIONS.some((s) => s.id === json.sectionId) ? json.sectionId : best.id;
    const section = HELP_SECTIONS.find((s) => s.id === sectionId)!;
    return NextResponse.json({ answer: json?.answer?.trim() || fallback.answer, sectionId, sectionTitle: section.title, source: "model" });
  } catch {
    return NextResponse.json(fallback);
  }
}
