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
import { call } from "@/modules/internships/api";
import { BOARDS, BOOKING_LABEL, classLine, CURRENCIES, GRADE_BANDS, payLabel, QUALIFICATIONS, SCHOOL_NEXT, SCHOOL_TYPES, shortDate, shortDateTime, STATUS_LABEL, type TeachingApplicationView, type TeachingPosting, type TeachingStatus } from "../domain";
import { Pick, splitList } from "./Pick";

type Workspace = { org: { id: string; name: string }; role: OrgRole };
type Data = { roles: TeachingPosting[]; applications: TeachingApplicationView[] };

const ACTION_LABEL: Partial<Record<TeachingStatus, string>> = { appointed: "Appoint", closed: "Not moving forward" };

/**
 * Teaching → School (WJ-419): a hiring workspace's teaching roles, the applications to them and their demo classes.
 * The same workspace and roles as Hiring (domain/org/permissions.ts::can, checked again on the server for every
 * action); only an organisation posts. Each application shows the teacher's own background-check statement.
 */
export function TeachingSchool() {
  const params = useSearchParams();
  const [spaces, setSpaces] = useState<Workspace[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(params.get("org"));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TeachingPosting | "new" | null>(null);
  const [demoFor, setDemoFor] = useState<TeachingApplicationView | null>(null);

  useEffect(() => {
    call<{ workspaces: Workspace[] }>("/api/hiring")
      .then((r) => setSpaces(r.workspaces.filter((w) => can(w.role, "jobs.view"))))
      .catch((e: Error) => setError(e.message));
  }, []);
  const org = orgId && spaces?.some((w) => w.org.id === orgId) ? orgId : (spaces?.[0]?.org.id ?? null);
  const role = spaces?.find((w) => w.org.id === org)?.role;
  const may = (p: OrgPermission) => can(role, p);
  const base = `/api/m/teaching/org/${encodeURIComponent(org ?? "")}`;

  const load = useCallback(() => {
    if (!org) return;
    call<Data>(`/api/m/teaching/org/${encodeURIComponent(org)}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [org]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState title="Couldn't load your workspace" body={error} />;
  if (!spaces) return <PageLoading rows={3} />;
  if (!spaces.length) return <EmptyState icon={<Building2 className="size-5" aria-hidden />} title="No hiring workspace yet" body="Create one for your school, college or coaching centre in Hiring, then post teaching roles here." action={{ label: "Open Hiring", href: "/app/hiring" }} />;
  if (!data) return <PageLoading rows={3} />;

  const run = async (url: string, body: unknown, done: string, method?: string) => {
    try {
      await call(url, { body, method });
      toast.success(done);
      load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {spaces.length > 1 && (
        <Field label="Workspace" htmlFor="ts-org">
          <Select id="ts-org" value={org ?? ""} onChange={(e) => setOrgId(e.target.value)}>
            {spaces.map((w) => (
              <option key={w.org.id} value={w.org.id}>
                {w.org.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <section aria-label="Teaching roles">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Teaching roles</h2>
          {may("jobs.edit") && (
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>
              Post a role
            </Button>
          )}
        </div>
        {data.roles.length === 0 ? (
          <EmptyState title="No roles posted" body="Post one and open it: teachers find it in Teaching." />
        ) : (
          <ul className="space-y-2">
            {data.roles.map((p) => (
              <li key={p.id} className="wj-card flex items-center gap-3 p-3">
                <button type="button" disabled={!may("jobs.edit")} onClick={() => setForm(p)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14.5px] font-semibold text-ink">{p.title}</span>
                  <span className="block text-[12.5px] text-ink-3">
                    {classLine(p.terms)} · {payLabel(p.terms)}
                  </span>
                </button>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase", p.status === "open" ? "bg-success-100 text-success-600" : "bg-surface-2 text-ink-3")}>{p.status}</span>
                {may("jobs.edit") && (
                  <Button size="sm" variant="ghost" onClick={() => void run(base, { id: p.id, status: p.status === "open" ? "closed" : "open" }, p.status === "open" ? "Closed" : "Opened", "PATCH")}>
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
            <EmptyState title="No applications yet" body="Teachers' applications to your open roles show here." />
          ) : (
            <ul className="space-y-2">
              {data.applications.map((a) => {
                const live = a.bookings.find((b) => b.status === "proposed" || b.status === "confirmed");
                return (
                  <li key={a.id} className="wj-card p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold text-ink">{a.name}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {a.postingTitle} · {STATUS_LABEL[a.status]}
                        </p>
                        <p className="text-[12.5px] text-ink-2">
                          {a.profile.subjects.join(", ")} · {a.profile.grades.join(", ")} · {a.profile.boards.join(", ")}
                        </p>
                        <p className="text-[12.5px] text-ink-2">{a.profile.qualifications.length ? a.profile.qualifications.join(", ") : "No qualifications listed"}</p>
                        <p className="text-[12.5px] text-ink-2">
                          Background check: {a.profile.backgroundCheck?.has ? `yes, they say${a.profile.backgroundCheck.on ? ` (${shortDate(a.profile.backgroundCheck.on)})` : ""}` : "no, they say"}
                        </p>
                        {a.bookings.map((b) => (
                          <p key={b.id} className="text-[12.5px] text-ink-3">
                            Demo class {shortDateTime(b.startsAt)} IST · {BOOKING_LABEL[b.status]}
                          </p>
                        ))}
                      </div>
                      {a.hasResume && (
                        <a className="shrink-0 text-ink-3 hover:text-star-purple" href={`${base}/applications/${a.id}/resume`} aria-label={`${a.name}'s résumé`}>
                          <Download className="size-4" aria-hidden />
                        </a>
                      )}
                    </div>
                    {may("applications.decide") && (a.status === "applied" || a.status === "demo_class") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!live && (
                          <Button size="sm" variant="secondary" onClick={() => setDemoFor(a)}>
                            Book a demo class
                          </Button>
                        )}
                        {live?.status === "confirmed" && (
                          <Button size="sm" variant="secondary" onClick={() => void run(`${base}/bookings/${live.id}`, { status: "held" }, "Marked held")}>
                            Mark demo class held
                          </Button>
                        )}
                        {live && (
                          <Button size="sm" variant="ghost" onClick={() => void run(`${base}/bookings/${live.id}`, { status: "cancelled" }, "Demo class cancelled")}>
                            Cancel demo class
                          </Button>
                        )}
                        {SCHOOL_NEXT[a.status].map((st) => (
                          <Button key={st} size="sm" variant="ghost" onClick={() => void run(`${base}/applications/${a.id}`, { status: st }, STATUS_LABEL[st])}>
                            {ACTION_LABEL[st]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {form && org && (
        <RoleForm
          base={base}
          posting={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {demoFor && (
        <DemoForm
          application={demoFor}
          onClose={() => setDemoFor(null)}
          onSend={async (body) => {
            await run(`${base}/applications/${demoFor.id}/demo`, body, "Demo class proposed");
            setDemoFor(null);
          }}
        />
      )}
    </div>
  );
}

function DemoForm({ application: a, onClose, onSend }: { application: TeachingApplicationView; onClose: () => void; onSend: (b: unknown) => Promise<void> }) {
  const [f, setF] = useState({ at: "", durationMin: "45", mode: "online", where: "", note: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setBusy(true);
    // The time is entered in IST, as the school and teacher read it.
    await onSend({ startsAt: f.at ? `${f.at}:00+05:30` : "", durationMin: Number(f.durationMin), mode: f.mode, where: f.where, note: f.note || undefined });
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={`Demo class with ${a.name}`} description={`${a.postingTitle}. ${a.name} gets a notification and confirms or declines it.`} footer={<Button full loading={busy} onClick={() => void go()}>Propose demo class</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date and time (IST)" htmlFor="dm-at" required className="col-span-2">
          <Input id="dm-at" type="datetime-local" value={f.at} onChange={set("at")} />
        </Field>
        <Field label="Length (minutes)" htmlFor="dm-len" required>
          <Input id="dm-len" inputMode="numeric" value={f.durationMin} onChange={set("durationMin")} />
        </Field>
        <Field label="Online or in person" htmlFor="dm-mode" required>
          <Select id="dm-mode" value={f.mode} onChange={set("mode")}>
            <option value="online">Online</option>
            <option value="in_person">In person</option>
          </Select>
        </Field>
        <Field label={f.mode === "online" ? "Meeting link" : "Address"} htmlFor="dm-where" required className="col-span-2">
          <Input id="dm-where" value={f.where} onChange={set("where")} />
        </Field>
        <Field label="Note for the teacher (optional)" htmlFor="dm-note" className="col-span-2">
          <Textarea id="dm-note" rows={2} value={f.note} onChange={set("note")} />
        </Field>
      </div>
    </Modal>
  );
}

type FormState = { title: string; description: string; location: string; workMode: string; subject: string; grades: string[]; board: string; schoolType: string; payMin: string; payMax: string; currency: string; schedule: string; requires: string[]; skills: string };

function RoleForm({ base, posting: p, onClose, onSaved }: { base: string; posting: TeachingPosting | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>({
    title: p?.title ?? "",
    description: p?.description ?? "",
    location: p?.location ?? "",
    workMode: p?.workMode ?? "",
    subject: p?.terms.subject ?? "",
    grades: p?.terms.grades ?? [],
    board: p?.terms.board ?? "",
    schoolType: p?.terms.schoolType ?? "",
    payMin: p?.terms.payMin?.toString() ?? "",
    payMax: p?.terms.payMax?.toString() ?? "",
    currency: p?.terms.currency ?? "INR",
    schedule: p?.terms.schedule ?? "",
    requires: p?.terms.requires ?? [],
    skills: p?.skills.join(", ") ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d]/g, "")));
  const save = async () => {
    setBusy(true);
    try {
      const posting = { title: f.title, description: f.description, location: f.location, workMode: f.workMode || undefined, subject: f.subject, grades: f.grades, board: f.board, schoolType: f.schoolType, payMin: num(f.payMin), payMax: num(f.payMax), currency: f.currency, schedule: f.schedule || undefined, requires: f.requires, skills: splitList(f.skills) };
      await (p ? call(base, { method: "PATCH", body: { id: p.id, posting } }) : call(base, { body: posting }));
      toast.success(p ? "Saved" : "Posted as a draft", p ? undefined : "Open it when it's ready for teachers.");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={p ? "Edit teaching role" : "Post a teaching role"} footer={<Button full loading={busy} onClick={() => void save()}>{p ? "Save" : "Save as draft"}</Button>}>
      <div className="space-y-3">
        <Field label="Title" htmlFor="rf-title" required>
          <Input id="rf-title" value={f.title} onChange={set("title")} />
        </Field>
        <Field label="Classes, hours and what you expect" htmlFor="rf-desc" required>
          <Textarea id="rf-desc" rows={5} value={f.description} onChange={set("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject" htmlFor="rf-subj" required>
            <Input id="rf-subj" value={f.subject} onChange={set("subject")} />
          </Field>
          <Field label="Board" htmlFor="rf-board" required>
            <Select id="rf-board" value={f.board} onChange={set("board")}>
              <option value="">Choose</option>
              {BOARDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Institution" htmlFor="rf-type" required>
            <Select id="rf-type" value={f.schoolType} onChange={set("schoolType")}>
              <option value="">Choose</option>
              {SCHOOL_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Part or full time" htmlFor="rf-sched" required>
            <Select id="rf-sched" value={f.schedule} onChange={set("schedule")}>
              <option value="">Choose</option>
              <option value="part_time">Part time</option>
              <option value="full_time">Full time</option>
            </Select>
          </Field>
          <Field label="Online, hybrid or on-site" htmlFor="rf-mode" required>
            <Select id="rf-mode" value={f.workMode} onChange={set("workMode")}>
              <option value="">Choose</option>
              <option value="remote">Online</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </Select>
          </Field>
          <Field label="Where" htmlFor="rf-loc" required={f.workMode !== "remote"}>
            <Input id="rf-loc" value={f.location} onChange={set("location")} />
          </Field>
          <Field label="Pay a month" htmlFor="rf-pmin" required>
            <Input id="rf-pmin" inputMode="numeric" value={f.payMin} onChange={set("payMin")} />
          </Field>
          <Field label="Up to (optional)" htmlFor="rf-pmax">
            <Input id="rf-pmax" inputMode="numeric" value={f.payMax} onChange={set("payMax")} />
          </Field>
          <Field label="Currency" htmlFor="rf-cur" required>
            <Select id="rf-cur" value={f.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Pick label="Grades" options={GRADE_BANDS} value={f.grades} onChange={(grades) => setF((x) => ({ ...x, grades }))} />
        <Pick label="Qualifications you ask for (optional)" options={QUALIFICATIONS} value={f.requires} onChange={(requires) => setF((x) => ({ ...x, requires }))} />
        <Field label="Skills (comma-separated)" htmlFor="rf-skills">
          <Input id="rf-skills" value={f.skills} onChange={set("skills")} />
        </Field>
      </div>
    </Modal>
  );
}
