"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { useJobSearch } from "@/lib/useJobSearch";
import { applicationHref } from "@/components/applications/ApplicationCard";
import { ApplicationAttentionList } from "@/components/applications/ApplicationAttentionList";
import { JobCard } from "@/components/jobs/JobCard";
import { ReadinessBlockerCard, SearchStatusLine } from "@/components/jobs/JobsReadiness";

const TOP = 5;

function Section({ title, more, children }: { title: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        {more && (
          <Link href={more.href} className="inline-flex items-center text-[13px] font-medium text-brand-600 hover:underline">
            {more.label} <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Home: what needs the candidate today — the one step that unblocks their jobs, the applications
 * waiting on them, and the best new matches. Everything here is computed from their own data; the
 * full list lives in Find.
 */
export function HomeScreen() {
  const dna = useCareerStore((s) => s.dna);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const saved = useJobsStore((s) => s.saved);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const applications = useApplicationsStore((s) => s.applications);
  // Searches on open when jobs are missing, stale or for a different search — so Home has matches to show.
  const search = useJobSearch({ auto: true });
  const attention = useHomeAttention();
  const firstName = dna.name.split(" ")[0];
  const top = attention.opportunities.filter((id) => jobs[id]).slice(0, TOP);
  const needs = attention.applicationAttention;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight text-ink md:text-[30px]">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {search.readiness.blocker ? (
        <div className="mb-6">
          <ReadinessBlockerCard blocker={search.readiness.blocker} />
        </div>
      ) : (
        <SearchStatusLine search={search} monitoring={attention.isMonitoring} />
      )}

      {needs.length > 0 && (
        <Section title="Needs you" more={{ href: "/app/applications", label: "Applied" }}>
          <ApplicationAttentionList items={needs.slice(0, TOP)} jobs={jobs} hrefFor={(id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)} />
        </Section>
      )}

      {!search.readiness.blocker && (
        <Section title="Best new matches" more={{ href: "/app/jobs", label: "All jobs" }}>
          {top.length ? (
            <ul className="flex flex-col gap-3">
              {top.map((id) => (
                <li key={id}>
                  <JobCard job={jobs[id]} match={matches[id]} saved={!!saved[id]} onToggleSave={() => (saved[id] ? unsave(id) : save(id))} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              {search.active ? "Searching for jobs that fit you…" : "No new matches to review. "}
              {!search.active && (
                <Link href="/app/jobs" className="font-medium text-brand-600 hover:underline">
                  See all jobs
                </Link>
              )}
            </p>
          )}
        </Section>
      )}

      {attention.careerActions.length > 0 && (
        <Section title="Sharpen your profile">
          <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
            {attention.careerActions.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center gap-2 px-4 py-3 text-[14px] text-ink hover:bg-surface-2">
                  <span className="flex-1">{a.label}</span>
                  <ChevronRight className="size-4 text-ink-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
