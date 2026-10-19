"use client";
import { useState } from "react";
import { Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";
import { emailHref, shareFacts, shareMessage, shareUrl, whatsappHref, type ShareJob } from "@/domain/jobs/share";

const OPTION = "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left text-[14px] font-medium text-ink hover:bg-bg-soft";

/** A job card's Share: WhatsApp, email, copy link, or the phone's own share sheet — all to the job's public page. */
export function ShareJobButton({ job }: { job: ShareJob }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        aria-label={`Share ${job.title} at ${job.company}`}
        className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-bg-soft hover:text-brand-600"
      >
        <Share2 className="size-[17px]" aria-hidden />
      </button>
      {/* Mounted only when open: the link and the device's share sheet exist only in the browser. */}
      {open && <ShareSheet job={job} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ job, onClose }: { job: ShareJob; onClose: () => void }) {
  const origin = window.location.origin;
  const url = shareUrl(origin, job.id);
  const message = shareMessage(job, url, origin);
  const native = typeof navigator.share === "function";
  const done = (via: string) => {
    track("job_shared", { via });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Share this job" description={`${job.title} at ${job.company} · ${shareFacts(job)}`} size="sm">
      <div className="-mx-1 flex flex-col">
        <a href={whatsappHref(message)} target="_blank" rel="noopener noreferrer" className={OPTION} onClick={() => done("whatsapp")}>
          <MessageCircle className="size-5 text-[#25d366]" aria-hidden /> WhatsApp
        </a>
        <a href={emailHref(message)} className={OPTION} onClick={() => done("email")}>
          <Mail className="size-5 text-brand-600" aria-hidden /> Email
        </a>
        <button
          type="button"
          className={OPTION}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.success("Link copied");
            } catch {
              toast.error("Couldn't copy the link", url);
            }
            done("copy");
          }}
        >
          <Link2 className="size-5 text-ink-3" aria-hidden /> Copy link
        </button>
        {native && (
          <button
            type="button"
            className={OPTION}
            onClick={() => {
              navigator.share({ title: message.subject, text: message.text, url }).catch(() => {});
              done("device");
            }}
          >
            <Share2 className="size-5 text-ink-3" aria-hidden /> More…
          </button>
        )}
      </div>
    </Modal>
  );
}
