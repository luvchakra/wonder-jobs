import { z } from "zod";
import { assist } from "@/server/ai/assist";
import { rateLimit } from "@/server/rateLimit";
import { firstSentence, type Maybe, type ShareSummary } from "@/wonderworks/listing/share";

/** What a share's summary is made from: the listing's own public details, nothing from anyone's account. */
export interface SummaryInput {
  noun: string;
  title: string;
  facts?: Maybe[];
  lines?: Maybe[];
  details?: string;
}

const HOOK_MAX = 140;
const POINT_MAX = 72;
const Reply = z.object({ hook: z.string().max(400), highlights: z.array(z.string().max(200)).max(6) });

const NO_LINKS = /https?:\/\/|www\.|\S+@\S+\.\S+/i;
const PROVENANCE = /^(from|source):/i;
/** Whitespace folded and a leading bullet dropped; cut at a word (never mid-word) with an ellipsis when over `max`. */
export const clean = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").replace(/^[-•*\s]+/, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
};
const present = (l: Maybe[] | undefined) => (l ?? []).filter((x): x is string => !!x);

/** The summary without a model: the description's first sentence that says more than the title, and no highlights. */
export function ruleSummary(input: SummaryInput): ShareSummary {
  // No highlights without a model: the image already shows the detail rows, so repeating them adds nothing (it shows the description instead).
  return { hook: firstSentence(input.title, input.details, HOOK_MAX), highlights: [], ai: false };
}

/**
 * The model's summary, checked: a hook sentence and up to three highlights, each cut to length, none with a link or an
 * address (a model can't add a way to reach anyone), and none just repeating the title. Null when it isn't usable.
 */
export function checkedSummary(input: SummaryInput, reply: z.infer<typeof Reply>): ShareSummary | null {
  const title = input.title.trim().toLowerCase();
  const hook = clean(reply.hook, HOOK_MAX);
  const highlights = reply.highlights
    .map((h) => clean(h, POINT_MAX))
    .filter((h) => h.length > 2 && !NO_LINKS.test(h) && h.toLowerCase() !== title)
    .slice(0, 3);
  if (hook.length < 12 || NO_LINKS.test(hook)) return null;
  return { hook, highlights, ai: true };
}

const memo = new Map<string, { at: number; value: ShareSummary }>();
const MEMO_MS = 6 * 60 * 60_000;

/**
 * A crisp summary of a listing for sharing (owner, 2026-11-03: "use ai to summarise the details … keep it useful and
 * crisp"): one sentence on why it's worth a look (the message's line) and up to three concrete highlights (the image's).
 * The model only proposes; the code cuts, checks and falls back to the listing's own words. Remembered per listing for
 * six hours, and model calls are rate-limited so a public page can't run up the platform key.
 */
export async function shareSummary(key: string, input: SummaryInput): Promise<ShareSummary> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const fallback = ruleSummary(input);
  let value = fallback;
  if (rateLimit("share-summary:model", { capacity: 30, refillPerSec: 0.2 }).ok) {
    const reply = await assist({
      task: "share_summary",
      instructions: [
        `Summarise this ${input.noun} listing for a person a friend is sharing it with.`,
        `"hook": one plain sentence, under ${HOOK_MAX} characters, saying why it is worth a look. "highlights": up to 3 short phrases, under ${POINT_MAX} characters each, with the most useful concrete details (pay, schedule, requirements, perks, dates) that are not already in the title or facts.`,
        "Use only facts stated in the data; never invent or estimate anything. No links, emails, phone numbers, emojis, hashtags or marketing words.",
        'Shape: {"hook":"<sentence>","highlights":["<phrase>"]}.',
      ].join(" "),
      data: JSON.stringify({ title: input.title, facts: present(input.facts), details: present(input.lines).filter((l) => !PROVENANCE.test(l.trim())), description: (input.details ?? "").replace(/<[^>]+>/g, " ").slice(0, 3000) }),
      schema: Reply,
      maxTokens: 300,
      timeoutMs: 6000,
    });
    value = (reply && checkedSummary(input, reply)) || fallback;
  }
  if (memo.size >= 2000) memo.delete(memo.keys().next().value as string);
  memo.set(key, { at: Date.now(), value });
  return value;
}
