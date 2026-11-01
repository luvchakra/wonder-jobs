"use client";
import { useState } from "react";
import type { CareersKeyStatus } from "@/server/careerSite/key";
import type { ConnectionCheck } from "@/server/careerSite/client";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { StatusPill } from "@/components/common/Badge";
import { relativeTime } from "@/lib/format";
import { adminFetch, LoadError, Loading, Note, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

const CHECK_TEXT: Record<ConnectionCheck["state"], string> = { connected: "Connected", wrong_key: "Wrong key (401)", unavailable: "Unavailable", needs_setup: "No key saved" };

/** WonderJobs' own careers page (/careers): the career-site key it calls the careers API with. */
export default function CareersAdminPage() {
  const { data, error, reload } = useAdmin<{ key: CareersKeyStatus }>("careers");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "clear" | "test" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<ConnectionCheck | null>(null);
  const run = async (what: "save" | "clear" | "test", init: RequestInit) => {
    setBusy(what);
    setProblem(null);
    if (what !== "test") setCheck(null);
    const r = await adminFetch<{ key?: CareersKeyStatus; check?: ConnectionCheck }>("careers", init);
    setBusy(null);
    if (!r.ok) return setProblem(r.error.message);
    if (r.data.check) setCheck(r.data.check);
    if (what === "save") setKey("");
    if (r.data.key) void reload();
  };
  const k = data?.key;
  return (
    <>
      <PageTitle title="Career sites" subtitle="The career-site key behind jobs.wonderapps.biz/careers. Encrypted on the server and shown only masked." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {k && (
        <div className="flex max-w-2xl flex-col gap-4">
          <Panel title="Career-site key">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <span className="font-mono text-[13px] text-ink">{k.masked ?? "Not set"}</span>
              <StatusPill tone={k.source === "none" ? "warning" : "success"} label={k.source === "saved" ? `Saved${k.savedAt ? ` ${relativeTime(k.savedAt)}` : ""}` : k.source === "environment" ? "From WONDERJOBS_CAREERS_KEY" : "Not set"} />
            </div>
            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run("save", { method: "PUT", body: JSON.stringify({ key }) });
              }}
            >
              <Field label={k.source === "saved" ? "Replace the key" : "Paste the key"} htmlFor="careers-key" hint="Hiring → Jobs → Career sites → Add a career site → On our own website. It starts with wjcs_ and is shown once.">
                <Input id="careers-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="wjcs_…" />
              </Field>
              {problem && (
                <p role="alert" className="text-[13px] text-danger-600">
                  {problem}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={busy === "save"} disabled={!key.trim()}>
                  Save key
                </Button>
                <Button type="button" size="sm" variant="outline" loading={busy === "test"} disabled={k.source === "none"} onClick={() => void run("test", { method: "POST" })}>
                  Test connection
                </Button>
                {k.source === "saved" && (
                  <Button type="button" size="sm" variant="ghost" loading={busy === "clear"} onClick={() => void run("clear", { method: "DELETE" })}>
                    Clear
                  </Button>
                )}
              </div>
              {check && (
                <p role="status" className="text-[13px] text-ink-2">
                  <StatusPill tone={check.state === "connected" ? "success" : "warning"} label={CHECK_TEXT[check.state]} />
                  {check.state === "connected" && ` ${check.jobs} open position${check.jobs === 1 ? "" : "s"}${check.site ? ` on ${check.site}` : ""}.`}
                </p>
              )}
            </form>
          </Panel>
          <Note>Register https://jobs.wonderapps.biz/careers as the site&apos;s Careers page address. Every save and clear is in the audit log with who, when and the last four characters.</Note>
        </div>
      )}
    </>
  );
}
