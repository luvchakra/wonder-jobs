"use client";
import { useState } from "react";
import type { ModerationRow } from "@/server/moderation";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { LoadError, Loading, PageTitle, Panel, adminFetch, num, useAdmin } from "@/components/jobslake/ui";
import { MODULES } from "@/modules/registry";
import { relativeTime } from "@/lib/format";

type Data = { threshold: number; rows: ModerationRow[] };
type Act = "hide" | "ban" | "restore" | "delete";

const REASON: Record<string, string> = { scam: "Scam", spam: "Spam", offensive: "Offensive", illegal: "Illegal", wrong: "Misleading", other: "Other" };
const STATE: Record<string, { label: string; tone: "danger" | "warning" | "neutral" | "success" }> = {
  hidden: { label: "Hidden", tone: "warning" },
  banned: { label: "Banned", tone: "danger" },
  deleted: { label: "Deleted", tone: "neutral" },
  restored: { label: "Shown", tone: "success" },
};
const moduleLabel = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;
const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("moderation", { method: "POST", body: JSON.stringify(body) });

/**
 * Admin → Moderation (owner, 2026-11-03): reported listings in every module and what was decided. Reports past the
 * threshold hide a listing on their own; an admin can hide, ban (with the authority's or regulator's reason), restore,
 * or delete any listing. Who reported is never shown. Every action is audited.
 */
export default function ModerationPage() {
  const { data, error, reload } = useAdmin<Data>("moderation");
  const [threshold, setThreshold] = useState<string | null>(null);
  const [acting, setActing] = useState<{ row: Pick<ModerationRow, "module" | "listingId" | "title" | "posted">; act: Act } | null>(null);
  const [manual, setManual] = useState({ module: "jobs", id: "" });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const t = threshold ?? String(data.threshold);
  return (
    <>
      <PageTitle title="Moderation" subtitle="Reported listings in every module, and what was decided. Who reported a listing is never shown." />
      <div className="flex flex-col gap-4">
        <Panel title="Hide automatically">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await post({ action: "threshold", threshold: Number(t) });
              if (!r.ok) return toast.error("Couldn't save it", r.error.message);
              toast.success("Saved", `A listing is hidden once ${t} different people report it.`);
              setThreshold(null);
              reload();
            }}
          >
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">
              People reporting a listing before it&apos;s hidden
              <Input type="number" min={1} max={100} value={t} onChange={(e) => setThreshold(e.target.value)} className="w-28" />
            </label>
            <Button type="submit" size="sm" disabled={t === String(data.threshold)}>
              Save
            </Button>
          </form>
        </Panel>

        <Panel title="Act on a listing">
          <p className="mb-2 text-[13px] text-ink-3">For a notice from a regulator or authority about a listing nobody reported: its module and its id (from its page&apos;s address).</p>
          <div className="flex flex-wrap items-end gap-2">
            <select value={manual.module} onChange={(e) => setManual({ ...manual, module: e.target.value })} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-[13px]" aria-label="Module">
              {MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Input value={manual.id} onChange={(e) => setManual({ ...manual, id: e.target.value.trim() })} placeholder="Listing id" className="w-64 font-mono text-[13px]" aria-label="Listing id" />
            {(["hide", "ban", "delete"] as const).map((a) => (
              <Button key={a} size="sm" variant={a === "delete" ? "danger" : "outline"} disabled={!manual.id} onClick={() => setActing({ row: { module: manual.module, listingId: manual.id, posted: true }, act: a })}>
                {a === "hide" ? "Hide" : a === "ban" ? "Ban" : "Delete"}
              </Button>
            ))}
          </div>
        </Panel>

        <Panel title={`Reported and acted on (${num(data.rows.length)})`}>
          {data.rows.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-3">Nothing reported yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.rows.map((r) => {
                const shown = !r.action || r.action === "restored";
                return (
                  <li key={`${r.module}:${r.listingId}`} className="flex flex-col gap-1.5 py-3 text-[13px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 font-medium text-ink">{r.title ?? r.listingId}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-ink-3">{moduleLabel(r.module)}</span>
                        {r.action && <Badge tone={STATE[r.action].tone}>{STATE[r.action].label}</Badge>}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-3">
                      {r.reports ? `${num(r.reports)} ${r.reports === 1 ? "person" : "people"} reported it: ${Object.entries(r.reasons).map(([k, n]) => `${REASON[k] ?? k} ${n}`).join(", ")}` : "Not reported"}
                      {r.lastReportAt ? ` · last ${relativeTime(r.lastReportAt)}` : ""}
                      {r.action ? ` · ${STATE[r.action].label} by ${r.by === "reports" ? "reports" : r.by === "owner" ? "its poster" : r.by}${r.at ? ` ${relativeTime(r.at)}` : ""}${r.reason ? `: ${r.reason}` : ""}` : ""}
                      {` · ${r.posted ? "posted on WonderWorks" : "from an outside source"} · `}
                      <span className="font-mono">{r.listingId}</span>
                    </p>
                    {r.action !== "deleted" && (
                      <div className="flex flex-wrap gap-2">
                        {shown && (
                          <Button size="sm" variant="outline" onClick={() => setActing({ row: r, act: "hide" })}>
                            Hide
                          </Button>
                        )}
                        {r.action !== "banned" && (
                          <Button size="sm" variant="outline" onClick={() => setActing({ row: r, act: "ban" })}>
                            Ban
                          </Button>
                        )}
                        {!shown && (
                          <Button size="sm" variant="outline" onClick={() => setActing({ row: r, act: "restore" })}>
                            Show again
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => setActing({ row: r, act: "delete" })}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
      {acting && <ActDialog acting={acting} onClose={() => setActing(null)} onDone={() => (setActing(null), reload())} />}
    </>
  );
}

function ActDialog({ acting, onClose, onDone }: { acting: { row: Pick<ModerationRow, "module" | "listingId" | "title" | "posted">; act: Act }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { row, act } = acting;
  const name = row.title ?? row.listingId;
  const what: Record<Act, { title: string; body: string; button: string }> = {
    hide: { title: `Hide ${name}?`, body: "Nobody sees it in Find until you show it again.", button: "Hide" },
    ban: { title: `Ban ${name}?`, body: "Hidden for good, with the reason on record (e.g. the authority's notice and its reference).", button: "Ban" },
    restore: { title: `Show ${name} again?`, body: "It's back in Find for everyone.", button: "Show again" },
    delete: { title: `Delete ${name}?`, body: row.posted ? "The post goes for good, with every application, request or message on it." : "It comes from an outside source, so it can't be deleted there: it's removed from WonderWorks for good.", button: "Delete" },
  };
  const w = what[act];
  return (
    <Modal
      open
      onClose={onClose}
      title={w.title}
      description={w.body}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={act === "delete" || act === "ban" ? "danger" : "primary"}
            loading={busy}
            disabled={act === "ban" && !reason.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await post({ action: act, module: row.module, id: row.listingId, reason, ...(row.title ? { title: row.title } : {}) });
              setBusy(false);
              if (!r.ok) return toast.error("Couldn't do that", r.error.message);
              toast.success(w.button === "Show again" ? "Shown again" : `${w.button === "Hide" ? "Hidden" : w.button === "Ban" ? "Banned" : "Deleted"}`);
              onDone();
            }}
          >
            {w.button}
          </Button>
        </div>
      }
    >
      {act !== "restore" && (
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Reason{act === "ban" ? " (required)" : " (optional)"}
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={act === "ban" ? "e.g. Notice from the Cyber Cell, ref 123" : ""} />
        </label>
      )}
    </Modal>
  );
}
