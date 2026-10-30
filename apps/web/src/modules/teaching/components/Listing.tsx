"use client";
import { memo } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/common/Button";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { relativeTime } from "@/lib/format";
import { toast } from "@/components/feedback/Toast";
import { gradesLabel, HOURS_LABEL, matchTeaching, outsideStatus, payLabel, WORK_MODE_LABEL, type TeachingListing, type TeachingMatch } from "../domain";
import { listingHref } from "../manifest";
import { selectProfile, useTeachingStore } from "../store";

/** "Pune · On-site · Full time". */
export const placeLine = (l: Pick<TeachingListing, "location" | "workMode" | "terms">) => [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, l.terms.hours ? HOURS_LABEL[l.terms.hours] : null].filter(Boolean).join(" · ");

export function useMatch(l: TeachingListing): TeachingMatch {
  return matchTeaching(l, useTeachingStore(selectProfile));
}

/** "Strong" / "Partial" fit, in the pill Jobs uses for its match. */
export const FIT: Record<Exclude<TeachingMatch["fit"], "unknown">, { word: string; tone: string; title: string }> = {
  strong: { word: "Strong", tone: "bg-success-100 text-success-600", title: "Strong fit — your subjects, grade levels and board line up with it" },
  some: { word: "Partial", tone: "bg-brand-50 text-brand-700", title: "Partial fit — some of your subjects, grade levels or qualifications line up with it" },
};

/** Whether the teacher marked it applied. */
const isApplied = (s: { responses: Record<string, { stage: string; status?: string }> }, id: string) => outsideStatus(s.responses[id]) === "applied";

/**
 * One teaching opening in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the school's logo with
 * the fit and Apply under it; the title; school · place · subject · grades · pay; why it fits; where it was found, and
 * Save. Its title opens the opening's page.
 */
export const TeachingCard = memo(function TeachingCard({ item: l, onOpen }: { item: TeachingListing; onOpen: (id: string) => void }) {
  const saved = useTeachingStore((s) => !!s.saved[l.id]);
  const applied = useTeachingStore((s) => isApplied(s, l.id));
  const toggle = useTeachingStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const pay = l.terms.payMin !== undefined || l.terms.payMax !== undefined ? payLabel(l.terms) : null;
  return (
    <ResultCard
      aside={
        <>
          <CompanyLogo name={l.company} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.word} bottom="fit" srText={fit.title} />}
          <ApplyButton listing={l} card />
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
        l.origin === "wonderstar" && !l.companyVerified && <span key="v">not verified yet</span>,
        <span key="p" title={l.location}>
          {l.workMode === "remote" ? WORK_MODE_LABEL.remote : shortPlace(l.location)}
        </span>,
        l.terms.grades?.length && <span key="g">{gradesLabel(l.terms.grades)}</span>,
        l.terms.hours && <span key="h">{HOURS_LABEL[l.terms.hours]}</span>,
        pay && (
          <span key="$" className="font-medium text-ink-2">
            {pay}
          </span>
        ),
      ]}
      tags={[l.terms.subject, ...(l.terms.boards ?? [])].filter((t): t is string => !!t).slice(0, 3)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle="From the posting"
      status={applied && <Badge tone="success">Applied</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="opening" />}
    />
  );
});

/**
 * Apply. On an outside opening the employer's own page opens; the teacher can then mark it applied. A WonderWorks
 * school's opening is applied to on its page.
 */
export function ApplyButton({ listing: l, size = "md", full, card }: { listing: TeachingListing; size?: "sm" | "md"; full?: boolean; card?: boolean }) {
  const applied = useTeachingStore((s) => isApplied(s, l.id));
  const setResponse = useTeachingStore((s) => s.setResponse);
  const remember = () => setResponse(l.id, "applied", { status: "applied", item: l });
  const opened = () => {
    window.open(l.applyUrl, "_blank", "noopener,noreferrer");
    if (!applied && outsideStatus(useTeachingStore.getState().responses[l.id]) !== "withdrawn") setResponse(l.id, "preparing", { status: "preparing", mark: "apply_opened", item: l });
    if (!applied) toast.info(`Opened ${l.company}'s page`, "Apply there. Then mark it applied to track it in Pipeline.", { label: "I applied", onClick: remember });
  };

  if (l.origin === "wonderstar")
    return card ? null : (
      <Button size={size} full={full} variant={applied ? "outline" : "primary"} href={applied ? "/app/m/teaching/pipeline" : undefined} disabled={!applied}>
        {applied ? "Applied" : "Apply opens soon"}
      </Button>
    );
  if (card)
    return applied ? null : (
      <button type="button" aria-label={`Apply to ${l.title} at ${l.company} on their site (opens in a new tab)`} title="Apply on their site" className={APPLY_BTN} onClick={opened}>
        Apply
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      </button>
    );
  return (
    <Button size={size} full={full} variant={applied ? "outline" : "primary"} iconRight={<ExternalLink className="size-3.5" aria-hidden />} onClick={opened}>
      {applied ? "Applied · open page" : "Apply on their site"}
    </Button>
  );
}
