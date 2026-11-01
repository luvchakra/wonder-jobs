/**
 * Translating a job on its page (owner, 2026-10-25): the posting's own words — its title, description, requirements and
 * nice-to-haves — in one call, so they all change language together. The candidate picks a language; one call to their AI
 * (`translate_job`, through `resolveCapability` — the pick is the "ask") returns the translation, which is shown as
 * AI-translated beside a way back to the original. It is never stored on the job or sent anywhere, and when no model
 * is connected nothing is shown in its place. WonderJobs' own labels, skill names, places and the company's name stay as they are.
 */
export const TRANSLATE_LANGUAGES = [
  { id: "en", name: "English", native: "English" },
  { id: "hi", name: "Hindi", native: "हिन्दी" },
  { id: "es", name: "Spanish", native: "Español" },
  { id: "fr", name: "French", native: "Français" },
  { id: "de", name: "German", native: "Deutsch" },
  { id: "pt", name: "Portuguese", native: "Português" },
  { id: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { id: "ar", name: "Arabic", native: "العربية" },
] as const;

export type TranslateLanguageId = (typeof TRANSLATE_LANGUAGES)[number]["id"];

/** The posting's own text, which is all that is translated. */
export interface JobTexts {
  title: string;
  description: string;
  requirements: string[];
  niceToHave: string[];
}

/** A long posting is translated in its first part: this many characters of its description go to the model. */
export const MAX_TRANSLATE_CHARS = 12_000;

// The tags the posting is wrapped in; a lookalike inside a posting is dropped, so it can neither end a section early nor add one.
const TAGS = "posting|title|description|requirement|nice_to_have";
const clean = (s: string) => s.replace(new RegExp(`</?(?:${TAGS})\\b[^>]*>`, "gi"), "").trim();

/** What goes to the model: each text with tag lookalikes removed (it is data between tags, never instructions), the description clipped. */
export function textsToTranslate(job: JobTexts): { texts: JobTexts; clipped: boolean } {
  const description = clean(job.description);
  const clipped = description.length > MAX_TRANSLATE_CHARS;
  return {
    texts: { title: clean(job.title), description: clipped ? description.slice(0, MAX_TRANSLATE_CHARS) : description, requirements: job.requirements.map(clean).filter(Boolean), niceToHave: job.niceToHave.map(clean).filter(Boolean) },
    clipped,
  };
}

/** The model's input: the target language, then the posting as tagged data. */
export function translationPrompt(language: string, t: JobTexts): string {
  return [
    `TARGET LANGUAGE: ${language}`,
    "<posting>",
    `<title>${t.title}</title>`,
    `<description>\n${t.description}\n</description>`,
    ...t.requirements.map((r) => `<requirement>${r}</requirement>`),
    ...t.niceToHave.map((n) => `<nice_to_have>${n}</nice_to_have>`),
    "</posting>",
  ].join("\n");
}

const all = (reply: string, tag: string) => [...reply.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1].trim());

/**
 * The model's reply, checked by application code before anything is shown: the description must be there; the title
 * and each list are taken only when they came back whole (a list with a different count than was sent keeps its original, so
 * a requirement is never shown beside the wrong text). A reply with no tags at all is taken as the description alone.
 * Null when there is nothing to show.
 */
export function parseTranslation(reply: string, original: JobTexts): JobTexts | null {
  const tagged = new RegExp(`<(?:${TAGS})>`, "i").test(reply);
  if (!tagged) {
    const plain = reply.trim();
    return plain ? { ...original, description: plain } : null;
  }
  const description = all(reply, "description")[0];
  if (!description) return null;
  const title = all(reply, "title")[0];
  const reqs = all(reply, "requirement");
  const nice = all(reply, "nice_to_have");
  return {
    title: title || original.title,
    description,
    requirements: reqs.length === original.requirements.length && reqs.every(Boolean) ? reqs : original.requirements,
    niceToHave: nice.length === original.niceToHave.length && nice.every(Boolean) ? nice : original.niceToHave,
  };
}

/** One entry per job, language and text, so a changed posting is never shown its old translation. */
export function translationKey(jobId: string, language: TranslateLanguageId, job: JobTexts): string {
  const text = [job.title, job.description, ...job.requirements, ...job.niceToHave].join("\u0000");
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `${jobId}|${language}|${text.length}:${h}`;
}
