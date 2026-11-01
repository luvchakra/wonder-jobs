"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import type { OrgRole } from "@/domain/org/types";
import { OwnerWorkspace, useWorkspaces } from "@/wonderworks/owner/Workspace";
import { Badge } from "@/components/common/Badge";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { call } from "@/wonderworks/api";
import { CATEGORIES, CURRENCIES, deadlineLabel, KIND_LABEL, LEVEL_LABEL, LEVELS, PROVIDER_LABEL, PROVIDER_TYPES, PROVIDER_NEXT, STATUS_LABEL, valueLabel, type Kind, type Level, type Question, type ScholarshipApplicationView, type ScholarshipPosting, type ScholarshipStatus } from "../domain";

type Data = { listings: ScholarshipPosting[]; applications: ScholarshipApplicationView[]; role?: OrgRole };

const ACTION_LABEL: Partial<Record<ScholarshipStatus, string>> = { shortlisted: "Shortlist", accepted: "Award / select", done: "Mark completed", declined: "Not selected" };
const POSTING_LABEL: Record<ScholarshipPosting["status"], string> = { draft: "Draft", open: "Open", closed: "Closed" };

/**
 * Scholarships & Projects → Organisation: a workspace's scholarships and projects and the applications to them, in
 * Hiring's own layout (the workspace's name and your role, the picker, underline tabs). The same workspace and roles as
 * Hiring (domain/org/permissions.ts::can, checked again on the server for every action); its own form and data.
 */
