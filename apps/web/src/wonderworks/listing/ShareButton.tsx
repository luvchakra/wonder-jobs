"use client";
import { useState } from "react";
import { Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { absoluteUrl, emailHref, listingShareMessage, whatsappHref, type ListingShareInput, type ShareMessage } from "./share";

const OPTION = "flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left text-[14px] font-medium text-ink hover:bg-bg-soft";

/** What a Share button sends, worked out when the sheet opens (the link needs the browser's own address). */
export interface ShareBuild {
  url: string;
  message: ShareMessage;
}

/**
 * Share, for every module and every place a listing shows (taken from Jobs' ShareJobButton): an icon button that opens
 * WhatsApp, email, copy link, or the phone's own share sheet. The sheet is mounted only when open — the link and the
 * device's share sheet exist only in the browser.
 */
export function ShareButton({ label, title, description, build, onShared, className }: { label: string; title: string; description?: string; build: (origin: string) => ShareBuild; onShared?: (via: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        aria-label={label}
        className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-bg-soft hover:text-brand-600", className)}
      >
        <Share2 className="size-[17px]" aria-hidden />
      </button>
      {open && <ShareSheet title={title} description={description} build={build} onShared={onShared} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ title, description, build, onShared, onClose }: { title: string; description?: string; build: (origin: string) => ShareBuild; onShared?: (via: string) => void; onClose: () => void }) {
  const { url, message } = build(window.location.origin);
  const native = typeof navigator.share === "function";
  const done = (via: string) => {
    onShared?.(via);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={title} description={description} size="sm">
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

/** A module's props for sharing one of its listings. */
export interface ListingShareProps extends ListingShareInput {
  module: string;
  className?: string;
  /** For the public page only: where the listing came from, and its original posting when it came from outside. */
  source?: string;
  originalUrl?: string;
}

/**
 * The Share button on a module's listing card and listing page: `ListingShareInput` says what is shared, and the
 * message is made here, the same in every module.
 */
export function ListingShare({ module, className, noun, title, facts, lines, details, url }: ListingShareProps) {
  const input = { noun, title, facts, lines, details, url };
  return (
    <ShareButton
      label={`Share ${input.title}`}
      title={`Share this ${input.noun}`}
      description={[input.title, ...(input.facts ?? []).filter(Boolean)].join(" · ")}
      className={className}
      onShared={(via) => track("listing_shared", { module, via })}
      build={(origin) => {
        const url = absoluteUrl(origin, input.url);
        return { url, message: listingShareMessage(input, url) };
      }}
    />
  );
}
