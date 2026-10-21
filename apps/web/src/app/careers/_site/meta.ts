import { formatSalaryRange } from "@/lib/format";
import type { CareerJob } from "@/server/careerSite/client";
import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from "../[slug]/labels";

/** "Bengaluru · Hybrid · Full-time · ₹20L–30L": what a job line says under its title. */
export const jobFacts = (j: CareerJob) => [j.location, WORK_MODE_LABEL[j.workMode], j.jobType ? JOB_TYPE_LABEL[j.jobType] : undefined, formatSalaryRange(j.salaryMin, j.salaryMax, j.currency)].filter(Boolean).join(" · ");

/** schema.org JobPosting for a job page, safe to put in a script tag. */
export function jobPostingJsonLd(j: CareerJob): string {
  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description,
    datePosted: j.updatedAt,
    hiringOrganization: { "@type": "Organization", name: j.company },
    jobLocation: { "@type": "Place", address: j.location },
    ...(j.workMode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {}),
    ...(j.jobType ? { employmentType: j.jobType.toUpperCase() } : {}),
    ...(j.salaryMin != null || j.salaryMax != null ? { baseSalary: { "@type": "MonetaryAmount", currency: j.currency, value: { "@type": "QuantitativeValue", ...(j.salaryMin != null ? { minValue: j.salaryMin } : {}), ...(j.salaryMax != null ? { maxValue: j.salaryMax } : {}), unitText: "YEAR" } } } : {}),
  };
  return JSON.stringify(posting).replace(/</g, "\\u003c");
}
