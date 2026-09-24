"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  FACT_PROVENANCE_LABEL,
  formatRange,
  isEmail,
  isHttpUrl,
  isMonth,
  isPhone,
  normalizeUrl,
  type CareerBullet,
  type CareerContact,
  type CareerHistory,
  type FactProvenance,
} from "@/domain/career/history";
import { newId } from "@/lib/ids";
import { Button } from "@/components/common/Button";
import { Field, Input, Textarea } from "@/components/common/Input";
import { Badge } from "@/components/common/Badge";

/**
 * Edits the career history inside the Career Profile draft — nothing is saved until the page's
 * "Save changes". Every entry keeps where it came from; editing an imported entry marks it
 * confirmed by the candidate.
 */

type FieldSpec = { key: string; label: string; kind: "text" | "month" | "url" | "list" | "lines" | "textarea" | "current"; required?: boolean; hint?: string; wide?: boolean };

const SPECS = {
  experience: {
    title: "Experience",
    add: "Add a role",
    empty: "No roles yet. Add the jobs you want on your résumé — employer, title and dates are enough to start.",
    fields: [
      { key: "title", label: "Job title", kind: "text", required: true },
      { key: "employer", label: "Employer", kind: "text", required: true },
      { key: "location", label: "Location", kind: "text" },
      { key: "startDate", label: "Started", kind: "month", required: true, hint: "YYYY-MM" },
      { key: "endDate", label: "Ended", kind: "month", hint: "YYYY-MM" },
      { key: "current", label: "I work here now", kind: "current" },
      { key: "summary", label: "Role summary", kind: "textarea", wide: true },
      { key: "bullets", label: "Achievements and responsibilities", kind: "lines", wide: true, hint: "One per line. Only what you actually did — Wonder never adds numbers you didn't give." },
    ],
  },
  education: {
    title: "Education",
    add: "Add education",
    empty: "No education added.",
    fields: [
      { key: "institution", label: "Institution", kind: "text", required: true },
      { key: "degree", label: "Degree", kind: "text" },
      { key: "field", label: "Field of study", kind: "text" },
      { key: "location", label: "Location", kind: "text" },
      { key: "startDate", label: "Started", kind: "month", hint: "YYYY or YYYY-MM" },
      { key: "endDate", label: "Finished", kind: "month", hint: "YYYY or YYYY-MM" },
      { key: "honors", label: "Honours", kind: "list", wide: true, hint: "Comma-separated" },
    ],
  },
  certifications: {
    title: "Certifications",
    add: "Add a certification",
    empty: "No certifications added.",
    fields: [
      { key: "name", label: "Certification", kind: "text", required: true },
      { key: "issuer", label: "Issuer", kind: "text" },
      { key: "issueDate", label: "Issued", kind: "month", hint: "YYYY-MM" },
      { key: "expiryDate", label: "Expires", kind: "month", hint: "YYYY-MM" },
      { key: "credentialId", label: "Credential ID", kind: "text" },
      { key: "url", label: "Verification link", kind: "url" },
    ],
  },
  projects: {
    title: "Projects",
    add: "Add a project",
    empty: "No projects added.",
    fields: [
      { key: "name", label: "Project", kind: "text", required: true },
      { key: "url", label: "Link", kind: "url" },
      { key: "description", label: "Description", kind: "textarea", wide: true },
      { key: "technologies", label: "Technologies", kind: "list", wide: true, hint: "Comma-separated" },
      { key: "bullets", label: "Highlights", kind: "lines", wide: true, hint: "One per line" },
    ],
  },
  publications: {
    title: "Publications",
    add: "Add a publication",
    empty: "No publications added.",
    fields: [
      { key: "title", label: "Title", kind: "text", required: true },
      { key: "publication", label: "Published in", kind: "text" },
      { key: "date", label: "Date", kind: "month", hint: "YYYY or YYYY-MM" },
      { key: "authors", label: "Authors", kind: "list", wide: true, hint: "Comma-separated" },
      { key: "url", label: "Link", kind: "url" },
    ],
  },
} satisfies Record<string, { title: string; add: string; empty: string; fields: FieldSpec[] }>;

type ListKey = keyof typeof SPECS;
type Entry = Record<string, unknown> & { id: string; provenance: FactProvenance };

