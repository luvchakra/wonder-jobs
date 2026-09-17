"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bookmark, Building2, CheckCircle2, ExternalLink, MapPin, Share2, ThumbsDown, Clock, Wallet } from "lucide-react";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import { COMPANIES, JOB_SOURCES } from "@/services/mock/catalog";
import { formatSalaryRange, relativeTime, formatDate } from "@/lib/format";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Tabs } from "@/components/common/Tabs";
import { EmptyState } from "@/components/common/States";
import { CompanyLogo } from "@/components/common/Avatar";
import { MatchBadge, FitLabel } from "@/components/jobs/MatchBadge";
import { JobQualityBadge } from "@/components/jobs/JobQualityBadge";
import { WORK_MODE_LABEL, companyColor } from "@/components/jobs/JobCard";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

type Tab = "overview" | "why" | "company" | "sources";

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const job = useJobsStore((s) => s.jobs[id]);
  const match = useJobsStore((s) => s.matches[id]);
  const quality = useJobsStore((s) => s.quality[id]);
  const saved = useJobsStore((s) => !!s.saved[id]);
  const rejected = useJobsStore((s) => !!s.rejected[id]);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const reject = useJobsStore((s) => s.reject);
  const unreject = useJobsStore((s) => s.unreject);
  const application = useApplicationsStore((s) => Object.values(s.applications).find((a) => a.jobId === id));
  const createApp = useApplicationsStore((s) => s.create);
  const [tab, setTab] = useState<Tab>("overview");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (job) track("job_viewed", { jobId: job.id, fit: match?.fit });
  }, [job, match?.fit]);

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/jobs", label: "Jobs" }} title="Job not found" />
        <EmptyState title="This job isn't in your catalog" body="It may have been removed in a newer run." action={{ label: "Back to jobs", href: "/app/jobs" }} />
      </div>
    );
  }
  const company = COMPANIES.find((c) => c.name === job.company);
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  const sources = job.sourceIds.map((sid) => JOB_SOURCES.find((s) => s.id === sid)).filter(Boolean);

  const prepare = () => {
    const app = application ?? createApp(job.id, "saved");
    if (!saved) save(job.id);
    router.push(`/app/applications/${app.id}/prepare`);
  };
  const share = async () => {
    const url = `${window.location.origin}/app/jobs/${job.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${job.title} — ${job.company}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: "/app/jobs", label: "Jobs" }}
        title={job.title}
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Share2 className="size-4" aria-hidden />} onClick={share}>
              Share
            </Button>
            <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => (saved ? unsave(job.id) : save(job.id))}>
              {saved ? "Saved" : "Save"}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Card className="mb-4">
            <div className="flex items-start gap-4">
              <CompanyLogo name={job.company} color={companyColor(job.company)} size={56} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold text-ink">{job.company}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {job.location}
                  </span>
                  <span>•</span>
                  <span>{WORK_MODE_LABEL[job.workMode]}</span>
                  {salary && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="size-3.5" aria-hidden /> {salary}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> Posted {relativeTime(job.postedAt)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-ink-3">
                  <span>Source{sources.length > 1 ? "s" : ""}:</span>
                  {sources.map((s) => (
                    <Badge key={s!.id}>{s!.name}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {match && <MatchBadge match={match} />}
              {match?.highlights.map((h) => (
                <Badge key={h} tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>
                  {h}
                </Badge>
              ))}
              {quality && <JobQualityBadge quality={quality} />}
              {application && <Badge tone={APPLICATION_STATUS_META[application.status].tone}>{APPLICATION_STATUS_META[application.status].label}</Badge>}
              {rejected && <Badge tone="neutral">Marked not for me</Badge>}
            </div>
          </Card>

          <Tabs value={tab} onChange={setTab} label="Job sections" items={[{ value: "overview", label: "Overview" }, { value: "why", label: "Why it's a match" }, { value: "company", label: "Company" }, { value: "sources", label: "Sources & signals" }]} className="mb-4" />

          {tab === "overview" && (
            <Card>
              <h2 className="text-[15px] font-semibold text-ink">Job description</h2>
              <p className={cn("mt-2 text-[14px] leading-relaxed text-ink-2", !expanded && "line-clamp-3")}>{job.description}</p>
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-[13px] font-medium text-brand-600 hover:underline">
                {expanded ? "Show less" : "Show more"}
              </button>
              <h2 className="mt-6 text-[15px] font-semibold text-ink">Key requirements</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {job.requirements.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-[14px] text-ink-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
              {job.niceToHave.length > 0 && (
                <>
                  <h3 className="mt-5 text-[13px] font-semibold text-ink-2">Nice to have</h3>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {job.niceToHave.map((n) => (
                      <Badge key={n}>{n}</Badge>
                    ))}
                  </ul>
                </>
              )}
              <h3 className="mt-5 text-[13px] font-semibold text-ink-2">Skills</h3>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {job.skills.map((s) => (
                  <Badge key={s} tone="brand">
                    {s}
                  </Badge>
                ))}
              </ul>
            </Card>
          )}

          {tab === "why" && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-ink">Why this job?</h2>
                {match && <FitLabel fit={match.fit} />}
              </div>
              {match ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {match.reasons.map((r) => (
                    <li key={r.dimension} className="flex gap-3">
                      <div className="mt-1.5 h-2 w-20 shrink-0 overflow-hidden rounded-full bg-bg-soft" aria-hidden>
                        <div className={cn("h-full rounded-full", r.score >= 0.8 ? "bg-success-600" : r.score >= 0.55 ? "bg-brand-500" : "bg-warning-600")} style={{ width: `${Math.round(r.score * 100)}%` }} />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-ink">
                          {r.label} <span className="ml-1 text-[12px] font-normal text-ink-3">{r.score >= 0.8 ? "Strong" : r.score >= 0.55 ? "Good" : "Weak"}</span>
                        </p>
                        <p className="text-[13px] text-ink-3">{r.summary}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-3">Run Wonder to compute a match for this role.</p>
              )}
              <p className="mt-4 text-[12px] text-ink-4">Match scores estimate alignment with your Career DNA. They are a guide, not a verdict.</p>
            </Card>
          )}

          {tab === "company" && (
            <Card>
              <div className="flex items-center gap-3">
                <CompanyLogo name={job.company} color={company?.color} size={44} />
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">{job.company}</h2>
                  <p className="text-[13px] text-ink-3">
                    {job.industry} · {company?.size === "enterprise" ? "Large company" : company?.size === "scaleup" ? "Scale-up" : "Startup"} · HQ {company?.hq ?? job.location}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-[12px] bg-surface-2 p-3">
                  <dt className="text-ink-3">Website</dt>
                  <dd className="font-medium text-ink">{job.companyDomain ?? "—"}</dd>
                </div>
                <div className="rounded-[12px] bg-surface-2 p-3">
                  <dt className="text-ink-3">Industry</dt>
                  <dd className="font-medium text-ink">{job.industry}</dd>
                </div>
              </dl>
              <p className="mt-4 inline-flex items-center gap-2 text-[12px] text-ink-4">
                <Building2 className="size-3.5" aria-hidden /> Company reviews appear here when a review source is connected.
              </p>
            </Card>
          )}

          {tab === "sources" && quality && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">Hiring signals</h2>
                <JobQualityBadge quality={quality} />
              </div>
              <p className="mt-2 text-[14px] text-ink-2">{quality.summary}</p>
              <ul className="mt-4 divide-y divide-line rounded-[14px] border border-line">
                {quality.signals.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 p-3 text-[13px]">
                    <span className="text-ink-2">{s.label}</span>
                    <span className={cn("font-medium", s.sentiment === "positive" ? "text-success-600" : s.sentiment === "caution" ? "text-warning-600" : "text-ink")}>{s.value}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-ink-4">Signals are observations, not claims about the employer&apos;s intent. Last observed {formatDate(job.observedAt)}.</p>
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="flex flex-col gap-2">
            <Button size="lg" full onClick={prepare}>
              {application && application.status !== "saved" ? "Open application" : "Prepare Application"}
            </Button>
            <Button
              size="lg"
              full
              variant="outline"
              icon={<ThumbsDown className="size-4" aria-hidden />}
              aria-pressed={rejected}
              onClick={() => {
                if (rejected) unreject(job.id);
                else {
                  reject(job.id);
                  toast.info("Marked not for me", "Wonder will show fewer roles like this.", { label: "Undo", onClick: () => unreject(job.id) });
                }
              }}
            >
              {rejected ? "Undo not for me" : "Not for me"}
            </Button>
            <a href={job.applyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
              View original posting <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <p className="mt-2 text-[12px] text-ink-4">Wonder never submits an application without your approval.</p>
          </Card>
          {application && (
            <Card className="mt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Your application</p>
              <p className="mt-1 text-[14px] text-ink">
                <Badge tone={APPLICATION_STATUS_META[application.status].tone}>{APPLICATION_STATUS_META[application.status].label}</Badge>
              </p>
              {application.nextAction && <p className="mt-2 text-[13px] text-ink-2">Next: {application.nextAction}</p>}
              <Link href={`/app/applications/${application.id}`} className="mt-2 inline-block text-[13px] font-medium text-brand-600 hover:underline">
                Open timeline
              </Link>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
