"use client";
import { memo, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, ExternalLink, Upload } from "lucide-react";
import { Button, IconButton } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { cn } from "@/lib/cn";
import { call } from "../api";
import { durationLabel, matchInternship, missingProfile, SCHEDULE_LABEL, shortDate, startLabel, stipendLabel, WORK_MODE_LABEL, type InternshipListing, type InternshipMatch, type StudentProfile } from "../domain";
import { selectProfile, useInternshipsStore } from "../store";

/** "Pune · Hybrid · Full time". */
export const placeLine = (l: Pick<InternshipListing, "location" | "workMode" | "terms">) => [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, l.terms.schedule ? SCHEDULE_LABEL[l.terms.schedule] : null].filter(Boolean).join(" · ");

/** The student's skills (read from their Career Profile, never written to it) for match signals. */
export function useStudentSkills(): string[] {
  return useCareerStore((s) => s.dna.skills).map((k) => k.name);
}

export function useMatch(l: InternshipListing): InternshipMatch {
  const profile = useInternshipsStore(selectProfile);
  const skills = useStudentSkills();
  return matchInternship(l, profile ?? undefined, skills);
}

/** One internship in a list: what it pays a month, how long, when it starts, and the first reason it fits. Apply and Save. */
export const InternshipCard = memo(function InternshipCard({ listing: l, onOpen }: { listing: InternshipListing; onOpen: (id: string) => void }) {
  const saved = useInternshipsStore((s) => !!s.saved[l.id]);
  const toggle = useInternshipsStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const why = m.signals[0];
  return (
    <li className="wj-card p-4">
      <button type="button" onClick={() => onOpen(l.id)} className="block w-full text-left">
        <span className="block text-[15px] font-semibold text-ink">{l.title}</span>
        <span className="block text-[13px] text-ink-2">
          {l.company}
          {l.origin === "wonderstar" && !l.companyVerified ? <span className="text-ink-4"> · not verified yet</span> : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ink-3">{placeLine(l)}</span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-deep-navy">
          <span>{stipendLabel(l.terms)}</span>
          <span>{durationLabel(l.terms)}</span>
          <span>{startLabel(l.terms)}</span>
        </span>
        {why && <span className={cn("mt-1.5 block text-[12.5px]", why.tone === "good" ? "text-success-600" : "text-warning-600")}>{why.text}</span>}
      </button>
      <div className="mt-3 flex items-center gap-2">
        <ApplyButton listing={l} size="sm" />
        <IconButton label={saved ? "Unsave" : "Save"} size="sm" onClick={() => toggle(l.id, l)} aria-pressed={saved}>
          {saved ? <BookmarkCheck className="size-4 text-star-purple" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </IconButton>
      </div>
    </li>
  );
});

/** The whole posting: its terms (and where each came from), every match signal with its reason, and Apply. */
export function InternshipSheet({ listing: l, onClose }: { listing: InternshipListing | null; onClose: () => void }) {
  const m = useMatch(l ?? EMPTY);
  if (!l) return null;
  return (
    <Modal open onClose={onClose} title={l.title} description={`${l.company} · ${placeLine(l)}`} footer={<ApplyButton listing={l} full />}>
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        {[
          ["Stipend", stipendLabel(l.terms)],
          ["Duration", durationLabel(l.terms)],
          ["Start", l.terms.startsOn ? shortDate(l.terms.startsOn) : "Not stated"],
          ["Apply by", l.terms.applyBy ? shortDate(l.terms.applyBy) : "Not stated"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-4">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-ink-4">{l.termsFrom === "company" ? `Terms as ${l.company} posted them on WonderStar.` : `Only what the posting itself states, from ${l.sourceName}.`}</p>
      {m.signals.length > 0 && (
        <ul aria-label="How it fits" className="mt-3 space-y-1 text-[13px]">
          {m.signals.map((s) => (
            <li key={s.text} className={s.tone === "good" ? "text-success-600" : "text-warning-600"}>
              {s.text}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{l.description}</p>
      {l.skills.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3">Skills: {l.skills.join(", ")}</p>}
    </Modal>
  );
}
const EMPTY: InternshipListing = { id: "", origin: "outside", title: "", company: "", location: "", terms: { currency: "INR" }, termsFrom: "posting", skills: [], description: "", sourceId: "", sourceName: "" };

type Sheet = { profile: StudentProfile; name: string; fileId: string | null; decision: "run" | "ask" };

/**
 * Apply. On a WonderStar internship: the student's press sends their Internships profile and résumé to the company —
 * at once when "Send internship applications in one tap" is Automatic, after showing them when it's Ask me, never when
 * it's Off (resolveCapability; the server checks it again and fails closed). Anything missing is asked, never invented.
 * On an outside internship: the employer's own page opens; the student can then mark it applied.
 */
export function ApplyButton({ listing: l, size = "md", full }: { listing: InternshipListing; size?: "sm" | "md"; full?: boolean }) {
  const applied = useInternshipsStore((s) => s.responses[l.id]);
  const setResponse = useInternshipsStore((s) => s.setResponse);
  const profile = useInternshipsStore(selectProfile);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const skills = useStudentSkills();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);

  // Kept with the response so Pipeline and Deadlines can show it after a reload.
  const remember = (stage: string) => {
    setResponse(l.id, stage);
    useInternshipsStore.setState((s) => ({ items: { ...s.items, [l.id]: l } }));
  };

  if (l.origin === "outside")
    return (
      <Button
        size={size}
        full={full}
        variant={applied ? "outline" : "primary"}
        iconRight={<ExternalLink className="size-3.5" aria-hidden />}
        onClick={() => {
          window.open(l.applyUrl, "_blank", "noopener,noreferrer");
          if (!applied) toast.info(`Opened ${l.company}'s page`, "Apply there. Then mark it applied to track it in Pipeline.", { label: "I applied", onClick: () => remember("applied") });
        }}
      >
        {applied ? "Applied · open page" : "Apply on their site"}
      </Button>
    );

  if (applied) return <Button size={size} full={full} variant="outline" href="/app/m/internships/pipeline">Applied</Button>;

  const send = async (s: Sheet) => {
    if (!s.fileId) throw new Error("Choose your résumé.");
    try {
      await call<{ id: string }>("/api/m/internships/apply", { body: { postingId: l.postingId, name: s.name, profile: s.profile, skills, resumeFileId: s.fileId, consent: true, confirmed: s.decision === "ask" } });
      remember("applied");
      setSheet(null);
      toast.success(`Application sent to ${l.company}`, "Track it in Pipeline.");
    } catch (e) {
      if ((e as { status?: number }).status === 409 && /already applied/i.test((e as Error).message)) {
        remember("applied");
        setSheet(null);
        toast.info("You've already applied", `${l.company} has your application.`);
        return;
      }
      throw e;
    }
  };

  const start = async () => {
    const decision = resolveCapability("internships.apply", policy, level);
    if (decision === "skip") {
      toast.info("Internship applications are off", "Turn them on in Internships → You.");
      return;
    }
    setWorking(true);
    try {
      await useResumeFilesStore.getState().load();
      const files = useResumeFilesStore.getState().files;
      const s: Sheet = { profile: profile ?? { college: "", course: "" }, name: dnaName?.trim() ?? "", fileId: files[0]?.id ?? null, decision };
      // One tap: everything the company needs is there and the student chose Automatic.
      if (decision === "run" && s.name && s.fileId && missingProfile(s.profile).length === 0) await send(s);
      else setSheet(s);
    } catch (e) {
      toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Button size={size} full={full} loading={working} onClick={() => void start()}>
        Apply
      </Button>
      {sheet && <ApplySheet listing={l} sheet={sheet} onClose={() => setSheet(null)} onSend={send} onSaveProfile={(p) => useInternshipsStore.getState().setPersona({ ...p, from: "student" })} />}
    </>
  );
}

/** What goes to the company, shown before it goes: asks only for what's missing. */
function ApplySheet({ listing: l, sheet, onClose, onSend, onSaveProfile }: { listing: InternshipListing; sheet: Sheet; onClose: () => void; onSend: (s: Sheet) => Promise<void>; onSaveProfile: (p: StudentProfile) => void }) {
  const [s, setS] = useState(sheet);
  const [busy, setBusy] = useState(false);
  const files = useResumeFilesStore((x) => x.files);
  const missing = missingProfile(s.profile);
  const p = s.profile;
  const setP = (patch: Partial<StudentProfile>) => setS((x) => ({ ...x, profile: { ...x.profile, ...patch } }));
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const meta = await useResumeFilesStore.getState().upload(f);
      setS((x) => ({ ...x, fileId: meta.id }));
    } catch (e) {
      toast.error("Couldn't upload it", (e as Error).message);
    }
  };
  const go = async () => {
    setBusy(true);
    try {
      if (missing.length === 0) onSaveProfile(s.profile);
      await onSend(s);
    } catch (e) {
      toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = !!s.name.trim() && !!s.fileId && missing.length === 0;
  return (
    <Modal open onClose={onClose} title={`Apply to ${l.company}`} description={`${l.title}. ${l.company} gets your name, email, the details below and your résumé.`} footer={<Button full loading={busy} disabled={!ready} onClick={() => void go()}>Send application</Button>}>
      <div className="space-y-3">
        <Field label="Your name" htmlFor="ia-name" required>
          <Input id="ia-name" value={s.name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value }))} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="College" htmlFor="ia-college" required>
            <Input id="ia-college" value={p.college} onChange={(e) => setP({ college: e.target.value })} />
          </Field>
          <Field label="Course" htmlFor="ia-course" required>
            <Input id="ia-course" value={p.course} onChange={(e) => setP({ course: e.target.value })} />
          </Field>
          <Field label="Graduation year" htmlFor="ia-year" required>
            <Input id="ia-year" inputMode="numeric" value={p.graduationYear ?? ""} onChange={(e) => setP({ graduationYear: Number(e.target.value) || undefined })} />
          </Field>
          <div />
          <Field label="Available from" htmlFor="ia-from" required>
            <Input id="ia-from" type="date" value={p.availableFrom ?? ""} onChange={(e) => setP({ availableFrom: e.target.value || undefined })} />
          </Field>
          <Field label="Available to" htmlFor="ia-to" required>
            <Input id="ia-to" type="date" value={p.availableTo ?? ""} onChange={(e) => setP({ availableTo: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Résumé" htmlFor="ia-file" required>
          {files.length > 0 ? (
            <Select id="ia-file" value={s.fileId ?? ""} onChange={(e) => setS((x) => ({ ...x, fileId: e.target.value || null }))}>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </Select>
          ) : (
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-line px-3 text-sm text-ink-2">
              <Upload className="size-4" aria-hidden /> Upload your résumé (PDF or Word)
              <input id="ia-file" type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          )}
        </Field>
        <p className="text-[12px] text-ink-4">
          Your profile is kept for next time in <Link href="/app/m/internships/you" className="underline">Internships → You</Link>.
        </p>
      </div>
    </Modal>
  );
}
