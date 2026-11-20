"use client";
import { useEffect, useMemo, useState } from "react";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { isOutside, STAGE_OF, STATUS_LABEL, type CofounderListing, type ConnStatus } from "../domain";
import { OUTSIDE_LABEL } from "../outside";
import { lineOf, type ConnView } from "../connections";
import { cofoundersManifest, listingHref } from "../manifest";
import { useCofoundersStore } from "../store";

export const itemHref = (id: string) => `/app/m/cofounders/pipeline/${encodeURIComponent(id)}`;
export const TONE: Record<ConnStatus, Tone> = { interested: "info", mutual: "brand", talking: "brand", building: "success", passed: "neutral" };

/** The person's connections, fetched once on open (nothing else runs). Also brings each listing's mark up to date. */
export function useMyConnections() {
  const [list, setList] = useState<ConnView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ connections: ConnView[] }>("/api/m/cofounders/connections")
      .then((r) => {
        setList(r.connections);
        const st = useCofoundersStore.getState();
        const seen = new Set<string>();
        for (const c of r.connections) {
          const id = c.counterpart.listingId;
          if (seen.has(id)) continue;
          seen.add(id);
          if (st.responses[id]?.status !== c.status) st.setResponse(id, STAGE_OF[c.status], { status: c.status });
        }
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return { list, error, reload: () => (setError(null), void load()) };
}

/**
 * Connections, Co-founders' Pipeline tab: Interested · Mutual · Talking · Building / Passed as tiles with counts, from the
 * person's own connections on the server (with people, and with teams they are on or are asking to join). What waits
 * for them is first in its stage.
 */
export function CofoundersPipeline() {
  const stages = cofoundersManifest.pipeline.stages;
  const { list, error, reload } = useMyConnections();
  const [tab, setTab] = useState<string | null>(null);
  const tracked = useOutsideTracked();
  if (error) return <ErrorState title="Couldn't load your connections" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;
  const count = (stage: string) => list.filter((c) => STAGE_OF[c.status] === stage).length + tracked.filter((o) => o.stage === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const shown = list.filter((c) => STAGE_OF[c.status] === current).sort((a, b) => Number(b.needsYou) - Number(a.needsYou));
  const shownOutside = tracked.filter((o) => o.stage === current);
  return (
    <div>
      <PageHeader title={cofoundersManifest.pipeline.label} />
      {list.length === 0 && tracked.length === 0 ? (
        <EmptyState title="No connections yet" body="Show interest in someone, or ask to join a team. You connect only when interest is mutual." action={{ label: "Find a co-founder", href: "/app/m/cofounders" }} />
      ) : (
        <section aria-label="Connections">
          <StageTiles label="Connections by stage" stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} current={current} onPick={setTab} />
          {shown.length + shownOutside.length === 0 ? (
            <StageEmpty label={label} />
          ) : (
            <StageList label={label}>
              {shown.map((c) => (
                <li key={c.id}>
                  <StageCard href={itemHref(c.id)} logo={{ name: c.counterpart.title }} company={c.counterpart.title} title={c.counterpart.kind === "team" ? "Team" : (c.counterpart.profile?.role ? `${c.counterpart.profile.role} founder` : "Founder")} line={lineOf(c)} tags={[]} badge={c.needsYou ? { label: "Your answer", tone: "warning" } : { label: STATUS_LABEL[c.status], tone: TONE[c.status] }} when={relativeTime(c.updatedAt)} />
                </li>
              ))}
              {shownOutside.map((o) => (
                <li key={o.l.id}>
                  <StageCard href={listingHref(o.l.id)} logo={{ name: o.l.title }} company={o.l.title} title={o.l.kind === "post" ? `Post on ${o.l.sourceName}` : "New startup"} line={o.note || undefined} tags={[]} badge={{ label: OUTSIDE_LABEL[o.status] ?? "Tracked", tone: o.status === "joined" ? "success" : o.stage === "building_passed" ? "neutral" : "info" }} when={relativeTime(o.at)} />
                </li>
              ))}
            </StageList>
          )}
        </section>
      )}
    </div>
  );
}

/** Startups and posts the person tracks after reaching out on their own page (outside.ts): kept only on their device. */
function useOutsideTracked() {
  const responses = useCofoundersStore((s) => s.responses);
  const items = useCofoundersStore((s) => s.items);
  return useMemo(
    () =>
      Object.entries(responses).flatMap(([id, r]) => {
        const l = items[id] as CofounderListing | undefined;
        return l && isOutside(l) && r.status && OUTSIDE_LABEL[r.status] ? [{ l, stage: r.stage, status: r.status, at: r.at, note: r.note }] : [];
      }),
    [responses, items],
  );
}
