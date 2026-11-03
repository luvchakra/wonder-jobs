"use client";
import { ShareButton } from "@/wonderworks/listing/ShareButton";
import { track } from "@/lib/analytics";
import { shareFacts, shareMessage, type ShareJob } from "@/domain/jobs/share";

/**
 * Share on a careers job page: WonderWorks' share sheet (WhatsApp, Instagram, Facebook, X, email, copy link, the phone's
 * own sheet) with Jobs' crisp message, linking to this careers page itself. These are WonderWorks' own positions, not
 * WorksLake listings, so there's no /j/ page: no share image and no summary, only the posting's own facts.
 */
export function ShareJobLink({ job }: { job: ShareJob }) {
  return (
    <ShareButton
      label={`Share ${job.title} at ${job.company}`}
      title="Share this job"
      description={`${job.title} at ${job.company} · ${shareFacts(job)}`}
      className="size-10 border border-line bg-surface text-ink-2"
      onShared={(via) => track("job_shared", { via })}
      build={(origin) => {
        const url = window.location.href.split("#")[0];
        return { url, message: shareMessage(job, url, origin, null) };
      }}
    />
  );
}
