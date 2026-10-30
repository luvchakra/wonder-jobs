"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { Badge } from "@/components/common/Badge";
import type { OrgRole } from "@/domain/org/types";
import { OwnerWorkspace, useWorkspaces } from "@/wonderworks/owner/Workspace";
import { call } from "@/wonderworks/api";
import { CURRENCIES, LANE_LABEL, LANE_PRICES, LOCAL_TRADES, materialsLabel, PRICE_KIND_LABEL, priceLabel, REMOTE_FIELDS, warrantyLabel, type Lane, type ServicePosting } from "../domain";

type Data = { listings: ServicePosting[]; role?: OrgRole };
const POSTING_LABEL: Record<ServicePosting["status"], string> = { draft: "Draft", open: "Open", closed: "Closed" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Talent & Services → Offer your services: a hiring workspace's service listings, on WonderWorks' owner side
 * (wonderworks/owner/Workspace.tsx, Hiring's layout). The same workspace and roles as Hiring (domain/org/permissions.ts::can,
 * checked again on the server for every action); its own form and its own data. Open listings are the WonderWorks pros
 * source in clients' searches.
 */
export function ServicesCompany() {
  const workspaces = useWorkspaces();
  const { ws, may } = workspaces;
  const org = ws?.org.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ServicePosting | "new" | null>(null);

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/services/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: ServicePosting["status"]) => {
    try {
      await call(`/api/m/services/org/${encodeURIComponent(org!)}`, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };

  return (
    <OwnerWorkspace
      module="Talent & Services"
      intro="For pros and agencies: list the services clients find on WonderWorks — work at their place or remote projects."
      noWorkspace="Create one for your business in Hiring, then list your services here."
      state={{ ...workspaces, error: workspaces.error ?? error }}
      loaded={!!data}
      tabs={[{ value: "listings" as const, label: "Services" }]}
      tab="listings"
      onTab={() => undefined}
    >
      {data && (
        <section aria-label="Services">
          {may("jobs.edit") && (
            <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              List a service
            </Button>
          )}
          <p className="mb-3 text-[12px] text-ink-3">Open services show up in clients&apos; searches on WonderWorks, with your business&apos;s name.</p>
          {data.listings.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No services yet.{may("jobs.edit") ? " List one: clients see it once you open it." : ""}</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.listings.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate text-[12px] text-ink-3">{[p.terms.category, p.terms.lane ? LANE_LABEL[p.terms.lane] : null, priceLabel(p.terms), warrantyLabel(p.terms.warrantyDays)].filter(Boolean).join(" · ")}</p>
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
        <ServiceForm
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

type FormState = { title: string; description: string; lane: Lane; category: string; location: string; areas: string; priceKind: string; priceMin: string; priceMax: string; currency: string; visitCharge: string; materials: string; warrantyDays: string; turnaroundDays: string; skills: string; gst: boolean };

/** The listing form: one lane at a time, so a local trade never sees "turnaround" and a remote project never sees "visit charge". */
function ServiceForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: ServicePosting | null; onClose: () => void; onSaved: () => void }) {
  const t = p?.terms;
  const [f, setF] = useState<FormState>({
    title: p?.title ?? "",
    description: p?.description ?? "",
    lane: t?.lane ?? "local",
    category: t?.category ?? "",
    location: p && p.location !== "Remote" ? p.location : "",
    areas: t?.areas?.join(", ") ?? "",
    priceKind: t?.priceKind ?? "",
    priceMin: t?.priceMin?.toString() ?? "",
    priceMax: t?.priceMax?.toString() ?? "",
    currency: t?.currency ?? "INR",
    visitCharge: t?.visitCharge?.toString() ?? "",
    materials: t?.materials ?? "",
    warrantyDays: t?.warrantyDays?.toString() ?? "",
    turnaroundDays: t?.turnaroundDays?.toString() ?? "",
    skills: t?.skills?.join(", ") ?? "",
    gst: !!t?.gst,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const local = f.lane === "local";
  const quote = f.priceKind === "quote";
  const save = async () => {
    setBusy(true);
    try {
      const posting = {
        title: f.title,
        description: f.description,
        lane: f.lane,
        category: f.category,
        location: f.location,
        priceKind: f.priceKind || undefined,
        priceMin: quote ? undefined : num(f.priceMin),
        priceMax: quote ? undefined : num(f.priceMax),
        currency: f.currency,
        warrantyDays: num(f.warrantyDays),
        skills: list(f.skills),
        gst: f.gst,
        ...(local ? { areas: list(f.areas), visitCharge: num(f.visitCharge), materials: f.materials || undefined } : { turnaroundDays: num(f.turnaroundDays) }),
      };
      const url = `/api/m/services/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Saved as a draft", p ? undefined : "Open it when it's ready for clients.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const lanes = Object.keys(LANE_LABEL) as Lane[];
  return (
    <Modal open onClose={onClose} title={p ? "Edit service" : "List a service"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Where the work happens" htmlFor="sf-lane" required>
          <Select id="sf-lane" value={f.lane} onChange={(e) => setF((x) => ({ ...x, lane: e.target.value as Lane, category: "", priceKind: "" }))}>
            {lanes.map((l) => (
              <option key={l} value={l}>
                {LANE_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="sf-title" required>
          <Input id="sf-title" value={f.title} onChange={set("title")} placeholder={local ? "Split AC service and gas refill" : "Logo and brand identity"} />
        </Field>
        <Field label="What's included and how you work" htmlFor="sf-desc" required>
          <Textarea id="sf-desc" rows={5} value={f.description} onChange={set("description")} />
        </Field>
        <Field label={local ? "Trade" : "Kind of work"} htmlFor="sf-cat" required>
          <Select id="sf-cat" value={f.category} onChange={set("category")}>
            <option value="">Choose</option>
            {(local ? LOCAL_TRADES : REMOTE_FIELDS).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        {local && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" htmlFor="sf-city" required>
              <Input id="sf-city" value={f.location} onChange={set("location")} placeholder="Pune" />
            </Field>
            <Field label="Areas or pin codes you serve" htmlFor="sf-areas" hint="Separate them with commas" required>
              <Input id="sf-areas" value={f.areas} onChange={set("areas")} placeholder="Kothrud, 411038" />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="How you charge" htmlFor="sf-kind" required>
            <Select id="sf-kind" value={f.priceKind} onChange={set("priceKind")}>
              <option value="">Choose</option>
              {LANE_PRICES[f.lane].map((k) => (
                <option key={k} value={k}>
                  {PRICE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="sf-cur">
            <Select id="sf-cur" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!quote && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price from" htmlFor="sf-min" required>
              <Input id="sf-min" inputMode="numeric" value={f.priceMin} onChange={set("priceMin")} />
            </Field>
            <Field label="Price up to" htmlFor="sf-max">
              <Input id="sf-max" inputMode="numeric" value={f.priceMax} onChange={set("priceMax")} />
            </Field>
          </div>
        )}
        {local ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visit charge" htmlFor="sf-visit" hint="0 for a free visit; blank if you don't say">
              <Input id="sf-visit" inputMode="numeric" value={f.visitCharge} onChange={set("visitCharge")} />
            </Field>
            <Field label="Materials" htmlFor="sf-mat">
              <Select id="sf-mat" value={f.materials} onChange={set("materials")}>
                <option value="">Not stated</option>
                <option value="included">{materialsLabel("included")}</option>
                <option value="extra">{materialsLabel("extra")}</option>
              </Select>
            </Field>
          </div>
        ) : (
          <Field label="Days to deliver a typical job" htmlFor="sf-turn">
            <Input id="sf-turn" inputMode="numeric" value={f.turnaroundDays} onChange={set("turnaroundDays")} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Warranty (days)" htmlFor="sf-warranty" hint="Blank if none">
            <Input id="sf-warranty" inputMode="numeric" value={f.warrantyDays} onChange={set("warrantyDays")} />
          </Field>
          <Field label={local ? "Specialities" : "Skills and tools"} htmlFor="sf-skills" hint="Separate them with commas">
            <Input id="sf-skills" value={f.skills} onChange={set("skills")} placeholder={local ? "Split AC, inverter AC" : "Figma, Illustrator"} />
          </Field>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border border-line px-3 py-2.5">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--color-brand-600)]" checked={f.gst} onChange={(e) => setF((x) => ({ ...x, gst: e.target.checked }))} />
          <span className="block text-[14px] font-medium text-ink">I&apos;m GST-registered</span>
        </label>
      </div>
    </Modal>
  );
}
