"use client";
import { memo } from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import { shortPlace } from "@/wonderworks/find/place";
import { CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { Badge } from "@/components/common/Badge";
import { relativeTime } from "@/lib/format";
import { matchListing, priceLabel, type MarketListing } from "../domain";
import { listingHref, photoSrc } from "../manifest";
import { selectPersona, useMarketplaceStore } from "../store";

/** The first photo, small, through the listing's own route; a store icon until the seller adds one. */
export function Thumb({ l, size = 56 }: { l: Pick<MarketListing, "listingId" | "terms" | "title">; size?: number }) {
  const first = l.terms.photos[0];
  return first ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoSrc(l.listingId, first)} alt="" width={size} height={size} loading="lazy" className="rounded-[12px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-[12px] border border-line bg-bg-soft text-ink-4" style={{ width: size, height: size }} aria-hidden>
      <Store className="size-5" />
    </span>
  );
}

/**
 * One listing in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the first photo with whether it is in
 * your area; the title; price · condition · area · category; what the seller wrote, labelled as theirs; where it was found,
 * and Save. Never the seller's contact details.
 */
export const MarketCard = memo(function MarketCard({ item: l, onOpen }: { item: MarketListing; onOpen: (id: string) => void }) {
  const saved = useMarketplaceStore((s) => !!s.saved[l.id]);
  const toggle = useMarketplaceStore((s) => s.toggleSaved);
  const persona = useMarketplaceStore(selectPersona);
  const m = matchListing(l, persona);
  const t = l.terms;
  return (
    <ResultCard
      aside={
        <>
          <Thumb l={l} size={44} />
          {m.signals.length > 0 && m.score > 0 && <FitPill tone="bg-success-100 text-success-600" title={m.signals[0].label} top="In" bottom="your area" srText={m.signals[0].label} />}
        </>
      }
      title={
        <Link href={listingHref(l.id)} onClick={() => onOpen(l.id)} className={CARD_TARGET}>
          {l.title}
        </Link>
      }
      facts={[
        <span key="p" className="font-semibold text-ink">
          {priceLabel(t.price)}
          {t.negotiable ? " · negotiable" : ""}
        </span>,
        <span key="c">{t.condition}</span>,
        <span key="a" title={l.area}>{shortPlace(l.area)}</span>,
        <span key="k">{t.category}</span>,
      ]}
      summary={l.description.slice(0, 240)}
      summaryTitle="From the seller"
      status={l.sellerVerified && <Badge tone="success">Verified seller</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="listing" />}
    />
  );
});
