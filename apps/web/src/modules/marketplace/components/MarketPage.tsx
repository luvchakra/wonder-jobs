"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Textarea } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { call } from "@/wonderworks/api";
import { Act } from "@/wonderworks/pipeline/Act";
import { ReportBlock } from "@/wonderworks/pipeline/ReportBlock";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { MAX_MESSAGE, priceLabel, type MarketListing } from "../domain";
import { photoSrc } from "../manifest";
import type { ThreadView } from "../threads";
import { useMarketplaceStore } from "../store";
import { ScamWarning } from "./ScamWarning";

const noop = () => () => undefined;
const FIND = { href: "/app/m/marketplace", label: "Buy, Sell & Rent" };
const SETTINGS = { href: "/app/m/marketplace/you/profile#settings", label: "Buy, Sell & Rent → You" };

/**
 * One listing's own page, on WonderWorks' listing page (wonderworks/listing/): photos, the head, "From the seller", then the
 * Details and Safety folds. The aside is how to reach the seller: a first message here, never a phone number or email (the
 * seller shares those themselves once they choose). Shown from what the person saw: their saves, else their last search.
 */
export function MarketPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useMarketplaceStore((s) => findListing(s, id)) as MarketListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Listing not found" />
        <EmptyState title="This listing isn't in your results" body="It may have left your last search. Search again to find it." action={{ label: "Back to Buy, Sell & Rent", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Photos({ l }: { l: MarketListing }) {
  const [i, setI] = useState(0);
  const photos = l.terms.photos;
  if (!photos.length) return null;
  return (
    <div className="mb-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoSrc(l.listingId, photos[i])} alt={`${l.title}, photo ${i + 1} of ${photos.length}`} className="max-h-[420px] w-full rounded-[16px] border border-line bg-bg-soft object-contain" />
      {photos.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Photos">
          {photos.map((p, n) => (
            <button key={p} type="button" aria-label={`Photo ${n + 1}`} aria-pressed={n === i} onClick={() => setI(n)} className={`overflow-hidden rounded-[10px] border-2 ${n === i ? "border-brand-500" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(l.listingId, p)} alt="" width={56} height={56} loading="lazy" className="size-14 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Contact({ l }: { l: MarketListing }) {
  const [text, setText] = useState("");
  const [thread, setThread] = useState<ThreadView | null | undefined>(undefined);
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    call<{ threads: ThreadView[] }>("/api/m/marketplace/threads")
      .then((r) => live && setThread(r.threads.find((t) => t.listingId === l.listingId && ["messaged", "offer", "visit"].includes(t.status)) ?? null))
      .catch(() => live && setThread(null));
    return () => {
      live = false;
    };
  }, [l.listingId]);
  const open = thread?.id ?? started;
  if (thread === undefined) return <PageLoading rows={1} />;
  if (open)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[14px] text-ink-2">You&apos;re talking to {l.seller} about this.</p>
        <Link href={`/app/m/marketplace/pipeline/${encodeURIComponent(open)}`} className="wj-gradient-bg wj-press inline-flex h-10 items-center justify-center rounded-full px-4 text-[14px] font-semibold text-white">
          Open the conversation
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <Textarea aria-label={`Message ${l.seller}`} rows={3} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} placeholder="Is it still available? When can I see it?" />
      <Act capability="marketplace.message" label="Message the seller" full settings={SETTINGS} review={<>Your message goes to {l.seller}: “{text.trim().slice(0, 200)}”. Phone numbers, emails and links can&apos;t be sent; you can share contact details later, yourself.</>} run={async (confirmed) => setStarted((await call<{ id: string }>("/api/m/marketplace/threads", { body: { listingId: l.listingId, message: text, confirmed } })).id)} />
      <p className="text-[12px] text-ink-4">You&apos;ll make an offer, and agree to meet, in the conversation.</p>
    </div>
  );
}

function Page({ l }: { l: MarketListing }) {
  const router = useRouter();
  const saved = useMarketplaceStore((s) => !!s.saved[l.id]);
  const toggle = useMarketplaceStore((s) => s.toggleSaved);
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const rows: [string, string][] = [
    ["Price", `${priceLabel(t.price)}${t.negotiable ? " · negotiable" : ""}`],
    ["Condition", t.condition],
    ["Category", t.category],
    ["Area", l.area],
  ];
  return (
    <ListingPage
      back={FIND}
      title={l.title}
      actions={
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
          {saved ? "Saved" : "Save"}
        </Button>
      }
    >
      <ListingMain>
        <Photos l={l} />
        <ListingHead
          company={l.seller}
          name={l.seller}
          facts={[
            <span key="p" className="font-semibold text-ink">{priceLabel(t.price)}</span>,
            <span key="c" className="inline-flex items-center gap-1"><Tag className="size-3.5" aria-hidden /> {t.condition}</span>,
            <span key="a" className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {l.area}</span>,
          ]}
        />
        {l.sellerVerified && <Badge tone="success">Verified seller</Badge>}
        <h2 className="mt-4 text-[15px] font-semibold text-ink">From the seller</h2>
        <ClampedText text={l.description} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            <Fold title="Details" hint={[priceLabel(t.price), t.condition].join(" · ")}>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-4">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] text-ink-4">As {l.seller} listed it on WonderWorks{l.postedAt ? `, updated ${relativeTime(l.postedAt)}` : ""}. Prices are in rupees. Contact details stay private until the seller shares them.</p>
            </Fold>
            <Fold title="Stay safe" hint="Report or block">
              <ReportBlock noun={l.seller} onBlock={() => call(`/api/m/marketplace/listings/${encodeURIComponent(l.listingId)}`, { method: "PATCH", body: { action: "block" } })} onReport={(reason) => call(`/api/m/marketplace/listings/${encodeURIComponent(l.listingId)}`, { method: "PATCH", body: { action: "report", reason } })} onBlocked={() => router.push(FIND.href)} />
            </Fold>
          </div>
        )}
      </ListingMain>
      <ListingAside>
        <Contact l={l} />
        <ScamWarning className="mt-3" />
      </ListingAside>
    </ListingPage>
  );
}
