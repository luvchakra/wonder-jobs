"use client";
import { memo } from "react";
import Link from "next/link";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { Badge } from "@/components/common/Badge";
import { CompanyLogo } from "@/components/common/Avatar";
import { relativeTime } from "@/lib/format";
import { matchListing, STATUS_LABEL, type CofounderListing, type ConnStatus, type Fit } from "../domain";
import { listingHref } from "../manifest";
import { selectPersona, useCofoundersStore } from "../store";
import { shareOf } from "../share";

export function useMatch(l: CofounderListing): Fit {
  return matchListing(l, useCofoundersStore(selectPersona));
}

export const FIT: Record<Exclude<Fit["fit"], "unknown">, { top: string; bottom: string; label: string; tone: string; title: string }> = {
  strong: { top: "Fits", bottom: "you", label: "Fits what you're looking for", tone: "bg-success-100 text-success-600", title: "A complementary role and the same time commitment" },
  some: { top: "Partly", bottom: "fits", label: "Partly fits what you're looking for", tone: "bg-brand-50 text-brand-700", title: "Differs from something you saved" },
};

/** The verb on the card and page: people are connected with; teams are asked to join. */
export const verbOf = (l: Pick<CofounderListing, "kind">) => (l.kind === "team" ? "Ask to join" : "Connect");

const LIVE: ConnStatus[] = ["interested", "mutual", "talking", "building"];
/** The status of the person's connection with this listing (their own record; Connections brings it up to date). */
export const connStatus = (s: { responses: Record<string, { status?: string }> }, id: string): ConnStatus | null => {
  const v = s.responses[id]?.status as ConnStatus | undefined;
  return v && LIVE.includes(v) ? v : null;
};

/**
 * One person or team in the results, on the card Jobs' Find uses: the logo with whether they fit; the headline or team
 * name; role · commitment · place; skills or the roles a team needs; what they showed everyone about themselves; where
 * it was found, and Save. Only what they chose to show everyone is here.
 */
export const CofounderCard = memo(function CofounderCard({ item: l, onOpen }: { item: CofounderListing; onOpen: (id: string) => void }) {
  const saved = useCofoundersStore((s) => !!s.saved[l.id]);
  const toggle = useCofoundersStore((s) => s.toggleSaved);
  const status = useCofoundersStore((s) => connStatus(s, l.id));
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const t = l.terms;
  const roles = (t.openRoles ?? []).map((o) => `${o.role}${o.skills.length ? ` (${o.skills.slice(0, 2).join(", ")})` : ""}`);
  return (
    <ResultCard
      share={shareOf(l)}
      aside={
        <>
          <CompanyLogo name={l.title} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.top} bottom={fit.bottom} srText={fit.title} />}
          {!status && (
            <Link href={`${listingHref(l.id)}?connect=1`} onClick={() => onOpen(l.id)} aria-label={`${verbOf(l)}: ${l.title}`} className={APPLY_BTN}>
              {l.kind === "team" ? "Join" : "Connect"}
            </Link>
          )}
        </>
      }
      title={
        <Link href={listingHref(l.id)} onClick={() => onOpen(l.id)} className={CARD_TARGET}>
          {l.title}
        </Link>
      }
      facts={[
        <span key="k" className="font-medium text-ink-2">
          {l.kind === "team" ? `Team · ${t.stage ?? ""}`.replace(/ · $/, "") : t.role ? `${t.role} founder` : "Founder"}
        </span>,
        t.commitment && <span key="c">{t.commitment}</span>,
        l.location && <span key="p">{l.location}</span>,
        l.kind === "team" && t.founders && <span key="f">{t.founders === 1 ? "1 founder" : `${t.founders} founders`}</span>,
      ]}
      tags={l.kind === "team" ? roles.slice(0, 3) : (t.skills ?? []).slice(0, 4)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={(l.kind === "team" ? l.company : l.description).slice(0, 240)}
      summaryTitle={l.kind === "team" ? "What they're building" : "In their words"}
      status={status && <Badge tone="brand">{STATUS_LABEL[status]}</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun={l.kind === "team" ? "team" : "person"} />}
    />
  );
});
