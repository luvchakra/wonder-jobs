"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STATUS_LABEL, TERMINAL } from "@/domain/jobs-apply/states";
import type { ApplyProgress } from "@/domain/jobs-apply/mapper";
import { jobsApplyApi, type PublicSession } from "@/services/jobs-apply/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";

type Row = PublicSession & { progress: ApplyProgress };

const GROUPS: { key: string; title: string; test: (s: Row) => boolean }[] = [
  { key: "needs", title: "Needs you", test: (s) => s.status === "WAITING_FOR_USER" || s.status === "AUTHENTICATION_REQUIRED" || (s.status === "PAUSED" && s.failure !== "USER_CANCELLED") || s.status === "UNKNOWN" || s.status === "VERIFICATION" },
  { key: "review", title: "Ready for your review", test: (s) => s.status === "READY_TO_REVIEW" || s.status === "SUBMITTING" },
  { key: "active", title: "In progress", test: (s) => ["READY", "STARTING", "OPENING", "FORM_DETECTED", "ANALYZING", "FILLING", "PARTIAL"].includes(s.status) || (s.status === "PAUSED" && s.failure === "USER_CANCELLED") },
  { key: "failed", title: "Blocked or needs a retry", test: (s) => s.status === "FAILED" || s.status === "BLOCKED" },
  { key: "done", title: "Recently submitted", test: (s) => s.status === "SUBMITTED" || s.status === "TRACKED" },
];

/** §95 Every Apply with Wonder session, grouped by what it needs next. */
export default function JobsApplyDashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    jobsApplyApi
      .list()
      .then((r) => setRows(r.sessions.filter((s) => s.status !== "CANCELLED")))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your applications."));
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/app/applications", label: "Applications" }} eyebrow="Apply with Wonder" title="Applications in progress" description="Where each application stands, and what needs you next. Wonder fills; you review and submit on the employer's site." />
      {error ? (
        <ErrorState title="Couldn't load your applications" body={error} actions={[{ label: "Try again", onClick: () => void load() }]} />
      ) : !rows ? (
        <PageLoading rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing in progress" body="Open a job and choose Apply with Wonder to start. Wonder fills what it can; you answer what only you can and submit." action={{ label: "Find jobs", href: "/app/jobs" }} />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-[13px] text-ink-3" data-testid="wj-apply-count">
            {rows.filter((r) => !TERMINAL.has(r.status) && r.status !== "SUBMITTED").length} application{rows.filter((r) => !TERMINAL.has(r.status) && r.status !== "SUBMITTED").length === 1 ? "" : "s"} in progress
          </p>
          {GROUPS.map((g) => {
            const items = rows.filter(g.test);
            if (!items.length) return null;
            return (
              <section key={g.key} aria-labelledby={`wj-group-${g.key}`}>
                <h2 id={`wj-group-${g.key}`} className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                  {g.title}
                </h2>
                <ul className="flex flex-col gap-3">
                  {items.map((s) => (
                    <li key={s.id}>
                      <Card hover className="p-0">
                        <Link href={`/app/jobs/${encodeURIComponent(s.jobId)}/apply`} className="flex items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-ink">
                              {s.jobTitle} — {s.company}
                            </p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${s.jobTitle} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.status === "SUBMITTED" || s.status === "TRACKED" ? 100 : s.progress.percent}>
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.status === "SUBMITTED" || s.status === "TRACKED" ? 100 : s.progress.percent}%` }} />
                            </div>
                            <p className="mt-1 text-[12px] text-ink-3">
                              {s.progress.needsYou ? `${s.progress.needsYou} question${s.progress.needsYou === 1 ? "" : "s"} need you · ` : ""}
                              {s.destination.domain} · updated {new Date(s.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                          <Badge tone={g.key === "needs" ? "warning" : g.key === "done" ? "success" : g.key === "failed" ? "danger" : "brand"}>{STATUS_LABEL[s.status]}</Badge>
                          <ArrowRight className="size-4 shrink-0 text-ink-4" aria-hidden />
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
