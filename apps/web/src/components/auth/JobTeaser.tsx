import { Building2, Clock, Lock, MapPin, Wallet } from "lucide-react";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { WORK_MODE_LABEL, companyColor } from "@/components/jobs/JobCard";

/** Real, non-fabricated fields shown to an anonymous visitor from a shared job link. */
export interface PublicJobTeaser {
  title: string;
  company: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  salary: string | null;
  postedLabel: string;
  sourceName: string;
  descriptionPreview: string;
}

const SKELETON_SECTIONS = [
  { heading: "Why it's a match", lines: 3 },
  { heading: "Key requirements", lines: 4 },
  { heading: "Company", lines: 2 },
];

/** Shown above the sign-in form for a shared job link: the real listing basics, then the rest of the page blurred behind a sign-in prompt. */
export function JobTeaser({ job }: { job: PublicJobTeaser }) {
  return (
    <div className="mt-8 w-full rounded-[20px] border border-white/15 bg-white/[0.06] p-5 backdrop-blur md:mt-10">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Shared job</p>
      <div className="mt-2 flex items-start gap-3">
        <CompanyLogo name={job.company} color={companyColor(job.company)} size={44} />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug text-white">{job.title}</h2>
          <p className="text-[13px] text-white/70">{job.company}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/70">
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
      <p className="mt-3 text-[13px] leading-relaxed text-white/80">{job.descriptionPreview}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/50">
        <Building2 className="size-3 shrink-0" aria-hidden /> From {job.sourceName}
      </p>

      <div className="relative mt-5 overflow-hidden rounded-[14px]" aria-hidden>
        <div className="pointer-events-none flex flex-col gap-4 p-4 blur-[3px]">
          {SKELETON_SECTIONS.map((s) => (
            <div key={s.heading}>
              <Badge tone="neutral" className="text-white">
                {s.heading}
              </Badge>
              <div className="mt-2 flex flex-col gap-1.5">
                {Array.from({ length: s.lines }).map((_, i) => (
                  <div key={i} className="h-2.5 rounded-full bg-white/25" style={{ width: `${92 - i * 14}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent to-ink/70">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-lg">
            <Lock className="size-3.5" aria-hidden /> Sign in to see the full listing
          </div>
        </div>
      </div>
    </div>
  );
}
