"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bookmark, Clock, ExternalLink, MapPin, Star, Wallet } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { LANE_LABEL, materialsLabel, priceLabel, ratingLabel, turnaroundLabel, visitLabel, warrantyLabel, type ServiceListing } from "../domain";
import { useServicesStore } from "../store";
import { call } from "@/wonderworks/api";
import { shortDate } from "@/wonderworks/listing/terms";
import type { ReviewSummary } from "../deal";
import { RequestQuote } from "./Request";
import { FIT, useMatch, shareOf } from "./Listing";

const noop = () => () => undefined;
const FIND = { href: "/app/m/services", label: "Talent & Services" };

/**
 * One pro's own page, on WonderWorks' listing page (wonderworks/listing/): the head and whether they serve you, Why,
 * About, then under the whole description the Terms, Track record and Source folds (no company lookup: a pro is a
 * person or a small agency, and a name match would show some other company); beside them the way in.
 * Shown from what the client saw: their saves, else their last search.
 */
export function ServicePage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useServicesStore((s) => findListing(s, id)) as ServiceListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Pro not found" />
        <EmptyState title="This pro isn't in your results" body="They may have left your last search. Search again to find them." action={{ label: "Back to Talent & Services", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

/** A WonderWorks pro's reviews from clients whose job was marked done (public, like the listing). */
function useReviews(postingId: string | undefined) {
  const [r, setR] = useState<ReviewSummary | null>(null);
  useEffect(() => {
    if (!postingId) return;
    call<{ reviews: ReviewSummary | null }>(`/api/m/services/reviews?listing=${encodeURIComponent(postingId)}`)
      .then((x) => setR(x.reviews))
      .catch(() => setR(null));
  }, [postingId]);
  return r;
}

function Page({ l }: { l: ServiceListing }) {
  const params = useSearchParams();
  const reviews = useReviews(l.origin === "wonderstar" ? l.postingId : undefined);
  const saved = useServicesStore((s) => !!s.saved[l.id]);
  const toggle = useServicesStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const rating = ratingLabel(t);
  const rows: [string, string][] = [
    ["Kind of work", t.lane ? LANE_LABEL[t.lane] : "Not stated"],
    ["Service", t.category ?? "Not stated"],
    ["Price", priceLabel(t)],
    ["Visit charge", visitLabel(t) ?? "Not stated"],
    ["Materials", materialsLabel(t.materials) ?? "Not stated"],
    ["Warranty", warrantyLabel(t.warrantyDays) ?? "Not stated"],
    ["Areas served", t.areas?.length ? t.areas.join(", ") : "Not stated"],
    ["Turnaround", turnaroundLabel(t.turnaroundDays) ?? "Not stated"],
    ["Skills", t.skills?.length ? t.skills.join(", ") : "Not stated"],
    ...(l.origin === "wonderstar" ? [["GST", t.gst ? "The pro says they're GST-registered; their invoice carries GST" : "Not stated"] as [string, string]] : []),
  ];
  return (
    <ListingPage
      share={shareOf(l)}
      back={FIND}
      title={l.title}
      actions={
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
          {saved ? "Saved" : "Save"}
        </Button>
      }
    >
      <ListingMain>
        <ListingHead
          company={l.company}
          name={
            <>
              {l.company}
              {l.origin === "wonderstar" && !l.companyVerified && <span className="font-normal text-ink-3"> · not verified yet</span>}
            </>
          }
          facts={[
            t.lane !== "remote" && (
              <span key="l" className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {l.location || "Place not stated"}
              </span>
            ),
            t.lane && <span key="k">{LANE_LABEL[t.lane]}</span>,
            <span key="$" className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" aria-hidden /> {priceLabel(t)}
            </span>,
            l.postedAt && (
              <span key="p" className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {relativeTime(l.postedAt)}
              </span>
            ),
          ]}
        />
        {(fit || reviews) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {reviews && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-[12px] font-semibold text-warning-700">
                <Star className="size-3.5 fill-current" aria-hidden /> {reviews.rating.toFixed(1)} · {reviews.count} review{reviews.count === 1 ? "" : "s"}
              </span>
            )}
            {fit && (
              <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
                {fit.label}
              </span>
            )}
          </div>
        )}
        {t.lane !== "remote" && (
          <Fold className="mt-4" title="Service area" hint={m.signals.length ? undefined : "Add your area to compare"}>
            {m.signals.length ? (
              <ul className="flex flex-col gap-2">
                {m.signals.map((x) => (
                  <li key={x.text} className="flex gap-2 text-[14px]">
                    <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", x.tone === "good" ? "bg-success-600" : "bg-warning-600")} aria-hidden />
                    <span className="text-ink-2">{x.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">
                Wonder compares a local pro&apos;s service areas with yours. Add your city or pin code in <Link href="/app/m/services/you/profile" className="font-medium text-brand-600 hover:underline">Talent &amp; Services → You</Link>.
              </p>
            )}
          </Fold>
        )}
        <h2 className="mt-4 text-[15px] font-semibold text-ink">About</h2>
        <ClampedText text={l.description || "The pro shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            <Fold title="Terms" hint={[t.category, priceLabel(t)].filter(Boolean).join(" · ")}>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-4">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] text-ink-4">{l.termsFrom === "company" ? `Terms as ${l.company} posted them on WonderWorks.` : `Only what ${l.sourceName} reports for this pro.`}</p>
            </Fold>
            {(rating || t.completed || t.onTimePct !== undefined) && (
              <Fold title="Track record" hint={rating ?? undefined}>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {([["Rating", rating], ["Jobs finished", t.completed?.toString()], ["Finished on time", t.onTimePct !== undefined ? `${t.onTimePct}%` : undefined]] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-ink-4">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[12px] text-ink-4">As {l.sourceName} reports it. WonderWorks adds nothing to it.</p>
              </Fold>
            )}
            {reviews && (
              <Fold title="Reviews" hint={`${reviews.rating.toFixed(1)} of 5 · ${reviews.count} on WonderWorks`} open>
                <ul className="flex flex-col gap-3">
                  {reviews.latest.map((r) => (
                    <li key={r.at} className="text-[13px]">
                      <p className="inline-flex items-center gap-1 font-medium text-ink">
                        <Star className="size-3.5 fill-current text-warning-600" aria-hidden /> {r.rating} · {r.name} · {shortDate(r.at.slice(0, 10))}
                      </p>
                      {r.text && <p className="text-ink-2">{r.text}</p>}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-ink-4">From clients whose job with {l.company} was marked done on WonderWorks.</p>
              </Fold>
            )}
            <Fold title="Source" hint={`Via ${l.sourceName}`}>
              <p className="text-[13px] text-ink-2">
                {l.origin === "wonderstar" ? `Posted on WonderWorks by ${l.company}${l.companyVerified ? "" : ", not verified yet"}.` : `Found on ${l.sourceName}. Work and payment with this pro happen there, on their terms.`}
                {l.postedAt ? ` Listed ${relativeTime(l.postedAt)}.` : ""}
              </p>
            </Fold>
          </div>
        )}
      </ListingMain>

      {(l.origin === "wonderstar" || l.applyUrl) && (
      <ListingAside>
        {l.origin === "wonderstar" && l.postingId && <RequestQuote listing={l} start={params.get("quote") === "1"} />}
        {l.origin === "outside" && l.applyUrl && (
          <Button full iconRight={<ExternalLink className="size-3.5" aria-hidden />} onClick={() => window.open(l.applyUrl, "_blank", "noopener,noreferrer")}>
            Open their page
          </Button>
        )}
      </ListingAside>
      )}
    </ListingPage>
  );
}
