"use client";
import { useState } from "react";
import { Bookmark, CheckCircle2, Clock, ExternalLink, Lock, MapPin, Wallet } from "lucide-react";
import { WORK_MODE_LABEL, type CanonicalJob } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { htmlToText, looksLikeHtml } from "@/services/jobs/normalize";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { Modal } from "@/components/common/Modal";
import { CompanyLogo } from "@/components/common/Avatar";

/** The posting as its source published it — what the public page needs, nothing from any account. */
export type SharedJob = Pick<CanonicalJob, "id" | "title" | "company" | "companyDomain" | "location" | "workMode" | "salaryMin" | "salaryMax" | "currency" | "jobType" | "jobTypeFrom" | "postedAt" | "description" | "requirements" | "niceToHave" | "skills" | "industry" | "applyUrl"> & { sources: string[] };

/**
 * A shared job (owner, 2026-10-20), laid out as it is once signed in (`app/app/jobs/[id]`): the same card,
 * description, Apply and Save, and folds. Anything that needs an account — Save, Apply with Wonder, how it
 * fits you — asks first to create one or sign in, and brings the person back to this job in the app.
 */
export function SharedJobView({ job, applyUrl }: { job: SharedJob; applyUrl: string | null }) {
  const [ask, setAsk] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  const type = jobTypeOf(job);
  const description = looksLikeHtml(job.description) ? htmlToText(job.description) : job.description;
  const longDescription = description.length > 280 || description.split("\n").length > 6;
  const hasRequirements = job.requirements.length > 0 || job.niceToHave.length > 0 || job.skills.length > 0;
  // After signing in or up the person lands on this job inside the app; a new account sets up its Career Profile first.
  const inApp = `/app/jobs/${encodeURIComponent(job.id)}`;
  const signIn = `/sign-in?next=${encodeURIComponent(inApp)}`;
  const signUp = `/sign-up?next=${encodeURIComponent(`/onboarding?next=${inApp}`)}`;
  const needAccount = (reason: string) => () => setAsk(reason);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-start justify-between gap-3 md:mb-6 md:items-end">
        <h1 className="min-w-0 flex-1 text-[22px] font-semibold leading-tight tracking-tight text-ink md:text-[30px]">{job.title}</h1>
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" aria-hidden />} onClick={needAccount("save this job")}>
          Save
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-5">
        <Card className="min-w-0 lg:col-start-1">
          <div className="flex items-start gap-3">
            <CompanyLogo name={job.company} domain={job.companyDomain} logo size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{job.company}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {job.location}
                </span>
                <span>{WORK_MODE_LABEL[job.workMode]}</span>
                {type && <span title={job.jobTypeFrom === "source" ? "As the source lists it" : "Read from the job title"}>{JOB_TYPE_LABEL[type]}</span>}
                {salary && (
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="size-3.5" aria-hidden /> {salary}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden /> {relativeTime(job.postedAt)}
                </span>
              </div>
            </div>
          </div>
          <h2 className="mt-4 text-[15px] font-semibold text-ink">Job description</h2>
          <p className={cn("mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2", !expanded && "line-clamp-6")}>{description}</p>
          {longDescription && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="mt-1 inline-flex min-h-10 items-center text-[13px] font-medium text-brand-600 hover:underline">
              {expanded ? "Less" : "More"}
            </button>
          )}
        </Card>

        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Card className="flex flex-col gap-2">
            <Button size="lg" full onClick={needAccount("apply with Wonder")}>
              Apply with Wonder
            </Button>
            {applyUrl && (
              <a href={applyUrl} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
                View original posting <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-3 lg:col-start-1">
          <Fold title="Why it fits" hint="Compared with your Career Profile">
            <p className="text-[14px] text-ink-2">Wonder compares every role with your own Career Profile and says why it fits, or doesn&apos;t.</p>
            <Button variant="secondary" size="sm" className="mt-3" icon={<Lock className="size-4" aria-hidden />} onClick={needAccount("see how this job fits you")}>
              See how it fits me
            </Button>
          </Fold>

          {hasRequirements && (
            <Fold title="Requirements and skills">
              {job.requirements.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {job.requirements.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-[14px] text-ink-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> {r}
                    </li>
                  ))}
                </ul>
              )}
              {job.niceToHave.length > 0 && (
                <>
                  <h3 className="mt-5 text-[13px] font-semibold text-ink-2">Nice to have</h3>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {job.niceToHave.map((n) => (
                      <li key={n}>
                        <Badge>{n}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {job.skills.length > 0 && (
                <>
                  <h3 className="mt-5 text-[13px] font-semibold text-ink-2">Skills</h3>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {job.skills.map((s) => (
                      <li key={s}>
                        <Badge tone="brand">{s}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Fold>
          )}

          <Fold title="Company">
            <div className="flex items-center gap-3">
              <CompanyLogo name={job.company} domain={job.companyDomain} logo size={44} />
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{job.company}</h2>
                {job.industry && <p className="text-[13px] text-ink-3">{job.industry}</p>}
              </div>
            </div>
            {job.companyDomain && <p className="mt-3 text-[13px] text-ink-3">Website: <span className="font-medium text-ink">{job.companyDomain}</span></p>}
          </Fold>

          {job.sources.length > 0 && <Fold title="Sources" hint={`Via ${job.sources.join(", ")}`}><p className="text-[13px] text-ink-3">Found on {job.sources.join(", ")}. Posted {relativeTime(job.postedAt)}.</p></Fold>}
        </div>
      </div>

      <Modal
        open={ask !== null}
        onClose={() => setAsk(null)}
        title="Create an account to continue"
        description={`It's free, and takes a minute. You need an account to ${ask ?? "do this"}.`}
        size="sm"
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button full href={signUp}>
              Create account
            </Button>
            <Button full variant="outline" href={signIn}>
              I already have an account — sign in
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-3">After that you&apos;ll be back on this job, ready to {ask ?? "go on"}.</p>
      </Modal>
    </div>
  );
}
