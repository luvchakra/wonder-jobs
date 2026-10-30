"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { Badge } from "@/components/common/Badge";
import type { OrgRole } from "@/domain/org/types";
import { OwnerWorkspace, useWorkspaces } from "@/wonderworks/owner/Workspace";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { call } from "@/wonderworks/api";
import { BOARDS, COMPANY_NEXT, CURRENCIES, GRADE_LABEL, GRADES, gradesLabel, HOURS_LABEL, payLabel, QUALIFICATIONS, STATUS_LABEL, type Board, type Grade, type TeachingApplicationView, type TeachingPosting, type TeachingStatus } from "../domain";

type Data = { openings: TeachingPosting[]; applications: TeachingApplicationView[]; role?: OrgRole };
const ACTION_LABEL: Partial<Record<TeachingStatus, string>> = { appointed: "Appoint", closed: "Not moving forward" };
const POSTING_LABEL: Record<TeachingPosting["status"], string> = { draft: "Draft", open: "Open", closed: "Closed" };
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * Teaching → School: a hiring workspace's teaching openings and the applications to them, on WonderWorks' owner side
 * (wonderworks/owner/Workspace.tsx, Hiring's layout). The same workspace and roles as Hiring (domain/org/permissions.ts::can,
 * checked again on the server for every action); its own form and its own data.
 */
