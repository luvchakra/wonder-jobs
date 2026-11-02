"use client";
import { useEffect, useState } from "react";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { relativeTime } from "@/lib/format";
import { CONTACT_LABEL, CONTACT_STAGE, isContactStatus, type ContactStatus, type TherapistListing } from "../domain";
import { listingHref } from "../manifest";
import { DECLINE_REASONS, requestLabel, sessionLabel, STAGE_OF, STATUS_LABEL, type MySession, type SessionStatus } from "../sessions";
import { therapistsManifest } from "../manifest";
import { useTherapistsStore } from "../store";

export const itemHref = (id: string) => `/app/m/therapists/pipeline/${encodeURIComponent(id)}`;
export const CONTACT_TONE: Record<ContactStatus, Tone> = { contacted: "info", booked: "brand", no_reply: "neutral", not_a_fit: "neutral" };
export const TONE: Record<SessionStatus, Tone> = { requested: "info", confirmed: "brand", held: "success", declined: "neutral", cancelled: "neutral" };

/** One line for where a session stands. */
export function lineOf(r: Pick<MySession, "status" | "request" | "deal">): string {
  if (r.deal.session) return sessionLabel(r.deal.session);
  if (r.status === "requested") return `Waiting for a time · you asked for ${requestLabel(r.request)}`;
  if (r.status === "declined" && r.deal.reason) return DECLINE_REASONS[r.deal.reason];
  return requestLabel(r.request);
}

/** The client's sessions, fetched once on open (nothing else runs). Also brings each listing's "requested" mark up to date. */
export function useMySessions() {
  const [list, setList] = useState<MySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ sessions: MySession[] }>("/api/m/therapists/sessions")
      .then((r) => {
        setList(r.sessions);
        const st = useTherapistsStore.getState();
        const seen = new Set<string>();
        for (const q of r.sessions) {
          const id = `ws_${q.listingId}`;
          if (seen.has(id)) continue;
          seen.add(id);
          if (st.responses[id]?.status !== q.status) st.setResponse(id, STAGE_OF[q.status], { status: q.status });
        }
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return { list, error, reload: () => (setError(null), void load()) };
}

/**
 * Sessions, Therapists' Pipeline tab: Contacted · Requested · Upcoming · Held / Closed as tiles with counts: the client's
 * own requests on the server, and the practices they reached themselves (their own note, kept in their account). Declined and Cancelled end under Held / Closed with their own badge.
 */
export function TherapistsSessions() {
  const stages = therapistsManifest.pipeline.stages;
  const { list, error, reload } = useMySessions();
  const [tab, setTab] = useState<string | null>(null);
  const responses = useTherapistsStore((s) => s.responses);
  const items = useTherapistsStore((s) => s.items);
  // Practices the person reached themselves (one that can't be booked here): their own note, kept in their account.
  const contacts = Object.entries(responses)
    .flatMap(([id, r]) => (!id.startsWith("ws_") && isContactStatus(r.status) && items[id] ? [{ id, status: r.status, at: r.at, item: items[id] as TherapistListing }] : []))
    .sort((a, b) => b.at.localeCompare(a.at));

  if (error) return <ErrorState title="Couldn't load your sessions" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((r) => STAGE_OF[r.status] === stage).length + contacts.filter((c) => CONTACT_STAGE[c.status] === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const shown = list.filter((r) => STAGE_OF[r.status] === current);
  const shownContacts = contacts.filter((c) => CONTACT_STAGE[c.status] === current);

  return (
    <div>
      <PageHeader title={therapistsManifest.pipeline.label} />
      {list.length === 0 && contacts.length === 0 ? (
        <EmptyState title="No sessions yet" body="Request a session from a practitioner on WonderWorks, or note a practice you contacted yourself: their reply and the confirmed time show here." action={{ label: "Find a practitioner", href: "/app/m/therapists" }} />
      ) : (
        <section aria-label="Sessions">
          <StageTiles label="Sessions by stage" stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} current={current} onPick={setTab} />
          {shown.length + shownContacts.length === 0 ? (
            <StageEmpty label={label} />
          ) : (
            <StageList label={label}>
              {shownContacts.map((c) => (
                <li key={c.id}>
                  <StageCard href={listingHref(c.id)} logo={{ name: c.item.company }} company={c.item.company} title={c.item.practiceKind ?? c.item.title} line="You contacted them yourself · open to say how it went" tags={[]} badge={{ label: CONTACT_LABEL[c.status], tone: CONTACT_TONE[c.status] }} when={relativeTime(c.at)} />
                </li>
              ))}
              {shown.map((r) => (
                <li key={r.id}>
                  <StageCard href={itemHref(r.id)} logo={{ name: r.practitioner }} company={r.practitioner} title={r.title} line={lineOf(r)} tags={[]} badge={{ label: STATUS_LABEL[r.status], tone: TONE[r.status] }} when={relativeTime(r.updatedAt)} />
                </li>
              ))}
            </StageList>
          )}
        </section>
      )}
    </div>
  );
}
