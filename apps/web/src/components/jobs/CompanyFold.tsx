"use client";
import { useEffect, useState } from "react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { companyLines, type CompanyProfile } from "@/domain/jobslake/companies";
import { getClientMode } from "@/lib/mode";
import { Fold } from "@/components/common/Fold";
import { CompanyLogo } from "@/components/common/Avatar";
import { companyColor } from "./JobCard";
import { RatingStars } from "./RatingStars";

/**
 * A job's Company section: what JobsLake knows about the employer (size, industry, HQ, founding, listing and
 * revenue as TheirStack or Wikidata report them, its open roles, H-1B filings from the Department of Labor), each
 * with its source. Shows only what was found.
 */
export function CompanyFold({ job, open }: { job: Pick<CanonicalJob, "company" | "companyDomain" | "industry">; open?: boolean }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  useEffect(() => {
    if (getClientMode().mode !== "user") return;
    let live = true;
    const q = `n=${encodeURIComponent(job.company)}${job.companyDomain ? `&d=${encodeURIComponent(job.companyDomain)}` : ""}`;
    fetch(`/api/company?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => live && setProfile(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [job.company, job.companyDomain]);
  const lines = profile ? companyLines(profile) : [];
  const hint = lines.filter((l) => l.label === "Size" || l.label === "H-1B visas").map((l) => (l.label === "H-1B visas" ? "H-1B sponsor" : l.value)).join(" · ");
  return (
    <Fold title="Company" hint={hint || undefined} open={open}>
      <div className="flex items-center gap-3">
        <CompanyLogo name={job.company} domain={job.companyDomain} logo color={companyColor(job.company)} size={44} />
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink">{job.company}</h2>
          {job.companyDomain && <p className="text-[13px] text-ink-3">{job.companyDomain}</p>}
        </div>
      </div>
      {lines.length ? (
        <dl className="mt-3 divide-y divide-line text-[13px]">
          {lines.map((l) => (
            <div key={l.label} className="flex gap-3 py-2">
              <dt className="w-24 shrink-0 text-ink-3">{l.label}</dt>
              <dd className="min-w-0 flex-1 text-ink">
                {l.stars !== undefined ? <RatingStars value={l.stars} size={14} inline title={`${l.value} — ${l.source}`} /> : null}
                {l.stars !== undefined ? <span className="ml-1.5 text-ink-3">{l.value.replace(/^[\d.]+ out of 5/, "out of 5")}</span> : l.value}
                {l.details?.map((d) => (
                  <span key={d} className="block text-[12px] text-ink-3">
                    {d}
                  </span>
                ))}
                {l.href ? (
                  <a href={l.href} target="_blank" rel="noreferrer" className="block text-[11.5px] text-ink-4 hover:underline">
                    {l.source}
                  </a>
                ) : (
                  <span className="block text-[11.5px] text-ink-4">{l.source}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">{job.industry ? `${job.industry}. ` : ""}No company facts from our sources yet.</p>
      )}
    </Fold>
  );
}
