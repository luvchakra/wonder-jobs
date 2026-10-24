"use client";
import { useEffect, useState } from "react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { briefKey, type CompanyBrief } from "@/domain/jobslake/companies";
import { getClientMode } from "@/lib/mode";

/** Briefs already asked for in this tab (null: JobsLake knows nothing), so paging and re-renders don't ask again. */
const cache = new Map<string, CompanyBrief | null>();

export const jobBriefKey = (job: Pick<CanonicalJob, "company" | "companyDomain">) => briefKey({ d: job.companyDomain, n: job.company });

/** Size and H-1B filings for the companies of the jobs on screen: one request for those not yet known. */
export function useCompanyBriefs(jobs: Pick<CanonicalJob, "company" | "companyDomain">[]): Map<string, CompanyBrief | null> {
  const [, setVersion] = useState(0);
  const missing = jobs.filter((j) => j.company && !cache.has(jobBriefKey(j)));
  const ask = [...new Map(missing.map((j) => [jobBriefKey(j), { n: j.company, ...(j.companyDomain ? { d: j.companyDomain } : {}) }])).values()].slice(0, 60);
  const askKey = ask.map(briefKey).join("|");
  useEffect(() => {
    if (!askKey || getClientMode().mode !== "user") return;
    let live = true;
    fetch("/api/company/briefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companies: ask }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { briefs?: Record<string, CompanyBrief> } | null) => {
        if (!res) return;
        for (const q of ask) cache.set(briefKey(q), res.briefs?.[briefKey(q)] ?? null);
        if (live) setVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // `ask` is derived from `askKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);
  return cache;
}
