"use client";
import { memo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Upload, Zap } from "lucide-react";
import { Button } from "@/components/common/Button";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { relativeTime } from "@/lib/format";
import { toast } from "@/components/feedback/Toast";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { cn } from "@/lib/cn";
import { call } from "@/wonderworks/api";
import { EMPTY_PROFILE, gradesLabel, HOURS_LABEL, matchTeaching, missingProfile, outsideStatus, payLabel, WORK_MODE_LABEL, type TeacherProfile, type TeachingListing, type TeachingMatch } from "../domain";
import { listingHref } from "../manifest";
import { selectProfile, useTeachingStore } from "../store";

/** "Pune · On-site · Full time". */
export const placeLine = (l: Pick<TeachingListing, "location" | "workMode" | "terms">) => [l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null, l.terms.hours ? HOURS_LABEL[l.terms.hours] : null].filter(Boolean).join(" · ");

export function useMatch(l: TeachingListing): TeachingMatch {
  return matchTeaching(l, useTeachingStore(selectProfile));
}

/** "Strong" / "Partial" fit, in the pill Jobs uses for its match. */
export const FIT: Record<Exclude<TeachingMatch["fit"], "unknown">, { word: string; tone: string; title: string }> = {
  strong: { word: "Strong", tone: "bg-success-100 text-success-600", title: "Strong fit — your subjects, grade levels and board line up with it" },
  some: { word: "Partial", tone: "bg-brand-50 text-brand-700", title: "Partial fit — some of your subjects, grade levels or qualifications line up with it" },
};

/** Whether the teacher marked it applied. */
const isApplied = (s: { responses: Record<string, { stage: string; status?: string }> }, id: string) => outsideStatus(s.responses[id]) === "applied";

/**
 * One teaching opening in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the school's logo with
 * the fit and Apply under it; the title; school · place · subject · grades · pay; why it fits; where it was found, and
 * Save. Its title opens the opening's page.
 */
export const TeachingCard = memo(function TeachingCard({ item: l, onOpen }: { item: TeachingListing; onOpen: (id: string) => void }) {
  const saved = useTeachingStore((s) => !!s.saved[l.id]);
  const applied = useTeachingStore((s) => isApplied(s, l.id));
  const toggle = useTeachingStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const pay = l.terms.payMin !== undefined || l.terms.payMax !== undefined ? payLabel(l.terms) : null;
  return (
    <ResultCard
      aside={
        <>
          <CompanyLogo name={l.company} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.word} bottom="fit" srText={fit.title} />}
          <ApplyButton listing={l} card />
        </>
      }
      title={
        <Link href={listingHref(l.id)} onClick={() => onOpen(l.id)} className={CARD_TARGET}>
          {l.title}
        </Link>
      }
      facts={[
        <span key="c" className="font-medium text-ink-2">
          {l.company}
        </span>,
        l.origin === "wonderstar" && !l.companyVerified && <span key="v">not verified yet</span>,
        <span key="p" title={l.location}>
          {l.workMode === "remote" ? WORK_MODE_LABEL.remote : shortPlace(l.location)}
        </span>,
        l.terms.grades?.length && <span key="g">{gradesLabel(l.terms.grades)}</span>,
        l.terms.hours && <span key="h">{HOURS_LABEL[l.terms.hours]}</span>,
        pay && (
          <span key="$" className="font-medium text-ink-2">
            {pay}
          </span>
        ),
      ]}
      tags={[l.terms.subject, ...(l.terms.boards ?? [])].filter((t): t is string => !!t).slice(0, 3)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle="From the posting"
      status={applied && <Badge tone="success">Applied</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="opening" />}
    />
  );
});

type Sheet = { profile: TeacherProfile; name: string; fileId: string | null; coverNote: string; decision: "run" | "ask" };

/**
 * Apply. On an opening a school posted on WonderWorks: the teacher's press sends their Teaching details and résumé to
 * the school — at once when "Send teaching applications in one tap" is Automatic, after showing them when it's Ask me,
 * never when it's Off (resolveCapability; the server checks it again and fails closed). Anything missing is asked,
 * never invented. On an outside opening the employer's own page opens; the teacher can then mark it applied.
 */
