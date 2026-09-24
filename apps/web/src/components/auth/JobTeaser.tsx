"use client";
import { useState } from "react";
import { Bell, Bookmark, Building2, CheckCircle2, Clock, Lock, MapPin, Send, Sparkles, Wallet } from "lucide-react";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { Tabs } from "@/components/common/Tabs";
import { JobQualityBadge } from "@/components/jobs/JobQualityBadge";
import { companyColor } from "@/components/jobs/JobCard";
import { WORK_MODE_LABEL, type JobQuality, type WorkMode } from "@/domain/jobs/types";
import { cn } from "@/lib/cn";

/** The same six dimensions `computeMatch` always scores a posting on (`services/jobs/matching.ts`) — real, fixed category names, not per-job data, so showing them costs nothing to disclose. Their scores and summaries are genuinely per-candidate and stay blurred until sign-in. */
const MATCH_DIMENSIONS: { label: string; barWidth: number }[] = [
  { label: "Skill alignment", barWidth: 72 },
  { label: "Seniority alignment", barWidth: 58 },
  { label: "Industry alignment", barWidth: 84 },
  { label: "Career-goal alignment", barWidth: 64 },
  { label: "Location alignment", barWidth: 46 },
  { label: "Compensation alignment", barWidth: 78 },
];

const SIGN_IN_BENEFITS = [
  { icon: Sparkles, label: "Your personalized match score for this role" },
  { icon: Bookmark, label: "Save it and pick up where you left off" },
  { icon: Send, label: "Apply, prepared by Wonder" },
  { icon: Bell, label: "Get matched to similar roles automatically" },
];

/**
 * Everything a signed-in candidate would see on this job's Overview,
 * Company and Sources & signals tabs — all computed from the posting
 * itself, so none of it needs an account. A match score does need an
 * account (it's scored against the candidate's own Career DNA); that tab
 * says so instead of showing a number.
 */
export interface PublicJobTeaser {
  title: string;
  company: string;
  companyDomain?: string;
  companyHq?: string;
  companySize?: "startup" | "scaleup" | "enterprise";
  location: string;
  workMode: WorkMode;
  salary: string | null;
  postedLabel: string;
  sourceName: string;
  industry: string;
  seniority: string;
  description: string;
  requirements: string[];
  niceToHave: string[];
  skills: string[];
  quality: JobQuality;
}

type Tab = "overview" | "why" | "company" | "sources";

const COMPANY_SIZE_LABEL = { startup: "Startup", scaleup: "Scale-up", enterprise: "Large company" } as const;

