"use client";
import { TRANSLATE_LANGUAGES } from "@/domain/translate/translate";
import { cn } from "@/lib/cn";
import { ClampedText, isLongText } from "@/wonderworks/listing/ListingPage";
import { LanguageMenu } from "./LanguageMenu";
import { useListingTranslation } from "./useTranslation";

/**
 * A listing's own words under its heading, with Translate beside the heading (owner, 2026-11-01: translate in every
 * module, from the WonderWorks layer). The listing's title and description go to the person's AI in one call, through
 * `resolveCapability("translate_job")`; the result is shown as AI-translated with a way back, and never stored.
 */
export function TranslatedText({ id, heading, title, text, long, expanded, onToggle }: { id: string; heading: React.ReactNode; title: string; text: string; long?: boolean; expanded: boolean; onToggle: () => void }) {
  const translation = useListingTranslation({ id, title, description: text, requirements: [], niceToHave: [] });
  const s = translation.state;
  const done = s?.status === "done" ? s : null;
  const name = s ? TRANSLATE_LANGUAGES.find((l) => l.id === s.language)!.name : "";
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{heading}</h2>
        {translation.allowed && text.trim() && <LanguageMenu value={s?.language ?? null} busy={s?.status === "loading"} onChange={(v) => void translation.pick(v)} />}
      </div>
      {s && (
        <p role="status" className={cn("mt-2 flex flex-wrap items-center gap-x-2 text-[12.5px]", s.status === "error" ? "text-danger-600" : "text-ink-3")}>
          {s.status === "loading" && <>Translating to {name}…</>}
          {s.status === "done" && <span>AI-translated to {name}{s.clipped ? " · the first part of a long text" : ""}</span>}
          {s.status === "error" && <span>{s.message}</span>}
          {s.status === "error" && (
            <button type="button" onClick={() => void translation.pick(s.language)} className="font-medium text-brand-600 hover:underline">
              Try again
            </button>
          )}
          {s.status !== "loading" && (
            <button type="button" onClick={() => void translation.pick(null)} className="font-medium text-brand-600 hover:underline">
              Show original
            </button>
          )}
        </p>
      )}
      {done && done.texts.title && done.texts.title !== title && <p lang={done.language} dir={done.language === "ar" ? "rtl" : undefined} className="mt-2 text-[14px] font-semibold text-ink">{done.texts.title}</p>}
      <ClampedText text={done?.texts.description ?? text} long={long ?? isLongText(text)} expanded={expanded} onToggle={onToggle} lang={done?.language} dir={done?.language === "ar" ? "rtl" : undefined} className={cn(s?.status === "loading" && "opacity-60")} />
    </>
  );
}
