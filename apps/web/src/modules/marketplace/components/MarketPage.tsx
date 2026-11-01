"use client";
import { TranslatedText } from "@/wonderworks/translate/TranslatedText";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Textarea } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { call } from "@/wonderworks/api";
import { Act } from "@/wonderworks/pipeline/Act";
import { ReportBlock } from "@/wonderworks/pipeline/ReportBlock";
import { findListing } from "@/wonderworks/store";
import { isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { MAX_MESSAGE, priceLabel, STATUS_LABEL, type ListingState, type MarketListing } from "../domain";
import type { ThreadView } from "../threads";
import { useMarketplaceStore } from "../store";
import { Gallery } from "./Gallery";
import { ScamWarning } from "./ScamWarning";
import { shareOf } from "../share";

const noop = () => () => undefined;
const FIND = { href: "/app/m/marketplace", label: "Buy, Sell & Rent" };
const SETTINGS = { href: "/app/m/marketplace/you/profile#settings", label: "Buy, Sell & Rent → You" };

/**
 * One listing's own page, on WonderWorks' listing page (wonderworks/listing/): photos, the head, "From the seller", then the
 * Details and Safety folds. The aside is how to reach the seller: a first message here, never a phone number or email (the
 * seller shares those themselves once they choose). Shown from what the person saw: their saves, else their last search.
 */
type Mine = MarketListing & { state: ListingState };

export function MarketPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useMarketplaceStore((s) => findListing(s, id)) as MarketListing | undefined;
  // Not among the person's results or saves: it may be one of their own listings (My listings opens it here).
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  useEffect(() => {
    if (!mounted || l) return;
    let live = true;
    call<{ listings: Mine[] }>("/api/m/marketplace/listings")
      .then((r) => live && setMine(r.listings.find((x) => x.id === id || x.listingId === id) ?? null))
      .catch(() => live && setMine(null));
    return () => {
      live = false;
    };
  }, [mounted, l, id]);
  if (!mounted || (!l && mine === undefined)) return <PageLoading rows={3} />;
  if (l) return <Page l={l} />;
  if (mine) return <Page l={mine} owner={mine.state} />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={FIND} title="Listing not found" />
      <EmptyState title="This listing isn't in your results" body="It may have left your last search. Search again to find it." action={{ label: "Back to Buy, Sell & Rent", href: FIND.href }} />
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

const STATE_TONE: Record<ListingState, "neutral" | "success" | "brand" | "danger"> = { draft: "neutral", open: "success", sold: "brand", hidden: "danger", closed: "neutral" };
const STATE_TEXT: Record<ListingState, string> = { draft: "Draft: only you can see it", open: "Live in Find", sold: "Sold", hidden: "Hidden after reports", closed: "Taken down" };

/** The seller's side of their own listing: where it stands, what they can do, and who has messaged about it. */
function OwnerPanel({ l, state }: { l: MarketListing; state: ListingState }) {
  const [threads, setThreads] = useState<ThreadView[] | null>(null);
  useEffect(() => {
    let live = true;
    call<{ threads: ThreadView[] }>("/api/m/marketplace/threads")
      .then((r) => live && setThreads(r.threads.filter((t) => t.listingId === l.listingId && t.side === "seller")))
      .catch(() => live && setThreads([]));
    return () => {
      live = false;
    };
  }, [l.listingId]);
  const patch = (body: Record<string, unknown>) => call(`/api/m/marketplace/listings/${encodeURIComponent(l.listingId)}`, { method: "PATCH", body });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge tone={STATE_TONE[state]}>{state === "open" ? "Live" : state === "hidden" ? "Hidden" : state[0].toUpperCase() + state.slice(1)}</Badge>
        <span className="text-[13px] text-ink-3">{STATE_TEXT[state]}</span>
      </div>
      {(state === "draft" || state === "open" || state === "closed") && (
        <Link href={`/app/m/marketplace/company?edit=${encodeURIComponent(l.listingId)}`} className="inline-flex h-10 items-center justify-center rounded-full border border-line bg-surface px-4 text-[14px] font-semibold text-ink hover:bg-bg-soft">
          Edit listing and photos
        </Link>
      )}
      {(state === "draft" || state === "closed") && (
        <Act capability="marketplace.publish" label="Publish" full settings={SETTINGS} review={<>“{l.title}” goes into Find at {priceLabel(l.terms.price)}, with your first name and area. Contact details stay private.</>} run={async (confirmed) => (await patch({ action: "publish", confirmed }), window.location.reload())} done="Published" />
      )}
      {state === "open" && (
        <Button full variant="outline" onClick={() => patch({ action: "state", state: "closed" }).then(() => window.location.reload()).catch((e: Error) => toast.error("Couldn't do that", e.message))}>
          Take down
        </Button>
      )}
      <div className="border-t border-line pt-3">
        <h2 className="text-[14px] font-semibold text-ink">Conversations</h2>
        {!threads ? (
          <p className="mt-1 text-[13px] text-ink-3">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-3">{state === "open" ? "No one has messaged yet." : "Buyers can message you once it's live."}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/app/m/marketplace/pipeline/${encodeURIComponent(t.id)}`} className="flex items-center justify-between gap-2 rounded-[12px] border border-line px-3 py-2 text-[14px] hover:bg-bg-soft">
                  <span className="truncate font-medium text-ink">{t.counterpart}</span>
                  <Badge tone="info">{STATUS_LABEL[t.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Page({ l, owner }: { l: MarketListing; owner?: ListingState }) {
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
      share={shareOf(l)}
      back={owner ? { href: "/app/m/marketplace/company", label: "My listings" } : FIND}
      title={l.title}
      actions={
        owner ? undefined : (
          <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
            {saved ? "Saved" : "Save"}
          </Button>
        )
      }
    >
      <ListingMain>
        <Gallery listingId={l.listingId} photos={l.terms.photos} title={l.title} />
        <ListingHead
          company={owner ? "You" : l.seller}
          name={owner ? "You" : l.seller}
          facts={[
            <span key="p" className="font-semibold text-ink">{priceLabel(t.price)}</span>,
            <span key="c" className="inline-flex items-center gap-1"><Tag className="size-3.5" aria-hidden /> {t.condition}</span>,
            <span key="a" className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {l.area}</span>,
          ]}
        />
        {l.sellerVerified && !owner && <Badge tone="success">Verified seller</Badge>}
        <TranslatedText id={l.id} title={l.title} heading={"From the seller"} text={l.description} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
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
            {!owner && <Fold title="Stay safe" hint="Report or block">
              <ReportBlock noun={l.seller} onBlock={() => call(`/api/m/marketplace/listings/${encodeURIComponent(l.listingId)}`, { method: "PATCH", body: { action: "block" } })} onReport={(reason) => call(`/api/m/marketplace/listings/${encodeURIComponent(l.listingId)}`, { method: "PATCH", body: { action: "report", reason } })} onBlocked={() => router.push(FIND.href)} />
            </Fold>}
          </div>
        )}
      </ListingMain>
      <ListingAside>
        {owner ? <OwnerPanel l={l} state={owner} /> : <Contact l={l} />}
        <ScamWarning className="mt-3" />
      </ListingAside>
    </ListingPage>
  );
}