/** Shown above the sign-in form for a shared job link: the real listing, the way a signed-in candidate would see it, minus the one thing that's genuinely personal — a match score — which needs an account to compute. */
export function JobTeaser({ job }: { job: PublicJobTeaser }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="mt-8 w-full text-left md:mt-10" padding="md">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
        <Sparkles className="size-3.5" aria-hidden /> Shared job — public details, no account needed
      </p>
      <div className="mt-2 flex items-start gap-3">
        <CompanyLogo name={job.company} color={companyColor(job.company)} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-snug text-ink">{job.title}</h2>
          <p className="text-[13px] text-ink-3">{job.company}</p>
        </div>
        <JobQualityBadge quality={job.quality} className="hidden sm:inline-flex" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden /> {job.location}
        </span>
        <span aria-hidden>•</span>
        <span>{WORK_MODE_LABEL[job.workMode]}</span>
        {job.salary && (
          <>
            <span aria-hidden>•</span>
            <span className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" aria-hidden /> {job.salary}
            </span>
          </>
        )}
        <span aria-hidden>•</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden /> Posted {job.postedLabel}
        </span>
      </div>
      <JobQualityBadge quality={job.quality} className="mt-2 inline-flex sm:hidden" />

      <Tabs value={tab} onChange={setTab} label="Job sections" className="mt-4" items={[{ value: "overview", label: "Overview" }, { value: "why", label: "Why it's a match" }, { value: "company", label: "Company" }, { value: "sources", label: "Sources & signals" }]} />

      <div className="mt-3">
        {tab === "overview" && (
          <div>
            <p className={cn("whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2", !expanded && "line-clamp-[7]")}>{job.description}</p>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[13px] font-medium text-brand-600 hover:underline">
              {expanded ? "Show less" : "Show more"}
            </button>
            {job.requirements.length > 0 && (
              <>
                <h3 className="mt-4 text-[13px] font-semibold text-ink">Key requirements</h3>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {job.requirements.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-[13px] text-ink-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {r}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {job.niceToHave.length > 0 && (
              <>
                <h3 className="mt-4 text-[12px] font-semibold text-ink-2">Nice to have</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {job.niceToHave.map((n) => (
                    <Badge key={n}>{n}</Badge>
                  ))}
                </ul>
              </>
            )}
            {job.skills.length > 0 && (
              <>
                <h3 className="mt-4 text-[12px] font-semibold text-ink-2">Skills</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {job.skills.map((s) => (
                    <Badge key={s} tone="brand">
                      {s}
                    </Badge>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {tab === "why" && (
          <div>
            <p className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Lock className="size-3.5 shrink-0" aria-hidden /> Scored against your own Career Profile — this is the one tab that&apos;s personal to you.
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {MATCH_DIMENSIONS.map((d) => (
                <li key={d.label} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-20 shrink-0 overflow-hidden rounded-full bg-bg-soft" aria-hidden>
                    <div className="h-full rounded-full bg-ink-4/50 blur-[2px]" style={{ width: `${d.barWidth}%` }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink">{d.label}</p>
                    <div className="mt-1.5 h-3 w-11/12 rounded bg-bg-soft blur-[3px]" aria-hidden />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-sm text-[12px] text-ink-4">There&apos;s nothing to unblur without your Career Profile — Wonder never guesses a score. Sign in and it computes for real, instantly.</p>
          </div>
        )}

        {tab === "company" && (
          <div>
            <div className="flex items-center gap-3">
              <CompanyLogo name={job.company} color={companyColor(job.company)} size={40} />
              <div>
                <h3 className="text-[14px] font-semibold text-ink">{job.company}</h3>
                <p className="text-[12.5px] text-ink-3">
                  {job.industry}
                  {job.companySize && ` · ${COMPANY_SIZE_LABEL[job.companySize]}`}
                  {(job.companyHq ?? job.location) && ` · HQ ${job.companyHq ?? job.location}`}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
              <div className="rounded-[10px] bg-bg-soft p-2.5">
                <dt className="text-ink-3">Website</dt>
                <dd className="font-medium text-ink">{job.companyDomain ?? "—"}</dd>
              </div>
              <div className="rounded-[10px] bg-bg-soft p-2.5">
                <dt className="text-ink-3">Seniority</dt>
                <dd className="font-medium capitalize text-ink">{job.seniority}</dd>
              </div>
            </dl>
          </div>
        )}

        {tab === "sources" && (
          <div>
            <p className="text-[13px] text-ink-2">{job.quality.summary}</p>
            <ul className="mt-3 divide-y divide-line rounded-[12px] border border-line">
              {job.quality.signals.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                  <span className="text-ink-2">{s.label}</span>
                  <span className={cn("font-medium", s.sentiment === "positive" ? "text-success-600" : s.sentiment === "caution" ? "text-warning-600" : "text-ink")}>{s.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-4">
              <Building2 className="size-3 shrink-0" aria-hidden /> From {job.sourceName}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[12px] border border-line bg-bg-soft p-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <Lock className="size-3.5 shrink-0" aria-hidden /> What signing in unlocks
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SIGN_IN_BENEFITS.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <b.icon className="size-3.5 shrink-0 text-brand-600" aria-hidden /> {b.label}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
