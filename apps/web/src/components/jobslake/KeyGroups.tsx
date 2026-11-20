"use client";
import { useState } from "react";
import type { PlatformKeyStatus } from "@/server/jobslake/platformKeys";
import type { KeyNote } from "@/server/jobslake/keyNotes";
import { Button } from "@/components/common/Button";
import { Input, Textarea } from "@/components/common/Input";
import { adminFetch, LoadError, Loading, Panel, useAdmin } from "@/components/jobslake/ui";

/**
 * The keys set on the platform instead of in the hosting dashboard (owner, 2026-11-01), as sections. Encrypted on the
 * server and shown only masked; a deployment variable of the same name, if any, still wins. Two pages show them
 * (owner, 2026-11-06: "keep these keys in separate section to differentiate from data source keys"): Settings →
 * Platform keys (email, AI, push, the collection runner) and Sources → Keys (the data sources' keys).
 */
export type KeyGroup = NonNullable<PlatformKeyStatus["group"]>;
const GROUPS: { id: KeyGroup; title: string; hint: string }[] = [
  { id: "email", title: "Email", hint: "The mailbox every WonderWorks email is sent from, and the team's addresses." },
  { id: "ai", title: "WonderWorks AI", hint: "The platform-billed model behind WonderWorks AI drafts and Ask Wonder." },
  { id: "push", title: "Push notifications", hint: "The key pair browsers use to receive WonderWorks notifications." },
  { id: "runner", title: "Collection runner", hint: "Lets Import now start the collection on GitHub Actions instead of the site." },
  { id: "sources", title: "Source keys", hint: "The API keys the data sources need." },
];
export const PLATFORM_GROUPS: KeyGroup[] = ["email", "ai", "push", "runner"];

