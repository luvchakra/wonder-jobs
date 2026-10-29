"use client";
import { useMemo } from "react";
import { ListTodo } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { actionsRequired } from "@/domain/digest/build";
import { computeApplicationAttention } from "@/domain/career/attention";
import { useNow } from "@/lib/motion";
import { EmptyState } from "@/components/common/States";
import { AttentionList, type AttentionRow } from "@/components/career/AttentionList";
import { attentionRows } from "@/modules/jobs/pipeline/ApplicationAttentionList";
import { applicationHref } from "@/modules/jobs/pipeline/ApplicationCard";

/**
 * What needs the candidate — interviews, follow-ups, materials to review, employer replies, offers, then what holds
 * matching back (profile gaps, patterns to confirm) — each with its one action. Worked out from the app's own state as
 * it changes; the bell's badge counts the same list.
 */
export function useAttentionRows(): AttentionRow[] {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const now = useNow();
  return useMemo<AttentionRow[]>(() => {
    const items = computeApplicationAttention(applications, now);
    const actions = actionsRequired({ dna, learnedSignals: learnedSignals ?? [], applications: Object.values(applications) });
    // "ready for your review" is already a row per application above.
    const profile = actions.filter((a) => a.href !== "/app/applications");
    return [
      ...attentionRows(items, jobs, applications, (id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)),
      ...profile.map((a) => ({ key: a.text, href: a.href ?? "/app/career-dna", label: a.text, icon: ListTodo, tone: "neutral" as const, action: { label: "Fix", href: a.href ?? "/app/career-dna" } })),
    ];
  }, [applications, jobs, dna, learnedSignals, now]);
}

/** Notifications' second tab. */
export function NeedsAttention({ rows, empty }: { rows: AttentionRow[]; /** Where an empty list leads, when it isn't Jobs' Pipeline. */ empty?: { label: string; href: string } }) {
  return rows.length ? <AttentionList rows={rows} /> : <EmptyState title="Nothing needs you right now" body={empty ? "What needs you here shows up in this list." : "Interviews coming up, follow-ups that are due, replies and offers show here."} action={empty ?? { label: "Open Pipeline", href: "/app/applications" }} />;
}
