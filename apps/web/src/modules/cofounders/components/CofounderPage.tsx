"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Select } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DECISION_LABEL, STAGE_OF, STATUS_LABEL, type CofounderListing, type ConnStatus } from "../domain";
import { useCofoundersStore } from "../store";
import { Act } from "./Act";
import { FIT, connStatus, useMatch, verbOf, shareOf } from "./Listing";
import { Safety } from "./Safety";

const noop = () => () => undefined;
const FIND = { href: "/app/m/cofounders", label: "Co-founders" };

/**
 * One person's or team's own page, on WonderWorks' listing page (wonderworks/listing/): the head and whether they fit,
 * what they show everyone, then Connect or Ask to join. It says plainly what stays hidden until interest is mutual.
 * Shown from what the searcher saw: their saves, else their last search in this visit.
 */
export function CofounderPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useCofoundersStore((s) => findListing(s, id)) as CofounderListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Not found" />
        <EmptyState title="This isn't in your results" body="They may have stopped being listed, or it's from another visit. Search again to find them." action={{ label: "Back to Co-founders", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Page({ l }: { l: CofounderListing }) {
  const router = useRouter();
  const saved = useCofoundersStore((s) => !!s.saved[l.id]);
  const toggle = useCofoundersStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const team = l.kind === "team";
  const rows: [string, string][] = team
    ? [
        ["Stage", t.stage ?? "Not stated"],
        ["Founders", String(t.founders ?? 1)],
        ["Looking for", (t.openRoles ?? []).map((o) => `${o.role}${o.skills.length ? ` — ${o.skills.join(", ")}` : ""}`).join("; ") || "Not stated"],
        ["Commitment", t.commitment ?? "Not stated"],
        ["Equity", t.equity ?? "Not stated"],
        ["Who can accept", t.decision ? DECISION_LABEL[t.decision] : "Not stated"],
      ]
    : [
        ["Role", t.role ?? "Not shown"],
        ["Skills", t.skills?.length ? t.skills.join(", ") : "Not shown"],
        ["Commitment", t.commitment ?? "Not shown"],
        ["Idea", t.ideaState === "idea" ? (t.idea ?? "Has an idea") : t.ideaState === "open" ? "Open to any idea" : "Not shown"],
        ["Equity", t.equity ?? "Not shown"],
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
          company={l.title}
          name={team ? "Team" : t.role ? `${t.role} founder` : "Founder"}
          facts={[
            l.location && (
              <span key="l" className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {l.location}
              </span>
            ),
            t.commitment && <span key="c">{t.commitment}</span>,
            team && t.founders && (
              <span key="f" className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden /> {t.founders === 1 ? "1 founder" : `${t.founders} founders`}
              </span>
            ),
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
          {team ? "This is what the team's founders chose to list." : "This is only what they chose to show everyone. Their name, the rest of their profile and any contact details stay hidden until you both agree."} WonderWorks has not checked any of it.
        </p>
        <h2 className="mt-4 text-[15px] font-semibold text-ink">{team ? "What they're building" : "In their words"}</h2>
        <ClampedText text={(team ? [l.company, l.description].filter(Boolean).join("\n\n") : l.description) || "They show nothing more than the details below."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            {m.signals.length > 0 && (
              <Fold title="Your details" hint={fit?.label}>
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
                Save your role and commitment in <Link href="/app/m/cofounders/you/profile" className="font-medium text-brand-600 hover:underline">Co-founders → You</Link> to see how they compare.
              </p>
            )}
            <Fold title="Details" hint={[t.commitment, team ? t.stage : t.role].filter(Boolean).join(" · ")}>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-4">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Fold>
            <Fold title={`Block or report ${team ? "this team" : "this person"}`}>
              <Safety kind={team ? "team" : "person"} id={l.id} noun={team ? "this team" : "them"} onBlocked={() => router.push(FIND.href)} />
            </Fold>
          </div>
        )}
      </ListingMain>
      <ListingAside>
        <Connect l={l} />
        {!team && <InviteToTeam l={l} />}
      </ListingAside>
    </ListingPage>
  );
}

const TO: Partial<Record<ConnStatus, string>> = { interested: "Waiting for an answer", mutual: "Say hello", talking: "Keep talking", building: "Building together" };

/** Show interest in a person, or ask to join a team: the searcher's own press, gated and audited on the server. */
function Connect({ l }: { l: CofounderListing }) {
  const status = useCofoundersStore((s) => connStatus(s, l.id));
  const set = useCofoundersStore((s) => s.setResponse);
  const team = l.kind === "team";
  if (status)
    return (
      <div className="flex flex-col gap-2">
        <Button full variant="outline" href="/app/m/cofounders/pipeline">
          {STATUS_LABEL[status]} · Connections
        </Button>
        <p className="text-[12px] text-ink-3">{TO[status]}</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <Act
        capability={team ? "cofounders.join" : "cofounders.connect"}
        label={verbOf(l)}
        full
        review={
          <>
            {team ? "The team's founders" : "They"} will see your headline and the fields you chose to show everyone, nothing else. Your name, the rest of your profile and your contact details stay hidden until you both agree. You can pass at any time and they won&apos;t be told.
          </>
        }
        run={async (confirmed) => {
          const out = await call<{ id: string; status: ConnStatus }>("/api/m/cofounders/connections", { body: { listingId: l.id, confirmed } });
          set(l.id, STAGE_OF[out.status], { status: out.status, item: l });
        }}
        done={team ? "Request sent" : "Interest sent"}
      />
      <p className="text-[12px] text-ink-3">{team ? "Founders of the team answer by their rule. " : ""}You need a saved profile first: <Link href="/app/m/cofounders/you/profile" className="font-medium text-brand-600 hover:underline">your profile</Link>.</p>
    </div>
  );
}

/** A founder invites this person to one of their teams. Loads the founder's teams only when pressed. */
function InviteToTeam({ l }: { l: CofounderListing }) {
  const [teams, setTeams] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(false);
  if (!teams)
    return (
      <Button full variant="ghost" size="sm" loading={loading} onClick={async () => {
        setLoading(true);
        try {
          const r = await call<{ teams: { id: string; role: string; closed: boolean; team: { name: string } }[] }>("/api/m/cofounders/teams");
          const mine = r.teams.filter((t) => t.role === "founder" && !t.closed).map((t) => ({ id: t.id, name: t.team.name }));
          setTeams(mine);
          setPick(mine[0]?.id ?? "");
        } finally {
          setLoading(false);
        }
      }}>
        Invite to my team
      </Button>
    );
  if (!teams.length) return <p className="text-[12px] text-ink-3">You run no team yet. <Link href="/app/m/cofounders/company" className="font-medium text-brand-600 hover:underline">Start one</Link> to invite people.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Select aria-label="Team" value={pick} onChange={(e) => setPick(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <Act capability="cofounders.invite" label="Invite" variant="outline" full review={<>They&apos;ll see your team&apos;s listing and can accept or pass. Nothing else of yours is shared.</>} run={(confirmed) => call(`/api/m/cofounders/teams/${encodeURIComponent(pick)}`, { body: { action: "invite", profileId: l.id, confirmed } })} done="Invitation sent" />
    </div>
  );
}
