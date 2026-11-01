"use client";
import { useRef, useState } from "react";
import { resolveCapability } from "@/domain/automation/policy";
import { TRANSLATE_LANGUAGES, textsToTranslate, translationKey, type JobTexts, type TranslateLanguageId } from "@/domain/translate/translate";
import { useAutomationStore } from "@/store/automation";
import { useAIService } from "@/lib/useAIService";

/** What a person is told when no model is connected: nothing is shown in place of a translation. */
export const TRANSLATE_NEEDS_AI = "Translating needs an AI model: WonderWorks AI where it's connected, or your own key in You → AI provider.";

/** This visit's translations, so picking a language again costs nothing; never stored, and small. */
const CACHE_MAX = 24;
const cache = new Map<string, { texts: JobTexts; clipped: boolean }>();

export type TranslationState = { language: TranslateLanguageId; status: "loading" } | { language: TranslateLanguageId; status: "done"; texts: JobTexts; clipped: boolean } | { language: TranslateLanguageId; status: "error"; message: string };

/**
 * One job's own words in another language: title, description, requirements and nice-to-haves, in one call.
 * `allowed` is `translate_job` through `resolveCapability` (Off hides the menu; picking a language is the "ask").
 * `pick(null)` goes back to the original. A reply that arrives after another pick is dropped. `state` is null while
 * the original is showing.
 */
export function useListingTranslation(job: { id: string } & JobTexts) {
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const service = useAIService();
  const allowed = resolveCapability("translate_job", policy, level) !== "skip";
  const [state, setState] = useState<TranslationState | null>(null);
  const latest = useRef(0);

  const pick = async (language: TranslateLanguageId | null) => {
    const mine = ++latest.current;
    if (language === null) return setState(null);
    if (!allowed) return;
    const { texts, clipped } = textsToTranslate(job);
    if (!texts.description && !texts.title) return;
    const key = translationKey(job.id, language, texts);
    const kept = cache.get(key);
    if (kept) return setState({ language, status: "done", ...kept });
    setState({ language, status: "loading" });
    try {
      const name = TRANSLATE_LANGUAGES.find((l) => l.id === language)!.name;
      const res = await service().translate({ job: texts, language: name });
      if (mine !== latest.current) return;
      if (!res.byModel) return setState({ language, status: "error", message: TRANSLATE_NEEDS_AI });
      if (!res.texts) return setState({ language, status: "error", message: "Couldn't translate this right now. Try again." });
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { texts: res.texts, clipped });
      setState({ language, status: "done", texts: res.texts, clipped });
    } catch (e) {
      if (mine !== latest.current) return;
      setState({ language, status: "error", message: e instanceof Error && e.message ? e.message : "Couldn't translate this right now. Try again." });
    }
  };
  return { allowed, state, pick };
}

/** Jobs' name for the same hook. */
export const useJobTranslation = useListingTranslation;