export function TeachingCompany() {
  const params = useSearchParams();
  const workspaces = useWorkspaces();
  const { ws, may } = workspaces;
  const org = ws?.org.id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TeachingPosting | "new" | null>(null);
  const [tab, setTab] = useState<"openings" | "applications">(params.get("tab") === "applications" ? "applications" : "openings");

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/teaching/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: TeachingPosting["status"]) => {
    try {
      await call(`/api/m/teaching/org/${encodeURIComponent(org!)}`, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };
  const decide = async (id: string, status: TeachingStatus) => {
    try {
      await call(`/api/m/teaching/org/${encodeURIComponent(org!)}/applications/${id}`, { body: { status } });
      toast.success(STATUS_LABEL[status], "The teacher hears it in the app.");
      load();
    } catch (e) {
      toast.error("Couldn't move it", (e as Error).message);
    }
  };

  const tabs = [{ value: "openings" as const, label: "Openings" }, ...(may("applications.view") ? [{ value: "applications" as const, label: "Applications" }] : [])];
  const shown = tabs.some((t) => t.value === tab) ? tab : "openings";
  return (
    <OwnerWorkspace
      module="Teaching"
      intro="For schools, colleges and coaching centres: post teaching jobs teachers find on WonderWorks, and review their applications."
      noWorkspace="Create one for your school in Hiring, then post teaching jobs here."
      state={{ ...workspaces, error: workspaces.error ?? error }}
      loaded={!!data}
      tabs={tabs}
      tab={shown}
      onTab={setTab}
    >
      {data && shown === "openings" && (
        <section aria-label="Openings">
          {may("jobs.edit") && (
            <Button className="mb-4" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              Post a teaching job
            </Button>
          )}
          <p className="mb-3 text-[12px] text-ink-3">Open teaching jobs show up in teachers&apos; searches on WonderWorks, with your school&apos;s name.</p>
          {data.openings.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No teaching jobs yet.{may("jobs.edit") ? " Post one: teachers see it once you open it." : ""}</p>
          ) : (
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {data.openings.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate text-[12px] text-ink-3">{[p.terms.subject, gradesLabel(p.terms.grades), p.terms.hours ? HOURS_LABEL[p.terms.hours] : null, payLabel(p.terms)].filter(Boolean).join(" · ")}</p>
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
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No applications yet. Teachers&apos; applications to your open teaching jobs show here.</p>
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
                      <p className="text-[12.5px] text-ink-2">{[a.profile.subjects.join(", "), gradesLabel(a.profile.grades), a.profile.boards.join(", ")].filter(Boolean).join(" · ")}</p>
                      {a.profile.qualifications.length > 0 && <p className="text-[12px] text-ink-3">Holds {a.profile.qualifications.join(", ")}</p>}
                    </div>
                    <Badge tone={a.status === "appointed" ? "success" : a.status === "demo_class" ? "brand" : a.status === "applied" ? "info" : "neutral"}>{STATUS_LABEL[a.status]}</Badge>
                    {a.hasResume && (
                      <a className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink" href={`/api/m/teaching/org/${encodeURIComponent(org!)}/applications/${a.id}/resume`} aria-label={`${a.name}'s résumé`}>
                        <Download className="size-4" aria-hidden />
                      </a>
                    )}
                  </div>
                  {may("applications.decide") && COMPANY_NEXT[a.status].length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3 text-[13px] font-medium">
                      {COMPANY_NEXT[a.status].map((st, i) => (
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
        <OpeningForm
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

type FormState = { title: string; description: string; location: string; workMode: string; subject: string; grades: Grade[]; boards: Board[]; hours: string; requires: string[]; payMin: string; payMax: string; currency: string; payPer: string };

function OpeningForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: TeachingPosting | null; onClose: () => void; onSaved: () => void }) {
  const t = p?.terms;
  const [f, setF] = useState<FormState>({
    title: p?.title ?? "",
    description: p?.description ?? "",
    location: p?.location ?? "",
    workMode: p?.workMode ?? "",
    subject: t?.subject ?? "",
    grades: t?.grades ?? [],
    boards: t?.boards ?? [],
    hours: t?.hours ?? "",
    requires: t?.requires ?? [],
    payMin: t?.payMin?.toString() ?? "",
    payMax: t?.payMax?.toString() ?? "",
    currency: t?.currency ?? "INR",
    payPer: t?.payPer ?? "month",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const save = async () => {
    setBusy(true);
    try {
      const posting = { title: f.title, description: f.description, location: f.location, workMode: f.workMode || undefined, subject: f.subject, grades: f.grades, boards: f.boards, hours: f.hours || undefined, requires: f.requires, payMin: num(f.payMin), payMax: num(f.payMax), currency: f.currency, payPer: f.payPer };
      const url = `/api/m/teaching/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Posted as a draft", p ? undefined : "Open it when it's ready for teachers.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={p ? "Edit teaching job" : "Post a teaching job"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Title" htmlFor="tf-title" required>
          <Input id="tf-title" value={f.title} onChange={set("title")} placeholder="PGT Physics" />
        </Field>
        <Field label="What and whom the teacher will teach" htmlFor="tf-desc" required>
          <Textarea id="tf-desc" rows={5} value={f.description} onChange={set("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject" htmlFor="tf-subject" required>
            <Input id="tf-subject" value={f.subject} onChange={set("subject")} />
          </Field>
          <Field label="Hours" htmlFor="tf-hours" required>
            <Select id="tf-hours" value={f.hours} onChange={set("hours")}>
              <option value="">Choose</option>
              {Object.entries(HOURS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Online, hybrid or on-site" htmlFor="tf-mode" required>
            <Select id="tf-mode" value={f.workMode} onChange={set("workMode")}>
              <option value="">Choose</option>
              <option value="remote">Online</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </Select>
          </Field>
          <Field label="Where" htmlFor="tf-loc" required={f.workMode !== "remote"}>
            <Input id="tf-loc" value={f.location} onChange={set("location")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Grade levels *</legend>
          <div className="flex flex-wrap gap-1.5">
            {GRADES.map((g) => (
              <Chip key={g} active={f.grades.includes(g)} onClick={() => setF((x) => ({ ...x, grades: toggle(x.grades, g) }))}>
                {GRADE_LABEL[g]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Board</legend>
          <div className="flex flex-wrap gap-1.5">
            {BOARDS.map((b) => (
              <Chip key={b} active={f.boards.includes(b)} onClick={() => setF((x) => ({ ...x, boards: toggle(x.boards, b) }))}>
                {b}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-2">Asks for</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUALIFICATIONS.map((q) => (
              <Chip key={q} active={f.requires.includes(q)} onClick={() => setF((x) => ({ ...x, requires: toggle(x.requires, q) }))}>
                {q}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pay (optional)" htmlFor="tf-pmin">
            <Input id="tf-pmin" inputMode="numeric" value={f.payMin} onChange={set("payMin")} />
          </Field>
          <Field label="Up to (optional)" htmlFor="tf-pmax">
            <Input id="tf-pmax" inputMode="numeric" value={f.payMax} onChange={set("payMax")} />
          </Field>
          <Field label="Currency" htmlFor="tf-cur">
            <Select id="tf-cur" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Per" htmlFor="tf-per">
            <Select id="tf-per" value={f.payPer} onChange={set("payPer")}>
              <option value="month">Month</option>
              <option value="hour">Hour</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
