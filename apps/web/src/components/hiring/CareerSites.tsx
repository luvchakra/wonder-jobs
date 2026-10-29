"use client";
import { useState } from "react";
import { AlertTriangle, Copy, Plus } from "lucide-react";
import { RETENTION_CHOICES, toSlug, type CareerSite } from "@/domain/org/careers";
import { hiringApi, type SiteSettings } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * Career sites: outside careers pages (WonderID's landing page, other apps) that show this workspace's jobs and
 * take applications. Each site names where its applications are emailed and how long they are kept before
 * they're deleted (DPDP / GDPR). An Owner adds a site and copies its key, shown once, into that app's settings;
 * Edit changes the settings (the key stays); Revoke stops the key at once.
 */
export function CareerSites({ orgId, sites, canManage, onChange }: { orgId: string; sites: CareerSite[]; canManage: boolean; onChange: () => void }) {
  const [form, setForm] = useState<{ site?: CareerSite } | null>(null);
  const [key, setKey] = useState<{ site: string; key: string } | null>(null);
  const incomplete = sites.filter((s) => !s.notifyEmails.length || !s.retentionMonths);

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
    <Fold title="Career sites" hint={sites.length ? `${sites.length} connected: ${sites.map((s) => s.name).join(", ")}` : "Show your jobs on your own careers page and take applications there"} open={incomplete.length > 0 && canManage} className="mb-4">
      {incomplete.length > 0 && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-[12px] border border-warning-600/30 bg-warning-100/40 px-3 py-2 text-[13px] text-ink-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-600" aria-hidden />
          <span>
            {incomplete.map((s) => s.name).join(", ")} {incomplete.length === 1 ? "needs" : "need"} an applications email and a retention period. Until then, applications are emailed to everyone who can decide and are never deleted.
            {canManage ? " Press Edit to add them." : " An Owner can add them."}
          </span>
        </p>
      )}
      {sites.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {sites.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{s.name}</span>{" "}
                <span className="text-ink-3">
                  ·{" "}
                  {s.slug ? (
                    <a href={s.publicUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                      {s.publicUrl.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    `${s.publicUrl} · your own page · key …${s.keyHint}`
                  )}
                  {s.notifyEmails.length > 0 && ` · applications to ${s.notifyEmails.join(", ")}`}
                  {s.retentionMonths && ` · kept ${s.retentionMonths} months`}
                </span>
              </span>
              {canManage && (
                <span className="flex gap-3">
                  <button type="button" onClick={() => setForm({ site: s })} className="min-h-10 font-medium text-brand-600 hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => revoke(s)} className="min-h-10 text-ink-4 hover:text-danger-600">
                    Revoke
                  </button>
                </span>
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
        <Button variant="outline" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm({})}>
          Add a career site
        </Button>
      ) : (
        <p className="text-[13px] text-ink-3">An Owner adds and edits career sites.</p>
      )}
      {form && (
        <SiteForm
          orgId={orgId}
          site={form.site}
          onClose={() => setForm(null)}
          onSaved={(created) => {
            setForm(null);
            // A hosted page needs no key; only a site on the company's own page gets one to copy.
            if (created && !created.hosted) setKey(created);
            if (created?.hosted) toast.success(`${created.site} is live`, `Tick “On ${created.site}” on each job to show it there.`);
            onChange();
          }}
        />
      )}
    </Fold>
  );
}

/** Add or edit a career site. Every field is required; a new site's key is shown once after saving. */
function SiteForm({ orgId, site, onClose, onSaved }: { orgId: string; site?: CareerSite; onClose: () => void; onSaved: (created?: { site: string; key: string; hosted: boolean }) => void }) {
  const [mode, setMode] = useState<"hosted" | "own">(site && !site.slug ? "own" : "hosted");
  const [v, setV] = useState<SiteSettings>({ name: site?.name ?? "", slug: site?.slug ?? "", publicUrl: site && !site.slug ? site.publicUrl : "", notifyEmails: site?.notifyEmails.join(", ") ?? "", retentionMonths: site?.retentionMonths ?? 12 });
  const hostedBase = `${typeof window === "undefined" ? "https://jobs.wonderapps.biz" : window.location.origin}/careers/`;
  const [busy, setBusy] = useState(false);
  // Shown in the dialog: a toast would sit behind it.
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<SiteSettings>) => {
    setV((x) => ({ ...x, ...p }));
    setError(null);
  };
  const save = async () => {
    setBusy(true);
    const body = mode === "hosted" ? { ...v, slug: v.slug, publicUrl: "" } : { ...v, slug: "" };
    try {
      if (site) {
        await hiringApi.updateSite(orgId, site.id, body);
        toast.success(`${v.name} saved`);
        onSaved();
      } else {
        const r = await hiringApi.createSite(orgId, body);
        onSaved({ site: r.site.name, key: r.key, hosted: mode === "hosted" });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={site ? `Edit ${site.name}` : "Add a career site"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!v.name.trim() || !(mode === "hosted" ? v.slug?.trim() : v.publicUrl.trim()) || !v.notifyEmails.trim()}>
            {site ? "Save" : "Add site"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="cs-name" required>
          <Input id="cs-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="WonderID careers" />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-ink">Where will your careers page be?</legend>
          {(
            [
              ["hosted", "Hosted by WonderWorks", "No code. WonderWorks shows your jobs, the apply form and applicants' status pages at your own address."],
              ["own", "On our own website", "Your developers show the jobs on your site using the WonderWorks careers API, with a key."],
            ] as const
          ).map(([value, label, help]) => (
            <label key={value} className={`flex cursor-pointer gap-3 rounded-[12px] border px-3 py-2.5 ${mode === value ? "border-brand-500 bg-brand-50" : "border-line"}`}>
              <input type="radio" name="cs-mode" value={value} checked={mode === value} onChange={() => (setMode(value), setError(null))} className="mt-1 accent-brand-600" />
              <span>
                <span className="block text-[14px] font-medium text-ink">{label}</span>
                <span className="block text-[12px] text-ink-3">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "hosted" ? (
          <Field label="Short company name" htmlFor="cs-slug" required hint={`Your careers page: ${hostedBase}${v.slug || "your-name"}`}>
            <Input id="cs-slug" value={v.slug ?? ""} onChange={(e) => set({ slug: toSlug(e.target.value) || e.target.value.toLowerCase().slice(0, 40) })} maxLength={40} placeholder="acme" autoComplete="off" />
          </Field>
        ) : (
          <>
            <Field label="Careers page address" htmlFor="cs-url" required hint="The page on your site that lists your jobs. Links in applicants' emails are built from it, e.g. https://company.com/careers">
              <Input id="cs-url" value={v.publicUrl} onChange={(e) => set({ publicUrl: e.target.value })} maxLength={300} placeholder="https://company.com/careers" />
            </Field>
            <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
              After saving you get a key for your developers. For the integration guide (the careers API and the pages your site needs), write to connect@wonderapps.biz.
            </p>
          </>
        )}
        <Field label="Applications email" htmlFor="cs-email" required hint="New applications and reminders arrive here. A team address works well; separate several with commas.">
          <Input id="cs-email" type="text" inputMode="email" value={v.notifyEmails} onChange={(e) => set({ notifyEmails: e.target.value })} maxLength={500} placeholder="careers@company.com" />
        </Field>
        <Field label="Keep applications for" htmlFor="cs-retention" required hint="Then they're deleted, with their history, as DPDP and GDPR require. Counted from each application's last update. Applicants are told this when they apply.">
          <Select id="cs-retention" value={String(v.retentionMonths)} onChange={(e) => set({ retentionMonths: Number(e.target.value) })}>
            {RETENTION_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
