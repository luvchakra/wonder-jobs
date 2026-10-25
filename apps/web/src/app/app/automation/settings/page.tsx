"use client";
import { useMemo } from "react";
import { Check, Hand, Lock, X } from "lucide-react";
import { AUTOMATION_LEVEL_META, CAPABILITIES, CAPABILITY_META, resolveCapability, type Capability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { Button } from "@/components/common/Button";
import { AutomationPolicyEditor } from "@/components/automation/AutomationPolicy";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { toast } from "@/components/feedback/Toast";
import { ScheduledSearchList } from "@/components/automation/ScheduledSearchList";
import { METHOD_LABEL } from "@/components/jobs-apply/Preflight";
import { SensitiveQuestions } from "@/components/automation/SensitiveQuestions";
import { SENSITIVE_GROUPS } from "@/domain/jobs-apply/sensitive";
import { useHandheld } from "@/lib/useHandheld";

// Shown in the order a search happens, in plain words. The internal pipeline steps are folded into one.
const SHOWN: { keys: Capability[]; label: string; desktop?: true }[] = [
  { keys: ["search_jobs", "deduplicate", "analyze_jobs", "rank_opportunities"], label: "Search and rank jobs" },
  { keys: ["save_jobs"], label: "Save strong matches" },
  { keys: ["generate_resume"], label: "Draft a tailored résumé" },
  { keys: ["generate_cover_letter"], label: "Draft a cover letter" },
  { keys: ["interview_practice"], label: "Write interview practice (test, flashcards, mock interview)" },
  { keys: ["fill_application"], label: "Fill an employer's form in your browser", desktop: true },
  { keys: ["submit_application"], label: "Open the employer's page with your materials", desktop: true },
  { keys: ["final_submit"], label: "Submit applications", desktop: true },
  { keys: ["send_email"], label: "Draft a follow-up email" },
  { keys: ["send_recruiter_message"], label: "Draft a recruiter message" },
  { keys: ["change_career_dna"], label: "Change your Career Profile" },
  { keys: ["change_search_preferences"], label: "Change what it searches for" },
];

const GROUPS = [
  { kind: "run", title: "Does on its own", icon: Check, tone: "text-success-600" },
  { kind: "ask", title: "Asks you first", icon: Hand, tone: "text-brand-600" },
  { kind: "skip", title: "Off", icon: X, tone: "text-ink-4" },
] as const;

// Sensitive questions have their own section below.
const KNOWN = new Set<Capability>([...SHOWN.flatMap((s) => s.keys), ...SENSITIVE_GROUPS]);

/**
 * Automation: how much Wonder does on its own — and exactly what that means, read from the same rules the
 * app enforces — and the searches it runs on its own schedule. What only the browser helper does (filling forms,
 * handing off, submitting, sensitive questions) is its own section, "On your computer", folded on a phone or
 * tablet where the helper can't run (owner, 2026-10-25).
 */
export default function AutomationSettingsPage() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  const resetPolicy = useAutomationStore((s) => s.resetPolicy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const setLevel = useAutomationStore((s) => s.setDefaultLevel);
  const applyMethod = useAutomationStore((s) => s.applyMethod) ?? "helper";
  const setApplyMethod = useAutomationStore((s) => s.setApplyMethod);
  const rows = useMemo(
    () => [
      ...SHOWN.map((s) => {
        // A group is "run" only if every step in it runs; "skip" only if every step is off.
        const outcomes = s.keys.map((k) => resolveCapability(k, policy, level));
        return { label: s.label, desktop: !!s.desktop, kind: outcomes.every((o) => o === "run") ? "run" : outcomes.every((o) => o === "skip") ? "skip" : "ask" } as const;
      }),
      ...CAPABILITIES.filter((c) => !KNOWN.has(c)).map((c) => ({ label: CAPABILITY_META[c].label, desktop: false, kind: resolveCapability(c, policy, level) }) as const),
    ],
    [policy, level],
  );
  const handheld = useHandheld();
  const groups = (desktop: boolean) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {GROUPS.map((g) => {
        const items = rows.filter((r) => r.desktop === desktop && r.kind === g.kind);
        if (!items.length) return null;
        return (
          <div key={g.kind}>
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
              <g.icon className={`size-3.5 ${g.tone}`} aria-hidden /> {g.title}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-ink-2">
              {items.map((r) => (
                <li key={r.label}>{r.label}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
  // What only the browser helper does — on a computer, with the extension. On a phone or tablet it's folded away:
  // there you apply on the employer's site yourself, with Guide me's values to copy.
  const desktop = (
    <>
      <p className="text-[13px] font-medium text-ink">How you apply on a computer</p>
      <div role="radiogroup" aria-label="How you apply" className="mt-1.5 flex flex-wrap gap-1.5">
        {(["helper", "guided", "pack"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={applyMethod === m} onClick={() => setApplyMethod(m)} className={`rounded-full border px-3 py-1 text-[12.5px] ${applyMethod === m ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-line text-ink-2 hover:border-line-strong"}`}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-line pt-3">{groups(true)}</div>
      <div className="mt-3">
        <SensitiveQuestions />
      </div>
    </>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Automation" description="How much Wonder does on its own, and when it searches without you." />
      <Card padding="sm" className="mb-3">
        <AutomationLevelSelector value={level} onChange={setLevel} compact />
        <div className="mt-3 border-t border-line pt-3">
          <h2 className="mb-2 text-[13.5px] font-semibold text-ink">With “{AUTOMATION_LEVEL_META[level].label}”, Wonder…</h2>
          {groups(false)}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Wonder never sends an email or message itself — it drafts, you press send. It submits an application only where you turn on Submit applications.
        </p>
      </Card>
      {handheld ? (
        <Fold title="On your computer" hint="The browser helper: how you apply, filling forms, submitting, sensitive questions" className="mb-3">
          {desktop}
        </Fold>
      ) : (
        <Card padding="sm" className="mb-3">
          <h2 className="text-[13.5px] font-semibold text-ink">On your computer</h2>
          <p className="mb-2 text-[12px] text-ink-3">With the browser helper. On a phone or tablet you apply on the employer&apos;s site, with Guide me&apos;s values to copy.</p>
          {desktop}
        </Card>
      )}
      <Fold title="Change one action" hint="Automatic, Ask me or Off for each thing Wonder does" className="mb-6">
        <AutomationPolicyEditor policy={policy} onChange={setCapability} />
        <Button
          className="mt-4"
          variant="ghost"
          size="sm"
          onClick={() => {
            resetPolicy();
            toast.success("Defaults restored");
          }}
        >
          Restore defaults
        </Button>
      </Fold>
      <ScheduledSearchList />
    </div>
  );
}
