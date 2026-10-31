"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, Clock, MapPin, Wallet } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { feeLabel, lengthLabel, modesLabel, type TherapistListing } from "../domain";
import { useTherapistsStore } from "../store";
import { FIT, useMatch } from "./Listing";
import { RequestSession } from "./Request";
import { shareOf } from "../share";

const noop = () => () => undefined;
const FIND = { href: "/app/m/therapists", label: "Therapists" };

/**
 * One practitioner's own page, on WonderWorks' listing page (wonderworks/listing/): the head and whether they fit your
 * preferences, About in their words, then the Terms and Source folds. It says plainly what WonderWorks has not checked.
 * Shown from what the client saw: their saves, else their last search in this visit.
 */
export function TherapistPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useTherapistsStore((s) => findListing(s, id)) as TherapistListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Practitioner not found" />
        <EmptyState title="This practitioner isn't in your results" body="Your searches aren't kept, so they may have left this visit's results. Search again to find them." action={{ label: "Back to Therapists", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Page({ l }: { l: TherapistListing }) {
  const params = useSearchParams();
  const saved = useTherapistsStore((s) => !!s.saved[l.id]);
  const toggle = useTherapistsStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const rows: [string, string][] = [
    ["How they meet", modesLabel(t.modes) ?? "Not stated"],
    ["City", t.modes?.includes("in_person") ? l.location || "Not stated" : "Not applicable"],
    ["Languages", t.languages?.length ? t.languages.join(", ") : "Not stated"],
    ["Focus areas", t.focus?.length ? t.focus.join(", ") : "Not stated"],
    ["Ways of working", t.approaches?.length ? t.approaches.join(", ") : "Not stated"],
    ["Fee", feeLabel(t)],
    ["Session length", lengthLabel(t.sessionMinutes) ?? "Not stated"],
  ];
  return (
    <ListingPage
      share={shareOf(l)}
      back={FIND}
      title={l.title}
      actions={
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
          {saved ? "Saved" : "Save"}
        </Button>
      }
    >
      <ListingMain>
        <ListingHead
          company={l.company}
          name={l.company}
          facts={[
            t.modes?.includes("in_person") && (
              <span key="l" className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {l.location}
              </span>
            ),
            modesLabel(t.modes) && <span key="m">{modesLabel(t.modes)}</span>,
            <span key="$" className="inline-flex items-center gap-1">
              <Wallet className="size-3.5" aria-hidden /> {feeLabel(t)}
            </span>,
            l.postedAt && (
              <span key="p" className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {relativeTime(l.postedAt)}
              </span>
            ),
          ]}
        />
        {fit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
              {fit.label}
            </span>
          </div>
        )}
        <p className="mt-3 rounded-[12px] bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
          Everything here is what {l.company} wrote about themselves. WonderWorks has not checked their licence, qualifications or claims, and shows no rating.
        </p>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">In their words</h2>
        <ClampedText text={l.description || "The practitioner shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            {m.signals.length > 0 && (
              <Fold title="Your preferences" hint={fit?.label}>
                <ul className="flex flex-col gap-2">
                  {m.signals.map((x) => (
                    <li key={x.text} className="flex gap-2 text-[14px]">
                      <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", x.tone === "good" ? "bg-success-600" : "bg-warning-600")} aria-hidden />
                      <span className="text-ink-2">{x.text}</span>
                    </li>
                  ))}
                </ul>
              </Fold>
            )}
            {m.signals.length === 0 && (
              <p className="text-sm text-ink-3">
                Save your language, how you&apos;d like to meet and a budget in <Link href="/app/m/therapists/you/profile" className="font-medium text-brand-600 hover:underline">Therapists → You</Link> to see how they compare.
              </p>
            )}
            <Fold title="Terms" hint={[modesLabel(t.modes), feeLabel(t)].filter(Boolean).join(" · ")}>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-4">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] text-ink-4">As {l.company} listed them on WonderWorks.</p>
            </Fold>
            <Fold title="Source" hint={`Via ${l.sourceName}`}>
              <p className="text-[13px] text-ink-2">Listed on WonderWorks by {l.company}.{l.postedAt ? ` Updated ${relativeTime(l.postedAt)}.` : ""}</p>
            </Fold>
          </div>
        )}
      </ListingMain>
      <ListingAside>
        <RequestSession listing={l} start={params.get("book") === "1"} />
      </ListingAside>
    </ListingPage>
  );
}
