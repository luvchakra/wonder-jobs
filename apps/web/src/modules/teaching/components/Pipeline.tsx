"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader, SectionHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { BOOKING_LABEL, canWithdraw, gradesLabel, MARK_LABEL, slotLabel, type DemoBooking, OUTSIDE_LABEL, OUTSIDE_STAGE, outsideStatus, stageOf, STATUS_LABEL, type MyTeachingApplication, type TeachingListing } from "../domain";
import { TONE } from "./Application";
import { listingHref, teachingManifest } from "../manifest";
import { useTeachingStore } from "../store";

const noop = () => () => undefined;
/** An application's own page (components/Application.tsx). */
const itemHref = (id: string) => `/app/m/teaching/pipeline/${encodeURIComponent(id)}`;

type Item = { id: string; title: string; company: string; stage: string; status: string; tone: Tone; at: string; line: string; tags?: string[]; app?: MyTeachingApplication; outside?: boolean };

/**
 * Teaching's Pipeline, in Jobs' Pipeline layout (wonderworks/pipeline/parts.tsx): Preparing · Applied · Demo class ·
 * Appointed / Closed as tiles with real counts, opening on the earliest stage with something in it; a stage's statuses
 * as chips; the same compact cards, each opening its page. WonderWorks applications come from the server (what the
 * school actually did); outside ones are those the teacher is preparing for or marked applied on the employer's page.
 */
export function TeachingPipeline() {
  const stages = teachingManifest.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useTeachingStore((s) => s.responses);
  const items = useTeachingStore((s) => s.items);
  const [tab, setTab] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [apps, setApps] = useState<MyTeachingApplication[] | null>(null);
  const [demos, setDemos] = useState<(DemoBooking & { title: string; school: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    Promise.all([call<{ applications: MyTeachingApplication[] }>("/api/m/teaching/applications"), call<{ bookings: (DemoBooking & { title: string; school: string })[] }>("/api/m/teaching/bookings")])
      .then(([r, b]) => {
        setApps(r.applications);
        setDemos(b.bookings);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const list: Item[] = useMemo(() => {
    const out: Item[] = (apps ?? []).map((a) => ({ id: a.id, title: a.title, company: a.company, stage: stageOf(a.status), status: STATUS_LABEL[a.status], tone: TONE[a.status], at: a.updatedAt, line: [a.terms.subject, a.terms.grades?.length ? gradesLabel(a.terms.grades) : null].filter(Boolean).join(" · "), app: a }));
    if (mounted)
      for (const [id, r] of Object.entries(responses)) {
        const l = items[id] as TeachingListing | undefined;
        const st = outsideStatus(r);
        // Outside ones as the teacher marked them; a WonderWorks one only while it's being prepared (the server has it once sent).
        if (l && st && (l.origin === "outside" || st === "preparing")) out.push({ id, title: l.title, company: l.company, stage: OUTSIDE_STAGE[st], status: OUTSIDE_LABEL[st], tone: st === "applied" ? "info" : "neutral", at: r.at, line: l.location, tags: st === "preparing" ? (r.marks ?? []).map((m) => MARK_LABEL[m] ?? m) : undefined, outside: true });
      }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [apps, responses, items, mounted]);

  if (error) return <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!apps) return <PageLoading rows={3} />;

  const withdraw = async (id: string) => {
    setBusy(id);
    try {
      await call(`/api/m/teaching/applications/${id}`, { body: { action: "withdraw" } });
      toast.success("Withdrawn", "The school sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Demo-class bookings (the manifest's section): times to pick, and requested or confirmed ones still to come, soonest first.
  const nowIso = new Date().toISOString();
  const live = new Set(demos.filter((d) => d.status === "requested" || d.status === "confirmed").map((d) => d.responseId));
  const upcoming = demos.filter((d) => d.startsAt >= nowIso && (d.status === "requested" || d.status === "confirmed" || (d.status === "proposed" && !live.has(d.responseId))));
  const toPick = [...new Map(upcoming.filter((d) => d.status === "proposed").map((d) => [d.responseId, d])).values()];
  const booked = upcoming.filter((d) => d.status !== "proposed");

  const count = (stage: string) => list.filter((i) => i.stage === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const inStage = list.filter((i) => i.stage === current);
  const facetsOf = (i: Item) => (current === "preparing" ? (i.tags ?? []) : [i.status]);
  const statuses = [...new Set(inStage.flatMap(facetsOf))];
  const picked = status && statuses.includes(status) ? status : null;
  const shown = picked ? inStage.filter((i) => facetsOf(i).includes(picked)) : inStage;

  return (
    <div>
      <PageHeader title={teachingManifest.pipeline.label} />
      {(toPick.length > 0 || booked.length > 0) && (
        <section aria-label="Demo-class bookings" className="mb-6">
          <SectionHeader title="Demo-class bookings" />
          <StageList label="Demo-class bookings">
            {toPick.map((d) => (
              <li key={`pick:${d.responseId}`}>
                <StageCard href={itemHref(d.responseId)} logo={{ name: d.school }} company={d.school} title={d.title} badge={{ label: "Pick a time", tone: "warning" }} when="" />
              </li>
            ))}
            {booked.map((d) => (
              <li key={d.id}>
                <StageCard href={itemHref(d.responseId)} logo={{ name: d.school }} company={d.school} title={d.title} line={slotLabel(d)} badge={{ label: BOOKING_LABEL[d.status], tone: d.status === "confirmed" ? "success" : "brand" }} when="" />
              </li>
            ))}
          </StageList>
        </section>
      )}
      {list.length === 0 ? (
        <EmptyState title="Nothing in Pipeline yet" body="Teaching jobs you apply to show here, with where each stands." action={{ label: "Find teaching jobs", href: "/app/m/teaching" }} />
      ) : (
        <section aria-label="Pipeline">
          <SectionHeader title="Pipeline" />
          <StageTiles
            label="Openings by stage"
            stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))}
            current={current}
            onPick={(id) => {
              setTab(id);
              setStatus(null);
            }}
          />
          {shown.length === 0 ? (
            <StageEmpty label={label} />
          ) : (
            <>
              {(statuses.length > 1 || (current === "preparing" && statuses.length > 0)) && <StageFilter label={current === "preparing" ? "Filter Preparing" : `Filter ${label} by status`} all={inStage.length} options={statuses.map((st) => ({ value: st, label: st, count: inStage.filter((i) => facetsOf(i).includes(st)).length }))} value={picked} onPick={setStatus} />}
              <StageList label={label}>
                {shown.map((i) => {
                  const canGo = !!i.app && canWithdraw(i.app.status);
                  return (
                    <li key={i.id} className="relative">
                      <StageCard href={i.stage === "preparing" ? listingHref(i.id) : itemHref(i.id)} logo={{ name: i.company }} company={i.company} title={i.title} line={i.line} badge={{ label: i.status, tone: i.tone }} tags={i.tags} when={relativeTime(i.at)} actionSpace={canGo} className={i.outside ? "pr-11" : undefined} />
                      {canGo && (
                        <Button size="sm" variant="ghost" className="absolute bottom-3 right-3" loading={busy === i.id} onClick={() => void withdraw(i.id)} aria-label={`Withdraw your application to ${i.company}`}>
                          Withdraw
                        </Button>
                      )}
                      {i.outside && (
                        <button type="button" onClick={() => useTeachingStore.getState().clearResponse(i.id)} aria-label={`Remove ${i.company} from Pipeline`} title="Remove from Pipeline" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
                          <X className="size-4" aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              </StageList>
            </>
          )}
        </section>
      )}
    </div>
  );
}
