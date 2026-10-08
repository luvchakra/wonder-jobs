import { z } from "zod";
import { assist } from "@/server/ai/assist";
import { checkedAiSuggestions, insightFacts, type InsightsView, type Suggestion } from "@/domain/jobslake/insights";

const Reply = z.object({
  suggestions: z
    .array(z.object({ title: z.string().max(160), detail: z.string().max(600), severity: z.string().max(10).optional(), sourceId: z.string().max(120).optional(), facts: z.array(z.string().max(160)).max(8) }))
    .max(8),
});

/**
 * AI suggestions for improving JobsLake's sources, from the same facts the page shows. A proposal only:
 * each is checked against those facts (domain/jobslake/insights.ts) and nothing changes a source.
 * Null when no model is configured or the call fails — the rule-based suggestions still stand.
 */
export async function aiInsightSuggestions(v: InsightsView): Promise<Suggestion[] | null> {
  if (!v.sources.length) return null;
  const facts = [...insightFacts(v).values()].map((f) => `${f.key} = ${f.value}  (${f.label})`);
  const reply = await assist({
    task: "jobslake_insights",
    instructions: [
      "You advise the operator of a job-aggregation service on its job sources.",
      "Its goal: more fresh, relevant, unique jobs for candidates, from reliable sources, with fewer duplicates and failures.",
      "From the facts given, suggest up to 5 concrete improvements the operator could make (tune, fix, pause, or add a kind of source for a thin country or role family).",
      "Don't repeat these, which are already shown: " + v.suggestions.map((s) => s.title).join("; ") + ".",
      "Each suggestion cites the fact keys it rests on, copied exactly; use only numbers that appear in the facts. sourceId is the id inside a cited source.* key, or omitted.",
      'Shape: {"suggestions":[{"title":"<short imperative>","detail":"<one or two sentences>","severity":"high|medium|low","sourceId":"<id or omit>","facts":["<fact key>"]}]}',
    ].join(" "),
    data: facts.join("\n").slice(0, 14000),
    schema: Reply,
    maxTokens: 1200,
    timeoutMs: 20000,
  });
  if (!reply) return null;
  return checkedAiSuggestions(reply.suggestions, v);
}