export function ApplyButton({ listing: l, size = "md", full, card }: { listing: TeachingListing; size?: "sm" | "md"; full?: boolean; card?: boolean }) {
  const applied = useTeachingStore((s) => isApplied(s, l.id));
  const setResponse = useTeachingStore((s) => s.setResponse);
  const profile = useTeachingStore(selectProfile);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);
  const remember = () => setResponse(l.id, "applied", { status: "applied", item: l });
  const opened = () => {
    window.open(l.applyUrl, "_blank", "noopener,noreferrer");
    if (!applied && outsideStatus(useTeachingStore.getState().responses[l.id]) !== "withdrawn") setResponse(l.id, "preparing", { status: "preparing", mark: "apply_opened", item: l });
    if (!applied) toast.info(`Opened ${l.company}'s page`, "Apply there. Then mark it applied to track it in Pipeline.", { label: "I applied", onClick: remember });
  };

  if (l.origin === "outside") {
    if (card)
      return applied ? null : (
        <button type="button" aria-label={`Apply to ${l.title} at ${l.company} on their site (opens in a new tab)`} title="Apply on their site" className={APPLY_BTN} onClick={opened}>
          Apply
          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
        </button>
      );
    return (
      <Button size={size} full={full} variant={applied ? "outline" : "primary"} iconRight={<ExternalLink className="size-3.5" aria-hidden />} onClick={opened}>
        {applied ? "Applied · open page" : "Apply on their site"}
      </Button>
    );
  }

  if (applied) return card ? null : <Button size={size} full={full} variant="outline" href="/app/m/teaching/pipeline">Applied</Button>;

  const send = async (x: Sheet) => {
    if (!x.fileId) throw new Error("Choose your résumé.");
    try {
      await call<{ id: string }>("/api/m/teaching/apply", { body: { postingId: l.postingId, name: x.name, profile: x.profile, coverNote: x.coverNote || undefined, resumeFileId: x.fileId, consent: true, confirmed: x.decision === "ask" } });
      remember();
      setSheet(null);
      toast.success(`Application sent to ${l.company}`, "Track it in Pipeline.");
    } catch (e) {
      if ((e as { status?: number }).status === 409 && /already applied/i.test((e as Error).message)) {
        remember();
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
      const x: Sheet = { profile: profile ?? EMPTY_PROFILE, name: dnaName?.trim() ?? "", fileId: files[0]?.id ?? null, coverNote: "", decision };
      // One tap: everything the school needs is there and the teacher chose Automatic.
      if (decision === "run" && x.name && x.fileId && missingProfile(x.profile).length === 0) await send(x);
      else setSheet(x);
    } catch (e) {
      toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      {card ? (
        <button type="button" disabled={working} onClick={() => void start()} aria-label={`Apply to ${l.title} at ${l.company} on WonderWorks`} title="Apply here on WonderWorks" className={cn(APPLY_BTN, "disabled:opacity-70")}>
          <Zap className="size-3.5 shrink-0 fill-current" aria-hidden />
          Apply
        </button>
      ) : (
        <Button size={size} full={full} loading={working} onClick={() => void start()}>
          Apply
        </Button>
      )}
      {sheet && <ApplySheet listing={l} sheet={sheet} onClose={() => setSheet(null)} onSend={send} />}
    </>
  );
}

/** What goes to the school, shown before it goes: asks only for what's missing. */
function ApplySheet({ listing: l, sheet, onClose, onSend }: { listing: TeachingListing; sheet: Sheet; onClose: () => void; onSend: (s: Sheet) => Promise<void> }) {
  const [x, setX] = useState(sheet);
  const [subjects, setSubjects] = useState(sheet.profile.subjects.join(", "));
  const [busy, setBusy] = useState(false);
  const files = useResumeFilesStore((s) => s.files);
  const profile = { ...x.profile, subjects: subjects.split(",").map((w) => w.trim()).filter(Boolean) };
  const missing = missingProfile(profile);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const meta = await useResumeFilesStore.getState().upload(f);
      setX((v) => ({ ...v, fileId: meta.id }));
    } catch (e) {
      toast.error("Couldn't upload it", (e as Error).message);
    }
  };
  const go = async () => {
    setBusy(true);
    try {
      useTeachingStore.getState().setPersona({ ...profile });
      await onSend({ ...x, profile });
    } catch (e) {
      toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = !!x.name.trim() && !!x.fileId && missing.length === 0;
  return (
    <Modal open onClose={onClose} title={`Apply to ${l.company}`} description={`${l.title}. ${l.company} gets your name, email, your Teaching details and your résumé.`} footer={<Button full loading={busy} disabled={!ready} onClick={() => void go()}>Send application</Button>}>
      <div className="space-y-3">
        <Field label="Your name" htmlFor="ta-name" required>
          <Input id="ta-name" value={x.name} onChange={(e) => setX((v) => ({ ...v, name: e.target.value }))} autoComplete="name" />
        </Field>
        <Field label="Subjects you teach" htmlFor="ta-subjects" hint="Separate them with commas" required>
          <Input id="ta-subjects" value={subjects} onChange={(e) => setSubjects(e.target.value)} />
        </Field>
        <p className="text-[13px] text-ink-2">
          Grade levels: {profile.grades.length ? gradesLabel(profile.grades) : <Link href="/app/m/teaching/you/profile" className="font-medium text-brand-600 underline">add them in Teaching → You</Link>}
          {profile.qualifications.length ? ` · holds ${profile.qualifications.join(", ")}` : ""}
        </p>
        <Field label="A note to the school (optional)" htmlFor="ta-note">
          <Textarea id="ta-note" rows={3} value={x.coverNote} onChange={(e) => setX((v) => ({ ...v, coverNote: e.target.value }))} />
        </Field>
        <Field label="Résumé" htmlFor="ta-file" required>
          {files.length > 0 ? (
            <Select id="ta-file" value={x.fileId ?? ""} onChange={(e) => setX((v) => ({ ...v, fileId: e.target.value || null }))}>
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
      </div>
    </Modal>
  );
}
