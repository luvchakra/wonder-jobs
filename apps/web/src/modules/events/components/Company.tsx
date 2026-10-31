"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Chip, Field, Input, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { Badge, type Tone } from "@/components/common/Badge";
import type { OrgRole } from "@/domain/org/types";
import { OwnerWorkspace, useWorkspaces } from "@/wonderworks/owner/Workspace";
import { call } from "@/wonderworks/api";
import { CATEGORIES, fromIstInput, organiserMay, STATUS_LABEL, toIstInput, whenLabel, type Attendee, type EventPosting, type RsvpStatus } from "../domain";

type Data = { events: EventPosting[]; rsvps: Attendee[]; role?: OrgRole };
const POSTING_LABEL: Record<EventPosting["status"], string> = { draft: "Draft", open: "Open", closed: "Closed" };
const TONE: Record<RsvpStatus, Tone> = { going: "brand", waitlist: "info", attended: "success", no_show: "neutral", cancelled: "neutral" };
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/**
 * Events → Host an event: a workspace's events, on WonderWorks' owner side (wonderworks/owner/Workspace.tsx, Hiring's
 * layout). The same workspaces and roles as Hiring (domain/org/permissions.ts::can, checked again on the server for every
 * action). Open events are the WonderWorks events source in people's searches. Free events only. Attendees: who RSVPed, to
 * check people in; after an event starts, mark each attended or no-show.
 */
