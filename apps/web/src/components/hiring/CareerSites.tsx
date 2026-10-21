"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import type { CareerSite } from "@/domain/org/careers";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";

/**
 * Career sites: outside careers pages (WonderID's landing page, other apps) that show this workspace's jobs and
 * take applications. An Owner adds a site and copies its key — shown once — into that app's server settings;
 * revoking a site stops its key at once. Linking a job to a site is on each job's row.
 */
export function CareerSites({ orgId, sites, canManage, onChange }: { orgId: string; sites: CareerSite[]; canManage: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<{ site: string; key: string } | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      const r = await hiringApi.createSite(orgId, name, url);
      setKey({ site: r.site.name, key: r.key });
      setName("");
      setUrl("");
      onChange();
    } catch (e) {
      toast.error("Couldn't add the career site", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (s: CareerSite) => {
    if (!confirm(`Revoke ${s.name}? Its key stops working now and its jobs disappear from that page. Applications already received stay here.`)) return;
    try {
      await hiringApi.revokeSite(orgId, s.id);
      onChange();
    } catch (e) {
      toast.error("Couldn't revoke it", (e as Error).message);
    }
  };
  return (
    <Fold title="Career sites" hint={sites.length ? `${sites.length} connected: ${sites.map((s) => s.name).join(", ")}` : "Show your jobs on your own careers page and take applications there"} className="mb-4">
      {sites.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {sites.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{s.name}</span> <span className="text-ink-3">· {s.publicUrl} · key …{s.keyHint}</span>
              </span>
              {canManage && (
                <button type="button" onClick={() => revoke(s)} className="min-h-10 text-ink-4 hover:text-danger-600">
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {key && (
        <div role="status" className="mb-3 rounded-[12px] border border-brand-500/40 bg-brand-50 p-3 text-[13px] text-ink">
          <p className="font-semibold">Key for {key.site} — copy it now, it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-[12px]">{key.key}</code>
            <Button size="sm" variant="secondary" icon={<Copy className="size-4" aria-hidden />} onClick={() => navigator.clipboard.writeText(key.key).then(() => toast.success("Key copied"))}>
              Copy
            </Button>
          </div>
          <p className="mt-2 text-ink-3">Paste it into that app&apos;s settings (for WonderID: Platform console → Careers). Never into a web page.</p>
        </div>
      )}
      {canManage ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Field label="Name" htmlFor="cs-name">
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="WonderID careers" />
          </Field>
          <Field label="Careers page address" htmlFor="cs-url">
            <Input id="cs-url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={300} placeholder="https://id.wonderapps.biz/careers" />
          </Field>
          <Button onClick={create} loading={busy} disabled={!name.trim() || !url.trim()}>
            Add site
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">An Owner adds career sites.</p>
      )}
    </Fold>
  );
}
