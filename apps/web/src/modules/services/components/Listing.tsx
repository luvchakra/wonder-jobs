"use client";
import { memo } from "react";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { relativeTime } from "@/lib/format";
import { LANE_LABEL, materialsLabel, matchService, priceLabel, ratingLabel, turnaroundLabel, visitLabel, warrantyLabel, type ServiceListing, type ServiceMatch } from "../domain";
import { listingHref } from "../manifest";
import { selectProfile, useServicesStore } from "../store";
import { isOpen } from "./Request";
import { shareOf } from "../share";

export function useMatch(l: ServiceListing): ServiceMatch {
  return matchService(l, useServicesStore(selectProfile));
}

/** "Serves you" under the logo, in the pill Jobs uses for its match. */
export const FIT: Record<Exclude<ServiceMatch["fit"], "unknown">, { top: string; bottom: string; label: string; tone: string; title: string }> = {
  strong: { top: "Serves", bottom: "you", label: "Serves your area", tone: "bg-success-100 text-success-600", title: "This pro states a service area that covers yours" },
  some: { top: "Other", bottom: "areas", label: "Serves other areas", tone: "bg-brand-50 text-brand-700", title: "This pro states service areas that don't include yours" },
};

/**
 * One pro in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the pro's logo with whether they
 * serve you and the way in under it; the title; pro · place · price · warranty or turnaround · rating; what they
 * state; where it was found, and Save. A local pro's card leads with the visit and warranty (what clients compare); a
 * remote pro's with the rate, turnaround and track record. Its title opens the pro's page.
 */
export const ServiceCard = memo(function ServiceCard({ item: l, onOpen }: { item: ServiceListing; onOpen: (id: string) => void }) {
  const saved = useServicesStore((s) => !!s.saved[l.id]);
  const toggle = useServicesStore((s) => s.toggleSaved);
  const requested = useServicesStore((s) => isOpen(s, l.id));
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const t = l.terms;
  const rating = ratingLabel(t);
  return (
    <ResultCard
      share={shareOf(l)}
      aside={
        <>
          <CompanyLogo name={l.company} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.top} bottom={fit.bottom} srText={fit.title} />}
          {l.origin === "wonderstar" && !requested && (
            <Link href={`${listingHref(l.id)}?quote=1`} onClick={() => onOpen(l.id)} aria-label={`Request a quote from ${l.company}`} title="Request a quote" className={APPLY_BTN}>
              Quote
            </Link>
          )}
          {l.origin === "outside" && l.applyUrl && (
            <a href={l.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${l.company}'s page on ${l.sourceName} (opens in a new tab)`} title={`Open their page on ${l.sourceName}`} className={APPLY_BTN}>
              View
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
            </a>
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
        l.origin === "wonderstar" && !l.companyVerified && <span key="v">not verified yet</span>,
        t.lane === "local" && <span key="p" title={l.location}>{shortPlace(l.location)}</span>,
        t.lane && <span key="l">{LANE_LABEL[t.lane]}</span>,
        <span key="$" className="font-medium text-ink-2">
          {priceLabel(t)}
        </span>,
        visitLabel(t) && <span key="vc">{visitLabel(t)}</span>,
        warrantyLabel(t.warrantyDays) && (
          <span key="w" className="font-medium text-brand-700">
            {warrantyLabel(t.warrantyDays)}
          </span>
        ),
        turnaroundLabel(t.turnaroundDays) && <span key="t">{turnaroundLabel(t.turnaroundDays)}</span>,
        materialsLabel(t.materials) && <span key="m">{materialsLabel(t.materials)}</span>,
        rating && (
          <span key="r" className="inline-flex items-center gap-0.5" title={l.origin === "wonderstar" ? "From clients' reviews on WonderWorks" : `As ${l.sourceName} reports it`}>
            <Star className="size-3 fill-current" aria-hidden /> {rating}
          </span>
        ),
      ]}
      tags={[t.category, ...(t.skills ?? [])].filter((x): x is string => !!x).slice(0, 3)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle="From their profile"
      status={requested && <Badge tone="brand">Quote requested</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="pro" />}
    />
  );
});
