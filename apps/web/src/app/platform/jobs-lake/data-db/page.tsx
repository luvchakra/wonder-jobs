"use client";
import { useState } from "react";
import type { DataDbStatus, StoredDataDb } from "@/server/dataDb";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, PageTitle, Panel, num, useAdmin } from "@/components/jobslake/ui";
import { MODULES } from "@/modules/registry";

type Overview = { module: string; home: "own" | "shared" | "main"; saved: DataDbStatus["saved"] }[];
type Data = DataDbStatus & { usage: { dbBytes: number } | null; setupSql: string; modules: Overview };
const mb = (b: number) => `${Math.round(b / 1048576)} MB`;
const label = (id: string) => (id === "shared" ? "Shared data database" : (MODULES.find((m) => m.id === id)?.label ?? id));
const HOME = { own: { text: "Own database", tone: "success" }, shared: { text: "Shared data database", tone: "info" }, main: { text: "Main database", tone: "neutral" } } as const;

/**
 * Data databases (owner, 2026-11-01; per module 2026-11-03: "each module linked to a separate Supabase database … the
 * data for that module should route to that particular database and not other databases"). Each module can keep its
 * WorksLake data (its listings, the gateway's listings, its search cache; Jobs also its H-1B data) in its own Supabase
 * project, so each grows on its own free plan. A module without one uses the shared data database, or the main one.
 * For each: save the connection, run the setup script there, test, copy today's data, switch on, then free the old copy.
 */
