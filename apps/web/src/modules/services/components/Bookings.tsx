"use client";
import { useEffect, useState } from "react";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { chipsOf, clientMay, STAGE_OF, STATUS_LABEL, todayIst, totalLabel, whenLabel, type MyRequest, type ServiceStatus } from "../deal";
import { servicesManifest } from "../manifest";
import { useServicesStore } from "../store";

export const itemHref = (id: string) => `/app/m/services/pipeline/${encodeURIComponent(id)}`;

export const TONE: Record<ServiceStatus, Tone> = { requested: "info", quoted: "warning", booked: "brand", done: "success", declined: "neutral", cancelled: "neutral" };

/** What's waiting on the client, in a word, so the list says where to tap. */
export function nextStep(r: Pick<MyRequest, "status" | "deal">, today = todayIst()): string | null {
  const may = clientMay(r.status, r.deal, today);
  if (may.includes("accept")) return `Quote ${totalLabel(r.deal.quote!)} · accept to book`;
  if (r.status === "quoted") return "Quote expired";
  if (r.status === "requested") return "Waiting for the pro's quote";
  if (may.includes("review")) return "Leave a review";
  if (may.includes("paid")) return "Mark it paid once you've paid";
  return null;
}

/**
 * Bookings, Talent & Services' Pipeline tab: Requested · Quoted · Booked · Done / Closed as tiles with counts, from the
 * client's own requests on the server. Where each ended (Declined, Cancelled) and Paid, Reviewed or Problem reported are
 * chips, not stages (owner: Pipeline stays generic; WonderWorks-only steps are statuses). Opening the page loads the
 * requests, nothing else; it also brings each listing's "requested" mark up to date.
 */
export function ServicesBookings() {
  const stages = servicesManifest.pipeline.stages;
  const [list, setList] = useState<MyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [chip, setChip] = useState<string | null>(null);

  const load = () =>
    call<{ requests: MyRequest[] }>("/api/m/services/requests")
      .then((r) => {
        setList(r.requests);
        // The newest request per listing decides whether Find shows "Quote requested" on it.
        const st = useServicesStore.getState();
        const seen = new Set<string>();
        for (const q of r.requests) {
          const id = `ws_${q.listingId}`;
          if (seen.has(id)) continue;
          seen.add(id);
          if (st.responses[id]?.status !== q.status) st.setResponse(id, STAGE_OF[q.status], { status: q.status });
        }
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorState title="Couldn't load your bookings" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!list) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((r) => STAGE_OF[r.status] === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const inStage = list.filter((r) => STAGE_OF[r.status] === current);
  const chipsFor = (r: MyRequest) => chipsOf(r.status, r.deal, "client");
  const chips = [...new Set(inStage.flatMap(chipsFor))];
  const picked = chip && chips.includes(chip) ? chip : null;
  const shown = picked ? inStage.filter((r) => chipsFor(r).includes(picked)) : inStage;

  return (
    <div>
      <PageHeader title={servicesManifest.pipeline.label} />
      {list.length === 0 ? (
        <EmptyState title="No bookings yet" body="Request a quote from a pro on WonderWorks: their quote, your booking and the job show here." action={{ label: "Find a pro", href: "/app/m/services" }} />
      ) : (
        <section aria-label="Bookings">
          <StageTiles
            label="Bookings by stage"
            stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))}
            current={current}
            onPick={(id) => {
              setTab(id);
              setChip(null);
            }}
          />
          {shown.length === 0 ? (
            <StageEmpty label={label} />
          ) : (
            <>
              {chips.length > 0 && <StageFilter label={`Filter ${label}`} all={inStage.length} options={chips.map((c) => ({ value: c, label: c, count: inStage.filter((r) => chipsFor(r).includes(c)).length }))} value={picked} onPick={setChip} />}
              <StageList label={label}>
                {shown.map((r) => (
                  <li key={r.id}>
                    <StageCard
                      href={itemHref(r.id)}
                      logo={{ name: r.pro }}
                      company={r.pro}
                      title={r.title}
                      line={nextStep(r) ?? whenLabel(r.request)}
                      tags={chipsFor(r).filter((c) => c !== STATUS_LABEL[r.status])}
                      badge={{ label: STATUS_LABEL[r.status], tone: TONE[r.status] }}
                      when={relativeTime(r.updatedAt)}
                    />
                  </li>
                ))}
              </StageList>
            </>
          )}
        </section>
      )}
    </div>
  );
}
