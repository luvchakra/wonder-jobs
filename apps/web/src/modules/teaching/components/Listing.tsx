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
import { call } from "@/modules/internships/api";
import { BOARDS, classLine, GRADE_BANDS, matchTeaching, missingProfile, payLabel, QUALIFICATIONS, SCHEDULE_LABEL, WORK_MODE_LABEL, EMPTY_PROFILE, type TeacherProfile, type TeachingListing } from "../domain";
import { selectProfile, useTeachingStore } from "../store";
import { Pick, splitList } from "./Pick";

/** "Pune · On-site · Full time · School". */
export const placeLine = (l: Pick<TeachingListing, "location" | "workMode" | "terms">) => [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, l.terms.schedule ? SCHEDULE_LABEL[l.terms.schedule] : null, l.terms.schoolType].filter(Boolean).join(" · ");

export function useSignals(l: TeachingListing) {
  const profile = useTeachingStore(selectProfile);
  return matchTeaching(l, profile ?? undefined);
}

/** One teaching role in a list: subject, grades and board, pay a month, and the first reason it fits. Apply and Save. */
export const TeachingCard = memo(function TeachingCard({ listing: l, onOpen }: { listing: TeachingListing; onOpen: (id: string) => void }) {
  const saved = useTeachingStore((s) => !!s.saved[l.id]);
  const toggle = useTeachingStore((s) => s.toggleSaved);
  const why = useSignals(l)[0];
  return (
    <li className="wj-card p-4">
      <button type="button" onClick={() => onOpen(l.id)} className="block w-full text-left">
        <span className="block text-[15px] font-semibold text-ink">{l.title}</span>
        <span className="block text-[13px] text-ink-2">
          {l.company}
          {l.origin === "wonderstar" && !l.companyVerified ? <span className="text-ink-4"> · not verified yet</span> : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ink-3">{placeLine(l)}</span>
        <span className="mt-2 block text-[13px] font-medium text-deep-navy">{classLine(l.terms)}</span>
        <span className="block text-[13px] font-medium text-deep-navy">{payLabel(l.terms)}</span>
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

const EMPTY: TeachingListing = { id: "", origin: "outside", title: "", company: "", location: "", terms: { currency: "INR", grades: [], requires: [] }, termsFrom: "posting", description: "", sourceId: "", sourceName: "" };

/** The whole posting: its terms (and where they came from), every reason it fits or doesn't, and Apply. */
export function TeachingSheet({ listing, onClose }: { listing: TeachingListing | null; onClose: () => void }) {
  const signals = useSignals(listing ?? EMPTY);
  if (!listing) return null;
  const l = listing;
  return (
    <Modal open onClose={onClose} title={l.title} description={`${l.company} · ${placeLine(l)}`} footer={<ApplyButton listing={l} full />}>
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        {[
          ["Subject", l.terms.subject ?? "Not stated"],
          ["Grades", l.terms.grades.join(", ") || "Not stated"],
          ["Board", l.terms.board ?? "Not stated"],
          ["Pay", payLabel(l.terms)],
          ...(l.terms.requires.length ? [["Asks for", l.terms.requires.join(", ")]] : []),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-4">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-ink-4">{l.termsFrom === "school" ? `Terms as ${l.company} posted them on WonderStar.` : `Only what the posting itself states, from ${l.sourceName}.`}</p>
      {signals.length > 0 && (
        <ul aria-label="How it fits" className="mt-3 space-y-1 text-[13px]">
          {signals.map((s) => (
            <li key={s.text} className={s.tone === "good" ? "text-success-600" : "text-warning-600"}>
              {s.text}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{l.description}</p>
    </Modal>
  );
}

type Sheet = { profile: TeacherProfile; name: string; fileId: string | null; decision: "run" | "ask" };

/**
 * Apply. On a role a school posted on WonderStar: the teacher's press sends their Teaching profile (with their own
 * background-check statement) and résumé — at once when "Send teaching applications in one tap" is Automatic, after
 * showing them when it's Ask me, never when it's Off (resolveCapability; the server checks it again and fails closed).
 * Anything missing is asked, never invented. On an outside role: the employer's own page opens.
 */
export function ApplyButton({ listing: l, size = "md", full }: { listing: TeachingListing; size?: "sm" | "md"; full?: boolean }) {
  const applied = useTeachingStore((s) => s.responses[l.id]);
  const setResponse = useTeachingStore((s) => s.setResponse);
  const profile = useTeachingStore(selectProfile);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const skills = useCareerStore((s) => s.dna.skills).map((k) => k.name);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);

  const remember = (stage: string) => {
    setResponse(l.id, stage);
    useTeachingStore.setState((s) => ({ items: { ...s.items, [l.id]: l } }));
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

  if (applied) return <Button size={size} full={full} variant="outline" href="/app/m/teaching/pipeline">Applied</Button>;

  const send = async (s: Sheet) => {
    if (!s.fileId) throw new Error("Choose your résumé.");
    try {
      await call("/api/m/teaching/apply", { body: { postingId: l.postingId, name: s.name, profile: s.profile, skills, resumeFileId: s.fileId, consent: true, confirmed: s.decision === "ask" } });
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
    const decision = resolveCapability("teaching.apply", policy, level);
    if (decision === "skip") {
      toast.info("Teaching applications are off", "Turn them on in Teaching → You.");
      return;
    }
    setWorking(true);
    try {
      await useResumeFilesStore.getState().load();
      const files = useResumeFilesStore.getState().files;
      const s: Sheet = { profile: profile ?? { ...EMPTY_PROFILE }, name: dnaName?.trim() ?? "", fileId: files[0]?.id ?? null, decision };
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
      {sheet && <ApplySheet listing={l} sheet={sheet} onClose={() => setSheet(null)} onSend={send} />}
    </>
  );
}

/** What goes to the school, shown before it goes: asks only for what's missing. */
function ApplySheet({ listing: l, sheet, onClose, onSend }: { listing: TeachingListing; sheet: Sheet; onClose: () => void; onSend: (s: Sheet) => Promise<void> }) {
  const [s, setS] = useState(sheet);
  const [busy, setBusy] = useState(false);
  const files = useResumeFilesStore((x) => x.files);
  const p = s.profile;
  const missing = missingProfile(p);
  const setP = (patch: Partial<TeacherProfile>) => setS((x) => ({ ...x, profile: { ...x.profile, ...patch } }));
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
      useTeachingStore.getState().setPersona({ ...s.profile, from: "teacher" });
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
        <Field label="Your name" htmlFor="ta-name" required>
          <Input id="ta-name" value={s.name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value }))} autoComplete="name" />
        </Field>
        <Field label="Subjects you teach (comma-separated)" htmlFor="ta-subj" required>
          <Input id="ta-subj" defaultValue={p.subjects.join(", ")} onChange={(e) => setP({ subjects: splitList(e.target.value) })} />
        </Field>
        <Pick label="Grades" options={GRADE_BANDS} value={p.grades} onChange={(grades) => setP({ grades })} />
        <Pick label="Boards" options={BOARDS} value={p.boards} onChange={(boards) => setP({ boards })} />
        <Pick label="Qualifications" options={QUALIFICATIONS} value={p.qualifications} onChange={(qualifications) => setP({ qualifications })} />
        <BackgroundCheck value={p.backgroundCheck} onChange={(backgroundCheck) => setP({ backgroundCheck })} />
        <Field label="Résumé" htmlFor="ta-file" required>
          {files.length > 0 ? (
            <Select id="ta-file" value={s.fileId ?? ""} onChange={(e) => setS((x) => ({ ...x, fileId: e.target.value || null }))}>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </Select>
          ) : (
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-line px-3 text-sm text-ink-2">
              <Upload className="size-4" aria-hidden /> Upload your résumé (PDF or Word)
              <input id="ta-file" type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          )}
        </Field>
        <p className="text-[12px] text-ink-4">
          Kept for next time in <Link href="/app/m/teaching/you" className="underline">Teaching → You</Link>.
        </p>
      </div>
    </Modal>
  );
}

/** The teacher's own statement about a police verification or background check — schools see it with every application. */
export function BackgroundCheck({ value, onChange }: { value: TeacherProfile["backgroundCheck"]; onChange: (v: TeacherProfile["backgroundCheck"]) => void }) {
  return (
    <div className="space-y-2">
      <Pick label="Police verification or background check" options={["Yes", "No"]} value={value ? [value.has ? "Yes" : "No"] : []} onChange={(v) => onChange(v.includes("Yes") && !(value?.has ?? false) ? { has: true } : v.includes("No") && (value?.has ?? true) ? { has: false } : value)} />
      {value?.has && (
        <Field label="Its date (optional)" htmlFor="bc-on">
          <Input id="bc-on" type="date" value={value.on ?? ""} onChange={(e) => onChange({ has: true, ...(e.target.value ? { on: e.target.value } : {}) })} />
        </Field>
      )}
      <p className="text-[12px] text-ink-4">Schools working with children see your answer. It&apos;s shown as what you told us, not as checked by WonderStar.</p>
    </div>
  );
}
