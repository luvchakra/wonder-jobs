"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { PageHeader, SectionHeader } from "@/wonderworks/chrome/PageHeader";
import { toast } from "@/components/feedback/Toast";
import { internshipsManifest, listingHref } from "../manifest";
import { StageCard, StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { call } from "../api";
import { canWithdraw, deadlines, MARK_LABEL, OUTSIDE_LABEL, OUTSIDE_STAGE, outsideStatus, durationLabel, shortDate, stageOf, STATUS_LABEL, stipendLabel, type InternshipListing, type InternshipStatus, type MyInternshipApplication } from "../domain";
import { savedItems, useInternshipsStore } from "../store";

const noop = () => () => undefined;
/** An application's own page (components/Application.tsx). */
const itemHref = (id: string) => `/app/m/internships/pipeline/${encodeURIComponent(id)}`;

type Item = { id: string; title: string; company: string; stage: string; status: string; tone: Tone; line: string; at: string; tags?: string[]; app?: MyInternshipApplication; outside?: InternshipListing };

const TONE: Record<InternshipStatus, Tone> = { applied: "info", shortlisted: "brand", offer: "success", accepted: "success", closed: "neutral", withdrawn: "neutral" };

/**
 * Internships' Pipeline (WJ-418, WJ-421), in Jobs' Pipeline layout (platform/pipeline/parts.tsx): Preparing · Applied ·
 * Shortlisted · Offer · Accepted / Closed as tiles with real counts, opening on the stage with something to do; a stage's statuses as
 * chips; the same compact cards, with the one action each needs, each opening its application's page; then Deadlines. WonderWorks applications come from the
 * server (what the company actually did); outside ones are those the student marked applied after applying on the
 * employer's page.
 */
export function InternshipsPipeline() {
  const stages = internshipsManifest.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useInternshipsStore((s) => s.responses);
  const items = useInternshipsStore((s) => s.items);
  const saved = useInternshipsStore((s) => s.saved);
  const [apps, setApps] = useState<MyInternshipApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    call<{ applications: MyInternshipApplication[] }>("/api/m/internships/applications")
      .then((r) => setApps(r.applications))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const list: Item[] = useMemo(() => {
    const out: Item[] = (apps ?? []).map((a) => ({ id: a.id, title: a.title, company: a.company, stage: stageOf(a.status), status: STATUS_LABEL[a.status], tone: TONE[a.status], line: `${stipendLabel(a.terms)} · ${durationLabel(a.terms)}`, at: a.updatedAt, app: a }));
    if (mounted)
      for (const [id, r] of Object.entries(responses)) {
        const l = items[id] as InternshipListing | undefined;
        const st = outsideStatus(r);
        // Outside ones as the student marked them; a WonderWorks one only while it's still being prepared (the server has it once sent).
        if (l && st && (l.origin === "outside" || st === "preparing")) out.push({ id, title: l.title, company: l.company, stage: OUTSIDE_STAGE[st], status: OUTSIDE_LABEL[st], tone: st === "applied" ? "info" : "neutral", line: l.location, at: r.at, tags: st === "preparing" ? (r.marks ?? []).map((m) => MARK_LABEL[m] ?? m) : undefined, outside: l });
      }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [apps, responses, items, mounted]);

  const due = useMemo(() => (mounted && apps ? deadlines(savedItems({ saved, items }), apps) : []), [mounted, apps, saved, items]);

  if (error) return <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!apps) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((i) => i.stage === stage).length;
  // Opens on the stage with something to do: an offer to answer first, then the earliest stage with anything in it.
  const current = tab ?? (count("offer") ? "offer" : (stages.find((s) => count(s.id))?.id ?? stages[0].id));
  const label = stages.find((s) => s.id === current)!.label;
  const inStage = list.filter((i) => i.stage === current);
  // Preparing is filtered by what was done (Résumé made, Apply opened), as on Jobs; the other stages by status.
  const facetsOf = (i: Item) => (current === "preparing" ? (i.tags ?? []) : [i.status]);
  const statuses = [...new Set(inStage.flatMap(facetsOf))];
  const picked = status && statuses.includes(status) ? status : null;
  const shown = picked ? inStage.filter((i) => facetsOf(i).includes(picked)) : inStage;

  const act = async (id: string, action: "withdraw" | "accept") => {
    setBusy(id);
    try {
      await call(`/api/m/internships/applications/${id}`, { body: { action } });
      toast.success(action === "accept" ? "Offer accepted" : "Withdrawn", action === "accept" ? "The company sees that you accepted." : "The company sees it as withdrawn.");
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Applications" />
      {list.length === 0 && due.length === 0 ? (
        <EmptyState title="No applications yet" body="Internships you apply to show here, with where each stands." action={{ label: "Find internships", href: "/app/m/internships" }} />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label="Pipeline">
            <SectionHeader title="Pipeline" />
            <StageTiles
              label="Applications by stage"
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
                    const offer = i.app?.status === "offer";
                    const withdraw = !!i.app && !offer && canWithdraw(i.app.status);
                    return (
                      <li key={i.id} className="relative">
                        <StageCard href={i.stage === "preparing" ? listingHref(i.id) : itemHref(i.id)} logo={{ name: i.company }} company={i.company} title={i.title} line={i.line} badge={{ label: i.status, tone: i.tone }} tags={i.tags} when={relativeTime(i.at)} actionSpace={offer || withdraw} className={i.outside ? "pr-11" : undefined} />
                        {offer && (
                          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                            <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => void act(i.id, "withdraw")} aria-label={`Decline the offer from ${i.company}`}>
                              Decline
                            </Button>
                            <Button size="sm" loading={busy === i.id} onClick={() => void act(i.id, "accept")} aria-label={`Accept the offer from ${i.company}`}>
                              Accept
                            </Button>
                          </div>
                        )}
                        {withdraw && (
                          <Button size="sm" variant="ghost" className="absolute bottom-3 right-3" loading={busy === i.id} onClick={() => void act(i.id, "withdraw")} aria-label={`Withdraw your application to ${i.company}`}>
                            Withdraw
                          </Button>
                        )}
                        {i.outside && (
                          <button type="button" onClick={() => useInternshipsStore.getState().clearResponse(i.id)} aria-label={`Remove ${i.company} from Pipeline`} title="Remove from Pipeline" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
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
          {due.length > 0 && (
            <section aria-label="Deadlines">
              <SectionHeader title="Deadlines" />
              <StageList label="Deadlines">
                {due.slice(0, 9).map((d) => (
                  <li key={d.id}>
                    <StageCard href={d.id.startsWith("apply:") ? undefined : itemHref(d.id.slice(d.id.indexOf(":") + 1))} logo={{ name: d.company }} company={d.company} title={d.title} badge={{ label: `${d.label} ${shortDate(d.date)}`, tone: d.label === "Starts" ? "success" : "warning" }} when="" />
                  </li>
                ))}
              </StageList>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
