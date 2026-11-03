"use client";
import { ShareButton } from "@/wonderworks/listing/ShareButton";
import { track } from "@/lib/analytics";
import { shareFacts, shareMessage, shareUrl, type ShareJob } from "@/domain/jobs/share";
import { storyPath } from "@/wonderworks/listing/share";

/** A job card's Share: WhatsApp, Instagram, Facebook, X, email, copy link, or the phone's own share sheet, with the job's share image — all to the job's public page. WonderWorks' ShareButton, with Jobs' message. */
export function ShareJobButton({ job, className }: { job: ShareJob; className?: string }) {
  return (
    <ShareButton
      label={`Share ${job.title} at ${job.company}`}
      title="Share this job"
      description={`${job.title} at ${job.company} · ${shareFacts(job)}`}
      className={className}
      onShared={(via) => track("job_shared", { via })}
      build={(origin) => {
        const url = shareUrl(origin, job.id);
        return { url, message: shareMessage(job, url, origin), image: storyPath(`/j/${encodeURIComponent(job.id)}`) };
      }}
    />
  );
}