export function EventsCompany() {
  const workspaces = useWorkspaces();
  const { ws, may } = workspaces;
  const org = ws?.org.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EventPosting | "new" | null>(null);
  const [tab, setTab] = useState<"events" | "attendees">("events");

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/events/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  const url = `/api/m/events/org/${encodeURIComponent(org ?? "")}`;
  const setStatus = async (id: string, status: EventPosting["status"]) => {
    try {
      await call(url, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };
  const mark = async (id: string, action: "attended" | "no_show" | "cancelled", done: string) => {
    try {
      await call(`${url}/rsvps/${encodeURIComponent(id)}`, { body: { action } });
      toast.success(done);
      load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };
  const waiting = (data?.rsvps ?? []).filter((r) => r.status === "waitlist").length;
  const tabs = [{ value: "events" as const, label: "Events" }, ...(may("applications.view") ? [{ value: "attendees" as const, label: waiting ? `Attendees (${waiting} waiting)` : "Attendees" }] : [])];
  const shown = tabs.some((t) => t.value === tab) ? tab : "events";
  const byId = new Map((data?.events ?? []).map((e) => [e.id, e]));

  return (
    <OwnerWorkspace
      module="Events & Social"
      intro="For organisers and groups: post an event so people find it on WonderWorks, RSVP, and wait for a seat when it's full."
      noWorkspace="Create one for your group in Hiring, then post events here."
      state={{ ...workspaces, error: workspaces.error ?? error }}
      loaded={!!data}
      tabs={tabs}
      tab={shown}
      onTab={setTab}
    >
      {data && shown === "attendees" && (
        <section aria-label="Attendees">
          <p className="mb-3 text-[12px] text-ink-3">Everyone who RSVPed to your events. Attendees see only how many seats are left, never each other.</p>
          {data.rsvps.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No RSVPs yet.</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.rsvps.map((r) => {
                const ev = byId.get(r.listingId);
                const next = ev && may("applications.decide") ? organiserMay(r.status, ev.terms.startsAt) : [];
                return (
                  <li key={r.id} className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink">{r.name}</p>
                        <p className="truncate text-[12px] text-ink-3">{[r.email, ev?.title].filter(Boolean).join(" · ")}</p>
                      </div>
                      <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    {next.length > 0 && (
                      <div className="flex flex-wrap gap-3 text-[13px] font-medium">
                        {next.includes("attended") && (
                          <button type="button" className="min-h-10 text-success-600 hover:underline" onClick={() => void mark(r.id, "attended", "Marked attended")}>
                            Attended
                          </button>
                        )}
                        {next.includes("no_show") && (
                          <button type="button" className="min-h-10 text-ink-3 hover:text-ink" onClick={() => void mark(r.id, "no_show", "Marked no-show")}>
                            No-show
                          </button>
                        )}
                        {next.includes("cancelled") && (
                          <button type="button" className="min-h-10 text-ink-3 hover:text-ink" onClick={() => void mark(r.id, "cancelled", "Removed")}>
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {data && shown === "events" && (
        <section aria-label="Events">
          {may("jobs.edit") && (
            <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              Post an event
            </Button>
          )}
          <p className="mb-3 text-[12px] text-ink-3">Open events show in searches with your group&apos;s name. Free events only for now.</p>
          {data.events.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No events yet.{may("jobs.edit") ? " Post one: people see it once you open it." : ""}</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.events.map((p) => {
                const going = data.rsvps.filter((r) => r.listingId === p.id && r.status === "going").length;
                const wait = data.rsvps.filter((r) => r.listingId === p.id && r.status === "waitlist").length;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                      <p className="truncate text-[15px] font-semibold text-ink">{p.title}</p>
                      <p className="truncate text-[12px] text-ink-3">
                        {[whenLabel(p.terms.startsAt), p.terms.online ? "Online" : p.location, p.terms.capacity ? `${going} of ${p.terms.capacity} seats` : `${going} going`, wait ? `${wait} waiting` : ""].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge tone={p.status === "open" ? "success" : "neutral"}>{POSTING_LABEL[p.status]}</Badge>
                    {may("jobs.edit") && (
                      <div className="flex gap-3 text-[13px] font-medium">
                        <button type="button" className="min-h-10 text-brand-600 hover:underline" onClick={() => setForm(p)}>
                          Edit
                        </button>
                        {p.status !== "open" ? (
                          <button type="button" className="min-h-10 text-success-600 hover:underline" onClick={() => void setStatus(p.id, "open")}>
                            Open
                          </button>
                        ) : (
                          <button type="button" className="min-h-10 text-ink-3 hover:text-ink" onClick={() => void setStatus(p.id, "closed")}>
                            Close
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {form && org && (
        <EventForm
          orgId={org}
          posting={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </OwnerWorkspace>
  );
}

function EventForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: EventPosting | null; onClose: () => void; onSaved: () => void }) {
  const t = p?.terms;
  const [title, setTitle] = useState(p?.title ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [starts, setStarts] = useState(t ? toIstInput(t.startsAt) : "");
  const [ends, setEnds] = useState(t?.endsAt ? toIstInput(t.endsAt) : "");
  const [online, setOnline] = useState(t?.online ?? false);
  const [place, setPlace] = useState(p?.location ?? "");
  const [capacity, setCapacity] = useState(t?.capacity?.toString() ?? "");
  const [ageMin, setAgeMin] = useState(t?.ageMin?.toString() ?? "");
  const [tags, setTags] = useState<string[]>(t?.tags ?? []);
  const [tell, setTell] = useState(false);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const save = async () => {
    const startsAt = fromIstInput(starts);
    if (!startsAt) return toast.error("Choose when it starts", "Date and time, in India time.");
    const endsAt = ends ? fromIstInput(ends) : undefined;
    setBusy(true);
    try {
      const posting = { title, description, location: place || undefined, startsAt, endsAt, capacity: num(capacity), online, ageMin: num(ageMin), tags };
      const url = `/api/m/events/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting, tell } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Saved as a draft", p ? (tell ? "People going were told it changed." : undefined) : "Open it when it's ready.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={p ? "Edit event" : "Post an event"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="ef-title" required>
          <Input id="ef-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday board games" />
        </Field>
        <Field label="What it is" htmlFor="ef-desc" hint="At least a sentence or two" required>
          <Textarea id="ef-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Starts (India time)" htmlFor="ef-starts" required>
          <Input id="ef-starts" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        <Field label="Ends (India time)" htmlFor="ef-ends" hint="Optional">
          <Input id="ef-ends" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
        <Field label="Where" required>
          <div className="mb-2 flex gap-2">
            <Chip active={!online} onClick={() => setOnline(false)}>
              At a place
            </Chip>
            <Chip active={online} onClick={() => setOnline(true)}>
              Online
            </Chip>
          </div>
          {!online && <Input aria-label="Place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Koregaon Park, Pune" />}
        </Field>
        <Field label="Seats" htmlFor="ef-cap" hint="Empty means no limit. Raising it moves people up from the waitlist">
          <Input id="ef-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="12" />
        </Field>
        <Field label="Minimum age" htmlFor="ef-age" hint="Optional">
          <Input id="ef-age" inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
        </Field>
        <Field label="Kind">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={tags.includes(c)} onClick={() => setTags((x) => (x.length >= 5 && !x.includes(c) ? x : toggle(x, c)))}>
                {c}
              </Chip>
            ))}
          </div>
        </Field>
        <p className="text-[12px] text-ink-3">Free. Paid events aren&apos;t open yet.</p>
        {p && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Tell the people going that it changed
          </label>
        )}
      </div>
    </Modal>
  );
}
