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

// Shown in the order a search happens, in plain words. The internal pipeline steps are folded into one.
const SHOWN: { keys: Capability[]; label: string }[] = [
  { keys: ["search_jobs", "deduplicate", "analyze_jobs", "rank_opportunities"], label: "Search and rank jobs" },
  { keys: ["save_jobs"], label: "Save strong matches" },
  { keys: ["generate_resume"], label: "Draft a tailored résumé" },
  { keys: ["generate_cover_letter"], label: "Draft a cover letter" },
  { keys: ["fill_application"], label: "Fill an employer's form in your browser" },
  { keys: ["submit_application"], label: "Open the employer's page with your materials" },
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

const KNOWN = new Set<Capability>(SHOWN.flatMap((s) => s.keys));

/**
 * Automation: how much Wonder does on its own — and exactly what that means, read from the same rules the
 * app enforces — and the searches it runs on its own schedule.
 */
export default function AutomationSettingsPage() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  const resetPolicy = useAutomationStore((s) => s.resetPolicy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const setLevel = useAutomationStore((s) => s.setDefaultLevel);
  const rows = useMemo(
    () => [
      ...SHOWN.map((s) => {
        // A group is "run" only if every step in it runs; "skip" only if every step is off.
        const outcomes = s.keys.map((k) => resolveCapability(k, policy, level));
        return { label: s.label, kind: outcomes.every((o) => o === "run") ? "run" : outcomes.every((o) => o === "skip") ? "skip" : "ask" } as const;
      }),
      ...CAPABILITIES.filter((c) => !KNOWN.has(c)).map((c) => ({ label: CAPABILITY_META[c].label, kind: resolveCapability(c, policy, level) }) as const),
    ],
    [policy, level],
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Automation" description="How much Wonder does on its own, and when it searches without you. Sending is always your click; submitting only if you turn on Submit applications." />
      <Card className="mb-4">
        <AutomationLevelSelector value={level} onChange={setLevel} compact />
      </Card>
      <Card className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">With “{AUTOMATION_LEVEL_META[level].label}”, Wonder…</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {GROUPS.map((g) => {
            const items = rows.filter((r) => r.kind === g.kind);
            return (
              <div key={g.kind}>
                <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  <g.icon className={`size-3.5 ${g.tone}`} aria-hidden /> {g.title}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-[13px] text-ink-2">
                  {items.length ? items.map((r) => <li key={r.label}>{r.label}</li>) : <li className="text-ink-4">Nothing</li>}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[12px] text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Never, at any level: submitting an application, or sending an email or message. Wonder drafts and opens; you press send.
        </p>
      </Card>
      <Fold title="Change one action" hint="Automatic, Ask me or Off for each thing Wonder does" className="mb-8">
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
