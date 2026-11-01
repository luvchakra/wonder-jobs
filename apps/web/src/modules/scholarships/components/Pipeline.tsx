"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { PageHeader, SectionHeader } from "@/wonderworks/chrome/PageHeader";
import { toast } from "@/components/feedback/Toast";
import { StageCard, StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { call } from "@/wonderworks/api";
import { listingHref, scholarshipsManifest } from "../manifest";
import { canWithdraw, deadlineLabel, deadlines, KIND_LABEL, OUTSIDE_LABEL, OUTSIDE_STAGE, outsideStatus, shortDate, stageOf, STATUS_LABEL, valueLabel, type MyScholarshipApplication, type ScholarshipListing, type ScholarshipStatus } from "../domain";
import { savedItems, useScholarshipsStore } from "../store";

const noop = () => () => undefined;
const itemHref = (id: string) => `/app/m/scholarships/pipeline/${encodeURIComponent(id)}`;
const MARK_LABEL: Record<string, string> = { apply_opened: "Official page opened", draft: "Statement drafted" };

type Item = { id: string; title: string; company: string; domain?: string; stage: string; status: string; tone: Tone; line: string; at: string; tags?: string[]; app?: MyScholarshipApplication; outside?: ScholarshipListing; href?: string };

const TONE: Record<ScholarshipStatus, Tone> = { applied: "info", shortlisted: "brand", accepted: "success", done: "success", declined: "neutral", withdrawn: "neutral" };

/**
 * Scholarships & Projects' Applications, in Jobs' Pipeline layout (wonderworks/pipeline/parts.tsx): Saved · Preparing
 * · Applied · Shortlisted · Awarded / Selected · Completed as tiles with real counts, opening on the stage with something
 * to do; a stage's statuses as chips (Not selected and Withdrawn stay under Applied); compact cards with one action
 * each; then Deadlines — what closes when among the saved ones not yet applied to. WonderWorks applications come from
 * the server (what the organisation actually did); outside ones are what the student marked.
 */
export function ScholarshipsPipeline() {
  const stages = scholarshipsManifest.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useScholarshipsStore((s) => s.responses);
  const items = useScholarshipsStore((s) => s.items);
  const saved = useScholarshipsStore((s) => s.saved);
  const [apps, setApps] = useState<MyScholarshipApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    call<{ applications: MyScholarshipApplication[] }>("/api/m/scholarships/applications")
      .then((r) => setApps(r.applications))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const list: Item[] = useMemo(() => {
    const out: Item[] = (apps ?? []).map((a) => ({ id: a.id, title: a.title, company: a.company, stage: stageOf(a.status), status: STATUS_LABEL[a.status], tone: TONE[a.status], line: `${KIND_LABEL[a.terms.kind]} · ${valueLabel(a.terms)}`, at: a.updatedAt, app: a, href: itemHref(a.id) }));
    if (!mounted) return out;
    const sentPostings = new Set((apps ?? []).map((a) => `ws_${a.postingId}`));
    const tracked = new Set<string>();
    for (const [id, r] of Object.entries(responses)) {
      const l = items[id] as ScholarshipListing | undefined;
      const st = outsideStatus(r);
      if (!l || !st || sentPostings.has(id)) continue;
      // Outside ones as the student marked them; a WonderWorks one only while it's being prepared (the server has it once sent).
      if (l.origin === "outside" || st === "preparing") {
        tracked.add(id);
        out.push({ id, title: l.title, company: l.company, domain: l.companyDomain, stage: OUTSIDE_STAGE[st], status: OUTSIDE_LABEL[st], tone: st === "applied" ? "info" : "neutral", line: deadlineLabel(l.terms), at: r.at, tags: st === "preparing" ? (r.marks ?? []).map((m) => MARK_LABEL[m] ?? m) : undefined, outside: l.origin === "outside" ? l : undefined, href: listingHref(id) });
      }
    }
    // Saved: saved ones not yet prepared or applied to.
    for (const l of savedItems({ saved, items })) {
      if (tracked.has(l.id) || sentPostings.has(l.id)) continue;
      out.push({ id: l.id, title: l.title, company: l.company, domain: l.companyDomain, stage: "saved", status: KIND_LABEL[l.terms.kind], tone: "neutral", line: `${valueLabel(l.terms)} · ${deadlineLabel(l.terms)}`, at: saved[l.id], href: listingHref(l.id) });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [apps, responses, items, saved, mounted]);

  const due = useMemo(() => {
    if (!mounted || !apps) return [];
    const done = new Set([...apps.map((a) => `ws_${a.postingId}`), ...Object.entries(responses).filter(([, r]) => outsideStatus(r) && outsideStatus(r) !== "preparing").map(([id]) => id)]);
    return deadlines(savedItems({ saved, items }), done);
  }, [mounted, apps, saved, items, responses]);

  if (error) return <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!apps) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((i) => i.stage === stage).length;
  // Opens on what needs doing: something being prepared, then the earliest stage with anything in it.
  const current = tab ?? (count("preparing") ? "preparing" : (stages.find((s) => count(s.id))?.id ?? stages[0].id));
  const label = stages.find((s) => s.id === current)!.label;
  const inStage = list.filter((i) => i.stage === current);
  const facetsOf = (i: Item) => (current === "preparing" ? (i.tags ?? []) : [i.status]);
  const statuses = [...new Set(inStage.flatMap(facetsOf))];
  const picked = status && statuses.includes(status) ? status : null;
  const shown = picked ? inStage.filter((i) => facetsOf(i).includes(picked)) : inStage;

  const withdraw = async (id: string) => {
    setBusy(id);
    try {
      await call(`/api/m/scholarships/applications/${id}`, { body: { action: "withdraw" } });
      toast.success("Withdrawn", "The organisation sees it as withdrawn.");
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
      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Scholarships and projects you save or apply to show here, with where each stands and what closes when." action={{ label: "Find scholarships and projects", href: "/app/m/scholarships" }} />
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
                    const canWd = !!i.app && canWithdraw(i.app.status);
                    return (
                      <li key={i.id} className="relative">
                        <StageCard href={i.href} logo={{ name: i.company, domain: i.domain }} company={i.company} title={i.title} line={i.line} badge={{ label: i.status, tone: i.tone }} tags={i.tags} when={relativeTime(i.at)} actionSpace={canWd} className={i.outside ? "pr-11" : undefined} />
                        {canWd && (
                          <Button size="sm" variant="ghost" className="absolute bottom-3 right-3" loading={busy === i.id} onClick={() => void withdraw(i.id)} aria-label={`Withdraw your application to ${i.company}`}>
                            Withdraw
                          </Button>
                        )}
                        {i.outside && (
                          <button type="button" onClick={() => useScholarshipsStore.getState().clearResponse(i.id)} aria-label={`Remove ${i.title} from Applications`} title="Remove from Applications" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
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
                {due.slice(0, 12).map((d) => (
                  <li key={d.id}>
                    <StageCard href={listingHref(d.id)} logo={{ name: d.company }} company={d.company} title={d.title} line={KIND_LABEL[d.kind]} badge={{ label: `${d.label} · ${shortDate(d.date)}`, tone: d.label.includes("today") || d.label.includes("tomorrow") ? "danger" : "warning" }} when="" />
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