export default function DataDbPage() {
  const [target, setTarget] = useState("shared");
  const { data, error, reload } = useAdmin<Data>(`data-db?module=${encodeURIComponent(target)}`);
  return (
    <>
      <PageTitle title="Data databases" subtitle="Give each module its own Supabase project for its listings, so each grows on its own free plan and no module's data mixes with another's. A module without its own uses the shared data database, or the main one. Accounts, saves and settings always stay in the main database." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={3} />}
      {data && (
        <>
          <Panel title="Where each module's data lives">
            <ul className="flex flex-col divide-y divide-line">
              {[{ module: "shared", home: "main" as const, saved: null }, ...data.modules].map((m) => {
                const home = m.module === "shared" ? null : HOME[m.home];
                const selected = m.module === target;
                return (
                  <li key={m.module} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{label(m.module)}</span>
                      <span className="block text-[12px] text-ink-3">{m.module === "shared" ? "For every module without its own" : m.saved ? `${m.saved.url.replace("https://", "")}${m.saved.enabled ? "" : " · saved, switched off"}` : "No database of its own"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {home && <Badge tone={home.tone}>{home.text}</Badge>}
                      <Button size="sm" variant={selected ? "primary" : "outline"} aria-pressed={selected} onClick={() => setTarget(m.module)}>
                        {selected ? "Selected" : m.saved || m.module === "shared" ? "Manage" : "Set up"}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {data.target === target && <Setup key={target} target={target} data={data} reload={reload} />}
        </>
      )}
    </>
  );
}

/** One data database's steps: the shared one, or one module's own. */
function Setup({ target, data, reload }: { target: string; data: Data; reload: () => void }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const saved = data.saved;
  const onData = data.active === "data";
  const tested = saved?.lastTest?.ok === true;
  const mine = target !== "shared";
  const name = label(target);
  const fromEnv = !mine && data.from === "environment";

  const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("data-db", { method: "POST", body: JSON.stringify({ ...body, module: target }) });
  const step = async (label: string, body: Record<string, unknown>, done: string) => {
    setBusy(label);
    const r = await post(body);
    setBusy(null);
    if (r.ok) toast.success(done);
    else toast.error("Didn't work", r.error.message);
    reload();
  };
  const save = async () => {
    setBusy("save");
    const r = await post({ action: "save", url: url || saved?.url || "", key: key || undefined });
    setBusy(null);
    if (r.ok) {
      toast.success("Saved", "Next: run the setup script there, then Test.");
      setKey("");
    } else toast.error("Couldn't save", r.error.message);
    reload();
  };
  const test = async () => {
    setBusy("test");
    const r = await post({ action: "test" });
    setBusy(null);
    const t = r.ok ? (r.data.test as StoredDataDb["lastTest"]) : undefined;
    if (t?.ok) toast.success("Connected", t.message);
    else toast.error("Test failed", t?.message ?? (r.ok ? "" : r.error.message));
    reload();
  };
  // Page by page, table by table, so no request runs long; safe to run again (it upserts).
  const loop = async (action: "copy" | "clear") => {
    let total = 0;
    for (const table of data.tables) {
      let offset = 0;
      for (;;) {
        setBusy(`${action}: ${table.replace(/_/g, " ")} (${num(total)})`);
        const r = await post({ action, table, offset });
        if (!r.ok) {
          setBusy(null);
          toast.error(`Stopped at ${table}`, r.error.message);
          reload();
          return;
        }
        const n = Number(r.data.copied ?? r.data.deleted ?? 0);
        total += n;
        offset += n;
        if (r.data.done) break;
      }
    }
    setBusy(null);
    toast.success(action === "copy" ? "Copied" : "Old copy freed", `${num(total)} rows.`);
    reload();
  };

  const where = onData ? (mine ? "in its own database" : "switched on") : mine ? (data.active === "shared" ? "in the shared data database" : "in the main database") : "off, WorksLake's data is in the main database";
  const line = fromEnv
    ? "Set by WORKSLAKE_DATA_DB_URL and WORKSLAKE_DATA_DB_KEY in the deployment; the settings below don't apply while those are set."
    : onData
      ? `${saved?.url ?? ""} · switched on.`
      : saved
        ? `${saved.url} is saved, switched off.`
        : mine
          ? `No database of its own yet. Create a new Supabase project for ${name} (not one another module uses), then enter its details below. Only this module's data goes there.`
          : "No shared data database yet. Create a Supabase project, then enter its details below.";

  return (
    <>
      <Panel title={`${name}: ${mine ? "data is " : ""}${where}${onData && data.usage ? ` · ${mb(data.usage.dbBytes)}` : ""}`} className="mt-4">
        <p className="text-[13px] text-ink-3">{line}</p>
      </Panel>

      {!fromEnv && (
        <>
          <Panel title="1. Connection" className="mt-4">
            <div className="flex flex-col gap-3">
              <label className="text-[13px] text-ink-2">
                Project URL <span className="text-ink-4">(Supabase → Project Settings → API)</span>
                <Input value={url} placeholder={saved?.url ?? "https://<project>.supabase.co"} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
              </label>
              <label className="text-[13px] text-ink-2">
                Service role key <span className="text-ink-4">{saved ? `(saved: ${saved.masked}; leave blank to keep)` : "(the secret key; stored encrypted)"}</span>
                <Input value={key} type="password" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              </label>
              <Button className="self-start" loading={busy === "save"} disabled={!!busy || (!url && !saved) || (!key && (!saved || (!!url && url.replace(/\/$/, "") !== saved.url)))} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </Panel>

          {saved && (
            <>
              <Fold title="2. Run the setup script in the new project" hint="Supabase → SQL editor → paste → Run. Once." className="mt-4">
                <div className="pb-4">
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(data.setupSql).then(() => toast.success("Copied", "Paste it into the new project's SQL editor and press Run."))}>
                    Copy script
                  </Button>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-[10px] bg-bg-soft p-3 text-[11px] text-ink-3">{data.setupSql}</pre>
                </div>
              </Fold>

              <Panel title="3. Test, copy and switch on" className="mt-4">
                <div className="flex flex-col gap-3 text-[13px] text-ink-3">
                  <p>
                    {saved.lastTest ? `${saved.lastTest.ok ? "Last test passed" : "Last test failed"}: ${saved.lastTest.message}` : "Not tested yet."}
                    {saved.lastCopy ? ` Last copy: ${Object.entries(saved.lastCopy.rows).map(([t, n]) => `${t.replace(/_/g, " ")} ${num(n)}`).join(" · ")}.` : ""}
                  </p>
                  {busy && busy.includes(":") && <p className="text-ink-2">{busy}…</p>}
                  <div className="flex flex-wrap gap-2">
                    {!onData && (
                      <>
                        <Button size="sm" variant={tested ? "outline" : "primary"} loading={busy === "test"} disabled={!!busy} onClick={() => void test()}>
                          Test
                        </Button>
                        <Button size="sm" variant="outline" disabled={!!busy || !tested} onClick={() => void loop("copy")}>
                          Copy today&apos;s data
                        </Button>
                        <Button size="sm" disabled={!!busy || !tested || !saved.lastCopy} onClick={() => void step("enable", { action: "enable" }, mine ? `Switched on: ${name} data is now read and written only in its own database.` : "Switched on: WorksLake now reads and writes the data database.")}>
                          Switch on
                        </Button>
                      </>
                    )}
                    {onData && (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void loop("clear")}>
                        {mine ? "Free the old copy" : "Free the main database"}
                      </Button>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-4">
                    {onData
                      ? mine
                        ? `Free the old copy deletes this module's rows where they were before; its own database keeps everything.`
                        : "Free the main database deletes the old copy there; the data database keeps everything."
                      : mine
                        ? `Copy moves only this module's rows. It can run again safely; anything collected while it runs is collected again on the next run.`
                        : "Copy can run again safely. Anything collected while it runs is collected again on the next run."}
                  </p>
                </div>
              </Panel>

              <Fold title="Switch off or remove" className="mt-4">
                <div className="flex flex-wrap gap-2 pb-4">
                  {onData && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void step("disable", { action: "disable" }, mine ? `Switched off: ${name} uses the shared or main database again.` : "Switched back to the main database.")}>
                      {mine ? "Switch off" : "Switch back to the main database"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void step("remove", { action: "remove" }, mine ? `Removed; ${name} uses the shared or main database.` : "Removed; WorksLake uses the main database.")}>
                    Remove the connection
                  </Button>
                </div>
              </Fold>
            </>
          )}
        </>
      )}
    </>
  );
}
