"use client";
import { memo } from "react";
import Link from "next/link";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { Badge } from "@/components/common/Badge";
import { CompanyLogo } from "@/wonderworks/brand/CompanyLogo";
import { relativeTime } from "@/lib/format";
import { feeLabel, lengthLabel, matchTherapist, modesLabel, type TherapistListing, type TherapistMatch } from "../domain";
import { listingHref } from "../manifest";
import { selectProfile, useTherapistsStore } from "../store";
import { isOpen } from "./Request";
import { shareOf } from "../share";

export function useMatch(l: TherapistListing): TherapistMatch {
  return matchTherapist(l, useTherapistsStore(selectProfile));
}

/** "Fits you" under the logo, in the pill Jobs uses for its match. */
export const FIT: Record<Exclude<TherapistMatch["fit"], "unknown">, { top: string; bottom: string; label: string; tone: string; title: string }> = {
  strong: { top: "Fits", bottom: "you", label: "Fits your preferences", tone: "bg-success-100 text-success-600", title: "Matches the language, way of meeting and budget you saved" },
  some: { top: "Partly", bottom: "fits", label: "Partly fits your preferences", tone: "bg-brand-50 text-brand-700", title: "Differs from something you saved" },
};

/**
 * One practitioner in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the logo with whether they
 * fit your preferences; the headline; practitioner · place · how they meet · fee; focus areas; what they wrote about
 * themselves, labelled as theirs; where it was found, and Save. No rating and no "verified" mark: neither exists yet.
 */
export const TherapistCard = memo(function TherapistCard({ item: l, onOpen }: { item: TherapistListing; onOpen: (id: string) => void }) {
  const saved = useTherapistsStore((s) => !!s.saved[l.id]);
  const toggle = useTherapistsStore((s) => s.toggleSaved);
  const requested = useTherapistsStore((s) => isOpen(s, l.id));
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const t = l.terms;
  return (
    <ResultCard
      share={shareOf(l)}
      aside={
        <>
          <CompanyLogo name={l.company} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.top} bottom={fit.bottom} srText={fit.title} />}
          {!requested && (
            <Link href={`${listingHref(l.id)}?book=1`} onClick={() => onOpen(l.id)} aria-label={`Request a session with ${l.company}`} title="Request a session" className={APPLY_BTN}>
              Book
            </Link>
          )}
        </>
      }
      title={
        <Link href={listingHref(l.id)} onClick={() => onOpen(l.id)} className={CARD_TARGET}>
          {l.title}
        </Link>
      }
      facts={[
        <span key="c" className="font-medium text-ink-2">
          {l.company}
        </span>,
        t.modes?.includes("in_person") && <span key="p" title={l.location}>{shortPlace(l.location)}</span>,
        modesLabel(t.modes) && <span key="m">{modesLabel(t.modes)}</span>,
        <span key="$" className="font-medium text-ink-2">
          {feeLabel(t)}
        </span>,
        lengthLabel(t.sessionMinutes) && <span key="len">{lengthLabel(t.sessionMinutes)}</span>,
        t.languages?.length && <span key="lang">{t.languages.slice(0, 3).join(", ")}</span>,
      ]}
      tags={(t.focus ?? []).slice(0, 3)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle="In their words"
      status={requested && <Badge tone="brand">Session requested</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="practitioner" />}
    />
  );
});
