"use client";
import { useState } from "react";
import type { NotifyAdmin } from "@/domain/notifications/admin";
import type { NotifyChannel, NotifyTopic } from "@/domain/notifications/prefs";
import { Button } from "@/components/common/Button";
import { Input, Switch } from "@/components/common/Input";
import { LoadError, Loading, Note, PageTitle, Panel, adminFetch, useAdmin } from "@/components/jobslake/ui";
import { relativeTime } from "@/lib/format";

type Limits = Record<"messageEmailEveryMin" | "interviewLeadHours" | "followUpLeadHours", readonly [number, number]>;
type Data = { settings: NotifyAdmin; defaults: NotifyAdmin; limits: Limits; topics: readonly { id: NotifyTopic; label: string; hint: string }[]; peopleWithChoices: number };

/** WonderJobs Admin → Settings → Notifications: what every person can be sent, and what they start with. */
export default function NotificationsAdminPage() {
  const { data, error, reload } = useAdmin<Data>("notifications");
  return (
    <>
      <PageTitle title="Notifications" subtitle="What every person can be sent and what they start with. People choose inside these in their Notification center; the bell always keeps everything." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <Editor key={data.settings.updatedAt ?? "default"} data={data} onSaved={reload} />}
    </>
  );
}

const CHANNELS: { id: NotifyChannel; label: string }[] = [
  { id: "push", label: "Push" },
  { id: "email", label: "Email" },
];

function Editor({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const [s, setS] = useState<NotifyAdmin>(data.settings);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const strip = (x: NotifyAdmin) => JSON.stringify({ ...x, updatedAt: undefined, updatedBy: undefined });
  const changed = strip(s) !== strip(data.settings);
  const isDefault = strip(s) === strip(data.defaults);
  const topic = (id: NotifyTopic, part: "allowed" | "defaults", ch: NotifyChannel, on: boolean) => setS((x) => ({ ...x, topics: { ...x.topics, [id]: { ...x.topics[id], [part]: { ...x.topics[id][part], [ch]: on } } } }));
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await adminFetch<{ settings: NotifyAdmin }>("notifications", { method: "PUT", body: JSON.stringify(s) });
    setBusy(false);
    if (!r.ok) return setProblem(r.error.message);
    onSaved();
  };
  const number = (key: keyof Limits, label: string, unit: string) => (
    <label className="flex items-center justify-between gap-3 py-2 text-[14px] text-ink">
      <span>
        {label}
        <span className="block text-[12px] text-ink-3">
          {data.limits[key][0]}–{data.limits[key][1]} {unit}
        </span>
      </span>
      <Input type="number" inputMode="numeric" min={data.limits[key][0]} max={data.limits[key][1]} value={s[key]} onChange={(e) => setS((x) => ({ ...x, [key]: Number(e.target.value) }))} className="w-24" aria-label={label} />
    </label>
  );
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Panel title="Channels for everyone">
        <ul className="divide-y divide-line">
          {CHANNELS.map((c) => (
            <li key={c.id} className="flex min-h-12 items-center justify-between gap-3 text-[14px]">
              <span>
                {c.label}
                {!s.channels[c.id] && <span className="block text-[12px] text-danger-600">Off: nothing is sent this way, whatever people chose.</span>}
              </span>
              <Switch checked={s.channels[c.id]} onChange={(on) => setS((x) => ({ ...x, channels: { ...x.channels, [c.id]: on } }))} label={`${c.label} for everyone`} />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Topics">
        <p className="mb-2 text-[12px] text-ink-3">Allowed: people may turn it on. Default: what someone who never chose gets. {data.peopleWithChoices} {data.peopleWithChoices === 1 ? "person has" : "people have"} made their own choices; defaults apply to everyone else.</p>
        <ul className="divide-y divide-line">
          {data.topics.map((t) => (
            <li key={t.id} className="py-2.5">
              <p className="text-[14px] text-ink">{t.label}</p>
              <p className="text-[12px] text-ink-3">{t.hint}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHANNELS.flatMap((c) =>
                  (["allowed", "defaults"] as const).map((part) => (
                    <span key={`${c.id}-${part}`} className="inline-flex items-center justify-between gap-2 rounded-[10px] bg-bg-soft px-2.5 py-1.5 text-[12px] text-ink-2">
                      {c.label} {part === "allowed" ? "allowed" : "default"}
                      <Switch checked={s.topics[t.id][part][c.id]} disabled={part === "defaults" && !s.topics[t.id].allowed[c.id]} onChange={(on) => topic(t.id, part, c.id, on)} label={`${t.label}: ${c.label} ${part === "allowed" ? "allowed" : "on by default"}`} />
                    </span>
                  )),
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Timing">
        <div className="divide-y divide-line">
          {number("messageEmailEveryMin", "At most one email per conversation every", "minutes")}
          {number("interviewLeadHours", "Interview reminders, before the interview", "hours")}
          {number("followUpLeadHours", "Follow-up and thank-you reminders, before they're due", "hours")}
        </div>
      </Panel>
      {problem && (
        <p role="alert" className="text-[13px] text-danger-600">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} disabled={!changed} onClick={() => void save()}>
          Save for everyone
        </Button>
        {!isDefault && (
          <Button size="sm" variant="outline" onClick={() => setS(data.defaults)}>
            Back to default
          </Button>
        )}
      </div>
      <Note>{data.settings.updatedAt ? `Last saved ${relativeTime(data.settings.updatedAt)}${data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ""}. Takes effect within a minute.` : "Nothing saved yet: the defaults apply."}</Note>
    </div>
  );
}
