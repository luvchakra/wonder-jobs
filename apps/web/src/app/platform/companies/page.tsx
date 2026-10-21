"use client";
import { useCallback, useEffect, useState } from "react";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { PageTitle } from "@/components/jobslake/ui";
import { toast } from "@/components/feedback/Toast";

type Company = { id: string; name: string; website?: string; verified: boolean; createdAt: string; owners: string[]; openJobs: number };

/**
 * Hiring workspaces (companies) and whether WonderJobs has verified them. Unverified ones come first. Before
 * verifying, check the website is the company's, that it is a registered business, and that an Owner works
 * there; verifying emails its Owners.
 */
export default function CompaniesAdminPage() {
  const [list, setList] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/companies", { cache: "no-store" })
      .then(async (r) => (r.ok ? setList((await r.json()).companies) : setError("Couldn't load companies.")))
      .catch(() => setError("Couldn't load companies."));
  }, []);
  useEffect(load, [load]);

  const set = async (c: Company, verified: boolean) => {
    setBusy(c.id);
    try {
      const r = await fetch("/api/admin/companies", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, verified }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Couldn't change it.");
      toast.success(verified ? `${c.name} is verified` : `${c.name} is no longer verified`, verified ? (body.emailed ? "Its Owners were emailed." : "Its Owners couldn't be emailed (no email set up or no Owner email).") : undefined);
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle title="Companies" subtitle="Before verifying, check the website is the company's own, it's a registered business (MCA, GST or similar), and an Owner works there. Verifying emails the Owners." />
      {error && <p className="text-[13px] text-danger-600">{error}</p>}
      {!list && !error && <p className="text-[13px] text-ink-3">Loading…</p>}
      {list && list.length === 0 && <p className="text-[13px] text-ink-3">No hiring workspaces yet.</p>}
      {list && list.length > 0 && (
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <p className="truncate text-[15px] font-semibold text-ink">{c.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                      {c.website.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "no website"
                  )}
                  {` · Owners: ${c.owners.join(", ") || "none with an email"} · ${c.openJobs} open jobs · created ${relativeTime(c.createdAt)}`}
                </p>
              </div>
              <Badge tone={c.verified ? "success" : "warning"}>{c.verified ? "Verified" : "Not verified"}</Badge>
              <Button size="sm" variant={c.verified ? "ghost" : "primary"} onClick={() => set(c, !c.verified)} loading={busy === c.id} disabled={busy !== null}>
                {c.verified ? "Unverify" : "Verify"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
