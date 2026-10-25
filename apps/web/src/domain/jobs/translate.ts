/**
 * Translating a job's description on its page (owner, 2026-10-25). The candidate picks a language; one call to their
 * AI (`translate_job`, through `resolveCapability` — the pick is the "ask") returns the translation, which is shown
 * as AI-translated beside a way back to the original. It is never stored on the job or sent anywhere, and when no
 * model is connected nothing is shown in its place.
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

/** A long posting is translated in its first part: this many characters go to the model. */
export const MAX_TRANSLATE_CHARS = 12_000;

/** What goes to the model: the posting with any tag lookalikes removed (it is data between tags, never instructions), clipped. */
export function textToTranslate(description: string): { text: string; clipped: boolean } {
  const clean = description.replace(/<\/?posting>/gi, "").trim();
  return clean.length > MAX_TRANSLATE_CHARS ? { text: clean.slice(0, MAX_TRANSLATE_CHARS), clipped: true } : { text: clean, clipped: false };
}

/** One entry per job, language and text, so a changed posting is never shown its old translation. */
export function translationKey(jobId: string, language: TranslateLanguageId, description: string): string {
  let h = 0;
  for (let i = 0; i < description.length; i++) h = (Math.imul(31, h) + description.charCodeAt(i)) | 0;
  return `${jobId}|${language}|${description.length}:${h}`;
}
