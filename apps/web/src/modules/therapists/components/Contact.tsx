"use client";
import { ExternalLink, Globe, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Chip } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CONTACT_LABEL, CONTACT_STAGE, isContactStatus, telHref, type ContactStatus, type TherapistListing } from "../domain";
import { useTherapistsStore } from "../store";

const OUTCOMES: ContactStatus[] = ["contacted", "booked", "no_reply", "not_a_fit"];

/** The host of a link, for a label ("calmminds.example.in"). */
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * How to reach a practice an open-data source maps, on its details page: one main way in, then what else the map has.
 * The main one is the practice's phone when the map has it, else its own website, else its page on OpenStreetMap, and it
 * is named for what it opens. Nothing is made up: a way the map doesn't have isn't offered. Reaching out is the client's
 * own; tapping a way in notes "Contacted" in their Sessions (their own account, sent to no one), and they say below how
 * it went: Booked a session, No reply, or Not a fit.
 */
export function ContactPanel({ listing: l }: { listing: TherapistListing }) {
  const rec = useTherapistsStore((s) => s.responses[l.id]);
  const status = isContactStatus(rec?.status) ? rec.status : null;
  const web = l.applyUrl && l.applyUrl !== l.mapUrl ? l.applyUrl : undefined;
  const ways = [
    ...(l.phone ? [{ key: "phone", href: telHref(l.phone), label: `Call ${l.phone}`, short: "Call", icon: <Phone className="size-4" aria-hidden /> }] : []),
    ...(web ? [{ key: "web", href: web, label: `Open ${hostOf(web)}`, short: "Website", icon: <Globe className="size-4" aria-hidden /> }] : []),
    ...(l.mapUrl ? [{ key: "map", href: l.mapUrl, label: "View on OpenStreetMap", short: "OpenStreetMap", icon: <MapPin className="size-4" aria-hidden /> }] : []),
  ];
  const set = (to: ContactStatus) => useTherapistsStore.getState().setResponse(l.id, CONTACT_STAGE[to], { status: to, item: l });
  const reached = () => {
    if (status) return;
    set("contacted");
    toast.success("Noted in Sessions", "Say how it went on this page, or in Sessions.");
  };
  const [main, ...others] = ways;
  return (
    <div className="flex flex-col gap-3">
      {main && (
        <Button full external href={main.href} icon={main.icon} iconRight={main.key !== "phone" ? <ExternalLink className="size-3.5" aria-hidden /> : undefined} onClick={reached}>
          {main.label}
        </Button>
      )}
      {others.length > 0 && (
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]">
          {others.map((w) => (
            <a key={w.key} href={w.href} {...(w.key === "phone" ? {} : { target: "_blank", rel: "noopener noreferrer" })} onClick={reached} className="inline-flex min-h-10 items-center gap-1 font-medium text-brand-600 hover:underline">
              {w.icon}
              {w.key === "web" ? `Website (${hostOf(w.href)})` : w.short}
            </a>
          ))}
        </p>
      )}
      {!main && <p className="text-[13px] text-ink-3">The map has no way to reach this practice.</p>}
      <p className="text-center text-[12px] text-ink-3">WonderWorks can&apos;t book a session with them. You arrange it with the practice, and pay them directly.</p>
      {status ? (
        <fieldset className="border-t border-line pt-3">
          <legend className="mb-2 text-[13px] font-medium text-ink-2">How did it go?</legend>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <Chip key={o} active={status === o} onClick={() => set(o)}>
                {CONTACT_LABEL[o]}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : (
        <Button variant="ghost" size="sm" full onClick={() => (set("contacted"), toast.success("Noted in Sessions"))}>
          I&apos;ve contacted them
        </Button>
      )}
    </div>
  );
}
