"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Tone } from "@/components/common/Badge";
import { Thumb } from "./Listing";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { shortPlace } from "@/wonderworks/find/place";
import { CARD_TARGET, ResultCard } from "@/wonderworks/find/parts";
import { Badge } from "@/components/common/Badge";
import { relativeTime } from "@/lib/format";
import { StageEmpty, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { priceLabel, STAGE_OF, STATUS_LABEL, type ThreadStatus } from "../domain";
import { marketplaceManifest } from "../manifest";
import type { ThreadView } from "../threads";
import { useMarketplaceStore } from "../store";

export const itemHref = (id: string) => `/app/m/marketplace/pipeline/${encodeURIComponent(id)}`;
export const TONE: Record<ThreadStatus, Tone> = { messaged: "info", offer: "brand", visit: "brand", done: "success", declined: "neutral", closed: "neutral" };

const who = (t: Pick<ThreadView, "side" | "counterpart">) => (/^The /.test(t.counterpart) ? t.counterpart : `${t.side === "buyer" ? "Seller" : "Buyer"} ${t.counterpart}`);

/** One line for where a deal stands, from the person's side (the conversation page's head). */
export const lineOf = (t: Pick<ThreadView, "side" | "price" | "offers" | "counterpart" | "status">) => `${who(t)} · asking ${priceLabel(t.price)}${offerNote(t)}`;

/** The offer's part of that line: waiting, or agreed. */
const offerNote = (t: Pick<ThreadView, "offers">) => {
  const o = t.offers.at(-1);
  return o && o.status === "pending" ? ` · offer ${priceLabel(o.amount)} waiting` : o && o.status === "accepted" ? ` · agreed ${priceLabel(o.amount)}` : "";
};

/**
 * One deal as the item's own listing card (the one Find shows): its photo, title, price, condition, area and category, with
 * where the deal stands and who is on the other side. Opens the conversation.
 */
function DealCard({ t }: { t: ThreadView }) {
  const i = t.item;
  return (
    <ResultCard
      share={null}
      aside={<Thumb listingId={t.listingId} photo={i.photo} size={44} />}
      title={
        <Link href={itemHref(t.id)} className={CARD_TARGET}>
          {t.title}
        </Link>
      }
      facts={[
        <span key="p" className="font-semibold text-ink">
          {priceLabel(t.price)}
          {i.negotiable ? " · negotiable" : ""}
        </span>,
        <span key="c">{i.condition}</span>,
        <span key="a" title={i.area}>{shortPlace(i.area)}</span>,
        <span key="k">{i.category}</span>,
      ]}
      status={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          <Badge tone="neutral">{t.side === "buyer" ? "Buying" : "Selling"}</Badge>
        </span>
      }
      footnote={`${who(t)}${offerNote(t)} · ${relativeTime(t.updatedAt)}`}
    />
  );
}

/** The person's conversations (as buyer or seller), fetched once on open (nothing else runs). */
export function useMyThreads() {
  const [list, setList] = useState<ThreadView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ threads: ThreadView[] }>("/api/m/marketplace/threads")
      .then((r) => {
        setList(r.threads);
        const st = useMarketplaceStore.getState();
        for (const t of r.threads) if (t.side === "buyer" && st.responses[`mk_${t.listingId}`]?.status !== t.status) st.setResponse(`mk_${t.listingId}`, STAGE_OF[t.status], { status: t.status });
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return { list, error, reload: () => (setError(null), void load()) };
}

/**
 * Deals, Buy, Sell & Rent's Pipeline tab: Messaged · Offer · Visit · Done as tiles with counts, from the person's own
 * conversations on the server, as a buyer or a seller. Declined and closed ones end under Done with their own badge. My
 * listings (the selling side) is one link away.
 */
export function MarketplacePipeline() {
  const stages = marketplaceManifest.pipeline.stages;
  const { list, error, reload } = useMyThreads();
  const [tab, setTab] = useState<string | null>(null);
  if (error) return <ErrorState title="Couldn't load your deals" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;
  const count = (stage: string) => list.filter((t) => STAGE_OF[t.status] === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const shown = list.filter((t) => STAGE_OF[t.status] === current);
  return (
    <div>
      <PageHeader title={marketplaceManifest.pipeline.label} />
      {list.length === 0 ? (
        <EmptyState title="No deals yet" body="Message a seller, or wait for a buyer to message you: each conversation shows here." action={{ label: "Find something", href: "/app/m/marketplace" }} />
      ) : (
        <section aria-label="Deals">
          <StageTiles label="Deals by stage" stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} current={current} onPick={setTab} />
          {shown.length === 0 ? (
            <StageEmpty label={label} />
          ) : (
            <StageList label={label}>
              {shown.map((t) => (
                <li key={t.id}>
                  <DealCard t={t} />
                </li>
              ))}
            </StageList>
          )}
        </section>
      )}
      <p className="mt-6 text-[13px] text-ink-3">
        Selling something? <Link href="/app/m/marketplace/company" className="font-medium text-brand-600 hover:underline">My listings</Link>
      </p>
    </div>
  );
}
