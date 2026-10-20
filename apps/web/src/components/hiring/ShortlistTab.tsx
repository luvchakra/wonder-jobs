"use client";
import { useCallback, useEffect, useState } from "react";
import { SHORTLIST_STATUS_LABEL, type ShortlistStatus } from "@/domain/org/types";
import { hiringApi, type ShortlistView } from "@/services/hiring/client";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/common/Badge";
import { toast } from "@/components/feedback/Toast";

const TONE: Record<ShortlistStatus, "neutral" | "brand" | "success" | "warning"> = { shortlisted: "neutral", reported: "brand", interview: "success", passed: "warning" };

/**
 * Recruiters' shortlist and their reports to hiring managers. A recruiter writes the note and reports a candidate;
 * a hiring manager (or owner) reads the report and decides — Interview or Pass. What each person can press comes
 * from their role, and the server checks it again.
 */
export function ShortlistTab({ orgId, canEdit, canDecide, refresh }: { orgId: string; canEdit: boolean; canDecide: boolean; refresh: number }) {
  const [entries, setEntries] = useState<ShortlistView[] | null>(null);
  const [filter, setFilter] = useState<"all" | "reported">(canDecide && !canEdit ? "reported" : "all");
  const load = useCallback(() => {
    hiringApi
      .shortlist(orgId)
      .then((d) => setEntries(d.entries))
      .catch((e: Error) => toast.error("Couldn't load the shortlist", e.message));
  }, [orgId]);
  useEffect(load, [load, refresh]);

  const set = async (e: ShortlistView, patch: { status?: ShortlistStatus; note?: string }) => {
    try {
      await hiringApi.updateShortlist(orgId, e.id, patch);
      load();
    } catch (err) {
      toast.error("Couldn't change it", (err as Error).message);
    }
  };
  const remove = async (e: ShortlistView) => {
    try {
      await hiringApi.removeFromShortlist(orgId, e.id);
      load();
    } catch (err) {
      toast.error("Couldn't remove it", (err as Error).message);
    }
  };

  if (entries === null) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const shown = filter === "reported" ? entries.filter((e) => e.status !== "shortlisted") : entries;
  return (
    <div>
      <div className="mb-3 flex gap-2 text-[13px]">
        {(["all", "reported"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={filter === f ? "rounded-full bg-ink px-3 py-1.5 font-medium text-white" : "rounded-full border border-line px-3 py-1.5 text-ink-2"}>
            {f === "all" ? `All (${entries.length})` : `Reports (${entries.filter((e) => e.status !== "shortlisted").length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">{filter === "reported" ? "No reports yet. Recruiters report shortlisted candidates here for you to decide." : "No one shortlisted yet. Find candidates under Talent."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((e) => (
            <li key={e.id} className="rounded-[16px] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-ink">{e.candidate?.displayName ?? "No longer open to recruiters"}</p>
                  <p className="text-[12px] text-ink-3">{[e.candidate?.headline, e.jobTitle ? `for ${e.jobTitle}` : "", `updated ${relativeTime(e.updatedAt)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <Badge tone={TONE[e.status]}>{SHORTLIST_STATUS_LABEL[e.status]}</Badge>
              </div>
              {e.candidate && e.candidate.skills.length > 0 && <p className="mt-1 text-[12px] text-ink-3">{e.candidate.skills.slice(0, 10).join(" · ")}</p>}
              {canEdit ? (
                <textarea
                  defaultValue={e.note}
                  onBlur={(ev) => ev.target.value !== e.note && set(e, { note: ev.target.value })}
                  rows={2}
                  maxLength={2000}
                  placeholder="Note for hiring managers"
                  aria-label="Note for hiring managers"
                  className="mt-2 w-full rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-500"
                />
              ) : (
                e.note && <p className="mt-2 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{e.note}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 text-[13px] font-medium">
                {canEdit && e.status === "shortlisted" && (
                  <button type="button" onClick={() => set(e, { status: "reported" })} className="min-h-10 text-brand-600 hover:underline">
                    Report to hiring managers
                  </button>
                )}
                {canDecide && e.status !== "shortlisted" && (
                  <>
                    <button type="button" onClick={() => set(e, { status: "interview" })} disabled={e.status === "interview"} className="min-h-10 text-success-600 hover:underline disabled:opacity-50">
                      Interview
                    </button>
                    <button type="button" onClick={() => set(e, { status: "passed" })} disabled={e.status === "passed"} className="min-h-10 text-ink-3 hover:text-ink disabled:opacity-50">
                      Pass
                    </button>
                  </>
                )}
                {canEdit && (
                  <button type="button" onClick={() => remove(e)} className="min-h-10 text-ink-4 hover:text-danger-600">
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