export function ScholarshipsCompany() {
  const params = useSearchParams();
  const workspaces = useWorkspaces();
  const { ws, may } = workspaces;
  const org = ws?.org.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ScholarshipPosting | "new" | null>(null);
  const [tab, setTab] = useState<"listings" | "applications">(params.get("tab") === "applications" ? "applications" : "listings");

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/scholarships/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: ScholarshipPosting["status"]) => {
    try {
      await call(`/api/m/scholarships/org/${encodeURIComponent(org!)}`, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };
  const decide = async (id: string, status: ScholarshipStatus) => {
    try {
      await call(`/api/m/scholarships/org/${encodeURIComponent(org!)}/applications/${id}`, { body: { status } });
      toast.success(STATUS_LABEL[status], "The student hears it in the app.");
      load();
    } catch (e) {
      toast.error("Couldn't move it", (e as Error).message);
    }
  };

  const tabs = [{ value: "listings" as const, label: "Scholarships & projects" }, ...(may("applications.view") ? [{ value: "applications" as const, label: "Applications" }] : [])];
  const shown = tabs.some((t) => t.value === tab) ? tab : "listings";
  return (
    <OwnerWorkspace
      module="Scholarships & Projects"
      intro="For foundations, companies, universities and labs: post scholarships and projects students find on WonderWorks, and review applications. Applying is always free."
      noWorkspace="Create one for your organisation in Hiring, then post scholarships and projects here."
      state={{ ...workspaces, error: workspaces.error ?? error }}
      loaded={!!data}
      tabs={tabs}
      tab={shown}
      onTab={setTab}
    >
      {data && shown === "listings" && (
        <section aria-label="Scholarships and projects">
          {may("jobs.edit") && (
            <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              Post a scholarship or project
            </Button>
          )}
          <p className="mb-3 text-[12px] text-ink-3">Open listings show up in students&apos; searches until their deadline, with your organisation&apos;s name.</p>
          {data.listings.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">Nothing posted yet.{may("jobs.edit") ? " Post one: students see it once you open it." : ""}</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.listings.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate text-[12px] text-ink-3">{[KIND_LABEL[p.terms.kind], valueLabel(p.terms), deadlineLabel(p.terms)].join(" · ")}</p>
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
      {data && shown === "applications" && (
        <section aria-label="Applications">
          {data.applications.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No applications yet. Students&apos; applications to your open listings show here.</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.applications.map((a) => (
                <li key={a.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{a.name}</p>
                      <p className="truncate text-[12px] text-ink-3">
                        {a.postingTitle} · applied {relativeTime(a.appliedAt)}
                      </p>
                      <p className="text-[12.5px] text-ink-2">
                        {[a.profile.level ? LEVEL_LABEL[a.profile.level] : null, a.profile.field, a.profile.institution, a.profile.region, a.profile.marks !== undefined ? `${a.profile.marks}%` : null].filter(Boolean).join(" · ")}
                      </p>
                      {(a.profile.incomeBand !== undefined || a.profile.gender || a.profile.category) && <p className="text-[12px] text-ink-3">Shared by the student for this application: {[a.profile.incomeBand !== undefined ? `family income ${a.profile.incomeBand.toLocaleString("en-IN")} a year` : null, a.profile.gender, a.profile.category].filter(Boolean).join(" · ")}</p>}
                      {a.answers.map((x) => (
                        <p key={x.question} className="mt-1 text-[12.5px] text-ink-2">
                          <span className="text-ink-4">{x.question}</span> {x.answer}
                        </p>
                      ))}
                      {a.statement && <p className="mt-1 whitespace-pre-line text-[12.5px] text-ink-2">{a.statement}</p>}
                    </div>
                    <Badge tone={a.status === "accepted" || a.status === "done" ? "success" : a.status === "shortlisted" ? "brand" : a.status === "applied" ? "info" : "neutral"}>{STATUS_LABEL[a.status]}</Badge>
                    {a.hasResume && (
                      <a className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink" href={`/api/m/scholarships/org/${encodeURIComponent(org!)}/applications/${a.id}/resume`} aria-label={`${a.name}'s résumé`}>
                        <Download className="size-4" aria-hidden />
                      </a>
                    )}
                  </div>
                  {may("applications.decide") && PROVIDER_NEXT[a.status].length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3 text-[13px] font-medium">
                      {PROVIDER_NEXT[a.status].map((st, i) => (
                        <button key={st} type="button" className={cn("min-h-10 hover:underline", i === 0 ? "text-brand-600" : "text-ink-3 hover:text-ink")} onClick={() => void decide(a.id, st)}>
                          {ACTION_LABEL[st]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {form && org && (
        <PostingForm
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

type FormState = {
  kind: Kind;
  title: string;
  description: string;
  levels: Level[];
  fields: string;
  region: string;
  deadline: string;
  officialUrl: string;
  currency: string;
  documents: string;
  providerType: string;
  awardAmount: string;
  awardPeriod: string;
  renewable: boolean;
  minMarks: string;
  incomeLimit: string;
  gender: string;
  categories: string[];
  workMode: string;
  location: string;
  durationWeeks: string;
  stipend: string;
  teamSize: string;
  deliverable: string;
  mentor: string;
  certificate: boolean;
  skills: string;
  questions: Question[];
  noFee: boolean;
};

const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));

function PostingForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: ScholarshipPosting | null; onClose: () => void; onSaved: () => void }) {
  const t = p?.terms;
  const [f, setF] = useState<FormState>({
    kind: t?.kind ?? "scholarship",
    title: p?.title ?? "",
    description: p?.description ?? "",
    levels: t?.levels ?? [],
    fields: t?.fields?.join(", ") ?? "",
    region: t?.region ?? "",
    deadline: t?.deadline ?? "",
    officialUrl: t?.officialUrl ?? "",
    currency: t?.currency ?? "INR",
    documents: t?.documents?.join(", ") ?? "",
    providerType: t?.providerType ?? "",
    awardAmount: t?.awardAmount?.toString() ?? "",
    awardPeriod: t?.awardPeriod ?? "",
    renewable: !!t?.renewable,
    minMarks: t?.minMarks?.toString() ?? "",
    incomeLimit: t?.incomeLimit?.toString() ?? "",
    gender: t?.gender ?? "",
    categories: t?.categories ?? [],
    workMode: p?.workMode ?? "",
    location: p?.location ?? "",
    durationWeeks: t?.durationWeeks?.toString() ?? "",
    stipend: t?.stipend?.toString() ?? "",
    teamSize: t?.teamSize?.toString() ?? "",
    deliverable: t?.deliverable ?? "",
    mentor: t?.mentor ?? "",
    certificate: !!t?.certificate,
    skills: p?.skills.join(", ") ?? "",
    questions: p?.questions ?? [],
    noFee: !!p,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const scholarship = f.kind === "scholarship";
  const save = async () => {
    setBusy(true);
    try {
      const common = { kind: f.kind, title: f.title, description: f.description, levels: f.levels, fields: list(f.fields), region: f.region, deadline: f.deadline, officialUrl: f.officialUrl, currency: f.currency, documents: list(f.documents), skills: list(f.skills), questions: f.questions.filter((q) => q.text.trim()), noFee: f.noFee };
      const posting = scholarship
        ? { ...common, providerType: f.providerType || undefined, awardAmount: num(f.awardAmount), awardPeriod: f.awardPeriod || undefined, renewable: f.renewable, minMarks: num(f.minMarks), incomeLimit: num(f.incomeLimit), gender: f.gender || undefined, categories: f.categories, location: f.region }
        : { ...common, workMode: f.workMode || undefined, location: f.location, durationWeeks: num(f.durationWeeks), stipend: num(f.stipend), teamSize: num(f.teamSize), deliverable: f.deliverable, mentor: f.mentor, certificate: f.certificate };
      const url = `/api/m/scholarships/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Posted as a draft", p ? undefined : "Open it when it's ready for students.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleLevel = (l: Level) => setF((x) => ({ ...x, levels: x.levels.includes(l) ? x.levels.filter((y) => y !== l) : [...x.levels, l] }));
  const toggleCategory = (c: string) => setF((x) => ({ ...x, categories: x.categories.includes(c) ? x.categories.filter((y) => y !== c) : [...x.categories, c] }));
  const setQ = (i: number, patch: Partial<Question>) => setF((x) => ({ ...x, questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  return (
    <Modal open onClose={onClose} title={p ? "Edit listing" : "Post a scholarship or project"} footer={<Button full loading={busy} disabled={!f.noFee} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Scholarship or project" htmlFor="sf-kind" required>
          <Select id="sf-kind" value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value as Kind }))}>
            <option value="scholarship">Scholarship</option>
            <option value="project">Project</option>
          </Select>
        </Field>
        <Field label="Title" htmlFor="sf-title" required>
          <Input id="sf-title" value={f.title} onChange={set("title")} />
        </Field>
        <Field label={scholarship ? "Who it's for and what it gives" : "What the students will do and learn"} htmlFor="sf-desc" required>
          <Textarea id="sf-desc" rows={5} value={f.description} onChange={set("description")} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-ink">Who can apply *</legend>
          <div className="flex flex-wrap gap-3 text-[13px] text-ink-2">
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.levels.includes(l)} onChange={() => toggleLevel(l)} />
                {LEVEL_LABEL[l]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Last day to apply" htmlFor="sf-deadline" required>
            <Input id="sf-deadline" type="date" value={f.deadline} onChange={set("deadline")} />
          </Field>
          <Field label="Currency" htmlFor="sf-cur" required>
            <Select id="sf-cur" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Official link (your organisation's page about it)" htmlFor="sf-url" required>
          <Input id="sf-url" type="url" placeholder="https://" value={f.officialUrl} onChange={set("officialUrl")} />
        </Field>
        {scholarship ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider" htmlFor="sf-prov" required>
              <Select id="sf-prov" value={f.providerType} onChange={set("providerType")}>
                <option value="">Choose</option>
                {PROVIDER_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {PROVIDER_LABEL[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Award amount" htmlFor="sf-award" required>
              <Input id="sf-award" inputMode="numeric" value={f.awardAmount} onChange={set("awardAmount")} />
            </Field>
            <Field label="Paid" htmlFor="sf-period" required>
              <Select id="sf-period" value={f.awardPeriod} onChange={set("awardPeriod")}>
                <option value="">Choose</option>
                <option value="one_time">One-time</option>
                <option value="per_year">Every year</option>
                <option value="per_month">Every month</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-3 text-[13px] text-ink-2">
              <input type="checkbox" checked={f.renewable} onChange={(e) => setF((x) => ({ ...x, renewable: e.target.checked }))} /> Renewable
            </label>
            <Field label="Minimum marks % (optional)" htmlFor="sf-marks">
              <Input id="sf-marks" inputMode="numeric" value={f.minMarks} onChange={set("minMarks")} />
            </Field>
            <Field label="Family income limit a year (optional)" htmlFor="sf-income">
              <Input id="sf-income" inputMode="numeric" value={f.incomeLimit} onChange={set("incomeLimit")} />
            </Field>
            <Field label="Only for (optional)" htmlFor="sf-gender">
              <Select id="sf-gender" value={f.gender} onChange={set("gender")}>
                <option value="">Any gender</option>
                <option value="female">Female students</option>
                <option value="male">Male students</option>
                <option value="other">Students of another gender</option>
              </Select>
            </Field>
            <Field label="State or country (optional)" htmlFor="sf-region">
              <Input id="sf-region" value={f.region} onChange={set("region")} />
            </Field>
            <fieldset className="col-span-2">
              <legend className="mb-1 text-[13px] font-medium text-ink">Only for these categories (optional)</legend>
              <div className="flex flex-wrap gap-3 text-[13px] text-ink-2">
                {CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={f.categories.includes(c)} onChange={() => toggleCategory(c)} />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Remote, hybrid or on-site" htmlFor="sf-mode" required>
              <Select id="sf-mode" value={f.workMode} onChange={set("workMode")}>
                <option value="">Choose</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </Select>
            </Field>
            <Field label="Where" htmlFor="sf-loc" required={f.workMode !== "remote"}>
              <Input id="sf-loc" value={f.location} onChange={set("location")} />
            </Field>
            <Field label="Duration (weeks)" htmlFor="sf-weeks" required>
              <Input id="sf-weeks" inputMode="numeric" value={f.durationWeeks} onChange={set("durationWeeks")} />
            </Field>
            <Field label="Stipend a month (0 if unpaid)" htmlFor="sf-stipend" required>
              <Input id="sf-stipend" inputMode="numeric" value={f.stipend} onChange={set("stipend")} />
            </Field>
            <Field label="Team size (optional)" htmlFor="sf-team">
              <Input id="sf-team" inputMode="numeric" value={f.teamSize} onChange={set("teamSize")} />
            </Field>
            <Field label="Mentor (optional)" htmlFor="sf-mentor">
              <Input id="sf-mentor" value={f.mentor} onChange={set("mentor")} />
            </Field>
            <Field label="Deliverable (optional)" htmlFor="sf-deliv" className="col-span-2">
              <Input id="sf-deliv" value={f.deliverable} onChange={set("deliverable")} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={f.certificate} onChange={(e) => setF((x) => ({ ...x, certificate: e.target.checked }))} /> Certificate on completion
            </label>
            <Field label="Skills (comma-separated)" htmlFor="sf-skills" className="col-span-2">
              <Input id="sf-skills" value={f.skills} onChange={set("skills")} />
            </Field>
          </div>
        )}
        <Field label="Fields of study (comma-separated, optional)" htmlFor="sf-fields">
          <Input id="sf-fields" value={f.fields} onChange={set("fields")} />
        </Field>
        <Field label="Documents students need (comma-separated, optional)" htmlFor="sf-docs">
          <Input id="sf-docs" value={f.documents} onChange={set("documents")} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-ink">Questions for applicants (up to five, optional)</legend>
          {f.questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2">
              <Input aria-label={`Question ${i + 1}`} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
              <label className="flex shrink-0 items-center gap-1 text-[12px] text-ink-3">
                <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required
              </label>
              <button type="button" aria-label={`Remove question ${i + 1}`} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-bg-soft" onClick={() => setF((x) => ({ ...x, questions: x.questions.filter((_, j) => j !== i) }))}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {f.questions.length < 5 && (
            <button type="button" className="min-h-9 text-[13px] font-medium text-brand-600 hover:underline" onClick={() => setF((x) => ({ ...x, questions: [...x.questions, { id: `q${Date.now().toString(36)}`, text: "", required: false }] }))}>
              Add a question
            </button>
          )}
        </fieldset>
        <label className="flex items-start gap-2 rounded-[12px] bg-bg-soft p-3 text-[13px] text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={f.noFee} onChange={(e) => setF((x) => ({ ...x, noFee: e.target.checked }))} />
          Applying is free: students never pay a fee or share bank or card details to apply.
        </label>
      </div>
    </Modal>
  );
}
