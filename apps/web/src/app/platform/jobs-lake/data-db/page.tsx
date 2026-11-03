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
const host = (url: string) => url.replace(/^https:\/\//, "").replace(/\.supabase\.co$/, "");
const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("data-db", { method: "POST", body: JSON.stringify(body) });

type Step = { key: "setup" | "test" | "copy" | "enable" | "evict" | null; label: string; status: string; tone: "success" | "warning" | "neutral" | "info" };

/** Where a module stands and its one next step. */
function stepOf(m: ModuleDataDb): Step {
  const s = m.saved;
  if (m.from === "environment") return { key: null, label: "", status: "Own DDB (set in the deployment)", tone: "success" };
  if (m.home === "own" && (m.foreignRows ?? 0) > 0) return { key: "evict", label: "Move others' data out", status: "Own DDB", tone: "warning" };
  if (m.home === "own") return { key: null, label: "", status: "Own DDB", tone: "success" };
  if (!s) return { key: "setup", label: "Set up", status: "Main database", tone: "neutral" };
  if (!s.lastTest?.ok) return { key: "test", label: "Test", status: s.lastTest ? "Test failed" : "Saved, not tested", tone: s.lastTest ? "warning" : "info" };
  if (!s.lastCopy) return { key: "copy", label: "Copy data", status: "Tested, not copied", tone: "info" };
  return { key: "enable", label: "Switch on", status: "Copied, not switched on", tone: "info" };
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "own", label: "Own DDB" },
  { id: "main", label: "Main database" },
  { id: "todo", label: "Needs a step" },
] as const;