function fieldError(f: FieldSpec, v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (f.required && !s) return "Required";
  if (!s) return undefined;
  if (f.kind === "month" && !isMonth(s)) return "Use YYYY or YYYY-MM";
  if (f.kind === "url" && !isHttpUrl(normalizeUrl(s))) return "Not a valid link";
  return undefined;
}

function summaryLine(key: ListKey, e: Entry): { title: string; sub: string } {
  switch (key) {
    case "experience":
      return { title: [e.title, e.employer].filter(Boolean).join(" · ") || "New role", sub: formatRange(e.startDate as string, e.endDate as string, e.current as boolean) };
    case "education":
      return { title: (e.institution as string) || "New education", sub: [e.degree, e.field].filter(Boolean).join(", ") };
    case "certifications":
      return { title: (e.name as string) || "New certification", sub: (e.issuer as string) ?? "" };
    case "projects":
      return { title: (e.name as string) || "New project", sub: ((e.technologies as string[] | undefined) ?? []).join(", ") };
    case "publications":
      return { title: (e.title as string) || "New publication", sub: (e.publication as string) ?? "" };
  }
}

function EntryEditor({ spec, entry, onChange }: { spec: FieldSpec[]; entry: Entry; onChange: (e: Entry) => void }) {
  const edit = (patch: Record<string, unknown>) => onChange({ ...entry, ...patch, provenance: entry.provenance === "RESUME_IMPORTED" || entry.provenance === "LINKEDIN_IMPORTED" ? "USER_CONFIRMED" : entry.provenance });
  const id = (k: string) => `${entry.id}-${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {spec.map((f) => {
        const v = entry[f.key];
        if (f.kind === "current")
          return (
            <label key={f.key} className="flex items-center gap-2 self-end pb-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={!!v} onChange={(e) => edit({ current: e.target.checked, ...(e.target.checked ? { endDate: undefined } : {}) })} /> {f.label}
            </label>
          );
        if (f.kind === "lines") {
          const bullets = (v as CareerBullet[] | undefined) ?? [];
          return (
            <Field key={f.key} label={f.label} hint={f.hint} htmlFor={id(f.key)} className="sm:col-span-2">
              <Textarea
                id={id(f.key)}
                defaultValue={bullets.map((b) => b.text).join("\n")}
                onBlur={(ev) => {
                  const lines = ev.target.value.split("\n").map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim()).filter(Boolean);
                  // A line that didn't change keeps its provenance; a new or rewritten one is the candidate's.
                  const next = lines.map((text) => bullets.find((b) => b.text === text) ?? { id: newId("bul"), text, provenance: "USER_PROVIDED" as const });
                  edit({ [f.key]: next });
                }}
                className="min-h-32"
              />
            </Field>
          );
        }
        const display = f.kind === "list" ? ((v as string[] | undefined) ?? []).join(", ") : ((v as string | undefined) ?? "");
        const err = f.kind === "list" ? undefined : fieldError(f, v);
        const common = {
          id: id(f.key),
          defaultValue: display,
          onBlur: (ev: { target: { value: string } }) => {
            const raw = ev.target.value;
            const value = f.kind === "list" ? raw.split(",").map((x) => x.trim()).filter(Boolean) : f.kind === "url" && raw.trim() ? normalizeUrl(raw) : raw.trim() || undefined;
            edit({ [f.key]: value });
          },
        };
        return (
          <Field key={f.key} label={f.label} hint={f.hint} htmlFor={id(f.key)} required={f.required} error={err && display ? err : undefined} className={f.wide ? "sm:col-span-2" : undefined}>
            {f.kind === "textarea" ? <Textarea {...common} className="min-h-20" /> : <Input {...common} disabled={f.key === "endDate" && !!entry.current} placeholder={f.kind === "month" ? "2023-04" : undefined} />}
          </Field>
        );
      })}
    </div>
  );
}

function EntryList({ listKey, entries, onChange }: { listKey: ListKey; entries: Entry[]; onChange: (e: Entry[]) => void }) {
  const spec = SPECS[listKey];
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby={`hist-${listKey}`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`hist-${listKey}`} className="text-[14px] font-semibold text-ink">
          {spec.title}
        </h3>
        <Button
          size="sm"
          variant="outline"
          icon={<Plus className="size-3.5" aria-hidden />}
          onClick={() => {
            const e: Entry = { id: newId(listKey.slice(0, 3)), provenance: "USER_PROVIDED", ...(listKey === "experience" ? { bullets: [] } : {}) };
            onChange([e, ...entries]);
            setOpen(e.id);
          }}
        >
          {spec.add}
        </Button>
      </div>
      {entries.length === 0 && <p className="text-[12px] text-ink-4">{spec.empty}</p>}
      <ul className="flex flex-col gap-2">
        {entries.map((e) => {
          const s = summaryLine(listKey, e);
          const missing = spec.fields.some((f) => f.required && !String(e[f.key] ?? "").trim());
          return (
            <li key={e.id} className="rounded-[14px] border border-line">
              <div className="flex items-center gap-2 p-3">
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink">{s.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {s.sub}
                      {missing && <span className="text-warning-600"> · needs details</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge className="hidden sm:inline-flex">{FACT_PROVENANCE_LABEL[e.provenance]}</Badge>
                    {open === e.id ? <ChevronUp className="size-4 text-ink-3" aria-hidden /> : <ChevronDown className="size-4 text-ink-3" aria-hidden />}
                  </span>
                </button>
                <button type="button" aria-label={`Remove ${s.title}`} onClick={() => onChange(entries.filter((x) => x.id !== e.id))} className="rounded-[8px] p-1.5 text-ink-3 hover:bg-bg-soft hover:text-danger-600">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              {open === e.id && (
                <div className="border-t border-line p-3">
                  <EntryEditor spec={spec.fields} entry={e} onChange={(next) => onChange(entries.map((x) => (x.id === e.id ? next : x)))} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CONTACT: { key: keyof CareerContact; label: string; check?: (v: string) => boolean; type?: string; placeholder?: string }[] = [
  { key: "email", label: "Email", check: isEmail, type: "email" },
  { key: "phone", label: "Phone", check: isPhone, type: "tel" },
  { key: "location", label: "Location", placeholder: "City, Country" },
  { key: "linkedinUrl", label: "LinkedIn", check: (v) => isHttpUrl(normalizeUrl(v)), placeholder: "linkedin.com/in/you" },
  { key: "portfolioUrl", label: "Portfolio", check: (v) => isHttpUrl(normalizeUrl(v)) },
  { key: "websiteUrl", label: "Website", check: (v) => isHttpUrl(normalizeUrl(v)) },
];

export function CareerHistoryEditor({ value, onChange }: { value: CareerHistory; onChange: (h: CareerHistory) => void }) {
  const setContact = (k: keyof CareerContact, v: string) => {
    const t = v.trim();
    const norm = t && (k === "linkedinUrl" || k === "portfolioUrl" || k === "websiteUrl") ? normalizeUrl(t) : t;
    onChange({ ...value, contact: { ...value.contact, [k]: norm || undefined } });
  };
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="hist-contact">
        <h3 id="hist-contact" className="mb-2 text-[14px] font-semibold text-ink">
          Contact and links
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTACT.map((c) => {
            const v = value.contact[c.key] ?? "";
            return (
              <Field key={c.key} label={c.label} htmlFor={`contact-${c.key}`} error={v && c.check && !c.check(v) ? `Not a valid ${c.label.toLowerCase()}` : undefined}>
                <Input id={`contact-${c.key}`} type={c.type ?? "text"} defaultValue={v} placeholder={c.placeholder} onBlur={(e) => setContact(c.key, e.target.value)} autoComplete="off" />
              </Field>
            );
          })}
        </div>
      </section>
      <Field label="Professional summary" hint="In your words. Résumés show it as written." htmlFor="hist-summary">
        <Textarea id="hist-summary" defaultValue={value.summary ?? ""} onBlur={(e) => onChange({ ...value, summary: e.target.value.trim() || undefined })} className="min-h-24" />
      </Field>
      {(Object.keys(SPECS) as ListKey[]).map((k) => (
        <EntryList key={k} listKey={k} entries={value[k] as unknown as Entry[]} onChange={(list) => onChange({ ...value, [k]: list })} />
      ))}
      <Field label="Research interests" hint="Comma-separated. Used by the Academic / Research template." htmlFor="hist-research">
        <Input id="hist-research" defaultValue={value.researchInterests.join(", ")} onBlur={(e) => onChange({ ...value, researchInterests: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
      </Field>
    </div>
  );
}
