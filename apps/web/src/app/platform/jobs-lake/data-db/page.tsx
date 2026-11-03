"use client";
import { useMemo, useState } from "react";
import type { ModuleDataDb, StoredDataDb } from "@/server/dataDb";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, PageTitle, Panel, num, useAdmin } from "@/components/jobslake/ui";
import { MODULES } from "@/modules/registry";
import { cn } from "@/lib/cn";

type Data = { modules: ModuleDataDb[]; setupSql: string };
const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1048576))} MB`);
const label = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;
const labels = (ids: string[]) => ids.map(label).join(", ");
const host = (url: string) => url.replace(/^https:\/\//, "").replace(/\.supabase\.co$/, "");
const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("data-db", { method: "POST", body: JSON.stringify(body) });

type Step = { key: "setup" | "test" | "copy" | "enable" | "clear" | "evict" | null; label: string; status: string; tone: "success" | "warning" | "neutral" | "info" };

/** Where a module stands and its one next step. */
function stepOf(m: ModuleDataDb): Step {
  const s = m.saved;
  const ddb = m.sharedWith.length ? "Shared DDB" : "Own DDB";
  if (m.from === "environment") return { key: null, label: "", status: `${ddb} (set in the deployment)`, tone: "success" };
  // Moving to a new DDB: the current one stays live until the new one is switched to.
  if (m.next) {
    if (!m.next.lastTest?.ok) return { key: "test", label: "Test new DDB", status: m.next.lastTest ? "New DDB test failed" : "Moving to a new DDB", tone: m.next.lastTest ? "warning" : "info" };
    if (!m.next.lastCopy) return { key: "copy", label: "Copy data", status: "Moving to a new DDB", tone: "info" };
    return { key: "enable", label: "Switch to new DDB", status: "New DDB ready", tone: "info" };
  }
  if (m.home === "own" && m.oldCopy) return { key: "clear", label: "Free old copy", status: ddb, tone: "warning" };
  if (m.home === "own" && (m.foreignRows ?? 0) > 0) return { key: "evict", label: "Move others' data out", status: ddb, tone: "warning" };
  if (m.home === "own") return { key: null, label: "", status: ddb, tone: "success" };
  if (!s) return { key: "setup", label: "Set up", status: "Main database", tone: "neutral" };
  if (!s.lastTest?.ok) return { key: "test", label: "Test", status: s.lastTest ? "Test failed" : "Saved, not tested", tone: s.lastTest ? "warning" : "info" };
  if (!s.lastCopy) return { key: "copy", label: "Copy data", status: "Tested, not copied", tone: "info" };
  return { key: "enable", label: "Switch on", status: "Copied, not switched on", tone: "info" };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "own", label: "On a DDB" },
  { id: "shared", label: "Shared DDB" },
  { id: "main", label: "Main database" },
  { id: "todo", label: "Needs a step" },
] as const;

/**
 * DDBs (owner, 2026-11-01; per module 2026-11-03; shared and movable 2026-11-03: "allow modules to share DDB if it is
 * configured like that … later … just change the credential of a DDB to a new database … any data for that particular
 * module from other DDB will be removed"). One row per module: where its data is, its size, who shares its DDB, and its
 * one next step; the row opens its connection and the rarer actions. Entering a project another module uses shares
 * that DDB; entering a new project for a module on a DDB moves it (test, copy, switch, then its old rows are freed).
 * Without a DDB a module's data stays in the main database. The setup script is the same for every project.
 */
export default function DataDbPage() {
  const { data, error, reload } = useAdmin<Data>("data-db");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ module: string; text: string } | null>(null);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (data?.modules ?? []).filter((m) => {
      if (words && !`${label(m.module)} ${m.module} ${m.saved?.url ?? ""} ${m.next?.url ?? ""}`.toLowerCase().includes(words)) return false;
      if (filter === "own") return m.home === "own";
      if (filter === "shared") return m.sharedWith.length > 0;
      if (filter === "main") return m.home === "main";
      if (filter === "todo") return stepOf(m).key !== null && stepOf(m).key !== "setup";
      return true;
    });
  }, [data, q, filter]);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading rows={4} />;
  const onDdb = data.modules.filter((m) => m.home === "own");
  const projects = new Map(onDdb.map((m) => [m.saved?.url ?? m.module, m.sizeBytes ?? 0]));
  const used = [...projects.values()].reduce((n, b) => n + b, 0);

  /** Runs one paged action (copy, clear, evict) over a module's tables until each says it's done. */
  const loop = async (m: ModuleDataDb, action: "copy" | "clear" | "evict"): Promise<boolean> => {
    let total = 0;
    for (const table of m.tables) {
      let part = 0;
      let offset = 0;
      for (;;) {
        setBusy({ module: m.module, text: `${action === "copy" ? "Copying" : action === "clear" ? "Freeing the old copy:" : "Moving"} ${table.replace(/_/g, " ")} · ${num(total)} rows` });
        const r = await post({ module: m.module, action, table, part, offset });
        if (!r.ok) {
          setBusy(null);
          toast.error(`Stopped at ${table.replace(/_/g, " ")}`, r.error.message);
          reload();
          return false;
        }
        const d = r.data as { copied?: number; deleted?: number; moved?: number; part?: number; offset?: number; done?: boolean };
        total += Number(d.copied ?? d.deleted ?? d.moved ?? 0);
        if (d.done) break;
        part = d.part ?? part;
        offset = d.offset ?? 0;
      }
    }
    setBusy(null);
    toast.success(action === "copy" ? "Copied" : action === "clear" ? "Old copy freed" : "Moved out", `${num(total)} rows.`);
    reload();
    return true;
  };
  const once = async (m: ModuleDataDb, body: Record<string, unknown>, done: string): Promise<boolean> => {
    setBusy({ module: m.module, text: "Working…" });
    const r = await post({ module: m.module, ...body });
    setBusy(null);
    if (!r.ok) toast.error("Didn't work", r.error.message);
    else if (body.action === "test") {
      const t = r.data.test as StoredDataDb["lastTest"];
      if (t?.ok) toast.success("Connected", t.message);
      else toast.error("Test failed", t?.message ?? "");
    } else if (done) toast.success(done);
    reload();
    return r.ok;
  };
  /** Switch on (or to the new DDB), then remove the module's rows from every other database. */
  const switchOn = async (m: ModuleDataDb) => {
    const ok = await once(m, { action: "enable" }, m.next ? `${label(m.module)} now uses its new DDB. Removing its old copy…` : `Switched on: ${label(m.module)} data is now read and written only in its DDB. Removing its old copy…`);
    if (ok) await loop(m, "clear");
  };
  const next = (m: ModuleDataDb, s: Step) => {
    if (s.key === "setup") return setOpen(m.module);
    if (s.key === "test") return void once(m, { action: "test" }, "");
    if (s.key === "copy") return void loop(m, "copy");
    if (s.key === "enable") return void switchOn(m);
    if (s.key === "clear") return void loop(m, "clear");
    if (s.key === "evict") return void loop(m, "evict");
  };

  return (
    <>
      <PageTitle title="DDBs" subtitle="Each module keeps its listings in a DDB (data database: a Supabase project), so they can't fill the main database. A DDB can be one module's own or shared by several; each module's data stays apart either way. When a DDB fills up, give a module a new one: its data moves over and is removed from the old one. A module without a DDB keeps its listings in the main database." />
      <Panel title={`${num(onDdb.length)} of ${num(data.modules.length)} modules on a DDB · ${num(projects.size)} ${projects.size === 1 ? "project" : "projects"}${used ? ` · ${mb(used)} in use` : ""}`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a module or project" aria-label="Find a module or project" className="min-w-0 flex-1" />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn("rounded-full border px-3 py-1 text-[12px]", filter === f.id ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-ink-3 hover:text-ink")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((m) => {
              const s = stepOf(m);
              const isOpen = open === m.module;
              const working = busy?.module === m.module;
              const line = [
                m.legacyKey ? "legacy key" : null,
                (m.foreignRows ?? 0) > 0 ? `${num(m.foreignRows ?? 0)} rows of other modules` : null,
                m.next ? `moving to ${host(m.next.url)}` : null,
                m.sharedWith.length ? `shared with ${labels(m.sharedWith)}` : null,
                m.sizeBytes != null ? mb(m.sizeBytes) : null,
                m.saved ? host(m.saved.url) : null,
              ].filter(Boolean);
              return (
                <li key={m.module} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                    <button type="button" className="min-w-[6rem] flex-1 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.module)}>
                      <span className="block font-medium text-ink">{label(m.module)}</span>
                      <span className="block truncate text-[12px] text-ink-3">{working ? busy.text : line.join(" · ") || "No DDB"}</span>
                    </button>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <Badge tone={s.tone} className="whitespace-nowrap">
                        {s.status}
                      </Badge>
                      {s.key && (
                        <Button size="sm" className="whitespace-nowrap" variant={s.key === "setup" ? "outline" : "primary"} disabled={!!busy} loading={working} onClick={() => next(m, s)}>
                          {s.label}
                        </Button>
                      )}
                    </span>
                  </div>
                  {isOpen && <Details m={m} all={data.modules} busy={!!busy} reload={reload} once={once} loop={loop} setupSql={data.setupSql} />}
                </li>
              );
            })}
            {!rows.length && <li className="py-3 text-[13px] text-ink-3">No module matches.</li>}
          </ul>
        </div>
      </Panel>

      <Fold title="Setup script" hint="The same for every project: Supabase → SQL editor → paste → Run, once per new project. Safe to re-run." className="mt-4">
        <div className="pb-4">
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(data.setupSql).then(() => toast.success("Copied", "Paste it into the new project's SQL editor and press Run."))}>
            Copy script
          </Button>
          <pre className="mt-3 max-h-64 overflow-auto rounded-[10px] bg-bg-soft p-3 text-[11px] text-ink-3">{data.setupSql}</pre>
        </div>
      </Fold>
    </>
  );
}

const linkCls = "font-medium text-brand-600 hover:underline disabled:opacity-50";
const quietCls = "text-ink-3 hover:text-ink hover:underline disabled:opacity-50";

/** A module's connection and its rarer actions, opened from its row. */
function Details({ m, all, busy, reload, once, loop, setupSql }: { m: ModuleDataDb; all: ModuleDataDb[]; busy: boolean; reload: () => void; setupSql: string; once: (m: ModuleDataDb, body: Record<string, unknown>, done: string) => Promise<boolean>; loop: (m: ModuleDataDb, a: "copy" | "clear" | "evict") => Promise<boolean> }) {
  const current = m.next ?? m.saved;
  // The field shows the project this module is on (or moving to), so what's saved is what's seen.
  const [url, setUrl] = useState(current?.url ?? "");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = m.saved;
  const name = label(m.module);
  if (m.from === "environment") return <p className="mt-2 text-[12px] text-ink-3">Set by WORKSLAKE_DATA_DB_URL and WORKSLAKE_DATA_DB_KEY in the deployment; remove those to manage it here.</p>;
  const typed = url.trim().replace(/\/$/, "");
  // Projects other modules already use: picking one shares it, and its saved key is reused.
  const others = [...new Map(all.filter((o) => o.module !== m.module && o.saved).map((o) => [o.saved!.url, all.filter((x) => x.saved?.url === o.saved!.url).map((x) => x.module)])).entries()];
  const knownUrl = (u: string) => u === saved?.url || u === m.next?.url || others.some(([o]) => o === u);
  const onDdb = m.home === "own";
  const save = async (to = typed) => {
    setSaving(true);
    const r = await post({ module: m.module, action: "save", url: to || saved?.url || "", key: key || undefined });
    setSaving(false);
    if (r.ok) {
      const d = r.data as { sharedWith?: string[]; move?: boolean; legacyKey?: boolean };
      if (d.legacyKey) toast.error("Legacy key saved", "Supabase retires service_role keys at the end of 2026. Create a secret key (sb_secret_…) in the project and save it here instead.");
      else toast.success(d.move ? "New DDB saved" : "Saved", d.move ? `${name} stays on its current DDB until you switch. Next: run the setup script there, then Test.` : d.sharedWith?.length ? `Shared with ${labels(d.sharedWith)}. Next: Test.` : "Next: run the setup script in that project, then Test.");
      setKey("");
      setUrl(to || saved?.url || "");
    } else toast.error("Couldn't save", r.error.message);
    reload();
  };
  const t = m.next ?? saved;
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-[10px] bg-bg-soft p-3 text-[13px]">
      <p className="text-ink-3">
        {!saved
          ? `Enter a new Supabase project for ${name}, or one another module uses to share it. Each module's data stays apart either way.`
          : m.next
            ? `${name} is moving to ${host(m.next.url)}. It stays on ${host(saved.url)} until you switch; then its rows there are removed.`
            : onDdb
              ? `To move ${name} to another DDB (when this one fills up), enter the new project below. Its data is copied over, and removed here once you switch.`
              : `Saved, switched off: ${name} data is in the main database.`}{" "}
        {(!saved || m.next || !onDdb) && <CopyScript sql={setupSql} />}
      </p>
      {m.legacyKey && (
        <p className="rounded-[8px] bg-warning-100 px-2.5 py-1.5 text-[12px] text-warning-600">
          Legacy key: Supabase retires service_role keys at the end of 2026. In this project, create a secret key (Project Settings → API Keys → Secret keys), then paste it in Secret key below (leave the URL blank) and Save. {name} stays switched on.
        </p>
      )}
      {t?.lastTest && <p className="text-[12px] text-ink-3">{`${t.lastTest.ok ? "Last test passed" : "Last test failed"}: ${t.lastTest.message}`}{t.lastCopy ? ` Last copy: ${Object.entries(t.lastCopy.rows).map(([tb, n]) => `${tb.replace(/_/g, " ")} ${num(n)}`).join(" · ")}.` : ""}</p>}
      {others.length > 0 && !m.next && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          {saved ? "Or share a DDB:" : "Share a DDB:"}
          {others
            .filter(([u]) => u !== saved?.url)
            .map(([u, mods]) => (
              <button key={u} type="button" className={linkCls} disabled={busy || saving} onClick={() => void save(u)} title={u}>
                {labels(mods)}&apos;s ({host(u)})
              </button>
            ))}
        </div>
      )}
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-[12px] text-ink-2">
          Project URL{onDdb && !m.next ? <span className="text-ink-4"> (enter another to move)</span> : null}
          {/* Not a login form: keep the browser from filling a saved email and password in here. */}
          <Input value={url} type="url" name="ddb-project-url" placeholder="https://<project>.supabase.co" onChange={(e) => setUrl(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" spellCheck={false} />
        </label>
        <label className="min-w-0 text-[12px] text-ink-2">
          Secret key <span className="text-ink-4">(sb_secret_…)</span>
          <Input value={key} type="password" name="ddb-secret-key" placeholder={typed && typed === current?.url ? `Saved ${current.masked}; paste a new one to replace it` : typed && knownUrl(typed) ? "Saved for this project; blank keeps it" : "Project Settings → API Keys → Secret keys; stored encrypted"} onChange={(e) => setKey(e.target.value)} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
        </label>
        <Button size="sm" className="justify-self-start" loading={saving} disabled={busy || saving || (!typed && !key) || (!key && !!typed && !knownUrl(typed)) || (!key && typed === current?.url)} onClick={() => void save()}>
          Save
        </Button>
      </div>
      {saved && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {(m.next || !onDdb) && (
            <button type="button" className={linkCls} disabled={busy} onClick={() => void once(m, { action: "test" }, "")}>
              Test again
            </button>
          )}
          {(m.next || !onDdb) && t?.lastTest?.ok && (
            <button type="button" className={linkCls} disabled={busy} onClick={() => void loop(m, "copy")}>
              Copy data{t.lastCopy ? " again" : ""}
            </button>
          )}
          {onDdb && !m.next && (
            <button type="button" className={linkCls} disabled={busy} onClick={() => void loop(m, "clear")} title={`Deletes ${name} rows from every other database (the main one and other DDBs); other modules' rows stay.`}>
              Free the old copy
            </button>
          )}
          {m.next && (
            <button type="button" className={quietCls} disabled={busy} onClick={() => void once(m, { action: "discard" }, `Move cancelled; ${name} stays on ${host(saved.url)}.`)}>
              Cancel the move
            </button>
          )}
          {onDdb && !m.next && (
            <button type="button" className={quietCls} disabled={busy} onClick={() => void once(m, { action: "disable" }, `Switched off: ${name} data goes to the main database again.`)}>
              Switch off
            </button>
          )}
          <button type="button" className={quietCls} disabled={busy} onClick={() => void once(m, { action: "remove" }, `Removed; ${name} data goes to the main database.`)}>
            Remove the connection
          </button>
        </div>
      )}
    </div>
  );
}

/** "Copy setup script": the same script for every project, copied for its SQL editor. */
function CopyScript({ sql }: { sql: string }) {
  return (
    <button type="button" className={linkCls} onClick={() => void navigator.clipboard.writeText(sql).then(() => toast.success("Setup script copied", "Paste it into the new project's SQL editor and press Run."))}>
      Copy setup script
    </button>
  );
}