/**
 * Data databases (owner, 2026-11-01; per module 2026-11-03: "each module linked to a separate Supabase database";
 * "current ddb should be dedicated for jobs … don't have any fallback … make the admin simple to manage even with
 * large number of databases"). One row per module: where its data is, its size, and its one next step; the row opens
 * its connection and the rarer actions. A module's data goes only to its own database; without one it stays in the
 * main database. The setup script is the same for every project, so it's shown once.
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
      if (words && !`${label(m.module)} ${m.module} ${m.saved?.url ?? ""}`.toLowerCase().includes(words)) return false;
      if (filter === "own") return m.home === "own";
      if (filter === "main") return m.home === "main";
      if (filter === "todo") return stepOf(m).key !== null && stepOf(m).key !== "setup";
      return true;
    });
  }, [data, q, filter]);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading rows={4} />;
  const own = data.modules.filter((m) => m.home === "own");
  const used = own.reduce((n, m) => n + (m.sizeBytes ?? 0), 0);

  /** Runs one paged action (copy, clear, evict) over a module's tables until each says it's done. */
  const loop = async (m: ModuleDataDb, action: "copy" | "clear" | "evict") => {
    let total = 0;
    for (const table of m.tables) {
      let part = 0;
      let offset = 0;
      for (;;) {
        setBusy({ module: m.module, text: `${action === "copy" ? "Copying" : action === "clear" ? "Freeing" : "Moving"} ${table.replace(/_/g, " ")} · ${num(total)} rows` });
        const r = await post({ module: m.module, action, table, part, offset });
        if (!r.ok) {
          setBusy(null);
          toast.error(`Stopped at ${table.replace(/_/g, " ")}`, r.error.message);
          reload();
          return;
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
  };
  const once = async (m: ModuleDataDb, body: Record<string, unknown>, done: string) => {
    setBusy({ module: m.module, text: "Working…" });
    const r = await post({ module: m.module, ...body });
    setBusy(null);
    if (!r.ok) toast.error("Didn't work", r.error.message);
    else if (body.action === "test") {
      const t = r.data.test as StoredDataDb["lastTest"];
      if (t?.ok) toast.success("Connected", t.message);
      else toast.error("Test failed", t?.message ?? "");
    } else toast.success(done);
    reload();
  };
  const next = (m: ModuleDataDb, s: Step) => {
    if (s.key === "setup") return setOpen(m.module);
    if (s.key === "test") return void once(m, { action: "test" }, "");
    if (s.key === "copy") return void loop(m, "copy");
    if (s.key === "enable") return void once(m, { action: "enable" }, `Switched on: ${label(m.module)} data is now read and written only in its own DDB.`);
    if (s.key === "evict") return void loop(m, "evict");
  };

  return (
    <>
      <PageTitle title="DDBs" subtitle="Each module keeps its listings in its own DDB (data database: a Supabase project of its own), so each grows on its own free plan and no module's data mixes with another's. A module without its own DDB keeps them in the main database. Accounts, saves and settings always stay in the main database." />
      <Panel title={`${num(own.length)} of ${num(data.modules.length)} modules have their own DDB${used ? ` · ${mb(used)} in use` : ""}`}>
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
              return (
                <li key={m.module} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
                    <button type="button" className="min-w-[6rem] flex-1 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.module)}>
                      <span className="block font-medium text-ink">{label(m.module)}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {working ? busy.text : [(m.foreignRows ?? 0) > 0 ? `${num(m.foreignRows ?? 0)} rows of other modules` : null, m.sizeBytes != null ? mb(m.sizeBytes) : null, m.saved ? host(m.saved.url) : null].filter(Boolean).join(" · ") || "No DDB of its own"}
                      </span>
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
                  {isOpen && <Details m={m} busy={!!busy} reload={reload} once={once} loop={loop} setupSql={data.setupSql} />}
                </li>
              );
            })}
            {!rows.length && <li className="py-3 text-[13px] text-ink-3">No module matches.</li>}
          </ul>
        </div>
      </Panel>

      <Fold title="Setup script" hint="The same for every module's project: Supabase → SQL editor → paste → Run, once per new project. Safe to re-run." className="mt-4">
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

/** A module's connection and its rarer actions, opened from its row. */
function Details({ m, busy, reload, once, loop, setupSql }: { m: ModuleDataDb; busy: boolean; reload: () => void; setupSql: string; once: (m: ModuleDataDb, body: Record<string, unknown>, done: string) => Promise<void>; loop: (m: ModuleDataDb, a: "copy" | "clear" | "evict") => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = m.saved;
  const name = label(m.module);
  if (m.from === "environment") return <p className="mt-2 text-[12px] text-ink-3">Set by WORKSLAKE_DATA_DB_URL and WORKSLAKE_DATA_DB_KEY in the deployment; remove those to manage it here.</p>;
  const save = async () => {
    setSaving(true);
    const r = await post({ module: m.module, action: "save", url: url || saved?.url || "", key: key || undefined });
    setSaving(false);
    if (r.ok) {
      toast.success("Saved", "Next: run the setup script in that project, then Test.");
      setKey("");
    } else toast.error("Couldn't save", r.error.message);
    reload();
  };
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-[10px] bg-bg-soft p-3 text-[13px]">
      {!saved && (
        <p className="text-ink-3">
          Create a new Supabase project for {name} (one no other module uses), run the setup script there, then enter its details. Only {name} data goes there.{" "}
          <CopyScript sql={setupSql} />
        </p>
      )}
      {saved?.lastTest && <p className="text-[12px] text-ink-3">{`${saved.lastTest.ok ? "Last test passed" : "Last test failed"}: ${saved.lastTest.message}`}{saved.lastCopy ? ` Last copy: ${Object.entries(saved.lastCopy.rows).map(([t, n]) => `${t.replace(/_/g, " ")} ${num(n)}`).join(" · ")}.` : ""}</p>}
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-[12px] text-ink-2">
          Project URL
          <Input value={url} placeholder={saved?.url ?? "https://<project>.supabase.co"} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        </label>
        <label className="min-w-0 text-[12px] text-ink-2">
          Service role key
          <Input value={key} type="password" placeholder={saved ? `Saved ${saved.masked}; blank keeps it` : "The secret key; stored encrypted"} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <Button size="sm" className="justify-self-start" loading={saving} disabled={busy || saving || (!url && !saved) || (!key && (!saved || (!!url && url.replace(/\/$/, "") !== saved.url)))} onClick={() => void save()}>
          Save
        </Button>
      </div>
      {saved && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {m.home !== "own" && <CopyScript sql={setupSql} />}
          {m.home !== "own" && (
            <button type="button" className="font-medium text-brand-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void once(m, { action: "test" }, "")}>
              Test again
            </button>
          )}
          {m.home !== "own" && saved.lastTest?.ok && (
            <button type="button" className="font-medium text-brand-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void loop(m, "copy")}>
              Copy data{saved.lastCopy ? " again" : ""}
            </button>
          )}
          {m.home === "own" && (
            <button type="button" className="font-medium text-brand-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => void loop(m, "clear")} title={`Deletes ${name} rows left in the main database${m.module === "jobs" ? "" : " and in Jobs' DDB"}; its own DDB keeps everything.`}>
              Free the old copy
            </button>
          )}
          {m.home === "own" && (
            <button type="button" className="text-ink-3 hover:text-ink hover:underline disabled:opacity-50" disabled={busy} onClick={() => void once(m, { action: "disable" }, `Switched off: ${name} data goes to the main database again.`)}>
              Switch off
            </button>
          )}
          <button type="button" className="text-ink-3 hover:text-ink hover:underline disabled:opacity-50" disabled={busy} onClick={() => void once(m, { action: "remove" }, `Removed; ${name} data goes to the main database.`)}>
            Remove the connection
          </button>
        </div>
      )}
    </div>
  );
}

/** "Copy setup script": the same script for every module's project, copied for its SQL editor. */
function CopyScript({ sql }: { sql: string }) {
  return (
    <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => void navigator.clipboard.writeText(sql).then(() => toast.success("Setup script copied", "Paste it into the new project's SQL editor and press Run."))}>
      Copy setup script
    </button>
  );
}
