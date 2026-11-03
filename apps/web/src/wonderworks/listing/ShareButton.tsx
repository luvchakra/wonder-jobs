"use client";
import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Mail, Share2, Sparkles } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { absoluteUrl, emailHref, facebookHref, listingShareMessage, STORY_VERSION, storyPath, whatsappHref, xHref, type ListingShareInput, type ShareMessage, type ShareSummary } from "./share";

/** What a Share button sends, worked out when the sheet opens (the link needs the browser's own address). */
export interface ShareBuild {
  url: string;
  message: ShareMessage;
  /** The listing's portrait share image (`…/story`), for Status and Stories; none where the listing has no public page. */
  image?: string;
  /** The listing's public page (`/j/<id>`, `/s/<module>/<id>`), which the sheet asks for a summary of before sharing. */
  page?: string;
}

/** What a Share button sends, given the summary (null when there is none or it couldn't be had). */
export type ShareBuilder = (origin: string, summary: ShareSummary | null) => ShareBuild;

/** The listing's share summary from the server, or null after 7 s or on any failure (the message then uses the listing's own words). */
function useSummary(page: string | undefined): { summary: ShareSummary | null; loading: boolean } {
  const [got, setGot] = useState<{ page?: string; summary: ShareSummary | null } | null>(null);
  useEffect(() => {
    if (!page) return;
    let live = true;
    fetch(`/api/share/summary?page=${encodeURIComponent(page)}&v=${STORY_VERSION}`, { signal: AbortSignal.timeout(7000) })
      .then((r) => (r.ok ? (r.json() as Promise<ShareSummary>) : null))
      .then((s) => live && setGot({ page, summary: s && typeof s.hook === "string" && Array.isArray(s.highlights) ? s : null }))
      .catch(() => live && setGot({ page, summary: null }));
    return () => {
      live = false;
    };
  }, [page]);
  if (!page) return { summary: null, loading: false };
  if (!got || got.page !== page) return { summary: null, loading: true };
  return { summary: got.summary, loading: false };
}

/**
 * Share, for every module and every place a listing shows (taken from Jobs' ShareJobButton): an icon button that opens
 * the share sheet. The sheet is mounted only when open — the link and the device's share sheet exist only in the browser.
 */
export function ShareButton({ label, title, description, build, onShared, className }: { label: string; title: string; description?: string; build: ShareBuilder; onShared?: (via: string) => void; className?: string }) {
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

const TILE = "flex flex-col items-center gap-1.5 rounded-[14px] px-1 py-2 text-[12px] font-medium text-ink hover:bg-bg-soft";
const DISC = "flex size-12 items-center justify-center rounded-full text-white";

const XLogo = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);
const InstagramLogo = () => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const WhatsAppLogo = () => (
  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.43 9.43 0 0 1-1.45-5.03c0-5.21 4.24-9.45 9.46-9.45 2.52 0 4.9.99 6.68 2.77a9.4 9.4 0 0 1 2.77 6.69c0 5.21-4.25 9.44-9.47 9.44zm8.05-17.5A11.32 11.32 0 0 0 12.05.67C5.78.67.67 5.78.67 12.05c0 2 .52 3.96 1.52 5.69L.57 23.67l6.06-1.59a11.36 11.36 0 0 0 5.42 1.38h.01c6.27 0 11.38-5.1 11.38-11.38 0-3.04-1.18-5.9-3.34-8.05z" />
  </svg>
);

/** The share image as a file the phone's share sheet can send, fetched when the sheet opens so a press shares at once. */
function useImageFile(src: string | undefined): { file: File | null; state: "loading" | "ready" | "none" } {
  const [got, setGot] = useState<{ src?: string; file: File | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => live && setGot({ src, file: b ? new File([b], "wonderworks-share.png", { type: "image/png" }) : null }))
      .catch(() => live && setGot({ src, file: null }));
    return () => {
      live = false;
    };
  }, [src]);
  if (!src) return { file: null, state: "none" };
  if (!got || got.src !== src) return { file: null, state: "loading" };
  return { file: got.file, state: got.file ? "ready" : "none" };
}

