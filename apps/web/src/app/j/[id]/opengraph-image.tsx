import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { formatSalaryRange } from "@/lib/format";
import { sharedJob } from "./data";

export const runtime = "nodejs";
export const alt = "A job shared from WonderJobs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The big card WhatsApp (and Slack, iMessage, X) shows for a shared job: the role, the company, the facts
 * the posting gives, and the WonderJobs mark. Flat colours keep it far under WhatsApp's image-size limit.
 */
export default async function SharedJobImage({ params }: { params: Promise<{ id: string }> }) {
  const job = await sharedJob((await params).id);
  const salary = job ? formatSalaryRange(job.salaryMin, job.salaryMax, job.currency) : null;
  const type = job ? jobTypeOf(job) : undefined;
  const chips = job ? [job.location, WORK_MODE_LABEL[job.workMode], type ? JOB_TYPE_LABEL[type] : null].filter((x): x is string => !!x) : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(140deg, #1b1740 0%, #14142b 55%, #241c4d 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
            <img src={brandMarkDataUri()} alt="" width={64} height={64} />
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>WonderJobs</span>
          </div>
          <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(167,139,250,0.18)", color: "#c4b5fd", fontSize: 26, fontWeight: 600 }}>{job ? "Job opening" : "Find your next job"}</span>
        </div>
        {job ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 36, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{clip(job.company, 48)}</span>
            <span style={{ marginTop: 10, fontSize: job.title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{clip(job.title, 70)}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 30 }}>
              {chips.map((c) => (
                <span key={c} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.1)", fontSize: 28 }}>
                  {clip(c, 40)}
                </span>
              ))}
              {salary && <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#6d4cf5", fontSize: 28, fontWeight: 700 }}>{salary}</span>}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>Your next opportunity is out there.</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>
          <span style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#a78bfa" }} />
          Found with WonderJobs, the AI job-search agent
        </div>
      </div>
    ),
    { ...size },
  );
}
