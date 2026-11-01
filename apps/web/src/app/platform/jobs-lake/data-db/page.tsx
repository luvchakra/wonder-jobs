"use client";
import { useState } from "react";
import type { DataDbStatus, StoredDataDb } from "@/server/dataDb";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, PageTitle, Panel, num, useAdmin } from "@/components/jobslake/ui";

type Data = DataDbStatus & { usage: { dbBytes: number } | null; setupSql: string };
const mb = (b: number) => `${Math.round(b / 1048576)} MB`;

/**
 * The optional WorksLake data database (owner, 2026-11-01): a second Supabase project for WorksLake's listings, search
 * cache, H-1B data and gateway listings, so they can't fill the main database. Steps in order: save the connection,
 * run the setup script there, test, copy today's data, switch on, then free the main database's copy.
 */
export default function DataDbPage() {
  const { data, error, reload } = useAdmin<Data>("data-db");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading rows={3} />;
  const saved = data.saved;
  const onData = data.active === "data";
  const tested = saved?.lastTest?.ok === true;

  const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("data-db", { method: "POST", body: JSON.stringify(body) });
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
    toast.success(action === "copy" ? "Copied" : "Main database freed", `${num(total)} rows.`);
    reload();
  };

  return (
    <>
      <PageTitle title="Data database" subtitle="Optional: keep WorksLake's listings, search cache, H-1B data and gateway listings in a second Supabase project, so they can't fill the main database. Accounts, saves and settings always stay in the main one." />
      <Panel title={onData ? `WorksLake data is in the data database${data.usage ? ` · ${mb(data.usage.dbBytes)}` : ""}` : "WorksLake data is in the main database"}>
        <p className="text-[13px] text-ink-3">
          {data.from === "environment" ? "Set by WORKSLAKE_DATA_DB_URL and WORKSLAKE_DATA_DB_KEY in the deployment; the settings below don't apply while those are set." : onData ? `${saved?.url ?? ""} · switched on.` : saved ? `${saved.url} is saved, switched off.` : "No data database yet. Create a Supabase project, then enter its details below."}
        </p>
      </Panel>

      {data.from !== "environment" && (
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
                        <Button size="sm" disabled={!!busy || !tested || !saved.lastCopy} onClick={() => void step("enable", { action: "enable" }, "Switched on: WorksLake now reads and writes the data database.")}>
                          Switch on
                        </Button>
                      </>
                    )}
                    {onData && (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void loop("clear")}>
                        Free the main database
                      </Button>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-4">
                    {onData ? "Free the main database deletes the old copy there; the data database keeps everything." : "Copy can run again safely. Anything collected while it runs is collected again on the next run."}
                  </p>
                </div>
              </Panel>

              <Fold title="Switch back or remove" className="mt-4">
                <div className="flex flex-wrap gap-2 pb-4">
                  {onData && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void step("disable", { action: "disable" }, "Switched back to the main database.")}>
                      Switch back to the main database
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void step("remove", { action: "remove" }, "Removed; WorksLake uses the main database.")}>
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