/** The sections for `groups`, in order, each with its keys and any action (Send a test email, Generate a key pair). */
export function KeyGroups({ groups }: { groups: KeyGroup[] }) {
  const { data, error, reload } = useAdmin<{ keys: PlatformKeyStatus[]; notes?: Record<string, KeyNote> }>("keys");
  // Show only the keys still to set (owner, 2026-11-07: "add an easy filter to show fields not set").
  const [show, setShow] = useState<"all" | "missing" | "set">("all");
  // And by the admin's own tags, or the keys whose reminder is due (owner, 2026-11-07: "allow to add some tags and notes
  // to this for further filtering and reminders").
  const [tag, setTag] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const notes = data?.notes ?? {};
  const sections = data ? GROUPS.filter((g) => groups.includes(g.id)).map((g) => ({ g, keys: data.keys.filter((k) => (k.group ?? "sources") === g.id) })).filter((x) => x.keys.length) : [];
  const all = sections.flatMap((x) => x.keys);
  const missingAll = all.filter((k) => !k.set).length;
  const isDue = (k: PlatformKeyStatus) => dueOn(notes[k.name]);
  const tags = [...new Set(all.flatMap((k) => notes[k.name]?.tags ?? []))].sort();
  const due = all.filter(isDue).length;
  const shown = (k: PlatformKeyStatus) => (show === "all" || (show === "missing" ? !k.set : k.set)) && (!tag || (notes[k.name]?.tags ?? []).includes(tag)) && (!dueOnly || isDue(k));
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink-2 hover:bg-bg-soft"}`;
  return (
    <>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && all.length > 0 && (
        <div role="group" aria-label="Show" className="mb-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["all", `All ${all.length}`],
              ["missing", `Not set ${missingAll}`],
              ["set", `Set ${all.length - missingAll}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={show === id}
              onClick={() => setShow(id)}
              className={chip(show === id)}
            >
              {label}
            </button>
          ))}
          {due > 0 && (
            <button type="button" aria-pressed={dueOnly} onClick={() => setDueOnly((d) => !d)} className={`${chip(dueOnly)} ${dueOnly ? "" : "border-warning-600/40 text-warning-600"}`}>
              Follow-up due {due}
            </button>
          )}
          {tags.length > 0 && <span className="ml-1 text-[12px] text-ink-4">Tags</span>}
          {tags.map((t) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag((x) => (x === t ? null : t))} className={chip(tag === t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {data && (show !== "all" || tag || dueOnly) && sections.every((x) => !x.keys.some(shown)) && <p className="mb-4 text-[13px] text-ink-3">No key matches these filters.</p>}
      {sections.map(({ g, keys }) => {
        const missing = keys.filter((k) => !k.set).length;
        const visible = keys.filter(shown);
        if (!visible.length) return null;
        return (
          <Panel key={g.id} title={`${g.title}${missing ? ` · ${missing} of ${keys.length} not set` : " · all set"}`} className="mb-4">
            <p className="-mt-1 mb-1 text-[12.5px] text-ink-3">{g.hint}</p>
            <ul className="flex flex-col divide-y divide-line">
              {visible.map((k) => (
                <KeyRow key={k.name} k={k} note={notes[k.name]} allTags={tags} onChanged={reload} />
              ))}
            </ul>
            {g.id === "email" && <GroupAction action="test_email" label="Send a test email" busyLabel="Sending" />}
            {g.id === "push" && !keys.some((k) => k.set && k.name !== "VAPID_SUBJECT") && <GroupAction action="generate_vapid" label="Generate a key pair" busyLabel="Generating" onDone={reload} />}
          </Panel>
        );
      })}
    </>
  );
}

/** One button under a section (Send a test email, Generate a key pair), with its answer beside it. */
function GroupAction({ action, label, busyLabel, onDone }: { action: string; label: string; busyLabel: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ action }) });
          setBusy(false);
          setMsg(r.ok ? r.data.message : r.error.message);
          if (r.ok) onDone?.();
        }}
      >
        {busy ? busyLabel : label}
      </Button>
      {msg && <span className="text-ink-3">{msg}</span>}
    </div>
  );
}

/** Pure: a note's reminder is due (its day has come, local time). */
function dueOn(n: KeyNote | undefined, today = new Date()): boolean {
  if (!n?.remindOn) return false;
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return n.remindOn <= d;
}

/** A key's tags, note and reminder: shown under the key, edited in place. Plain text, never the key's value. */
function KeyNotes({ name, note, allTags, onChanged }: { name: string; note?: KeyNote; allTags: string[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState("");
  const [text, setText] = useState("");
  const [remindOn, setRemindOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const edit = () => {
    setTags((note?.tags ?? []).join(", "));
    setText(note?.note ?? "");
    setRemindOn(note?.remindOn ?? "");
    setMsg(null);
    setOpen(true);
  };
  const save = async (clear = false) => {
    setBusy(true);
    const body = clear ? { action: "note", name, tags: [], note: "", remindOn: "" } : { action: "note", name, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), note: text, remindOn };
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      onChanged();
    } else setMsg(r.error.message);
  };
  const due = dueOn(note);
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {note?.tags.map((t) => (
          <span key={t} className="rounded-full bg-bg-soft px-2 py-0.5 text-ink-2">
            #{t}
          </span>
        ))}
        {note?.remindOn && <span className={due ? "font-medium text-warning-600" : "text-ink-3"}>{due ? `Follow up: due ${note.remindOn}` : `Follow up on ${note.remindOn}`}</span>}
        {note?.note && <span className="min-w-0 basis-full whitespace-pre-line text-ink-2">{note.note}</span>}
        <button type="button" onClick={edit} className="font-medium text-brand-600 hover:underline">
          {note ? "Edit note" : "Add tags or a note"}
        </button>
      </div>
    );
  const suggestions = allTags.filter((t) => !tags.split(",").map((x) => x.trim().toLowerCase()).includes(t));
  return (
    <form
      className="flex flex-col gap-2 rounded-[10px] bg-bg-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">
        Tags, separated by commas
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. waiting approval, paid, ask partner" className="h-9" />
      </label>
      {suggestions.length > 0 && (
        <span className="flex flex-wrap gap-1.5 text-[12px]">
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => setTags((x) => (x.trim() ? `${x.replace(/,\s*$/, "")}, ${t}` : t))} className="rounded-full border border-line px-2 py-0.5 text-ink-2 hover:bg-surface">
              + {t}
            </button>
          ))}
        </span>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-ink-3">
        Note
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Applied for API access on 7 Nov; approval takes a week" maxLength={500} />
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        Remind me on
        <Input type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)} className="h-9 w-auto" />
        {remindOn && (
          <button type="button" onClick={() => setRemindOn("")} className="text-ink-3 hover:text-ink">
            No reminder
          </button>
        )}
      </label>
      <span className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Save note
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {note && (
          <button type="button" disabled={busy} onClick={() => void save(true)} className="text-[12px] font-medium text-danger-600 hover:underline">
            Clear note
          </button>
        )}
        {msg && <span className="text-[12px] text-danger-600">{msg}</span>}
      </span>
      <span className="text-[11.5px] text-ink-4">Shown only to admins here. Never put a key or password in a note.</span>
    </form>
  );
}

function KeyRow({ k, note, allTags, onChanged }: { k: PlatformKeyStatus; note?: KeyNote; allTags: string[]; onChanged: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (v: string | null) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, value: v }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    if (r.ok) setValue("");
    onChanged();
  };
  const removeAt = async (i: number) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, removeAt: i }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    onChanged();
  };
  const importEnv = async () => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, importEnv: true }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    onChanged();
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ ok: boolean; message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, test: true }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
  };
  return (
    <li className="flex flex-col gap-2 py-3 text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium text-ink">{k.label}</span> <code className="text-[11.5px] text-ink-4">{k.name}</code>
          <span className="block text-[12px] text-ink-3">{k.usedBy}</span>
        </span>
        <span className={k.set ? "text-[12px] font-medium text-success-600" : "text-[12px] font-medium text-warning-600"}>{k.masked}</span>
      </div>
      {k.multi && (
        <div className="flex flex-col gap-2">
          {/* Several keys, used in turn (owner, 2026-11-05: "configure multiple key setup in admin"): each masked, each removable. */}
          {k.keys && k.keys.length > 0 && (
            <ul className="flex flex-col gap-1">
              {k.keys.map((m, i) => (
                <li key={`${m}-${i}`} className="flex items-center justify-between gap-2 rounded-[8px] bg-bg-soft px-2.5 py-1.5">
                  <code className="text-[12px] text-ink-2">{m}</code>
                  <button type="button" disabled={busy} onClick={() => void removeAt(i)} className="text-[12px] font-medium text-danger-600 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(value);
            }}
          >
            <Textarea autoComplete="off" rows={2} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste one or more keys, one per line" aria-label={k.label} className="[-webkit-text-security:disc]" />
            <span className="flex flex-wrap items-center gap-2">
              {(k.envCount ?? 0) > 0 && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void importEnv()}>
                  Copy {k.envCount} from the deployment
                </Button>
              )}
              <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < 4}>
                Add {value.split(/[\s,]+/).filter((x) => x.trim().length >= 4).length > 1 ? "keys" : "key"}
              </Button>
            </span>
          </form>
        </div>
      )}
      {!k.multi && k.from === "environment" && (
        <span className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void importEnv()}>
            Copy from the deployment
          </Button>
          <span className="text-[12px] text-ink-3">Then delete {k.name} in Vercel; this value takes over.</span>
        </span>
      )}
      {!k.multi && k.from !== "environment" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <Input type={k.plain ? "text" : "password"} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.set ? (k.plain ? "Type a new value to replace it" : "Paste a new value to replace it") : k.plain ? "Type the value" : "Paste the key"} aria-label={k.label} className="h-9 min-w-0 flex-1" />
          <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < (k.minLength ?? 4)}>
            {k.set ? "Replace" : "Save"}
          </Button>
          {k.set && (
            <button type="button" disabled={busy} onClick={() => void send(null)} className="text-[12px] font-medium text-danger-600 hover:underline">
              Remove
            </button>
          )}
        </form>
      )}
      <span className="text-[12px] text-ink-3">
        {(k.group ?? "sources") === "sources" && (
          <>
            {k.free ? "Free · " : ""}
            <a href={k.signup} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
              Get a key
            </a>
          </>
        )}
        {k.name === "GITHUB_DISPATCH_TOKEN" && (
          <a href={k.signup} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
            Create a token
          </a>
        )}
        {k.set && k.testable && (
          <>
            {" · "}
            <button type="button" disabled={busy} onClick={() => void test()} className="font-medium text-brand-600 hover:underline">
              Test
            </button>
          </>
        )}
        {msg ? ` · ${msg}` : ""}
      </span>
      <KeyNotes name={k.name} note={note} allTags={allTags} onChanged={onChanged} />
    </li>
  );
}
