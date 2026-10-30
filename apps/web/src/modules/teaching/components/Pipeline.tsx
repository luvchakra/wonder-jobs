"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { EmptyState } from "@/components/common/States";
import { PageHeader, SectionHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageFilter, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { MARK_LABEL, OUTSIDE_LABEL, OUTSIDE_STAGE, outsideStatus, type TeachingListing } from "../domain";
import { listingHref, teachingManifest } from "../manifest";
import { useTeachingStore } from "../store";

const noop = () => () => undefined;

type Item = { id: string; title: string; company: string; stage: string; status: string; at: string; line: string; tags?: string[] };

/**
 * Teaching's Pipeline, in Jobs' Pipeline layout (wonderworks/pipeline/parts.tsx): Preparing · Applied · Demo class ·
 * Appointed / Closed as tiles with real counts, opening on the earliest stage with something in it; a stage's statuses
 * as chips; the same compact cards, each opening its opening's page. What's here is what the teacher did: openings
 * they're preparing for or marked applied after applying on the employer's page.
 */
export function TeachingPipeline() {
  const stages = teachingManifest.pipeline.stages;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const responses = useTeachingStore((s) => s.responses);
  const items = useTeachingStore((s) => s.items);
  const [tab, setTab] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const list: Item[] = useMemo(() => {
    if (!mounted) return [];
    const out: Item[] = [];
    for (const [id, r] of Object.entries(responses)) {
      const l = items[id] as TeachingListing | undefined;
      const st = outsideStatus(r);
      if (l && st) out.push({ id, title: l.title, company: l.company, stage: OUTSIDE_STAGE[st], status: OUTSIDE_LABEL[st], at: r.at, line: l.location, tags: st === "preparing" ? (r.marks ?? []).map((m) => MARK_LABEL[m] ?? m) : undefined });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [responses, items, mounted]);

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
                {shown.map((i) => (
                  <li key={i.id} className="relative">
                    <StageCard href={listingHref(i.id)} logo={{ name: i.company }} company={i.company} title={i.title} line={i.line} badge={{ label: i.status, tone: i.stage === "applied" ? "info" : "neutral" }} tags={i.tags} when={relativeTime(i.at)} className="pr-11" />
                    <button type="button" onClick={() => useTeachingStore.getState().clearResponse(i.id)} aria-label={`Remove ${i.company} from Pipeline`} title="Remove from Pipeline" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
                      <X className="size-4" aria-hidden />
                    </button>
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
