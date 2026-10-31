"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { priceLabel, STAGE_OF, STATUS_LABEL, type ThreadStatus } from "../domain";
import { marketplaceManifest } from "../manifest";
import type { ThreadView } from "../threads";
import { useMarketplaceStore } from "../store";

export const itemHref = (id: string) => `/app/m/marketplace/pipeline/${encodeURIComponent(id)}`;
export const TONE: Record<ThreadStatus, Tone> = { messaged: "info", offer: "brand", visit: "brand", done: "success", declined: "neutral", closed: "neutral" };

/** One line for where a deal stands, from the person's side. */
export const lineOf = (t: Pick<ThreadView, "side" | "price" | "offers" | "counterpart" | "status">) => {
  const o = t.offers.at(-1);
  const who = t.side === "buyer" ? `Seller ${t.counterpart}` : `Buyer ${t.counterpart}`;
  return `${who} · asking ${priceLabel(t.price)}${o && o.status === "pending" ? ` · offer ${priceLabel(o.amount)} waiting` : o && o.status === "accepted" ? ` · agreed ${priceLabel(o.amount)}` : ""}`;
};

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
                  <StageCard href={itemHref(t.id)} logo={{ name: t.counterpart }} company={t.side === "buyer" ? "Buying" : "Selling"} title={t.title} line={lineOf(t)} tags={[]} badge={{ label: STATUS_LABEL[t.status], tone: TONE[t.status] }} when="" />
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
