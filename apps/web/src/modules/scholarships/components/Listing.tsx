"use client";
import { memo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Modal } from "@/components/common/Modal";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { CompanyLogo } from "@/wonderworks/brand/CompanyLogo";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { call } from "@/wonderworks/api";
import { resolveCapability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { deadlineLabel, daysLeft, KIND_LABEL, LEVEL_LABEL, LEVELS, levelsLabel, matchScholarship, missingProfile, outsideStatus, valueLabel, WORK_MODE_LABEL, type Level, type ScholarshipListing, type ScholarshipMatch, type StudentProfile } from "../domain";
import { listingHref } from "../manifest";
import { selectProfile, useScholarshipsStore } from "../store";
import { shareOf } from "../share";

/** The one line of scam warning (docs/WONDERWORKS_PLATFORM.md: a real scholarship never charges, guarantees or asks for bank details). */
export const SCAM_LINE = "Applying is always free. Never pay a fee or share bank or card details to apply.";

export function useMatch(l: ScholarshipListing): ScholarshipMatch {
  const profile = useScholarshipsStore(selectProfile);
  return matchScholarship(l, profile);
}

/** "You may be eligible" / "Check eligibility", in the pill Jobs uses for its match. Never a guarantee. */
export const FIT: Record<Exclude<ScholarshipMatch["fit"], "unknown">, { top: string; bottom: string; word: string; tone: string; title: string }> = {
  may: { top: "May", bottom: "be eligible", word: "You may be eligible", tone: "bg-success-100 text-success-600", title: "You may be eligible — what it states fits your details. The provider decides." },
  unlikely: { top: "Check", bottom: "eligibility", word: "Check eligibility", tone: "bg-warning-100 text-warning-600", title: "Something it states doesn't match your details. Check its eligibility." },
};

/**
 * One scholarship or project in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the provider's
 * logo with the eligibility pill and Apply under it; the title; provider · kind · award or stipend · closes in N days
 * · level; why they may be eligible; where it was found, and Save. Its title opens the listing's page.
 */
export const ScholarshipCard = memo(function ScholarshipCard({ item: l, onOpen }: { item: ScholarshipListing; onOpen: (id: string) => void }) {
  const saved = useScholarshipsStore((s) => !!s.saved[l.id]);
  const applied = useScholarshipsStore((s) => outsideStatus(s.responses[l.id]) === "applied");
  const toggle = useScholarshipsStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = m.fit === "unknown" ? null : FIT[m.fit];
  const t = l.terms;
  const left = daysLeft(t);
  const value = t.kind === "project" ? (t.stipend !== undefined ? valueLabel(t) : null) : t.awardAmount ? valueLabel(t) : null;
  return (
    <ResultCard
      share={shareOf(l)}
      aside={
        <>
          <CompanyLogo name={l.company} domain={l.companyDomain} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.top} bottom={fit.bottom} srText={fit.title} />}
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
        <span key="k">{KIND_LABEL[t.kind]}</span>,
        value && (
          <span key="$" className="font-medium text-ink-2">
            {value}
          </span>
        ),
        t.deadline && (
          <span key="d" className={cn(left !== undefined && left <= 7 && "font-medium text-warning-600")}>
            {deadlineLabel(t)}
          </span>
        ),
        t.levels?.length && <span key="l">{levelsLabel(t)}</span>,
        t.kind === "project" && l.workMode && <span key="w">{l.workMode === "remote" ? WORK_MODE_LABEL.remote : shortPlace(l.location)}</span>,
      ]}
      tags={(t.fields ?? l.skills).filter((x) => x.length <= 24).slice(0, 3)}
      reasons={m.signals.filter((x) => x.tone === "good").map((x) => x.text).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle="From the listing"
      status={applied && <Badge tone="success">Applied</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun={KIND_LABEL[t.kind].toLowerCase()} />}
    />
  );
});

type Sheet = { profile: StudentProfile; name: string; fileId: string | null; answers: Record<string, string>; statement: string; shareSensitive: boolean; decision: "run" | "ask" };

const EMPTY: StudentProfile = { field: "", institution: "", region: "" };

/**
 * Apply. On a listing posted on WonderWorks: the student's press sends their profile and answers to the organisation —
 * at once when "Send … in one tap" is Automatic and nothing is missing, after showing it when it's Ask me, never when
 * it's Off (resolveCapability; the server checks again and fails closed). Anything missing is asked, never invented.
 * On an outside listing: its official page opens, where applying happens; the student can then mark it applied.
 */
