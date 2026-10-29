"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Download, Plus } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { can, type OrgPermission } from "@/domain/org/permissions";
import type { OrgRole } from "@/domain/org/types";
import { cn } from "@/lib/cn";
import { call } from "../api";
import { COMPANY_NEXT, CURRENCIES, DURATIONS, durationLabel, shortDate, startLabel, STATUS_LABEL, stipendLabel, type InternshipApplicationView, type InternshipPosting, type InternshipStatus } from "../domain";

type Workspace = { org: { id: string; name: string }; role: OrgRole };
type Data = { internships: InternshipPosting[]; applications: InternshipApplicationView[]; role?: OrgRole };

const ACTION_LABEL: Partial<Record<InternshipStatus, string>> = { shortlisted: "Shortlist", offer: "Make an offer", closed: "Not moving forward" };

/**
 * Internships → Company (WJ-418): a hiring workspace's internships and the applications to them. The same workspace
 * and roles as Hiring (domain/org/permissions.ts::can, checked again on the server for every action); its own screen,
 * its own form and its own data — nothing here touches Jobs' job form or job listings.
 */
export function InternshipsCompany() {
  const params = useSearchParams();
  const [spaces, setSpaces] = useState<Workspace[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(params.get("org"));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<InternshipPosting | "new" | null>(null);

  useEffect(() => {
    call<{ workspaces: Workspace[] }>("/api/hiring")
      .then((r) => setSpaces(r.workspaces.filter((w) => can(w.role, "jobs.view"))))
      .catch((e: Error) => setError(e.message));
  }, []);
  const org = orgId && spaces?.some((w) => w.org.id === orgId) ? orgId : (spaces?.[0]?.org.id ?? null);
  const role = spaces?.find((w) => w.org.id === org)?.role;
  const may = (p: OrgPermission) => can(role, p);

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/internships/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState title="Couldn't load your workspace" body={error} />;
  if (!spaces) return <PageLoading rows={3} />;
  if (!spaces.length) return <EmptyState icon={<Building2 className="size-5" aria-hidden />} title="No hiring workspace yet" body="Create one for your company in Hiring, then post internships here." action={{ label: "Open Hiring", href: "/app/hiring" }} />;
  if (!data) return <PageLoading rows={3} />;

  const setStatus = async (id: string, status: InternshipPosting["status"]) => {
    try {
      await call(`/api/m/internships/org/${encodeURIComponent(org!)}`, { method: "PATCH", body: { id, status } });
      load();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };
  const decide = async (id: string, status: InternshipStatus) => {
    try {
      await call(`/api/m/internships/org/${encodeURIComponent(org!)}/applications/${id}`, { body: { status } });
      toast.success(STATUS_LABEL[status], "The student hears it in the app.");
      load();
    } catch (e) {
      toast.error("Couldn't move it", (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {spaces.length > 1 && (
        <Field label="Workspace" htmlFor="ic-org">
          <Select id="ic-org" value={org ?? ""} onChange={(e) => setOrgId(e.target.value)}>
            {spaces.map((w) => (
              <option key={w.org.id} value={w.org.id}>
                {w.org.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <section aria-label="Internships">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Internships</h2>
          {may("jobs.edit") && (
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              Post an internship
            </Button>
          )}
        </div>
        {data.internships.length === 0 ? (
          <EmptyState title="No internships posted" body="Post one and open it: students find it in Internships." />
        ) : (
          <ul className="space-y-2">
            {data.internships.map((p) => (
              <li key={p.id} className="wj-card flex items-center gap-3 p-3">
                <button type="button" disabled={!may("jobs.edit")} onClick={() => setForm(p)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14.5px] font-semibold text-ink">{p.title}</span>
                  <span className="block text-[12.5px] text-ink-3">
                    {stipendLabel(p.terms)} · {durationLabel(p.terms)} · {startLabel(p.terms)}
                    {p.terms.applyBy ? ` · apply by ${shortDate(p.terms.applyBy)}` : ""}
                  </span>
                </button>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase", p.status === "open" ? "bg-success-100 text-success-600" : "bg-surface-2 text-ink-3")}>{p.status}</span>
                {may("jobs.edit") && (
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(p.id, p.status === "open" ? "closed" : "open")}>
                    {p.status === "open" ? "Close" : "Open"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {may("applications.view") && (
        <section aria-label="Applications">
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Applications</h2>
          {data.applications.length === 0 ? (
            <EmptyState title="No applications yet" body="Students' applications to your open internships show here." />
          ) : (
            <ul className="space-y-2">
              {data.applications.map((a) => (
                <li key={a.id} className="wj-card p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{a.name}</p>
                      <p className="text-[12.5px] text-ink-3">
                        {a.postingTitle} · {STATUS_LABEL[a.status]}
                      </p>
                      <p className="text-[12.5px] text-ink-2">
                        {a.profile.course}, {a.profile.college}
                        {a.profile.graduationYear ? ` · graduating ${a.profile.graduationYear}` : ""}
                        {a.profile.availableFrom && a.profile.availableTo ? ` · available ${shortDate(a.profile.availableFrom)} to ${shortDate(a.profile.availableTo)}` : ""}
                      </p>
                      {a.profile.skills?.length ? <p className="text-[12px] text-ink-3">Skills: {a.profile.skills.join(", ")}</p> : null}
                    </div>
                    {a.hasResume && (
                      <a className="shrink-0 text-ink-3 hover:text-star-purple" href={`/api/m/internships/org/${encodeURIComponent(org!)}/applications/${a.id}/resume`} aria-label={`${a.name}'s résumé`}>
                        <Download className="size-4" aria-hidden />
                      </a>
                    )}
                  </div>
                  {may("applications.decide") && COMPANY_NEXT[a.status].length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {COMPANY_NEXT[a.status].map((st, i) => (
                        <Button key={st} size="sm" variant={i === 0 ? "secondary" : "ghost"} onClick={() => void decide(a.id, st)}>
                          {ACTION_LABEL[st]}
                        </Button>
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
    </div>
  );
}

type FormState = { title: string; description: string; location: string; workMode: string; skills: string; stipendMin: string; stipendMax: string; currency: string; durationMonths: string; startsOn: string; applyBy: string; schedule: string };

function PostingForm({ orgId, posting: p, onClose, onSaved }: { orgId: string; posting: InternshipPosting | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>({
    title: p?.title ?? "",
    description: p?.description ?? "",
    location: p?.location ?? "",
    workMode: p?.workMode ?? "",
    skills: p?.skills.join(", ") ?? "",
    stipendMin: p?.terms.stipendMin?.toString() ?? "",
    stipendMax: p?.terms.stipendMax?.toString() ?? "",
    currency: p?.terms.currency ?? "INR",
    durationMonths: p?.terms.durationMonths?.toString() ?? "",
    startsOn: p?.terms.startsOn ?? "",
    applyBy: p?.terms.applyBy ?? "",
    schedule: p?.terms.schedule ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const save = async () => {
    setBusy(true);
    try {
      const posting = { title: f.title, description: f.description, location: f.location, workMode: f.workMode || undefined, skills: f.skills.split(",").map((x) => x.trim()).filter(Boolean), stipendMin: num(f.stipendMin), stipendMax: num(f.stipendMax), currency: f.currency, durationMonths: num(f.durationMonths), startsOn: f.startsOn, applyBy: f.applyBy, schedule: f.schedule || undefined };
      const url = `/api/m/internships/org/${encodeURIComponent(orgId)}`;
      await (p ? call(url, { method: "PATCH", body: { id: p.id, posting } }) : call(url, { body: posting }));
      toast.success(p ? "Saved" : "Posted as a draft", p ? undefined : "Open it when it's ready for students.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={p ? "Edit internship" : "Post an internship"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Title" htmlFor="pf-title" required>
          <Input id="pf-title" value={f.title} onChange={set("title")} />
        </Field>
        <Field label="What the intern will do and learn" htmlFor="pf-desc" required>
          <Textarea id="pf-desc" rows={5} value={f.description} onChange={set("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Remote, hybrid or on-site" htmlFor="pf-mode" required>
            <Select id="pf-mode" value={f.workMode} onChange={set("workMode")}>
              <option value="">Choose</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </Select>
          </Field>
          <Field label="Where" htmlFor="pf-loc" required={f.workMode !== "remote"}>
            <Input id="pf-loc" value={f.location} onChange={set("location")} />
          </Field>
          <Field label="Part or full time" htmlFor="pf-sched" required>
            <Select id="pf-sched" value={f.schedule} onChange={set("schedule")}>
              <option value="">Choose</option>
              <option value="part_time">Part time</option>
              <option value="full_time">Full time</option>
            </Select>
          </Field>
          <Field label="Duration" htmlFor="pf-dur" required>
            <Select id="pf-dur" value={f.durationMonths} onChange={set("durationMonths")}>
              <option value="">Choose</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "month" : "months"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stipend a month (0 if unpaid)" htmlFor="pf-smin" required>
            <Input id="pf-smin" inputMode="numeric" value={f.stipendMin} onChange={set("stipendMin")} />
          </Field>
          <Field label="Up to (optional)" htmlFor="pf-smax">
            <Input id="pf-smax" inputMode="numeric" value={f.stipendMax} onChange={set("stipendMax")} />
          </Field>
          <Field label="Currency" htmlFor="pf-cur" required>
            <Select id="pf-cur" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label="Starts on" htmlFor="pf-start" required>
            <Input id="pf-start" type="date" value={f.startsOn} onChange={set("startsOn")} />
          </Field>
          <Field label="Apply by" htmlFor="pf-by" required>
            <Input id="pf-by" type="date" value={f.applyBy} onChange={set("applyBy")} />
          </Field>
        </div>
        <Field label="Skills (comma-separated)" htmlFor="pf-skills">
          <Input id="pf-skills" value={f.skills} onChange={set("skills")} />
        </Field>
      </div>
    </Modal>
  );
}
