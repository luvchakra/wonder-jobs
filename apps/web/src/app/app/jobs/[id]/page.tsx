"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, CheckCircle2, ExternalLink, MapPin, Clock, Wallet } from "lucide-react";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import { WORK_MODE_LABEL, readableJobId } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { formatSalaryRange, relativeTime, formatDate } from "@/lib/format";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/wonderstar/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Fold } from "@/components/common/Fold";
import { EmptyState } from "@/components/common/States";
import { CompanyLogo } from "@/components/common/Avatar";
import { MatchBadge } from "@/modules/jobs/components/MatchBadge";
import { JobQualityBadge } from "@/modules/jobs/components/JobQualityBadge";
import { ShareJobButton } from "@/modules/jobs/components/ShareJobButton";
import { NotForMeButton } from "@/modules/jobs/components/NotForMeButton";
import { CustomResumeButton } from "@/modules/jobs/components/CustomResumeButton";
import { EasyApply } from "@/modules/jobs/components/EasyApply";
import { JobDecision } from "@/modules/jobs/components/JobDecision";
import { JobSourcesCard } from "@/modules/jobs/components/JobSourcesCard";
import { CompanyFold } from "@/modules/jobs/components/CompanyFold";
import { HiddenJobNotice } from "@/modules/jobs/components/HiddenJobNotice";
import { jobBriefKey, useCompanyBriefs } from "@/modules/jobs/components/useCompanyBriefs";
import { checkOneJobLink } from "@/lib/useLinkCheck";
import { useAuthStore } from "@/store/auth";
import { describeDecision } from "@/domain/jobs/decision";
import { planThatAllows } from "@/domain/billing/plans";
import { usePlan } from "@/lib/usePlan";
import { PlanGate } from "@/components/billing/PlanGate";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/motion";
import { useExtensionInstalled } from "@/lib/useExtensionInstalled";
import { htmlToText, looksLikeHtml } from "@/services/jobs/normalize";
import { useRecoverJobs } from "@/modules/jobs/components/useRecoverJobs";
import { RatingStars } from "@/modules/jobs/components/RatingStars";
import { DescriptionLanguage } from "@/modules/jobs/components/DescriptionLanguage";
import { useJobTranslation } from "@/lib/useJobTranslation";
import { TRANSLATE_LANGUAGES } from "@/domain/jobs/translate";
import { ApplicationOutcome, noteApplyOpened, useAsksOutcome } from "@/modules/jobs/components/ApplicationOutcome";

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJobsStore((s) => s.jobs[id]);
  useRecoverJobs([id]);
  // The company's size and H-1B filings, from JobsLake, for the line under its name.
  const briefs = useCompanyBriefs(job ? [job] : []);
  const brief = job ? briefs.get(jobBriefKey(job)) : undefined;
  const match = useJobsStore((s) => s.matches[id]);
  // A job opened from outside Find's list (Saved, Pipeline, a link) is compared with the profile here.
  const hasJobToScore = useJobsStore((s) => !!s.jobs[id] && !s.matches[id]);
  useEffect(() => {
    if (hasJobToScore) useJobsStore.getState().scoreOne(id);
  }, [hasJobToScore, id]);
  const quality = useJobsStore((s) => s.quality[id]);
  const saved = useJobsStore((s) => !!s.saved[id]);
  const origin = useJobsStore((s) => s.origins[id]);
  const rejected = useJobsStore((s) => !!s.rejected[id]);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const application = useApplicationsStore((s) => Object.values(s.applications).find((a) => a.jobId === id));
  const hasSavedResume = useCareerStore((s) => s.savedResumes.length > 0);
  const hasUploadedResume = useResumeFilesStore((s) => s.files.length > 0);
  const loadResumeFiles = useResumeFilesStore((s) => s.load);
  useEffect(() => {
    void loadResumeFiles();
  }, [loadResumeFiles]);
  // Apply with Wonder needs a résumé to put in the form: this job's tailored one, a template résumé, or the candidate's own file.
  const { limits, plans } = usePlan();
  const canApply = limits.applyWithWonder && (!!application?.artifacts.some((a) => a.type === "resume" && a.versions.length) || hasSavedResume || hasUploadedResume);
  const asksOutcome = useAsksOutcome(id);
  // The posting's id at its source: the canonical sighting's, else the first one that has a readable id.
  const sourceJobRef = useMemo(() => {
    const sights = job?.lake?.sightings ?? [];
    const pick = [...sights].sort((a, b) => Number(b.canonical) - Number(a.canonical)).find((x) => readableJobId(x.sourceJobId));
    return pick ? { id: readableJobId(pick.sourceJobId)!, source: pick.sourceName } : null;
  }, [job?.lake?.sightings]);
  // Easy Apply is a desktop browser's (owner, 2026-10-22): it needs the WonderJobs extension. Phones and tablets
  // get Apply, which opens the employer's listing.
  const desktop = useMediaQuery("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  // Posted on WonderJobs by the employer: Easy Apply, on every device, sends the application to them inside WonderJobs.
  const wonderJob = !!job?.sourceIds.includes("employers");
  const helperInstalled = useExtensionInstalled(1500);
  // `?tab=why` deep-links straight to "Why it fits" (Ask Wonder's "explain this job").
  const requestedTab = useSearchParams().get("tab");
  // A link to one of its sections (`?tab=why`, Ask Wonder) opens the whole description, where the sections are.
  const [expanded, setExpanded] = useState(!!requestedTab);
  // Is the original posting still open? Checked when the page opens (signed in); a closed one says so here.
  const closed = useJobsStore((s) => s.closed[id]);
  const mode = useAuthStore((s) => s.mode);
  const hasJob = !!job;
  // A posting saved before its HTML was cleaned (Arbeitnow escapes its markup) still reads as plain text.
  const description = !job ? "" : looksLikeHtml(job.description) ? htmlToText(job.description) : job.description;
  // The posting's own words (title, description, requirements, nice-to-haves) in another language, on the candidate's pick
  // (`translate_job`); the original is never changed. Skills, places, the company and WonderJobs' own labels stay as they are.
  const translation = useJobTranslation({ id, title: job?.title ?? "", description, requirements: job?.requirements ?? [], niceToHave: job?.niceToHave ?? [] });
  useEffect(() => {
    if (mode === "user" && hasJob) void checkOneJobLink(id);
  }, [mode, hasJob, id]);
  useEffect(() => {
    if (!job) return;
    track("job_viewed", { jobId: job.id, fit: match?.fit });
    track("opportunity_viewed", { jobId: job.id, fit: match?.fit });
  }, [job, match?.fit]);

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/jobs", label: "Jobs" }} title="Job not found" />
        <EmptyState title="This job isn't in your catalog" body="It may have been removed in a newer run." action={{ label: "Back to jobs", href: "/app/jobs" }} />
      </div>
    );
  }
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  // JobsLake's sightings when present (they include sources WonderJobs has no entry for); otherwise the known sources.
  const sources = job.lake ? [...new Map(job.lake.sightings.map((s) => [s.sourceId, { id: s.sourceId, name: s.sourceName }])).values()] : job.sourceIds.map((sid) => JOB_SOURCES.find((s) => s.id === sid) ?? { id: sid, name: sid });

  const decision = describeDecision(job, match, quality, application);
  const tx = translation.state?.status === "done" ? translation.state.texts : null;
  const txLang = translation.state?.status === "done" ? translation.state.language : undefined;
  const txDir = txLang === "ar" ? "rtl" : undefined;
  const requirements = tx?.requirements ?? job.requirements;
  const niceToHave = tx?.niceToHave ?? job.niceToHave;
  const longDescription = description.length > 280 || description.split("\n").length > 6;
  const hasRequirements = job.requirements.length > 0 || job.niceToHave.length > 0 || job.skills.length > 0;
  // Description and Apply first, so both are on screen when the page opens; everything else is folded below them.
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ href: "/app/jobs", label: "Jobs" }}
        title={tx?.title ?? job.title}
        actions={
          <div className="flex items-center gap-2">
            <ShareJobButton job={job} className="size-10 border border-line bg-surface text-ink-2" />
            <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => (saved ? unsave(job.id) : save(job.id))}>
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        }
      />
      {closed && (
        <div role="alert" className="mb-4 rounded-[14px] border border-warning-600/30 bg-warning-100/50 px-4 py-3 text-[14px] text-ink-2">
          <p className="font-semibold text-ink">This posting has closed</p>
          <p className="mt-0.5 text-[13px]">
            {closed.reason}. Wonder took it off your jobs
            {saved ? " — it stays in Saved so you can see it" : ""}.
          </p>
        </div>
      )}
      <HiddenJobNotice job={job} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-5">
        <Card className="min-w-0 lg:col-start-1">
          <div className="flex items-start gap-3">
            <CompanyLogo name={job.company} domain={job.companyDomain} logo size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">
                {job.company}
                {brief?.size && <span className="font-normal text-ink-3">{` · ${brief.size}`}</span>}
                {brief?.rating ? (
                  <span className="font-normal text-ink-3">
                    {" · "}
                    {/* The job page has room for the long form: five stars and the number. */}
                    <RatingStars value={brief.rating.value} size={13} inline className="align-[-1px]" title={`${brief.rating.value.toFixed(1)} out of 5${brief.rating.reviews ? ` from ${brief.rating.reviews.toLocaleString("en-US")} reviews` : ""} — ${brief.rating.source}`} />
                  </span>
                ) : null}
                {brief?.h1b ? (
                  <span className="font-normal text-ink-3" title="Certified H-1B applications in the US Department of Labor's latest disclosure file">
                    {` · H-1B ${brief.h1b.toLocaleString("en-US")}`}
                  </span>
                ) : null}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {job.location}
                </span>
                <span>{WORK_MODE_LABEL[job.workMode]}</span>
                {jobTypeOf(job) && <span title={job.jobTypeFrom === "source" ? "As the source lists it" : "Read from the job title"}>{JOB_TYPE_LABEL[jobTypeOf(job)!]}</span>}
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
          {(match || application || rejected) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {match && <MatchBadge match={match} showLabel />}
              {application && (
                <Link href={`/app/applications/${application.id}`} aria-label={`Application: ${APPLICATION_STATUS_META[application.status].label}`}>
                  <Badge tone={APPLICATION_STATUS_META[application.status].tone}>{APPLICATION_STATUS_META[application.status].label}</Badge>
                </Link>
              )}
              {rejected && <Badge tone="neutral">Marked not for me</Badge>}
            </div>
          )}
          {/* Why it fits first, above the description. */}
          <Fold className="mt-4" title="Why it fits" hint={match ? undefined : "Not compared with your profile yet"} open={requestedTab === "why"}>
            {(decision.why.length > 0 || decision.consider.length > 0) && <JobDecision decision={decision} variant="detail" className="mb-4" />}
            {match ? (
              <ul className="flex flex-col gap-3">
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
              <p className="text-sm text-ink-3">Wonder hasn&apos;t compared this role with your Career Profile yet — find opportunities to see how it fits.</p>
            )}
          </Fold>
          <div className="mt-4 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Job description</h2>
            {translation.allowed && <DescriptionLanguage value={translation.state?.language ?? null} busy={translation.state?.status === "loading"} onChange={(v) => void translation.pick(v)} />}
          </div>
          {translation.state && (
            <p role="status" className={cn("mt-2 flex flex-wrap items-center gap-x-2 text-[12.5px]", translation.state.status === "error" ? "text-danger-600" : "text-ink-3")}>
              {translation.state.status === "loading" && <>Translating to {TRANSLATE_LANGUAGES.find((l) => l.id === translation.state!.language)!.name}…</>}
              {translation.state.status === "done" && (
                <>
                  <span>AI-translated to {TRANSLATE_LANGUAGES.find((l) => l.id === translation.state!.language)!.name}{translation.state.clipped ? " · the first part of a long posting" : ""}</span>
                </>
              )}
              {translation.state.status === "error" && <span>{translation.state.message}</span>}
              {translation.state.status === "error" && (
                <button type="button" onClick={() => void translation.pick(translation.state!.language)} className="font-medium text-brand-600 hover:underline">
                  Try again
                </button>
              )}
              {translation.state.status !== "loading" && (
                <button type="button" onClick={() => void translation.pick(null)} className="font-medium text-brand-600 hover:underline">
                  Show original
                </button>
              )}
            </p>
          )}
          <p
            lang={txLang}
            dir={txDir}
            className={cn("mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2", !expanded && "line-clamp-6", translation.state?.status === "loading" && "opacity-60")}
          >
            {tx?.description ?? description}
          </p>
          {longDescription && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="mt-1 inline-flex min-h-10 items-center text-[13px] font-medium text-brand-600 hover:underline">
              {expanded ? "Less" : "More"}
            </button>
          )}
          {/* With the whole description open: requirements, the company and the sources, then the full
              description's link and Not for me on one row. */}
          {(expanded || !longDescription) && (
            <>
              <div className="mt-3 flex min-w-0 flex-col gap-3">
                {hasRequirements && (
                  <Fold title="Requirements and skills">
                    {requirements.length > 0 && (
                      <ul lang={txLang} dir={txDir} className="flex flex-col gap-2">
                        {requirements.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-[14px] text-ink-2">
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> {r}
                          </li>
                        ))}
                      </ul>
                    )}
                    {niceToHave.length > 0 && (
                      <>
                        <h3 className="mt-5 text-[13px] font-semibold text-ink-2">Nice to have</h3>
                        <ul lang={txLang} dir={txDir} className="mt-1 flex flex-wrap gap-1.5">
                          {niceToHave.map((n, i) => (
                            <li key={i}>
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

                <CompanyFold job={job} open={requestedTab === "company"} />

                <Fold title="Sources & hiring signals" hint={`${origin ? `On ${origin}, via ` : "Via "}${sources.map((s) => s.name).join(", ")}`} open={requestedTab === "sources"}>
                  {job.foundAs && <p className="mb-3 text-[13px] text-ink-3">Found by your &ldquo;{job.foundAs.title}&rdquo; search.</p>}
                  {job.lake && (
                    <div className="mb-4">
                      <JobSourcesCard lake={job.lake} />
                    </div>
                  )}
                  {quality ? (
                    <>
                      <JobQualityBadge quality={quality} />
                      <p className="mt-2 text-[14px] text-ink-2">{quality.summary}</p>
                      <ul className="mt-4 divide-y divide-line rounded-[14px] border border-line">
                        {quality.signals.map((s) => (
                          <li key={s.key} className="flex items-center justify-between gap-3 p-3 text-[13px]">
                            <span className="text-ink-2">{s.label}</span>
                            <span className={cn("font-medium", s.sentiment === "positive" ? "text-success-600" : s.sentiment === "caution" ? "text-warning-600" : "text-ink")}>{s.value}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[12px] text-ink-4">Observations, not claims about the employer&apos;s intent. Last observed {formatDate(job.observedAt)}.</p>
                    </>
                  ) : (
                    <p className="text-[13px] text-ink-3">No hiring signals collected yet.</p>
                  )}
                </Fold>
              </div>
              {/* Some sources (Adzuna) share only the start of a description, and saved jobs keep the first part: say so. */}
              {/(…|\.\.\.)\s*$/.test(description) && <p className="mt-3 text-[13px] text-ink-3">This is the part the source shares.</p>}
              {/* The source's own id for this posting (from the sighting JobsLake used), to quote to the employer or find it again there. */}
              {sourceJobRef && (
                <p className="mt-2 text-[12.5px] text-ink-3">
                  Job ID <span className="select-all font-medium text-ink-2">{sourceJobRef.id}</span> on {sourceJobRef.source}
                </p>
              )}
              {/* The posting on its own site, always one tap away — on the same line as Not for me. */}
              <div className="mt-1 flex items-center justify-between gap-2">
                {job.applyUrl ? (
                  <a href={job.applyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
                    Read the full description <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span />
                )}
                <NotForMeButton jobId={job.id} rejected={rejected} size="sm" full={false} />
              </div>
            </>
          )}
        </Card>

        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Card className="flex flex-col gap-2">
            {wonderJob ? (
              <>
                <EasyApply job={job} />
                <CustomResumeButton job={job} />
              </>
            ) : desktop ? (
              // Desktop: Easy Apply fills the employer's form with the browser extension; without it, the listing itself.
              <>
                {canApply ? (
                  <Button size="lg" full href={`/app/jobs/${job.id}/apply`}>
                    Easy Apply
                  </Button>
                ) : null}
                <CustomResumeButton job={job} primary={!canApply} />
                {canApply && helperInstalled === false ? (
                  <p className="text-center text-[12px] leading-snug text-ink-3">
                    Easy Apply needs the WonderWorks browser extension.{" "}
                    <Link href="/extension" className="font-medium text-brand-600 hover:underline">
                      Install it
                    </Link>
                    , or{" "}
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        noteApplyOpened(job.id);
                        track("apply_listing_opened", {
                          jobId: job.id,
                          from: "no_extension",
                        });
                      }}
                      className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline"
                    >
                      go to the job listing <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </p>
                ) : !canApply ? (
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      noteApplyOpened(job.id);
                      track("apply_listing_opened", {
                        jobId: job.id,
                        from: "desktop",
                      });
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-1 text-[13px] font-medium text-brand-600 hover:underline"
                  >
                    Go to the job listing <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                {!limits.applyWithWonder && <PlanGate reason="Easy Apply fills the employer's form for you." needs={planThatAllows({ plans, priceRefs: { pro: {}, max: {} } }, (l) => l.applyWithWonder)} plans={plans} />}
              </>
            ) : (
              // Phones and tablets: Apply opens the employer's own page, to fill in there.
              <>
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    noteApplyOpened(job.id);
                    track("apply_listing_opened", {
                      jobId: job.id,
                      from: "mobile",
                    });
                  }}
                  className="wj-gradient-bg wj-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] px-5 text-[15px] font-medium text-white shadow-brand hover:brightness-105"
                >
                  Apply <ExternalLink className="size-4" aria-hidden />
                </a>
                <CustomResumeButton job={job} />
              </>
            )}
            {/* After Apply on the employer's site (or a résumé made for it): how did it go? */}
            {asksOutcome && <ApplicationOutcome job={job} />}
          </Card>
        </aside>
      </div>
    </div>
  );
}