function canShareFile(file: File | null): file is File {
  try {
    return !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function saveFile(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * The share sheet: the share image large (a phone-screen card: Status and Stories show it edge to edge), then one row
 * per network in its own format — WhatsApp and Instagram get the image (with the message or a copied caption), Facebook
 * and X the link (their preview card is the listing's image), then email, copy link and the phone's own sheet.
 */
function ShareSheet({ title, description, build, onShared, onClose }: { title: string; description?: string; build: ShareBuilder; onShared?: (via: string) => void; onClose: () => void }) {
  const [{ page, image }] = useState(() => build(window.location.origin, null));
  // The message is summarised before anything is shared: the buttons wait for it (7 s at most).
  const { summary, loading } = useSummary(page);
  const { url, message } = useMemo(() => build(window.location.origin, summary), [build, summary]);
  const { file, state } = useImageFile(image);
  const [shown, setShown] = useState(true);
  const native = typeof navigator.share === "function";
  const withFile = canShareFile(file);
  const done = (via: string) => {
    onShared?.(via);
    onClose();
  };
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});
  const sendFile = (via: string, text?: string) => {
    if (!withFile) return false;
    navigator.share({ files: [file], ...(text ? { text } : {}) }).catch(() => {});
    done(via);
    return true;
  };

  const whatsapp = (e: React.MouseEvent) => {
    // On a phone, the image with the message: a Status shows it full screen, a chat shows it with the text under it.
    if (sendFile("whatsapp", message.whatsapp)) return e.preventDefault();
    done("whatsapp");
  };
  const instagram = () => {
    // Instagram takes an image and no text: the caption goes to the clipboard to paste, the link as a link sticker.
    void copy(message.caption);
    if (sendFile("instagram")) return toast.success("Caption copied", "Paste it in Instagram, and add the link as a link sticker on a Story.");
    if (file) {
      saveFile(file);
      toast.success("Image saved and caption copied", "Post the image to Instagram and paste the caption.");
    } else toast.success("Caption copied", "Paste it with your Instagram post.");
    done("instagram");
  };

  return (
    <Modal open onClose={onClose} title={title} description={description} size="md">
      <div className="flex flex-col gap-4">
        {image && shown && (
          <div className="flex justify-center">
            <div className={cn("relative aspect-[9/16] h-[min(52dvh,560px)] overflow-hidden rounded-[18px] bg-[#312E81] shadow-lg", state === "loading" && "animate-pulse")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated image from our own route; next/image adds nothing here */}
              <img src={image} alt="The image that will be shared" className="size-full object-cover" onError={() => setShown(false)} />
            </div>
          </div>
        )}
        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 text-[13px] text-ink-3">
            <Loader2 className="size-4 wj-animate-spin" aria-hidden /> Summarising for a crisp message…
          </p>
        ) : (
          summary?.hook && (
            <p className="rounded-[12px] bg-bg-soft px-3 py-2 text-[13px] text-ink-2">
              {summary.ai && (
                <span className="mr-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
                  <Sparkles className="size-3" aria-hidden /> AI summary
                </span>
              )}
              {summary.hook}
            </p>
          )
        )}
        <div className={cn("grid grid-cols-4 gap-1", loading && "pointer-events-none opacity-40")} aria-busy={loading}>
          <a href={whatsappHref(message)} target="_blank" rel="noopener noreferrer" className={TILE} onClick={whatsapp}>
            <span className={cn(DISC, "bg-[#25d366]")}>
              <WhatsAppLogo />
            </span>
            WhatsApp
          </a>
          <button type="button" className={TILE} onClick={instagram}>
            <span className={DISC} style={{ background: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)" }}>
              <InstagramLogo />
            </span>
            Instagram
          </button>
          <a href={facebookHref(url)} target="_blank" rel="noopener noreferrer" className={TILE} onClick={() => done("facebook")}>
            <span className={cn(DISC, "bg-[#1877F2]")}>
              <FacebookLogo />
            </span>
            Facebook
          </a>
          <a href={xHref(message, url)} target="_blank" rel="noopener noreferrer" className={TILE} onClick={() => done("x")}>
            <span className={cn(DISC, "bg-black")}>
              <XLogo />
            </span>
            X
          </a>
          <a href={emailHref(message)} className={TILE} onClick={() => done("email")}>
            <span className={cn(DISC, "bg-brand-600")}>
              <Mail className="size-5" aria-hidden />
            </span>
            Email
          </a>
          <button
            type="button"
            className={TILE}
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
            <span className={cn(DISC, "bg-ink-3")}>
              <Link2 className="size-5" aria-hidden />
            </span>
            Copy link
          </button>
          {native && (
            <button
              type="button"
              className={TILE}
              onClick={() => {
                navigator.share({ title: message.subject, text: message.text, url, ...(withFile ? { files: [file] } : {}) }).catch(() => {});
                done("device");
              }}
            >
              <span className={cn(DISC, "bg-ink-2")}>
                <Share2 className="size-5" aria-hidden />
              </span>
              More
            </button>
          )}
        </div>
        <p className="border-t border-line pt-3 text-center text-[12px] text-ink-3">Every share helps a friend find their next opportunity on WonderWorks, free.</p>
      </div>
    </Modal>
  );
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The sheet's one line under its title: the listing's title and its first two facts, each kept short, none repeating the title. */
export function sheetLine(title: string, facts: ListingShareInput["facts"]): string {
  const same = (a: string) => a.trim().toLowerCase() === title.trim().toLowerCase();
  const rest = (facts ?? []).filter((f): f is string => !!f && !same(f)).slice(0, 2);
  return [short(title, 60), ...rest.map((f) => short(f, 32))].join(" · ");
}

/** A module's props for sharing one of its listings. */
export interface ListingShareProps extends ListingShareInput {
  module: string;
  className?: string;
  /** For the public page only: where the listing came from, and its original posting when it came from outside. */
  source?: string;
  originalUrl?: string;
  /** The original link's words, when "Original posting on <source>" doesn't fit (a mapped practice: "Their page on OpenStreetMap"). */
  originalLabel?: string;
  /** A credit the source's licence asks for (open data: "© OpenStreetMap contributors, ODbL"), shown under the listing. */
  credit?: string;
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
      description={sheetLine(input.title, input.facts)}
      className={className}
      onShared={(via) => track("listing_shared", { module, via })}
      build={(origin, summary) => {
        const url = absoluteUrl(origin, input.url);
        // Listings with a public page (`/s/<module>/<id>`) have a share image and a summary; people's profiles don't.
        const page = input.url.startsWith("/s/") ? input.url : undefined;
        return { url, message: listingShareMessage(input, url, { summary, image: !!page }), ...(page ? { image: storyPath(page), page } : {}) };
      }}
    />
  );
}