export function ApplyButton({ listing: l, size = "md", full, card }: { listing: ScholarshipListing; size?: "sm" | "md"; full?: boolean; card?: boolean }) {
  const applied = useScholarshipsStore((s) => outsideStatus(s.responses[l.id]) === "applied");
  const setResponse = useScholarshipsStore((s) => s.setResponse);
  const profile = useScholarshipsStore(selectProfile);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dnaName = useCareerStore((s) => s.dna.name);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [working, setWorking] = useState(false);

  const remember = () => setResponse(l.id, "applied", { status: "applied", item: l });
  const opened = () => {
    window.open(l.applyUrl, "_blank", "noopener,noreferrer");
    if (!applied && outsideStatus(useScholarshipsStore.getState().responses[l.id]) === null) setResponse(l.id, "preparing", { status: "preparing", mark: "apply_opened", item: l });
  };
  const hint = () => toast.info(`Opened ${l.company}'s official page`, `Apply there — it's free. Then mark it applied to track it in Applications.`, { label: "I applied", onClick: remember });

  if (l.origin === "outside" && card)
    return applied ? null : (
      <button type="button" aria-label={`Apply to ${l.title} on ${l.company}'s official page (opens in a new tab)`} title="Apply on the official page" className={APPLY_BTN} onClick={() => (opened(), hint())}>
        Apply
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
      </button>
    );
  if (l.origin === "outside")
    return (
      <Button size={size} full={full} variant={applied ? "outline" : "primary"} iconRight={<ExternalLink className="size-3.5" aria-hidden />} onClick={() => (opened(), applied ? undefined : hint())}>
        {applied ? "Applied · open page" : "Apply on the official page"}
      </Button>
    );

  if (applied) return card ? null : <Button size={size} full={full} variant="outline" href="/app/m/scholarships/pipeline">Applied</Button>;

  const send = async (s: Sheet) => {
    try {
      await call<{ id: string }>("/api/m/scholarships/apply", { body: { postingId: l.postingId, name: s.name, profile: s.profile, answers: s.answers, statement: s.statement, shareSensitive: s.shareSensitive, ...(s.fileId ? { resumeFileId: s.fileId } : {}), consent: true, confirmed: s.decision === "ask" } });
      remember();
      setSheet(null);
      toast.success(`Application sent to ${l.company}`, "Track it in Applications.");
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
    const decision = resolveCapability("scholarships.apply", policy, level);
    if (decision === "skip") {
      toast.info("Applications are off", "Turn them on in Scholarships & Projects → You.");
      return;
    }
    setWorking(true);
    try {
      await useResumeFilesStore.getState().load();
      const s: Sheet = { profile: profile ?? EMPTY, name: dnaName?.trim() ?? "", fileId: useResumeFilesStore.getState().files[0]?.id ?? null, answers: {}, statement: "", shareSensitive: false, decision };
      // One tap only when nothing is missing: no questions to answer and a complete profile.
      if (decision === "run" && s.name && !(l.questions ?? []).length && missingProfile(s.profile).length === 0) await send(s);
      else setSheet(s);
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

/** What goes to the organisation, shown before it goes: the profile, answers to its questions, an optional statement and résumé. */
function ApplySheet({ listing: l, sheet, onClose, onSend }: { listing: ScholarshipListing; sheet: Sheet; onClose: () => void; onSend: (s: Sheet) => Promise<void> }) {
  const [s, setS] = useState(sheet);
  const [busy, setBusy] = useState(false);
  const files = useResumeFilesStore((x) => x.files);
  const p = s.profile;
  const missing = missingProfile(p);
  const questions = l.questions ?? [];
  const unanswered = questions.filter((q) => q.required && !s.answers[q.id]?.trim());
  const setP = (patch: Partial<StudentProfile>) => setS((x) => ({ ...x, profile: { ...x.profile, ...patch } }));
  const go = async () => {
    setBusy(true);
    try {
      if (missing.length === 0) useScholarshipsStore.getState().setPersona({ ...s.profile });
      await onSend(s);
    } catch (e) {
      toast.error("Couldn't send it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = !!s.name.trim() && missing.length === 0 && unanswered.length === 0;
  return (
    <Modal open onClose={onClose} title={`Apply to ${l.company}`} description={`${l.title}. ${l.company} gets your name, email, the details below${s.fileId ? " and your résumé" : ""}.`} footer={<Button full loading={busy} disabled={!ready} onClick={() => void go()}>Send application</Button>}>
      <div className="space-y-3">
        <Field label="Your name" htmlFor="sa-name" required>
          <Input id="sa-name" value={s.name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value }))} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level" htmlFor="sa-level" required>
            <Select id="sa-level" value={p.level ?? ""} onChange={(e) => setP({ level: (e.target.value || undefined) as Level | undefined })}>
              <option value="">Choose</option>
              {LEVELS.map((v) => (
                <option key={v} value={v}>
                  {LEVEL_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Course or field" htmlFor="sa-field" required>
            <Input id="sa-field" value={p.field} onChange={(e) => setP({ field: e.target.value })} />
          </Field>
          <Field label="School or college" htmlFor="sa-inst" required>
            <Input id="sa-inst" value={p.institution} onChange={(e) => setP({ institution: e.target.value })} />
          </Field>
          <Field label="State and country" htmlFor="sa-region" required>
            <Input id="sa-region" value={p.region} onChange={(e) => setP({ region: e.target.value })} />
          </Field>
        </div>
        {p.level === "school" && (
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={!!p.guardianConsent} onChange={(e) => setP({ guardianConsent: e.target.checked || undefined })} />A parent or guardian knows about this application and agrees.
          </label>
        )}
        {questions.map((q) => (
          <Field key={q.id} label={q.text} htmlFor={`sa-q-${q.id}`} required={q.required}>
            <Textarea id={`sa-q-${q.id}`} rows={2} value={s.answers[q.id] ?? ""} onChange={(e) => setS((x) => ({ ...x, answers: { ...x.answers, [q.id]: e.target.value } }))} />
          </Field>
        ))}
        <Field label="Statement (optional)" htmlFor="sa-statement">
          <Textarea id="sa-statement" rows={3} value={s.statement} onChange={(e) => setS((x) => ({ ...x, statement: e.target.value }))} />
        </Field>
        {files.length > 0 && (
          <Field label="Résumé (optional)" htmlFor="sa-file">
            <Select id="sa-file" value={s.fileId ?? ""} onChange={(e) => setS((x) => ({ ...x, fileId: e.target.value || null }))}>
              <option value="">Don&apos;t send one</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.filename}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {p.sensitiveConsent && (
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={s.shareSensitive} onChange={(e) => setS((x) => ({ ...x, shareSensitive: e.target.checked }))} />
            Share my family income, gender and category with {l.company} for this application.
          </label>
        )}
        <p className="text-[12px] text-ink-4">{SCAM_LINE}</p>
      </div>
    </Modal>
  );
}
