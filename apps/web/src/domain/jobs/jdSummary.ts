/**
 * A short extract of what a posting says the job is, for a job card's spare room: the first sentences that describe the
 * role, taken word for word from the posting's own description — nothing written, nothing added. Boilerplate
 * ("About us…", equal-opportunity and benefits text) and anything too short or too long to read at a glance is skipped.
 * A description with nothing usable gives "" and the card shows nothing.
 */
import { htmlToText, looksLikeHtml } from "@/services/jobs/normalize";

const BOILERPLATE = /^(about|who we are|who are we|our (mission|story|company|culture|values|team)|company (overview|description|profile)|equal (opportunity|employment)|eeo|we are an? (equal|eeo)|we (do not|don'?t) discriminate|benefits|perks|compensation|salary|pay (range|rate)|how to apply|to apply|apply (now|today|here)|location|job (type|id|code|description|summary|details)|req(uisition)? ?(id|#|number)|posted|reference|disclaimer|notice|important)\b/i;
const ROLE = /\b(you will|you'll|you are|you're|responsible|looking for|seeking|join|this role|the role|this position|work with|working with|build|design|lead|manage|develop|own|partner|support|deliver|drive)\b/i;

const MAX_CHARS = 240;

/** Sentences of a posting's text, in order. */
function sentences(description: string): string[] {
  const text = (looksLikeHtml(description) ? htmlToText(description) : description).replace(/\s+/g, " ").trim();
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/);
}

export function jdSummary(description: string | undefined): string {
  if (!description) return "";
  const usable = sentences(description)
    .map((s) => s.trim().replace(/^[-•*•\s]+/, ""))
    .filter((s) => s.length >= 35 && s.length <= MAX_CHARS && !BOILERPLATE.test(s) && !/https?:\/\/|www\./i.test(s) && !/@/.test(s) && s !== s.toUpperCase());
  if (!usable.length) return "";
  // Sentences about the role first (in the order they appear), then whatever else is readable.
  const about = usable.filter((s) => ROLE.test(s));
  const picked = [...about, ...usable.filter((s) => !about.includes(s))].slice(0, 2);
  picked.sort((a, b) => usable.indexOf(a) - usable.indexOf(b));
  const out = picked.join(" ");
  if (out.length <= MAX_CHARS) return out;
  const cut = out.slice(0, MAX_CHARS - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "")}…`;
}
