"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { Badge } from "@/components/common/Badge";
import type { OrgRole } from "@/domain/org/types";
import { OwnerWorkspace, useWorkspaces } from "@/wonderworks/owner/Workspace";
import { call } from "@/wonderworks/api";
import { CURRENCIES, FOCUS, LANGUAGES, MAX_FOCUS, MODE_LABEL, MODES, feeLabel, modesLabel, type Mode, type TherapistPosting } from "../domain";

type Data = { listings: TherapistPosting[]; role?: OrgRole };
const POSTING_LABEL: Record<TherapistPosting["status"], string> = { draft: "Draft", open: "Open", closed: "Closed" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/**
 * Therapists → List yourself: a hiring workspace's practitioner listings, on WonderWorks' owner side
 * (wonderworks/owner/Workspace.tsx, Hiring's layout). The same workspace and roles as Hiring (domain/org/permissions.ts::can,
 * checked again on the server for every action); its own form and its own data. Open listings are the WonderWorks
 * practitioners source in clients' searches. The form has no licence, qualification or outcome field: those wait for legal review.
 */
export function TherapistsCompany() {
  const workspaces = useWorkspaces();
  const { ws, may } = workspaces;
  const org = ws?.org.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TherapistPosting | "new" | null>(null);

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/therapists/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: TherapistPosting["status"]) => {
    try {
      await call(`/api/m/therapists/org/${encodeURIComponent(org!)}`, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };

  return (
    <OwnerWorkspace
      module="Therapists"
      intro="For counsellors and clinics: list yourself so clients find you on WonderWorks, in your own words."
      noWorkspace="Create one for your practice in Hiring, then list yourself here."
      state={{ ...workspaces, error: workspaces.error ?? error }}
      loaded={!!data}
      tabs={[{ value: "listings" as const, label: "Listings" }]}
      tab="listings"
      onTab={() => undefined}
    >
      {data && (
        <section aria-label="Listings">
          {may("jobs.edit") && (
            <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              List yourself
            </Button>
          )}
          <p className="mb-3 text-[12px] text-ink-3">Open listings show in clients&apos; searches with your practice&apos;s name. WonderWorks does not check licences or qualifications, and the page says so.</p>
          {data.listings.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No listings yet.{may("jobs.edit") ? " List yourself: clients see it once you open it." : ""}</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.listings.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate text-[12px] text-ink-3">{[modesLabel(p.terms.modes), feeLabel(p.terms), p.terms.languages?.join(", ")].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Badge tone={p.status === "open" ? "success" : "neutral"}>{POSTING_LABEL[p.status]}</Badge>
                  {may("jobs.edit") && (
                    <div className="flex gap-3 text-[13px] font-medium">
                      <button type="button" className="min-h-10 text-brand-600 hover:underline" onClick={() => setForm(p)}>
                        Edit
                      </button>
                      {p.status !== "open" ? (
                        <button type="button" className="min-h-10 text-success-600 hover:underline" onClick={() => void setStatus(p.id, "open")}>
                          Open
                        </button>
                      ) : (
                        <button type="button" className="min-h-10 text-ink-3 hover:text-ink" onClick={() => void setStatus(p.id, "closed")}>
                          Close
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {form && org && (
        <ListingForm
          orgId={org}
          posting={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </OwnerWorkspace>
  );
}

function ListingForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: TherapistPosting | null; onClose: () => void; onSaved: () => void }) {
  const t = p?.terms;
  const [title, setTitle] = useState(p?.title ?? "");
  const [description, setDescription] = useState(p?.description ?? "");
  const [modes, setModes] = useState<Mode[]>(t?.modes ?? []);
  const [city, setCity] = useState(p && p.location !== "Online" ? p.location : "");
  const [languages, setLanguages] = useState<string[]>(t?.languages ?? []);
  const [focus, setFocus] = useState<string[]>(t?.focus ?? []);
  const [approaches, setApproaches] = useState(t?.approaches?.join(", ") ?? "");
  const [feeMin, setFeeMin] = useState(t?.feeMin?.toString() ?? "");
  const [feeMax, setFeeMax] = useState(t?.feeMax?.toString() ?? "");
  const [currency, setCurrency] = useState(t?.currency ?? "INR");
  const [minutes, setMinutes] = useState(t?.sessionMinutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const save = async () => {
    setBusy(true);
    try {
      const posting = { title, description, modes, city: city || undefined, languages, focus, approaches: list(approaches), feeMin: num(feeMin), feeMax: num(feeMax), currency, sessionMinutes: num(minutes) };
      const url = `/api/m/therapists/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Saved as a draft", p ? undefined : "Open it when it's ready for clients.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={p ? "Edit listing" : "List yourself"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Headline" htmlFor="tf-title" required>
          <Input id="tf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Counselling for work stress and relationships" />
        </Field>
        <Field label="How you work, in your words" htmlFor="tf-desc" hint="Clients see this as written by you. WonderWorks does not check it." required>
          <Textarea id="tf-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="How you meet" required>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <Chip key={m} active={modes.includes(m)} onClick={() => setModes((x) => toggle(x, m))}>
                {MODE_LABEL[m]}
              </Chip>
            ))}
          </div>
        </Field>
        {modes.includes("in_person") && (
          <Field label="City" htmlFor="tf-city" required>
            <Input id="tf-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
          </Field>
        )}
        <Field label="Languages" required>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <Chip key={l} active={languages.includes(l)} onClick={() => setLanguages((x) => toggle(x, l))}>
                {l}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={`What you work with (up to ${MAX_FOCUS})`} required>
          <div className="flex flex-wrap gap-2">
            {FOCUS.map((f) => (
              <Chip key={f} active={focus.includes(f)} onClick={() => setFocus((x) => (x.includes(f) || x.length < MAX_FOCUS ? toggle(x, f) : x))}>
                {f}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Ways of working" htmlFor="tf-appr" hint="Optional. Separate with commas, e.g. CBT, family systems">
          <Input id="tf-appr" value={approaches} onChange={(e) => setApproaches(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Fee from" htmlFor="tf-min" required>
            <Input id="tf-min" inputMode="numeric" value={feeMin} onChange={(e) => setFeeMin(e.target.value)} />
          </Field>
          <Field label="Up to" htmlFor="tf-max" hint="Optional">
            <Input id="tf-max" inputMode="numeric" value={feeMax} onChange={(e) => setFeeMax(e.target.value)} />
          </Field>
          <Field label="Currency" htmlFor="tf-cur">
            <Select id="tf-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Session length in minutes" htmlFor="tf-len" hint="Optional">
          <Input id="tf-len" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="50" />
        </Field>
      </div>
    </Modal>
  );
}
